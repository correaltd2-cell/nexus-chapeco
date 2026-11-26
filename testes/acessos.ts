/* Prova de quem abre qual tela e pede quais conversas (src/lib/dominio/acessos.ts).
   As regras do banco têm a prova delas no emulador: npm run test:regras.
   Rodar:  node --experimental-strip-types testes/acessos.ts  */
import { conversasQueVe, modulosDoPapel, podeAbrir, veSetor } from '../src/lib/dominio/acessos.ts';
import type { Setor } from '../src/lib/dominio/tipos.ts';

let falhas = 0;
function igual<T>(nome: string, veio: T, esperado: T) {
  if (JSON.stringify(veio) !== JSON.stringify(esperado)) {
    falhas += 1;
    console.log(`  x ${nome}\n    esperado ${JSON.stringify(esperado)}\n    veio     ${JSON.stringify(veio)}`);
  }
}

igual('o professor só abre a agenda', modulosDoPapel('professor'), ['aulas']);
igual('o professor não abre conversas nem provas', [podeAbrir('professor', 'conversas'), podeAbrir('professor', 'provas'), podeAbrir('professor', 'quadros')], [false, false, false]);
igual('a coordenação abre agenda e conversas', [podeAbrir('coordenacao', 'aulas'), podeAbrir('coordenacao', 'conversas')], [true, true]);
igual('a recepção abre agenda e conversas', [podeAbrir('recepcao', 'aulas'), podeAbrir('recepcao', 'conversas')], [true, true]);

igual('gestão e recepção pedem todas as conversas', [conversasQueVe('admin', []), conversasQueVe('gestor', []), conversasQueVe('recepcao', [])], ['todas', 'todas', 'todas']);
igual('Natan pede só as da Coordenação', conversasQueVe('coordenacao', ['coordenacao']), ['coordenacao']);
igual('Karina pede só as da Coordenação Kids', conversasQueVe('coordenacao', ['kids']), ['kids']);
igual('coordenação sem setor não pede nada', [conversasQueVe('coordenacao', []), conversasQueVe('coordenacao', undefined)], [[], []]);
igual('o professor não pede conversa', conversasQueVe('professor', ['recepcao']), []);
igual('setor repetido ou estranho sai do pedido', conversasQueVe('coordenacao', ['kids', 'kids', 'outro' as Setor]), ['kids']);

igual('quem vê a conversa de cada setor', [
  veSetor('recepcao', [], 'kids'), veSetor('coordenacao', ['coordenacao'], 'coordenacao'), veSetor('coordenacao', ['coordenacao'], 'kids'),
  veSetor('professor', ['recepcao'], 'recepcao'),
], [true, true, false, false]);

if (falhas) {
  console.log(`acessos: ${falhas} falha(s)`);
  process.exit(1);
}
console.log('acessos: tudo certo');
