/* Prova da planilha de alunos: colunas, valores, comparação com o sistema e vínculo
   das conversas. Rodar:  node --experimental-strip-types testes/planilha.ts  */
import {
  idDaPlanilha, lePlanilha, lerLicao, lerSituacao, linhaDoCabecalho, planeja, reconheceColunas,
  telefoneDaPlanilha, vinculaConversas, type AlunoDoSistema,
} from '../src/lib/dominio/planilha.ts';

let falhas = 0;
function igual<T>(nome: string, veio: T, esperado: T) {
  if (JSON.stringify(veio) !== JSON.stringify(esperado)) {
    falhas += 1;
    console.log(`  x ${nome}\n    esperado ${JSON.stringify(esperado)}, veio ${JSON.stringify(veio)}`);
  }
}

/* ---- colunas ---- */
igual('reconhece pelo nome, o mais específico primeiro',
  reconheceColunas(['Aluno', 'Celular', 'Nome do responsável', 'Telefone do responsável', 'Livro', 'Lição', 'Status', 'Data de matrícula']),
  { responsavelTelefone: 3, responsavelNome: 2, nome: 0, telefone: 1, nivel: 4, licao: 5, situacao: 6 });
igual('acento e caixa não importam', reconheceColunas(['NOME COMPLETO', 'WhatsApp', 'Nível', 'SITUAÇÃO']), { nome: 0, telefone: 1, nivel: 2, situacao: 3 });
igual('data de matrícula não é a matrícula', reconheceColunas(['Nome', 'Data de matrícula', 'Matrícula']), { codigo: 2, nome: 0 });
igual('título em cima da tabela', linhaDoCabecalho([['LISTA DE ALUNOS 2026'], [], ['Nome', 'Telefone', 'Status'], ['Ana', '49 99999-0000', 'Ativo']]), 2);

/* ---- valores ---- */
igual('celular com DDD', telefoneDaPlanilha('(49) 99912-3456'), '5549999123456');
igual('sem DDD é de Chapecó', telefoneDaPlanilha('99912-3456'), '5549999123456');
igual('com 55 fica', telefoneDaPlanilha('+55 49 99912-3456'), '5549999123456');
igual('dois números: vale o primeiro', telefoneDaPlanilha('49 99912-3456 / 49 98888-1111'), '5549999123456');
igual('lixo não vira telefone', telefoneDaPlanilha('não tem'), '');
igual('situação: vazio é ativo', lerSituacao(''), { ativo: true, reconhecida: true });
igual('situação: Cancelado', lerSituacao('Cancelado'), { ativo: false, reconhecida: true });
igual('situação: Trancou', lerSituacao('trancou em outubro'), { ativo: false, reconhecida: true });
igual('situação: Não ativo', lerSituacao('Não ativo'), { ativo: false, reconhecida: true });
igual('situação: a primeira palavra manda', lerSituacao('Ativo (não pagou novembro)'), { ativo: true, reconhecida: true });
igual('situação: Sim', lerSituacao('SIM'), { ativo: true, reconhecida: true });
igual('situação desconhecida fica ativa, com aviso', lerSituacao('aguardando'), { ativo: true, reconhecida: false });
igual('lição', [lerLicao('L12'), lerLicao('Lição 7'), lerLicao('25'), lerLicao('')], [12, 7, null, null]);
igual('link da planilha', idDaPlanilha('https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz_0123456789-xy/edit#gid=0'), '1AbCdEfGhIjKlMnOpQrStUvWxYz_0123456789-xy');
igual('link que não é planilha', idDaPlanilha('https://google.com'), '');

