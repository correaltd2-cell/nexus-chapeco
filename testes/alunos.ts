/* Prova da planilha de alunos dentro do sistema (src/lib/dominio/alunos.ts): o que cada
   célula editada grava, o aluno novo e a virada da semana da marcação.
   Os nomes são inventados.
   Rodar:  node --experimental-strip-types testes/alunos.ts  */
import {
  COLUNAS_DA_MARCACAO, COLUNAS_DO_CADASTRO, aulasSemOsAlunos, porCodigo, proximoCodigo, cadastroDoAluno, camposEditados, cpfLegivel, dataCompleta, fechaSemana,
  horasDesde, idDaSemana, novoAluno, valorDaCelula, type AlunoDaGrade, type Edicao,
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
const rita: AlunoDaGrade = { id: 'a9', nome: 'Rita Inventada', menor: true, ativo: true };
igual('menor aparece no nome, como na planilha', valorDaCelula('nome', rita), 'Rita Inventada - menor');
igual('nome do menor sem mexer não grava nada', campos(camposEditados('nome', 'Rita Inventada - menor', rita)), {});
igual('tirar o " - menor" desmarca', campos(camposEditados('nome', 'Rita Inventada', rita)), { menor: false });
igual('nome de adulto sem marca', valorDaCelula('nome', joana), 'Joana Teste');
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
igual('e-mail fica em minúsculas', campos(camposEditados('email', ' Joana.Teste@Gmail.com ', joana)), { email: 'joana.teste@gmail.com' });
igual('e-mail torto', erro(camposEditados('email', 'joana@gmail', joana)).startsWith('E-mail que não entendi'), true);
igual('nascimento com ano curto do século passado', campos(camposEditados('nascimento', '14/03/90', joana)), { nascimento: '1990-03-14' });
igual('nascimento com ano curto deste século', campos(camposEditados('nascimento', '02/09/12', joana)), { nascimento: '2012-09-02' });
igual('nascimento pelo calendário', campos(camposEditados('nascimento', '2010-03-14', joana)), { nascimento: '2010-03-14' });
igual('CPF guarda só os números', campos(camposEditados('documento', '123.456.789-01', joana)), { documento: '12345678901' });
igual('CPF curto', erro(camposEditados('documento', '123.456', joana)), 'O CPF tem 11 números, como 123.456.789-01.');
igual('CPF para ler', [cpfLegivel('12345678901'), valorDaCelula('documento', { ...joana, documento: '12345678901' })], ['123.456.789-01', '123.456.789-01']);
igual('observação com quebra de linha', campos(camposEditados('observacao', 'volta em março\nchamar  dia 10', joana)), { observacao: 'volta em março\nchamar dia 10' });

igual('valor da célula: situação sem campo usa o ativo', valorDaCelula('situacao', { id: 'x', nome: 'X', ativo: false }), 'inativo');
igual('valor da célula: vazio', valorDaCelula('observacao', joana), '');
igual('data completa, com o ano', dataCompleta('2027-06-30'), '30/06/2027');
igual('data vazia', dataCompleta(undefined), '');

/* ---- aluno novo ---- */
const novo = campos(novoAluno('Rita Inventada - menor - ON', '2026-11-21T12:00:00.000Z'));
igual('aluno novo', [novo.nome, novo.menor, novo.modalidade, novo.situacao, novo.ativo, novo.marcouSemana, novo.origem], ['Rita Inventada', true, 'online', 'ativo', true, false, 'sistema']);
igual('aluno novo sem nome', erro(novoAluno('  ', 'x')), 'Escreva o nome do aluno.');

/* ---- as duas planilhas ---- */
igual('marcação: marcou e observação logo depois do nome, horário no fim', [COLUNAS_DA_MARCACAO.slice(0, 4), COLUNAS_DA_MARCACAO.at(-1)], [['codigo', 'nome', 'marcouSemana', 'observacao'], 'horarioFixoTexto']);
igual('marcação sem menor, falta livro e telefones', COLUNAS_DA_MARCACAO.filter((k) => ['menor', 'pendenciaLivro', 'telefone', 'responsavelNome', 'responsavelTelefone'].includes(k)), []);
igual('cadastro com os telefones', ['telefone', 'responsavelNome', 'responsavelTelefone'].every((k) => COLUNAS_DO_CADASTRO.includes(k as never)), true);

/* ---- cadastro pela ficha ---- */
const ficha = cadastroDoAluno({
  nome: 'Lia Ficticia', menor: true, codigo: '330', telefone: '(49) 98888-2222', responsavelNome: 'Marta Ficticia',
  responsavelTelefone: '49 97777-3333', email: 'Marta@Exemplo.com', livroOriginal: 'NEXUS JUNIOR LIVRO 2', horarioFixoTexto: 'sextas às 17h',
  contratoAssinado: true, contratoFim: '', observacao: '',
}, todos, '2026-11-24T12:00:00.000Z');
const f = campos(ficha);
igual('ficha: o aluno nasce ativo e sem marcar', [f.nome, f.menor, f.situacao, f.ativo, f.marcouSemana, f.origem], ['Lia Ficticia', true, 'ativo', true, false, 'sistema']);
igual('ficha: cada campo pela regra da célula', [f.codigo, f.telefone, f.responsavelTelefone, f.email, f.nivel, f.trilha, f.horariosFixos, f.contratoAssinado],
  ['330', '5549988882222', '5549977773333', 'marta@exemplo.com', 'Junior 2', 'kids', [{ dia: 5, hora: '17:00' }], true]);
igual('ficha: campo vazio não entra', ['contratoFim' in f, 'observacao' in f], [false, false]);
igual('ficha: código de outro aluno', erro(cadastroDoAluno({ nome: 'Novo Aluno', codigo: '101' }, todos, 'x')), 'Cód.: O código 101 já é de Joana Teste.');
igual('ficha: telefone torto diz o campo', erro(cadastroDoAluno({ nome: 'Novo Aluno', responsavelTelefone: '12' }, todos, 'x')).startsWith('Tel. responsável: Telefone que não entendi'), true);
igual('ficha sem nome', erro(cadastroDoAluno({ nome: ' ' }, todos, 'x')), 'Escreva o nome do aluno.');
igual('ficha sem código ganha o próximo da sequência', campos(cadastroDoAluno({ nome: 'Novo Aluno', codigo: '' }, todos, 'x')).codigo, '103');
igual('ficha com código escrito fica com ele', campos(cadastroDoAluno({ nome: 'Novo Aluno', codigo: '500' }, todos, 'x')).codigo, '500');

/* ---- a ordem e a sequência dos códigos ---- */
const mistura = [
  { nome: 'Zeca', codigo: '224' }, { nome: 'Bia', codigo: '' }, { nome: 'Ana', codigo: '98' },
  { nome: 'Caio', codigo: '1001' }, { nome: 'Alice' }, { nome: 'Duda', codigo: '224' },
];
igual('ordem pelo código como número; sem código no fim, por nome', [...mistura].sort(porCodigo).map((a) => a.nome), ['Ana', 'Duda', 'Zeca', 'Caio', 'Alice', 'Bia']);
igual('próximo código: o maior mais um', proximoCodigo([{ codigo: '98' }, { codigo: '1001' }, { codigo: '224' }]), '1002');
igual('próximo código: teste e código que não é número não contam', proximoCodigo([{ codigo: '9999', teste: true }, { codigo: 'A12' }, { codigo: ' 40 ' }, {}]), '41');
igual('próximo código sem ninguém', proximoCodigo([]), '1');

/* ---- apagar: sai das próximas aulas, as que passaram ficam ---- */
const aulas = [
  { id: 'g1', inicio: '2026-11-20T18:00:00-03:00', alunoIds: ['a1', 'a2'], alunos: [{ id: 'a1', nome: 'Joana' }, { id: 'a2', nome: 'Pedro' }] },
  { id: 'g2', inicio: '2026-11-27T18:00:00-03:00', alunoIds: ['a1', 'a2'], alunos: [{ id: 'a1', nome: 'Joana' }, { id: 'a2', nome: 'Pedro' }] },
  { id: 'g3', inicio: '2026-11-28T09:00:00-03:00', alunoIds: ['a2'], alunos: [{ id: 'a2', nome: 'Pedro' }] },
];
const tirar = aulasSemOsAlunos(['a1'], aulas, '2026-11-24T12:00:00.000Z');
igual('apagar: só a próxima aula muda', tirar.map((t) => [t.aula.id, t.alunoIds, t.alunos.map((x) => x.id)]), [['g2', ['a2'], ['a2']]]);
igual('apagar: a aula que fica sem ninguém sai', aulasSemOsAlunos(['a2'], aulas, '2026-11-24T12:00:00.000Z').map((t) => [t.aula.id, t.vazia]), [['g2', false], ['g3', true]]);

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
igual('quem não marcou, em ordem de código', registro.quemNaoMarcou, [{ id: 'a3', nome: 'Bruno Ficticio', codigo: '103' }, { id: 'a4', nome: 'Ana Inventada', codigo: '' }]);
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
