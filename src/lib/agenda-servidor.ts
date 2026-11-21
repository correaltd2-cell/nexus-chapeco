/* A agenda no servidor: o lembrete da véspera pelo WhatsApp, a resposta do aluno aos
   botões Confirmar e Remarcar (do lembrete e do "Minhas aulas" do atendimento
   automático), a próxima aula de quem escreve, e o resumo do progresso com IA.
   Lembrete sai por modelo aprovado (a janela de 24 horas quase nunca está aberta na
   véspera). Se o modelo ainda não foi aprovado pela Meta, nada sai e a tela diz isso:
   a função já está pronta para o dia em que ele for aprovado.
   Aluno Kids recebe pelo responsável; aluno sem telefone fica de fora, com o motivo. */
import 'server-only';
import type { DocumentReference, Firestore } from 'firebase-admin/firestore';
import { mandaTemplate, mandaTexto, temConfig } from '@/lib/whatsapp/cloud';
import { garanteConversa } from '@/lib/whatsapp/recebimento';
import { resumeProgresso } from '@/lib/ia/claude';
import { falhou, descreveErro } from '@/lib/saude';
import { comReserva } from '@/lib/firebase/indice';
import { leAutomatico, situacaoDoHorario, type ConfigAutomatico } from '@/lib/dominio/automatico';
import {
  contaComoAula, diaPorExtenso, horaFalada, lePayload, payloadDoLembrete, precisaLembrete, promptDoResumo, proximasAulas, resumoSemIa,
  type Agendamento, type AlunoNaAula, type AulaDoHistorico, type ResumoDoAluno, type StatusAula,
} from '@/lib/dominio/agenda';
import { alunosDoContato, falaComoResponsavel, variantesDoTelefone } from '@/lib/dominio/contato';
import { idDoModelo, preenche, type SituacaoDoModelo } from '@/lib/dominio/modelos';
import { PASSO, novoId } from '@/lib/dominio/quadros';
import type { Aluno, Lista, Quadro } from '@/lib/dominio/tipos';

const agoraIso = () => new Date().toISOString();
const primeiro = (nome: string) => (nome || '').trim().split(/\s+/)[0] || '';
const MODELO_ADULTO = 'lembrete_aula_agenda';
const MODELO_KIDS = 'lembrete_aula_kids';

async function nomeDaAula(bd: Firestore, aulaId: string) {
  const d = await bd.doc(`aulas/${aulaId}`).get();
  return (d.data()?.nome as string) || 'aula';
}

async function modeloAprovado(bd: Firestore, nome: string) {
  const d = await bd.doc(`templates/${idDoModelo(nome)}`).get();
  const s = d.data() as SituacaoDoModelo | undefined;
  return s?.estado === 'aprovado' ? s : null;
}

export interface ResultadoDoLembrete { ok: boolean; enviados: number; mensagem: string }

