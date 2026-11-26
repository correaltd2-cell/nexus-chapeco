'use client';
/* De onde os dados vêm. Com o Firebase configurado, do Firestore em tempo real.
   Sem ele, de uma base em memoria com dados ficticios: é o modo demonstracao, que
   serve para mostrar o sistema antes de existir banco, e depois para ensaiar telas
   sem sujar o banco da escola. As telas nao sabem a diferenca. */
import {
  addDoc, collection, deleteField, doc, getDocs, onSnapshot, orderBy, query, setDoc, updateDoc, where,
  writeBatch, type QueryConstraint,
} from 'firebase/firestore';
import { bd, configurado } from '@/lib/firebase/cliente';
import { simulacaoNoAparelho } from './simulacao';
import {
  AGENDADAS, AGENDAMENTOS, ALUNOS, ALUNOS_DAS_AULAS, AULAS_CURRICULO, BLOQUEIOS, CARTOES, CONVERSAS, LISTAS,
  LOGS_AGENDA, MENSAGENS, MODULOS, PERFIS, QUADROS, RECORRENCIAS, TEMPLATES,
} from './exemplo';

/** O sistema publicado aberto em modo simulação (simulacao.ts): dados fictícios, em memória. */
export const modoSimulacao = configurado && Boolean(simulacaoNoAparelho());
export const modoDemo = !configurado || modoSimulacao;

export type Doc = { id: string } & Record<string, unknown>;
export type Campos = Record<string, unknown>;
export interface OpLote { colecao: string; id: string; campos: Campos }
/** Uma escrita de um lote misto: criar ou trocar inteiro, juntar campos, ou apagar. */
export type OpGravacao =
  | { tipo: 'definir'; colecao: string; id: string; campos: Campos }
  | { tipo: 'atualizar'; colecao: string; id: string; campos: Campos }
  | { tipo: 'apagar'; colecao: string; id: string };

/** Sentinela de apagar campo, que vale nos dois mundos. */
export const APAGAR = Symbol('apagar');

function paraFirestore(campos: Campos): Campos {
  const saida: Campos = {};
  for (const [k, v] of Object.entries(campos)) saida[k] = v === APAGAR ? deleteField() : v;
  return saida;
}

/* ================= base em memoria ================= */
const memoria = new Map<string, Map<string, Doc>>();
const ouvintes = new Map<string, Set<(docs: Doc[]) => void>>();
let semente = false;

function guarda(nome: string, itens: Doc[]) {
  memoria.set(nome, new Map(itens.map((i) => [i.id, { ...i }])));
}

function semeia() {
  if (semente) return;
  semente = true;
  guarda('perfis', PERFIS as unknown as Doc[]);
  guarda('conversas', CONVERSAS as unknown as Doc[]);
  guarda('mensagens', MENSAGENS as unknown as Doc[]);
  guarda('quadros', QUADROS as unknown as Doc[]);
  guarda('listas', LISTAS as unknown as Doc[]);
  guarda('cartoes', CARTOES as unknown as Doc[]);
  guarda('agendadas', AGENDADAS as unknown as Doc[]);
  guarda('templates', TEMPLATES as unknown as Doc[]);
  guarda('alunos', ALUNOS as unknown as Doc[]);
  guarda('modulos', MODULOS as unknown as Doc[]);
  guarda('aulas', AULAS_CURRICULO as unknown as Doc[]);
  guarda('recorrencias', RECORRENCIAS as unknown as Doc[]);
  guarda('bloqueios', BLOQUEIOS as unknown as Doc[]);
  guarda('logs_agenda', LOGS_AGENDA as unknown as Doc[]);
  guarda('agendamentos', AGENDAMENTOS as unknown as Doc[]);
  for (const [id, alunos] of Object.entries(ALUNOS_DAS_AULAS)) guarda(`agendamentos/${id}/alunos`, alunos as unknown as Doc[]);
}

const tabela = (nome: string) => {
  semeia();
  if (!memoria.has(nome)) memoria.set(nome, new Map());
  return memoria.get(nome) as Map<string, Doc>;
};

function avisaOuvintes(nome: string) {
  const docs = [...tabela(nome).values()].map((d) => ({ ...d }));
  ouvintes.get(nome)?.forEach((cb) => cb(docs));
}

/* ================= a mesma porta para os dois ================= */

/** Ouve uma colecao inteira. Devolve a funcao que desliga. */
export function assina(nome: string, cb: (docs: Doc[]) => void): () => void {
  if (modoDemo) {
    if (!ouvintes.has(nome)) ouvintes.set(nome, new Set());
    const conjunto = ouvintes.get(nome) as Set<(docs: Doc[]) => void>;
    conjunto.add(cb);
    cb([...tabela(nome).values()].map((d) => ({ ...d })));
    return () => { conjunto.delete(cb); };
  }
  return onSnapshot(collection(bd(), nome), (s) => {
    cb(s.docs.map((d) => ({ id: d.id, ...d.data() }) as Doc));
  });
}

