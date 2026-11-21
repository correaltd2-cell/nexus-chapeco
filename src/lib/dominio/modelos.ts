/* Os modelos de mensagem da escola (os "templates" da Meta).
   Modelo aprovado é o único jeito de falar com quem não escreve há mais de 24 horas,
   e o jeito certo de mandar aviso com botão (confirmar aula, pedir a 2ª via).

   A biblioteca abaixo é a fonte: o servidor manda à Meta o que ainda não existe lá
   (src/lib/whatsapp/modelos.ts) e anota a situação de cada um em `templates`. A tela
   da conversa só oferece o que a Meta aprovou.

   Regras da Meta que a biblioteca respeita, conferidas em `problemasDoModelo`:
   nome em minúsculas com _, corpo até 1024 letras, variáveis {{1}}, {{2}}... em ordem,
   nunca no começo nem no fim do texto e nunca grudadas uma na outra, botão de resposta
   até 25 letras. Utilidade é aviso de algo que o aluno já tem (aula, prova, parcela);
   marketing é convite e felicitação, e custa mais.
   Prova: node --experimental-strip-types testes/modelos.ts */

export type CategoriaModelo = 'UTILITY' | 'MARKETING' | 'AUTHENTICATION';

export type GrupoModelo = 'Aulas' | 'Provas' | 'Financeiro' | 'Contrato' | 'Kids' | 'Contato' | 'Equipe';
export const GRUPOS: GrupoModelo[] = ['Aulas', 'Provas', 'Financeiro', 'Contrato', 'Kids', 'Contato', 'Equipe'];

export interface CampoDoModelo {
  rotulo: string;          // o que a pessoa preenche: "dia da aula"
  exemplo: string;         // o exemplo que vai para a Meta aprovar
  nome?: true;             // já vem com o primeiro nome do contato
}

export interface ModeloDaEscola {
  nome: string;            // o nome na Meta
  titulo: string;          // como aparece na tela
  grupo: GrupoModelo;
  categoria: Exclude<CategoriaModelo, 'AUTHENTICATION'>;
  quando: string;          // para quem e quando usar
  corpo: string;
  campos: CampoDoModelo[]; // um por variável, na ordem
  respostas?: string[];    // botões de resposta rápida
  /* botão de link com o fim dinâmico: url termina em {{1}} */
  link?: { texto: string; url: string; exemplo: string };
  interno?: true;          // vai para a equipe, não para o contato
}

export const IDIOMA = 'pt_BR';
export const ENDERECO = 'https://nexus-chapeco.vercel.app';

const NOME: CampoDoModelo = { rotulo: 'primeiro nome', exemplo: 'Ana', nome: true };
const RESPONSAVEL: CampoDoModelo = { rotulo: 'nome do responsável', exemplo: 'Cláudia', nome: true };
const DIA: CampoDoModelo = { rotulo: 'dia', exemplo: 'quinta-feira, 26/11' };
const HORA: CampoDoModelo = { rotulo: 'horário', exemplo: '18h30' };

