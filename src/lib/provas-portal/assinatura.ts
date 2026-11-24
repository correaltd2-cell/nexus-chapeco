/* A assinatura de cada pedido da central ao portal (contrato v1 proposto, ver
   docs/integracao-provas-portal.md). Fica fora do cliente para o teste conferir o formato
   com o mesmo vetor que o documento dá ao responsável pelo portal.
   texto assinado = "<momento>.<MÉTODO>.<caminho com a busca>.<sha256 hex do corpo>"
   cabeçalho      = "v1=" + HMAC-SHA256(segredo, texto assinado) em hex */
import { createHash, createHmac } from 'node:crypto';

export const sha256Hex = (t: string) => createHash('sha256').update(t, 'utf8').digest('hex');

export const textoAssinado = (momento: number, metodo: string, caminhoComBusca: string, corpo: string) =>
  `${momento}.${metodo.toUpperCase()}.${caminhoComBusca}.${sha256Hex(corpo)}`;

export function assinaPedido(segredo: string, momento: number, metodo: string, caminhoComBusca: string, corpo: string) {
  return `v1=${createHmac('sha256', segredo).update(textoAssinado(momento, metodo, caminhoComBusca, corpo), 'utf8').digest('hex')}`;
}
