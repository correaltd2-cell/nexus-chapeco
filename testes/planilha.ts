/* Prova da planilha de alunos: colunas, valores, comparação com o sistema e vínculo
   das conversas. A planilha de teste tem o formato da planilha de verdade da escola
   (aba ATIVOS): painel de números em cima, cabeçalho na linha 8, COD, "yes", "ei", BOOK.
   Os nomes são inventados.
   Rodar:  node --experimental-strip-types testes/planilha.ts  */
import {
  alunosPeloNome, contas, idDaPlanilha, lePlanilha, leHorarioFixo, leLivro, lerData, lerLicao, lerModalidade, lerSimNao,
  lerSituacao, limpaNome, linhaDoCabecalho, planeja, reconheceColunas, sugereAlunos, telefoneDaPlanilha,
  telefoneParaGuardar, vinculaConversas, type AlunoDoSistema,
} from '../src/lib/dominio/planilha.ts';

let falhas = 0;
function igual<T>(nome: string, veio: T, esperado: T) {
  if (JSON.stringify(veio) !== JSON.stringify(esperado)) {
    falhas += 1;
    console.log(`  x ${nome}\n    esperado ${JSON.stringify(esperado)}, veio ${JSON.stringify(veio)}`);
  }
}

/* ---- colunas ---- */
const CAB_ESCOLA = ['CLASSIFICAÇÃO', 'ASSINATURA DO CONTRATO', 'COD', 'NOME', 'yes', 'ei', 'FALTA  POR LIVRO', 'APP', 'NEX-IA', 'BOOK', 'OBSERVAÇÕES', 'MODALIDADE', 'FIXED', 'FIM DE CONTRATO', 'FIM D CONTRATO C/ TRANCAM', 'STATUS RENOVAÇÃO'];
igual('as colunas da planilha da escola', reconheceColunas(CAB_ESCOLA), {
  codigo: 2, nome: 3, pendenciaLivro: 6, nivel: 9, situacao: 4, horarioFixo: 5, temFixo: 12, modalidade: 11,
  classificacao: 0, app: 7, nexia: 8, contratoFim: 13, contratoAssinado: 1, observacao: 10,
});
igual('status da renovação não é a situação do aluno', reconheceColunas(['Nome', 'STATUS RENOVAÇÃO']), { nome: 0 });
igual('planilha comum, o mais específico primeiro',
  reconheceColunas(['Aluno', 'Celular', 'Nome do responsável', 'Telefone do responsável', 'Livro', 'Lição', 'Status', 'Data de matrícula']),
  { responsavelTelefone: 3, responsavelNome: 2, nome: 0, telefone: 1, nivel: 4, licao: 5, situacao: 6 });
igual('data de matrícula não é a matrícula', reconheceColunas(['Nome', 'Data de matrícula', 'Matrícula']), { codigo: 2, nome: 0 });
igual('painel de números em cima: cabeçalho na linha 8', linhaDoCabecalho([
  ['', '', '', 'TOTAL ALUNOS >', '268', '261', '', '', '', '<- ativos'], ['', '', '', 'ALUNOS COM AULAS MARCADAS', '106'],
  ['', '', '', 'ALUNOS TRANCADOS', '13'], ['', '', '', 'ALUNOS EM OFF', '7'], ['', '', '', 'ALUNOS EM OBS', '0'],
  ['', '', '', 'ALUNOS COM HORÁRIOS FIXOS', '89'], [], CAB_ESCOLA,
]), 7);

