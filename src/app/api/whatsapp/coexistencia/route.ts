/* Conectar o número da recepção por coexistência: o mesmo número segue no WhatsApp
   Business do celular E passa a chegar no sistema.

   O navegador abre o Embedded Signup da Meta (app da Firma Moderna, que é Tech
   Provider) e manda para cá o código e a conta. Aqui, com o segredo do app:
   1. troca o código pelo token da conta do WhatsApp da escola
   2. confere o número (tem que estar no app do celular: is_on_biz_app)
   3. aponta o webhook DESTA conta para este sistema (override_callback_uri), sem
      mexer no endereço que o app usa para os outros clientes
   4. guarda o token em segredos/whatsapp, que só o servidor lê
   5. pede a agenda de contatos e o histórico do celular (uma vez, até 24 horas
      depois de conectar)
   Cada passo volta para a tela com o que a Meta respondeu, para dar para consertar.
   Nenhum segredo sai daqui. */
import { NextResponse } from 'next/server';
import { adminBd, quemChamou } from '@/lib/firebase/admin';
import { credencial, esqueceCredencial } from '@/lib/whatsapp/credencial';

export const dynamic = 'force-dynamic';

const VERSAO = 'v23.0';
const BASE = `https://graph.facebook.com/${VERSAO}`;

const app = () => ({
  id: process.env.META_APP_ID || '',
  configId: process.env.WHATSAPP_CONFIG_ID || '',
  segredo: process.env.META_APP_SECRET || '',
  verify: process.env.WHATSAPP_VERIFY_TOKEN || '',
});

function faltando() {
  const a = app();
  return [
    ['META_APP_ID', a.id], ['WHATSAPP_CONFIG_ID', a.configId],
    ['META_APP_SECRET', a.segredo], ['WHATSAPP_VERIFY_TOKEN', a.verify],
  ].filter(([, v]) => !v).map(([k]) => k);
}

/** O endereço público do sistema: o de produção, mesmo se a tela foi aberta numa prévia. */
function enderecoDoSistema(req: Request) {
  const prod = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  return prod ? `https://${prod}` : new URL(req.url).origin;
}

interface Passo { nome: string; ok: boolean; detalhe: string }

async function graph(caminho: string, token: string, init?: RequestInit) {
  try {
    const r = await fetch(`${BASE}/${caminho}`, {
      ...init,
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', ...(init?.headers || {}) },
      cache: 'no-store',
    });
    const corpo = (await r.json().catch(() => ({}))) as Record<string, unknown>;
    const e = corpo.error as { message?: string; code?: number; error_user_msg?: string } | undefined;
    return { ok: r.ok && !e, corpo, erro: e?.error_user_msg || e?.message || (r.ok ? '' : `HTTP ${r.status}`), codigo: e?.code };
  } catch {
    return { ok: false, corpo: {} as Record<string, unknown>, erro: 'Não consegui falar com a Meta.', codigo: undefined };
  }
}

/** Pede à Meta a agenda de contatos ou o histórico do celular. Só vale uma vez, e só
    até 24 horas depois de conectar. O resultado chega depois, pelo webhook. */
async function pedeSincronizacao(numeroId: string, token: string, tipo: 'contatos' | 'historico') {
  const r = await graph(`${numeroId}/smb_app_data`, token, {
    method: 'POST',
    body: JSON.stringify({ messaging_product: 'whatsapp', sync_type: tipo === 'contatos' ? 'smb_app_state_sync' : 'history' }),
  });
  const agora = new Date().toISOString();
  const status = r.ok
    ? { status: 'PEDIDO', em: agora, pedidoId: String((r.corpo.request_id as string) || '') }
    : { status: 'ERRO', em: agora, erro: r.erro, codigo: r.codigo ?? null };
  await adminBd().doc('config/whatsapp').set({ [tipo === 'contatos' ? 'contatosSync' : 'historicoSync']: status }, { merge: true });
  return r;
}

