/* O que fazer com cada coisa que a Meta manda no webhook.
   Separado da rota para dar para testar sem subir servidor. */
import 'server-only';
import type { DocumentReference, Firestore } from 'firebase-admin/firestore';
import { comEtiqueta, etiquetaDoAssunto, leAssunto, tarefaDoAssunto } from '@/lib/dominio/triagem';
import { PASSO, novoId } from '@/lib/dominio/quadros';
import type { Lista, Quadro } from '@/lib/dominio/tipos';

export interface Contexto { bd: Firestore }

const agoraIso = () => new Date().toISOString();
const emIso = (ts?: string) => (ts ? new Date(Number(ts) * 1000).toISOString() : agoraIso());
/* a janela de atendimento da Meta: 24 horas a contar da ultima mensagem do contato */
const janelaDe = (iso: string) => new Date(new Date(iso).getTime() + 24 * 3600 * 1000).toISOString();

export function textoDaMensagem(m: Record<string, unknown>): string {
  const tipo = String(m.type || '');
  const pega = (k: string, campo: string) => {
    const o = m[k] as Record<string, unknown> | undefined;
    return o && typeof o[campo] === 'string' ? (o[campo] as string) : '';
  };
  if (tipo === 'text') return pega('text', 'body');
  if (tipo === 'button') return pega('button', 'text');
  if (tipo === 'interactive') {
    const i = m.interactive as { button_reply?: { title?: string }; list_reply?: { title?: string } } | undefined;
    return i?.button_reply?.title || i?.list_reply?.title || '';
  }
  if (tipo === 'image' || tipo === 'video' || tipo === 'document' || tipo === 'audio') {
    return pega(tipo, 'caption');
  }
  if (tipo === 'sticker') return '';
  if (tipo === 'reaction') return '';
  if (tipo === 'location') return '📍 localização';
  if (tipo === 'contacts') return '📇 cartão de contato';
  return '';
}

/** Mensagem que a Meta avisa mas nao entrega o conteudo, ou que nao vira fala. */
export const naoViraFala = (tipo: string) =>
  ['reaction', 'sticker', 'unsupported', 'unknown', 'system'].includes(tipo);

/** Acha a conversa do numero ou cria uma nova, sempre na Recepção. A que nasce do
    histórico do celular nasce encerrada: é conversa velha, não atendimento de agora. */
export async function garanteConversa(ctx: Contexto, waId: string, nome: string, doHistorico = false) {
  const achadas = await ctx.bd.collection('conversas').where('waId', '==', waId).limit(1).get();
  if (!achadas.empty) return achadas.docs[0].ref;
  const agora = agoraIso();
  const aluno = await ctx.bd.collection('alunos').where('telefone', '==', waId).limit(1).get();
  /* o nome que está na agenda do celular da recepção vale mais que o número puro */
  const daAgenda = aluno.empty && !nome
    ? ((await ctx.bd.doc(`contatos_do_celular/${waId}`).get()).data()?.nome as string | undefined)
    : undefined;
  return ctx.bd.collection('conversas').add({
    waId,
    nome: aluno.empty ? nome || daAgenda || waId : (aluno.docs[0].data().nome as string),
    alunoId: aluno.empty ? null : aluno.docs[0].id,
    setor: 'recepcao',
    estado: doHistorico ? 'encerrada' : 'aberta',
    ...(doHistorico ? { encerradaEm: agora, encerradaPor: 'silencio' } : {}),
    agenteAtivo: true,
    naoLidas: 0,
    etiquetas: [],
    ultimaEm: agora,
    ultimaPreviaTexto: '',
    criadaEm: agora,
  });
}

/* A triagem abre a tarefa sozinha. Duas travas, de proposito: so com sinal forte
   (o que nao da para dizer nao vira cartao, porque quadro cheio de cartao errado
   ninguem olha) e so uma tarefa aberta por conversa, senao cada mensagem do mesmo
   assunto viraria um cartao novo. Quem resolve continua sendo gente: isto aqui nao
   responde o contato nem move a conversa de setor. */