export const BIBLIOTECA: ModeloDaEscola[] = [
  /* ---------------- aulas ---------------- */
  {
    nome: 'marcacao_aula_semana', titulo: 'Marcação da semana', grupo: 'Aulas', categoria: 'UTILITY',
    quando: 'Quem ainda não marcou a aula da semana.',
    corpo: 'Oi, {{1}}! A grade de aulas da semana que começa em {{2}} já está aberta e a sua aula ainda não foi marcada. Quer escolher o seu horário agora?',
    campos: [NOME, { rotulo: 'início da semana', exemplo: '30/11' }],
    respostas: ['Quero marcar', 'Já marquei'],
  },
  {
    nome: 'marcacao_aula_lembrete', titulo: 'Lembrete de marcação', grupo: 'Aulas', categoria: 'UTILITY',
    quando: 'A semana está passando e o aluno não marcou.',
    corpo: 'Oi, {{1}}! A semana está passando e a sua aula ainda não foi marcada. Responda aqui com o melhor dia e horário para você que a gente encaixa na grade.',
    campos: [NOME],
    respostas: ['Quero marcar'],
  },
  {
    nome: 'confirmacao_aula', titulo: 'Confirmação de aula', grupo: 'Aulas', categoria: 'UTILITY',
    quando: 'Um dia antes da aula, para confirmar presença.',
    corpo: 'Oi, {{1}}! Passando para confirmar a sua aula de {{2}}, às {{3}}. Podemos contar com você?',
    campos: [NOME, DIA, HORA],
    respostas: ['Confirmo', 'Preciso remarcar'],
  },
  {
    nome: 'lembrete_aula_hoje', titulo: 'Lembrete de aula hoje', grupo: 'Aulas', categoria: 'UTILITY',
    quando: 'No dia da aula, algumas horas antes.',
    corpo: 'Oi, {{1}}! Hoje tem aula às {{2}}. Se não puder vir, avise por aqui para a gente liberar o horário para outro aluno.',
    campos: [NOME, HORA],
    respostas: ['Estarei lá', 'Não vou conseguir'],
  },
  {
    nome: 'aula_cancelada', titulo: 'Aula cancelada', grupo: 'Aulas', categoria: 'UTILITY',
    quando: 'A escola precisou cancelar a aula marcada.',
    corpo: 'Oi, {{1}}! A sua aula de {{2}}, às {{3}}, foi cancelada. Pedimos desculpas pelo transtorno. Responda esta mensagem para escolher um novo horário.',
    campos: [NOME, DIA, HORA],
    respostas: ['Escolher horário'],
  },
  {
    nome: 'aula_remarcada', titulo: 'Aula remarcada', grupo: 'Aulas', categoria: 'UTILITY',
    quando: 'A aula mudou de dia ou de horário.',
    corpo: 'Oi, {{1}}! A sua aula foi remarcada para {{2}}, às {{3}}. Se esse horário não for bom para você, é só responder por aqui.',
    campos: [NOME, DIA, HORA],
    respostas: ['Combinado', 'Não posso'],
  },
  {
    nome: 'falta_reposicao', titulo: 'Falta e reposição', grupo: 'Aulas', categoria: 'UTILITY',
    quando: 'O aluno faltou e pode marcar a reposição.',
    corpo: 'Oi, {{1}}! Sentimos a sua falta na aula de {{2}}. Para você não perder o conteúdo, que tal marcar uma reposição? Responda aqui com o melhor horário.',
    campos: [NOME, DIA],
    respostas: ['Quero repor', 'Vejo depois'],
  },
  {
    nome: 'reposicao_marcada', titulo: 'Reposição marcada', grupo: 'Aulas', categoria: 'UTILITY',
    quando: 'A reposição ficou marcada.',
    corpo: 'Oi, {{1}}! A sua reposição está marcada para {{2}}, às {{3}}. Te esperamos na Nexus!',
    campos: [NOME, DIA, HORA],
    respostas: ['Confirmo', 'Preciso remarcar'],
  },
  {
    nome: 'aviso_sem_aula', titulo: 'Dia sem aula', grupo: 'Aulas', categoria: 'UTILITY',
    quando: 'Feriado, recesso ou escola fechada.',
    corpo: 'Oi, {{1}}! Por causa de {{2}}, não teremos aula em {{3}}. As aulas seguem normalmente depois disso. Qualquer dúvida, é só responder por aqui.',
    campos: [NOME, { rotulo: 'motivo', exemplo: 'o feriado de Natal' }, { rotulo: 'dia', exemplo: '25/12' }],
  },

  /* ---------------- provas ---------------- */
  {
    nome: 'prova_agendada', titulo: 'Prova marcada', grupo: 'Provas', categoria: 'UTILITY',
    quando: 'A prova de fim de módulo ficou marcada.',
    corpo: 'Oi, {{1}}! A sua prova de fim de módulo está marcada para {{2}}, às {{3}}. Revise as últimas lições e, se tiver alguma dúvida, é só responder por aqui. Boa prova!',
    campos: [NOME, DIA, HORA],
    respostas: ['Confirmo', 'Preciso remarcar'],
  },
  {
    nome: 'prova_pendente', titulo: 'Prova pendente', grupo: 'Provas', categoria: 'UTILITY',
    quando: 'O aluno terminou o módulo e ainda não fez a prova.',
    corpo: 'Oi, {{1}}! A sua prova de fim de módulo do {{2}} ainda está pendente. Responda aqui para combinarmos o melhor dia para fazer.',
    campos: [NOME, { rotulo: 'nível', exemplo: 'A2' }],
    respostas: ['Quero marcar'],
  },
  {
    nome: 'prova_resultado', titulo: 'Resultado da prova', grupo: 'Provas', categoria: 'UTILITY',
    quando: 'A prova foi corrigida.',
    corpo: 'Oi, {{1}}! O resultado da sua prova do {{2}} saiu: a sua nota foi {{3}}. Se quiser conversar sobre a correção, é só responder por aqui.',
    campos: [NOME, { rotulo: 'módulo', exemplo: 'módulo 3 do A2' }, { rotulo: 'nota', exemplo: '8,5' }],
    respostas: ['Ver a correção'],
  },
  {
    nome: 'prova_aprovacao', titulo: 'Passou de nível', grupo: 'Provas', categoria: 'UTILITY',
    quando: 'O aluno passou na prova e sobe de nível.',
    corpo: 'Parabéns, {{1}}! Você passou na prova do {{2}} e segue agora para o {{3}}. Estamos muito felizes com a sua evolução!',
    campos: [NOME, { rotulo: 'nível de agora', exemplo: 'A2' }, { rotulo: 'próximo nível', exemplo: 'B1' }],
  },

  /* ---------------- financeiro ---------------- */
  {
    nome: 'financeiro_vencimento', titulo: 'Lembrete de vencimento', grupo: 'Financeiro', categoria: 'UTILITY',
    quando: 'Alguns dias antes de a parcela vencer.',
    corpo: 'Oi, {{1}}! Passando para lembrar que a parcela de {{2}} vence em {{3}}. Se precisar da segunda via, é só tocar no botão abaixo.',
    campos: [NOME, { rotulo: 'valor', exemplo: 'R$ 389,00' }, { rotulo: 'vencimento', exemplo: '10/12' }],
    respostas: ['Quero a 2ª via', 'Já paguei'],
  },
  {
    nome: 'financeiro_em_aberto', titulo: 'Parcela em aberto', grupo: 'Financeiro', categoria: 'UTILITY',
    quando: 'A parcela venceu e não consta o pagamento.',
    corpo: 'Oi, {{1}}! Consta em aberto a parcela de {{2}}, que venceu em {{3}}. Se já pagou, pode desconsiderar esta mensagem. Se precisar de ajuda, o nosso financeiro está por aqui.',
    campos: [NOME, { rotulo: 'valor', exemplo: 'R$ 389,00' }, { rotulo: 'vencimento', exemplo: '10/11' }],
    respostas: ['Quero a 2ª via', 'Já paguei', 'Falar com o financeiro'],
  },
  {
    nome: 'financeiro_pagamento_recebido', titulo: 'Pagamento recebido', grupo: 'Financeiro', categoria: 'UTILITY',
    quando: 'O pagamento caiu.',
    corpo: 'Oi, {{1}}! Recebemos o pagamento de {{2}}, referente a {{3}}. Muito obrigado pela confiança e bons estudos!',
    campos: [NOME, { rotulo: 'valor', exemplo: 'R$ 389,00' }, { rotulo: 'referente a', exemplo: 'parcela de dezembro' }],
  },
  {
    nome: 'financeiro_conversar', titulo: 'Assunto do financeiro', grupo: 'Financeiro', categoria: 'UTILITY',
    quando: 'O financeiro precisa falar com o aluno sobre um assunto dele.',
    corpo: 'Oi, {{1}}! Aqui é do financeiro da Nexus English Center Chapecó. Precisamos falar com você sobre {{2}}. Pode responder por aqui quando tiver um minutinho?',
    campos: [NOME, { rotulo: 'assunto', exemplo: 'o pagamento do seu contrato' }],
    respostas: ['Pode falar'],
  },

  /* ---------------- contrato ---------------- */
  {
    nome: 'matricula_boas_vindas', titulo: 'Boas-vindas', grupo: 'Contrato', categoria: 'UTILITY',
    quando: 'Logo depois da matrícula.',
    corpo: 'Oi, {{1}}! Boas-vindas à Nexus English Center Chapecó! A sua matrícula no {{2}} está confirmada e a primeira aula é em {{3}}. Salve este número: é por aqui que você fala com a escola.',
    campos: [NOME, { rotulo: 'nível', exemplo: 'A1' }, { rotulo: 'dia da primeira aula', exemplo: '02/12, às 18h30' }],
  },
  {
    nome: 'contrato_terminando', titulo: 'Fim do contrato', grupo: 'Contrato', categoria: 'UTILITY',
    quando: 'O contrato está perto do fim.',
    corpo: 'Oi, {{1}}! O seu contrato com a Nexus termina em {{2}}. Se quiser saber como continuar os estudos no próximo nível, é só responder por aqui.',
    campos: [NOME, { rotulo: 'data do fim', exemplo: '20/12' }],
    respostas: ['Quero saber', 'Agora não'],
  },

  /* ---------------- kids (fala com o responsável) ---------------- */
  {
    nome: 'kids_confirmacao_aula', titulo: 'Kids: confirmação de aula', grupo: 'Kids', categoria: 'UTILITY',
    quando: 'Para o responsável, um dia antes da aula.',
    corpo: 'Oi, {{1}}! Passando para confirmar a aula de {{2}} em {{3}}. Podemos contar com a presença?',
    campos: [RESPONSAVEL, { rotulo: 'nome do aluno', exemplo: 'Pedro' }, { rotulo: 'dia e horário', exemplo: 'quinta-feira, 26/11, às 17h' }],
    respostas: ['Confirmo', 'Preciso remarcar'],
  },
  {
    nome: 'kids_falta', titulo: 'Kids: falta na aula', grupo: 'Kids', categoria: 'UTILITY',
    quando: 'Para o responsável, quando o aluno faltou.',
    corpo: 'Oi, {{1}}! Sentimos falta de {{2}} na aula de {{3}}. Está tudo bem? Responda aqui para combinarmos uma reposição.',
    campos: [RESPONSAVEL, { rotulo: 'nome do aluno', exemplo: 'Pedro' }, { rotulo: 'dia', exemplo: 'ontem' }],
    respostas: ['Quero repor', 'Vejo depois'],
  },
  {
    nome: 'kids_resultado_prova', titulo: 'Kids: resultado da prova', grupo: 'Kids', categoria: 'UTILITY',
    quando: 'Para o responsável, com a nota da prova.',
    corpo: 'Oi, {{1}}! O resultado da prova de {{2}} saiu: a nota foi {{3}}. Se quiser conversar sobre o desempenho, é só responder por aqui.',
    campos: [RESPONSAVEL, { rotulo: 'nome do aluno', exemplo: 'Pedro' }, { rotulo: 'nota', exemplo: '9,0' }],
    respostas: ['Quero conversar'],
  },
  {
    nome: 'kids_recado_coordenacao', titulo: 'Kids: recado da coordenação', grupo: 'Kids', categoria: 'UTILITY',
    quando: 'A Coordenação Kids quer falar com o responsável.',
    corpo: 'Oi, {{1}}! Aqui é da Coordenação Kids da Nexus. Queremos conversar com você sobre {{2}}. Pode responder por aqui quando tiver um minutinho?',
    campos: [RESPONSAVEL, { rotulo: 'assunto', exemplo: 'o desenvolvimento do Pedro' }],
    respostas: ['Pode falar'],
  },

  /* ---------------- contato ---------------- */
  {
    nome: 'chamada_aluno', titulo: 'Chamar para conversar', grupo: 'Contato', categoria: 'UTILITY',
    quando: 'Para abrir a conversa com quem não escreve há mais de 24 horas.',
    corpo: 'Oi, {{1}}! Aqui é da Nexus English Center Chapecó. A nossa equipe precisa falar com você. Pode responder esta mensagem quando tiver um minutinho?',
    campos: [NOME],
    respostas: ['Pode falar'],
  },
  {
    nome: 'assunto_urgente', titulo: 'Assunto urgente', grupo: 'Contato', categoria: 'UTILITY',
    quando: 'Quando a escola precisa de resposta logo.',
    corpo: 'Oi, {{1}}! Aqui é da Nexus English Center Chapecó. Precisamos falar com você com urgência sobre {{2}}. Por favor, responda esta mensagem assim que puder.',
    campos: [NOME, { rotulo: 'assunto', exemplo: 'a sua aula de amanhã' }],
    respostas: ['Pode falar agora', 'Mais tarde'],
  },
  {
    nome: 'retomada_atendimento', titulo: 'Retomar o atendimento', grupo: 'Contato', categoria: 'UTILITY',
    quando: 'A conversa ficou pela metade e a janela fechou.',
    corpo: 'Oi, {{1}}! A nossa conversa sobre {{2}} ficou pela metade e queremos te ajudar a resolver. Pode responder por aqui quando puder?',
    campos: [NOME, { rotulo: 'assunto', exemplo: 'a marcação da sua aula' }],
    respostas: ['Vamos continuar'],
  },
  {
    nome: 'retomada_contato', titulo: 'Retomar contato', grupo: 'Contato', categoria: 'MARKETING',
    quando: 'Ex-aluno ou interessado que sumiu. Quem conversa depois é o vendedor.',
    corpo: 'Oi, {{1}}! Aqui é da Nexus English Center Chapecó. Faz um tempo que a gente não conversa e queremos saber como está o seu inglês. Temos turmas e horários novos. Quer conhecer?',
    campos: [NOME],
    respostas: ['Quero conhecer', 'Agora não'],
  },
  {
    nome: 'feliz_aniversario', titulo: 'Feliz aniversário', grupo: 'Contato', categoria: 'MARKETING',
    quando: 'No aniversário do aluno.',
    corpo: 'Feliz aniversário, {{1}}! Toda a equipe da Nexus English Center Chapecó deseja um ano incrível para você. Happy birthday! 🎉',
    campos: [NOME],
  },

  /* ---------------- equipe ---------------- */
  {
    nome: 'aviso_demanda_coordenacao', titulo: 'Aviso à coordenação', grupo: 'Equipe', categoria: 'UTILITY',
    quando: 'Sai sozinho para o Natan ou a Karina quando a conversa passa para a coordenação.',
    corpo: 'Oi, {{1}}! Chegou uma conversa para a {{2}} no sistema da Nexus: {{3}}. Responda pelo sistema.',
    campos: [
      { rotulo: 'nome de quem recebe', exemplo: 'Karina' },
      { rotulo: 'setor', exemplo: 'Coordenação Kids' },
      { rotulo: 'contato', exemplo: 'Cláudia Bortoli' },
    ],
    link: { texto: 'Abrir conversa', url: `${ENDERECO}/conversas?conversa={{1}}`, exemplo: `${ENDERECO}/conversas?conversa=AbC123` },
    interno: true,
  },
];

