/* Prova do login em cada aparelho (src/lib/dominio/sessao.ts).
   Rodar:  node --experimental-strip-types testes/sessao.ts  */
import { destinoDepoisDeEntrar, loginVale } from '../src/lib/dominio/sessao.ts';

let falhas = 0;
function igual<T>(nome: string, veio: T, esperado: T) {
  if (JSON.stringify(veio) !== JSON.stringify(esperado)) {
    falhas += 1;
    console.log(`  x ${nome}\n    esperado ${JSON.stringify(esperado)}\n    veio     ${JSON.stringify(veio)}`);
  }
}

igual('abriu o sistema de novo, sem marcar nada: pede login', loginVale({ manterConectado: false, entrouNestaAba: false }), false);
igual('entrou nesta aba: segue dentro ao recarregar', loginVale({ manterConectado: false, entrouNestaAba: true }), true);
igual('marcou "continuar conectado": entra direto', loginVale({ manterConectado: true, entrouNestaAba: false }), true);

igual('volta para a conversa do link', destinoDepoisDeEntrar('/conversas?c=abc'), '/conversas?c=abc');
igual('volta para a agenda do dia', destinoDepoisDeEntrar('/aulas?data=2026-11-27&hora=18:30'), '/aulas?data=2026-11-27&hora=18:30');
igual('sem destino: conversas', [destinoDepoisDeEntrar(null), destinoDepoisDeEntrar(''), destinoDepoisDeEntrar('/')], ['/conversas', '/conversas', '/conversas']);
igual('nunca leva para fora do sistema', [destinoDepoisDeEntrar('https://golpe.com'), destinoDepoisDeEntrar('//golpe.com'), destinoDepoisDeEntrar('/\\golpe.com'), destinoDepoisDeEntrar('javascript:alert(1)')],
  ['/conversas', '/conversas', '/conversas', '/conversas']);
igual('não volta para a própria tela de entrar', destinoDepoisDeEntrar('/entrar?volta=/x'), '/conversas');

if (falhas) { console.log(`sessão: ${falhas} caso(s) falharam`); process.exit(1); }
console.log('sessão: tudo certo');
