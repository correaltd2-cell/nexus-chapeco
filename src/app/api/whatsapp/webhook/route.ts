/* A porta por onde a Meta fala com o sistema.
   Esta rota NAO pede login: a Meta chama sem autenticacao. A trava é a assinatura
   do corpo com o segredo do aplicativo, conferida abaixo.
   Responde 200 na hora e processa depois, senao a Meta reenvia a mesma mensagem. */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { waitUntil } from '@vercel/functions';
import { FieldValue } from 'firebase-admin/firestore';
import { adminBd } from '@/lib/firebase/admin';
import { marcaLida } from '@/lib/whatsapp/cloud';
import {
  garanteConversa, naoViraFala, processaStatus, recebeContatosDoCelular, recebeDoContato,
  recebeEcoDoCelular, recebeHistorico, type Contexto,
} from '@/lib/whatsapp/recebimento';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
/* o histórico da coexistência chega em lotes grandes logo depois da conexão */
export const maxDuration = 300;

/* ---------- a Meta conferindo que a porta é nossa ---------- */
export function GET(req: Request) {
  const u = new URL(req.url);
  const modo = u.searchParams.get('hub.mode');
  const token = u.searchParams.get('hub.verify_token');
  const desafio = u.searchParams.get('hub.challenge');
  const esperado = process.env.WHATSAPP_VERIFY_TOKEN;
  if (modo === 'subscribe' && esperado && token === esperado) {
    return new NextResponse(desafio || '', { status: 200 });
  }
  return new NextResponse('token de verificação não confere', { status: 403 });
}

/** A Meta assina o corpo com o segredo do aplicativo. Sem assinatura válida, não entra. */
function assinaturaConfere(corpo: string, cabecalho: string | null) {
  const segredo = process.env.META_APP_SECRET;
  if (!segredo) return true; /* sem segredo configurado ainda, deixa passar para o teste local */
  if (!cabecalho?.startsWith('sha256=')) return false;
  const meu = createHmac('sha256', segredo).update(corpo).digest('hex');
  const dele = cabecalho.slice(7);
  if (meu.length !== dele.length) return false;
  return timingSafeEqual(Buffer.from(meu), Buffer.from(dele));
}

interface Mudanca {
  field?: string;
  value?: {
    messages?: Record<string, unknown>[];
    statuses?: Record<string, unknown>[];
    message_echoes?: Record<string, unknown>[];
    contacts?: { wa_id?: string; profile?: { name?: string } }[];
    state_sync?: { type?: string; action?: string; contact?: { full_name?: string; first_name?: string; phone_number?: string } }[];
    history?: {
      metadata?: { phase?: number; chunk_order?: number; progress?: number };
      threads?: { id?: string; messages?: Record<string, unknown>[] }[];
      errors?: { code?: number; title?: string; message?: string; error_data?: { details?: string } }[];
    }[];
  };
}

export async function POST(req: Request) {
  const bruto = await req.text();
  if (!assinaturaConfere(bruto, req.headers.get('x-hub-signature-256'))) {
    return new NextResponse('assinatura inválida', { status: 401 });
  }

  let corpo: { entry?: { changes?: Mudanca[] }[] };
  try { corpo = JSON.parse(bruto); } catch { return NextResponse.json({ ok: true }); }

  /* responde 200 agora e trabalha depois: a Meta reenvia se demorar */
  waitUntil(processa(corpo).catch((e) => console.error('[webhook]', e)));
  return NextResponse.json({ ok: true });
}

async function processa(corpo: { entry?: { changes?: Mudanca[] }[] }) {
  const ctx: Contexto = { bd: adminBd() };

  for (const entrada of corpo.entry || []) {
    for (const mudanca of entrada.changes || []) {
      const campo = mudanca.field || '';
      const v = mudanca.value || {};

      /* mensagens que o contato mandou, e o estado das que a gente mandou */
      if (campo === 'messages') {
        for (const m of v.messages || []) {
          const tipo = String(m.type || '');
          const ref = naoViraFala(tipo)
            ? await garanteConversa(ctx, String(m.from || ''), '')
            : await recebeDoContato(ctx, m, v.contacts || []);
          if (naoViraFala(tipo) && ref) {
            /* reação, figurinha e formato não suportado entram no histórico sem virar fala */
            await ctx.bd.collection('mensagens').add({
              conversaId: ref.id,
              direcao: 'entrada',
              autor: 'cliente',
              texto: tipo === 'reaction' ? 'reagiu a uma mensagem'
                : tipo === 'sticker' ? 'figurinha'
                : 'mensagem que o WhatsApp não mostra ao sistema',
              tipoBruto: tipo,
              waMessageId: String(m.id || ''),
              criadaEm: new Date().toISOString(),
            });
          }
          if (m.id) void marcaLida(String(m.id));
        }
        for (const s of v.statuses || []) await processaStatus(ctx, s);
      }

      /* coexistencia: o que a recepção mandou pelo celular */
      if (campo === 'smb_message_echoes' || campo === 'message_echoes') {
        for (const m of v.message_echoes || []) await recebeEcoDoCelular(ctx, m);
      }

      /* coexistencia: a agenda de contatos do celular, uma vez por conexão */
      if (campo === 'smb_app_state_sync') {
        const n = await recebeContatosDoCelular(ctx, v.state_sync || [], v.contacts || []);
        await ctx.bd.doc('config/whatsapp').set({
          contatosSincronizados: FieldValue.increment(n),
          contatosSync: { status: 'RECEBIDO', em: new Date().toISOString() },
        }, { merge: true });
      }

      /* coexistencia: ate 180 dias de conversa antiga, em lotes. Mensagem velha não
         passa pela triagem nem dispara nada: só entra no registro. */
      if (campo === 'history') {
        for (const pedaco of v.history || []) {
          const agora = new Date().toISOString();
          const erro = pedaco.errors?.[0];
          if (erro) {
            /* 2593109: a recepção desligou o compartilhamento do histórico no celular */
            await ctx.bd.doc('config/whatsapp').set({
              historicoSync: {
                status: 'ERRO', em: agora,
                erro: erro.error_data?.details || erro.title || erro.message || 'A Meta não mandou o histórico.',
                codigo: erro.code || null,
              },
            }, { merge: true });
            continue;
          }
          const n = await recebeHistorico(ctx, pedaco.threads || []);
          const progresso = Number(pedaco.metadata?.progress ?? 0);
          await ctx.bd.doc('config/whatsapp').set({
            historicoMensagens: FieldValue.increment(n),
            historicoSync: { status: progresso >= 100 ? 'COMPLETO' : 'RECEBENDO', progresso, em: agora },
          }, { merge: true });
        }
      }

      /* a Meta avisando que a conexão mudou (saiu um provedor, caiu a conta) */
      if (campo === 'account_update') {
        await ctx.bd.collection('eventos_whatsapp').add({
          tipo: 'account_update', dados: v, criadoEm: new Date().toISOString(),
        });
      }
    }
  }
}
