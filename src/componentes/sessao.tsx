'use client';
/* Quem está logado, o perfil dele e o tema. Tudo que a casca precisa saber. */
import {
  createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode,
} from 'react';
import { modoSimulacao } from '@/lib/dados/fonte';
import { saiDaSimulacao, simulacaoNoAparelho } from '@/lib/dados/simulacao';
import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, bd, configurado } from '@/lib/firebase/cliente';
import { limpaEntrada, loginValeAqui } from '@/lib/firebase/sessao-aparelho';
import { avisa } from '@/componentes/aviso';
import type { Perfil } from '@/lib/dominio/tipos';

type Estado = 'carregando' | 'fora' | 'dentro' | 'sem-perfil' | 'sem-config';

/* Sem Firebase configurado o sistema abre em demonstracao, com dados ficticios e
   um perfil de administrador, para dar para ver as telas antes de existir banco. */
export const PERFIL_DEMO: Perfil = {
  id: 'u-gui', nome: 'Guilherme', email: 'demonstracao@nexus', papel: 'admin',
  setores: ['recepcao', 'financeiro', 'coordenacao', 'kids'],
  avisaNoWhats: false, ativo: true, criadoEm: new Date().toISOString(),
};

/* Na simulação quem usa é o perfil da demonstração (administrador, todos os setores),
   com o nome de quem entrou, e sem usuário do Firebase: nenhuma chamada ao servidor sai. */
const PERFIL_SIMULACAO: Perfil | null = modoSimulacao
  ? { ...PERFIL_DEMO, nome: simulacaoNoAparelho()?.nome || 'Equipe' }
  : null;
const nada = () => () => {};

interface Sessao {
  estado: Estado;
  usuario: User | null;
  perfil: Perfil | null;
  sair: () => Promise<void>;
}

const Ctx = createContext<Sessao>({ estado: 'carregando', usuario: null, perfil: null, sair: async () => {} });
export const useSessao = () => useContext(Ctx);

export function ProvedorDeSessao({ children }: { children: ReactNode }) {
  const [estado, setEstado] = useState<Estado>(configurado ? 'carregando' : 'dentro');
  const [usuario, setUsuario] = useState<User | null>(null);
  const [perfil, setPerfil] = useState<Perfil | null>(configurado ? null : PERFIL_DEMO);

  /* a simulação só vale no navegador: no servidor, e na primeira pintura, é o normal */
  const simulando = useSyncExternalStore(nada, () => modoSimulacao, () => false);

  useEffect(() => {
    if (!configurado || modoSimulacao) return;
    return onAuthStateChanged(auth(), (u) => {
      /* login lembrado pelo navegador, mas a pessoa não entrou nesta aba nem pediu para
         continuar conectada: sai e pede e-mail e senha (dominio/sessao.ts) */
      if (u && !loginValeAqui()) {
        setUsuario(null); setPerfil(null); setEstado('fora');
        void signOut(auth());
        return;
      }
      setUsuario(u);
      /* entrou: até o perfil chegar a sessão está carregando, não "fora". Antes ficava
         "fora" nesse meio tempo, a casca mandava de volta para a tela de entrar e o
         primeiro login parecia falhar (27/11/2026: "tem que fazer 2 vezes") */
      if (!u) { setPerfil(null); setEstado('fora'); } else setEstado('carregando');
    });
  }, []);

  useEffect(() => {
    if (!configurado || modoSimulacao || !usuario) return;
    return onSnapshot(
      doc(bd(), 'perfis', usuario.uid),
      (d) => {
        if (!d.exists()) { setPerfil(null); setEstado('sem-perfil'); return; }
        const p = { id: d.id, ...d.data() } as Perfil;
        setPerfil(p);
        setEstado(p.ativo ? 'dentro' : 'sem-perfil');
      },
      () => setEstado('sem-perfil'),
    );
  }, [usuario]);

  const sair = async () => {
    if (modoSimulacao) { saiDaSimulacao(); return; }
    if (!configurado) { avisa('Na demonstração não tem login para sair.'); return; }
    limpaEntrada();
    await signOut(auth());
  };

  const valor: Sessao = simulando && PERFIL_SIMULACAO
    ? { estado: 'dentro', usuario: null, perfil: PERFIL_SIMULACAO, sair }
    : { estado, usuario, perfil, sair };
  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

/* ---------- tema ---------- */
export type Tema = 'claro' | 'escuro' | 'auto';
const CHAVE = 'nexus-tema';

export function leTema(): Tema {
  try {
    const t = localStorage.getItem(CHAVE);
    if (t === 'claro' || t === 'escuro') return t;
  } catch { /* janela anônima, armazenamento bloqueado */ }
  return 'auto';
}

export function aplicaTema(t: Tema) {
  document.body.classList.toggle('t-claro', t === 'claro');
  document.body.classList.toggle('t-escuro', t === 'escuro');
  try {
    if (t === 'auto') localStorage.removeItem(CHAVE);
    else localStorage.setItem(CHAVE, t);
  } catch { /* segue sem guardar */ }
}

export function escuroAgora(t: Tema) {
  if (t !== 'auto') return t === 'escuro';
  const d = document.documentElement.getAttribute('data-theme');
  if (d) return d === 'dark';
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

/* O tema vive fora do React: na escolha guardada no aparelho e no ajuste do sistema
   operacional. useSyncExternalStore é a porta certa para ler isso. */
const ouvintesDoTema = new Set<() => void>();
const mudouOTema = () => ouvintesDoTema.forEach((f) => f());

function assinaTema(avisar: () => void) {
  ouvintesDoTema.add(avisar);
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  mq.addEventListener('change', avisar);
  return () => { ouvintesDoTema.delete(avisar); mq.removeEventListener('change', avisar); };
}

export function useTema() {
  /* no servidor nao existe aparelho para perguntar: assume automatico e claro */
  const tema = useSyncExternalStore(assinaTema, leTema, () => 'auto' as Tema);
  const escuro = useSyncExternalStore(assinaTema, () => escuroAgora(leTema()), () => false);

  useEffect(() => { aplicaTema(tema); }, [tema]);

  const setTema = (t: Tema) => { aplicaTema(t); mudouOTema(); };
  return { tema, escuro, setTema };
}
