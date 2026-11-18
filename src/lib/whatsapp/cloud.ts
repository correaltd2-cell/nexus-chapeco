/* Conversa com a Cloud API da Meta. So roda no servidor: o token nunca vai ao navegador. */
import 'server-only';

const VERSAO = 'v23.0';
const BASE = `https://graph.facebook.com/${VERSAO}`;

export const temConfig = () =>
  Boolean(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);

function cabecalho() {
  return {
    authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
    'content-type': 'application/json',
  };
}

export interface RespostaEnvio {
  ok: boolean;
  waMessageId?: string;
  erro?: string;
  codigo?: number;
  subcodigo?: number;
}

/** A recusa da Meta em portugues, para o atendente saber o que consertar. */
export function explicaRecusa(codigo?: number, mensagem?: string) {
  switch (codigo) {
    case 131047: return 'Passaram mais de 24 horas desde a última mensagem do contato. Só dá para retomar por modelo aprovado.';
    case 131026: return 'A Meta não consegue entregar para esse número. Pode não ser um WhatsApp, ou o aplicativo está muito desatualizado.';
    case 131042: return 'A conta do WhatsApp está sem forma de pagamento ou com dados fiscais incompletos. Resolva isso no Gerenciador de Negócios.';
    case 132001: return 'O modelo não existe nessa conta, ou o nome e o idioma não batem.';
    case 132000: return 'A quantidade de variáveis do modelo não bate com o que foi enviado.';
    case 131051: return 'Tipo de mensagem não suportado.';
    case 100: return 'A Meta recusou os dados do envio. Confira o número e o conteúdo.';
    case 190: return 'O token do WhatsApp expirou ou foi revogado. Gere outro em Configurações.';
    case 200: return 'O aplicativo não tem permissão de enviar por essa conta do WhatsApp.';
    default: return mensagem || 'A Meta recusou o envio.';
  }
}

async function manda(corpo: Record<string, unknown>): Promise<RespostaEnvio> {
  if (!temConfig()) return { ok: false, erro: 'O WhatsApp ainda não está conectado.' };
  try {
    const r = await fetch(`${BASE}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
      method: 'POST',
      headers: cabecalho(),
      body: JSON.stringify({ messaging_product: 'whatsapp', ...corpo }),
    });
    const dados = (await r.json()) as {
      messages?: { id: string }[];
      error?: { message?: string; code?: number; error_subcode?: number };
    };
    if (!r.ok || dados.error) {
      const e = dados.error || {};
      return { ok: false, erro: explicaRecusa(e.code, e.message), codigo: e.code, subcodigo: e.error_subcode };
    }
    return { ok: true, waMessageId: dados.messages?.[0]?.id };
  } catch {
    return { ok: false, erro: 'Não consegui falar com a Meta agora.' };
  }
}

export const mandaTexto = (para: string, texto: string) =>
  manda({ to: para, type: 'text', text: { preview_url: true, body: texto } });

/** Modelo aprovado. `sufixoDoLink` preenche o botão de link dinâmico do modelo (o
    {{1}} no fim da URL cadastrada na Meta), quando ele tem um. */
export function mandaTemplate(para: string, nome: string, idioma: string, variaveis: string[], sufixoDoLink?: string) {
  const componentes: Record<string, unknown>[] = [];
  if (variaveis.length) {
    componentes.push({ type: 'body', parameters: variaveis.map((v) => ({ type: 'text', text: v })) });
  }
  if (sufixoDoLink) {
    componentes.push({ type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: sufixoDoLink }] });
  }
  return manda({
    to: para,
    type: 'template',
    template: { name: nome, language: { code: idioma }, ...(componentes.length ? { components: componentes } : {}) },
  });
}

/** Botões de resposta. O id volta no webhook quando o contato toca; sem ids, b1, b2, b3. */
export const mandaBotoes = (para: string, texto: string, botoes: string[], ids?: string[]) =>
  manda({
    to: para,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: texto.slice(0, 1024) },
      /* a Cloud API aceita no maximo 3 botoes, com ate 20 letras cada */
      action: {
        buttons: botoes.slice(0, 3).map((b, i) => ({
          type: 'reply', reply: { id: ids?.[i] || `b${i + 1}`, title: b.slice(0, 20) },
        })),
      },
    },
  });

/** Lista de opções: até 10 linhas de até 24 letras, atrás de um botão de até 20. */
export const mandaLista = (para: string, texto: string, botao: string, linhas: { id: string; titulo: string }[]) =>
  manda({
    to: para,
    type: 'interactive',
    interactive: {
      type: 'list',
      body: { text: texto.slice(0, 1024) },
      action: {
        button: botao.slice(0, 20),
        sections: [{ title: 'Opções', rows: linhas.slice(0, 10).map((l) => ({ id: l.id, title: l.titulo.slice(0, 24) })) }],
      },
    },
  });

/** Marca a mensagem do contato como lida, para o visto azul aparecer no celular dele. */
export async function marcaLida(waMessageId: string) {
  if (!temConfig()) return;
  try {
    await fetch(`${BASE}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
      method: 'POST',
      headers: cabecalho(),
      body: JSON.stringify({ messaging_product: 'whatsapp', status: 'read', message_id: waMessageId }),
    });
  } catch { /* o visto azul nao vale travar o atendimento */ }
}

/** Baixa a midia que o contato mandou: primeiro a url, depois os bytes. */
export async function baixaMidia(mediaId: string) {
  if (!temConfig()) return null;
  try {
    const meta = await fetch(`${BASE}/${mediaId}`, { headers: cabecalho() });
    const { url, mime_type } = (await meta.json()) as { url?: string; mime_type?: string };
    if (!url) return null;
    const bin = await fetch(url, { headers: { authorization: `Bearer ${process.env.WHATSAPP_TOKEN}` } });
    if (!bin.ok) return null;
    return { bytes: Buffer.from(await bin.arrayBuffer()), mime: mime_type || 'application/octet-stream' };
  } catch {
    return null;
  }
}
