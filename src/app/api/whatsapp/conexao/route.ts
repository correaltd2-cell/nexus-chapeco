/* Conferir a conexão do WhatsApp sem abrir o Gerenciador da Meta.
   Ligar a Cloud API é meia dúzia de passos em três lugares (Meta, variáveis da Vercel,
   webhook) e, quando falha, de fora tudo parece igual: o número simplesmente não recebe.
   Cada conferência aqui diz o que está errado E como consertar.

   NENHUM segredo sai daqui: a rota só responde se a chave EXISTE no ambiente. */
import { NextResponse } from 'next/server';
import { adminBd, quemChamou } from '@/lib/firebase/admin';
import { credencial, type Credencial } from '@/lib/whatsapp/credencial';

export const dynamic = 'force-dynamic';

const VERSAO = 'v23.0';
const BASE = `https://graph.facebook.com/${VERSAO}`;

export interface Conferencia {
  chave: string;
  titulo: string;
  estado: 'ok' | 'falta' | 'erro' | 'aviso';
  detalhe: string;
  conserto?: string;
}

/* a credencial vem das variáveis da Vercel ou da conexão por coexistência */
let c: Credencial | null = null;
const token = () => c?.token || '';
const numeroId = () => c?.numeroId || '';
const wabaId = () => c?.wabaId || '';

async function graph(caminho: string, init?: RequestInit) {
  const r = await fetch(`${BASE}/${caminho}`, {
    ...init,
    headers: { authorization: `Bearer ${token()}`, 'content-type': 'application/json', ...(init?.headers || {}) },
    cache: 'no-store',
  });
  const corpo = (await r.json().catch(() => ({}))) as Record<string, unknown>;
  const falha = corpo.error as { message?: string; code?: number } | undefined;
  return { ok: r.ok && !falha, corpo, erro: falha?.message || '', codigo: falha?.code };
}

function confereChaves(): Conferencia {
  const faltando = (['META_APP_ID', 'WHATSAPP_CONFIG_ID', 'META_APP_SECRET', 'WHATSAPP_VERIFY_TOKEN'] as const)
    .filter((k) => !process.env[k]);
  if (faltando.length) {
    return {
      chave: 'chaves', titulo: 'Falta chave no ambiente', estado: 'falta',
      detalhe: `Não encontrei: ${faltando.join(', ')}.`,
      conserto: 'Preencha na Vercel, em Settings → Environment Variables, e publique de novo.',
    };
  }
  if (!c) {
    return {
      chave: 'chaves', titulo: 'As chaves do app estão no ar, mas o número não foi conectado', estado: 'falta',
      detalhe: 'Falta conectar o WhatsApp da recepção.',
      conserto: 'Toque em "Conectar o WhatsApp da recepção" logo acima.',
    };
  }
  return {
    chave: 'chaves', titulo: 'Chaves do app e token do número no lugar', estado: 'ok',
    detalhe: c.origem === 'coexistencia' ? 'O token veio da conexão por coexistência e fica só no servidor.' : 'O token vem das variáveis da Vercel.',
  };
}

async function confereNumero(): Promise<Conferencia> {
  if (!token() || !numeroId()) {
    return { chave: 'numero', titulo: 'Número', estado: 'falta', detalhe: 'Sem token ou sem o id do número, não dá para perguntar à Meta.' };
  }
  const r = await graph(`${numeroId()}?fields=display_phone_number,verified_name,quality_rating,platform_type,is_on_biz_app`);
  if (!r.ok) {
    return {
      chave: 'numero', titulo: 'A Meta não respondeu pelo número', estado: 'erro',
      detalhe: r.erro || 'Erro desconhecido.',
      conserto: r.codigo === 190
        ? 'O token expirou ou foi revogado. Gere outro pelo usuário de sistema, com controle total da conta do WhatsApp.'
        : 'Confira se o id do número é o da conta onde o app está instalado.',
    };
  }
  const d = r.corpo as Record<string, string | boolean>;
  const nuvem = d.platform_type === 'CLOUD_API';
  const noCelular = d.is_on_biz_app === true;
  return {
    chave: 'numero',
    titulo: `${d.verified_name || 'Número'}: ${d.display_phone_number || ''}`,
    estado: nuvem && noCelular ? 'ok' : 'aviso',
    detalhe: `Qualidade ${d.quality_rating || 'sem leitura'}, hospedagem ${d.platform_type || 'desconhecida'}, ${noCelular ? 'também no app do celular (coexistência)' : 'fora do app do celular'}.`,
    conserto: !nuvem
      ? 'A coexistência só funciona com o número hospedado na nuvem da Meta (CLOUD_API).'
      : noCelular ? undefined
        : 'Para a Meta este número não está no WhatsApp Business do celular: as mensagens que a recepção mandar pelo celular não aparecem aqui. Conecte pelo botão de coexistência.',
  };
}

async function confereAssinatura(): Promise<Conferencia> {
  if (!token() || !wabaId()) {
    return { chave: 'assinatura', titulo: 'Aplicativos que recebem as mensagens', estado: 'falta', detalhe: 'Sem token ou sem o id da conta do WhatsApp.' };
  }
  const r = await graph(`${wabaId()}/subscribed_apps`);
  if (!r.ok) {
    return { chave: 'assinatura', titulo: 'Não consegui ler os aplicativos assinados', estado: 'erro', detalhe: r.erro };
  }
  const lista = (r.corpo.data as { whatsapp_business_api_data?: { name?: string } }[] | undefined) || [];
  const nomes = lista.map((a) => a.whatsapp_business_api_data?.name || 'sem nome');
  if (!nomes.length) {
    return {
      chave: 'assinatura', titulo: 'Nenhum aplicativo está recebendo as mensagens', estado: 'falta',
      detalhe: 'A conta existe, mas nada está assinado nela.',
      conserto: 'Toque em "Assinar agora" aqui embaixo. Assinar ADICIONA: nenhum provedor que já esteja lá é removido.',
    };
  }
  return {
    chave: 'assinatura', titulo: 'Recebendo as mensagens desta conta', estado: 'ok',
    detalhe: nomes.join(', '),
  };
}

