/* Prova dos modelos de mensagem: a biblioteca passa nas regras da Meta, a conferência
   decide certo o que criar e o que gravar, e a conversa preenche o texto direito.
   Rodar:  node --experimental-strip-types testes/modelos.ts  */
import {
  BIBLIOTECA, faltando, modelosParaEnviar, pedidoParaMeta, planoDaConferencia, preenche,
  problemasDoModelo, quantasVariaveis, situacaoDaMeta, valoresIniciais,
  type ModeloDaEscola, type ModeloNaMeta, type SituacaoDoModelo,
} from '../src/lib/dominio/modelos.ts';

let falhas = 0;
function igual<T>(nome: string, veio: T, esperado: T) {
  if (JSON.stringify(veio) !== JSON.stringify(esperado)) {
    falhas += 1;
    console.log(`  x ${nome}\n    esperado ${JSON.stringify(esperado)}, veio ${JSON.stringify(veio)}`);
  }
}

/* ---- a biblioteca inteira passa nas regras ---- */
for (const m of BIBLIOTECA) igual(`${m.nome} sem problema`, problemasDoModelo(m), []);
igual('nomes sem repetir', new Set(BIBLIOTECA.map((m) => m.nome)).size, BIBLIOTECA.length);
igual('biblioteca tem os pedidos do cliente', [
  'chamada_aluno', 'retomada_contato', 'marcacao_aula_semana', 'financeiro_conversar',
  'assunto_urgente', 'confirmacao_aula', 'aula_cancelada', 'prova_resultado',
].every((n) => BIBLIOTECA.some((m) => m.nome === n)), true);
igual('o aviso à coordenação segue com o nome que o atendimento automático usa',
  BIBLIOTECA.find((m) => m.nome === 'aviso_demanda_coordenacao')?.interno, true);

/* ---- a regra pega o que a Meta recusa ---- */
const base: ModeloDaEscola = {
  nome: 'teste', titulo: 'Teste', grupo: 'Contato', categoria: 'UTILITY', quando: '',
  corpo: 'Oi, {{1}}! Tudo certo com a sua aula de amanhã por aqui?', campos: [{ rotulo: 'nome', exemplo: 'Ana' }],
};
igual('base boa', problemasDoModelo(base), []);
igual('começa com variável', problemasDoModelo({ ...base, corpo: '{{1}}, tudo certo com a sua aula de amanhã?' }),
  ['corpo começa com variável']);
igual('termina com variável', problemasDoModelo({ ...base, corpo: 'Tudo certo com a sua aula de amanhã, {{1}}' }),
  ['corpo termina com variável']);
igual('pontuação depois da variável não basta', problemasDoModelo({ ...base, corpo: 'Tudo certo com a sua aula de amanhã, {{1}}?' }),
  ['corpo termina com variável']);
igual('pulando número', problemasDoModelo({ ...base, corpo: 'Oi, {{2}}! Tudo certo com a sua aula de amanhã por aqui?' }),
  ['variáveis fora de ordem ou pulando número']);
igual('grudadas', problemasDoModelo({
  ...base, corpo: 'Oi, {{1}} {{2}}! Tudo certo com a sua aula de amanhã por aqui hoje mesmo?',
  campos: [...base.campos, { rotulo: 'x', exemplo: 'y' }],
}), ['duas variáveis grudadas']);
igual('variável demais', problemasDoModelo({
  ...base, corpo: 'Oi {{1}}, aula {{2}} às {{3}} ok?', campos: [base.campos[0], base.campos[0], base.campos[0]],
}), ['variável demais para o tamanho do texto']);
igual('botão comprido', problemasDoModelo({ ...base, respostas: ['Quero remarcar a minha aula de amanhã'] }),
  ['botão de resposta com mais de 25 letras']);
igual('travessão', problemasDoModelo({ ...base, corpo: 'Oi, {{1}}! Tudo certo com a sua aula — de amanhã?' }),
  ['corpo com travessão']);
igual('campo faltando', problemasDoModelo({ ...base, campos: [] }), ['cada variável precisa de um campo, e só um']);

