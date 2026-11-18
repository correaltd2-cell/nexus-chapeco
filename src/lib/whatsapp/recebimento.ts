/* O que fazer com cada coisa que a Meta manda no webhook.
   Separado da rota para dar para testar sem subir servidor. */
import 'server-only';
import type { Firestore } from 'firebase-admin/firestore';

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

/** Acha a conversa do numero ou cria uma nova, sempre na Recepção. */
export async function garanteConversa(ctx: Contexto, waId: string, nome: string) {
  const achadas = await ctx.bd.collection('conversas').where('waId', '==', waId).limit(1).get();
  if (!achadas.empty) return achadas.docs[0].ref;
  const agora = agoraIso();
  const aluno = await ctx.bd.collection('alunos').where('telefone', '==', waId).limit(1).get();
  return ctx.bd.collection('conversas').add({
    waId,
    nome: aluno.empty ? nome || waId : (aluno.docs[0].data().nome as string),
    alunoId: aluno.empty ? null : aluno.docs[0].id,
    setor: 'recepcao',
    estado: 'aberta',
    agenteAtivo: true,
    naoLidas: 0,
    etiquetas: [],
    ultimaEm: agora,
    ultimaPreviaTexto: '',
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

/** Contatos que vieram do celular na conexão (uma vez só). */
export async function sincronizaContatos(
  ctx: Contexto,
  contatos: { wa_id?: string; profile?: { name?: string } }[],
) {
  const lote = ctx.bd.batch();
  let n = 0;
  for (const c of contatos.slice(0, 450)) {
    if (!c.wa_id) continue;
    const ref = ctx.bd.doc(`contatos_do_celular/${c.wa_id}`);
    lote.set(ref, { waId: c.wa_id, nome: c.profile?.name || '', vistoEm: agoraIso() }, { merge: true });
    n++;
  }
  if (n) await lote.commit();
  return n;
}
