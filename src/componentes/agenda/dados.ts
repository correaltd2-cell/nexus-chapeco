'use client';
/* O que a agenda lê, em tempo real: professores (da equipe), alunos, módulos, aulas do
   currículo e bloqueios inteiros; agendamentos só do período que está na tela. */
import { useEffect, useMemo, useState } from 'react';
import { assina, assinaFiltro } from '@/lib/dados/fonte';
import { corDoProfessor, type Agendamento, type AulaDoCurriculo, type Bloqueio, type Modulo, type Professor } from '@/lib/dominio/agenda';
import type { Aluno, Perfil } from '@/lib/dominio/tipos';
import { porCodigo } from '@/lib/dominio/alunos';

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

/** semAlunos: o professor não lê a ficha dos alunos (telefone, contrato): na agenda dele
    os nomes vêm da própria aula. */
export function useCadastros(o: { semAlunos?: boolean } = {}): Cadastros {
  const semAlunos = Boolean(o.semAlunos);
  const [perfis, setPerfis] = useState<Perfil[] | null>(null);
  const [alunos, setAlunos] = useState<Aluno[]>([]);
  const [modulos, setModulos] = useState<Modulo[]>([]);
  const [aulas, setAulas] = useState<AulaDoCurriculo[]>([]);
  const [bloqueios, setBloqueios] = useState<Bloqueio[]>([]);

  useEffect(() => assina('perfis', (d) => setPerfis(d as unknown as Perfil[])), []);
  /* alunos em ordem de código, como na planilha de marcação (24/11/2026) */
  useEffect(() => (semAlunos ? undefined : assina('alunos', (d) => setAlunos((d as unknown as Aluno[]).sort(porCodigo)))), [semAlunos]);
  useEffect(() => assina('modulos', (d) => setModulos((d as unknown as Modulo[]).sort((a, b) => a.ordem - b.ordem))), []);
  useEffect(() => assina('aulas', (d) => setAulas((d as unknown as AulaDoCurriculo[]).sort((a, b) => a.ordem - b.ordem))), []);
  useEffect(() => assina('bloqueios', (d) => setBloqueios(d as unknown as Bloqueio[])), []);

  const professores = useMemo(() => (perfis || [])
    .filter(ehProfessor)
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
    .map((p, i) => ({ id: p.id, nome: p.nome, cor: corDoProfessor(p, i), ativo: p.ativo })), [perfis]);

  return { professores, perfis: perfis || [], alunos, modulos, aulas, bloqueios, carregado: perfis !== null };
}

/** As aulas do período na tela. Troca de período troca a escuta, sem recarregar.
    soDoProfessor: o professor só lê as aulas dele (as regras do banco recusam o resto),
    então pede pelo professor e o período sai em memória: sem índice composto. */
export function useAgendamentos(de: string, ate: string, soDoProfessor = '') {
  const [lista, setLista] = useState<{ chave: string; itens: Agendamento[] }>({ chave: '', itens: [] });
  const chave = `${de}|${ate}|${soDoProfessor}`;
  useEffect(() => {
    if (!de || !ate) return;
    const marca = `${de}|${ate}|${soDoProfessor}`;
    if (soDoProfessor) {
      const [a, b] = [new Date(de).getTime(), new Date(ate).getTime()];
      return assinaFiltro('agendamentos', [{ campo: 'professorId', op: '==', valor: soDoProfessor }], (d) => setLista({
        chave: marca,
        itens: (d as unknown as Agendamento[]).filter((x) => { const t = new Date(x.inicio).getTime(); return t >= a && t < b; }),
      }));
    }
    return assinaFiltro('agendamentos', [
      { campo: 'inicio', op: '>=', valor: de },
      { campo: 'inicio', op: '<', valor: ate },
    ], (d) => setLista({ chave: marca, itens: d as unknown as Agendamento[] }));
  }, [de, ate, soDoProfessor]);
  /* enquanto o período novo não chega, mostra o anterior em vez de piscar vazio */
  return { agendamentos: lista.itens, atualizado: lista.chave === chave };
}

/** Todas as aulas de cada aluno da lista (passadas e futuras), para a conversa mostrar
    a próxima, as últimas e sugerir a seguinte. Uma escuta por aluno. */
export function useAulasDosAlunos(ids: string[]): Record<string, Agendamento[]> {
  const chave = ids.join('|');
  const [porAluno, setPorAluno] = useState<{ chave: string; dados: Record<string, Agendamento[]> }>({ chave: '', dados: {} });
  useEffect(() => {
    if (!chave) return;
    const paradas = chave.split('|').map((id) => assinaFiltro('agendamentos', [{ campo: 'alunoIds', op: 'contem', valor: id }],
      (d) => setPorAluno((p) => ({ chave, dados: { ...(p.chave === chave ? p.dados : {}), [id]: d as unknown as Agendamento[] } }))));
    return () => paradas.forEach((pare) => pare());
  }, [chave]);
  return porAluno.chave === chave ? porAluno.dados : {};
}
