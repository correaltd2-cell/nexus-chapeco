/* O portal de alunos (nexusenglish.com.br) visto do servidor da central. Só o servidor
   fala com o portal: as credenciais ficam nas variáveis da Vercel e nunca chegam ao
   navegador. Implementa o contrato PROPOSTO em docs/integracao-provas-portal.md (v1):
   a API do portal ainda não existe, e enquanto as três variáveis não estiverem
   configuradas, nada é chamado e a tela mostra a integração como indisponível.

   PORTAL_API_URL      base https da API, ex.: https://nexusenglish.com.br/api/central/v1
   PORTAL_API_TOKEN    o token da central (Authorization: Bearer)
   PORTAL_API_SEGREDO  o segredo da assinatura HMAC-SHA256 de cada pedido

   Cada pedido vai com: o token, a hora e a assinatura (contra pedido forjado ou
   repetido), quem da equipe fez (para o registro do portal), um id do pedido e, na
   liberação, a chave de idempotência. A resposta é conferida campo a campo
   (dominio/provas-portal.ts): o que vier fora do contrato é recusado, não adivinhado. */
import 'server-only';
import { randomUUID } from 'node:crypto';
import { assinaPedido } from './assinatura';
import { falhou } from '@/lib/saude';
import { leAluno, leErro, leLiberacao, leLink, leListaDeAlunos, leProvas, type Quem } from '@/lib/dominio/provas-portal';
import type { FalhaDoPortal, Portal, RespostaDoPortal } from './fluxo';

const TEMPO_DE_CONSULTA = 10_000;
const TEMPO_DE_LIBERACAO = 20_000;

function config() {
  const url = (process.env.PORTAL_API_URL || '').trim().replace(/\/+$/, '');
  const token = (process.env.PORTAL_API_TOKEN || '').trim();
  const segredo = (process.env.PORTAL_API_SEGREDO || '').trim();
  let valida = false;
  try { valida = new URL(url).protocol === 'https:'; } catch { valida = false; }
  return { url, token, segredo, ok: Boolean(valida && token && segredo) };
}

export const portalConfigurado = () => config().ok;

const falha = (tipo: FalhaDoPortal['tipo'], codigo: string, mensagem: string, incerto: boolean): FalhaDoPortal => ({ ok: false, tipo, codigo, mensagem, incerto });

async function chama(
  metodo: 'GET' | 'POST', caminho: string, quem: Quem, opcoes: { corpo?: unknown; chave?: string; tempo?: number } = {},
): Promise<{ ok: true; status: number; json: unknown } | FalhaDoPortal> {
  const c = config();
  if (!c.ok) return falha('nao_configurado', 'nao_configurado', 'A ligação com o portal não está configurada.', false);
  const corpo = opcoes.corpo === undefined ? '' : JSON.stringify(opcoes.corpo);
  const endereco = new URL(`${c.url}${caminho}`);
  const momento = Math.floor(Date.now() / 1000);
  const cabecalho: Record<string, string> = {
    accept: 'application/json',
    authorization: `Bearer ${c.token}`,
    'x-central-momento': String(momento),
    'x-central-assinatura': assinaPedido(c.segredo, momento, metodo, endereco.pathname + endereco.search, corpo),
    'x-central-operador-id': quem.uid,
    'x-central-operador-nome': encodeURIComponent(quem.nome).slice(0, 300),
    'x-request-id': randomUUID(),
    ...(corpo ? { 'content-type': 'application/json' } : {}),
    ...(opcoes.chave ? { 'idempotency-key': opcoes.chave } : {}),
  };
  /* na liberação, qualquer falha depois de o pedido sair pode ter liberado: "incerto" */
  const podeTerFeito = metodo === 'POST';
  let r: Response;
  try {
    r = await fetch(endereco, {
      method: metodo, headers: cabecalho, body: corpo || undefined, redirect: 'error', cache: 'no-store',
      signal: AbortSignal.timeout(opcoes.tempo || TEMPO_DE_CONSULTA),
    });
  } catch (e) {
    const tempo = e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError');
    const motivo = tempo ? 'O portal demorou demais para responder.' : 'Não consegui falar com o portal.';
    await falhou('portal', `${motivo} (${metodo} ${endereco.pathname})`);
    return falha('indisponivel', tempo ? 'tempo_esgotado' : 'sem_conexao', motivo, podeTerFeito);
  }

  let json: unknown = null;
  const texto = await r.text().catch(() => '');
  try { json = texto ? JSON.parse(texto) : null; } catch { json = null; }

  if (r.ok) {
    if (json === null) {
      await falhou('portal', `O portal respondeu ${r.status} sem JSON (${metodo} ${endereco.pathname}).`);
      return falha('resposta_invalida', 'resposta_invalida', 'O portal respondeu sem os dados combinados.', podeTerFeito);
    }
    return { ok: true, status: r.status, json };
  }
  if (r.status >= 500 || r.status === 429) {
    if (r.status >= 500) await falhou('portal', `O portal respondeu ${r.status} (${metodo} ${endereco.pathname}).`);
    /* 429 é recusa antes de fazer; 5xx pode ter feito parte do trabalho */
    return falha('indisponivel', r.status === 429 ? 'limite' : 'indisponivel', '', r.status !== 429 && podeTerFeito);
  }
  const erro = leErro(json);
  if (r.status === 401 || r.status === 403) await falhou('portal', `O portal recusou a central (${r.status} ${erro?.codigo || ''}). Confira o token e o segredo na Vercel.`);
  return falha('recusado', erro?.codigo || (r.status === 401 ? 'nao_autenticado' : r.status === 403 ? 'proibido' : r.status === 404 ? 'nao_encontrado' : 'requisicao_invalida'), erro?.mensagem || '', false);
}

