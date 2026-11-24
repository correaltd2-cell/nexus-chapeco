/* O fluxo das provas do portal, sem banco, sem rede e sem WhatsApp dentro: quem chama
   entrega o portal, o registro (Firestore) e o mensageiro (WhatsApp). Assim a mesma
   lógica roda no servidor e nos testes, com dublês, e nenhuma mensagem real sai.
   O que este fluxo garante (pedido de 24/11/2026):
   - permissão de cada ação, e a coordenação só nas conversas do setor dela;
   - vínculo confirmado no portal, sem casar só por nome ou telefone;
   - liberação com chave de idempotência: o mesmo clique repetido não libera duas vezes,
     e outra liberação da mesma prova não começa enquanto uma está em curso;
   - sem resposta do portal, a liberação fica "sem confirmação" e só se retoma à mão com
     a MESMA chave (nunca uma tentativa nova por conta própria);
   - prova que já não está bloqueada não é liberada de novo nem substituída;
   - liberação e envio registrados separados; se o WhatsApp falha depois da liberação,
     o reenvio manda a mensagem de novo sem pedir outra liberação.
   Prova: node --experimental-strip-types testes/provas-portal.ts */
import {
  JA_NAO_BLOQUEADA, MODELO_DA_PROVA, RECUSAS_DEFINITIVAS, canalDoEnvio, chaveValida, linkValido, mensagemDaProva, motivoDoPortal, podeNoPortal,
  podeRetomar, seguraATrava, sufixoDoLink,
  type AcaoNoPortal, type AlunoNoPortal, type EnvioDaProva, type LiberacaoConfirmada, type OperacaoDaProva, type ProvaNoPortal, type Quem,
} from '../dominio/provas-portal.ts';
import { mesmoTelefone } from '../dominio/contato.ts';

/* ---------------- o que o fluxo recebe de fora ---------------- */

export type FalhaDoPortal = {
  ok: false;
  tipo: 'nao_configurado' | 'recusado' | 'indisponivel' | 'resposta_invalida';
  codigo: string;
  mensagem: string;
  /** o pedido pode ter chegado e sido feito (tempo esgotado, erro 5xx): não dá para saber */
  incerto: boolean;
};
export type RespostaDoPortal<T> = { ok: true; dados: T } | FalhaDoPortal;

export interface Portal {
  configurado(): boolean;
  hostsDoLink(): string[];
  buscaAlunos(busca: string, quem: Quem): Promise<RespostaDoPortal<AlunoNoPortal[]>>;
  aluno(id: string, quem: Quem): Promise<RespostaDoPortal<AlunoNoPortal>>;
  provas(id: string, quem: Quem): Promise<RespostaDoPortal<{ alunoId: string; atualizadoEm: string; provas: ProvaNoPortal[] }>>;
  libera(id: string, provaId: string, chave: string, quem: Quem): Promise<RespostaDoPortal<LiberacaoConfirmada>>;
  link(id: string, provaId: string, quem: Quem): Promise<RespostaDoPortal<{ link: string; expiraEm: string }>>;
}

export interface AlunoDaCentral {
  id: string; nome: string; menor?: boolean; telefone?: string; responsavelTelefone?: string;
  portalStudentId?: string | null; portalNome?: string | null;
}
export interface ConversaDaCentral { id: string; nome: string; waId: string; alunoId?: string | null; setor: string; janelaAte?: string }
export interface QuemComSetores extends Quem { setores?: string[] }

export interface LinhaDoLog {
  acao: 'vinculou' | 'desvinculou' | 'pediu_liberacao' | 'retomou_liberacao' | 'liberacao_confirmada' | 'liberacao_sem_confirmacao'
    | 'liberacao_recusada' | 'ja_estava_liberada' | 'enviou' | 'envio_falhou';
  alunoId: string;
  provaId?: string;
  operacaoId?: string;
  quem: Quem;
  em: string;
  detalhe?: string;
}

