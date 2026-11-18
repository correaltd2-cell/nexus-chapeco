/* O atendimento automatico: o que a escola configura e as regras que decidem o que
   acontece com cada mensagem. Tudo aqui é puro (sem banco, sem rede, sem IA), para
   dar para provar em testes/automatico.ts. Quem fala com a Meta e com o Claude é
   src/lib/whatsapp/automatico.ts, no servidor.

   O que foi decidido com a escola (18/11/2026):
   - toda conversa nova recebe a saudação com 3 botões; a Coordenação nunca é botão,
     só chega por transferência de dentro do sistema
   - financeiro e contrato vão para o assistente (botões ou IA); o resto, para a Recepção
   - o relógio do follow-up so corre quando a ultima fala que espera resposta é da
     escola; se quem espera é o aluno, nada se encerra e o time ve o tempo de aguardo
   - follow-up, despedida e saudação sao escritos pela IA lendo a conversa, no jeito
     de falar da escola; sem IA, sai o texto de reserva
   - tudo nasce desligado */
import type { Setor } from './tipos';
import type { Assunto } from './triagem';

export type Destino = 'recepcao' | 'assistente';
export interface BotaoMenu { texto: string; destino: Destino }
export interface PerguntaResposta { t: string; r: string }

export interface ConfigAutomatico {
  /** A chave mestra. Desligado, o sistema funciona como antes: nada responde sozinho. */
  ligado: boolean;
  botoes: BotaoMenu[];
  /** Pula o menu quando a primeira mensagem ja diz o assunto com sinal forte. */
  pulaMenu: boolean;
  saudInstrucao: string;
  saudReserva: string;
  /** Quando o contato digita e nao da para entender: o menu volta uma vez com este texto. */
  menuDeNovo: string;
  /** Aviso curto quando a conversa vai para gente (sem IA). */
  encaminhaReserva: string;
  tom: string;
  exemplos: string;
  nunca: string;
  fu1Min: number;
  fu1Instrucao: string;
  fu1Reserva: string;
  encMin: number;
  encInstrucao: string;
  encReserva: string;
  /** Conversa ja resolvida ("valeu, obrigada!"): despedida curta, ou encerra calado. */
  resolvida: 'despedida' | 'nada';
  despedidaReserva: string;
  /** Ao encerrar na mao, manda uma despedida antes. */
  manualDespedida: boolean;
  /** Setor que nao respondeu devolve a conversa para a Recepção depois disto. */
  voltaHoras: number;
  modo: 'botoes' | 'ia';
  passaPara: 'financeiro' | 'recepcao';
  prompt: string;
  passaQuando: string;
  faq: PerguntaResposta[];
  avisoLigado: boolean;
  avisoModelo: string;
  avisoIdioma: string;
}

/** Limites da Meta: 3 botoes de ate 20 letras; lista com linhas de ate 24 letras, ate 10 linhas. */
export const LIMITE = { botoes: 3, botao: 20, linha: 24, perguntas: 9 } as const;

