'use client';
/* O relogio da tela. "Esperando ha 12 min" precisa andar sozinho, e ler a hora no
   corpo do componente nao e permitido: aqui ela vira uma fonte externa, que avisa
   a cada meio minuto. Antes da hidratacao devolve zero, e quem usa trata como
   "ainda nao sei a hora" em vez de mostrar 1970. */
import { useSyncExternalStore } from 'react';

const PASSO_MS = 30_000;

const assina = (aviso: () => void) => {
  const t = setInterval(aviso, PASSO_MS);
  return () => clearInterval(t);
};

const agoraArredondado = () => Math.floor(Date.now() / PASSO_MS) * PASSO_MS;

export function useAgora(): Date {
  return new Date(useSyncExternalStore(assina, agoraArredondado, () => 0));
}

export const horaConhecida = (d: Date) => d.getTime() > 0;