export interface Registro {
  aluno(id: string): Promise<AlunoDaCentral | null>;
  alunoPeloPortal(portalStudentId: string): Promise<AlunoDaCentral | null>;
  conversa(id: string): Promise<ConversaDaCentral | null>;
  modeloDaProvaAprovado(): Promise<boolean>;
  gravaVinculo(alunoId: string, vinculo: { portalStudentId: string; portalNome: string; por: Quem; em: string } | null): Promise<void>;
  /** Numa transação: a operação desta chave (clique repetido), ou a que segura a trava
      desta prova (outra em curso), ou cria a nova e pega a trava. */
  comecaLiberacao(op: OperacaoDaProva): Promise<{ criada: true } | { existente: OperacaoDaProva } | { ocupada: OperacaoDaProva }>;
  operacao(id: string): Promise<OperacaoDaProva | null>;
  ultimaOperacao(alunoId: string, provaId: string): Promise<OperacaoDaProva | null>;
  criaOperacao(op: OperacaoDaProva): Promise<void>;
  atualizaLiberacao(id: string, campos: Partial<OperacaoDaProva['liberacao']>, soltaTrava: boolean): Promise<void>;
  /** Numa transação: o envio desta chave (clique repetido), ou o que está saindo agora, ou grava "enviando". */
  comecaEnvio(opId: string, envio: EnvioDaProva): Promise<{ criado: true } | { existente: EnvioDaProva } | { ocupado: EnvioDaProva }>;
  terminaEnvio(opId: string, chave: string, campos: Partial<EnvioDaProva>): Promise<void>;
  anota(linha: LinhaDoLog): Promise<void>;
}

export interface Mensageiro {
  envia(p: {
    conversa: ConversaDaCentral; quem: Quem; canal: 'texto' | 'modelo'; texto: string;
    valoresDoModelo?: string[]; sufixoDoLink?: string; operacaoId: string;
  }): Promise<{ ok: boolean; waMessageId?: string | null; mensagemId?: string | null; erro?: string }>;
}

export interface Dependencias { portal: Portal; registro: Registro; mensageiro: Mensageiro; agora: () => Date }

/* ---------------- o que o fluxo devolve ---------------- */

export type Resultado<T> = { ok: true; dados: T } | { ok: false; status: number; codigo: string; erro: string; operacao?: OperacaoDaProva };

const nao = (status: number, codigo: string, erro: string, operacao?: OperacaoDaProva): { ok: false; status: number; codigo: string; erro: string; operacao?: OperacaoDaProva } =>
  ({ ok: false, status, codigo, erro, ...(operacao ? { operacao } : {}) });

const NAO_CONFIGURADO = () => nao(503, 'nao_configurado', 'A ligação com o portal de provas ainda não está configurada.');

function doPortal(f: FalhaDoPortal) {
  if (f.tipo === 'nao_configurado') return NAO_CONFIGURADO();
  if (f.tipo === 'indisponivel') return nao(503, 'portal_indisponivel', motivoDoPortal('indisponivel'));
  if (f.tipo === 'resposta_invalida') return nao(502, 'resposta_invalida', 'O portal respondeu fora do combinado. Nada foi feito com essa resposta.');
  return nao(f.codigo === 'aluno_nao_encontrado' || f.codigo === 'prova_nao_encontrada' ? 404 : 409, f.codigo, motivoDoPortal(f.codigo, f.mensagem));
}

function confere(quem: QuemComSetores, acao: AcaoNoPortal) {
  return podeNoPortal(quem.papel, acao) ? null : nao(403, 'sem_permissao', 'Você não tem permissão para fazer isso com as provas do portal.');
}

const semSetores = (q: QuemComSetores): Quem => ({ uid: q.uid, nome: q.nome, papel: q.papel });
const hhmm = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

/* ---------------- vínculo ---------------- */

export async function buscaNoPortal(d: Dependencias, p: { quem: QuemComSetores; busca: string }): Promise<Resultado<AlunoNoPortal[]>> {
  const negado = confere(p.quem, 'vincular');
  if (negado) return negado;
  if (!d.portal.configurado()) return NAO_CONFIGURADO();
  const busca = (p.busca || '').replace(/\s+/g, ' ').trim();
  if (busca.length < 3) return nao(400, 'busca_curta', 'Escreva pelo menos 3 letras do nome, o e-mail ou o código do aluno no portal.');
  const r = await d.portal.buscaAlunos(busca.slice(0, 80), semSetores(p.quem));
  return r.ok ? { ok: true, dados: r.dados } : doPortal(r);
}

