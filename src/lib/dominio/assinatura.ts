/* A assinatura nas mensagens da equipe: o nome de quem envia, em negrito, em cima do
   texto, do jeito que o aluno lê no WhatsApp ("*Guilherme:*" e o texto embaixo).
   Cada pessoa escolhe como o nome aparece (perfis.assinatura); sem escolha, vai o
   primeiro nome. Modelo aprovado sai sem assinatura: o texto é o que a Meta aprovou.
   Puro, sem import. Prova: node --experimental-strip-types testes/assinatura.ts */

export const ASSINATURA_MAXIMO = 30;

/* asterisco, sublinhado, til e crase mexem na formatação do WhatsApp */
const limpa = (t: string) => t.replace(/[*_~`]/g, '').replace(/\s+/g, ' ').trim();

/** Como o nome da pessoa aparece na mensagem. */
export function nomeDaAssinatura(p: { nome?: string | null; assinatura?: string | null }): string {
  const escolhida = limpa(p.assinatura || '');
  if (escolhida) return escolhida.slice(0, ASSINATURA_MAXIMO);
  return (limpa(p.nome || '').split(' ')[0] || '').slice(0, ASSINATURA_MAXIMO);
}

/** O texto como sai para o aluno, com a assinatura em cima. Texto vazio continua vazio. */
export function assinaTexto(texto: string, nome: string): string {
  const t = (texto || '').trim();
  if (!t || !nome) return t;
  const cabeca = `*${nome}:*`;
  return t.startsWith(cabeca) ? t : `${cabeca}\n${t}`;
}
