'use client';
/* Preferências de quem usa, guardadas no aparelho, como o tema e o painel do contato.
   Como o menu lateral aparece:
   - largura: "auto" recolhe sozinho até 1440px (tela dividida, decisão de 18/11);
     "aberto" mostra sempre os nomes; "recolhido" deixa sempre só ícone e nome curto.
   - cor: o escuro da marca, ou claro, da cor da interface.
   E se a comemoração de passar a conversa de setor aparece (festa.tsx).
   Se o navegador não deixar guardar (janela anônima), vale até recarregar. */
import { useSyncExternalStore } from 'react';

export type LarguraDoMenu = 'auto' | 'aberto' | 'recolhido';
export type CorDoMenu = 'escuro' | 'claro';
export type Animacao = 'ligada' | 'desligada';
export type Avisos = 'ligados' | 'desligados';
export type SomDoAviso = 'ligado' | 'desligado';

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
const animacao = preferencia<Animacao>('nexus-animacao', 'ligada', ['ligada', 'desligada']);
const avisos = preferencia<Avisos>('nexus-avisos', 'ligados', ['ligados', 'desligados']);
const som = preferencia<SomDoAviso>('nexus-som', 'ligado', ['ligado', 'desligado']);

/** Se o aviso de mensagem nova toca som neste aparelho (chamado fora de componente). */
export const somLigado = () => som.le() === 'ligado';

/** Para quem decide fora de componente (a festa é chamada no clique). */
export const animacaoLigada = () => animacao.le() === 'ligada';

/* no servidor não há aparelho para perguntar: nasce no padrão */
export function useLarguraDoMenu(): [LarguraDoMenu, (v: LarguraDoMenu) => void] {
  return [useSyncExternalStore(largura.assina, largura.le, () => largura.padrao), largura.define];
}
export function useCorDoMenu(): [CorDoMenu, (v: CorDoMenu) => void] {
  return [useSyncExternalStore(cor.assina, cor.le, () => cor.padrao), cor.define];
}
export function useAnimacao(): [Animacao, (v: Animacao) => void] {
  return [useSyncExternalStore(animacao.assina, animacao.le, () => animacao.padrao), animacao.define];
}
/** Se este aparelho quer o aviso de mensagem nova (componentes/avisos.tsx). */
export function useAvisos(): [Avisos, (v: Avisos) => void] {
  return [useSyncExternalStore(avisos.assina, avisos.le, () => avisos.padrao), avisos.define];
}
/** Se o aviso toca som neste aparelho. */
export function useSomDoAviso(): [SomDoAviso, (v: SomDoAviso) => void] {
  return [useSyncExternalStore(som.assina, som.le, () => som.padrao), som.define];
}

/* ---- a agenda (24/11/2026) ----
   Na Semana, no Mês e no Dia, o bloqueio de um professor só aparece se a pessoa pedir
   (na Grade ele fica sempre na coluna do professor). E a aula cancelada pode sumir. */
export type BloqueiosNaAgenda = 'escondidos' | 'mostrados';
export type CanceladasNaAgenda = 'mostradas' | 'escondidas';
const bloqueiosNaAgenda = preferencia<BloqueiosNaAgenda>('nexus-agenda-bloqueios', 'escondidos', ['escondidos', 'mostrados']);
const canceladasNaAgenda = preferencia<CanceladasNaAgenda>('nexus-agenda-canceladas', 'mostradas', ['mostradas', 'escondidas']);
export function useBloqueiosNaAgenda(): [BloqueiosNaAgenda, (v: BloqueiosNaAgenda) => void] {
  return [useSyncExternalStore(bloqueiosNaAgenda.assina, bloqueiosNaAgenda.le, () => bloqueiosNaAgenda.padrao), bloqueiosNaAgenda.define];
}
export function useCanceladasNaAgenda(): [CanceladasNaAgenda, (v: CanceladasNaAgenda) => void] {
  return [useSyncExternalStore(canceladasNaAgenda.assina, canceladasNaAgenda.le, () => canceladasNaAgenda.padrao), canceladasNaAgenda.define];
}
