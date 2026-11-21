/* Prova do leitor de Excel e CSV (src/lib/dominio/xlsx.ts). A planilha de teste é
   montada aqui mesmo, como o Excel e o Google Sheets gravam: textos compartilhados,
   estilos com formato de data, caixa de seleção, célula pulada e linha vazia no meio.
   Os nomes são inventados.
   Rodar:  node --experimental-strip-types testes/xlsx.ts  */
import { strToU8, zipSync } from 'fflate';
import {
  abreArquivo, abreXlsx, dataDoExcel, desfazXml, ErroDoArquivo, horaDoExcel, indiceDaColuna, leCsv, textoDoCsv, tipoDoFormato,
} from '../src/lib/dominio/xlsx.ts';
import { contas, lePlanilha } from '../src/lib/dominio/planilha.ts';

let falhas = 0;
function igual<T>(nome: string, veio: T, esperado: T) {
  if (JSON.stringify(veio) !== JSON.stringify(esperado)) {
    falhas += 1;
    console.log(`  x ${nome}\n    esperado ${JSON.stringify(esperado)}, veio ${JSON.stringify(veio)}`);
  }
}
function recusa(nome: string, f: () => unknown) {
  try { f(); falhas += 1; console.log(`  x ${nome}: devia recusar`); } catch (e) {
    if (!(e instanceof ErroDoArquivo)) { falhas += 1; console.log(`  x ${nome}: recusou com erro errado`, e); }
  }
}

/* ---- peças ---- */
igual('coluna A', indiceDaColuna('A'), 0);
igual('coluna AB', indiceDaColuna('AB'), 27);
igual('entidades e escape do Excel', desfazXml('Ana &amp; Bia &lt;3 &#233; _x000D_'), 'Ana & Bia <3 é \r');
igual('formato pronto 14 é data', tipoDoFormato(14), 'data');
igual('formato pronto 20 é hora', tipoDoFormato(20), 'hora');
igual('formato pronto 0 é número', tipoDoFormato(0), 'numero');
igual('dd/mm/yyyy é data', tipoDoFormato(167, 'dd/mm/yyyy'), 'data');
igual('dd/MM/yyyy é data', tipoDoFormato(168, 'dd/MM/yyyy'), 'data');
igual('mmm yyyy é data', tipoDoFormato(170, 'mmm yyyy'), 'data');
igual('hh:mm é hora', tipoDoFormato(180, 'hh:mm'), 'hora');
igual('[h]:mm é hora', tipoDoFormato(181, '[h]:mm'), 'hora');
igual('moeda não é data', tipoDoFormato(182, '"R$" #,##0.00'), 'numero');
igual('porcentagem não é data', tipoDoFormato(183, '0.0%'), 'numero');
igual('série do Excel em data', dataDoExcel(46165), '23/05/2026');
igual('data com hora', dataDoExcel(46165.5625), '23/05/2026 13:30');
igual('sistema de 1904', dataDoExcel(44703, true), '23/05/2026');
igual('hora', horaDoExcel(0.5625), '13:30');

/* ---- uma pasta de verdade, montada aqui ---- */
const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const textos = ['COD', 'NOME', 'yes', 'ei', 'BOOK', 'FIM DE CONTRATO', 'APP', 'OBSERVAÇÕES', 'TOTAL ALUNOS >',
  'Joana Teste Silva', 'YES', 'quartas às 13h30', 'A2 PRIVATE NATHAN', 'Pedro Exemplo - menor', 'TRANCADO', 'B1', 'volta em março', 'linha 1\r\nlinha 2'];
const sst = `${XML}<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${textos.length}" uniqueCount="${textos.length}">${
  textos.map((t, i) => (i === 7 ? `<si><r><t>OBSERVA</t></r><r><rPr><b/></rPr><t xml:space="preserve">ÇÕES</t></r><rPh sb="0" eb="1"><t>x</t></rPh></si>`
    : `<si><t xml:space="preserve">${t.replace(/&/g, '&amp;').replace(/\r/g, '_x000D_')}</t></si>`)).join('')}</sst>`;