export const AUTOMATICO_PADRAO: ConfigAutomatico = {
  ligado: false,
  botoes: [
    { texto: 'Minhas aulas', destino: 'recepcao' },
    { texto: 'Financeiro/contrato', destino: 'assistente' },
    { texto: 'Outro assunto', destino: 'recepcao' },
  ],
  pulaMenu: true,
  saudInstrucao: 'Cumprimenta pelo primeiro nome quando a pessoa já é aluna, e lembra do que ela falou da última vez quando fizer sentido. Contato novo: se apresenta como a Nexus Chapecó, sem fingir que já conhece. Uma ou duas frases, e pergunta sobre o que a pessoa quer falar.',
  saudReserva: 'Oi, {primeiro_nome}! Aqui é a Nexus Chapecó 🧡 Sobre o que tu quer falar?',
  menuDeNovo: 'Só pra eu te mandar pra pessoa certa: toca numa das opções aqui embaixo 👇',
  encaminhaReserva: 'Oi, {primeiro_nome}! Já te passo pra recepção, logo alguém te responde por aqui 😊',
  tom: 'A gente é parceiro do aluno, não central de atendimento. Chama pelo primeiro nome, usa "tu", frase curta, do jeito que se fala aqui em Chapecó. Emoji com moderação, no máximo um por mensagem. Nada de "prezado", "informamos" ou "estamos à disposição".',
  exemplos: '"Oi, Larissa! Tem sim, tenho reposição na sexta, 20/11, às 18h. Fica bom?"\n"Combinado! Te chamo na terça pra confirmar."\n"Bah, que bom que deu certo! Qualquer coisa é só chamar 😊"',
  nunca: 'Prometer horário, valor ou desconto que não esteja na conversa. Falar de matrícula nova ou tentar vender. Pedir desculpa demais. Usar "prezado(a)".',
  fu1Min: 15,
  fu1Instrucao: 'Retoma exatamente o que ficou pendente na conversa, pelo nome. Se ficou uma pergunta nossa sem resposta, refaz de um jeito leve, sem cobrar. Uma mensagem, até duas frases.',
  fu1Reserva: 'Oi, {primeiro_nome}! Conseguiu ver o que a gente conversou? Se precisar, é só me chamar por aqui.',
  encMin: 30,
  encInstrucao: 'Avisa com carinho que vai fechar o atendimento por falta de resposta, lembra o que ficou pendente e deixa a porta aberta. Uma mensagem, até duas frases.',
  encReserva: '{primeiro_nome}, vou encerrar o atendimento por aqui. Quando quiser retomar, é só mandar uma mensagem 😊',
  resolvida: 'despedida',
  despedidaReserva: 'Imagina, {primeiro_nome}! Qualquer coisa é só chamar 😊',
  manualDespedida: true,
  voltaHoras: 2,
  modo: 'ia',
  passaPara: 'financeiro',
  prompt: 'Tu é o assistente do financeiro e dos contratos da Nexus Chapecó. Responde só com o que está nas perguntas e respostas. Se a resposta não estiver lá, não inventa: avisa que vai chamar alguém do time e passa a conversa.',
  passaQuando: 'Quando o aluno pedir para falar com uma pessoa, quando a resposta não estiver nas perguntas e respostas, quando precisar do valor ou do boleto de um aluno específico, e em todo pedido de cancelamento.',
  /* pergunta sem resposta escrita faz o assistente passar para gente: a escola
     escreve as regras de verdade, o sistema nao inventa */
  faq: [
    { t: 'Trancar o curso', r: '' },
    { t: '2ª via do boleto', r: 'A 2ª via quem manda é o pessoal do financeiro. Me confirma que é a parcela deste mês que eu já chamo alguém pra te mandar.' },
    { t: 'Multa por atraso', r: '' },
    { t: 'Renovação do contrato', r: 'Quando o teu curso está chegando no fim, a gente te chama pra conversar sobre o próximo nível. Quem fecha a renovação é uma pessoa do nosso time.' },
    { t: 'Cancelar o contrato', r: 'Cancelamento a gente sempre conversa com uma pessoa, porque depende do teu contrato. Já vou passar tua conversa pro nosso time.' },
  ],
  avisoLigado: false,
  avisoModelo: 'aviso_demanda_coordenacao',
  avisoIdioma: 'pt_BR',
};

/* ---------------- leitura segura da configuração ---------------- */

const texto = (v: unknown, padrao: string, max = 4000) =>
  (typeof v === 'string' && v.trim() ? v.trim() : padrao).slice(0, max);
const inteiro = (v: unknown, padrao: number, min: number, max: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : padrao;
};