/* ---- o pedido para a Meta ---- */
const conf = BIBLIOTECA.find((m) => m.nome === 'confirmacao_aula') as ModeloDaEscola;
const pedido = pedidoParaMeta(conf);
igual('pedido: idioma e categoria', [pedido.language, pedido.category], ['pt_BR', 'UTILITY']);
igual('pedido: exemplos na ordem', pedido.components[0].example, { body_text: [['Ana', 'quinta-feira, 26/11', '18h30']] });
igual('pedido: botões de resposta', pedido.components[1], {
  type: 'BUTTONS', buttons: [{ type: 'QUICK_REPLY', text: 'Confirmo' }, { type: 'QUICK_REPLY', text: 'Preciso remarcar' }],
});
const aviso = pedidoParaMeta(BIBLIOTECA.find((m) => m.nome === 'aviso_demanda_coordenacao') as ModeloDaEscola);
igual('pedido: link dinâmico com exemplo', aviso.components[1], {
  type: 'BUTTONS', buttons: [{
    type: 'URL', text: 'Abrir conversa',
    url: 'https://nexus-chapeco.vercel.app/conversas?conversa={{1}}',
    example: ['https://nexus-chapeco.vercel.app/conversas?conversa=AbC123'],
  }],
});
const aniversario = pedidoParaMeta(BIBLIOTECA.find((m) => m.nome === 'feliz_aniversario') as ModeloDaEscola);
igual('pedido sem botão não leva BUTTONS', aniversario.components.length, 1);

/* ---- a conferência com a Meta ---- */
const AGORA = '2026-11-21T12:00:00.000Z';
const naMeta = (name: string, status: string, extra: Partial<ModeloNaMeta> = {}): ModeloNaMeta => ({
  id: `m-${name}`, name, language: 'pt_BR', status, category: 'UTILITY',
  components: [{ type: 'BODY', text: BIBLIOTECA.find((m) => m.nome === name)?.corpo || 'Oi' }], ...extra,
});
const tipos = (ps: ReturnType<typeof planoDaConferencia>) => ps.map((p) =>
  p.tipo === 'criar' ? `criar ${p.modelo.nome}` : `${p.situacao.nome} ${p.situacao.estado}`);

const primeiraVez = planoDaConferencia({ naMeta: [], salvos: [], agora: AGORA, criar: true });
igual('primeira vez: cria a biblioteca toda', primeiraVez.filter((p) => p.tipo === 'criar').length, BIBLIOTECA.length);

const semCriar = planoDaConferencia({ naMeta: [], salvos: [], agora: AGORA, criar: false });
igual('só conferir: nada é criado', semCriar.every((p) => p.tipo === 'gravar' && p.situacao.estado === 'nao_enviado'), true);

const parcial = planoDaConferencia({
  naMeta: [
    naMeta('confirmacao_aula', 'APPROVED'),
    naMeta('aula_cancelada', 'REJECTED', { rejected_reason: 'INVALID_FORMAT' }),
    naMeta('hello_world', 'APPROVED', { language: 'en_US' }),
  ],
  salvos: [
    { id: 'prova_resultado__pt_BR', metaId: 'm-x', pedidoEm: AGORA },          // apagado na Meta
    { id: 'kids_falta__pt_BR', falhaEm: '2026-11-21T08:00:00.000Z', falha: 'x' }, // falhou faz 4 h
    { id: 'kids_resultado_prova__pt_BR', falhaEm: '2026-11-19T08:00:00.000Z' },  // falhou faz 2 dias
    { id: 'antigo__pt_BR', nome: 'antigo', idioma: 'pt_BR', estado: 'aprovado', corpo: 'x', respostas: [], temLink: false, daBiblioteca: false },
  ],
  agora: AGORA,
  criar: true,
});
const t = tipos(parcial);
igual('aprovado é gravado como aprovado', t.includes('confirmacao_aula aprovado'), true);
igual('recusado é gravado com o motivo', parcial.find((p) => p.tipo === 'gravar' && p.situacao.nome === 'aula_cancelada')
  && (parcial.find((p) => p.tipo === 'gravar' && p.situacao.nome === 'aula_cancelada') as { situacao: SituacaoDoModelo }).situacao.motivo,
'Formato inválido: variável, botão ou exemplo fora da regra.');
igual('modelo de outra língua é anotado, fora da biblioteca', t.includes('hello_world aprovado'), true);
igual('apagado na Meta não volta sozinho', t.includes('prova_resultado nao_existe'), true);
igual('falha recente espera o dia seguinte', t.includes('kids_falta nao_enviado'), true);
igual('falha antiga tenta de novo', t.includes('criar kids_resultado_prova'), true);
igual('o que sumiu de tudo fica como apagado', t.includes('antigo nao_existe'), true);
igual('não cria o que já está na Meta', t.includes('criar confirmacao_aula'), false);

