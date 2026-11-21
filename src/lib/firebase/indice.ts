/* Consulta que depende de índice composto no Firestore, com reserva. O índice é criado
   pelo firebase deploy (firestore.indexes.json) ou pelo link que o erro traz; até ele
   existir, a consulta falha com FAILED_PRECONDITION. O atendimento automático não pode
   parar por isso: a reserva lê do jeito simples (só igualdade, que não pede índice) e
   filtra e ordena aqui. Foi um índice faltando que calou os botões do menu em 21/11. */
import 'server-only';

export const faltaIndice = (e: unknown) => {
  const x = e as { code?: number | string; message?: string };
  return x?.code === 9 || x?.code === 'failed-precondition' || /requires an index/i.test(String(x?.message || ''));
};

export async function comReserva<T>(onde: string, rapida: () => Promise<T>, simples: () => Promise<T>): Promise<T> {
  try {
    return await rapida();
  } catch (e) {
    if (!faltaIndice(e)) throw e;
    console.warn(`[indice] ${onde}: falta o índice composto no Firestore; lendo do jeito simples.`);
    return simples();
  }
}