export const modeloDaBiblioteca = (nome: string) => BIBLIOTECA.find((m) => m.nome === nome);

/* ================= regras da Meta ================= */

const VARIAVEL = /\{\{(\d+)\}\}/g;
const variaveisDe = (texto: string) => [...texto.matchAll(VARIAVEL)].map((m) => Number(m[1]));

/** Quantas variáveis o texto tem ({{1}}, {{2}}...). */
export const quantasVariaveis = (texto: string) => new Set(variaveisDe(texto)).size;

/** O que a Meta recusaria neste modelo. Vazio é modelo bom para mandar. */
export function problemasDoModelo(m: ModeloDaEscola): string[] {
  const p: string[] = [];
  if (!/^[a-z0-9_]{1,512}$/.test(m.nome)) p.push('nome só com letras minúsculas, números e _');
  if (m.corpo.length > 1024) p.push('corpo passa de 1024 letras');
  if (/[–—]/.test(m.corpo)) p.push('corpo com travessão');
  if (/\n{3,}|\t| {4,}/.test(m.corpo)) p.push('corpo com linha em branco a mais, tab ou espaços seguidos');

  const nums = variaveisDe(m.corpo);
  const distintas = [...new Set(nums)];
  if (distintas.some((n, i) => n !== i + 1)) p.push('variáveis fora de ordem ou pulando número');
  if (distintas.length !== m.campos.length) p.push('cada variável precisa de um campo, e só um');
  if (nums.length) {
    const antes = m.corpo.slice(0, m.corpo.indexOf('{{'));
    const depois = m.corpo.slice(m.corpo.lastIndexOf('}}') + 2);
    if (!/\p{L}/u.test(antes)) p.push('corpo começa com variável');
    if (!/\p{L}/u.test(depois)) p.push('corpo termina com variável');
    if (/\}\}\s*\{\{/.test(m.corpo)) p.push('duas variáveis grudadas');
    const palavras = m.corpo.replace(VARIAVEL, ' ').match(/\p{L}+/gu)?.length || 0;
    if (palavras < distintas.length * 3 + 2) p.push('variável demais para o tamanho do texto');
  }
  if (m.campos.some((c) => !c.exemplo.trim() || /[\n\t]/.test(c.exemplo))) p.push('exemplo vazio ou com quebra de linha');

  const r = m.respostas || [];
  if (r.length + (m.link ? 1 : 0) > 10) p.push('botão demais');
  if (r.some((b) => !b.trim() || b.length > 25)) p.push('botão de resposta com mais de 25 letras');
  if (new Set(r).size !== r.length) p.push('dois botões com o mesmo texto');
  if (m.link) {
    if (m.link.texto.length > 25) p.push('botão de link com mais de 25 letras');
    if (!m.link.url.startsWith('https://') || !m.link.url.endsWith('{{1}}')) p.push('link precisa ser https e terminar em {{1}}');
  }
  return p;
}