/* ---- leitura ---- */
const linhas = [
  ['ALUNOS NEXUS CHAPECÓ'],
  ['Aluno', 'Celular', 'Responsável', 'Tel. responsável', 'Livro', 'Lição', 'Situação', 'Matrícula'],
  ['Renan Antunes', '(49) 99731-0856', '', '', 'B2', 'L17', 'Ativo', '101'],
  ['Pedro Bortoli', '', 'Cláudia Bortoli', '49 98845-3310', 'Kids 2', '11', 'ativo', '102'],
  ['', '', '', '', '', '', '', ''],
  ['Sabrina Kunz', '49 99100-2020', '', '', 'A1', '4', 'Cancelado', '103'],
  ['', '49 99000-0000', '', '', '', '', '', ''],
  ['Renan Antunes', '(49) 99731-0856', '', '', 'B2', 'L17', 'Ativo', '101'],
  ['Lucas Fiorentin', 'sem', '', '', 'A2', '12', 'aguardando', '104'],
];
const l = lePlanilha(linhas);
igual('cabeçalho na linha 2', l.linhaCabecalho, 2);
igual('Tel. responsável vira o telefone do responsável', l.colunas.responsavelTelefone, 3);
igual('alunos lidos', l.alunos.map((a) => `${a.nome}|${a.telefone}|${a.trilha}|${a.ativo}|${a.licao}`), [
  'Renan Antunes|5549997310856|adultos|true|17',
  'Pedro Bortoli||kids|true|11',
  'Sabrina Kunz|5549991002020|adultos|false|4',
  'Lucas Fiorentin||adultos|true|12',
]);
igual('chave pelo código da matrícula', l.alunos[0].chave, 'c:101');
igual('problemas com a linha', l.problemas.map((p) => p.linha), [7, 8, 9]);
igual('situação que não reconheceu', l.situacoesDesconhecidas, ['aguardando']);

/* ---- o que muda no sistema ---- */
const existentes: AlunoDoSistema[] = [
  { id: 'x1', nome: 'Renan Antunes', telefone: '554997310856', nivel: 'B2', licao: 16, trilha: 'adultos', ativo: true },
  { id: 'x2', nome: 'Sabrina Kunz', telefone: '5549991002020', nivel: 'A1', licao: 4, trilha: 'adultos', ativo: false, planilhaChave: 'c:103' },
  { id: 'x3', nome: 'Marina Teles', telefone: '5549994785021', ativo: true, planilhaChave: 'c:099' },
  { id: 't1', nome: 'Pedro Bortoli', ativo: true, teste: true },
];
const p = planeja(l, existentes);
igual('novos: quem não existe (o de teste não conta)', p.novos.map((n) => n.nome), ['Pedro Bortoli', 'Lucas Fiorentin']);
igual('aluno novo da planilha nasce com lição e situação', [p.novos[1].licao, p.novos[1].ativo, p.novos[0].trilha], [12, true, 'kids']);
igual('Renan achado pelo telefone (com e sem o 9): muda só a lição', p.atualizados.map((a) => `${a.id}:${a.mudou.join(',')}`), ['x1:licao']);
igual('Sabrina igual, pela chave', p.iguais, 1);
igual('quem sumiu da planilha aparece, sem apagar', p.foraDaPlanilha, [{ id: 'x3', nome: 'Marina Teles' }]);
const semSituacao = planeja(lePlanilha([['Nome', 'Telefone'], ['Renan Antunes', '49 99731-0856']]), [{ ...existentes[0], ativo: false }]);
igual('sem coluna de situação, não mexe em quem está inativo', semSituacao.atualizados[0]?.campos.ativo, undefined);
igual('célula vazia não apaga o telefone', planeja(lePlanilha([['Nome', 'Telefone', 'Livro'], ['Renan Antunes', '', 'B2']]), [existentes[0]]).atualizados[0]?.campos.telefone, undefined);

/* ---- conversas ---- */
igual('liga a conversa sem aluno pelo telefone, inclusive o do responsável', vinculaConversas(
  [{ id: 'c1', waId: '554997310856' }, { id: 'c2', waId: '5549988453310' }, { id: 'c3', waId: '5549900000000' }, { id: 'c4', waId: '5549991002020', alunoId: 'x2' }],
  [{ id: 'x1', telefone: '5549997310856', ativo: true }, { id: 'n1', responsavelTelefone: '5549988453310', ativo: true }, { id: 'x2', telefone: '5549991002020', ativo: false }],
), [{ conversaId: 'c1', alunoId: 'x1' }, { conversaId: 'c2', alunoId: 'n1' }]);

if (falhas) { console.log(`\n${falhas} falha(s) na planilha.`); process.exit(1); }
console.log('planilha: tudo certo');