/** Aponta o webhook desta conta para este sistema. A Meta chama o endereço com o
    desafio antes de aceitar, então o WHATSAPP_VERIFY_TOKEN tem que estar no ar. */
async function apontaWebhook(wabaId: string, token: string, endereco: string): Promise<Passo> {
  const url = `${endereco}/api/whatsapp/webhook`;
  const r = await graph(`${wabaId}/subscribed_apps`, token, {
    method: 'POST',
    body: JSON.stringify({ override_callback_uri: url, verify_token: app().verify }),
  });
  if (r.ok) {
    await adminBd().doc('config/whatsapp').set({ webhookDaConta: url }, { merge: true });
    return { nome: 'Mensagens desta conta chegam no sistema', ok: true, detalhe: url };
  }
  /* sem o endereço próprio, ao menos assina: as mensagens iriam para o endereço do app */
  const simples = await graph(`${wabaId}/subscribed_apps`, token, { method: 'POST' });
  return {
    nome: 'Mensagens desta conta chegam no sistema',
    ok: false,
    detalhe: `A Meta não aceitou o endereço próprio: ${r.erro}.${simples.ok ? ' O app ficou assinado, mas as mensagens iriam para o endereço padrão do app.' : ''} Confira se o WHATSAPP_VERIFY_TOKEN está publicado e toque em "Refazer o webhook".`,
  };
}

async function gestao(req: Request) {
  const quem = await quemChamou(req);
  if (!quem) return { erro: NextResponse.json({ ok: false, erro: 'Faça login de novo.' }, { status: 401 }) };
  if (quem.papel !== 'admin' && quem.papel !== 'gestor') {
    return { erro: NextResponse.json({ ok: false, erro: 'Só a administração conecta o WhatsApp.' }, { status: 403 }) };
  }
  return { quem };
}

export async function GET(req: Request) {
  const g = await gestao(req);
  if (g.erro) return g.erro;
  const conexao = (await adminBd().doc('config/whatsapp').get()).data() || null;
  const c = await credencial();
  return NextResponse.json({
    ok: true,
    appId: app().id, configId: app().configId,
    falta: faltando(),
    porVariaveis: c?.origem === 'ambiente',
    conexao,
  });
}