/** Manda o lembrete da aula para cada aluno. `quem` vai para o log. */
export async function mandaLembrete(bd: Firestore, agendamentoId: string, quem: { id: string; nome: string }): Promise<ResultadoDoLembrete> {
  const ref = bd.doc(`agendamentos/${agendamentoId}`);
  const snap = await ref.get();
  if (!snap.exists) return { ok: false, enviados: 0, mensagem: 'Aula não encontrada.' };
  const ag = { ...(snap.data() as Agendamento), id: snap.id };
  if (!contaComoAula(ag.status)) return { ok: false, enviados: 0, mensagem: 'Aula cancelada ou remarcada não recebe lembrete.' };
  if (!temConfig()) return { ok: false, enviados: 0, mensagem: 'O WhatsApp ainda não está conectado.' };

  const [adulto, kids, aula, alunosDaAula] = await Promise.all([
    modeloAprovado(bd, MODELO_ADULTO), modeloAprovado(bd, MODELO_KIDS), nomeDaAula(bd, ag.aulaId),
    ref.collection('alunos').get(),
  ]);
  const dia = diaPorExtenso(ag.inicio);
  const hora = horaFalada(ag.inicio);
  const pulados: string[] = [];
  let enviados = 0;

  for (const d of alunosDaAula.docs) {
    const x = d.data() as AlunoNaAula;
    const aluno = (await bd.doc(`alunos/${x.alunoId}`).get()).data() as Aluno | undefined;
    const ehKids = aluno?.trilha === 'kids';
    const fone = ((ehKids ? aluno?.responsavelTelefone || aluno?.telefone : aluno?.telefone) || '').replace(/\D/g, '');
    if (!fone) { pulados.push(`${x.nomeAluno} (sem telefone)`); continue; }
    const modelo = ehKids ? kids : adulto;
    if (!modelo) { pulados.push(`${x.nomeAluno} (modelo ${ehKids ? MODELO_KIDS : MODELO_ADULTO} ainda não aprovado)`); continue; }

    const quemRecebe = ehKids ? aluno?.responsavelNome || x.nomeAluno : x.nomeAluno;
    const valores = ehKids ? [primeiro(quemRecebe), primeiro(x.nomeAluno), dia, hora] : [primeiro(quemRecebe), dia, hora, aula];
    const r = await mandaTemplate(fone, modelo.nome, modelo.idioma, valores, undefined, [
      payloadDoLembrete('confirmar', ag.id, x.alunoId), payloadDoLembrete('remarcar', ag.id, x.alunoId),
    ]);
    if (!r.ok) { pulados.push(`${x.nomeAluno} (${r.erro || 'a Meta recusou'})`); continue; }
    enviados += 1;

    /* o lembrete aparece na conversa do aluno, como tudo o que sai pelo número */
    const conversa = await garanteConversa({ bd }, fone, quemRecebe);
    const quando = agoraIso();
    const texto = preenche(modelo.corpo, valores);
    await bd.collection('mensagens').add({
      conversaId: conversa.id, direcao: 'saida', autor: 'lumi', autorNome: 'Lembrete da agenda', texto,
      template: modelo.nome, botoes: modelo.respostas, waMessageId: r.waMessageId || null, criadaEm: quando,
    });
    await conversa.update({ ultimaEm: quando, ultimaPreviaTexto: texto, ...(aluno && !ehKids ? { alunoId: x.alunoId } : {}) });
  }

  if (enviados) {
    const quando = agoraIso();
    await ref.update({ lembreteEnviadoEm: quando });
    await bd.collection('logs_agenda').add({
      agendamentoId: ag.id, acao: 'editou', usuarioId: quem.id, usuarioNome: quem.nome,
      antes: { lembreteEnviadoEm: ag.lembreteEnviadoEm ?? null }, depois: { lembreteEnviadoEm: quando }, data: quando,
    });
  }
  const partes = [enviados ? `Lembrete enviado para ${enviados} ${enviados === 1 ? 'aluno' : 'alunos'}.` : 'Nenhum lembrete saiu.'];
  if (pulados.length) partes.push(`Ficaram de fora: ${pulados.join('; ')}.`);
  return { ok: enviados > 0, enviados, mensagem: partes.join(' ') };
}

/** O relógio da véspera: toda aula de amanhã ainda sem lembrete. */
export async function lembretesDaVespera(bd: Firestore, agora = new Date()) {
  const de = new Date(agora.getTime() - 86_400_000).toISOString();
  const ate = new Date(agora.getTime() + 3 * 86_400_000).toISOString();
  const r = await bd.collection('agendamentos').where('status', '==', 'agendado')
    .where('inicio', '>=', de).where('inicio', '<', ate).get();
  const lista = r.docs.map((d) => ({ ...(d.data() as Agendamento), id: d.id })).filter((a) => precisaLembrete(a, agora));
  let aulas = 0;
  let alunos = 0;
  for (const a of lista) {
    try {
      const res = await mandaLembrete(bd, a.id, { id: 'sistema', nome: 'Lembrete automático' });
      if (res.enviados) { aulas += 1; alunos += res.enviados; }
    } catch (e) {
      await falhou('agenda', `Lembrete da aula ${a.id}: ${descreveErro(e)}`);
    }
  }
  return { aulas, alunos, candidatas: lista.length };
}

