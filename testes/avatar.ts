/* Prova do bonequinho de cada pessoa (src/lib/dominio/avatar.ts).
   Rodar:  node --experimental-strip-types testes/avatar.ts  */
import { avatarPadrao, CABELOS, chaveDoTchau, CORES_DE_CABELO, FUNDOS, leAvatar, PELES, ROUPAS, saudacao } from '../src/lib/dominio/avatar.ts';

let falhas = 0;
function igual<T>(nome: string, veio: T, esperado: T) {
  if (JSON.stringify(veio) !== JSON.stringify(esperado)) {
    falhas += 1;
    console.log(`  x ${nome}\n    esperado ${JSON.stringify(esperado)}\n    veio     ${JSON.stringify(veio)}`);
  }
}

const p = avatarPadrao('Helena Duarte');
igual('o padrão é sempre o mesmo para o mesmo nome', avatarPadrao('Helena Duarte'), p);
igual('o padrão usa só as opções da lista, sem careca, barba nem óculos, e dá tchau',
  [PELES.includes(p.pele as never), CABELOS.includes(p.cabelo), p.cabelo !== 'careca', CORES_DE_CABELO.includes(p.corCabelo as never),
    ROUPAS.includes(p.roupa as never), FUNDOS.includes(p.fundo as never), p.barba, p.oculos, p.tchau],
  [true, true, true, true, true, true, false, false, true]);
const nomes = ['Nathan', 'Karina', 'Jaziel', 'Bruna', 'Felipe', 'Gabriela', 'Mabel', 'Ana', 'Laura', 'Isis'];
igual('nomes diferentes não saem todos iguais', new Set(nomes.map((n) => JSON.stringify(avatarPadrao(n)))).size > 5, true);
igual('o salvo vale', leAvatar({ ...p, cabelo: 'careca', barba: true, tchau: false }, 'Helena Duarte'), { ...p, cabelo: 'careca', barba: true, tchau: false });
igual('o que vier estranho volta ao padrão, campo a campo',
  leAvatar({ pele: 'verde', cabelo: 'moicano', barba: 'sim', oculos: true }, 'Helena Duarte'), { ...p, oculos: true });
igual('sem nada salvo, o padrão', [leAvatar(undefined, 'Helena Duarte'), leAvatar('x', 'Helena Duarte')], [p, p]);
igual('o tchau muda com a hora e usa o primeiro nome',
  [saudacao('Guilherme Tavares', 9).titulo, saudacao('Guilherme', 9).frase.startsWith('Bom dia'), saudacao('Guilherme', 14).frase.startsWith('Boa tarde'),
    saudacao('Guilherme', 20).frase.startsWith('Boa noite'), saudacao('Guilherme', 2).frase.startsWith('Boa noite'), saudacao('', 9).titulo],
  ['Oi, Guilherme!', true, true, true, true, 'Oi, pessoal!']);
igual('o tchau é guardado por pessoa', chaveDoTchau('abc'), 'nexus-tchau-abc');

if (falhas) { console.log(`avatar: ${falhas} falha(s)`); process.exit(1); }
console.log('avatar: tudo certo');