/* ---- valores ---- */
igual('celular com DDD', telefoneDaPlanilha('(49) 99912-3456'), '5549999123456');
igual('sem DDD é de Chapecó', telefoneDaPlanilha('99912-3456'), '5549999123456');
igual('dois números: vale o primeiro', telefoneDaPlanilha('49 99912-3456 / 49 98888-1111'), '5549999123456');
igual('lixo não vira telefone', telefoneDaPlanilha('não tem'), '');
const sit = (v: string, marc = true) => { const s = lerSituacao(v, marc); return `${s.situacao}|${s.marcou}|${s.reconhecida}`; };
igual('yes: ativo e marcou', sit('YES'), 'ativo|true|true');
igual('vazio na coluna da marcação: ativo que não marcou', sit(''), 'ativo|false|true');
igual('vazio em planilha comum: ativo, sem dizer da marcação', sit('', false), 'ativo|null|true');
igual('trancado', sit('trancado'), 'trancado|null|true');
igual('off e o mês de volta', [sit('OFF'), sit('JANEIRO'), sit('FEVEREIRO')], ['off|null|true', 'off|null|true', 'off|null|true']);
igual('obs e "não chamar"', [sit('OBS'), sit('ñ chamar')], ['obs|null|true', 'obs|null|true']);
igual('planilha comum: Cancelado e Ativo', [sit('Cancelado', false), sit('Ativo (não pagou)', false), sit('Não ativo', false)], ['inativo|null|true', 'ativo|null|true', 'inativo|null|true']);
igual('situação desconhecida fica ativa, com aviso', sit('aguardando contrato novo').endsWith('false'), false);
igual('situação que não reconhece', lerSituacao('xyz').reconhecida, false);
igual('lição', [lerLicao('L12'), lerLicao('Lição 7'), lerLicao('25'), lerLicao('')], [12, 7, null, null]);
igual('caixa de marcar', [lerSimNao('TRUE'), lerSimNao('FALSO'), lerSimNao('fixo'), lerSimNao('')], [true, false, true, null]);
igual('data brasileira', [lerData('13/06/2024'), lerData('1/2/25'), lerData('2026-11-30 00:00:00'), lerData('novembro')], ['2024-06-13', '2025-02-01', '2026-11-30', '']);
igual('modalidade', [lerModalidade('PRESENCIAL '), lerModalidade('online'), lerModalidade('hibrido'), lerModalidade('presencial/online')], ['presencial', 'online', 'hibrido', 'hibrido']);
igual('nome com as marcas do fim', [limpaNome('FULANO DE TAL - menor'), limpaNome('CICLANA SOUZA - menor - ON'), limpaNome('BELTRANO')],
  [{ nome: 'FULANO DE TAL', menor: true, online: false }, { nome: 'CICLANA SOUZA', menor: true, online: true }, { nome: 'BELTRANO', menor: false, online: false }]);

/* ---- BOOK ---- */
const livro = (t: string) => { const l = leLivro(t); return [l.nivel, l.tipo, l.online && 'on', l.kids && 'kids', l.flex && 'flex', l.conversacao && 'conv', l.professor].filter(Boolean).join('|'); };
igual('BOOK quebrado em partes', [
  'A1', 'A2 ON', 'BEGGINER', 'STARTER ON', 'B1 FLEX', 'B2 + CONV', 'PRIVATE A1 ON', 'PRIVATE NATHAN', 'PRIVATE CLASS NATHAN',
  'CLUB', 'NEXUS CLUB', 'CONVERSATION B1 ON', 'B1 CONVERSAÇÃO ON', 'PRIVATE CONVO ON', 'NEXUS JUNIOR LIVRO 3', 'NEXUS JUNIOR L2',
  'JUNIOR', 'A1 JUNIOR', 'NEXUS JUNIOR/B1', 'PARTICULAR',
].map(livro), [
  'A1|turma', 'A2|turma|on', 'Starter|turma', 'Starter|turma|on', 'B1|turma|flex', 'B2|turma|conv', 'A1|particular|on', 'particular|Nathan', 'particular|Nathan',
  'Clube|clube', 'Clube|clube', 'B1|clube|on', 'B1|clube|on', 'Clube|particular|on', 'Junior 3|turma|kids', 'Junior 2|turma|kids',
  'Junior|turma|kids', 'A1|turma|kids', 'B1|turma|kids', 'particular',
]);

/* ---- horário fixo ---- */
const hor = (t: string) => leHorarioFixo(t).map((h) => `${h.dia}@${h.hora}`).join(' ');
igual('horário fixo escrito à mão', [
  'quartas às 13h30', 'segundas 15h30 e quartas 14h30', 'quartas Às 19h30 e às 20h30', 'seg 13h30 e sex 18h',
  'segunda e quarta 19h', 'segunda13h30', 'terça 17:30', 'segunda 13h30 e sb 10h', 'b2 - 4.1', 'pendencias no pgto',
].map(hor), ['3@13:30', '1@15:30 3@14:30', '3@19:30 3@20:30', '1@13:30 5@18:00', '1@19:00 3@19:00', '1@13:30', '2@17:30', '1@13:30 6@10:00', '', '']);