/** O pedido de criação, do jeito que a Meta lê (POST /{waba}/message_templates). */
export function pedidoParaMeta(m: ModeloDaEscola) {
  const componentes: Record<string, unknown>[] = [{
    type: 'BODY',
    text: m.corpo,
    ...(m.campos.length ? { example: { body_text: [m.campos.map((c) => c.exemplo)] } } : {}),
  }];
  const botoes: Record<string, unknown>[] = (m.respostas || []).map((texto) => ({ type: 'QUICK_REPLY', text: texto }));
  if (m.link) botoes.push({ type: 'URL', text: m.link.texto, url: m.link.url, example: [m.link.exemplo] });
  if (botoes.length) componentes.push({ type: 'BUTTONS', buttons: botoes });
  return { name: m.nome, language: IDIOMA, category: m.categoria, components: componentes };
}

/* ================= situação de cada modelo (coleção templates) ================= */

export type EstadoModelo =
  | 'aprovado' | 'em_analise' | 'recusado' | 'pausado' | 'desativado' | 'nao_enviado' | 'nao_existe';

export interface SituacaoDoModelo {
  id: string;              // nome__idioma
  nome: string;
  idioma: string;
  estado: EstadoModelo;
  categoria?: CategoriaModelo;      // a que a Meta deu, que pode não ser a pedida
  corpo: string;
  respostas: string[];
  temLink: boolean;
  daBiblioteca: boolean;
  metaId?: string;
  motivo?: string;          // por que a Meta recusou ou pausou
  pedidoEm?: string;        // quando o sistema mandou para a Meta
  falha?: string;           // a Meta não aceitou o pedido
  falhaEm?: string;
  atualizadoEm: string;
}