/** Vincula o aluno da central ao aluno do portal que um funcionário escolheu e confirmou.
    Nunca automático: o id vem da escolha da pessoa, e o portal confirma que existe. */
export async function vincula(d: Dependencias, p: { quem: QuemComSetores; alunoId: string; portalStudentId: string }): Promise<Resultado<AlunoNoPortal>> {
  const negado = confere(p.quem, 'vincular');
  if (negado) return negado;
  if (!d.portal.configurado()) return NAO_CONFIGURADO();
  const id = (p.portalStudentId || '').trim();
  if (!id || id.length > 120) return nao(400, 'id_invalido', 'Escolha o aluno do portal na lista.');
  const aluno = await d.registro.aluno(p.alunoId);
  if (!aluno) return nao(404, 'aluno_central_nao_encontrado', 'Este aluno não existe mais na central.');
  if (aluno.portalStudentId && aluno.portalStudentId !== id) {
    return nao(409, 'ja_vinculado', `${aluno.nome} já está vinculado a outro aluno do portal (${aluno.portalNome || aluno.portalStudentId}). A gestão desvincula antes de trocar.`);
  }
  const outro = await d.registro.alunoPeloPortal(id);
  if (outro && outro.id !== aluno.id) {
    return nao(409, 'portal_ja_usado', `Este aluno do portal já está vinculado a ${outro.nome} na central. Confira se é a mesma pessoa.`);
  }
  const r = await d.portal.aluno(id, semSetores(p.quem));
  if (!r.ok) return doPortal(r);
  if (r.dados.id !== id) return nao(502, 'resposta_invalida', 'O portal respondeu com outro aluno. Nada foi vinculado.');
  const em = d.agora().toISOString();
  await d.registro.gravaVinculo(aluno.id, { portalStudentId: id, portalNome: r.dados.nome, por: semSetores(p.quem), em });
  await d.registro.anota({ acao: 'vinculou', alunoId: aluno.id, quem: semSetores(p.quem), em, detalhe: `${r.dados.nome} (${id})` });
  return { ok: true, dados: r.dados };
}

export async function desvincula(d: Dependencias, p: { quem: QuemComSetores; alunoId: string }): Promise<Resultado<null>> {
  const negado = confere(p.quem, 'desvincular');
  if (negado) return negado;
  const aluno = await d.registro.aluno(p.alunoId);
  if (!aluno) return nao(404, 'aluno_central_nao_encontrado', 'Este aluno não existe mais na central.');
  if (!aluno.portalStudentId) return { ok: true, dados: null };
  const em = d.agora().toISOString();
  await d.registro.gravaVinculo(aluno.id, null);
  await d.registro.anota({ acao: 'desvinculou', alunoId: aluno.id, quem: semSetores(p.quem), em, detalhe: `${aluno.portalNome || ''} (${aluno.portalStudentId})` });
  return { ok: true, dados: null };
}

/* ---------------- consulta ---------------- */

export async function provasDoAluno(d: Dependencias, p: { quem: QuemComSetores; alunoId: string }): Promise<Resultado<{ atualizadoEm: string; provas: ProvaNoPortal[] }>> {
  const negado = confere(p.quem, 'consultar');
  if (negado) return negado;
  if (!d.portal.configurado()) return NAO_CONFIGURADO();
  const aluno = await d.registro.aluno(p.alunoId);
  if (!aluno) return nao(404, 'aluno_central_nao_encontrado', 'Este aluno não existe mais na central.');
  if (!aluno.portalStudentId) return nao(409, 'sem_vinculo', 'Este aluno ainda não está vinculado ao portal.');
  const r = await d.portal.provas(aluno.portalStudentId, semSetores(p.quem));
  if (!r.ok) return doPortal(r);
  /* a lista tem que ser do aluno vinculado: se vier de outro, não se mostra nada */
  if (r.dados.alunoId !== aluno.portalStudentId) return nao(502, 'resposta_invalida', 'O portal devolveu as provas de outro aluno. Nada foi mostrado.');
  return { ok: true, dados: { atualizadoEm: r.dados.atualizadoEm, provas: r.dados.provas } };
}