const invalida = async <T>(onde: string, podeTerFeito = false): Promise<RespostaDoPortal<T>> => {
  await falhou('portal', `O portal respondeu fora do contrato em ${onde}.`);
  return falha('resposta_invalida', 'resposta_invalida', '', podeTerFeito);
};

const seg = (t: string) => encodeURIComponent(t);

/** O portal real, pelo contrato v1 proposto. */
export const portalPorHttp: Portal = {
  configurado: portalConfigurado,
  hostsDoLink() {
    try { return [new URL(config().url).hostname]; } catch { return []; }
  },
  async buscaAlunos(busca, quem) {
    const r = await chama('GET', `/alunos?busca=${seg(busca)}&limite=10`, quem);
    if (!r.ok) return r;
    const alunos = leListaDeAlunos(r.json);
    return alunos ? { ok: true, dados: alunos } : invalida('GET /alunos');
  },
  async aluno(id, quem) {
    const r = await chama('GET', `/alunos/${seg(id)}`, quem);
    if (!r.ok) return r;
    const a = leAluno(r.json);
    return a ? { ok: true, dados: a } : invalida('GET /alunos/{id}');
  },
  async provas(id, quem) {
    const r = await chama('GET', `/alunos/${seg(id)}/provas`, quem);
    if (!r.ok) return r;
    const p = leProvas(r.json);
    return p ? { ok: true, dados: p } : invalida('GET /alunos/{id}/provas');
  },
  async libera(id, provaId, chave, quem) {
    const r = await chama('POST', `/alunos/${seg(id)}/provas/${seg(provaId)}/liberacoes`, quem, {
      chave, tempo: TEMPO_DE_LIBERACAO, corpo: { operador: { id: quem.uid, nome: quem.nome }, origem: 'central-chapeco' },
    });
    if (!r.ok) return r;
    const l = leLiberacao(r.json);
    /* liberou e respondeu torto: a liberação pode ter acontecido, então fica "incerto" */
    return l ? { ok: true, dados: l } : invalida('POST /liberacoes', true);
  },
  async link(id, provaId, quem) {
    const r = await chama('GET', `/alunos/${seg(id)}/provas/${seg(provaId)}/link`, quem);
    if (!r.ok) return r;
    const l = leLink(r.json);
    return l ? { ok: true, dados: l } : invalida('GET /link');
  },
};
