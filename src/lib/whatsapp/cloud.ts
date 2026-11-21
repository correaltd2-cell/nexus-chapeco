/* Conversa com a Cloud API da Meta. So roda no servidor: o token nunca vai ao navegador. */
import 'server-only';
import { classificaRecusa } from '@/lib/dominio/saude';
import { bate, falhou } from '@/lib/saude';

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
    case 131053: return 'A Meta não aceitou o arquivo. Confira o formato (foto JPG ou PNG, PDF, áudio) e o tamanho.';
    case 100: return 'A Meta recusou os dados do envio. Confira o número e o conteúdo.';
    case 190: return 'O token do WhatsApp expirou ou foi revogado. Gere outro em Configurações.';
    case 200: return 'O aplicativo não tem permissão de enviar por essa conta do WhatsApp.';
    default: return mensagem || 'A Meta recusou o envio.';
  }
}

/* Recusa da conta ou do modelo acorda a gestão (config/saude); janela fechada e
   número sem WhatsApp são do dia a dia e ficam só na mensagem. */
async function anotaRecusa(corpo: Record<string, unknown>, erro: string, codigo?: number) {
  const tipo = classificaRecusa(codigo);
  if (tipo === 'conta') await falhou('envio', erro);
  if (tipo === 'modelo') {
    const nome = (corpo.template as { name?: string } | undefined)?.name;
    await falhou('modelo', nome ? `${erro} Modelo: ${nome}.` : erro);
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
      const erro = explicaRecusa(e.code, e.message);
      await anotaRecusa(corpo, erro, e.code ?? r.status);
      return { ok: false, erro, codigo: e.code, subcodigo: e.error_subcode };
    }
    await bate('saidaEm');
    return { ok: true, waMessageId: dados.messages?.[0]?.id };
  } catch {
    const erro = 'Não consegui falar com a Meta agora.';
    await falhou('envio', erro);
    return { ok: false, erro };
  }
}

export const mandaTexto = (para: string, texto: string) =>
  manda({ to: para, type: 'text', text: { preview_url: true, body: texto } });

/** Modelo aprovado. `sufixoDoLink` preenche o botão de link dinâmico do modelo (o
    {{1}} no fim da URL cadastrada na Meta), quando ele tem um. */
export function mandaTemplate(
  para: string, nome: string, idioma: string, variaveis: string[], sufixoDoLink?: string, payloads?: string[],
) {
  const componentes: Record<string, unknown>[] = [];
  if (variaveis.length) {
    componentes.push({ type: 'body', parameters: variaveis.map((v) => ({ type: 'text', text: v })) });
  }
  if (sufixoDoLink) {
    componentes.push({ type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: sufixoDoLink }] });
  }
  /* o payload de cada botão de resposta volta no webhook quando o contato toca nele */
  (payloads || []).forEach((payload, i) => {
    componentes.push({ type: 'button', sub_type: 'quick_reply', index: String(i), parameters: [{ type: 'payload', payload }] });
  });
  return manda({
    to: para,
    type: 'template',
    template: { name: nome, language: { code: idioma }, ...(componentes.length ? { components: componentes } : {}) },
  });
}

/** Sobe o arquivo para a Meta e devolve o id da mídia, que vale para mandar por 30 dias. */
export async function sobeMidia(bytes: Uint8Array, mime: string, nome: string): Promise<{ ok: true; id: string } | { ok: false; erro: string }> {
  if (!temConfig()) return { ok: false, erro: 'O WhatsApp ainda não está conectado.' };
  try {
    const form = new FormData();
    form.append('messaging_product', 'whatsapp');
    form.append('type', mime);
    form.append('file', new Blob([new Uint8Array(bytes)], { type: mime }), nome);
    const r = await fetch(`${BASE}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/media`, {
      method: 'POST',
      headers: { authorization: `Bearer ${process.env.WHATSAPP_TOKEN}` },
      body: form,
    });
    const dados = (await r.json()) as { id?: string; error?: { message?: string; code?: number } };
    if (!r.ok || !dados.id) {
      const erro = explicaRecusa(dados.error?.code, dados.error?.message);
      if (classificaRecusa(dados.error?.code) === 'conta') await falhou('envio', erro);
      return { ok: false, erro };
    }
    return { ok: true, id: dados.id };
  } catch {
    const erro = 'Não consegui mandar o arquivo para a Meta agora.';
    await falhou('envio', erro);
    return { ok: false, erro };
  }
}

/** Foto, vídeo, áudio ou documento já subido. Áudio não leva legenda no WhatsApp. */
export function mandaMidia(
  para: string, tipo: 'image' | 'video' | 'audio' | 'document', id: string, o: { legenda?: string; nome?: string } = {},
) {
  const midia: Record<string, string> = { id };
  if (o.legenda && tipo !== 'audio') midia.caption = o.legenda.slice(0, 1024);
  if (tipo === 'document' && o.nome) midia.filename = o.nome;
  return manda({ to: para, type: tipo, [tipo]: midia });
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