/** Le o documento config/automatico sem quebrar quando ele nao existe ou veio torto. */
export function leAutomatico(bruto?: Partial<ConfigAutomatico> | null): ConfigAutomatico {
  const b = bruto || {};
  const P = AUTOMATICO_PADRAO;
  const botoes = Array.from({ length: LIMITE.botoes }, (_, i) => {
    const x = Array.isArray(b.botoes) ? b.botoes[i] : undefined;
    return {
      texto: texto(x?.texto, P.botoes[i].texto, LIMITE.botao),
      destino: (x?.destino === 'assistente' ? 'assistente' : x?.destino === 'recepcao' ? 'recepcao' : P.botoes[i].destino) as Destino,
    };
  });
  const faq = (Array.isArray(b.faq) ? b.faq : P.faq)
    .filter((q) => q && typeof q.t === 'string' && q.t.trim())
    .slice(0, LIMITE.perguntas)
    .map((q) => ({ t: q.t.trim().slice(0, LIMITE.linha), r: typeof q.r === 'string' ? q.r.trim().slice(0, 1000) : '' }));
  const fu1Min = inteiro(b.fu1Min, P.fu1Min, 1, 24 * 60);
  return {
    ligado: b.ligado === true,
    botoes,
    pulaMenu: b.pulaMenu !== false,
    saudInstrucao: texto(b.saudInstrucao, P.saudInstrucao),
    saudReserva: texto(b.saudReserva, P.saudReserva, 1000),
    menuDeNovo: texto(b.menuDeNovo, P.menuDeNovo, 1000),
    encaminhaReserva: texto(b.encaminhaReserva, P.encaminhaReserva, 1000),
    tom: texto(b.tom, P.tom),
    exemplos: texto(b.exemplos, P.exemplos),
    nunca: texto(b.nunca, P.nunca),
    fu1Min,
    fu1Instrucao: texto(b.fu1Instrucao, P.fu1Instrucao),
    fu1Reserva: texto(b.fu1Reserva, P.fu1Reserva, 1000),
    /* o encerramento vem sempre depois do 1º follow-up */
    encMin: Math.max(fu1Min + 1, inteiro(b.encMin, P.encMin, 2, 24 * 60)),
    encInstrucao: texto(b.encInstrucao, P.encInstrucao),
    encReserva: texto(b.encReserva, P.encReserva, 1000),
    resolvida: b.resolvida === 'nada' ? 'nada' : 'despedida',
    despedidaReserva: texto(b.despedidaReserva, P.despedidaReserva, 1000),
    manualDespedida: b.manualDespedida !== false,
    voltaHoras: inteiro(b.voltaHoras, P.voltaHoras, 1, 72),
    modo: b.modo === 'botoes' ? 'botoes' : 'ia',
    passaPara: b.passaPara === 'recepcao' ? 'recepcao' : 'financeiro',
    prompt: texto(b.prompt, P.prompt),
    passaQuando: texto(b.passaQuando, P.passaQuando),
    faq,
    avisoLigado: b.avisoLigado === true,
    avisoModelo: texto(b.avisoModelo, P.avisoModelo, 120).toLowerCase().replace(/[^a-z0-9_]/g, '_'),
    avisoIdioma: texto(b.avisoIdioma, P.avisoIdioma, 12),
  };
}

/* ---------------- roteamento ---------------- */

export const idDoBotao = (i: number) => `menu-${i}`;
export const idDaPergunta = (i: number) => `faq-${i}`;
export const ID_PESSOA = 'pessoa';
export const ID_AJUDOU = 'ajudou';
export const BOTOES_AJUDOU = ['Ajudou, valeu!', 'Falar com uma pessoa'];

const normal = (t: string) =>
  t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

/** Qual botão do menu o contato tocou: pelo id que mandamos, ou pelo texto, se veio sem id. */
export function escolhaDoMenu(cfg: ConfigAutomatico, r: { id?: string; titulo?: string }): Destino | null {
  const pelaId = /^menu-(\d)$/.exec(r.id || '');
  if (pelaId) return cfg.botoes[Number(pelaId[1])]?.destino ?? null;
  const t = normal(r.titulo || '');
  if (!t) return null;
  const achado = cfg.botoes.find((b) => normal(b.texto) === t);
  return achado ? achado.destino : null;
}

