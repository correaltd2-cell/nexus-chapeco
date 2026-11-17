'use client';
/* Quem está logado, o perfil dele e o tema. Tudo que a casca precisa saber. */
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, bd, configurado } from '@/lib/firebase/cliente';
import type { Perfil } from '@/lib/dominio/tipos';

type Estado = 'carregando' | 'fora' | 'dentro' | 'sem-perfil' | 'sem-config';

interface Sessao {
  estado: Estado;
  usuario: User | null;
  perfil: Perfil | null;
  sair: () => Promise<void>;
}

const Ctx = createContext<Sessao>({ estado: 'carregando', usuario: null, perfil: null, sair: async () => {} });
export const useSessao = () => useContext(Ctx);

export function ProvedorDeSessao({ children }: { children: ReactNode }) {
  const [estado, setEstado] = useState<Estado>(configurado ? 'carregando' : 'sem-config');
  const [usuario, setUsuario] = useState<User | null>(null);
  const [perfil, setPerfil] = useState<Perfil | null>(null);

  useEffect(() => {
    if (!configurado) return;
    return onAuthStateChanged(auth(), (u) => {
      setUsuario(u);
      if (!u) { setPerfil(null); setEstado('fora'); }
    });
  }, []);

  useEffect(() => {
    if (!configurado || !usuario) return;
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

  const sair = async () => { if (configurado) await signOut(auth()); };

  return <Ctx.Provider value={{ estado, usuario, perfil, sair }}>{children}</Ctx.Provider>;
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

export function useTema() {
  const [tema, setTemaEstado] = useState<Tema>('auto');
  const [escuro, setEscuro] = useState(false);
  useEffect(() => {
    const t = leTema();
    setTemaEstado(t); aplicaTema(t); setEscuro(escuroAgora(t));
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const ouve = () => setEscuro(escuroAgora(leTema()));
    mq.addEventListener('change', ouve);
    return () => mq.removeEventListener('change', ouve);
  }, []);
  const setTema = (t: Tema) => { setTemaEstado(t); aplicaTema(t); setEscuro(escuroAgora(t)); };
  return { tema, escuro, setTema };
}
