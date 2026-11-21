/* Prova da planilha de alunos dentro do sistema (src/lib/dominio/alunos.ts): o que cada
   célula editada grava, o aluno novo e a virada da semana da marcação.
   Os nomes são inventados.
   Rodar:  node --experimental-strip-types testes/alunos.ts  */
import {
  camposEditados, dataCompleta, fechaSemana, horasDesde, idDaSemana, novoAluno, valorDaCelula, type AlunoDaGrade, type Edicao,
} from '../src/lib/dominio/alunos.ts';
import { confere, escritasDaImportacao, lePlanilha } from '../src/lib/dominio/planilha.ts';

let falhas = 0;
function igual<T>(nome: string, veio: T, esperado: T) {
  if (JSON.stringify(veio) !== JSON.stringify(esperado)) {
    falhas += 1;
    console.log(`  x ${nome}\n    esperado ${JSON.stringify(esperado)}, veio ${JSON.stringify(veio)}`);
  }
}
const campos = (e: Edicao) => ('campos' in e ? e.campos : { ERRO: e.erro });
const erro = (e: Edicao) => ('erro' in e ? e.erro : 'sem erro');

const joana: AlunoDaGrade = {
  id: 'a1', nome: 'Joana Teste', codigo: '101', ativo: true, situacao: 'ativo', marcouSemana: true,
  livroOriginal: 'A2', nivel: 'A2', tipoCurso: 'turma', trilha: 'adultos', telefone: '5549999123456',
  horarioFixoTexto: 'quartas às 13h30', horariosFixos: [{ dia: 3, hora: '13:30' }], temFixo: true,
};
const pedro: AlunoDaGrade = { id: 'a2', nome: 'Pedro Exemplo', codigo: '102', ativo: false, situacao: 'trancado', marcouSemana: null, telefone: '' };
const todos = [joana, pedro];

/* ---- células ---- */
igual('nome com " - menor" marca menor', campos(camposEditados('nome', 'Joana Teste Souza - menor', joana)), { nome: 'Joana Teste Souza', menor: true });
igual('nome igual não grava nada', campos(camposEditados('nome', '  Joana   Teste ', joana)), {});
igual('nome vazio não pode', erro(camposEditados('nome', ' ', joana)), 'O aluno precisa de nome.');
igual('código de outro aluno não pode', erro(camposEditados('codigo', '102', joana, todos)), 'O código 102 já é de Pedro Exemplo.');
igual('código novo', campos(camposEditados('codigo', '205.0', joana, todos)), { codigo: '205' });
igual('código apagado', campos(camposEditados('codigo', '', joana, todos)), { codigo: null });

igual('trancar tira o ativo e a marcação', campos(camposEditados('situacao', 'trancado', joana)), { situacao: 'trancado', ativo: false, marcouSemana: null });
igual('voltar a ativo começa sem marcar', campos(camposEditados('situacao', 'ativo', pedro)), { situacao: 'ativo', ativo: true, marcouSemana: false });
igual('situação pelo nome', campos(camposEditados('situacao', 'Off', joana)), { situacao: 'off', ativo: false, marcouSemana: null });
igual('situação que não existe', erro(camposEditados('situacao', 'férias', joana)), 'Situação que não conheço.');

igual('desmarcar a semana', campos(camposEditados('marcouSemana', false, joana)), { marcouSemana: false });
igual('trancado não marca', erro(camposEditados('marcouSemana', true, pedro)).startsWith('Só aluno ativo'), true);

igual('horário escrito vira dia e hora', campos(camposEditados('horarioFixoTexto', 'terças e quintas às 18h', joana)), {
  horarioFixoTexto: 'terças e quintas às 18h', horariosFixos: [{ dia: 2, hora: '18:00' }, { dia: 4, hora: '18:00' }],
});
igual('horário apagado', campos(camposEditados('horarioFixoTexto', '', joana)), { horarioFixoTexto: null, horariosFixos: [], temFixo: false });

igual('BOOK particular com professor e online', campos(camposEditados('livroOriginal', 'B1 PRIVATE NATHAN ON', joana)), {
  livroOriginal: 'B1 PRIVATE NATHAN ON', nivel: 'B1', tipoCurso: 'particular', professorDoLivro: 'Nathan', modalidade: 'online',
});
igual('BOOK do Kids troca o curso', campos(camposEditados('livroOriginal', 'NEXUS JUNIOR LIVRO 3', joana)), {
  livroOriginal: 'NEXUS JUNIOR LIVRO 3', nivel: 'Junior 3', trilha: 'kids',
});