export const idDoModelo = (nome: string, idioma = IDIOMA) => `${nome}__${idioma}`;

/** O status da Meta na língua da escola. */
export function estadoDaMeta(status: string): EstadoModelo {
  switch ((status || '').toUpperCase()) {
    case 'APPROVED': return 'aprovado';
    case 'PENDING': case 'IN_APPEAL': return 'em_analise';
    case 'REJECTED': return 'recusado';
    case 'PAUSED': case 'LIMIT_EXCEEDED': return 'pausado';
    case 'DISABLED': return 'desativado';
    case 'PENDING_DELETION': case 'DELETED': case 'ARCHIVED': return 'nao_existe';
    default: return 'em_analise';
  }
}

export const NOME_DO_ESTADO: Record<EstadoModelo, string> = {
  aprovado: 'Aprovado',
  em_analise: 'Em análise na Meta',
  recusado: 'Recusado',
  pausado: 'Pausado pela Meta',
  desativado: 'Desativado pela Meta',
  nao_enviado: 'Ainda não enviado',
  nao_existe: 'Apagado na Meta',
};

export const NOME_DA_CATEGORIA: Record<CategoriaModelo, string> = {
  UTILITY: 'Utilidade', MARKETING: 'Marketing', AUTHENTICATION: 'Autenticação',
};

