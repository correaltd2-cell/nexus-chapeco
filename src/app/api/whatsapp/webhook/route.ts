/* A porta por onde a Meta fala com o sistema.
   Esta rota NAO pede login: a Meta chama sem autenticacao. A trava é a assinatura
   do corpo com o segredo do aplicativo, conferida abaixo.
   Responde 200 na hora e processa depois, senao a Meta reenvia a mesma mensagem. */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { waitUntil } from '@vercel/functions';
import { adminBd } from '@/lib/firebase/admin';
import { marcaLida } from '@/lib/whatsapp/cloud';
import { bate, descreveErro, falhou } from '@/lib/saude';
import {
  garanteConversa, naoViraFala, processaStatus, recebeDoContato, recebeEcoDoCelular,
  sincronizaContatos, type Contexto,
} from '@/lib/whatsapp/recebimento';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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
    history?: { metadata?: unknown; threads?: { messages?: Record<string, unknown>[] }[] }[];
  };
}

export async function POST(req: Request) {
  const bruto = await req.text();
  if (!assinaturaConfere(bruto, req.headers.get('x-hub-signature-256'))) {
    /* Só vira alarme quando parece mesmo a Meta: com assinatura e corpo de conta do
       WhatsApp. Aí o segredo daqui está errado e NENHUMA mensagem entra. Robô
       qualquer batendo na porta só leva o 401. */
    if (req.headers.get('x-hub-signature-256') && bruto.includes('whatsapp_business_account')) {
      await falhou('assinatura', 'A Meta chamou o webhook e a assinatura não conferiu com o META_APP_SECRET.');
    }
    return new NextResponse('assinatura inválida', { status: 401 });
  }

  let corpo: { entry?: { changes?: Mudanca[] }[] };
  try { corpo = JSON.parse(bruto); } catch { return NextResponse.json({ ok: true }); }

  /* responde 200 agora e trabalha depois: a Meta reenvia se demorar */
  waitUntil(processa(corpo).catch((e) => falhou('webhook', descreveErro(e))));
  return NextResponse.json({ ok: true });
}

/** Uma mensagem que quebra não leva junto as outras do mesmo lote. */
async function protegido(trabalho: () => Promise<unknown>) {
  try {
    await trabalho();
    return true;
  } catch (e) {
    await falhou('webhook', descreveErro(e));
    return false;
  }
}

async function processa(corpo: { entry?: { changes?: Mudanca[] }[] }) {
  const ctx: Contexto = { bd: adminBd() };
  let entrou = false;

  for (const entrada of corpo.entry || []) {
    for (const mudanca of entrada.changes || []) {
      const campo = mudanca.field || '';
      const v = mudanca.value || {};

      /* mensagens que o contato mandou, e o estado das que a gente mandou */
      if (campo === 'messages') {
        for (const m of v.messages || []) {
          const feito = await protegido(async () => {
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
          });
          if (feito) entrou = true;
          if (m.id) void marcaLida(String(m.id));
        }
        for (const s of v.statuses || []) await protegido(() => processaStatus(ctx, s));
      }

      /* coexistencia: o que a recepção mandou pelo celular */
      if (campo === 'smb_message_echoes' || campo === 'message_echoes') {
        for (const m of v.message_echoes || []) await protegido(() => recebeEcoDoCelular(ctx, m));
      }

      /* coexistencia: a agenda de contatos do celular, uma vez so */
      if (campo === 'smb_app_state_sync') {
        const n = await sincronizaContatos(ctx, v.contacts || []);
        await ctx.bd.doc('config/whatsapp').set(
          { contatosSincronizados: n, contatosSincronizadosEm: new Date().toISOString() },
          { merge: true },
        );
      }

      /* coexistencia: ate 180 dias de conversa antiga, em lotes grandes */
      if (campo === 'history') {
        for (const pedaco of v.history || []) {
          for (const thread of pedaco.threads || []) {
            for (const m of thread.messages || []) {
              if (m.from) await recebeDoContato(ctx, m, [], 'historico');
              else if (m.to) await recebeEcoDoCelular(ctx, m, 'historico');
            }
          }
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

  /* a Meta alcançou o sistema; e se entrou fala de contato, o caminho inteiro está de pé */
  await (entrou ? bate('webhookEm', 'entradaEm') : bate('webhookEm'));
}