igual('modalidade', campos(camposEditados('modalidade', 'hibrido', joana)), { modalidade: 'hibrido' });
igual('modalidade inventada', erro(camposEditados('modalidade', 'marte', joana)), 'Modalidade que não conheço.');
igual('classificação', campos(camposEditados('saude', 'critico', joana)), { saude: 'critico' });
igual('fim do contrato pelo calendário', campos(camposEditados('contratoFim', '2027-06-30', joana)), { contratoFim: '2027-06-30' });
igual('fim do contrato escrito', campos(camposEditados('contratoFim', '30/06/27', joana)), { contratoFim: '2027-06-30' });
igual('data que não é data', erro(camposEditados('contratoFim', 'junho', joana)).startsWith('Data que não entendi'), true);
igual('telefone escrito de qualquer jeito', campos(camposEditados('telefone', '(49) 98888-1111', pedro)), { telefone: '5549988881111' });
igual('mesmo telefone sem o 55 não grava', campos(camposEditados('telefone', '49 99912-3456', joana)), {});
igual('telefone que não é telefone', erro(camposEditados('telefone', '123', joana)).startsWith('Telefone que não entendi'), true);
igual('telefone do responsável apagado', campos(camposEditados('responsavelTelefone', '', { ...pedro, responsavelTelefone: '5549988881111' })), { responsavelTelefone: null });
igual('caixa de app', campos(camposEditados('appAtivo', true, joana)), { appAtivo: true });
igual('observação com quebra de linha', campos(camposEditados('observacao', 'volta em março\nchamar  dia 10', joana)), { observacao: 'volta em março\nchamar dia 10' });

igual('valor da célula: situação sem campo usa o ativo', valorDaCelula('situacao', { id: 'x', nome: 'X', ativo: false }), 'inativo');
igual('valor da célula: vazio', valorDaCelula('observacao', joana), '');
igual('data completa, com o ano', dataCompleta('2027-06-30'), '30/06/2027');
igual('data vazia', dataCompleta(undefined), '');

/* ---- aluno novo ---- */
const novo = campos(novoAluno('Rita Inventada - menor - ON', '2026-11-21T12:00:00.000Z'));
igual('aluno novo', [novo.nome, novo.menor, novo.modalidade, novo.situacao, novo.ativo, novo.marcouSemana, novo.origem], ['Rita Inventada', true, 'online', 'ativo', true, false, 'sistema']);
igual('aluno novo sem nome', erro(novoAluno('  ', 'x')), 'Escreva o nome do aluno.');

/* ---- a semana ---- */
const turma: AlunoDaGrade[] = [
  joana,
  { id: 'a3', nome: 'Bruno Ficticio', codigo: '103', ativo: true, situacao: 'ativo', marcouSemana: false },
  { id: 'a4', nome: 'Ana Inventada', ativo: true, situacao: 'ativo' },
  pedro,
  { id: 'a5', nome: 'Aluno de Teste', ativo: true, situacao: 'ativo', marcouSemana: true, teste: true },
];
const { registro, limpar } = fechaSemana(turma, '2026-11-21T18:30:00.000Z', 'Recepção');
igual('contas da semana', [registro.ativos, registro.marcaram, registro.naoMarcaram], [3, 1, 2]);
igual('quem não marcou, em ordem', registro.quemNaoMarcou, [{ id: 'a4', nome: 'Ana Inventada', codigo: '' }, { id: 'a3', nome: 'Bruno Ficticio', codigo: '103' }]);
igual('limpa quem marcou e quem estava sem nada, não o trancado nem o teste', limpar, ['a1', 'a4']);
igual('id da semana', idDaSemana('2026-11-21T18:30:00.000Z'), '202611211830');
igual('horas desde a última virada', horasDesde('2026-11-21T18:30:00.000Z', '2026-11-22T06:30:00.000Z'), 12);
igual('sem virada antes', horasDesde(undefined, 'x'), null);

/* ---- importar de um arquivo: o mesmo plano que a planilha do Google ---- */
const leitura = lePlanilha([
  ['COD', 'NOME', 'yes', 'BOOK'],
  ['101', 'Joana Teste', 'yes', 'A2'],
  ['104', 'Carla Nova - menor', '', 'B1'],
]);
const existentes = [{ ...joana, livroOriginal: 'A1', nivel: 'A1' }];
const conversas = [{ id: 'c1', waId: '5549999123456' }, { id: 'c2', waId: '5549911112222', nome: 'Carla Nova' }, { id: 'c3', waId: '5549933334444', alunoId: 'x' }];
const { conferencia, plano } = confere(leitura, existentes, conversas, { titulo: 'alunos.xlsx', abas: ['ATIVOS'], aba: 'ATIVOS' });
igual('conferência', [conferencia.plano.novos, conferencia.plano.atualizados, conferencia.vincular, conferencia.vincularPeloNome], [1, 1, 2, 1]);
igual('o que muda, com nome de gente', conferencia.plano.exemplosAtualizados, ['Joana Teste (nível, livro)']);
const { escritas, ligadas } = escritasDaImportacao(plano, existentes, conversas, ['novo1'], '2026-11-21T12:00:00.000Z');
igual('escritas', escritas.map((e) => `${e.tipo} ${e.colecao}/${e.id}`), ['definir alunos/novo1', 'atualizar alunos/a1', 'atualizar conversas/c1', 'atualizar conversas/c2']);
igual('conversa pelo nome vai para o aluno novo', escritas[3].campos, { alunoId: 'novo1' });
igual('aluno novo com data', [escritas[0].campos.nome, escritas[0].campos.menor, escritas[0].campos.criadoEm], ['Carla Nova', true, '2026-11-21T12:00:00.000Z']);
igual('ligadas', ligadas, 2);

console.log(falhas ? `\n${falhas} falha(s)` : 'alunos: tudo certo');
process.exit(falhas ? 1 : 0);