/* ---- a planilha da escola, de ponta a ponta ---- */
const linha = (cod: string, nome: string, yes: string, ei: string, book: string, modal: string, fixed = '', extra: Partial<Record<number, string>> = {}) => {
  const l = ['', '', cod, nome, yes, ei, '0', 'TRUE', 'FALSE', book, '', modal, fixed, '', '', ''];
  for (const [i, v] of Object.entries(extra)) l[Number(i)] = v as string;
  return l;
};
const escola = [
  ['', '', '', 'TOTAL ALUNOS >', '9'], ['', '', '', 'ALUNOS COM AULAS MARCADAS', '3'], [], [], [], [], [], CAB_ESCOLA,
  linha('101', 'ANA PAULA MORETTO', 'yes', 'quartas às 13h30', 'B2', 'presencial', 'fixo', { 0: 'Evoluindo', 13: '13/06/2027' }),
  linha('102', 'BRUNO SALVI - menor', 'YES', 'segunda 18h', 'NEXUS JUNIOR LIVRO 3', 'presencial', 'FIXO'),
  linha('103', 'CARLA DIAS', '', '', 'PRIVATE NATHAN', 'online'),
  linha('104', 'DANIEL ROSSI', 'trancado', 'volta em março', 'A1', 'presencial'),
  linha('105', 'ELISA NUNES', 'JANEIRO', '', 'A2 ON', 'online'),
  linha('106', 'FABIO KLEIN', 'obs', 'pendencias no pgto', 'B1', 'PRESENCIAL', '', { 0: 'Crítico' }),
  linha('101', 'ANA PAULA MORETTO', 'yes', '', 'B2', 'presencial'),
  ['', '', '', '', '', '', '', 'FALSE', 'FALSE', '', '', '', '', '', '', ''],
  linha('107', 'GABRIELA LIMA', 'yes', 'sextas às 9h', 'CONVERSATION B1', 'presencial'),
];
const l = lePlanilha(escola);
igual('cabeçalho achado embaixo do painel', l.linhaCabecalho, 8);
igual('a coluna "yes" é a da marcação', l.colunaDeMarcacao, true);
igual('alunos lidos (repetido e linha vazia de fora)', l.alunos.map((a) => `${a.codigo}|${a.nome}|${a.situacao}|${a.marcouSemana}`), [
  '101|ANA PAULA MORETTO|ativo|true', '102|BRUNO SALVI|ativo|true', '103|CARLA DIAS|ativo|false', '104|DANIEL ROSSI|trancado|null',
  '105|ELISA NUNES|off|null', '106|FABIO KLEIN|obs|null', '107|GABRIELA LIMA|ativo|true',
]);
igual('código repetido vira problema, a primeira fica', l.problemas.map((p) => p.linha), [15]);
igual('as contas que o painel da planilha erra', contas(l.alunos), { total: 7, ativos: 4, marcaram: 3, naoMarcaram: 1, trancados: 1, off: 1, obs: 1, inativos: 0, comFixo: 3 });
const bruno = l.alunos[1];
igual('menor, Kids pelo Junior, horário lido', [bruno.menor, bruno.trilha, bruno.nivel, bruno.horariosFixos], [true, 'kids', 'Junior 3', [{ dia: 1, hora: '18:00' }]]);
const carla = l.alunos[2];
igual('particular com o professor do livro', [carla.nivel, carla.tipoCurso, carla.professorDoLivro, carla.modalidade], ['Particular', 'particular', 'Nathan', 'online']);
igual('classificação, app e fim de contrato', [l.alunos[0].saude, l.alunos[0].appAtivo, l.alunos[0].nexiaAtivo, l.alunos[0].contratoFim, l.alunos[5].saude], ['evoluindo', true, false, '2027-06-13', 'critico']);
igual('chave pelo código', l.alunos[0].chave, 'c:101');