async function ligada(ctx: Contexto): Promise<boolean> {
  const cfg = await ctx.bd.doc('config/atendimento').get();
  return cfg.data()?.abreTarefaNaTriagem !== false;
}

/* A etiqueta do assunto é pendurada na conversa SEMPRE que o sinal é forte, mesmo
   quando a tarefa ja existe: é ela que deixa a lista legivel de longe e alimenta o
   filtro por assunto. Nunca tira etiqueta que gente pos a mao. */
export async function marcaAssunto(
  ctx: Contexto, conversa: DocumentReference, etiquetas: string[], texto: string,
) {
  const nova = comEtiqueta(etiquetas, etiquetaDoAssunto(leAssunto(texto).assunto));
  if (nova) await conversa.update({ etiquetas: nova });
}

export async function abreTarefaPelaTriagem(
  ctx: Contexto, conversa: DocumentReference, nome: string, texto: string,
) {
  if (!texto.trim()) return;
  const aberta = await ctx.bd.collection('cartoes')
    .where('conversaId', '==', conversa.id).where('arquivado', '==', false).limit(1).get();
  if (!aberta.empty) return;
  if (!(await ligada(ctx))) return;

  const [qs, ls] = await Promise.all([
    ctx.bd.collection('quadros').get(),
    ctx.bd.collection('listas').get(),
  ]);
  const quadros = qs.docs.map((d) => ({ id: d.id, ...d.data() }) as Quadro);
  const listas = ls.docs.map((d) => ({ id: d.id, ...d.data() }) as Lista);
  const tarefa = tarefaDoAssunto(leAssunto(texto), nome, texto, quadros, listas);
  if (!tarefa) return;

  /* entra no topo da lista: é o que acabou de chegar */
  const primeiro = await ctx.bd.collection('cartoes')
    .where('listaId', '==', tarefa.listaId).where('arquivado', '==', false)
    .orderBy('ordem').limit(1).get();
  const ordem = primeiro.empty ? PASSO : (primeiro.docs[0].data().ordem as number) - PASSO;
  const agora = agoraIso();

  const cartao = await ctx.bd.collection('cartoes').add({
    quadroId: tarefa.quadroId, listaId: tarefa.listaId, ordem,
    titulo: tarefa.titulo, descricao: tarefa.descricao, etiquetas: tarefa.etiquetas,
    membros: [], prazoConcluido: false, checklist: [], comentarios: [], anexos: [],
    conversaId: conversa.id, arquivado: false, criadoEm: agora, atualizadoEm: agora,
    atividade: [{ id: novoId(), autorNome: 'Triagem', texto: 'abriu a tarefa pela conversa', criadoEm: agora }],
  });
  await conversa.update({ tarefaId: cartao.id });
  await ctx.bd.collection('mensagens').add({
    conversaId: conversa.id, direcao: 'saida', autor: 'sistema', autorNome: 'Triagem',
    texto: `A triagem abriu a tarefa "${tarefa.titulo}" em ${tarefa.quadroNome}.`,
    criadaEm: agora,
  });
}

/** Mensagem que o contato mandou. */
export async function recebeDoContato(
  ctx: Contexto,
  m: Record<string, unknown>,
  contatos: { wa_id?: string; profile?: { name?: string } }[],
) {
  const waId = String(m.from || '');
  if (!waId) return;
  const perfil = contatos.find((c) => c.wa_id === waId);
  const ref = await garanteConversa(ctx, waId, perfil?.profile?.name || '');
  const quando = emIso(m.timestamp as string | undefined);
  const tipo = String(m.type || 'text');
  const texto = textoDaMensagem(m);

  await ctx.bd.collection('mensagens').add({
    conversaId: ref.id,
    direcao: 'entrada',
    autor: 'cliente',
    texto,
    tipoBruto: tipo,
    waMessageId: String(m.id || ''),
    criadaEm: quando,
  });

  const conversa = await ref.get();
  const naoLidas = Number((conversa.data()?.naoLidas as number) || 0);
  await ref.update({
    ultimaEm: quando,
    ultimaPreviaTexto: texto || tipo,
    janelaAte: janelaDe(quando),
    naoLidas: naoLidas + 1,
    /* mensagem nova reabre a conversa encerrada, na Recepção */
    ...(conversa.data()?.estado === 'encerrada'
      ? { estado: 'aberta', setor: 'recepcao', encerradaEm: null }
      : {}),
  });

  if (!naoViraFala(tipo) && texto.trim()) {
    const dados = conversa.data() || {};
    const nome = (dados.nome as string) || waId;
    /* etiqueta e tarefa sao extras: se falharem, a mensagem ja esta gravada e o time atende */
    try { await marcaAssunto(ctx, ref, (dados.etiquetas as string[]) || [], texto); } catch { /* segue */ }
    try { await abreTarefaPelaTriagem(ctx, ref, nome, texto); } catch { /* segue */ }
  }
  return ref;
}