/** Por que a Meta recusou, em português. */
export function motivoDaRecusa(motivo?: string) {
  switch ((motivo || '').toUpperCase()) {
    case '': case 'NONE': return '';
    case 'PROMOTIONAL': return 'A Meta achou o texto promocional demais para a categoria.';
    case 'INCORRECT_CATEGORY': return 'A Meta não concordou com a categoria.';
    case 'INVALID_FORMAT': return 'Formato inválido: variável, botão ou exemplo fora da regra.';
    case 'TAG_CONTENT_MISMATCH': return 'O texto não combina com a categoria escolhida.';
    case 'ABUSIVE_CONTENT': return 'A Meta viu conteúdo que fere as regras dela.';
    case 'SCAM': return 'A Meta achou o texto parecido com golpe.';
    default: return `Motivo da Meta: ${motivo}.`;
  }
}

/** Um modelo como a Meta devolve na lista (GET /{waba}/message_templates). */
export interface ModeloNaMeta {
  id: string;
  name: string;
  language: string;
  status: string;
  category?: string;
  rejected_reason?: string;
  components?: { type: string; text?: string; buttons?: { type: string; text?: string; url?: string }[] }[];
}

export function situacaoDaMeta(m: ModeloNaMeta, agora: string, antes?: Partial<SituacaoDoModelo>): SituacaoDoModelo {
  const corpo = m.components?.find((c) => c.type === 'BODY')?.text || '';
  const botoes = m.components?.find((c) => c.type === 'BUTTONS')?.buttons || [];
  const estado = estadoDaMeta(m.status);
  return {
    id: idDoModelo(m.name, m.language),
    nome: m.name,
    idioma: m.language,
    estado,
    categoria: (m.category as CategoriaModelo) || undefined,
    corpo,
    respostas: botoes.filter((b) => b.type === 'QUICK_REPLY').map((b) => b.text || ''),
    temLink: botoes.some((b) => b.type === 'URL' && (b.url || '').includes('{{')),
    daBiblioteca: Boolean(m.language === IDIOMA && modeloDaBiblioteca(m.name)),
    metaId: m.id,
    motivo: estado === 'recusado' || estado === 'pausado' ? motivoDaRecusa(m.rejected_reason) : '',
    ...(antes?.pedidoEm ? { pedidoEm: antes.pedidoEm } : {}),
    atualizadoEm: agora,
  };
}