/* ---- o que muda no sistema ---- */
const existentes: AlunoDoSistema[] = [
  { id: 'x1', nome: 'Ana Paula Moretto', codigo: '101', nivel: 'B1', ativo: true, situacao: 'ativo' },
  { id: 'x2', nome: 'DANIEL ROSSI', ativo: true, telefone: '5549991112222' },
  { id: 'x3', nome: 'Velho Aluno', ativo: true, planilhaChave: 'c:099' },
  { id: 't1', nome: 'CARLA DIAS', ativo: true, teste: true },
];
const p = planeja(l, existentes);
igual('novos: quem não existe (o de teste não conta)', p.novos.map((n) => n.nome), ['BRUNO SALVI', 'CARLA DIAS', 'ELISA NUNES', 'FABIO KLEIN', 'GABRIELA LIMA']);
igual('aluno novo nasce com a situação e sem lição inventada', [p.novos[2].situacao, p.novos[2].ativo, p.novos[0].licao], ['off', false, 0]);
const ana = p.atualizados.find((a) => a.id === 'x1');
igual('Ana achada pelo código: muda o nível e ganha o resto', ana?.mudou.includes('nivel'), true);
const daniel = p.atualizados.find((a) => a.id === 'x2');
igual('Daniel achado pelo nome: fica trancado e o telefone do sistema não some', [daniel?.campos.situacao, daniel?.campos.ativo, 'telefone' in (daniel?.campos || {})], ['trancado', false, false]);
igual('quem sumiu da planilha aparece, sem apagar', p.foraDaPlanilha, [{ id: 'x3', nome: 'Velho Aluno' }]);
const semSituacao = planeja(lePlanilha([['Nome', 'Telefone'], ['Daniel Rossi', '49 99111-2222']]), [{ ...existentes[1], ativo: false, situacao: 'trancado' }]);
igual('sem coluna de situação, não mexe em quem está trancado', [semSituacao.atualizados[0]?.campos.ativo, semSituacao.atualizados[0]?.campos.situacao], [undefined, undefined]);

/* ---- conversas ---- */
const alunos = [
  { id: 'a1', nome: 'ANA PAULA MORETTO', ativo: true, telefone: '' },
  { id: 'a2', nome: 'BRUNO SALVI', ativo: true, responsavelTelefone: '5549988453310' },
  { id: 'a3', nome: 'ANA LIMA', ativo: true },
  { id: 'a4', nome: 'ANA LIMA SOUZA', ativo: false },
];
igual('pelo nome: todas as palavras do contato no nome do aluno', alunosPeloNome('Ana Moretto', alunos).map((a) => a.id), ['a1']);
igual('pelo nome: uma palavra só não basta', alunosPeloNome('Ana', alunos), []);
igual('pelo nome: dois alunos batem, não decide', alunosPeloNome('Ana Lima', alunos).map((a) => a.id), ['a3', 'a4']);
igual('liga pelo telefone do responsável e pelo nome quando é um só', vinculaConversas(
  [{ id: 'c1', waId: '554988453310', nome: 'Mãe do Bruno' }, { id: 'c2', waId: '5549900000001', nome: 'Ana Moretto' }, { id: 'c3', waId: '5549900000002', nome: 'Ana Lima' }, { id: 'c4', waId: '5549900000003', nome: 'Ana Moretto', alunoId: 'a1' }],
  alunos,
), [{ conversaId: 'c1', alunoId: 'a2', como: 'telefone' }, { conversaId: 'c2', alunoId: 'a1', como: 'nome' }]);
igual('sugestões para ligar à mão', sugereAlunos('Ana Lima', alunos).map((a) => a.id), ['a3', 'a4', 'a1']);
igual('ao ligar, o número fica no aluno (maior de idade)', telefoneParaGuardar({ telefone: '' }, '5549900000001'), { campo: 'telefone', valor: '5549900000001' });
igual('ao ligar, no menor fica como telefone do responsável', telefoneParaGuardar({ menor: true }, '5549900000001'), { campo: 'responsavelTelefone', valor: '5549900000001' });
igual('não troca telefone que já existe', telefoneParaGuardar({ telefone: '5549911112222' }, '5549900000001'), null);
igual('link da planilha', idDaPlanilha('https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz_0123456789-xy/edit#gid=0'), '1AbCdEfGhIjKlMnOpQrStUvWxYz_0123456789-xy');

if (falhas) { console.log(`\n${falhas} falha(s) na planilha.`); process.exit(1); }
console.log('planilha: tudo certo');