export async function POST(req: Request) {
  const g = await gestao(req);
  if (g.erro) return g.erro;
  const corpo = (await req.json().catch(() => ({}))) as {
    acao?: string; code?: string; wabaId?: string; numeroId?: string; tipo?: 'contatos' | 'historico';
  };
  const bd = adminBd();

  if (corpo.acao === 'sincronizar' || corpo.acao === 'webhook') {
    const c = await credencial();
    if (!c) return NextResponse.json({ ok: false, erro: 'O WhatsApp ainda não está conectado.' });
    if (corpo.acao === 'webhook') {
      if (!c.wabaId) return NextResponse.json({ ok: false, erro: 'Falta o id da conta do WhatsApp.' });
      const p = await apontaWebhook(c.wabaId, c.token, enderecoDoSistema(req));
      return NextResponse.json(p.ok ? { ok: true } : { ok: false, erro: p.detalhe });
    }
    const tipo = corpo.tipo === 'contatos' ? 'contatos' : 'historico';
    const r = await pedeSincronizacao(c.numeroId, c.token, tipo);
    return NextResponse.json(r.ok ? { ok: true } : { ok: false, erro: r.erro });
  }

  if (corpo.acao !== 'conectar') return NextResponse.json({ ok: false, erro: 'Não entendi o que fazer.' }, { status: 400 });
  if (faltando().length) {
    return NextResponse.json({ ok: false, erro: `Faltam variáveis na Vercel: ${faltando().join(', ')}.` });
  }
  if (!corpo.code) return NextResponse.json({ ok: false, erro: 'A Meta não devolveu o código. Tente conectar de novo.' });

  const a = app();
  const passos: Passo[] = [];

  /* 1. código → token da conta da escola */
  const troca = await fetch(
    `${BASE}/oauth/access_token?client_id=${encodeURIComponent(a.id)}&client_secret=${encodeURIComponent(a.segredo)}&code=${encodeURIComponent(corpo.code)}`,
    { cache: 'no-store' },
  ).then((r) => r.json()).catch(() => ({})) as { access_token?: string; error?: { message?: string } };
  if (!troca.access_token) {
    return NextResponse.json({
      ok: false,
      erro: `A Meta não trocou o código pelo token: ${troca.error?.message || 'sem resposta'}. O código vale poucos minutos; conecte de novo.`,
    });
  }
  const token = troca.access_token;
  passos.push({ nome: 'Token da conta da escola', ok: true, detalhe: 'Guardado só no servidor.' });

  /* 2. qual conta e qual número. Se a janela não mandou a conta, o token diz qual é */
  let wabaId = corpo.wabaId || '';
  if (!wabaId) {
    const d = await graph(`debug_token?input_token=${encodeURIComponent(token)}`, `${a.id}|${a.segredo}`);
    const escopos = ((d.corpo.data as { granular_scopes?: { scope: string; target_ids?: string[] }[] } | undefined)?.granular_scopes) || [];
    wabaId = escopos.find((e) => e.scope === 'whatsapp_business_management')?.target_ids?.[0] || '';
  }
  if (!wabaId) return NextResponse.json({ ok: false, erro: 'Não descobri qual conta do WhatsApp foi conectada. Tente de novo.', passos });

  let numeroId = corpo.numeroId || '';
  if (!numeroId) {
    const n = await graph(`${wabaId}/phone_numbers?fields=id,display_phone_number`, token);
    numeroId = String(((n.corpo.data as { id?: string }[] | undefined) || [])[0]?.id || '');
  }
  if (!numeroId) return NextResponse.json({ ok: false, erro: 'A conta conectada não tem número. Confira no Gerenciador do WhatsApp.', passos });

  const info = await graph(`${numeroId}?fields=display_phone_number,verified_name,platform_type,is_on_biz_app`, token);
  const d = info.corpo as { display_phone_number?: string; verified_name?: string; platform_type?: string; is_on_biz_app?: boolean };
  const coexistencia = d.is_on_biz_app === true;
  passos.push({
    nome: `Número ${d.display_phone_number || numeroId}`,
    ok: info.ok && coexistencia,
    detalhe: !info.ok ? `A Meta não mostrou o número: ${info.erro}.`
      : coexistencia ? `${d.verified_name || ''}, no app do celular e na nuvem (${d.platform_type || 'sem tipo'}).`
        : 'A Meta diz que este número NÃO está no app do celular: a coexistência não pegou. Conecte de novo escolhendo "conectar o app do WhatsApp Business".',
  });

  /* 3. o webhook desta conta aponta para cá */
  passos.push(await apontaWebhook(wabaId, token, enderecoDoSistema(req)));

  /* 4. guarda: o token só no servidor, o resto à vista da equipe */
  const agora = new Date().toISOString();
  await bd.doc('segredos/whatsapp').set({ token, numeroId, wabaId, conectadoEm: agora });
  await bd.doc('config/whatsapp').set({
    numeroId, wabaId, numero: d.display_phone_number || '', nome: d.verified_name || '',
    plataforma: d.platform_type || '', coexistencia, conectadoEm: agora, conectadoPor: g.quem?.nome || '',
  }, { merge: true });
  esqueceCredencial();

  /* 5. contatos e histórico do celular: a Meta manda depois, pelo webhook */
  if (coexistencia) {
    const contatos = await pedeSincronizacao(numeroId, token, 'contatos');
    passos.push({ nome: 'Agenda de contatos do celular', ok: contatos.ok, detalhe: contatos.ok ? 'Pedida. Chega em alguns minutos.' : contatos.erro });
    const historico = await pedeSincronizacao(numeroId, token, 'historico');
    passos.push({ nome: 'Histórico de conversas do celular', ok: historico.ok, detalhe: historico.ok ? 'Pedido. Chega em lotes, nos próximos minutos.' : historico.erro });
  }

  return NextResponse.json({ ok: true, passos });
}