/** Para onde vai uma mensagem que já diz o assunto. A Coordenação nunca: ela so recebe
    por transferência. Financeiro vai para o assistente se algum botão leva para ele. */
export function destinoDoAssunto(assunto: Assunto | null, cfg: ConfigAutomatico): Destino | null {
  if (!assunto) return null;
  if (assunto === 'financeiro' && cfg.botoes.some((b) => b.destino === 'assistente')) return 'assistente';
  return 'recepcao';
}

/** O contato digitou e não deu para entender: a primeira vez o menu volta, a segunda vai para gente. */
export const depoisDoMenuConfuso = (tentativas: number): 'repete' | 'recepcao' =>
  tentativas < 1 ? 'repete' : 'recepcao';

/** O setor de gente que o assistente chama quando não resolve. */
export const setorDoPassa = (cfg: ConfigAutomatico): Setor => (cfg.passaPara === 'recepcao' ? 'recepcao' : 'financeiro');

/** "Valeu!", "obrigada 🙏": parece o contato encerrando. Quem decide de verdade é a IA,
    lendo a conversa inteira na hora do relógio; isto só liga o relógio. Pedido de
    retorno ("obrigada, fico no aguardo") nao conta: ai quem espera é ele. */
export function pareceDespedida(bruto: string): boolean {
  const t = normal(bruto);
  if (!t || t.length > 80) return false;
  if (/aguardo|espero|me avis|me retorn|me chama|\?/.test(t)) return false;
  return /obrigad|brigad|valeu|vlw|agradec|perfeito|combinado|fechado|show|beleza|blz|tmj|👍|🙏|🙌|❤|😊|🥰/.test(t + bruto);
}

/* ---------------- o relógio ---------------- */

export interface EstadoDoRelogio {
  estado: string;
  relogioDesde?: string | null;
  relogioMotivo?: string | null;
  followUpEm?: string | null;
}

export type AcaoDoRelogio = 'nada' | 'followup' | 'encerra' | 'avalia_despedida';

/** O que o cron faz com a conversa agora. Os minutos contam da última fala da escola
    que espera resposta: o 1º follow-up não zera o relógio. */
export function acaoDoRelogio(c: EstadoDoRelogio, cfg: ConfigAutomatico, agora: Date): AcaoDoRelogio {
  if (c.estado === 'encerrada' || !c.relogioDesde) return 'nada';
  const min = (agora.getTime() - new Date(c.relogioDesde).getTime()) / 60_000;
  if (!Number.isFinite(min) || min < cfg.fu1Min) return 'nada';
  if (c.relogioMotivo === 'despedida') return 'avalia_despedida';
  if (min >= cfg.encMin) return 'encerra';
  return c.followUpEm ? 'nada' : 'followup';
}

/** Setor que recebeu a conversa e ainda não respondeu: volta para a Recepção. */
export function deveVoltarParaRecepcao(
  c: { estado: string; setor: Setor; aguardandoSetorDesde?: string | null },
  cfg: ConfigAutomatico, agora: Date,
): boolean {
  if (c.estado === 'encerrada' || c.setor === 'recepcao' || !c.aguardandoSetorDesde) return false;
  const h = (agora.getTime() - new Date(c.aguardandoSetorDesde).getTime()) / 3_600_000;
  return Number.isFinite(h) && h >= cfg.voltaHoras;
}

/* ---------------- os textos da IA ---------------- */

export type Momento = 'saudacao' | 'encaminha' | 'followup' | 'encerramento' | 'despedida';

export interface Linha { de: 'aluno' | 'escola'; quem?: string; texto: string }

