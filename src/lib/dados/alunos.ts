'use client';
/* Apagar aluno de vez (pedido do cliente, 24/11/2026: "não só deixar inativo, mas
   deletar o aluno da planilha"). Primeiro se monta o plano, para a tela dizer antes o
   que vai acontecer; depois tudo vai num lote só:
   - o aluno some da coleção alunos;
   - sai das próximas aulas da agenda (a particular dele, que fica sem ninguém, sai da
     agenda), com a linha do log; as aulas que já passaram ficam, porque são o histórico
     de presença e notas, e guardam o nome dele;
   - as conversas ligadas a ele continuam, só sem a ligação.
   A regra das aulas é pura, em dominio/alunos.ts (aulasSemOsAlunos). */
import { APAGAR, busca, grava, type OpGravacao } from './fonte';
import { opsDeTirarDasAulas, type Quem } from './agenda';
import { aulasSemOsAlunos } from '@/lib/dominio/alunos';
import type { Agendamento } from '@/lib/dominio/agenda';

export interface PlanoDeApagar {
  ids: string[];
  nomes: string[];
  aulas: number;        // próximas aulas de que eles saem
  vazias: number;       // das quais saem da agenda, por ficarem sem ninguém
  conversas: number;    // conversas que perdem a ligação
  ops: OpGravacao[];
}

export async function planoDeApagar(quem: Quem, alunos: { id: string; nome: string }[]): Promise<PlanoDeApagar> {
  const ids = alunos.map((a) => a.id);
  const aulas = new Map<string, Agendamento>();
  const conversas = new Set<string>();
  for (const id of ids) {
    for (const d of await busca('agendamentos', [{ campo: 'alunoIds', op: 'contem', valor: id }])) aulas.set(d.id, d as unknown as Agendamento);
    for (const d of await busca('conversas', [{ campo: 'alunoId', op: '==', valor: id }])) conversas.add(d.id);
  }
  const mudancas = aulasSemOsAlunos(ids, [...aulas.values()], new Date().toISOString());
  const ops: OpGravacao[] = [
    ...opsDeTirarDasAulas(quem, mudancas),
    ...[...conversas].map((id): OpGravacao => ({ tipo: 'atualizar', colecao: 'conversas', id, campos: { alunoId: APAGAR } })),
    ...ids.map((id): OpGravacao => ({ tipo: 'apagar', colecao: 'alunos', id })),
  ];
  return {
    ids, nomes: alunos.map((a) => a.nome), aulas: mudancas.length, vazias: mudancas.filter((m) => m.vazia).length, conversas: conversas.size, ops,
  };
}

export const apaga = (plano: PlanoDeApagar) => grava(plano.ops);
