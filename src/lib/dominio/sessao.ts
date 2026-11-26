/* O login em cada aparelho (26/11/2026, pedido do cliente: "quero que tenha tela de login
   quando abre e também opção de sair da conta; está entrando direto toda vez").
   Por padrão o login vale só enquanto a aba está aberta: abriu o sistema de novo, pede
   e-mail e senha. Quem marca "Continuar conectado neste aparelho" no login fica entrando
   direto ali até tocar em Sair. Regras puras; quem guarda a marca no navegador é
   src/lib/firebase/sessao-aparelho.ts.
   Prova: node --experimental-strip-types testes/sessao.ts */

/** O login que o navegador lembrou vale nesta aba? Só se a pessoa entrou nesta aba, ou
    se pediu para continuar conectada neste aparelho. O resto (um login antigo, de antes
    desta regra, ou de outra aba) sai na hora e cai na tela de entrar. */
export const loginVale = (o: { manterConectado: boolean; entrouNestaAba: boolean }) =>
  o.manterConectado || o.entrouNestaAba;

/** Para onde ir depois de entrar: a tela que a pessoa tentou abrir (o link do aviso no
    celular, por exemplo), desde que seja do próprio sistema; senão, as conversas. */
export function destinoDepoisDeEntrar(volta: string | null | undefined): string {
  const v = (volta || '').trim();
  if (!v.startsWith('/') || v.startsWith('//') || v.startsWith('/\\') || /[\r\n]/.test(v)) return '/conversas';
  if (v === '/' || v.startsWith('/entrar')) return '/conversas';
  return v;
}