export interface ContextoDaConversa {
  nome: string;
  ehAluno: boolean;
  observacao?: string;
  linhas: Linha[];
}

export const primeiro = (nome: string) => (nome || '').trim().split(/\s+/)[0] || '';

/** Texto de reserva com o nome do contato: é o que sai quando a IA não responde. */
export const comNome = (modelo: string, nome: string) =>
  modelo.split('{primeiro_nome}').join(primeiro(nome) || 'tudo bem').replace(/\s+([!?.,])/g, '$1');

export function reservaDo(momento: Momento, cfg: ConfigAutomatico, nome: string) {
  const t = {
    saudacao: cfg.saudReserva, encaminha: cfg.encaminhaReserva, followup: cfg.fu1Reserva,
    encerramento: cfg.encReserva, despedida: cfg.despedidaReserva,
  }[momento];
  return comNome(t, nome);
}

const REGRAS_FIXAS = [
  'REGRAS QUE NÃO MUDAM:',
  '- Use só o que está na conversa e o que a escola escreveu aqui. Não invente horário, valor, data, desconto, regra nem promessa.',
  '- Não venda, não ofereça matrícula nova e não feche matrícula.',
  '- Uma mensagem só, curta, como alguém da recepção digitando no WhatsApp. Sem travessão.',
].join('\n');

function blocoDoTom(cfg: ConfigAutomatico) {
  return `JEITO DE FALAR DA ESCOLA:\n${cfg.tom}\n\nMENSAGENS DE VERDADE DA ESCOLA, PARA PEGAR O JEITO:\n${cfg.exemplos}\n\nNUNCA:\n${cfg.nunca}`;
}

export function transcricao(linhas: Linha[]) {
  return linhas.length
    ? linhas.map((l) => `[${l.de === 'aluno' ? 'contato' : `escola, ${l.quem || 'equipe'}`}] ${l.texto}`).join('\n')
    : '(sem mensagens ainda)';
}

function quemE(ctx: ContextoDaConversa) {
  const quem = ctx.ehAluno ? 'já é aluno(a) cadastrado(a) da escola' : 'ainda não é aluno cadastrado; o nome veio do perfil do WhatsApp';
  return `CONTATO: ${ctx.nome || 'sem nome'} (primeiro nome: ${primeiro(ctx.nome) || 'desconhecido'}), ${quem}.${ctx.observacao ? `\nO QUE O TIME ANOTOU SOBRE ELE: ${ctx.observacao}` : ''}`;
}

/** O pedido para a IA escrever uma mensagem do atendimento. A resposta vem em JSON
    {situacao, pendencia, mensagem}, com o formato garantido pelo servidor. */
