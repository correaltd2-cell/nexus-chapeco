'use client';
/* O painel do contato recolhido ou aberto. Quem trabalha com a tela dividida recolhe
   uma vez e espera que ele continue assim na próxima conversa e no dia seguinte, então
   a escolha fica guardada no aparelho, como o tema. Se o navegador não deixar guardar
   (janela anônima), vale até recarregar a página. */
import { useSyncExternalStore } from 'react';

const CHAVE = 'nexus-painel-contato';
const ouvintes = new Set<() => void>();
let atual: boolean | null = null;

function le(): boolean {
  if (atual !== null) return atual;
  try { atual = localStorage.getItem(CHAVE) === 'recolhido'; } catch { atual = false; }
  return atual;
}

/* outra aba que mudou a escolha também vale aqui */
function deOutraAba(e: StorageEvent) {
  if (e.key !== CHAVE) return;
  atual = e.newValue === 'recolhido';
  ouvintes.forEach((f) => f());
}

function assina(avisar: () => void) {
  ouvintes.add(avisar);
  if (ouvintes.size === 1) window.addEventListener('storage', deOutraAba);
  return () => {
    ouvintes.delete(avisar);
    if (!ouvintes.size) window.removeEventListener('storage', deOutraAba);
  };
}

function define(recolhido: boolean) {
  atual = recolhido;
  try {
    if (recolhido) localStorage.setItem(CHAVE, 'recolhido');
    else localStorage.removeItem(CHAVE);
  } catch { /* segue só na memória */ }
  ouvintes.forEach((f) => f());
}

/** No servidor não há aparelho para perguntar: nasce aberto. */
export function usePainelRecolhido(): [boolean, (recolhido: boolean) => void] {
  return [useSyncExternalStore(assina, le, () => false), define];
}