/** Eco de coexistencia: o que a recepção mandou pelo celular aparece aqui. */
export async function recebeEcoDoCelular(ctx: Contexto, m: Record<string, unknown>) {
  const waId = String(m.to || '');
  if (!waId) return;
  const ref = await garanteConversa(ctx, waId, '');
  const quando = emIso(m.timestamp as string | undefined);
  const texto = textoDaMensagem(m);
  const id = String(m.id || '');

  /* a Meta repete eco; nao duplicar */
  if (id) {
    const ja = await ctx.bd.collection('mensagens').where('waMessageId', '==', id).limit(1).get();
    if (!ja.empty) return;
  }

  await ctx.bd.collection('mensagens').add({
    conversaId: ref.id,
    direcao: 'saida',
    autor: 'humano',
    autorNome: 'Recepção (celular)',
    texto,
    waMessageId: id,
    entregueEm: quando,
    criadaEm: quando,
  });
  /* alguem do time ja respondeu pelo celular: o Lumi nao interrompe */
  await ref.update({ ultimaEm: quando, ultimaPreviaTexto: texto, agenteAtivo: false, naoLidas: 0 });
}

/** entregue, lido e falhou. O estado so anda para frente. */
export async function processaStatus(ctx: Contexto, s: Record<string, unknown>) {
  const id = String(s.id || '');
  if (!id) return;
  const achadas = await ctx.bd.collection('mensagens').where('waMessageId', '==', id).limit(1).get();
  if (achadas.empty) return; /* mensagem de outro aplicativo na mesma conta: ignora calado */
  const doc = achadas.docs[0];
  const atual = doc.data();
  const quando = emIso(s.timestamp as string | undefined);
  const estado = String(s.status || '');
  const mudanca: Record<string, unknown> = {};

  if (estado === 'delivered' && !atual.entregueEm) mudanca.entregueEm = quando;
  if (estado === 'read') {
    if (!atual.lidoEm) mudanca.lidoEm = quando;
    /* "lido" tambem marca entregue: senao a linha diria "nao entregue" para sempre */
    if (!atual.entregueEm) mudanca.entregueEm = quando;
  }
  if (estado === 'failed' && !atual.falhouEm) {
    mudanca.falhouEm = quando;
    const erros = s.errors as { title?: string; message?: string; error_data?: { details?: string } }[] | undefined;
    const e = erros?.[0];
    mudanca.falhaMotivo = e?.error_data?.details || e?.message || e?.title || 'A Meta não entregou.';
  }
  if (Object.keys(mudanca).length) await doc.ref.update(mudanca);
}

/* ================= coexistência: o que vem do celular ================= */

const soDigitos = (t: unknown) => String(t || '').replace(/\D/g, '');

/** Contatos da agenda do celular da recepção (campo smb_app_state_sync), uma vez por
    conexão. Ficam em contatos_do_celular, e a conversa que só tinha o número ganha o
    nome da agenda. Aceita também o formato antigo, com `contacts`. */
