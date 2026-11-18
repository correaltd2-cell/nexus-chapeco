/* Papel decide quais DADOS a pessoa lê (regras do Firestore).
   Modulo decide quais TELAS ela abre. Os dois lados leem daqui. */
import type { Papel, Setor } from './tipos';

export const MODULOS = ['conversas', 'quadros', 'provas', 'aulas', 'relatorios', 'ajustes'] as const;
export type Modulo = (typeof MODULOS)[number];

export const NOME_MODULO: Record<Modulo, string> = {
  conversas: 'Conversas',
  quadros: 'Quadros',
  provas: 'Provas',
  aulas: 'Aulas',
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
  admin: ['conversas', 'quadros', 'provas', 'aulas', 'relatorios', 'ajustes'],
  gestor: ['conversas', 'quadros', 'provas', 'aulas', 'relatorios', 'ajustes'],
  recepcao: ['conversas', 'quadros', 'provas', 'aulas', 'relatorios'],
  coordenacao: ['conversas', 'quadros', 'provas', 'aulas'],
  professor: ['aulas', 'provas'],
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
  return setores.includes(setor);
}
