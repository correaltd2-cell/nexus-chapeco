/* Dados ficticios da demonstracao. Nomes inventados, nada de aluno de verdade.
   Serve para mostrar o sistema antes de o Firebase existir, e depois para ensaiar
   telas sem sujar o banco da escola. */
import type {
  Cartao, Conversa, Lista, Mensagem, MensagemAgendada, Perfil, Quadro,
} from '@/lib/dominio/tipos';
import { BIBLIOTECA, situacaoDaBiblioteca, type SituacaoDoModelo } from '@/lib/dominio/modelos';
import { semente } from '@/lib/dominio/agenda-exemplo';
import type { Aluno } from '@/lib/dominio/tipos';

const base = new Date();
base.setHours(10, 5, 0, 0);
const hm = (h: number, m: number) => {
  const d = new Date(base);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
};
const diasAtras = (n: number, h = 16, m = 0) => {
  const d = new Date(base);
  d.setDate(d.getDate() - n);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
};
const emDias = (n: number) => {
  const d = new Date(base);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
/* a janela de 24 horas fica aberta em quase todas, para dar para digitar na demonstracao */
const janela = () => new Date(base.getTime() + 20 * 3600 * 1000).toISOString();

const AGENDA = semente(new Date());

export const PERFIS: Perfil[] = [
  { id: 'u-gui', nome: 'Guilherme', email: 'guilherme@nexus.demo', papel: 'admin',
    setores: ['recepcao', 'financeiro', 'coordenacao', 'kids'], avisaNoWhats: false, ativo: true, criadoEm: diasAtras(90) },
  { id: 'u-rec', nome: 'Recepção', email: 'recepcao@nexus.demo', papel: 'recepcao',
    setores: ['recepcao', 'financeiro'], avisaNoWhats: false, ativo: true, criadoEm: diasAtras(90) },
  { id: 'u-natan', nome: 'Natan', email: 'natan@nexus.demo', papel: 'coordenacao',
    setores: ['coordenacao'], telefone: '5549990000101', avisaNoWhats: true, ativo: true, criadoEm: diasAtras(90) },
  { id: 'u-karina', nome: 'Karina', email: 'karina@nexus.demo', papel: 'coordenacao',
    setores: ['kids'], telefone: '5549990000102', avisaNoWhats: true, ativo: true, criadoEm: diasAtras(90) },
  ...AGENDA.professores.map((p): Perfil => ({
    ...p, papel: 'professor', setores: [], avisaNoWhats: false, ativo: true, daAula: true, criadoEm: diasAtras(60),
  })),
];

/* ---------- agenda: a mesma semente do botão de dados de teste ---------- */
export const ALUNOS: Aluno[] = AGENDA.alunos;
export const MODULOS = AGENDA.modulos;
export const AULAS_CURRICULO = AGENDA.aulas;
export const RECORRENCIAS = AGENDA.recorrencias;
export const BLOQUEIOS = AGENDA.bloqueios;
export const LOGS_AGENDA = AGENDA.logs;
export const AGENDAMENTOS = AGENDA.agendamentos.map((a) => {
  const { alunosDaAula, ...resto } = a;
  void alunosDaAula; /* a subcoleção vai à parte, em ALUNOS_DAS_AULAS */
  return resto;
});
export const ALUNOS_DAS_AULAS = Object.fromEntries(
  AGENDA.agendamentos.map((a) => [a.id, a.alunosDaAula.map((x) => ({ ...x, id: x.alunoId }))]),
);

export const CONVERSAS: Conversa[] = [
  { id: 'c-giovana', waId: '5549991542207', nome: 'Giovana Lazzari', alunoId: 'a-giovana',
    setor: 'recepcao', estado: 'aberta', agenteAtivo: true, naoLidas: 1, etiquetas: ['Financeiro'],
    ultimaEm: hm(10, 40), ultimaPreviaTexto: 'Oi, preciso do boleto desse mês', janelaAte: janela(), criadaEm: diasAtras(40) },
  { id: 'c-renan', waId: '5549997310856', nome: 'Renan Antunes', alunoId: 'a-renan',
    setor: 'recepcao', estado: 'aberta', agenteAtivo: true, naoLidas: 1, etiquetas: ['Marcação'],
    ultimaEm: hm(10, 38), ultimaPreviaTexto: 'Não vou conseguir ir na aula de quinta, dá pra remarcar?',
    janelaAte: janela(), criadaEm: diasAtras(25) },
  { id: 'c-claudia', waId: '5549988453310', nome: 'Cláudia Bortoli', alunoId: 'a-pedro',
    setor: 'kids', estado: 'aguardando', agenteAtivo: false, naoLidas: 0, etiquetas: ['Responsável'],
    ultimaEm: hm(10, 33), ultimaPreviaTexto: 'Karina recebeu o aviso no WhatsApp',
    janelaAte: janela(), aguardandoDesde: hm(10, 33), criadaEm: diasAtras(12) },
  { id: 'c-bianca', waId: '5549999207743', nome: 'Bianca Zanella', alunoId: 'a-bianca',
    setor: 'financeiro', estado: 'ia', agenteAtivo: true, naoLidas: 2, etiquetas: ['Financeiro'],
    ultimaEm: hm(10, 24), ultimaPreviaTexto: '🎤 Áudio', janelaAte: janela(), criadaEm: diasAtras(60) },
  { id: 'c-jonas', waId: '5549996671298', nome: 'Jonas Pereira', alunoId: 'a-jonas',
    setor: 'coordenacao', estado: 'aberta', agenteAtivo: false, naoLidas: 1, etiquetas: ['Renovação'],
    ultimaEm: hm(10, 12), ultimaPreviaTexto: 'Quero sim! Muda algo na mensalidade?', janelaAte: janela(), criadaEm: diasAtras(30) },
  { id: 'c-eduardo', waId: '5549998124410', nome: 'Eduardo Lunardi', alunoId: 'a-eduardo',
    setor: 'recepcao', estado: 'aberta', agenteAtivo: true, naoLidas: 2, etiquetas: ['Cancelamento'],
    ultimaEm: hm(10, 5), ultimaPreviaTexto: 'Quero cancelar meu curso. Mudei de horário no trabalho',
    janelaAte: janela(), criadaEm: diasAtras(18) },
  { id: 'c-larissa', waId: '5549992036615', nome: 'Larissa Menegat', alunoId: 'a-larissa',
    setor: 'recepcao', estado: 'aberta', agenteAtivo: false, naoLidas: 0, etiquetas: ['Reposição'],
    ultimaEm: diasAtras(2, 16, 21), ultimaPreviaTexto: 'Combinado! Te chamo na terça pra confirmar.',
    retorno: { quando: 'hoje às 14h00', nota: 'Confirmar a reposição de sexta' }, criadaEm: diasAtras(70) },
  { id: 'c-marina', waId: '5549994785021', nome: 'Marina Teles', alunoId: 'a-marina',
    setor: 'financeiro', estado: 'encerrada', agenteAtivo: false, naoLidas: 0, etiquetas: ['Financeiro'],
    ultimaEm: hm(8, 44), ultimaPreviaTexto: 'Combinado! Qualquer coisa é só chamar.',
    encerradaEm: hm(8, 44), encerradaPor: 'cliente', criadaEm: diasAtras(55) },
];

let n = 0;
const msg = (c: string, dados: Partial<Mensagem>): Mensagem => ({
  id: `m${++n}`, conversaId: c, direcao: 'entrada', autor: 'cliente', texto: '',
  criadaEm: hm(10, 0), ...dados,
} as Mensagem);

export const MENSAGENS: Mensagem[] = [
  msg('c-giovana', { texto: 'Oi, preciso do boleto desse mês', criadaEm: hm(10, 40) }),

  msg('c-renan', { texto: 'Não vou conseguir ir na aula de quinta, dá pra remarcar?', criadaEm: hm(10, 38) }),

  msg('c-claudia', { texto: 'Oi, sou mãe do Pedro do Kids. Ele tem tido dificuldade com as tarefas de casa, queria conversar com a coordenação', criadaEm: hm(10, 31) }),
  msg('c-claudia', { direcao: 'saida', autor: 'humano', autorNome: 'Recepção', lidoEm: hm(10, 32),
    entregueEm: hm(10, 32), texto: 'Oi, Cláudia! Vou chamar a Karina, que é a coordenadora do Kids. Ela te responde por aqui.', criadaEm: hm(10, 32) }),
  msg('c-claudia', { autor: 'sistema', texto: 'Recepção transferiu para Coordenação Kids', criadaEm: hm(10, 32) }),
  msg('c-claudia', { direcao: 'saida', autor: 'lumi', autorNome: 'Figurinha do setor', figurinha: true, midiaMime: 'image/webp',
    midiaLink: '/figurinhas/setor-kids.webp', midiaNome: 'Agora com Coordenação Kids', lidoEm: hm(10, 33), criadaEm: hm(10, 32) }),
  msg('c-claudia', { autor: 'sistema', texto: 'Karina recebeu o aviso no WhatsApp às 10:33. Ainda não abriu o portal.', criadaEm: hm(10, 33) }),

  msg('c-bianca', { texto: 'Bom dia, minha parcela de outubro ficou atrasada, queria ver como faço pra acertar', criadaEm: hm(10, 21) }),
  msg('c-bianca', { autor: 'sistema', texto: 'Recepção transferiu para Financeiro', criadaEm: hm(10, 21) }),
  msg('c-bianca', { direcao: 'saida', autor: 'lumi', lidoEm: hm(10, 22), entregueEm: hm(10, 22),
    texto: 'Oi, Bianca! Aqui é a assistente do financeiro da Nexus. Consultei sua situação:\nOut/2026: R$ 329,00, em atraso desde 20/10\nNov/2026: R$ 329,00, vence 20/11\nComo você prefere resolver?',
    botoes: ['2ª via do boleto', 'Quero parcelar', 'Falar com alguém'], criadaEm: hm(10, 22) }),
  msg('c-bianca', { texto: '', midiaMime: 'image/jpeg', midiaPath: 'demo/comprovante.jpg', criadaEm: hm(10, 24) }),
  msg('c-bianca', { texto: '', midiaMime: 'audio/ogg', midiaPath: 'demo/audio-bianca.ogg', criadaEm: hm(10, 24) }),

  msg('c-jonas', { texto: 'Queria saber se consigo mudar pra turma da manhã no próximo mês', criadaEm: hm(9, 50) }),
  msg('c-jonas', { direcao: 'saida', autor: 'humano', autorNome: 'Recepção', lidoEm: hm(9, 51), entregueEm: hm(9, 51),
    texto: 'Oi, Jonas! Vou passar pro Natan, nosso coordenador, ver as turmas da manhã no seu nível.', criadaEm: hm(9, 51) }),
  msg('c-jonas', { autor: 'sistema', texto: 'Recepção transferiu para Coordenação', criadaEm: hm(9, 51) }),
  msg('c-jonas', { direcao: 'saida', autor: 'humano', autorNome: 'Natan', lidoEm: hm(10, 5), entregueEm: hm(10, 5),
    texto: 'Oi, Jonas, aqui é o Natan. Tenho vaga no B1 de terça e quinta às 8h00 a partir de 01/12. Quer que eu já reserve?', criadaEm: hm(10, 5) }),
  msg('c-jonas', { texto: 'Quero sim! Muda algo na mensalidade?', criadaEm: hm(10, 12) }),

  msg('c-eduardo', { texto: 'Bom dia', criadaEm: hm(10, 5) }),
  msg('c-eduardo', { texto: 'Quero cancelar meu curso. Mudei de horário no trabalho e não consigo mais ir à noite', criadaEm: hm(10, 5) }),

  msg('c-larissa', { texto: 'Faltei na aula de sábado, tem como repor?', criadaEm: diasAtras(2, 16, 12) }),
  msg('c-larissa', { direcao: 'saida', autor: 'humano', autorNome: 'Recepção', lidoEm: diasAtras(2, 16, 15),
    entregueEm: diasAtras(2, 16, 15), texto: 'Oi, Larissa! Tem sim. Tenho reposição na sexta, 20/11, às 18h00. Fica bom?', criadaEm: diasAtras(2, 16, 15) }),
  msg('c-larissa', { texto: 'Vou ver minha escala e te aviso', criadaEm: diasAtras(2, 16, 20) }),
  msg('c-larissa', { direcao: 'saida', autor: 'humano', autorNome: 'Recepção', lidoEm: diasAtras(2, 16, 21),
    entregueEm: diasAtras(2, 16, 21), texto: 'Combinado! Te chamo na terça pra confirmar.', criadaEm: diasAtras(2, 16, 21) }),
  msg('c-larissa', { autor: 'sistema', texto: 'Retorno agendado para hoje às 14h00', criadaEm: diasAtras(2, 16, 21) }),

  msg('c-marina', { texto: 'Oi, preciso da segunda via da mensalidade', criadaEm: hm(8, 42) }),
  msg('c-marina', { direcao: 'saida', autor: 'lumi', lidoEm: hm(8, 43), entregueEm: hm(8, 43),
    texto: 'Aqui está a 2ª via da mensalidade de Nov/2026: R$ 369,00, vencimento 20/11.',
    midiaNome: 'boleto-nov-2026.pdf', midiaMime: 'application/pdf', criadaEm: hm(8, 43) }),
  msg('c-marina', { direcao: 'saida', autor: 'lumi', lidoEm: hm(8, 44), entregueEm: hm(8, 44),
    texto: 'Posso te ajudar em algo mais?', botoes: ['Sim, outra coisa', 'Não, obrigado'], criadaEm: hm(8, 43) }),
  msg('c-marina', { texto: 'Não, obrigado', criadaEm: hm(8, 44) }),
  msg('c-marina', { autor: 'sistema', texto: 'Atendimento encerrado', criadaEm: hm(8, 44) }),
];

/* uma mensagem ja programada, para o bloco do painel aparecer com conteudo */
export const AGENDADAS: MensagemAgendada[] = [
  {
    id: 'ag-renan', conversaId: 'c-renan',
    texto: 'Oi Renan! Lembrando que a sua reposição é amanhã às 19h. Até lá!',
    quando: emDias(1), autorId: 'u-rec', autorNome: 'Recepção',
    estado: 'agendada', criadaEm: hm(10, 45),
  },
];

/* os modelos como se a Meta já tivesse respondido: os de marketing ainda em análise */
export const TEMPLATES: SituacaoDoModelo[] = BIBLIOTECA.map((m) => ({
  ...situacaoDaBiblioteca(m, m.categoria === 'MARKETING' ? 'em_analise' : 'aprovado', hm(9, 0)),
  metaId: `demo-${m.nome}`, pedidoEm: diasAtras(1, 9, 0),
}));

export const QUADROS: Quadro[] = [
  { id: 'q-rec', nome: 'Recepção', ordem: 1000, arquivado: false, criadoEm: diasAtras(30) },
  { id: 'q-canc', nome: 'Cancelamentos', ordem: 2000, arquivado: false, criadoEm: diasAtras(30) },
  { id: 'q-coo', nome: 'Coordenação', ordem: 3000, arquivado: false, criadoEm: diasAtras(30) },
];

export const LISTAS: Lista[] = [
  { id: 'l-fazer', quadroId: 'q-rec', nome: 'A fazer', ordem: 1000, arquivada: false },
  { id: 'l-andamento', quadroId: 'q-rec', nome: 'Em andamento', ordem: 2000, arquivada: false },
  { id: 'l-aguardando', quadroId: 'q-rec', nome: 'Aguardando o aluno', ordem: 3000, arquivada: false },
  { id: 'l-feito', quadroId: 'q-rec', nome: 'Feito', ordem: 4000, arquivada: false },
  { id: 'l-pediu', quadroId: 'q-canc', nome: 'Pediu cancelamento', ordem: 1000, arquivada: false },
  { id: 'l-conversa', quadroId: 'q-canc', nome: 'Em conversa', ordem: 2000, arquivada: false },
  { id: 'l-ficou', quadroId: 'q-canc', nome: 'Ficou na escola', ordem: 3000, arquivada: false },
  { id: 'l-cancelou', quadroId: 'q-canc', nome: 'Cancelou', ordem: 4000, arquivada: false },
  { id: 'l-demandas', quadroId: 'q-coo', nome: 'Demandas', ordem: 1000, arquivada: false },
  { id: 'l-analise', quadroId: 'q-coo', nome: 'Em análise', ordem: 2000, arquivada: false },
  { id: 'l-resolvido', quadroId: 'q-coo', nome: 'Resolvido', ordem: 3000, arquivada: false },
];

const cart = (dados: Partial<Cartao> & { id: string; quadroId: string; listaId: string; titulo: string }): Cartao => ({
  ordem: 1000, descricao: '', etiquetas: [], membros: [], prazoConcluido: false,
  checklist: [], comentarios: [], atividade: [], anexos: [], arquivado: false,
  criadoEm: diasAtras(3), atualizadoEm: diasAtras(1), ...dados,
});

export const CARTOES: Cartao[] = [
  cart({ id: 'k1', quadroId: 'q-rec', listaId: 'l-fazer', ordem: 1000,
    titulo: 'Confirmar a reposição de sexta com a Larissa', conversaId: 'c-larissa',
    etiquetas: ['Reposição'], membros: ['u-rec'], prazo: emDias(0),
    checklist: [
      { id: 'i1', texto: 'Ver vaga na turma de sexta às 18h00', feito: true },
      { id: 'i2', texto: 'Confirmar com a aluna', feito: false },
    ] }),
  cart({ id: 'k2', quadroId: 'q-rec', listaId: 'l-fazer', ordem: 2000,
    titulo: 'Enviar os horários de janeiro para as turmas do A2', membros: ['u-rec'], prazo: emDias(4),
    descricao: 'Mandar por modelo aprovado para quem não fala com a gente há mais de 24 horas.' }),
  cart({ id: 'k3', quadroId: 'q-rec', listaId: 'l-fazer', ordem: 3000,
    titulo: 'Atualizar o telefone do responsável do Pedro', conversaId: 'c-claudia', etiquetas: ['Responsável'] }),
  cart({ id: 'k4', quadroId: 'q-rec', listaId: 'l-andamento', ordem: 1000,
    titulo: 'Remarcar a aula de quinta do Renan', conversaId: 'c-renan', membros: ['u-rec'], prazo: emDias(0) }),
  cart({ id: 'k5', quadroId: 'q-rec', listaId: 'l-andamento', ordem: 2000,
    titulo: 'Lista de presença da semana', membros: ['u-rec'], prazo: emDias(-3),
    checklist: [
      { id: 'i3', texto: 'Starter', feito: true }, { id: 'i4', texto: 'A1', feito: true },
      { id: 'i5', texto: 'A2', feito: false }, { id: 'i6', texto: 'B1', feito: false },
      { id: 'i7', texto: 'Kids', feito: false },
    ] }),
  cart({ id: 'k6', quadroId: 'q-rec', listaId: 'l-aguardando', ordem: 1000,
    titulo: 'Documentos do Jonas para a turma da manhã', conversaId: 'c-jonas',
    membros: ['u-natan', 'u-rec'], prazo: emDias(7),
    comentarios: [{ id: 'cm1', autorId: 'u-natan', autorNome: 'Natan',
      texto: 'Vaga reservada no B1 das 8h00. Falta só ele confirmar.', criadoEm: hm(10, 6) }] }),
  cart({ id: 'k7', quadroId: 'q-rec', listaId: 'l-feito', ordem: 1000,
    titulo: 'Lembretes das aulas de segunda', membros: ['u-rec'], prazo: emDias(-1), prazoConcluido: true }),

  cart({ id: 'k8', quadroId: 'q-canc', listaId: 'l-pediu', ordem: 1000,
    titulo: 'Eduardo Lunardi: mudou de horário no trabalho', conversaId: 'c-eduardo',
    etiquetas: ['Cancelamento'], membros: ['u-gui'], prazo: emDias(1),
    descricao: 'Conferir o que o contrato prevê antes de responder. Ver se a turma de sábado resolve.' }),
  cart({ id: 'k9', quadroId: 'q-canc', listaId: 'l-conversa', ordem: 1000,
    titulo: 'Tatiane Vargas: quer trancar por dois meses', etiquetas: ['Cancelamento'],
    membros: ['u-gui'], prazo: emDias(2),
    checklist: [
      { id: 'i8', texto: 'Ver as datas com a coordenação', feito: true },
      { id: 'i9', texto: 'Mandar a proposta de trancamento', feito: false },
    ] }),
  cart({ id: 'k10', quadroId: 'q-canc', listaId: 'l-ficou', ordem: 1000,
    titulo: 'Marcos Pilatti: trocou para a turma de sábado', etiquetas: ['Cancelamento'],
    membros: ['u-natan'], prazo: emDias(-5), prazoConcluido: true }),
  cart({ id: 'k11', quadroId: 'q-canc', listaId: 'l-cancelou', ordem: 1000,
    titulo: 'Aline Rossetto: contrato encerrado em 10/11', etiquetas: ['Cancelamento'], membros: ['u-gui'] }),

  cart({ id: 'k12', quadroId: 'q-coo', listaId: 'l-demandas', ordem: 1000,
    titulo: 'Cláudia Bortoli: dificuldade do Pedro com as tarefas', conversaId: 'c-claudia',
    etiquetas: ['Responsável'], membros: ['u-karina'] }),
  cart({ id: 'k13', quadroId: 'q-coo', listaId: 'l-analise', ordem: 1000,
    titulo: 'Jonas Pereira: troca para a turma da manhã', conversaId: 'c-jonas',
    membros: ['u-natan'], prazo: emDias(14) }),
  cart({ id: 'k14', quadroId: 'q-coo', listaId: 'l-resolvido', ordem: 1000,
    titulo: 'Plano de reforço do Kids 2', membros: ['u-karina'], prazo: emDias(-4), prazoConcluido: true,
    checklist: [
      { id: 'i10', texto: 'Atividades extras', feito: true },
      { id: 'i11', texto: 'Conversa com os responsáveis', feito: true },
    ] }),
];
