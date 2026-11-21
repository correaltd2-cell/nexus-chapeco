/* Prova do contato: as grafias do celular e por quem o número fala.
   Rodar:  node --experimental-strip-types testes/contato.ts  */
import { alunosDoContato, falaComoResponsavel, mesmoTelefone, variantesDoTelefone } from '../src/lib/dominio/contato.ts';

let falhas = 0;
function igual<T>(nome: string, veio: T, esperado: T) {
  if (JSON.stringify(veio) !== JSON.stringify(esperado)) {
    falhas += 1;
    console.log(`  x ${nome}\n    esperado ${JSON.stringify(esperado)}, veio ${JSON.stringify(veio)}`);
  }
}

/* ---- telefone ---- */
igual('com o 9 gera sem o 9', variantesDoTelefone('5549998965170'), ['5549998965170', '554998965170']);
igual('sem o 9 gera com o 9', variantesDoTelefone('554998965170'), ['554998965170', '5549998965170']);
igual('sem o 55 ganha o 55', variantesDoTelefone('(49) 99896-5170'), ['49998965170', '5549998965170', '554998965170']);
igual('fixo não ganha 9', variantesDoTelefone('554933221100'), ['554933221100']);
igual('vazio', variantesDoTelefone(''), []);
igual('mesmo celular com e sem o 9', mesmoTelefone('+55 49 99896-5170', '554998965170'), true);
igual('celulares diferentes', mesmoTelefone('5549998965170', '5549998965171'), false);
igual('sem telefone não casa', mesmoTelefone('', '5549998965170'), false);

/* ---- por quem o contato fala ---- */
const pedro = { id: 'pedro', nome: 'Pedro', telefone: '', responsavelTelefone: '5549988453310', trilha: 'kids', ativo: true };
const lia = { id: 'lia', nome: 'Lia', telefone: '', responsavelTelefone: '554988453310', trilha: 'kids', ativo: true };
const ana = { id: 'ana', nome: 'Ana', telefone: '5549991112222', ativo: true, trilha: 'adultos' };
const velho = { id: 'velho', nome: 'Velho', telefone: '5549991112222', ativo: false, trilha: 'adultos' };
const todos = [pedro, lia, ana, velho];
igual('responsável fala pelos dois filhos', alunosDoContato(todos, { waId: '5549988453310' }).map((a) => a.id), ['pedro', 'lia']);
igual('o ligado à mão vem primeiro', alunosDoContato(todos, { alunoId: 'lia', waId: '5549988453310' }).map((a) => a.id), ['lia', 'pedro']);
igual('aluno pelo próprio número, o ativo antes do trancado', alunosDoContato(todos, { waId: '554991112222' }).map((a) => a.id), ['ana', 'velho']);
igual('ligado à mão mesmo com outro número', alunosDoContato(todos, { alunoId: 'ana', waId: '5549900000000' }).map((a) => a.id), ['ana']);
igual('número desconhecido', alunosDoContato(todos, { waId: '5549900000000' }), []);
igual('é o responsável', falaComoResponsavel(pedro, '5549988453310'), true);
igual('é o próprio aluno', falaComoResponsavel(ana, '5549991112222'), false);
igual('Kids ligado à mão, número sem cadastro: fala o responsável', falaComoResponsavel({ ...pedro, responsavelTelefone: '' }, '5549900000000'), true);

if (falhas) { console.log(`\n${falhas} falha(s) no contato.`); process.exit(1); }
console.log('contato: tudo certo');
