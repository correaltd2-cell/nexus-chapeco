'use client';
/* As duas marcas do login no navegador (regra em dominio/sessao.ts):
   - "entrou nesta aba" fica no sessionStorage, que some quando a aba fecha;
   - "continuar conectado" fica no localStorage, até a pessoa tocar em Sair.
   Sem armazenamento (janela anônima, bloqueio), vale o mais seguro: pede login. */
import { loginVale } from '@/lib/dominio/sessao';

const ABA = 'nexus-entrou-nesta-aba';
const MANTER = 'nexus-continuar-conectado';

function le(onde: () => Storage, chave: string) {
  try { return onde().getItem(chave) === '1'; } catch { return false; }
}
function grava(onde: () => Storage, chave: string, sim: boolean) {
  try { if (sim) onde().setItem(chave, '1'); else onde().removeItem(chave); } catch { /* segue sem guardar */ }
}
const sessao = () => window.sessionStorage;
const local = () => window.localStorage;

/** Antes de entrar: marca esta aba e, se pediu, o aparelho. */
export function marcaEntrada(continuarConectado: boolean) {
  grava(sessao, ABA, true);
  grava(local, MANTER, continuarConectado);
}

/** Ao sair (ou quando o login falha): tira as duas marcas. */
export function limpaEntrada() {
  grava(sessao, ABA, false);
  grava(local, MANTER, false);
}

/** O login que o navegador lembrou vale aqui? */
export const loginValeAqui = () => loginVale({ manterConectado: le(local, MANTER), entrouNestaAba: le(sessao, ABA) });
