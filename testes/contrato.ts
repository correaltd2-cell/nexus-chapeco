/* Prova do cadastro pelo contrato (src/lib/dominio/contrato.ts e docx.ts): o que a IA
   leu vira a ficha, com as contas feitas por regra. Os nomes e documentos são inventados.
   Rodar:  node --experimental-strip-types testes/contrato.ts  */
import { strToU8, zipSync } from 'fflate';
import {
  CONTRATO_DE_EXEMPLO, caminhoDoContrato, caminhoValido, fichaDoContrato, idade, somaMeses, tipoDoContrato, type LidoDoContrato,
} from '../src/lib/dominio/contrato.ts';
import { textoDoDocx, textoDoXmlDoWord } from '../src/lib/dominio/docx.ts';
import { cadastroDoAluno } from '../src/lib/dominio/alunos.ts';

let falhas = 0;
function igual<T>(nome: string, veio: T, esperado: T) {
  if (JSON.stringify(veio) !== JSON.stringify(esperado)) {
    falhas += 1;
    console.log(`  x ${nome}\n    esperado ${JSON.stringify(esperado)}, veio ${JSON.stringify(veio)}`);
  }
}

/* ---- contas ---- */
igual('12 meses', somaMeses('2026-11-24', 12), '2027-11-24');
igual('mês que não tem o dia', somaMeses('2026-01-31', 1), '2026-02-28');
igual('ano bissexto', somaMeses('2027-01-31', 13), '2028-02-29');
igual('sem duração', somaMeses('2026-11-24', 0), '');
igual('idade antes do aniversário', idade('2010-12-01', '2026-11-24'), 15);
igual('idade no aniversário', idade('2008-11-24', '2026-11-24'), 18);
igual('idade sem data', idade('', '2026-11-24'), null);

/* ---- arquivo ---- */
igual('tipos', [tipoDoContrato('c.PDF', ''), tipoDoContrato('c.docx', ''), tipoDoContrato('foto', 'image/jpeg'), tipoDoContrato('c.doc', 'application/msword')], ['pdf', 'docx', 'imagem', null]);
const caminho = caminhoDoContrato('Ab12Cd34Ef', 'Contrato Maria.PDF', '2026-11-24T13:05:09.000Z');
igual('caminho do contrato', caminho, 'alunos/Ab12Cd34Ef/contrato-202611241305.pdf');
igual('caminho aceito', caminhoValido(caminho), true);
igual('caminho fora da pasta recusado', [caminhoValido('conversas/x/arquivo.pdf'), caminhoValido('alunos/../perfis/contrato-202611241305.pdf')], [false, false]);

/* ---- o Word ---- */
igual('xml do Word vira texto', textoDoXmlDoWord('<w:p><w:r><w:t>CONTRATANTE:</w:t></w:r><w:r><w:tab/><w:t>Ana &amp; Cia</w:t></w:r></w:p><w:p><w:r><w:t>CPF 1</w:t></w:r></w:p>'), 'CONTRATANTE:\tAna & Cia\nCPF 1');
const docx = zipSync({ 'word/document.xml': strToU8('<w:document><w:body><w:p><w:r><w:t>Aluno: Rui Teste</w:t></w:r></w:p></w:body></w:document>'), '[Content_Types].xml': strToU8('<x/>') });
igual('docx de verdade', textoDoDocx(docx), 'Aluno: Rui Teste');
igual('arquivo que não é docx', textoDoDocx(strToU8('não é zip')), null);

/* ---- a ficha ---- */
const lido: LidoDoContrato = {
  ehContrato: true, nome: '  Marcos   Inventado Silva ', cpf: '123.456.789-09', nascimento: '1994-03-10', telefone: '(49) 99912-3456',
  email: 'Marcos@Exemplo.com', endereco: 'Rua A, 10, Centro, CEP 89800-000', responsavelNome: '', responsavelTelefone: '',
  modalidade: 'online', moduloInicial: 'a2', duracaoMeses: 12, dataContrato: '2026-11-20', assinado: true, observacao: '',
};
const r = fichaDoContrato(lido, '2026-11-24T12:00:00.000Z');
igual('ficha do adulto', r.ficha, {
  nome: 'Marcos Inventado Silva', menor: false, codigo: '', nascimento: '1994-03-10', documento: '12345678909', telefone: '5549999123456',
  email: 'marcos@exemplo.com', endereco: 'Rua A, 10, Centro, CEP 89800-000', responsavelNome: '', responsavelTelefone: '',
  livroOriginal: 'A2', modalidade: 'online', contratoFim: '2027-11-20', contratoAssinado: true, horarioFixoTexto: '', observacao: '',
});
igual('nada faltou', [r.faltou, r.avisos], [[], []]);

const kid = fichaDoContrato({ ...lido, nome: 'Bia Inventada', nascimento: '14/08/2013', telefone: '', responsavelNome: '', responsavelTelefone: '' }, '2026-11-24T12:00:00.000Z');
igual('menor pela idade', [kid.ficha.menor, kid.ficha.nascimento], [true, '2013-08-14']);
igual('menor sem responsável avisa', kid.avisos, ['Pela data de nascimento, o aluno tem 13 anos: confira o responsável.']);
igual('sem telefone nenhum falta', kid.faltou, ['telefone']);

const marcadores = fichaDoContrato({ ...lido, cpf: '{{CPF_ALUNO}}', email: '{{EMAIL}}', dataContrato: '{{CIDADE_DATA}}', telefone: '123', duracaoMeses: 6 }, '2026-11-24T12:00:00.000Z');
igual('marcador do modelo não entra', [marcadores.ficha.documento, marcadores.ficha.email], ['', '']);
igual('sem data no contrato conta de hoje', marcadores.ficha.contratoFim, '2027-05-24');
igual('telefone torto avisa', marcadores.avisos, ['O telefone do contrato não parece telefone ("123").']);
igual('o que faltou', marcadores.faltou, ['CPF', 'telefone']);

/* ---- a ficha passa no cadastro ---- */
const exemplo = fichaDoContrato(CONTRATO_DE_EXEMPLO, '2026-11-24T12:00:00.000Z');
const cad = cadastroDoAluno(exemplo.ficha, [{ id: 'x', nome: 'Outro', codigo: '245', ativo: true }], '2026-11-24T12:00:00.000Z');
const c = 'campos' in cad ? cad.campos : { ERRO: cad.erro };
igual('exemplo cadastra', [c.nome, c.codigo, c.menor, c.responsavelTelefone, c.documento, c.endereco, c.contratoFim, c.trilha], [
  'Helena Ficticia Rossi', '246', true, '5549998123344', '52998224725', 'Rua das Palmeiras, 120, Centro, Chapecó, CEP 89801-000', '2027-11-24', 'adultos',
]);

console.log(falhas ? `\n${falhas} falha(s)` : 'contrato: tudo certo');
process.exit(falhas ? 1 : 0);
