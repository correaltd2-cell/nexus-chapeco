/* Regras dos quadros que valem na tela e no servidor.
   A ordem dos cartoes é um numero com folga entre os vizinhos: mover um cartao é
   escrever UM documento, nao renumerar a lista inteira. */
import { fimDoDia } from './formato';
import type { Cartao, Lista } from './tipos';

export const PASSO = 1000;

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

export interface Filtros {
  busca: string;
  etiquetas: string[];
  membros: string[];
  soVencidos: boolean;
  semMembro: boolean;
}

export const filtrosVazios = (): Filtros => ({
  busca: '', etiquetas: [], membros: [], soVencidos: false, semMembro: false,
});

export const quantosFiltros = (f: Filtros) =>
  (f.busca.trim() ? 1 : 0) + f.etiquetas.length + f.membros.length +
  (f.soVencidos ? 1 : 0) + (f.semMembro ? 1 : 0);

/** Prazo so vence quando o DIA acaba: cartao para hoje nao nasce vermelho. */
export function vencido(c: Cartao, hoje = new Date()) {
  if (!c.prazo || c.prazoConcluido) return false;
  return fimDoDia(c.prazo).getTime() < hoje.getTime();
}

export function passaNosFiltros(c: Cartao, f: Filtros) {
  if (c.arquivado) return false;
  const q = f.busca.trim().toLowerCase();
  if (q && !c.titulo.toLowerCase().includes(q) && !c.descricao.toLowerCase().includes(q)) return false;
  if (f.etiquetas.length && !f.etiquetas.some((e) => c.etiquetas.includes(e))) return false;
  if (f.membros.length && !f.membros.some((m) => c.membros.includes(m))) return false;
  if (f.semMembro && c.membros.length) return false;
  if (f.soVencidos && !vencido(c)) return false;
  return true;
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
  { nome: 'Renovação', cor: 'az' },
  { nome: 'Reposição', cor: 'lr' },
  { nome: 'Financeiro', cor: 'am' },
  { nome: 'Cancelamento', cor: 'vm' },
  { nome: 'Responsável', cor: 'rx' },
];
