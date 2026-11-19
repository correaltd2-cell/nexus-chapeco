/* Conferir a conexão do WhatsApp sem abrir o Gerenciador da Meta.
   Ligar a Cloud API é meia dúzia de passos em três lugares (Meta, variáveis da Vercel,
   webhook) e, quando falha, de fora tudo parece igual: o número simplesmente não recebe.
   Cada conferência aqui diz o que está errado E como consertar.

   NENHUM segredo sai daqui: a rota só responde se a chave EXISTE no ambiente. */
import { NextResponse } from 'next/server';
import { adminBd, quemChamou } from '@/lib/firebase/admin';

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

const token = () => process.env.WHATSAPP_TOKEN || '';
const numeroId = () => process.env.WHATSAPP_PHONE_NUMBER_ID || '';
const wabaId = () => process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || '';

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
  const faltando = (['WHATSAPP_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID', 'WHATSAPP_BUSINESS_ACCOUNT_ID',
    'WHATSAPP_VERIFY_TOKEN', 'META_APP_SECRET'] as const).filter((k) => !process.env[k]);
  if (!faltando.length) {
    return { chave: 'chaves', titulo: 'As cinco chaves estão no ambiente', estado: 'ok', detalhe: 'Token, número, conta, verify token e segredo do app.' };
  }
  return {
    chave: 'chaves',
    titulo: 'Falta chave no ambiente',
    estado: 'falta',
    detalhe: `Não encontrei: ${faltando.join(', ')}.`,
    conserto: 'Preencha na Vercel, em Settings → Environment Variables, e publique de novo.',
  };
}

async function confereNumero(): Promise<Conferencia> {
  if (!token() || !numeroId()) {
    return { chave: 'numero', titulo: 'Número', estado: 'falta', detalhe: 'Sem token ou sem o id do número, não dá para perguntar à Meta.' };
  }
  const r = await graph(`${numeroId()}?fields=display_phone_number,verified_name,quality_rating,platform_type,code_verification_status`);
  if (!r.ok) {
    return {
      chave: 'numero', titulo: 'A Meta não respondeu pelo número', estado: 'erro',
      detalhe: r.erro || 'Erro desconhecido.',
      conserto: r.codigo === 190
        ? 'O token expirou ou foi revogado. Gere outro pelo usuário de sistema, com controle total da conta do WhatsApp.'
        : 'Confira se o id do número é o da conta onde o app está instalado.',
    };
  }
  const d = r.corpo as Record<string, string>;
  const nuvem = d.platform_type === 'CLOUD_API';
  return {
    chave: 'numero',
    titulo: `${d.verified_name || 'Número'}: ${d.display_phone_number || ''}`,
    estado: nuvem ? 'ok' : 'aviso',
    detalhe: `Qualidade ${d.quality_rating || 'sem leitura'}, hospedagem ${d.platform_type || 'desconhecida'}.`,
    conserto: nuvem ? undefined
      : 'A coexistência só funciona com o número hospedado na nuvem da Meta (CLOUD_API). Em ON_PREMISE o número roda no servidor do provedor e não dá para conviver.',
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

/* o servidor roda em UTC; a escola lê no horário de Chapecó */
const horaDaEscola = (iso: string) => new Date(iso).toLocaleString('pt-BR', {
  timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
}).replace(',', ' às');

async function confereMensagens(): Promise<Conferencia> {
  try {
    /* a batida que o webhook anota em config/saude diz a hora exata da última */
    const saude = (await adminBd().doc('config/saude').get()).data() as { entradaEm?: string } | undefined;
    if (saude?.entradaEm) {
      const dias = (Date.now() - new Date(saude.entradaEm).getTime()) / 864e5;
      return {
        chave: 'mensagens',
        titulo: `Última mensagem de contato: ${horaDaEscola(saude.entradaEm)}`,
        estado: dias > 7 ? 'aviso' : 'ok',
        detalhe: dias > 7
          ? 'Faz mais de uma semana. Pode ser só silêncio, ou o webhook não estar chegando aqui.'
          : 'O caminho Meta, webhook e banco está de pé.',
        conserto: dias > 7 ? 'Mande um "oi" de outro celular para o número da escola e recarregue esta tela.' : undefined,
      };
    }
    const desde = new Date(Date.now() - 7 * 864e5).toISOString();
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
    return { chave: 'mensagens', titulo: 'Chegou mensagem de contato nos últimos 7 dias', estado: 'ok', detalhe: 'O caminho Meta, webhook e banco está de pé.' };
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