async function confereWebhook(origem: string): Promise<Conferencia> {
  const verify = process.env.WHATSAPP_VERIFY_TOKEN;
  if (!verify) {
    return { chave: 'webhook', titulo: 'Webhook', estado: 'falta', detalhe: 'Sem WHATSAPP_VERIFY_TOKEN não dá para testar.' };
  }
  const desafio = `teste${Date.now()}`;
  const url = `${origem}/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=${encodeURIComponent(verify)}&hub.challenge=${desafio}`;
  try {
    const r = await fetch(url, { cache: 'no-store' });
    const texto = (await r.text()).trim();
    if (r.ok && texto === desafio) {
      return { chave: 'webhook', titulo: 'O webhook responde como a Meta espera', estado: 'ok', detalhe: 'Chamei a própria rota com o desafio de verificação e ela devolveu igual.' };
    }
    if (r.status === 403) {
      return {
        chave: 'webhook', titulo: 'O webhook recusou o desafio', estado: 'erro',
        detalhe: 'Respondeu 403.',
        conserto: 'O WHATSAPP_VERIFY_TOKEN daqui não é o mesmo que está escrito na Meta, em Configuração do webhook.',
      };
    }
    return { chave: 'webhook', titulo: 'O webhook respondeu diferente do esperado', estado: 'erro', detalhe: `Status ${r.status}.` };
  } catch {
    return { chave: 'webhook', titulo: 'Não consegui chamar o webhook', estado: 'erro', detalhe: 'A rota não respondeu.' };
  }
}

async function confereMensagens(): Promise<Conferencia> {
  const desde = new Date(Date.now() - 7 * 864e5).toISOString();
  try {
    const achadas = await adminBd().collection('mensagens')
      .where('direcao', '==', 'entrada').where('criadaEm', '>=', desde)
      .limit(1).get();
    if (achadas.empty) {
      return {
        chave: 'mensagens', titulo: 'Nenhuma mensagem de contato nos últimos 7 dias', estado: 'aviso',
        detalhe: 'Pode ser só silêncio, ou o webhook não estar chegando aqui.',
        conserto: 'Mande um "oi" de outro celular para o número da escola e recarregue esta tela.',
      };
    }
    return { chave: 'mensagens', titulo: 'Chegou mensagem de contato nos últimos 7 dias', estado: 'ok', detalhe: 'O caminho Meta → webhook → banco está de pé.' };
  } catch {
    return { chave: 'mensagens', titulo: 'Não consegui ler as mensagens', estado: 'erro', detalhe: 'O banco não respondeu.' };
  }
}

export async function GET(req: Request) {
  const quem = await quemChamou(req);
  if (!quem) return NextResponse.json({ ok: false, erro: 'Faça login de novo.' }, { status: 401 });
  if (quem.papel !== 'admin' && quem.papel !== 'gestor') {
    return NextResponse.json({ ok: false, erro: 'Só a administração confere a conexão.' }, { status: 403 });
  }
  const origem = new URL(req.url).origin;
  c = await credencial();
  const chaves = confereChaves();
  const [numero, assinatura, webhook, mensagens] = await Promise.all([
    confereNumero(), confereAssinatura(), confereWebhook(origem), confereMensagens(),
  ]);
  return NextResponse.json({ ok: true, conferencias: [chaves, numero, assinatura, webhook, mensagens] });
}

export async function POST(req: Request) {
  const quem = await quemChamou(req);
  if (!quem) return NextResponse.json({ ok: false, erro: 'Faça login de novo.' }, { status: 401 });
  if (quem.papel !== 'admin' && quem.papel !== 'gestor') {
    return NextResponse.json({ ok: false, erro: 'Só a administração mexe na conexão.' }, { status: 403 });
  }
  const { acao, para } = (await req.json()) as { acao?: string; para?: string };
  c = await credencial();
  if (!c) return NextResponse.json({ ok: false, erro: 'O WhatsApp ainda não está conectado.' });

  if (acao === 'assinar') {
    const r = await graph(`${wabaId()}/subscribed_apps`, { method: 'POST' });
    return NextResponse.json(r.ok ? { ok: true } : { ok: false, erro: r.erro });
  }

  if (acao === 'teste') {
    const destino = (para || '').replace(/\D/g, '');
    if (destino.length < 12) {
      return NextResponse.json({ ok: false, erro: 'Escreva o número com país e DDD, assim: 5549991234567.' });
    }
    /* hello_world é o único modelo que sai sem a janela de 24 horas aberta */
    const r = await graph(`${numeroId()}/messages`, {
      method: 'POST',
      body: JSON.stringify({
        messaging_product: 'whatsapp', to: destino, type: 'template',
        template: { name: 'hello_world', language: { code: 'en_US' } },
      }),
    });
    return NextResponse.json(r.ok ? { ok: true } : { ok: false, erro: r.erro });
  }

  return NextResponse.json({ ok: false, erro: 'Não entendi o que fazer.' }, { status: 400 });
}