export async function recebeContatosDoCelular(
  ctx: Contexto,
  estado: { type?: string; action?: string; contact?: { full_name?: string; first_name?: string; phone_number?: string } }[],
  antigos: { wa_id?: string; profile?: { name?: string } }[] = [],
) {
  const itens = [
    ...estado.filter((e) => (e.type || 'contact') === 'contact' && e.contact?.phone_number)
      .map((e) => ({ waId: soDigitos(e.contact?.phone_number), nome: (e.contact?.full_name || e.contact?.first_name || '').trim(), sai: e.action === 'remove' })),
    ...antigos.filter((c) => c.wa_id).map((c) => ({ waId: soDigitos(c.wa_id), nome: c.profile?.name || '', sai: false })),
  ].filter((i) => i.waId);

  for (let i = 0; i < itens.length; i += 400) {
    const lote = ctx.bd.batch();
    for (const c of itens.slice(i, i + 400)) {
      lote.set(ctx.bd.doc(`contatos_do_celular/${c.waId}`),
        { waId: c.waId, nome: c.nome, removido: c.sai, vistoEm: agoraIso() }, { merge: true });
    }
    await lote.commit();
  }

  /* conversa que ainda só tem o número ganha o nome da agenda */
  for (let i = 0; i < itens.length; i += 20) {
    await Promise.all(itens.slice(i, i + 20).filter((c) => c.nome && !c.sai).map(async (c) => {
      const achadas = await ctx.bd.collection('conversas').where('waId', '==', c.waId).limit(1).get();
      const d = achadas.docs[0];
      if (d && (!d.data().nome || d.data().nome === c.waId)) await d.ref.update({ nome: c.nome });
    }));
  }
  return itens.length;
}

/** Histórico do celular (até 180 dias), em lotes, logo depois de pedir a sincronização.
    Mensagem velha não é mensagem nova: não passa pela triagem, não abre tarefa, não soma
    não lida e não reabre conversa. O id do documento vem do id da Meta, então o mesmo
    lote recebido duas vezes não duplica nada.
    Cada thread é um contato: a mensagem cujo remetente é o contato veio dele; a outra
    foi a recepção que mandou pelo celular. */
export async function recebeHistorico(
  ctx: Contexto,
  threads: { id?: string; messages?: Record<string, unknown>[] }[],
) {
  let gravadas = 0;
  for (const t of threads) {
    const contato = soDigitos(t.id);
    if (!contato || !t.messages?.length) continue;
    const ref = await garanteConversa(ctx, contato, '', true);
    const atual = (await ref.get()).data() || {};
    let maisNova = atual.criadaEm === atual.ultimaEm ? '' : String(atual.ultimaEm || '');
    let previa = String(atual.ultimaPreviaTexto || '');
    let janela = String(atual.janelaAte || '');

    let lote = ctx.bd.batch();
    let noLote = 0;
    for (const m of t.messages) {
      const id = String(m.id || '');
      const tipo = String(m.type || '');
      if (!id || ['reaction', 'system', 'unknown'].includes(tipo)) continue;
      const doContato = soDigitos(m.from) === contato;
      const quando = emIso(m.timestamp as string | undefined);
      const texto = textoDaMensagem(m) || (tipo === 'sticker' ? 'figurinha' : `(${tipo || 'mensagem'})`);
      lote.set(ctx.bd.doc(`mensagens/wa_${id.replace(/\//g, '_')}`), {
        conversaId: ref.id,
        direcao: doContato ? 'entrada' : 'saida',
        autor: doContato ? 'cliente' : 'humano',
        ...(doContato ? {} : { autorNome: 'Recepção (celular)', entregueEm: quando }),
        texto, tipoBruto: tipo, waMessageId: id, doHistorico: true, criadaEm: quando,
      }, { merge: true });
      gravadas += 1;
      noLote += 1;
      if (!maisNova || quando > maisNova) { maisNova = quando; previa = texto; }
      if (doContato) { const j = janelaDe(quando); if (!janela || j > janela) janela = j; }
      if (noLote >= 400) { await lote.commit(); lote = ctx.bd.batch(); noLote = 0; }
    }
    if (noLote) await lote.commit();

    const campos: Record<string, unknown> = {};
    if (maisNova && maisNova !== atual.ultimaEm) { campos.ultimaEm = maisNova; campos.ultimaPreviaTexto = previa; }
    if (janela && janela !== atual.janelaAte) campos.janelaAte = janela;
    if (Object.keys(campos).length) await ref.update(campos);
  }
  return gravadas;
}
