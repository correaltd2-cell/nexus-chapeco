/* As peças de verdade do fluxo das provas do portal, no servidor (o fluxo em si mora em
   fluxo.ts e é o mesmo dos testes):
   - o registro no Firestore: o vínculo no aluno, a operação de cada liberação
     (provas_portal), a trava de uma liberação por vez por prova (provas_portal_travas)
     e o registro de quem fez o quê (provas_portal_log), tudo pelo Admin SDK;
   - o mensageiro: o WhatsApp que já existe (Cloud API, assinatura de quem envia, modelo
     aprovado), gravando a mensagem na conversa como qualquer envio da equipe. */
import 'server-only';
import { FieldValue } from 'firebase-admin/firestore';
import { adminBd } from '@/lib/firebase/admin';
import { mandaTemplate, mandaTexto } from '@/lib/whatsapp/cloud';
import { assinaturaDe } from '@/lib/whatsapp/assinatura';
import { leModelo } from '@/lib/whatsapp/modelos';
import { gravaSaidaDaEquipe } from '@/lib/whatsapp/envio';
import { assinaTexto } from '@/lib/dominio/assinatura';
import { idDoModelo, preenche, quantasVariaveis } from '@/lib/dominio/modelos';
import { MODELO_DA_PROVA, idDaTrava, seguraATrava, type EnvioDaProva, type OperacaoDaProva } from '@/lib/dominio/provas-portal';
import { portalPorHttp } from './cliente';
import type { AlunoDaCentral, ConversaDaCentral, Dependencias, Mensageiro, Registro } from './fluxo';
import type { Conversa } from '@/lib/dominio/tipos';

const OPS = 'provas_portal';
const TRAVAS = 'provas_portal_travas';
const LOG = 'provas_portal_log';

function alunoDe(id: string, d: Record<string, unknown>): AlunoDaCentral {
  return {
    id, nome: String(d.nome || ''), menor: d.menor === true, telefone: String(d.telefone || ''),
    responsavelTelefone: String(d.responsavelTelefone || ''),
    portalStudentId: typeof d.portalStudentId === 'string' ? d.portalStudentId : null,
    portalNome: typeof d.portalNome === 'string' ? d.portalNome : null,
  };
}

async function modeloDaProva() {
  const m = await leModelo(adminBd(), idDoModelo(MODELO_DA_PROVA));
  /* o modelo combinado: nome e título da prova no corpo, e o botão com o fim do link */
  return m && m.estado === 'aprovado' && m.temLink && quantasVariaveis(m.corpo) === 2 ? m : null;
}

