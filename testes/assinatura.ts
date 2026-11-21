/* Prova da assinatura das mensagens da equipe.
   Rodar:  node --experimental-strip-types testes/assinatura.ts  */
import { assinaTexto, nomeDaAssinatura } from '../src/lib/dominio/assinatura.ts';

let falhas = 0;
function igual<T>(nome: string, veio: T, esperado: T) {
  if (JSON.stringify(veio) !== JSON.stringify(esperado)) {
    falhas += 1;
    console.log(`  x ${nome}\n    esperado ${JSON.stringify(esperado)}, veio ${JSON.stringify(veio)}`);
  }
}

igual('sem escolha vai o primeiro nome', nomeDaAssinatura({ nome: 'Guilherme Corrêa' }), 'Guilherme');
igual('a escolha da pessoa vale', nomeDaAssinatura({ nome: 'Guilherme Corrêa', assinatura: 'Gui | Recepção' }), 'Gui | Recepção');
igual('assinatura em branco volta para o nome', nomeDaAssinatura({ nome: 'Natan Souza', assinatura: '   ' }), 'Natan');
igual('tira o que estraga o negrito', nomeDaAssinatura({ assinatura: '*Karina_* ~Kids~' }), 'Karina Kids');
igual('corta em 30 letras', nomeDaAssinatura({ assinatura: 'x'.repeat(50) }).length, 30);
igual('texto ganha o nome em negrito em cima', assinaTexto('Oi, Renan! Tudo certo?', 'Guilherme'), '*Guilherme:*\nOi, Renan! Tudo certo?');
igual('não assina duas vezes', assinaTexto('*Guilherme:*\nOi!', 'Guilherme'), '*Guilherme:*\nOi!');
igual('texto vazio continua vazio (áudio, foto sem legenda)', assinaTexto('  ', 'Guilherme'), '');
igual('sem nome sai como veio', assinaTexto('Oi!', ''), 'Oi!');

if (falhas) { console.log(`\n${falhas} falha(s) na assinatura.`); process.exit(1); }
console.log('assinatura: tudo certo');
