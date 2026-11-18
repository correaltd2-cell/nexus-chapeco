/* Prova da triagem: as frases que a escola recebe de verdade caem no assunto certo,
   e o que nao da para dizer nao abre tarefa nenhuma.
   Rodar:  node --experimental-strip-types testes/triagem.ts  */
import { destinoDaTarefa, leAssunto, tarefaDoAssunto, type Assunto } from '../src/lib/dominio/triagem.ts';
import type { Lista, Quadro, Setor } from '../src/lib/dominio/tipos.ts';

const QUADROS: Quadro[] = [
  { id: 'q-rec', nome: 'Recepção', ordem: 1000, arquivado: false, criadoEm: '' },
  { id: 'q-canc', nome: 'Cancelamentos', ordem: 2000, arquivado: false, criadoEm: '' },
  { id: 'q-coo', nome: 'Coordenação', ordem: 3000, arquivado: false, criadoEm: '' },
];
const LISTAS: Lista[] = [
  { id: 'l-fazer', quadroId: 'q-rec', nome: 'A fazer', ordem: 1000, arquivada: false },
  { id: 'l-feito', quadroId: 'q-rec', nome: 'Feito', ordem: 4000, arquivada: false },
  { id: 'l-pediu', quadroId: 'q-canc', nome: 'Pediu cancelamento', ordem: 1000, arquivada: false },
  { id: 'l-demandas', quadroId: 'q-coo', nome: 'Demandas', ordem: 1000, arquivada: false },
];

let falhas = 0;
function caso(texto: string, assunto: Assunto | null, setor: Setor | null) {
  const r = leAssunto(texto);
  if (r.assunto !== assunto || r.setor !== setor) {
    falhas += 1;
    console.log(`  x "${texto}"\n    esperado ${assunto} / ${setor}, veio ${r.assunto} / ${r.setor} ${JSON.stringify(r.placar)}`);
  }
}

caso('Oi, queria cancelar minha matrícula', 'cancelamento', 'recepcao');
caso('bom dia, quero trancar o curso por uns meses', 'cancelamento', 'recepcao');
caso('me manda a segunda via do boleto por favor', 'financeiro', 'financeiro');
caso('o boleto desse mês não chegou', 'financeiro', 'financeiro');
caso('dá pra parcelar a mensalidade?', 'financeiro', 'financeiro');
caso('faltei na aula de ontem, consigo repor?', 'reposicao', 'recepcao');
caso('preciso marcar minha aula dessa semana', 'marcacao', 'recepcao');
caso('consigo remarcar pra quinta?', 'marcacao', 'recepcao');
caso('quanto custa o curso de inglês?', 'matricula', 'recepcao');
caso('quero fazer matrícula pro meu filho', 'matricula', 'recepcao');
caso('quando sai o resultado da prova?', 'prova', 'coordenacao');
caso('queria falar com a coordenação sobre o meu filho', 'pedagogico', 'kids');
caso('queria falar com a coordenação', 'pedagogico', 'coordenacao');
/* conversa fiada nao abre tarefa */
caso('bom dia', null, null);
caso('obrigada!', null, null);
caso('tudo bem?', null, null);
caso('ok', null, null);
/* sinal fraco sozinho nao decide */
caso('qual o horário?', null, null);

const t = tarefaDoAssunto(leAssunto('quero cancelar'), 'Renan Foschiera', 'quero cancelar', QUADROS, LISTAS);
if (!t || t.quadroId !== 'q-canc' || t.listaId !== 'l-pediu' || t.titulo !== 'Cancelamento: Renan Foschiera') {
  falhas += 1; console.log('  x tarefa de cancelamento:', JSON.stringify(t));
}
const f = tarefaDoAssunto(leAssunto('me manda o boleto'), 'Ana', 'me manda o boleto', QUADROS, LISTAS);
if (!f || f.quadroId !== 'q-rec' || f.listaId !== 'l-fazer' || !f.etiquetas.includes('Financeiro')) {
  falhas += 1; console.log('  x tarefa do financeiro:', JSON.stringify(f));
}
if (destinoDaTarefa('prova', [], []) !== null) { falhas += 1; console.log('  x sem quadro deveria dar nulo'); }

console.log(falhas ? `\n${falhas} falha(s)` : 'triagem: todos os casos passaram');
process.exit(falhas ? 1 : 0);
