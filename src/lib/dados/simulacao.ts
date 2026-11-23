/* O modo simulação: o sistema publicado mostra os dados fictícios da demonstração
   (conversas, quadros, alunos, agenda, relatórios), para mostrar à equipe como tudo
   funciona sem tocar no banco da escola nem no WhatsApp. Pedido do cliente (23/11/2026).
   Vale só neste aparelho: entrar guarda uma marca no navegador e recarrega; a camada de
   dados (fonte.ts) lê a marca e passa a usar a base em memória, como na demonstração.
   Nada é gravado no banco, então não sobra nada para apagar: "Sair da simulação" tira
   a marca e o sistema volta aos dados de verdade. O que se muda na simulação some ao
   recarregar a página. */

const CHAVE = 'nexus-simulacao';

/** Quem entrou na simulação neste aparelho (o nome aparece como o de quem usa). */
export function simulacaoNoAparelho(): { nome: string } | null {
  if (typeof window === 'undefined') return null;
  try {
    const bruto = localStorage.getItem(CHAVE);
    if (!bruto) return null;
    const d = JSON.parse(bruto) as { nome?: unknown };
    return { nome: typeof d.nome === 'string' && d.nome.trim() ? d.nome.trim() : 'Equipe' };
  } catch {
    return null;
  }
}

/** Liga a simulação neste aparelho e abre as conversas. Falso se o navegador não deixou guardar. */
export function entraNaSimulacao(nome: string): boolean {
  try {
    localStorage.setItem(CHAVE, JSON.stringify({ nome, desde: new Date().toISOString() }));
  } catch {
    return false;
  }
  /* recarga inteira de propósito: a camada de dados lê a marca uma vez, ao abrir */
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.assign('/conversas');
  return true;
}

/** Volta aos dados de verdade. */
export function saiDaSimulacao() {
  try { localStorage.removeItem(CHAVE); } catch { /* sem armazenamento: já não estava guardada */ }
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.assign('/conversas');
}
