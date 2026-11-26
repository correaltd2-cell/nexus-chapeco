/* Papel decide quais DADOS a pessoa lê (regras do Firestore).
   Modulo decide quais TELAS ela abre. Os dois lados leem daqui. */
import type { Papel, Setor } from './tipos';

export const MODULOS = ['conversas', 'quadros', 'alunos', 'provas', 'aulas', 'cadastros', 'relatorios', 'ajustes'] as const;
export type Modulo = (typeof MODULOS)[number];

export const NOME_MODULO: Record<Modulo, string> = {
  conversas: 'Conversas',
  quadros: 'Quadros',
  alunos: 'Alunos',
  provas: 'Provas',
  aulas: 'Agenda',
  cadastros: 'Cadastros',
  relatorios: 'Relatórios',
  ajustes: 'Configurações',
};

export const NOME_PAPEL: Record<Papel, string> = {
  admin: 'Administrador',
  gestor: 'Gestor',
  recepcao: 'Recepção',
  coordenacao: 'Coordenação',
  professor: 'Professor',
};

const PADRAO: Record<Papel, Modulo[]> = {
  admin: ['conversas', 'quadros', 'alunos', 'provas', 'aulas', 'cadastros', 'relatorios', 'ajustes'],
  gestor: ['conversas', 'quadros', 'alunos', 'provas', 'aulas', 'cadastros', 'relatorios', 'ajustes'],
  recepcao: ['conversas', 'quadros', 'alunos', 'provas', 'aulas', 'cadastros', 'relatorios'],
  coordenacao: ['conversas', 'quadros', 'alunos', 'provas', 'aulas', 'cadastros'],
  /* o professor só tem a agenda, e nela só as aulas dele (decisão de 26/11/2026) */
  professor: ['aulas'],
};

export const modulosDoPapel = (p: Papel): Modulo[] => PADRAO[p] || PADRAO.recepcao;
export const podeAbrir = (p: Papel, m: Modulo) => modulosDoPapel(p).includes(m);
export const ehGestao = (p: Papel) => p === 'admin' || p === 'gestor';

export const NOME_SETOR: Record<Setor, string> = {
  recepcao: 'Recepção',
  financeiro: 'Financeiro',
  coordenacao: 'Coordenação',
  kids: 'Coordenação Kids',
};

/* Nos filtros o nome vai curto: "Coordenação Kids" sozinho empurra a fileira
   inteira para baixo. No resto da tela o setor continua com o nome inteiro. */
export const NOME_CURTO_SETOR: Record<Setor, string> = {
  recepcao: 'Recepção',
  financeiro: 'Financeiro',
  coordenacao: 'Coordenação',
  kids: 'Kids',
};

export const SETORES: Setor[] = ['recepcao', 'financeiro', 'coordenacao', 'kids'];

/** Quem vê a conversa de um setor. Recepção vê tudo, porque é o coração da escola. */
export function veSetor(papel: Papel, setores: Setor[], setor: Setor) {
  if (papel === 'admin' || papel === 'gestor' || papel === 'recepcao') return true;
  if (papel === 'professor') return false;
  return (setores || []).includes(setor);
}

/**
 * Quais conversas a pessoa pede ao banco: 'todas' (gestão e recepção) ou só as dos
 * setores dela (coordenação: Natan na Coordenação, Karina na Coordenação Kids). O
 * Firestore não filtra pela regra: uma consulta que poderia trazer conversa de outro
 * setor é recusada inteira, então quem não vê tudo pede já filtrado. O professor não
 * tem conversa nenhuma.
 */
export function conversasQueVe(papel: Papel, setores: Setor[] | undefined): 'todas' | Setor[] {
  if (papel === 'admin' || papel === 'gestor' || papel === 'recepcao') return 'todas';
  if (papel === 'professor') return [];
  return [...new Set((setores || []).filter((s) => SETORES.includes(s)))];
}
