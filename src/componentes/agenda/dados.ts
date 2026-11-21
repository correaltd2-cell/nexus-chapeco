'use client';
/* O que a agenda lê, em tempo real: professores (da equipe), alunos, módulos, aulas do
   currículo e bloqueios inteiros; agendamentos só do período que está na tela. */
import { useEffect, useMemo, useState } from 'react';
import { assina, assinaFiltro } from '@/lib/dados/fonte';
import { corDoProfessor, type Agendamento, type AulaDoCurriculo, type Bloqueio, type Modulo, type Professor } from '@/lib/dominio/agenda';
import type { Aluno, Perfil } from '@/lib/dominio/tipos';

export interface Cadastros {
  professores: Professor[];
  perfis: Perfil[];
  alunos: Aluno[];
  modulos: Modulo[];
  aulas: AulaDoCurriculo[];
  bloqueios: Bloqueio[];
  carregado: boolean;
}

/** Professor é quem tem o papel de professor, ou quem a gestão marcou que dá aula. */
export const ehProfessor = (p: Perfil) => p.ativo && (p.papel === 'professor' || p.daAula === true);

export function useCadastros(): Cadastros {
  const [perfis, setPerfis] = useState<Perfil[] | null>(null);
  const [alunos, setAlunos] = useState<Aluno[]>([]);
  const [modulos, setModulos] = useState<Modulo[]>([]);
  const [aulas, setAulas] = useState<AulaDoCurriculo[]>([]);
  const [bloqueios, setBloqueios] = useState<Bloqueio[]>([]);

  useEffect(() => assina('perfis', (d) => setPerfis(d as unknown as Perfil[])), []);
  useEffect(() => assina('alunos', (d) => setAlunos((d as unknown as Aluno[]).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')))), []);
  useEffect(() => assina('modulos', (d) => setModulos((d as unknown as Modulo[]).sort((a, b) => a.ordem - b.ordem))), []);
  useEffect(() => assina('aulas', (d) => setAulas((d as unknown as AulaDoCurriculo[]).sort((a, b) => a.ordem - b.ordem))), []);
  useEffect(() => assina('bloqueios', (d) => setBloqueios(d as unknown as Bloqueio[])), []);

  const professores = useMemo(() => (perfis || [])
    .filter(ehProfessor)
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
    .map((p, i) => ({ id: p.id, nome: p.nome, cor: corDoProfessor(p, i), ativo: p.ativo })), [perfis]);

  return { professores, perfis: perfis || [], alunos, modulos, aulas, bloqueios, carregado: perfis !== null };
}

/** As aulas do período na tela. Troca de período troca a escuta, sem recarregar. */
export function useAgendamentos(de: string, ate: string) {
  const [lista, setLista] = useState<{ chave: string; itens: Agendamento[] }>({ chave: '', itens: [] });
  const chave = `${de}|${ate}`;
  useEffect(() => {
    if (!de || !ate) return;
    return assinaFiltro('agendamentos', [
      { campo: 'inicio', op: '>=', valor: de },
      { campo: 'inicio', op: '<', valor: ate },
    ], (d) => setLista({ chave: `${de}|${ate}`, itens: d as unknown as Agendamento[] }));
  }, [de, ate]);
  /* enquanto o período novo não chega, mostra o anterior em vez de piscar vazio */
  return { agendamentos: lista.itens, atualizado: lista.chave === chave };
}