const estilos = `${XML}<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="2"><numFmt numFmtId="164" formatCode="dd/mm/yyyy"/><numFmt numFmtId="165" formatCode="&quot;R$&quot; #,##0.00"/></numFmts>
<cellXfs count="4"><xf numFmtId="0" fontId="0"/><xf numFmtId="164" fontId="0" applyNumberFormat="1"/><xf numFmtId="165" fontId="0"/><xf numFmtId="20" fontId="0"/></cellXfs></styleSheet>`;
const c = (ref: string, v: number | string, extra = '') => `<c r="${ref}"${extra}><v>${v}</v></c>`;
const s = (ref: string, i: number) => c(ref, i, ' t="s"');
const aba1 = `${XML}<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>
<row r="1">${s('B1', 8)}${c('C1', 3)}</row>
<row r="3">${s('A3', 0)}${s('B3', 1)}${s('C3', 2)}${s('D3', 3)}${s('E3', 4)}${s('F3', 5)}${s('G3', 6)}${s('H3', 7)}</row>
<row r="4">${c('A4', 101)}${s('B4', 9)}${s('C4', 10)}${s('D4', 11)}${s('E4', 12)}${c('F4', 46165, ' s="1"')}${c('G4', 1, ' t="b"')}${s('H4', 17)}</row>
<row r="5" spans="1:8"/>
<row r="6">${c('A6', 102)}${s('B6', 13)}<c r="C6" s="0"/>${s('E6', 15)}${c('G6', 0, ' t="b"')}</row>
<row r="7">${c('A7', 103)}<c r="B7" t="inlineStr"><is><t>Rita Inventada</t></is></c>${s('C7', 14)}${s('H7', 16)}</row>
<row r="8"><c r="A8" s="2"/><c r="B8" t="e"><v>#REF!</v></c></row>
</sheetData></worksheet>`;
const aba2 = `${XML}<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>
<row r="1">${c('A1', 0.5625, ' s="3"')}${c('B1', 1234.5, ' s="2"')}${c('C1', '5549999123456')}${c('D1', '1.5E+3')}<c r="E1" t="str"><f>A1&amp;"x"</f><v>texto &amp; fórmula</v></c></row>
</sheetData></worksheet>`;
const livro = `${XML}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><workbookPr/><sheets>
<sheet state="visible" name="ATIVOS" sheetId="1" r:id="rId4"/><sheet name="Outra &amp; mais" sheetId="2" r:id="rId5"/><sheet name="Escondida" sheetId="3" state="veryHidden" r:id="rId6"/></sheets></workbook>`;
const rels = `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId5" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="/xl/worksheets/sheet2.xml"/>
<Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
<Relationship Id="rId6" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet3.xml"/></Relationships>`;
const zip = zipSync({
  '[Content_Types].xml': strToU8(`${XML}<Types/>`),
  'xl/workbook.xml': strToU8(livro),
  'xl/_rels/workbook.xml.rels': strToU8(rels),
  'xl/sharedStrings.xml': strToU8(sst),
  'xl/styles.xml': strToU8(estilos),
  'xl/worksheets/sheet1.xml': strToU8(aba1),
  'xl/worksheets/sheet2.xml': strToU8(aba2),
  'xl/worksheets/sheet3.xml': strToU8(aba2),
});