const forcado = planoDaConferencia({
  naMeta: [], salvos: [{ id: 'prova_resultado__pt_BR', metaId: 'm-x' }], agora: AGORA, criar: true, forcar: ['prova_resultado'],
});
igual('mandar de novo à força', tipos(forcado).includes('criar prova_resultado'), true);

const pausado = situacaoDaMeta(naMeta('confirmacao_aula', 'PAUSED'), AGORA);
igual('pausado pela Meta', pausado.estado, 'pausado');
const comLink = situacaoDaMeta({
  ...naMeta('aviso_demanda_coordenacao', 'APPROVED'),
  components: [{ type: 'BODY', text: 'Oi, {{1}}!' }, { type: 'BUTTONS', buttons: [{ type: 'URL', text: 'Abrir', url: 'https://x/{{1}}' }] }],
}, AGORA);
igual('link dinâmico é marcado', comLink.temLink, true);
igual('categoria vem da Meta', situacaoDaMeta(naMeta('retomada_contato', 'APPROVED', { category: 'MARKETING' }), AGORA).categoria, 'MARKETING');

/* ---- escolher na conversa ---- */
const salvos = parcial.filter((p) => p.tipo === 'gravar').map((p) => (p as { situacao: SituacaoDoModelo }).situacao);
const lista = modelosParaEnviar([
  ...salvos,
  situacaoDaMeta(naMeta('aviso_demanda_coordenacao', 'APPROVED'), AGORA),
  situacaoDaMeta({ id: 'z', name: 'feito_na_meta', language: 'pt_BR', status: 'APPROVED',
    components: [{ type: 'BODY', text: 'Olá {{1}}, sua turma de {{2}} começa logo mais.' }] }, AGORA),
]);
igual('só aprovado em português e para o contato', lista.map((m) => m.situacao.nome), ['confirmacao_aula', 'feito_na_meta']);
igual('modelo feito fora ganha campos genéricos', lista.find((m) => m.situacao.nome === 'feito_na_meta')?.campos.map((c) => c.rotulo),
  ['campo 1', 'campo 2']);
igual('biblioteca traz os rótulos', lista[0].campos.map((c) => c.rotulo), ['primeiro nome', 'dia', 'horário']);

igual('primeiro nome já vem', valoresIniciais(conf.campos, 'Bianca Moraes'), ['Bianca', '', '']);
igual('nome que é telefone não vira "Oi, 5549"', valoresIniciais(conf.campos, '5549991234567'), ['', '', '']);
igual('prévia com rótulo no vazio', preenche(conf.corpo, ['Bianca', '', '19h'], conf.campos),
  'Oi, Bianca! Passando para confirmar a sua aula de [dia], às 19h. Podemos contar com você?');
igual('valor limpo de quebra de linha', preenche('Oi, {{1}}! Ok.', ['  Bia\n  Moraes ']), 'Oi, Bia Moraes! Ok.');
igual('o que falta', faltando(conf.campos, ['Bianca', ' ', '']), ['dia', 'horário']);
igual('conta variáveis repetidas uma vez', quantasVariaveis('{{1}} e {{1}} e {{2}}'), 2);

if (falhas) {
  console.log(`\n${falhas} falha(s).`);
  process.exit(1);
}
console.log(`modelos: tudo certo (${BIBLIOTECA.length} modelos na biblioteca).`);