export const registroNoFirestore: Registro = {
  async aluno(id) {
    if (!/^[\w-]{1,128}$/.test(id)) return null;
    const s = await adminBd().doc(`alunos/${id}`).get();
    return s.exists ? alunoDe(s.id, s.data() || {}) : null;
  },
  async alunoPeloPortal(portalStudentId) {
    const s = await adminBd().collection('alunos').where('portalStudentId', '==', portalStudentId).limit(1).get();
    return s.empty ? null : alunoDe(s.docs[0].id, s.docs[0].data());
  },
  async conversa(id) {
    if (!/^[\w-]{1,128}$/.test(id)) return null;
    const s = await adminBd().doc(`conversas/${id}`).get();
    if (!s.exists) return null;
    const c = s.data() as Conversa;
    return { id: s.id, nome: c.nome || '', waId: c.waId, alunoId: c.alunoId || null, setor: c.setor, janelaAte: c.janelaAte } satisfies ConversaDaCentral;
  },
  async modeloDaProvaAprovado() {
    return Boolean(await modeloDaProva());
  },
  async gravaVinculo(alunoId, v) {
    await adminBd().doc(`alunos/${alunoId}`).update(v
      ? { portalStudentId: v.portalStudentId, portalNome: v.portalNome, portalVinculadoPor: { uid: v.por.uid, nome: v.por.nome }, portalVinculadoEm: v.em, atualizadoEm: v.em }
      : { portalStudentId: FieldValue.delete(), portalNome: FieldValue.delete(), portalVinculadoPor: FieldValue.delete(), portalVinculadoEm: FieldValue.delete(), atualizadoEm: new Date().toISOString() });
  },
  async comecaLiberacao(op) {
    const bd = adminBd();
    return bd.runTransaction(async (t) => {
      const ref = bd.doc(`${OPS}/${op.id}`);
      const trava = bd.doc(`${TRAVAS}/${idDaTrava(op.alunoId, op.provaId)}`);
      const [ja, tr] = await Promise.all([t.get(ref), t.get(trava)]);
      if (ja.exists) return { existente: ja.data() as OperacaoDaProva };
      const dona = tr.exists ? String(tr.data()?.operacaoId || '') : '';
      if (dona) {
        const d = await t.get(bd.doc(`${OPS}/${dona}`));
        const o = d.exists ? (d.data() as OperacaoDaProva) : null;
        if (o && seguraATrava(o.liberacao.estado)) return { ocupada: o };
      }
      t.set(ref, op);
      t.set(trava, { operacaoId: op.id, alunoId: op.alunoId, provaId: op.provaId, em: op.criadoEm });
      return { criada: true as const };
    });
  },
  async operacao(id) {
    if (!/^[\w-]{1,80}$/.test(id)) return null;
    const s = await adminBd().doc(`${OPS}/${id}`).get();
    return s.exists ? (s.data() as OperacaoDaProva) : null;
  },
  async ultimaOperacao(alunoId, provaId) {
    /* dois filtros de igualdade: o Firestore junta os índices simples, sem índice composto */
    const s = await adminBd().collection(OPS).where('alunoId', '==', alunoId).where('provaId', '==', provaId).get();
    const ops = s.docs.map((d) => d.data() as OperacaoDaProva).sort((a, b) => b.criadoEm.localeCompare(a.criadoEm));
    return ops[0] || null;
  },
  async criaOperacao(op) {
    await adminBd().doc(`${OPS}/${op.id}`).create(op);
  },
  async atualizaLiberacao(id, campos, soltaTrava) {
    const bd = adminBd();
    await bd.runTransaction(async (t) => {
      const ref = bd.doc(`${OPS}/${id}`);
      const s = await t.get(ref);
      if (!s.exists) return;
      const op = s.data() as OperacaoDaProva;
      const trava = bd.doc(`${TRAVAS}/${idDaTrava(op.alunoId, op.provaId)}`);
      const tr = soltaTrava ? await t.get(trava) : null;
      const mudanca: Record<string, unknown> = { atualizadoEm: new Date().toISOString() };
      for (const [k, v] of Object.entries(campos)) mudanca[`liberacao.${k}`] = v ?? null;
      t.update(ref, mudanca);
      if (tr?.exists && tr.data()?.operacaoId === id) t.delete(trava);
    });
  },
  async comecaEnvio(opId, envio) {
    const bd = adminBd();
    return bd.runTransaction(async (t) => {
      const ref = bd.doc(`${OPS}/${opId}`);
      const s = await t.get(ref);
      if (!s.exists) throw new Error('operação de prova não encontrada');
      const envios = ((s.data() as OperacaoDaProva).envios || []) as EnvioDaProva[];
      const igual = envios.find((e) => e.chave === envio.chave);
      if (igual) return { existente: igual };
      const saindo = envios.find((e) => e.estado === 'enviando');
      if (saindo) return { ocupado: saindo };
      t.update(ref, { envios: [...envios, envio], atualizadoEm: new Date().toISOString() });
      return { criado: true as const };
    });
  },
  async terminaEnvio(opId, chave, campos) {
    const bd = adminBd();
    await bd.runTransaction(async (t) => {
      const ref = bd.doc(`${OPS}/${opId}`);
      const s = await t.get(ref);
      if (!s.exists) return;
      const envios = ((s.data() as OperacaoDaProva).envios || []).map((e) => (e.chave === chave ? { ...e, ...campos } : e));
      t.update(ref, { envios, atualizadoEm: new Date().toISOString() });
    });
  },
  async anota(linha) {
    await adminBd().collection(LOG).add(linha);
  },
};

/** O WhatsApp que já existe: texto assinado com a janela aberta, ou o modelo aprovado
    com o botão de link fora dela. A mensagem entra na conversa como qualquer envio da
    equipe, marcada com a operação da prova (provaEnvio) para a tela achar o status. */
export const mensageiroDoWhatsApp: Mensageiro = {
  async envia(p) {
    const bd = adminBd();
    const s = await bd.doc(`conversas/${p.conversa.id}`).get();
    if (!s.exists) return { ok: false, erro: 'a conversa não existe mais.' };
    const conversa = s.data() as Conversa;
    if (p.canal === 'modelo') {
      const m = await modeloDaProva();
      if (!m) return { ok: false, erro: `o modelo ${MODELO_DA_PROVA} não está aprovado.` };
      const valores = p.valoresDoModelo || [];
      const resposta = await mandaTemplate(conversa.waId, m.nome, m.idioma, valores, p.sufixoDoLink);
      const texto = preenche(m.corpo, valores);
      const mensagemId = await gravaSaidaDaEquipe(bd, p.conversa.id, conversa, {
        autorNome: p.quem.nome, texto, previa: texto, resposta, modelo: { nome: m.nome, respostas: m.respostas },
        extras: { provaEnvio: p.operacaoId },
      });
      return { ok: resposta.ok, waMessageId: resposta.waMessageId || null, mensagemId, erro: resposta.erro };
    }
    const assinatura = await assinaturaDe(bd, p.quem.uid);
    const assinado = assinaTexto(p.texto, assinatura);
    const resposta = await mandaTexto(conversa.waId, assinado);
    const mensagemId = await gravaSaidaDaEquipe(bd, p.conversa.id, conversa, {
      autorNome: p.quem.nome, texto: p.texto, previa: p.texto, resposta,
      ...(assinado !== p.texto ? { assinadaComo: assinatura } : {}),
      extras: { provaEnvio: p.operacaoId },
    });
    return { ok: resposta.ok, waMessageId: resposta.waMessageId || null, mensagemId, erro: resposta.erro };
  },
};

export const dependencias = (): Dependencias => ({
  portal: portalPorHttp, registro: registroNoFirestore, mensageiro: mensageiroDoWhatsApp, agora: () => new Date(),
});
