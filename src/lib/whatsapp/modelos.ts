/* Os modelos de mensagem na Meta: lê a lista da conta do WhatsApp, manda para aprovação
   o que a biblioteca da escola tem e a Meta não, e anota a situação de cada um em
   `templates` (aprovado, em análise, recusado e por quê).
   Quem chama é o cron de hora em hora (/api/cron/modelos) e o botão "Conferir com a
   Meta" em Configurações. As regras moram em src/lib/dominio/modelos.ts.
   Precisa do token com a permissão de gerenciar a conta (whatsapp_business_management). */
import 'server-only';
import type { Firestore } from 'firebase-admin/firestore';
import {
  estadoDaMeta, planoDaConferencia, pedidoParaMeta, situacaoDaBiblioteca,
  type CategoriaModelo, type ModeloDaEscola, type ModeloNaMeta, type SituacaoDoModelo,
} from '@/lib/dominio/modelos';
import { explicaRecusa } from './cloud';
import { falhou } from '@/lib/saude';

const BASE = 'https://graph.facebook.com/v23.0';
const CAMPOS = 'id,name,language,status,category,rejected_reason,components';

const token = () => process.env.WHATSAPP_TOKEN || '';
const conta = () => process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || '';
export const temConta = () => Boolean(token() && conta());

interface ErroDaMeta { message?: string; code?: number; error_subcode?: number; error_user_msg?: string }

async function graph(url: string, init?: RequestInit) {
  const r = await fetch(url, {
    ...init,
    headers: { authorization: `Bearer ${token()}`, 'content-type': 'application/json' },
    cache: 'no-store',
  });
  const corpo = (await r.json().catch(() => ({}))) as Record<string, unknown> & { error?: ErroDaMeta };
  return { ok: r.ok && !corpo.error, corpo, erro: corpo.error };
}

/** Explica o erro da Meta sem jargão. A permissão é o tropeço mais comum. */
function explica(e?: ErroDaMeta) {
  if (!e) return 'A Meta não respondeu.';
  if (e.code === 10 || e.code === 200) {
    return 'O token não tem permissão para cuidar dos modelos. Gere o token do usuário de sistema com whatsapp_business_management.';
  }
  if (e.code === 100 && /does not exist|Unsupported get request/i.test(e.message || '')) {
    return 'A WHATSAPP_BUSINESS_ACCOUNT_ID não é uma conta do WhatsApp que esse token enxerga.';
  }
  return e.error_user_msg || explicaRecusa(e.code, e.message);
}

/** Todos os modelos da conta, em todas as línguas. */
export async function listaDaMeta(): Promise<{ ok: true; modelos: ModeloNaMeta[] } | { ok: false; erro: string }> {
  const modelos: ModeloNaMeta[] = [];
  let url: string | undefined = `${BASE}/${conta()}/message_templates?fields=${CAMPOS}&limit=100`;
  for (let pagina = 0; url && pagina < 20; pagina += 1) {
    const r = await graph(url);
    if (!r.ok) return { ok: false, erro: explica(r.erro) };
    modelos.push(...((r.corpo.data as ModeloNaMeta[]) || []));
    url = (r.corpo.paging as { next?: string } | undefined)?.next;
  }
  return { ok: true, modelos };
}

async function criaNaMeta(m: ModeloDaEscola) {
  const r = await graph(`${BASE}/${conta()}/message_templates`, {
    method: 'POST',
    body: JSON.stringify(pedidoParaMeta(m)),
  });
  if (!r.ok) return { ok: false as const, erro: explica(r.erro) };
  const c = r.corpo as { id?: string; status?: string; category?: string };
  return { ok: true as const, id: c.id || '', status: c.status || 'PENDING', categoria: c.category as CategoriaModelo | undefined };
}

/* o Firestore do servidor recusa campo undefined */
const semVazios = (o: SituacaoDoModelo) =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));

export interface ResumoDaConferencia {
  ok: boolean;
  erro?: string;
  criados: number;
  recusadosNoPedido: string[];
  aprovados: number;
  emAnalise: number;
  recusados: number;
}

/**
 * Confere com a Meta e grava a situação. `criar` manda para aprovação o que falta;
 * `forcar` manda de novo os nomes pedidos, mesmo que já tenham sido apagados na Meta.
 */
export async function confereModelos(bd: Firestore, o: { criar: boolean; forcar?: string[] }): Promise<ResumoDaConferencia> {
  const vazio = { criados: 0, recusadosNoPedido: [], aprovados: 0, emAnalise: 0, recusados: 0 };
  if (!temConta()) return { ok: false, erro: 'O WhatsApp ainda não está conectado.', ...vazio };

  const lista = await listaDaMeta();
  if (!lista.ok) {
    await falhou('modelos', lista.erro);
    return { ok: false, erro: lista.erro, ...vazio };
  }

  const agora = new Date().toISOString();
  const salvos = (await bd.collection('templates').get()).docs
    .map((d) => ({ ...(d.data() as Partial<SituacaoDoModelo>), id: d.id }));
  const passos = planoDaConferencia({ naMeta: lista.modelos, salvos, agora, criar: o.criar, forcar: o.forcar });

  const gravar: SituacaoDoModelo[] = [];
  const recusadosNoPedido: string[] = [];
  let criados = 0;
  for (const p of passos) {
    if (p.tipo === 'gravar') { gravar.push(p.situacao); continue; }
    /* um por vez: a Meta limita quantos modelos se cria por hora */
    const r = await criaNaMeta(p.modelo);
    if (r.ok) {
      criados += 1;
      gravar.push({
        ...situacaoDaBiblioteca(p.modelo, estadoDaMeta(r.status), agora),
        metaId: r.id, pedidoEm: agora, ...(r.categoria ? { categoria: r.categoria } : {}),
      });
    } else {
      recusadosNoPedido.push(`${p.modelo.titulo}: ${r.erro}`);
      gravar.push({ ...situacaoDaBiblioteca(p.modelo, 'nao_enviado', agora), pedidoEm: agora, falha: r.erro, falhaEm: agora });
    }
  }

  for (let i = 0; i < gravar.length; i += 400) {
    const lote = bd.batch();
    for (const s of gravar.slice(i, i + 400)) lote.set(bd.doc(`templates/${s.id}`), semVazios(s));
    await lote.commit();
  }
  if (recusadosNoPedido.length) {
    await falhou('modelos', `A Meta não aceitou ${recusadosNoPedido.length} modelo(s). ${recusadosNoPedido[0]}`);
  }

  const quantos = (e: SituacaoDoModelo['estado']) => gravar.filter((s) => s.daBiblioteca && s.estado === e).length;
  return {
    ok: true, criados, recusadosNoPedido,
    aprovados: quantos('aprovado'), emAnalise: quantos('em_analise'), recusados: quantos('recusado'),
  };
}

/** A situação de um modelo, para o envio conferir antes de mandar. */
export async function leModelo(bd: Firestore, id: string) {
  if (!/^[\w-]+$/.test(id)) return null;
  const d = await bd.doc(`templates/${id}`).get();
  return d.exists ? ({ ...(d.data() as SituacaoDoModelo), id: d.id }) : null;
}
