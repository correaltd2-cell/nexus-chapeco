/* Regras dos quadros que valem na tela e no servidor.
   A ordem dos cartoes é um numero com folga entre os vizinhos: mover um cartao é
   escrever UM documento, nao renumerar a lista inteira. */
import { fimDoDia, paraData } from './formato.ts';
import type { Cartao, Etiqueta, Lista, Quadro } from './tipos.ts';

export const PASSO = 1000;

/** Identificador curto para item de checklist, comentario e linha de atividade.
    Vive aqui fora do componente porque sortear nao é coisa de renderizacao. */
export const novoId = (): string =>
  (globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`)
    .replace(/-/g, '')
    .slice(0, 10);

/** O numero de ordem para encaixar entre dois cartoes. */
export function ordemEntre(antes?: Cartao, depois?: Cartao): number {
  if (!antes && !depois) return PASSO;
  if (!antes) return (depois as Cartao).ordem - PASSO;
  if (!depois) return antes.ordem + PASSO;
  const meio = (antes.ordem + depois.ordem) / 2;
  /* se os vizinhos encostaram, quem chamar precisa renumerar a lista */
  return meio;
}

/** Vizinhos encostados demais: hora de renumerar aquela lista. */
export const precisaRenumerar = (antes?: Cartao, depois?: Cartao) =>
  Boolean(antes && depois && Math.abs(depois.ordem - antes.ordem) < 2);

export const renumera = (cartoes: Cartao[]) =>
  cartoes.map((c, i) => ({ id: c.id, ordem: (i + 1) * PASSO }));

/* ---------------- prazo, com data e hora ---------------- */

/** O prazo tem hora? ("2026-11-25T14:00") Sem hora ele vale até o fim do dia. */
export const temHora = (prazo: string | undefined) => /T\d{2}:\d{2}/.test(prazo || '');

/** O instante em que o prazo vence: com hora, a hora; sem hora, o fim do dia. */
export const venceEm = (prazo: string) => (temHora(prazo) ? paraData(prazo) : fimDoDia(prazo));

export type EstadoDoPrazo = 'concluido' | 'atrasado' | 'breve' | 'normal';
const DIA = 86_400_000;

/** Concluído, atrasado (passou da hora, ou do dia sem hora), vence em breve (nas
    próximas 24 horas) ou normal. Sem prazo, null. */
export function estadoDoPrazo(c: Pick<Cartao, 'prazo' | 'prazoConcluido'>, agora = new Date()): EstadoDoPrazo | null {
  if (!c.prazo) return null;
  if (c.prazoConcluido) return 'concluido';
  const falta = venceEm(c.prazo).getTime() - agora.getTime();
  if (falta < 0) return 'atrasado';
  return falta <= DIA ? 'breve' : 'normal';
}

/** Prazo so vence quando o DIA acaba (ou na hora marcada): cartao para hoje nao nasce vermelho. */
export const vencido = (c: Cartao, hoje = new Date()) => estadoDoPrazo(c, hoje) === 'atrasado';

const dd = (n: number) => String(n).padStart(2, '0');

/** "Hoje 14:00", "Amanhã", "Ontem 09:30", "25/11 14:00", "03/01/2027". */
export function textoDoPrazo(prazo: string, agora = new Date()): string {
  const d = paraData(prazo);
  const dias = Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
    - new Date(agora.getFullYear(), agora.getMonth(), agora.getDate()).getTime()) / DIA);
  const dia = dias === 0 ? 'Hoje' : dias === 1 ? 'Amanhã' : dias === -1 ? 'Ontem'
    : `${dd(d.getDate())}/${dd(d.getMonth() + 1)}${d.getFullYear() !== agora.getFullYear() ? `/${d.getFullYear()}` : ''}`;
  return temHora(prazo) ? `${dia} ${dd(d.getHours())}:${dd(d.getMinutes())}` : dia;
}

/** Data e hora dos campos da tela viram o prazo gravado (hora vazia: só a data). */
export const juntaPrazo = (data: string, hora: string) => (data ? (hora ? `${data}T${hora}` : data) : '');
export const partesDoPrazo = (prazo: string | undefined) => {
  const m = /^(\d{4}-\d{2}-\d{2})(?:T(\d{2}:\d{2}))?/.exec(prazo || '');
  return { data: m?.[1] || '', hora: m?.[2] || '' };
};

/* ---------------- urgência ---------------- */

export type Urgencia = 'baixa' | 'media' | 'alta' | 'urgente';
export const URGENCIAS: { k: Urgencia; nome: string }[] = [
  { k: 'urgente', nome: 'Urgente' }, { k: 'alta', nome: 'Alta' }, { k: 'media', nome: 'Média' }, { k: 'baixa', nome: 'Baixa' },
];
export const NOME_DA_URGENCIA: Record<Urgencia, string> = { urgente: 'Urgente', alta: 'Alta', media: 'Média', baixa: 'Baixa' };

/* ---------------- busca e filtros ---------------- */

const sem = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/** O cartão bate na busca? Cada palavra precisa aparecer em algum lugar: título,
    descrição, etiqueta, checklist, comentário, pessoa ou urgência. Sem acento e sem
    maiúscula. */
export function bateNaBusca(c: Cartao, termo: string, nomeDe: (uid: string) => string | undefined = () => undefined): boolean {
  const palavras = sem(termo).split(/\s+/).filter(Boolean);
  if (!palavras.length) return true;
  const tudo = sem([
    c.titulo, c.descricao, ...c.etiquetas, ...c.checklist.map((i) => i.texto), ...c.comentarios.map((x) => x.texto),
    ...c.membros.map((m) => nomeDe(m) || ''), c.urgencia ? NOME_DA_URGENCIA[c.urgencia] : '',
  ].join(' \n '));
  return palavras.every((p) => tudo.includes(p));
}

export interface Filtros {
  busca: string;
  etiquetas: string[];
  membros: string[];
  urgencias: Urgencia[];
  soVencidos: boolean;
  semMembro: boolean;
}

export const filtrosVazios = (): Filtros => ({
  busca: '', etiquetas: [], membros: [], urgencias: [], soVencidos: false, semMembro: false,
});

/** Quantos filtros estão ligados (a busca fica no topo e não conta). */
export const quantosFiltros = (f: Filtros) =>
  f.etiquetas.length + f.membros.length + (f.urgencias?.length || 0) + (f.soVencidos ? 1 : 0) + (f.semMembro ? 1 : 0);

/** O cartão aparece no quadro? Arquivado nunca aparece nas listas (só na busca). */
export function passaNosFiltros(c: Cartao, f: Filtros, nomeDe?: (uid: string) => string | undefined, agora = new Date()) {
  if (c.arquivado) return false;
  if (f.busca.trim() && !bateNaBusca(c, f.busca, nomeDe)) return false;
  if (f.etiquetas.length && !f.etiquetas.some((e) => c.etiquetas.includes(e))) return false;
  if (f.membros.length && !f.membros.some((m) => c.membros.includes(m))) return false;
  if (f.urgencias?.length && !(c.urgencia && f.urgencias.includes(c.urgencia))) return false;
  if (f.semMembro && c.membros.length) return false;
  if (f.soVencidos && !vencido(c, agora)) return false;
  return true;
}

/** Os arquivados do quadro que batem na busca (pedido do cliente: "não aparecer no
    quadro, mas quando pesquisa aparece"). Sem busca, nenhum. */
export function arquivadosNaBusca(cartoes: Cartao[], quadroId: string, termo: string, nomeDe?: (uid: string) => string | undefined): Cartao[] {
  if (!termo.trim()) return [];
  return cartoes
    .filter((c) => c.quadroId === quadroId && c.arquivado && bateNaBusca(c, termo, nomeDe))
    .sort((a, b) => b.atualizadoEm.localeCompare(a.atualizadoEm));
}

export const listasVisiveis = (ls: Lista[]) =>
  ls.filter((l) => !l.arquivada).sort((a, b) => a.ordem - b.ordem);

export const cartoesDaLista = (cs: Cartao[], listaId: string) =>
  cs.filter((c) => c.listaId === listaId && !c.arquivado).sort((a, b) => a.ordem - b.ordem);

export const feitosDoChecklist = (c: Cartao) => c.checklist.filter((i) => i.feito).length;

/** Quadro novo nasce com as tres listas que todo mundo usa. */
export const LISTAS_PADRAO = ['A fazer', 'Em andamento', 'Feito'];

/** As etiquetas que a escola usa, e a cor de cada uma. */
export const ETIQUETAS_PADRAO: { nome: string; cor: string }[] = [
  { nome: 'Matrícula', cor: 'vd' },
  { nome: 'Marcação', cor: 'az' },
  { nome: 'Reposição', cor: 'lr' },
  { nome: 'Financeiro', cor: 'am' },
  { nome: 'Prova', cor: 'rx' },
  { nome: 'Coordenação', cor: 'ci' },
  { nome: 'Cancelamento', cor: 'vm' },
  { nome: 'Renovação', cor: 'cz' },
  { nome: 'Responsável', cor: 'cz' },
];

/** A cor da etiqueta, para a lista de conversas pintar igual ao cartão. */
export const corDaEtiqueta = (nome: string) =>
  ETIQUETAS_PADRAO.find((e) => e.nome === nome)?.cor || 'cz';

/* ---------------- etiquetas do quadro, criadas por nome ---------------- */

export const CORES_DE_ETIQUETA: { k: string; nome: string }[] = [
  { k: 'vd', nome: 'Verde' }, { k: 'am', nome: 'Amarelo' }, { k: 'lr', nome: 'Laranja' }, { k: 'vm', nome: 'Vermelho' },
  { k: 'rx', nome: 'Roxo' }, { k: 'az', nome: 'Azul' }, { k: 'ci', nome: 'Verde-água' }, { k: 'cz', nome: 'Cinza' },
];

/** As etiquetas de um quadro: as dele, ou as padrão da escola enquanto ninguém mexeu. */
export const etiquetasDoQuadro = (q?: Pick<Quadro, 'etiquetas'> | null): Etiqueta[] =>
  (q?.etiquetas && q.etiquetas.length ? q.etiquetas : ETIQUETAS_PADRAO);

/** A cor de uma etiqueta num quadro (a do quadro, a padrão, ou cinza). */
export const corNoQuadro = (nome: string, etiquetas: Etiqueta[]) =>
  etiquetas.find((e) => e.nome === nome)?.cor || corDaEtiqueta(nome);

const mesmoNome = (a: string, b: string) => sem(a.trim()) === sem(b.trim());
type MudaCartoes = { id: string; etiquetas: string[] }[];

/** Etiqueta nova no quadro. Nome repetido (sem olhar acento e maiúscula) não passa. */
export function criaEtiqueta(lista: Etiqueta[], nome: string, cor: string): { lista: Etiqueta[] } | { erro: string } {
  const n = nome.replace(/\s+/g, ' ').trim().slice(0, 30);
  if (!n) return { erro: 'Escreva o nome da etiqueta.' };
  if (lista.some((e) => mesmoNome(e.nome, n))) return { erro: `Já existe a etiqueta ${n}.` };
  return { lista: [...lista, { nome: n, cor }] };
}

/** Renomeia ou troca a cor; os cartões do quadro que tinham o nome antigo passam ao novo. */
export function mudaEtiqueta(lista: Etiqueta[], cartoes: Cartao[], de: string, nome: string, cor: string): { lista: Etiqueta[]; cartoes: MudaCartoes } | { erro: string } {
  const n = nome.replace(/\s+/g, ' ').trim().slice(0, 30);
  if (!n) return { erro: 'Escreva o nome da etiqueta.' };
  if (lista.some((e) => e.nome !== de && mesmoNome(e.nome, n))) return { erro: `Já existe a etiqueta ${n}.` };
  return {
    lista: lista.map((e) => (e.nome === de ? { nome: n, cor } : e)),
    cartoes: n === de ? [] : cartoes.filter((c) => c.etiquetas.includes(de))
      .map((c) => ({ id: c.id, etiquetas: [...new Set(c.etiquetas.map((x) => (x === de ? n : x)))] })),
  };
}

/** Apaga a etiqueta do quadro e dos cartões dele. */
export function apagaEtiqueta(lista: Etiqueta[], cartoes: Cartao[], nome: string): { lista: Etiqueta[]; cartoes: MudaCartoes } {
  return {
    lista: lista.filter((e) => e.nome !== nome),
    cartoes: cartoes.filter((c) => c.etiquetas.includes(nome)).map((c) => ({ id: c.id, etiquetas: c.etiquetas.filter((x) => x !== nome) })),
  };
}

/* ---------------- plano de fundo ---------------- */

export interface Fundo { id: string; nome: string; css: string; escuro: boolean }

/** O contraste (conta da WCAG, de 1 a 21) entre duas cores #rrggbb. */
export function contraste(a: string, b: string): number {
  const lum = (h: string) => {
    const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(h);
    if (!m) return 0;
    const [r, g, bl] = [m[1], m[2], m[3]].map((x) => parseInt(x, 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

/** As cores de um fundo: os #rrggbb do CSS. */
export const coresDoFundo = (css: string) => css.match(/#[0-9a-f]{6}\b/gi) || [];

/** O texto direto em cima do fundo é branco? É o que tiver mais contraste com a cor do
    fundo que pior combina com ele (24/11/2026: no Laranja e no Pôr do sol o branco sumia). */
export function textoBrancoNoFundo(css: string): boolean {
  const cores = coresDoFundo(css);
  if (!cores.length) return false;
  const pior = (t: string) => Math.min(...cores.map((c) => contraste(t, c)));
  return pior('#FFFFFF') > pior('#141414');
}

const fundo = (id: string, nome: string, css: string): Fundo => ({ id, nome, css, escuro: textoBrancoNoFundo(css) });

/** Os planos de fundo prontos (pedido do cliente, 24/11/2026). Desenho nosso, sem foto
    de banco de imagem; "escuro" diz se o texto em cima é branco, e sai da conta do contraste. */
export const FUNDOS: Fundo[] = [
  fundo('padrao', 'Sem fundo', ''),
  fundo('laranja', 'Laranja Nexus', 'linear-gradient(135deg,#F6821F 0%,#D4500A 100%)'),
  fundo('por-do-sol', 'Pôr do sol', 'linear-gradient(135deg,#FFB067 0%,#F0645A 55%,#B8446E 100%)'),
  fundo('oceano', 'Oceano', 'linear-gradient(135deg,#3A8DDE 0%,#1F4E8C 100%)'),
  fundo('floresta', 'Floresta', 'linear-gradient(135deg,#3E9B72 0%,#1E5A45 100%)'),
  fundo('uva', 'Uva', 'linear-gradient(135deg,#8E6BD8 0%,#4C2F8F 100%)'),
  fundo('noite', 'Noite', 'linear-gradient(135deg,#45453F 0%,#181817 100%)'),
  fundo('lousa', 'Lousa', 'radial-gradient(ellipse at 30% 20%,rgba(255,255,255,.07),transparent 55%),radial-gradient(ellipse at 80% 90%,rgba(255,255,255,.05),transparent 50%),#2F4A3F'),
  fundo('ceu', 'Céu', 'linear-gradient(180deg,#DDEEFF 0%,#B9D7F5 100%)'),
  fundo('areia', 'Areia', 'linear-gradient(135deg,#F6EBDD 0%,#E8D3B8 100%)'),
  fundo('caderno', 'Caderno', 'linear-gradient(90deg,transparent 56px,#EFA9A0 56px,#EFA9A0 58px,transparent 58px),repeating-linear-gradient(180deg,#FBF8F1 0,#FBF8F1 27px,#D5E1EC 27px,#D5E1EC 28px)'),
  fundo('pontinhos', 'Pontilhado', 'radial-gradient(#C9C9C2 1.4px,transparent 1.6px) 0 0/18px 18px,#EEEEEA'),
];

/** O fundo do quadro para a tela: o CSS e se o texto em cima é branco. Null é sem fundo. */
export function fundoDoQuadro(q?: Pick<Quadro, 'fundo' | 'fundoImagem'> | null): { css: string; escuro: boolean; imagem: boolean } | null {
  if (!q?.fundo || q.fundo === 'padrao') return null;
  if (q.fundo === 'imagem') {
    if (!q.fundoImagem || !/^https:\/\//.test(q.fundoImagem)) return null;
    /* a cor da imagem não se sabe: o texto é branco e o topo ganha uma faixa escura */
    return { css: `center / cover no-repeat url("${q.fundoImagem.replace(/["\\\n]/g, '')}"), #2B2B28`, escuro: true, imagem: true };
  }
  const f = FUNDOS.find((x) => x.id === q.fundo);
  return f && f.css ? { css: f.css, escuro: f.escuro, imagem: false } : null;
}

