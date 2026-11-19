/* A comemoração rápida quando a conversa passa de setor: o avatar de quem recebe, "Transferido
   para Natan!" e uma frase de zoeira. Dura menos de dois segundos, não bloqueia clique e
   desliga em Configurações, Aparência. Aqui fica só o que dizer; quem desenha é
   componentes/festa.tsx.
   Prova: node --experimental-strip-types testes/festa.ts */
import type { Perfil, Setor } from './tipos';

export interface Festa {
  setor: Setor;
  titulo: string;
  frase: string;
  inicial?: string;   // sem pessoa, o desenho usa o ícone do setor
}

const NOME: Record<Setor, string> = {
  recepcao: 'Recepção', financeiro: 'Financeiro', coordenacao: 'Coordenação', kids: 'Coordenação Kids',
};
const ARTIGO: Record<Setor, string> = { recepcao: 'a', financeiro: 'o', coordenacao: 'a', kids: 'a' };

/* Com gente, a frase leva o nome sem artigo ("para Natan"), que serve para qualquer um. */
const COM_PESSOA = [
  'Bucha passada, {p}! 🎯',
  '{p}, segura essa! 🙌',
  'Vai que é tua, {p}! 🚀',
  'Chegou presente pra {p} 🎁',
];
const DO_SETOR: Record<Setor, string[]> = {
  recepcao: ['De volta pra casa 🏠', 'Voltou pro coração da escola 🧡', 'Recepção na área, pode respirar 😮‍💨'],
  financeiro: ['Bucha entregue pro financeiro 💸', 'Vai que é tua, financeiro! 🧾', 'Agora é com quem entende de boleto 😎'],
  coordenacao: ['Bucha passada pra coordenação 🎯', 'Vai que é tua, coordenação! 🚀'],
  kids: ['Bucha passada pro Kids 🎯', 'Vai que é tua, Kids! 🚀'],
};

/** Quem recebe pelo setor: a pessoa da coordenação daquele setor, se houver uma só
    ativa com ele (Natan nos adultos, Karina no Kids). Recepção e Financeiro são o setor. */
export function quemRecebe(setor: Setor, perfis: Pick<Perfil, 'nome' | 'papel' | 'setores' | 'ativo'>[]) {
  if (setor !== 'coordenacao' && setor !== 'kids') return undefined;
  const donos = perfis.filter((p) => p.ativo && p.papel === 'coordenacao' && (p.setores || []).includes(setor));
  if (donos.length !== 1) return undefined;
  return donos[0].nome.trim().split(/\s+/)[0] || undefined;
}

/** `sorteio` vai de 0 a 1 e escolhe a frase; quem chama passa Math.random() no clique. */
export function festaDaTransferencia(setor: Setor, pessoa: string | undefined, sorteio: number): Festa {
  const lista = pessoa ? COM_PESSOA : DO_SETOR[setor];
  const frase = lista[Math.min(lista.length - 1, Math.floor(Math.max(0, sorteio) * lista.length))];
  return {
    setor,
    titulo: pessoa ? `Transferido para ${pessoa}!` : `Transferido para ${ARTIGO[setor]} ${NOME[setor]}!`,
    frase: pessoa ? frase.replace('{p}', pessoa) : frase,
    inicial: pessoa ? pessoa.slice(0, 1).toUpperCase() : undefined,
  };
}
