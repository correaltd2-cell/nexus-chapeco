/* O que fazer com cada coisa que a Meta manda no webhook.
   Separado da rota para dar para testar sem subir servidor. */
import 'server-only';
import type { DocumentReference, Firestore } from 'firebase-admin/firestore';
import { comEtiqueta, etiquetaDoAssunto, leAssunto, tarefaDoAssunto } from '@/lib/dominio/triagem';
import { PASSO, novoId } from '@/lib/dominio/quadros';
import type { Conversa, Lista, Quadro } from '@/lib/dominio/tipos';
import { atendeAoVivo, camposDaFalaDaEscola } from './automatico';
import { baixaMidia } from './cloud';
import { adminArquivos } from '@/lib/firebase/admin';
import { caminhoDaMidia, mimeLimpo, previaDaMidia } from '@/lib/dominio/midia';
import { descreveErro, falhou } from '@/lib/saude';
import { avisaEquipe } from '@/lib/avisos';

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

/** A mídia que veio na mensagem: o id para baixar, o tipo e o nome do documento. */
export function midiaDaMensagem(m: Record<string, unknown>) {
  const tipo = String(m.type || '');
  if (!['image', 'video', 'audio', 'document'].includes(tipo)) return null;
  const o = m[tipo] as { id?: string; mime_type?: string; filename?: string } | undefined;
  if (!o?.id) return null;
  return { id: o.id, mime: mimeLimpo(o.mime_type || 'application/octet-stream'), nome: o.filename || '' };
}

/* Baixa da Meta e guarda no Storage, dentro da pasta da conversa. A mensagem já está
   na tela com o tipo; o arquivo aparece quando chega. Falhou: a mensagem diz que não
   veio, e a gestão vê na Saúde do sistema. */
async function guardaMidia(conversaId: string, msg: DocumentReference, midia: { id: string; mime: string; nome: string }) {
  try {
    const baixado = await baixaMidia(midia.id);
    if (!baixado) throw new Error('a Meta não entregou o arquivo');
    const caminho = caminhoDaMidia(conversaId, msg.id, midia.mime, midia.nome);
    await adminArquivos().bucket().file(caminho).save(baixado.bytes, {
      contentType: mimeLimpo(baixado.mime) || midia.mime, resumable: false,
    });
    await msg.update({ midiaPath: caminho });
  } catch (e) {
    await msg.update({ midiaFalhou: true }).catch(() => undefined);
    await falhou('midia', descreveErro(e));
  }
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
    /* conversa nova: a primeira mensagem ao vivo começa o atendimento automático */
    etapa: 'inicio',
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

/** Mensagem que o contato mandou. O histórico antigo que vem do celular na coexistência
    entra com origem 'historico' e nunca dispara o atendimento automático. */
export async function recebeDoContato(
  ctx: Contexto,
  m: Record<string, unknown>,
  contatos: { wa_id?: string; profile?: { name?: string } }[],
  origem: 'ao_vivo' | 'historico' = 'ao_vivo',
) {
  const waId = String(m.from || '');
  if (!waId) return;
  const perfil = contatos.find((c) => c.wa_id === waId);
  const ref = await garanteConversa(ctx, waId, perfil?.profile?.name || '');
  const quando = emIso(m.timestamp as string | undefined);
  const tipo = String(m.type || 'text');
  const texto = textoDaMensagem(m);
  const midia = midiaDaMensagem(m);

  const msg = await ctx.bd.collection('mensagens').add({
    conversaId: ref.id,
    direcao: 'entrada',
    autor: 'cliente',
    texto,
    tipoBruto: tipo,
    ...(midia ? { midiaMime: midia.mime, ...(midia.nome ? { midiaNome: midia.nome } : {}) } : {}),
    waMessageId: String(m.id || ''),
    criadaEm: quando,
  });

  const conversa = await ref.get();
  const naoLidas = Number((conversa.data()?.naoLidas as number) || 0);
  await ref.update({
    ultimaEm: quando,
    ultimaPreviaTexto: midia ? previaDaMidia(midia.mime, midia.nome, texto) : texto || tipo,
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

  /* o atendimento automático responde só a quem está escrevendo agora */
  if (origem === 'ao_vivo' && !naoViraFala(tipo)) {
    try {
      await atendeAoVivo(ctx.bd, ref, (conversa.data() || {}) as Partial<Conversa>, m, texto, quando, janelaDe(quando));
    } catch (e) {
      console.error('[automatico]', ref.id, e);
    }
  }
  /* o aviso no celular de quem é do setor, quando a conversa está com gente (depois do
     atendimento automático, que pode ter mandado a conversa para a Recepção agora) */
  if (origem === 'ao_vivo' && !naoViraFala(tipo)) await avisaEquipe(ctx.bd, ref.id);
  /* por último: o arquivo pode demorar uns segundos, e a conversa não espera por ele */
  if (midia) await guardaMidia(ref.id, msg, midia);
  return ref;
}

/** Eco de coexistencia: o que a recepção mandou pelo celular aparece aqui. */
export async function recebeEcoDoCelular(
  ctx: Contexto, m: Record<string, unknown>, origem: 'ao_vivo' | 'historico' = 'ao_vivo',
) {
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
  /* alguem do time ja respondeu pelo celular: o atendimento automático nao interrompe,
     e o relógio do follow-up conta desta fala */
  await ref.update({
    ultimaEm: quando, ultimaPreviaTexto: texto, agenteAtivo: false, naoLidas: 0,
    /* histórico antigo não liga relógio: senão a conversa de meses atrás seria encerrada */
    ...(origem === 'ao_vivo' ? camposDaFalaDaEscola(quando) : {}),
  });
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