/* ---------------- a resposta aos botões ---------------- */

/** Pendência no quadro da Recepção, ligada à conversa (a triagem não abre outra). */
async function pendenciaDaRecepcao(bd: Firestore, conversa: DocumentReference, titulo: string, descricao: string) {
  const [qs, ls] = await Promise.all([bd.collection('quadros').get(), bd.collection('listas').get()]);
  const quadros = qs.docs.map((d) => ({ ...(d.data() as Quadro), id: d.id })).filter((q) => !q.arquivado);
  const quadro = quadros.find((q) => /recep/i.test(q.nome)) || quadros.sort((a, b) => a.ordem - b.ordem)[0];
  if (!quadro) return null;
  const lista = ls.docs.map((d) => ({ ...(d.data() as Lista), id: d.id }))
    .filter((l) => l.quadroId === quadro.id && !l.arquivada).sort((a, b) => a.ordem - b.ordem)[0];
  if (!lista) return null;
  const topo = await bd.collection('cartoes').where('listaId', '==', lista.id).where('arquivado', '==', false).orderBy('ordem').limit(1).get();
  const ordem = topo.empty ? PASSO : (topo.docs[0].data().ordem as number) - PASSO;
  const agora = agoraIso();
  const c = await bd.collection('cartoes').add({
    quadroId: quadro.id, listaId: lista.id, ordem, titulo, descricao, etiquetas: ['Marcação'],
    membros: [], prazoConcluido: false, checklist: [], comentarios: [], anexos: [],
    conversaId: conversa.id, arquivado: false, criadoEm: agora, atualizadoEm: agora,
    atividade: [{ id: novoId(), autorNome: 'Agenda', texto: 'abriu a pendência pelo lembrete do WhatsApp', criadoEm: agora }],
  });
  await conversa.update({ tarefaId: c.id });
  return quadro.nome;
}

/**
 * O contato tocou em Confirmar ou Remarcar no lembrete. Devolve o que foi quando a
 * mensagem era isso (e já foi respondida), para o atendimento automático não mandar a
 * saudação; null quando era outra coisa.
 */