export function promptMensagem(cfg: ConfigAutomatico, momento: Momento, ctx: ContextoDaConversa): string {
  const cab = `Tu escreve mensagens de WhatsApp em nome da Nexus English Center, unidade Chapecó, uma escola de inglês próxima do aluno.\n\n${blocoDoTom(cfg)}\n\n${REGRAS_FIXAS}\n\n${quemE(ctx)}\n\nCONVERSA DESTE ATENDIMENTO, DA MAIS ANTIGA PARA A MAIS NOVA:\n${transcricao(ctx.linhas)}\n`;
  const botoes = cfg.botoes.map((b) => `"${b.texto}"`).join(', ');

  if (momento === 'saudacao') {
    return `${cab}\nMOMENTO: o contato acabou de escrever e começa um atendimento novo. Escreva a saudação que vai junto com os botões ${botoes}. Não repita os botões no texto.\nO QUE A SAUDAÇÃO PRECISA FAZER: ${cfg.saudInstrucao}\n\nResponda com situacao "pendente", pendencia vazia e a saudação em mensagem.`;
  }
  if (momento === 'encaminha') {
    return `${cab}\nMOMENTO: a conversa está indo agora para uma pessoa do time, que vai responder por aqui. Escreva um aviso curto para o contato saber que foi ouvido e que alguém já vai responder. Não responda a pergunta dele e não diga quanto tempo vai levar.\n\nResponda com situacao "pendente", pendencia vazia e o aviso em mensagem.`;
  }

  const leitura = `\nAntes de escrever, leia de quem é a vez:\n- "pendente": a última fala que espera resposta é da escola, e ficou algo esperando o contato.\n- "resolvida": o contato já agradeceu, confirmou ou se despediu, e não falta nada.\n- "aluno_esperando": o contato está esperando uma resposta ou uma ação da escola.\nSe for "aluno_esperando", deixe a mensagem vazia: não se manda nada para quem está esperando a gente.\nSe for "resolvida", ${cfg.resolvida === 'despedida' ? 'escreva só uma despedida curta, sem perguntar nada.' : 'deixe a mensagem vazia.'}\nEm pendencia, escreva numa frase curta o que ficou pendente.`;

  if (momento === 'followup') {
    return `${cab}\nMOMENTO: 1º follow-up. Passaram ${cfg.fu1Min} minutos sem resposta do contato.\nO QUE ESTA MENSAGEM PRECISA FAZER: ${cfg.fu1Instrucao}\n${leitura}`;
  }
  if (momento === 'encerramento') {
    return `${cab}\nMOMENTO: encerramento. Passaram ${cfg.encMin} minutos sem resposta do contato, e depois desta mensagem o atendimento fecha.\nO QUE ESTA MENSAGEM PRECISA FAZER: ${cfg.encInstrucao}\n${leitura}`;
  }
  return `${cab}\nMOMENTO: o contato mandou o que parece uma despedida e o atendimento vai fechar.\n${leitura}`;
}

/** As instruções do assistente do financeiro e contrato. A conversa vai em seguida,
    como turnos; a resposta vem em JSON {acao, mensagem, resumo}. */
export function regrasDoAssistente(cfg: ConfigAutomatico, ctx: ContextoDaConversa): string {
  const faq = cfg.faq.length
    ? cfg.faq.map((q) => `- ${q.t}: ${q.r || '(sem resposta escrita)'}`).join('\n')
    : '(nenhuma pergunta escrita ainda)';
  const quem = cfg.passaPara === 'recepcao' ? 'a Recepção' : 'uma pessoa do Financeiro';
  return `Tu é o assistente do financeiro e dos contratos da Nexus English Center, unidade Chapecó, conversando pelo WhatsApp.\n\nCOMPORTAMENTO, ESCRITO PELA ESCOLA:\n${cfg.prompt}\n\n${blocoDoTom(cfg)}\n\nPERGUNTAS E RESPOSTAS DA ESCOLA (a única fonte do que tu pode afirmar):\n${faq}\n\nQUANDO PASSAR PARA UMA PESSOA:\n${cfg.passaQuando}\nQuem assume é ${quem}.\n\n${REGRAS_FIXAS}\n\n${quemE(ctx)}\n\nEm acao, "responder" quando a resposta está nas perguntas e respostas, e "passar" quando precisa de gente. Em mensagem, o que o contato vai ler. Em resumo, só quando for passar: uma ou duas frases para a pessoa que vai assumir.\n\nA conversa começa agora.`;
}

/** Os turnos para a IA: começa e termina no contato, como a API pede. */
export function turnosDoAssistente(cfg: ConfigAutomatico, ctx: ContextoDaConversa) {
  const turnos: { role: 'user' | 'assistant'; content: string }[] = [{ role: 'user', content: regrasDoAssistente(cfg, ctx) }];
  for (const l of ctx.linhas.slice(-16)) {
    if (!l.texto.trim()) continue;
    turnos.push({ role: l.de === 'aluno' ? 'user' : 'assistant', content: l.texto });
  }
  while (turnos.length > 1 && turnos[turnos.length - 1].role !== 'user') turnos.pop();
  return turnos;
}