/* ---------------- liberar e enviar ---------------- */

interface Contexto { aluno: AlunoDaCentral & { portalStudentId: string }; conversa: ConversaDaCentral; canal: 'texto' | 'modelo' }

/** O que todo envio confere antes: aluno vinculado, conversa do aluno, setor, e se há
    por onde mandar (texto na janela, ou modelo aprovado fora dela). */
async function preparaEnvio(d: Dependencias, quem: QuemComSetores, alunoId: string, conversaId: string): Promise<Contexto | { ok: false; status: number; codigo: string; erro: string }> {
  const aluno = await d.registro.aluno(alunoId);
  if (!aluno) return nao(404, 'aluno_central_nao_encontrado', 'Este aluno não existe mais na central.');
  if (!aluno.portalStudentId) return nao(409, 'sem_vinculo', 'Este aluno ainda não está vinculado ao portal.');
  const conversa = conversaId ? await d.registro.conversa(conversaId) : null;
  if (!conversa) return nao(409, 'sem_conversa', 'Escolha a conversa do WhatsApp por onde o link vai.');
  const doAluno = conversa.alunoId === aluno.id || mesmoTelefone(conversa.waId, aluno.telefone) || mesmoTelefone(conversa.waId, aluno.responsavelTelefone);
  if (!doAluno) return nao(409, 'conversa_de_outro', 'Esta conversa não é deste aluno nem do responsável dele. Confira antes de mandar.');
  if (quem.papel === 'coordenacao' && !(quem.setores || []).includes(conversa.setor)) {
    return nao(403, 'sem_permissao', 'Esta conversa é de outro setor.');
  }
  const janelaAberta = Boolean(conversa.janelaAte && Date.parse(conversa.janelaAte) > d.agora().getTime());
  const canal = canalDoEnvio({ temConversa: true, janelaAberta, modeloAprovado: janelaAberta ? false : await d.registro.modeloDaProvaAprovado() });
  if ('erro' in canal) return nao(409, 'sem_canal', canal.erro);
  return { aluno: aluno as Contexto['aluno'], conversa, canal: canal.canal };
}

/** Manda (ou não, se o mesmo clique já mandou) a mensagem com o link e registra. */
async function mandaLink(d: Dependencias, ctx: Contexto, op: OperacaoDaProva, quem: Quem, link: string, chaveDoEnvio: string): Promise<Resultado<OperacaoDaProva>> {
  const em = d.agora().toISOString();
  const envio: EnvioDaProva = { chave: chaveDoEnvio, estado: 'enviando', canal: ctx.canal, por: quem, em };
  const comeco = await d.registro.comecaEnvio(op.id, envio);
  if ('existente' in comeco) return { ok: true, dados: (await d.registro.operacao(op.id)) || op };
  if ('ocupado' in comeco) return nao(409, 'envio_em_andamento', 'Uma mensagem desta prova está saindo agora. Espere um instante e confira.', (await d.registro.operacao(op.id)) || op);

  const falha = async (erro: string) => {
    await d.registro.terminaEnvio(op.id, chaveDoEnvio, { estado: 'falhou', erro });
    await d.registro.anota({ acao: 'envio_falhou', alunoId: op.alunoId, provaId: op.provaId, operacaoId: op.id, quem, em: d.agora().toISOString(), detalhe: erro });
    return nao(502, 'envio_falhou', `A prova está liberada, mas a mensagem não saiu: ${erro} Use Reenviar mensagem.`, (await d.registro.operacao(op.id)) || op);
  };

  if (!linkValido(link, d.portal.hostsDoLink())) return falha('o portal devolveu um link fora do endereço do portal, e ele não foi mandado.');
  const ehResponsavel = Boolean(ctx.aluno.menor && mesmoTelefone(ctx.conversa.waId, ctx.aluno.responsavelTelefone));
  const texto = mensagemDaProva({ nomeDoContato: ctx.conversa.nome, nomeDoAluno: ctx.aluno.nome, ehResponsavel, titulo: op.provaTitulo, link });
  const sufixo = ctx.canal === 'modelo' ? sufixoDoLink(link) : null;
  if (ctx.canal === 'modelo' && sufixo === null) return falha(`o link não começa com o endereço do botão do modelo ${MODELO_DA_PROVA}.`);
  const r = await d.mensageiro.envia({
    conversa: ctx.conversa, quem, canal: ctx.canal, texto, operacaoId: op.id,
    ...(ctx.canal === 'modelo' ? { valoresDoModelo: [ctx.conversa.nome.split(/\s+/)[0] || 'aluno', op.provaTitulo], sufixoDoLink: sufixo || '' } : {}),
  });
  if (!r.ok) return falha(r.erro || 'o WhatsApp recusou o envio.');
  await d.registro.terminaEnvio(op.id, chaveDoEnvio, { estado: 'aceito', waMessageId: r.waMessageId || null, mensagemId: r.mensagemId || null });
  await d.registro.anota({ acao: 'enviou', alunoId: op.alunoId, provaId: op.provaId, operacaoId: op.id, quem, em: d.agora().toISOString(), detalhe: ctx.canal });
  return { ok: true, dados: (await d.registro.operacao(op.id)) || op };
}