const pasta = abreXlsx(zip);
igual('as abas, sem a escondida de verdade', pasta.abas, ['ATIVOS', 'Outra & mais']);
const linhas = pasta.linhas('ATIVOS');
igual('linha 1 com o painel', linhas[0], ['', 'TOTAL ALUNOS >', '3']);
igual('linha 2 vazia fica no lugar', linhas[1], []);
igual('cabeçalho com texto em partes, sem a leitura fonética', linhas[2], ['COD', 'NOME', 'yes', 'ei', 'BOOK', 'FIM DE CONTRATO', 'APP', 'OBSERVAÇÕES']);
igual('aluno com data, caixa marcada e quebra de linha', linhas[3], ['101', 'Joana Teste Silva', 'YES', 'quartas às 13h30', 'A2 PRIVATE NATHAN', '23/05/2026', 'TRUE', 'linha 1\nlinha 2']);
igual('linha sem célula nenhuma', linhas[4], []);
igual('célula pulada vira vazio', linhas[5], ['102', 'Pedro Exemplo - menor', '', '', 'B1', '', 'FALSE']);
igual('texto dentro da célula', linhas[6], ['103', 'Rita Inventada', 'TRANCADO', '', '', '', '', 'volta em março']);
igual('erro e célula só com estilo no fim somem', linhas.length, 7);
igual('mesma aba pedida de novo vem pronta', pasta.linhas('ATIVOS') === linhas, true);
igual('hora, moeda, telefone, número com expoente e fórmula de texto', pasta.linhas('Outra & mais')[0], ['13:30', '1234.5', '5549999123456', '1500', 'texto & fórmula']);

/* o que sai daqui entra direto na leitura da planilha */
const leitura = lePlanilha(linhas);
igual('a leitura acha o cabeçalho na linha 3', leitura.linhaCabecalho, 3);
igual('os três alunos', leitura.alunos.map((a) => [a.codigo, a.nome, a.situacao, a.marcouSemana, a.contratoFim, a.appAtivo, a.menor]), [
  ['101', 'Joana Teste Silva', 'ativo', true, '2026-05-23', true, false],
  ['102', 'Pedro Exemplo', 'ativo', false, '', false, true],
  ['103', 'Rita Inventada', 'trancado', null, '', null, false],
]);
igual('as contas', contas(leitura.alunos).naoMarcaram, 1);

/* ---- o que não é xlsx ---- */
recusa('arquivo que não é zip', () => abreXlsx(strToU8('NOME;COD\nAna;1')));
recusa('zip sem planilha', () => abreXlsx(zipSync({ 'a.txt': strToU8('oi') })));
recusa('.xls antigo', () => abreArquivo('alunos.xls', new Uint8Array([0xd0, 0xcf])));
recusa('aba que não existe', () => pasta.linhas('Nenhuma'));

/* ---- CSV ---- */
igual('CSV do Excel em português (ponto e vírgula)', leCsv('﻿COD;NOME;OBS\r\n101;"Silva; Joana";"disse ""oi""\nnova linha"\r\n102;Pedro;\r\n'), [
  ['COD', 'NOME', 'OBS'], ['101', 'Silva; Joana', 'disse "oi"\nnova linha'], ['102', 'Pedro'],
]);
igual('CSV com vírgula', leCsv('a,b,c\n1,"2,5",3'), [['a', 'b', 'c'], ['1', '2,5', '3']]);
igual('CSV com tab', leCsv('a\tb\n1\t2\n\n'), [['a', 'b'], ['1', '2']]);
igual('linha vazia no meio fica', leCsv('a;b\n\n1;2'), [['a', 'b'], [], ['1', '2']]);
igual('CSV salvo no Windows antigo', textoDoCsv(new Uint8Array([0x4a, 0x6f, 0xe3, 0x6f])), 'João');
igual('CSV em UTF-8', textoDoCsv(strToU8('João')), 'João');
const csv = abreArquivo('Alunos 2026.csv', strToU8('NOME;COD\nAna Teste;7'));
igual('CSV vira uma aba com o nome do arquivo', [csv.abas, csv.linhas(csv.abas[0])], [['Alunos 2026'], [['NOME', 'COD'], ['Ana Teste', '7']]]);

console.log(falhas ? `\n${falhas} falha(s)` : 'xlsx: tudo certo');
process.exit(falhas ? 1 : 0);