/** Como fica a biblioteca antes de a Meta responder. */
export function situacaoDaBiblioteca(m: ModeloDaEscola, estado: EstadoModelo, agora: string): SituacaoDoModelo {
  return {
    id: idDoModelo(m.nome),
    nome: m.nome,
    idioma: IDIOMA,
    estado,
    categoria: m.categoria,
    corpo: m.corpo,
    respostas: m.respostas || [],
    temLink: Boolean(m.link),
    daBiblioteca: true,
    atualizadoEm: agora,
  };
}

/* ================= a conferência com a Meta ================= */

/** Pedido que não deu certo volta a ser tentado no dia seguinte, não a cada hora. */
export const NOVA_TENTATIVA_MS = 24 * 60 * 60_000;

export type Passo =
  | { tipo: 'criar'; modelo: ModeloDaEscola }
  | { tipo: 'gravar'; situacao: SituacaoDoModelo };

/**
 * O que fazer depois de ler a lista da Meta: gravar a situação de cada modelo e
 * mandar para aprovação o que a biblioteca tem e a Meta não.
 * Modelo que o sistema já pediu e sumiu da Meta foi apagado lá por alguém: não volta
 * sozinho (a Meta nem deixa repetir o nome por um mês). `forcar` manda de novo.
 */
export function planoDaConferencia(o: {
  naMeta: ModeloNaMeta[];
  salvos: Partial<SituacaoDoModelo>[];
  agora: string;
  criar: boolean;
  forcar?: string[];
}): Passo[] {
  const passos: Passo[] = [];
  const salvo = new Map(o.salvos.filter((s) => s.id).map((s) => [s.id as string, s]));
  const vistos = new Set<string>();

  for (const m of o.naMeta) {
    const id = idDoModelo(m.name, m.language);
    vistos.add(id);
    passos.push({ tipo: 'gravar', situacao: situacaoDaMeta(m, o.agora, salvo.get(id)) });
  }

  const agora = new Date(o.agora).getTime();
  for (const m of BIBLIOTECA) {
    const id = idDoModelo(m.nome);
    if (vistos.has(id)) continue;
    vistos.add(id);
    const s = salvo.get(id);
    const forcado = o.forcar?.includes(m.nome) || false;
    const jaEsteveNaMeta = Boolean(s?.metaId);
    const falhaRecente = Boolean(s?.falhaEm && agora - new Date(s.falhaEm).getTime() < NOVA_TENTATIVA_MS);
    if (o.criar && problemasDoModelo(m).length === 0 && (forcado || (!jaEsteveNaMeta && !falhaRecente))) {
      passos.push({ tipo: 'criar', modelo: m });
      continue;
    }
    passos.push({
      tipo: 'gravar',
      situacao: {
        ...situacaoDaBiblioteca(m, jaEsteveNaMeta ? 'nao_existe' : 'nao_enviado', o.agora),
        ...(s?.metaId ? { metaId: s.metaId } : {}),
        ...(s?.pedidoEm ? { pedidoEm: s.pedidoEm } : {}),
        ...(s?.falha ? { falha: s.falha, falhaEm: s.falhaEm } : {}),
      },
    });
  }

  /* o que estava salvo e não existe nem na Meta nem na biblioteca: sumiu */
  for (const s of o.salvos) {
    if (!s.id || vistos.has(s.id) || s.estado === 'nao_existe') continue;
    passos.push({ tipo: 'gravar', situacao: { ...(s as SituacaoDoModelo), estado: 'nao_existe', atualizadoEm: o.agora } });
  }
  return passos;
}