/**
 * Liberar e enviar: confere tudo, pede a liberação ao portal com a chave do clique,
 * espera a confirmação com o link, e só então manda pelo WhatsApp. `retomar` repete o
 * pedido ao portal com a MESMA chave, para a liberação que ficou sem confirmação.
 */
export async function liberaEEnvia(d: Dependencias, p: {
  quem: QuemComSetores; alunoId: string; provaId: string; conversaId: string; chave: string; retomar?: boolean;
}): Promise<Resultado<OperacaoDaProva>> {
  const negado = confere(p.quem, 'liberar');
  if (negado) return negado;
  if (!chaveValida(p.chave)) return nao(400, 'chave_invalida', 'Pedido sem a chave de liberação. Feche e abra a prova de novo.');
  if (!d.portal.configurado()) return NAO_CONFIGURADO();
  const quem = semSetores(p.quem);

  /* o mesmo clique de novo: devolve o que já aconteceu, sem pedir nada ao portal */
  const ja = await d.registro.operacao(p.chave);
  if (ja && (ja.alunoId !== p.alunoId || ja.provaId !== p.provaId)) return nao(409, 'chave_usada', 'Esta chave já foi usada para outra prova. Feche e abra a prova de novo.');
  if (ja && !(p.retomar && podeRetomar(ja, d.agora().getTime()))) return { ok: true, dados: ja };

  const ctx = await preparaEnvio(d, p.quem, p.alunoId, p.conversaId);
  if ('ok' in ctx) return ctx;

  let op: OperacaoDaProva;
  if (ja) {
    op = ja;
    await d.registro.anota({ acao: 'retomou_liberacao', alunoId: op.alunoId, provaId: op.provaId, operacaoId: op.id, quem, em: d.agora().toISOString() });
  } else {
    /* a prova tem que estar bloqueada e liberável no portal, agora */
    const lista = await d.portal.provas(ctx.aluno.portalStudentId, quem);
    if (!lista.ok) return doPortal(lista);
    if (lista.dados.alunoId !== ctx.aluno.portalStudentId) return nao(502, 'resposta_invalida', 'O portal devolveu as provas de outro aluno. Nada foi liberado.');
    const prova = lista.dados.provas.find((x) => x.id === p.provaId);
    if (!prova) return nao(404, 'prova_nao_encontrada', motivoDoPortal('prova_nao_encontrada'));
    if (prova.estado !== 'bloqueada') {
      const codigo = prova.estado === 'iniciada' ? 'prova_em_andamento' : prova.estado === 'concluida' ? 'prova_concluida' : 'prova_ja_liberada';
      return nao(409, codigo, motivoDoPortal(codigo));
    }
    if (!prova.podeLiberar) return nao(409, 'prova_nao_liberavel', prova.motivoBloqueio || motivoDoPortal('prova_nao_liberavel'));

    const agora = d.agora().toISOString();
    op = {
      id: p.chave, alunoId: ctx.aluno.id, alunoNome: ctx.aluno.nome, portalStudentId: ctx.aluno.portalStudentId,
      provaId: prova.id, provaTitulo: prova.titulo, conversaId: ctx.conversa.id,
      liberacao: { estado: 'pedida', pedidaEm: agora, pedidaPor: quem },
      envios: [], criadoEm: agora, atualizadoEm: agora,
    };
    const comeco = await d.registro.comecaLiberacao(op);
    if ('existente' in comeco) return { ok: true, dados: comeco.existente };
    if ('ocupada' in comeco) {
      const o = comeco.ocupada;
      return nao(409, 'liberacao_em_andamento', `Já existe uma liberação desta prova em andamento, pedida por ${o.liberacao.pedidaPor.nome} às ${hhmm(o.liberacao.pedidaEm)}. Ela não foi substituída: confira o andamento.`, o);
    }
    await d.registro.anota({ acao: 'pediu_liberacao', alunoId: op.alunoId, provaId: op.provaId, operacaoId: op.id, quem, em: agora });
  }

  const r = await d.portal.libera(op.portalStudentId, op.provaId, op.id, quem);
  const respondidaEm = d.agora().toISOString();

  if (!r.ok) {
    /* só recusa que o contrato diz ser certa destrava; código desconhecido (ou "o mesmo
       pedido ainda está sendo processado") fica sem confirmação, com a trava */
    const conhecida = (RECUSAS_DEFINITIVAS as readonly string[]).includes(r.codigo) || (JA_NAO_BLOQUEADA as readonly string[]).includes(r.codigo);
    const definitiva = !r.incerto && r.tipo === 'recusado' && conhecida;
    if (definitiva && (JA_NAO_BLOQUEADA as readonly string[]).includes(r.codigo)) {
      await d.registro.atualizaLiberacao(op.id, { estado: 'ja_estava_liberada', respondidaEm, codigo: r.codigo, erro: motivoDoPortal(r.codigo) }, true);
      await d.registro.anota({ acao: 'ja_estava_liberada', alunoId: op.alunoId, provaId: op.provaId, operacaoId: op.id, quem, em: respondidaEm, detalhe: r.codigo });
      return nao(409, r.codigo, motivoDoPortal(r.codigo), (await d.registro.operacao(op.id)) || op);
    }
    if (definitiva) {
      await d.registro.atualizaLiberacao(op.id, { estado: 'recusada', respondidaEm, codigo: r.codigo, erro: motivoDoPortal(r.codigo, r.mensagem) }, true);
      await d.registro.anota({ acao: 'liberacao_recusada', alunoId: op.alunoId, provaId: op.provaId, operacaoId: op.id, quem, em: respondidaEm, detalhe: r.codigo });
      return nao(409, r.codigo, motivoDoPortal(r.codigo, r.mensagem), (await d.registro.operacao(op.id)) || op);
    }
    /* sem resposta certa: a trava fica, e só se retoma à mão com a mesma chave */
    const erro = r.tipo === 'nao_configurado' ? 'A ligação com o portal deixou de estar configurada.' : motivoDoPortal('indisponivel');
    await d.registro.atualizaLiberacao(op.id, { estado: 'sem_confirmacao', respondidaEm, codigo: r.codigo, erro }, false);
    await d.registro.anota({ acao: 'liberacao_sem_confirmacao', alunoId: op.alunoId, provaId: op.provaId, operacaoId: op.id, quem, em: respondidaEm, detalhe: r.codigo });
    return nao(503, 'sem_confirmacao', 'O portal não confirmou a liberação. Ela pode ter acontecido ou não: toque em Conferir de novo (é o mesmo pedido, não cria outra liberação). Nenhuma mensagem foi mandada.', (await d.registro.operacao(op.id)) || op);
  }

  const lib = r.dados;
  if (lib.alunoId !== op.portalStudentId || lib.provaId !== op.provaId) {
    await d.registro.atualizaLiberacao(op.id, { estado: 'sem_confirmacao', respondidaEm, codigo: 'resposta_invalida', erro: 'O portal respondeu com outro aluno ou outra prova.' }, false);
    await d.registro.anota({ acao: 'liberacao_sem_confirmacao', alunoId: op.alunoId, provaId: op.provaId, operacaoId: op.id, quem, em: respondidaEm, detalhe: 'resposta de outro aluno ou prova' });
    return nao(502, 'resposta_invalida', 'O portal respondeu com outro aluno ou outra prova. Nada foi mandado; avise o responsável pelo portal.', (await d.registro.operacao(op.id)) || op);
  }
  await d.registro.atualizaLiberacao(op.id, { estado: 'confirmada', respondidaEm, portalLiberacaoId: lib.id, expiraEm: lib.expiraEm || null, codigo: null, erro: null }, true);
  await d.registro.anota({ acao: 'liberacao_confirmada', alunoId: op.alunoId, provaId: op.provaId, operacaoId: op.id, quem, em: respondidaEm, detalhe: lib.id });

  const atual = (await d.registro.operacao(op.id)) || op;
  return mandaLink(d, ctx, atual, quem, lib.link, `${op.id}#1`);
}