export async function cria(nome: string, dados: Campos): Promise<string> {
  if (modoDemo) {
    const id = `${nome[0]}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    tabela(nome).set(id, { id, ...dados } as Doc);
    avisaOuvintes(nome);
    return id;
  }
  const r = await addDoc(collection(bd(), nome), dados);
  return r.id;
}

export async function atualiza(nome: string, id: string, campos: Campos): Promise<void> {
  if (modoDemo) {
    const atual = tabela(nome).get(id);
    if (!atual) return;
    const novo = { ...atual };
    for (const [k, v] of Object.entries(campos)) {
      if (v === APAGAR) delete novo[k];
      else novo[k] = v;
    }
    tabela(nome).set(id, novo);
    avisaOuvintes(nome);
    return;
  }
  await updateDoc(doc(bd(), nome, id), paraFirestore(campos));
}

/** Grava um documento de id conhecido, criando se ainda nao existe.
    É o que a tela de configuracoes precisa: `config/atendimento` nasce no primeiro
    salvar, sem ninguem ter que criar o documento a mao antes. */
export async function define(nome: string, id: string, dados: Campos): Promise<void> {
  if (modoDemo) {
    const atual = tabela(nome).get(id) || { id };
    tabela(nome).set(id, { ...atual, ...dados, id } as Doc);
    avisaOuvintes(nome);
    return;
  }
  await setDoc(doc(bd(), nome, id), paraFirestore(dados), { merge: true });
}

export async function lote(ops: OpLote[]): Promise<void> {
  if (!ops.length) return;
  if (modoDemo) {
    for (const o of ops) await atualiza(o.colecao, o.id, o.campos);
    return;
  }
  const b = writeBatch(bd());
  for (const o of ops) b.update(doc(bd(), o.colecao, o.id), paraFirestore(o.campos));
  await b.commit();
}

/** Um id novo, para gravar várias coisas ligadas no mesmo lote. */
export function novoId(nome: string): string {
  if (modoDemo) return `${nome.split('/').pop()?.[0] || 'x'}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  return doc(collection(bd(), nome)).id;
}

/** Várias escritas que valem juntas ou não valem: no Firestore, lotes de até 450. */
export async function grava(ops: OpGravacao[]): Promise<void> {
  if (!ops.length) return;
  if (modoDemo) {
    const mexidas = new Set<string>();
    for (const o of ops) {
      const t = tabela(o.colecao);
      if (o.tipo === 'apagar') t.delete(o.id);
      else if (o.tipo === 'definir') t.set(o.id, { ...(o.campos as Doc), id: o.id });
      else {
        const atual = t.get(o.id);
        if (!atual) continue;
        const novo = { ...atual };
        for (const [k, v] of Object.entries(o.campos)) {
          if (v === APAGAR) delete novo[k]; else novo[k] = v;
        }
        t.set(o.id, novo);
      }
      mexidas.add(o.colecao);
    }
    mexidas.forEach(avisaOuvintes);
    return;
  }
  for (let i = 0; i < ops.length; i += 450) {
    const b = writeBatch(bd());
    for (const o of ops.slice(i, i + 450)) {
      const ref = doc(bd(), o.colecao, o.id);
      if (o.tipo === 'apagar') b.delete(ref);
      else if (o.tipo === 'definir') b.set(ref, paraFirestore(o.campos));
      else b.update(ref, paraFirestore(o.campos));
    }
    await b.commit();
  }
}

/** Filtro simples que vale nos dois mundos: igual, um entre vários, contém (array) e faixa. */
export type Filtro =
  | { campo: string; op: '=='; valor: unknown }
  | { campo: string; op: 'in'; valor: unknown[] }
  | { campo: string; op: 'contem'; valor: unknown }
  | { campo: string; op: '>=' | '<'; valor: string };

function passa(d: Doc, f: Filtro) {
  const v = d[f.campo];
  if (f.op === '==') return v === f.valor;
  if (f.op === 'in') return f.valor.includes(v);
  if (f.op === 'contem') return Array.isArray(v) && v.includes(f.valor);
  if (typeof v !== 'string') return false;
  return f.op === '>=' ? v >= f.valor : v < f.valor;
}

function restricoes(filtros: Filtro[], ordem?: string): QueryConstraint[] {
  const r: QueryConstraint[] = filtros.map((f) =>
    where(f.campo, f.op === 'contem' ? 'array-contains' : f.op, f.valor));
  if (ordem) r.push(orderBy(ordem));
  return r;
}

/** Ouve só o que passa nos filtros (a agenda ouve o período que está na tela). */
export function assinaFiltro(nome: string, filtros: Filtro[], cb: (docs: Doc[]) => void): () => void {
  if (modoDemo) {
    return assina(nome, (docs) => cb(docs.filter((d) => filtros.every((f) => passa(d, f)))));
  }
  return onSnapshot(query(collection(bd(), nome), ...restricoes(filtros)), (s) => {
    cb(s.docs.map((d) => ({ id: d.id, ...d.data() }) as Doc));
  });
}

/** Lê uma vez (conferir conflito numa série inteira, montar o relatório). */
/** Ouve um documento só (null quando não existe ou some). Para quem não pode ler a
    coleção inteira, como a mensagem de uma prova vista pela coordenação. */
export function assinaUm(nome: string, id: string, cb: (d: Doc | null) => void): () => void {
  if (modoDemo) return assina(nome, (docs) => cb(docs.find((d) => d.id === id) || null));
  return onSnapshot(doc(bd(), nome, id), (s) => cb(s.exists() ? ({ id: s.id, ...s.data() } as Doc) : null));
}

export async function busca(nome: string, filtros: Filtro[], ordem?: string): Promise<Doc[]> {
  if (modoDemo) {
    const docs = [...tabela(nome).values()].filter((d) => filtros.every((f) => passa(d, f))).map((d) => ({ ...d }));
    return ordem ? docs.sort((a, b) => String(a[ordem] ?? '').localeCompare(String(b[ordem] ?? ''))) : docs;
  }
  const s = await getDocs(query(collection(bd(), nome), ...restricoes(filtros, ordem)));
  return s.docs.map((d) => ({ id: d.id, ...d.data() }) as Doc);
}

/** No modo demonstracao a mensagem enviada entra direto na base de memoria. */
export const podeFalarComServidor = () => !modoDemo;