/* ================= escolher e preencher na conversa ================= */

export interface ModeloParaEnviar {
  situacao: SituacaoDoModelo;
  titulo: string;
  grupo: GrupoModelo | 'Outros';
  quando: string;
  campos: CampoDoModelo[];
}

/** O que a conversa pode mandar agora: aprovado, para o contato e sem link a preencher. */
export function modelosParaEnviar(salvos: SituacaoDoModelo[]): ModeloParaEnviar[] {
  const ordem = (g: string) => { const i = GRUPOS.indexOf(g as GrupoModelo); return i < 0 ? GRUPOS.length : i; };
  return salvos
    .filter((s) => s.estado === 'aprovado' && !s.temLink && s.corpo && s.idioma.startsWith('pt'))
    .map((s) => {
      const b = s.daBiblioteca ? modeloDaBiblioteca(s.nome) : undefined;
      if (b?.interno) return null;
      const n = quantasVariaveis(s.corpo);
      return {
        situacao: s,
        titulo: b?.titulo || s.nome.replace(/_/g, ' '),
        grupo: b?.grupo || 'Outros',
        quando: b?.quando || '',
        campos: b && b.campos.length === n
          ? b.campos
          : Array.from({ length: n }, (_, i) => ({ rotulo: `campo ${i + 1}`, exemplo: '' })),
      } satisfies ModeloParaEnviar;
    })
    .filter((m): m is ModeloParaEnviar => m !== null)
    .sort((a, b) => ordem(a.grupo) - ordem(b.grupo) || a.titulo.localeCompare(b.titulo, 'pt-BR'));
}

const primeiro = (nome: string) => (nome || '').trim().split(/\s+/)[0] || '';

/** Os campos já preenchidos com o que o sistema sabe: o primeiro nome do contato. */
export function valoresIniciais(campos: CampoDoModelo[], nomeDoContato: string) {
  /* nome que é só número de telefone não serve para "Oi, 5549...!" */
  const nome = /\p{L}/u.test(nomeDoContato) ? primeiro(nomeDoContato) : '';
  return campos.map((c) => (c.nome ? nome : ''));
}

/** A Meta recusa variável com quebra de linha, tab ou quatro espaços seguidos. */
export const limpaValor = (v: string) => v.replace(/\s+/g, ' ').trim().slice(0, 200);

/** O texto como o contato vai ler. Campo vazio aparece como [rótulo] na prévia. */
export function preenche(corpo: string, valores: string[], campos?: CampoDoModelo[]) {
  return corpo.replace(VARIAVEL, (_, n: string) => {
    const i = Number(n) - 1;
    const v = limpaValor(valores[i] || '');
    return v || `[${campos?.[i]?.rotulo || `campo ${n}`}]`;
  });
}

/** O que falta preencher antes de enviar. */
export const faltando = (campos: CampoDoModelo[], valores: string[]) =>
  campos.filter((_, i) => !limpaValor(valores[i] || '')).map((c) => c.rotulo);
