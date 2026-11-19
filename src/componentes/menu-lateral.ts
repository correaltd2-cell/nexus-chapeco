'use client';
/* Como o menu lateral aparece, escolhido por quem usa e guardado no aparelho, como o
   tema e o painel do contato.
   - largura: "auto" recolhe sozinho até 1440px (tela dividida, decisão de 18/11);
     "aberto" mostra sempre os nomes; "recolhido" deixa sempre só ícone e nome curto.
   - cor: o escuro da marca, ou claro, da cor da interface.
   Se o navegador não deixar guardar (janela anônima), vale até recarregar. */
import { useSyncExternalStore } from 'react';

export type LarguraDoMenu = 'auto' | 'aberto' | 'recolhido';
export type CorDoMenu = 'escuro' | 'claro';

function preferencia<T extends string>(chave: string, padrao: T, validos: readonly T[]) {
  const ouvintes = new Set<() => void>();
  let atual: T | null = null;

  const le = (): T => {
    if (atual !== null) return atual;
    try {
      const v = localStorage.getItem(chave) as T | null;
      atual = v && validos.includes(v) ? v : padrao;
    } catch { atual = padrao; }
    return atual;
  };

  const deOutraAba = (e: StorageEvent) => {
    if (e.key !== chave) return;
    atual = null;
    ouvintes.forEach((f) => f());
  };

  const assina = (avisar: () => void) => {
    ouvintes.add(avisar);
    if (ouvintes.size === 1) window.addEventListener('storage', deOutraAba);
    return () => {
      ouvintes.delete(avisar);
      if (!ouvintes.size) window.removeEventListener('storage', deOutraAba);
    };
  };

  const define = (v: T) => {
    atual = v;
    try {
      if (v === padrao) localStorage.removeItem(chave);
      else localStorage.setItem(chave, v);
    } catch { /* segue só na memória */ }
    ouvintes.forEach((f) => f());
  };

  return { le, assina, define, padrao };
}

const largura = preferencia<LarguraDoMenu>('nexus-menu', 'auto', ['auto', 'aberto', 'recolhido']);
const cor = preferencia<CorDoMenu>('nexus-menu-cor', 'escuro', ['escuro', 'claro']);

/* no servidor não há aparelho para perguntar: nasce no padrão */
export function useLarguraDoMenu(): [LarguraDoMenu, (v: LarguraDoMenu) => void] {
  return [useSyncExternalStore(largura.assina, largura.le, () => largura.padrao), largura.define];
}
export function useCorDoMenu(): [CorDoMenu, (v: CorDoMenu) => void] {
  return [useSyncExternalStore(cor.assina, cor.le, () => cor.padrao), cor.define];
}