export async function respondeLembrete(
  bd: Firestore, conversa: DocumentReference, payload: string | undefined, waId: string,
): Promise<'confirmar' | 'remarcar' | null> {
  const p = lePayload(payload);
  if (!p) return null;
  try {
    const ref = bd.doc(`agendamentos/${p.agendamentoId}`);
    const snap = await ref.get();
    if (!snap.exists) return null;
    const ag = { ...(snap.data() as Agendamento), id: snap.id };
    const quando = agoraIso();
    const alunoRef = ref.collection('alunos').doc(p.alunoId);
    const aluno = (await alunoRef.get()).data() as AlunoNaAula | undefined;
    /* tirado da aula depois do lembrete: a resposta segue como mensagem comum */
    if (!aluno) return null;
    const nome = aluno.nomeAluno || 'O aluno';
    const dia = diaPorExtenso(ag.inicio);
    const hora = horaFalada(ag.inicio);
    await alunoRef.set({ resposta: p.acao === 'confirmar' ? 'confirmou' : 'remarcar', respostaEm: quando }, { merge: true });

    let resposta: string;
    if (p.acao === 'confirmar') {
      if (ag.status === 'agendado') {
        await ref.update({ status: 'confirmado', atualizadoPor: 'whatsapp', atualizadoEm: quando });
        await bd.collection('logs_agenda').add({
          agendamentoId: ag.id, acao: 'mudou_status', usuarioId: 'whatsapp', usuarioNome: `${nome} pelo WhatsApp`,
          antes: { status: ag.status }, depois: { status: 'confirmado' }, data: quando,
        });
      }
      resposta = `Combinado, presença confirmada para ${dia}, às ${hora}. Até lá!`;
    } else {
      const aula = await nomeDaAula(bd, ag.aulaId);
      const quadro = await pendenciaDaRecepcao(bd, conversa, `Remarcar aula de ${nome}`,
        `${nome} pediu para remarcar a aula ${aula} de ${dia}, às ${hora}, pelo botão do lembrete. Combine o novo horário pela conversa e mude na agenda.`);
      await bd.collection('mensagens').add({
        conversaId: conversa.id, direcao: 'saida', autor: 'sistema', autorNome: 'Agenda',
        texto: `${nome} pediu para remarcar a aula de ${dia}, às ${hora}.${quadro ? ` A pendência entrou no quadro ${quadro}.` : ''}`,
        criadaEm: quando,
      });
      await conversa.update({ setor: 'recepcao', estado: 'aguardando', aguardandoDesde: quando, etapa: 'gente', agenteAtivo: false });
      /* de noite ou no fim de semana, diz quando a recepção volta */
      const cfg = leAutomatico((await bd.doc('config/automatico').get()).data() as Partial<ConfigAutomatico> | undefined);
      const h = situacaoDoHorario(cfg, new Date());
      resposta = h.aberto || !h.volta
        ? 'Certo! A recepção vai te chamar por aqui para escolher outro horário.'
        : `Certo! A recepção está fora do horário agora e ${h.volta} te chama por aqui para escolher outro horário.`;
    }

    /* a pessoa acabou de escrever: a janela está aberta e cabe um texto simples */
    const r = await mandaTexto(waId, resposta);
    await bd.collection('mensagens').add({
      conversaId: conversa.id, direcao: 'saida', autor: 'lumi', autorNome: 'Agenda', texto: resposta,
      waMessageId: r.waMessageId || null, falhouEm: r.ok ? null : quando, falhaMotivo: r.ok ? null : r.erro || null, criadaEm: quando,
    });
    return p.acao;
  } catch (e) {
    await falhou('agenda', `Resposta ao lembrete: ${descreveErro(e)}`);
    return null;
  }
}

/* ---------------- a agenda na conversa: "Minhas aulas" ---------------- */

/** Os alunos por quem este número fala: o ligado à conversa e os achados pelo telefone
    (do próprio aluno ou do responsável), nas duas grafias do celular. */
export async function alunosDoNumero(bd: Firestore, alunoId: string | null | undefined, waId: string): Promise<Aluno[]> {
  const achados = new Map<string, Aluno>();
  if (alunoId) {
    const d = await bd.doc(`alunos/${alunoId}`).get();
    if (d.exists) achados.set(d.id, { ...(d.data() as Aluno), id: d.id });
  }
  const variantes = variantesDoTelefone(waId);
  if (variantes.length) {
    for (const campo of ['telefone', 'responsavelTelefone']) {
      const s = await bd.collection('alunos').where(campo, 'in', variantes).limit(10).get();
      for (const d of s.docs) achados.set(d.id, { ...(d.data() as Aluno), id: d.id });
    }
  }
  return alunosDoContato([...achados.values()], { alunoId, waId });
}

export interface AulasDoContato {
  alunoId: string;
  alunoNome: string;
  paraResponsavel: boolean;
  proxima: { id: string; inicio: string; status: StatusAula; professor?: string; aula?: string };
  depois: string[];
}