/** Reenviar a mensagem de uma prova já liberada: pede só o link ao portal (nunca outra
    liberação) e manda de novo. A chave do clique evita mandar duas vezes. */
export async function reenvia(d: Dependencias, p: {
  quem: QuemComSetores; alunoId: string; provaId: string; conversaId: string; chaveDoEnvio: string;
}): Promise<Resultado<OperacaoDaProva>> {
  const negado = confere(p.quem, 'reenviar');
  if (negado) return negado;
  if (!chaveValida(p.chaveDoEnvio)) return nao(400, 'chave_invalida', 'Pedido sem a chave do envio. Feche e abra a prova de novo.');
  if (!d.portal.configurado()) return NAO_CONFIGURADO();
  const quem = semSetores(p.quem);
  const ctx = await preparaEnvio(d, p.quem, p.alunoId, p.conversaId);
  if ('ok' in ctx) return ctx;

  let op = await d.registro.ultimaOperacao(ctx.aluno.id, p.provaId);
  if (op && seguraATrava(op.liberacao.estado)) {
    return nao(409, 'liberacao_em_andamento', 'A liberação desta prova ainda não foi confirmada pelo portal. Use Conferir de novo antes de mandar.', op);
  }
  /* o mesmo clique de novo, em qualquer operação desta prova */
  if (op?.envios.some((e) => e.chave === p.chaveDoEnvio)) return { ok: true, dados: op };

  const l = await d.portal.link(ctx.aluno.portalStudentId, p.provaId, quem);
  if (!l.ok) return doPortal(l);

  if (!op || (op.liberacao.estado !== 'confirmada' && op.liberacao.estado !== 'externa' && op.liberacao.estado !== 'ja_estava_liberada')) {
    /* liberada direto no portal (ou a última operação foi recusada): registra para o envio ter onde morar */
    const lista = await d.portal.provas(ctx.aluno.portalStudentId, quem);
    const titulo = lista.ok ? lista.dados.provas.find((x) => x.id === p.provaId)?.titulo : undefined;
    const agora = d.agora().toISOString();
    op = {
      id: p.chaveDoEnvio, alunoId: ctx.aluno.id, alunoNome: ctx.aluno.nome, portalStudentId: ctx.aluno.portalStudentId,
      provaId: p.provaId, provaTitulo: titulo || op?.provaTitulo || 'de fim de módulo', conversaId: ctx.conversa.id,
      liberacao: { estado: 'externa', pedidaEm: agora, pedidaPor: quem }, envios: [], criadoEm: agora, atualizadoEm: agora,
    };
    await d.registro.criaOperacao(op);
  }
  return mandaLink(d, ctx, op, quem, l.dados.link, p.chaveDoEnvio);
}
