'use client';
/* De onde os dados vêm. Com o Firebase configurado, do Firestore em tempo real.
   Sem ele, de uma base em memoria com dados ficticios: é o modo demonstracao, que
   serve para mostrar o sistema antes de existir banco, e depois para ensaiar telas
   sem sujar o banco da escola. As telas nao sabem a diferenca. */
import {
  addDoc, collection, deleteField, doc, onSnapshot, setDoc, updateDoc, writeBatch,
} from 'firebase/firestore';
import { bd, configurado } from '@/lib/firebase/cliente';
import { AGENDADAS, CARTOES, CONVERSAS, LISTAS, MENSAGENS, PERFIS, QUADROS } from './exemplo';

export const modoDemo = !configurado;

export type Doc = { id: string } & Record<string, unknown>;
export type Campos = Record<string, unknown>;
export interface OpLote { colecao: string; id: string; campos: Campos }

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

/** No modo demonstracao a mensagem enviada entra direto na base de memoria. */
export const podeFalarComServidor = () => !modoDemo;