/** A próxima aula de quem escreve. Com mais de um aluno (irmãos), a que vem primeiro. */
export async function aulasDoContato(bd: Firestore, c: { alunoId?: string | null; waId?: string }): Promise<AulasDoContato | null> {
  if (!c.waId) return null;
  const agora = new Date();
  /* a aula que começou há pouco ainda não acabou: entra na busca */
  const desde = new Date(agora.getTime() - 6 * 3_600_000).toISOString();
  let melhor: { aluno: Aluno; lista: Agendamento[] } | null = null;
  for (const aluno of await alunosDoNumero(bd, c.alunoId, c.waId)) {
    const doAluno = await comReserva('próximas aulas do aluno',
      async () => (await bd.collection('agendamentos').where('alunoIds', 'array-contains', aluno.id)
        .where('inicio', '>=', desde).orderBy('inicio').limit(12).get()).docs.map((d) => ({ ...(d.data() as Agendamento), id: d.id })),
      async () => (await bd.collection('agendamentos').where('alunoIds', 'array-contains', aluno.id).get())
        .docs.map((d) => ({ ...(d.data() as Agendamento), id: d.id })).filter((x) => x.inicio >= desde));
    const lista = proximasAulas(doAluno, agora, 3);
    if (lista.length && (!melhor || lista[0].inicio < melhor.lista[0].inicio)) melhor = { aluno, lista };
  }
  if (!melhor) return null;
  const p = melhor.lista[0];
  const professor = (await bd.doc(`perfis/${p.professorId}`).get()).data()?.nome as string | undefined;
  const aula = (await bd.doc(`aulas/${p.aulaId}`).get()).data()?.nome as string | undefined;
  return {
    alunoId: melhor.aluno.id, alunoNome: melhor.aluno.nome, paraResponsavel: falaComoResponsavel(melhor.aluno, c.waId),
    proxima: { id: p.id, inicio: p.inicio, status: p.status, professor, aula },
    depois: melhor.lista.slice(1).map((x) => x.inicio),
  };
}

/* ---------------- resumo do progresso ---------------- */

/** O resumo de cada aluno da aula, pelas últimas 5 aulas dele antes desta. */
export async function resumosDaAula(bd: Firestore, agendamentoId: string): Promise<ResumoDoAluno[]> {
  const snap = await bd.doc(`agendamentos/${agendamentoId}`).get();
  if (!snap.exists) return [];
  const ag = { ...(snap.data() as Agendamento), id: snap.id };
  const saida: ResumoDoAluno[] = [];
  for (const a of ag.alunos || []) {
    const anteriores = await comReserva('aulas anteriores do aluno',
      async () => (await bd.collection('agendamentos').where('alunoIds', 'array-contains', a.id)
        .orderBy('inicio', 'desc').limit(12).get()).docs.map((d) => ({ ...(d.data() as Agendamento), id: d.id })),
      async () => (await bd.collection('agendamentos').where('alunoIds', 'array-contains', a.id).get())
        .docs.map((d) => ({ ...(d.data() as Agendamento), id: d.id })).sort((x, y) => y.inicio.localeCompare(x.inicio)));
    const lista = anteriores.filter((x) => x.inicio < ag.inicio && contaComoAula(x.status)).slice(0, 5);
    const historico: AulaDoHistorico[] = [];
    for (const x of lista) {
      const sub = (await bd.doc(`agendamentos/${x.id}/alunos/${a.id}`).get()).data() as AlunoNaAula | undefined;
      historico.push({ inicio: x.inicio, aula: await nomeDaAula(bd, x.aulaId), presenca: sub?.presenca ?? null, obs: sub?.obs || '', notas: sub?.notas || null });
    }
    const base = resumoSemIa(a.nome, historico);
    const ia = historico.length ? await resumeProgresso(promptDoResumo(a.nome, historico)) : null;
    saida.push(ia
      ? { alunoId: a.id, nome: a.nome, resumo: ia.resumo, atencao: ia.atencao, comIa: true, aulas: historico.length }
      : { alunoId: a.id, comIa: false, ...base });
  }
  return saida;
}