/* ---------------- listas e cartões ---------------- */

/** A ordem nova das listas quando uma é arrastada para antes de outra (null: para o fim). */
export function reordenaListas(listas: Lista[], id: string, antesDoId: string | null): { id: string; ordem: number }[] {
  const ordenadas = listasVisiveis(listas);
  const movida = ordenadas.find((l) => l.id === id);
  if (!movida) return [];
  const resto = ordenadas.filter((l) => l.id !== id);
  const i = antesDoId ? resto.findIndex((l) => l.id === antesDoId) : resto.length;
  const nova = [...resto.slice(0, i < 0 ? resto.length : i), movida, ...resto.slice(i < 0 ? resto.length : i)];
  return nova.map((l, j) => ({ id: l.id, ordem: (j + 1) * PASSO })).filter((x) => ordenadas.find((l) => l.id === x.id)?.ordem !== x.ordem);
}

/** A cópia de um cartão (logo abaixo dele): o conteúdo vai junto; comentários, anexos e
    a ligação com a conversa ficam no original. */
export function copiaDoCartao(c: Cartao, ordem: number, autor: string, agora: string): Omit<Cartao, 'id'> {
  return {
    quadroId: c.quadroId, listaId: c.listaId, ordem, titulo: `${c.titulo} (cópia)`.slice(0, 120), descricao: c.descricao,
    etiquetas: [...c.etiquetas], membros: [...c.membros], ...(c.prazo ? { prazo: c.prazo } : {}), prazoConcluido: false,
    ...(c.urgencia ? { urgencia: c.urgencia } : {}), ...(c.capaCor ? { capaCor: c.capaCor } : {}),
    checklist: c.checklist.map((i) => ({ ...i, id: novoId(), feito: false })), comentarios: [], anexos: [],
    atividade: [{ id: novoId(), autorNome: autor, texto: `copiou de "${c.titulo}"`, criadoEm: agora }],
    arquivado: false, criadoEm: agora, atualizadoEm: agora,
  };
}

/** As cores da capa do cartão. */
export const CAPAS: { k: string; nome: string }[] = [
  { k: 'lr', nome: 'Laranja' }, { k: 'am', nome: 'Amarelo' }, { k: 'vd', nome: 'Verde' }, { k: 'ci', nome: 'Verde-água' },
  { k: 'az', nome: 'Azul' }, { k: 'rx', nome: 'Roxo' }, { k: 'cz', nome: 'Cinza' }, { k: 'pt', nome: 'Preto' },
];
