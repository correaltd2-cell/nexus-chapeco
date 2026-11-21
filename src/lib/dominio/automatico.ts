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
   - tudo nasce desligado
   E o que foi pedido em 21/11/2026: horário de atendimento (segunda a sexta, 8h às 12h e
   13h30 às 21h30; sábado, 9h às 12h). Fora dele os botões funcionam igual, e a IA avisa
   que a equipe está fora, diz quando volta e pede para a pessoa já explicar o que precisa. */
import type { Setor } from './tipos';
import type { Assunto } from './triagem';
import {
  HORARIO_PADRAO, estaAberto, horarioEmTexto, leFaixas, minutosUteis, proximaAbertura, ultimoFechamento,
  type Faixa,
} from './horario.ts';

/* aulas: a próxima aula do aluno, lida da agenda, com Confirmar e Remarcar */
export type Destino = 'recepcao' | 'assistente' | 'aulas';
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
  /** Follow-up de quem recebeu o menu e não tocou em nada: os botões vão de novo. */
  fuMenuReserva: string;
  /** Assunto resolvido: "posso te ajudar em mais alguma coisa?", com os botões Não e Sim. */
  maisReserva: string;
  /** Depois do "Não, era só isso" (ou sem resposta a ele): encerra na hora com isto. */
  fimReserva: string;
  /** Encerrar na mão: a mensagem que sai, dizendo do que se tratou. */
  fechaInstrucao: string;
  fechaReserva: string;
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
  /** Horário de atendimento da equipe. Fora dele, a IA avisa que a equipe está fora e quando volta. */
  horarioLigado: boolean;
  faixas: Faixa[];
  foraInstrucao: string;
  foraSaudReserva: string;
  foraEncaminhaReserva: string;
  /** Conversa que já está com a equipe e o contato escreve fora do horário: um aviso por fechamento. */
  foraAvisoReserva: string;
  /** Conversa parada há tanto tempo, sem o contato esperando resposta, recomeça pelo menu. 0 desliga. */
  recomecaHoras: number;
}

/** Limites da Meta: 3 botoes de ate 20 letras; lista com linhas de ate 24 letras, ate 10 linhas. */
export const LIMITE = { botoes: 3, botao: 20, linha: 24, perguntas: 9 } as const;

export const AUTOMATICO_PADRAO: ConfigAutomatico = {
  ligado: false,
  botoes: [
    { texto: 'Minhas aulas', destino: 'aulas' },
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
  fu1Instrucao: 'Retoma exatamente o que ficou pendente na conversa, pelo nome e citando o assunto em poucas palavras. Se ficou uma pergunta nossa sem resposta, refaz de um jeito leve, sem cobrar. Educado e rápido: uma mensagem, até duas frases curtas.',
  fu1Reserva: 'Oi, {primeiro_nome}! Conseguiu ver a mensagem{sobre}? Fico no aguardo por aqui 😊',
  fuMenuReserva: '{primeiro_nome}, ainda está por aí? É só tocar numa das opções aqui embaixo 👇',
  encMin: 30,
  encInstrucao: 'Avisa com educação que vai encerrar o atendimento por falta de resposta, dizendo em poucas palavras do que se tratava, e que é só mandar mensagem para retomar. Rápido: uma ou duas frases curtas.',
  encReserva: '{primeiro_nome}, como não tive retorno, vou encerrar por aqui o atendimento{sobre}. Quando quiser retomar, é só mandar uma mensagem 😊',
  maisReserva: 'Que bom que deu certo, {primeiro_nome}! Posso te ajudar em mais alguma coisa?',
  fimReserva: 'Combinado, {primeiro_nome}! Vou encerrar o atendimento{sobre} por aqui. Quando precisar, é só chamar 😊',
  fechaInstrucao: 'Avisa que está encerrando este atendimento, dizendo em poucas palavras do que se tratou (por exemplo: "sobre os teus boletos"), e que é só mandar mensagem se precisar de mais alguma coisa. Educado e curto: uma ou duas frases.',
  fechaReserva: '{primeiro_nome}, vou encerrar por aqui o atendimento{sobre}. Se precisar de mais alguma coisa, é só mandar uma mensagem 😊',
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
  horarioLigado: true,
  faixas: HORARIO_PADRAO,
  foraInstrucao: 'Avisa com leveza que agora a equipe está fora do horário de atendimento e diz quando ela volta, com o dia e a hora escritos aqui. Pede para a pessoa já explicar por escrito o que precisa, para agilizar, porque assim que a equipe voltar ela retoma o contato. Não promete resolver agora e não dá outro prazo.',
  foraSaudReserva: 'Oi, {primeiro_nome}! Aqui é a Nexus Chapecó 🧡 Agora a equipe está fora do horário, mas já escolhe uma opção aqui embaixo e me conta o que precisa: {volta} a gente retoma contigo.',
  foraEncaminhaReserva: 'Anotado, {primeiro_nome}! Já me conta aqui o que precisa, que {volta} a equipe te responde 😊',
  foraAvisoReserva: 'Recebi, {primeiro_nome}! A equipe está fora do horário agora e {volta} te responde por aqui 😊',
  recomecaHoras: 12,
};

/* ---------------- leitura segura da configuração ---------------- */

const texto = (v: unknown, padrao: string, max = 4000) =>
  (typeof v === 'string' && v.trim() ? v.trim() : padrao).slice(0, max);

/* Ligar a chave grava a configuração inteira, com os textos padrão daquele dia. Texto
   que ainda é exatamente um padrão antigo (ninguém editou) segue o padrão novo; texto
   que a escola escreveu fica como está. */
const PADROES_ANTIGOS: Partial<Record<keyof ConfigAutomatico, string[]>> = {
  fu1Instrucao: ['Retoma exatamente o que ficou pendente na conversa, pelo nome. Se ficou uma pergunta nossa sem resposta, refaz de um jeito leve, sem cobrar. Uma mensagem, até duas frases.'],
  fu1Reserva: ['Oi, {primeiro_nome}! Conseguiu ver o que a gente conversou? Se precisar, é só me chamar por aqui.'],
  encInstrucao: ['Avisa com carinho que vai fechar o atendimento por falta de resposta, lembra o que ficou pendente e deixa a porta aberta. Uma mensagem, até duas frases.'],
  encReserva: ['{primeiro_nome}, vou encerrar o atendimento por aqui. Quando quiser retomar, é só mandar uma mensagem 😊'],
};
const atual = (k: keyof ConfigAutomatico, v: unknown, max = 4000) => {
  const padrao = AUTOMATICO_PADRAO[k] as string;
  return typeof v === 'string' && PADROES_ANTIGOS[k]?.includes(v.trim()) ? padrao : texto(v, padrao, max);
};
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
      destino: (x?.destino === 'assistente' || x?.destino === 'recepcao' || x?.destino === 'aulas' ? x.destino : P.botoes[i].destino) as Destino,
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
    fu1Instrucao: atual('fu1Instrucao', b.fu1Instrucao),
    fu1Reserva: atual('fu1Reserva', b.fu1Reserva, 1000),
    fuMenuReserva: texto(b.fuMenuReserva, P.fuMenuReserva, 1000),
    /* o encerramento vem sempre depois do 1º follow-up */
    encMin: Math.max(fu1Min + 1, inteiro(b.encMin, P.encMin, 2, 24 * 60)),
    encInstrucao: atual('encInstrucao', b.encInstrucao),
    encReserva: atual('encReserva', b.encReserva, 1000),
    maisReserva: texto(b.maisReserva, P.maisReserva, 1000),
    fimReserva: texto(b.fimReserva, P.fimReserva, 1000),
    fechaInstrucao: texto(b.fechaInstrucao, P.fechaInstrucao),
    fechaReserva: texto(b.fechaReserva, P.fechaReserva, 1000),
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
    /* o horário vem ligado: foi pedido do cliente, e documento salvo antes dele não tem o campo */
    horarioLigado: b.horarioLigado !== false,
    faixas: b.faixas === undefined ? P.faixas.map((f) => ({ ...f })) : leFaixas(b.faixas),
    foraInstrucao: texto(b.foraInstrucao, P.foraInstrucao),
    foraSaudReserva: texto(b.foraSaudReserva, P.foraSaudReserva, 1000),
    foraEncaminhaReserva: texto(b.foraEncaminhaReserva, P.foraEncaminhaReserva, 1000),
    foraAvisoReserva: texto(b.foraAvisoReserva, P.foraAvisoReserva, 1000),
    recomecaHoras: inteiro(b.recomecaHoras, P.recomecaHoras, 0, 168),
  };
}

/* ---------------- o horário de atendimento ---------------- */

export interface SituacaoDoHorario {
  aberto: boolean;
  /** quando a equipe volta, como se fala: "hoje às 13h30", "amanhã às 8h", "segunda às 8h" */
  volta: string;
  /** o horário inteiro, para a IA saber */
  texto: string;
}

/** A equipe está no horário agora? Sem horário ligado (ou sem faixa nenhuma), sempre está. */
export function situacaoDoHorario(cfg: ConfigAutomatico, agora: Date): SituacaoDoHorario {
  const texto = horarioEmTexto(cfg.faixas);
  if (!cfg.horarioLigado || !cfg.faixas.length) return { aberto: true, volta: '', texto };
  const aberto = estaAberto(cfg.faixas, agora);
  return { aberto, volta: aberto ? '' : proximaAbertura(cfg.faixas, agora)?.texto || '', texto };
}

/** A conversa já está com a equipe e o contato escreveu fora do horário: avisa uma vez
    por fechamento, e só se ninguém da equipe falou com ele depois que fechou (quem fica
    até mais tarde respondendo não precisa de aviso por cima). */
export function avisaForaDoHorario(
  c: { avisoForaEm?: string | null; ultimaDaEquipeEm?: string | null },
  cfg: ConfigAutomatico, agora: Date,
): boolean {
  if (situacaoDoHorario(cfg, agora).aberto) return false;
  const fechou = ultimoFechamento(cfg.faixas, agora)?.getTime() ?? 0;
  const depois = (iso?: string | null) => Boolean(iso) && Date.parse(iso as string) >= fechou;
  return !depois(c.avisoForaEm) && !depois(c.ultimaDaEquipeEm);
}

/** Conversa que ficou parada (ninguém fechou) e o contato volta a escrever horas depois:
    recomeça pelo menu, como uma conversa nova. Não quando ele está esperando resposta da
    gente (aí quem responde é gente), nem no meio do menu, do assistente ou das aulas. */
export function recomecaAtendimento(
  c: { estado?: string; etapa?: string; ultimaEm?: string },
  cfg: ConfigAutomatico, agora: Date,
): boolean {
  if (!cfg.recomecaHoras || c.estado === 'aguardando' || c.estado === 'encerrada') return false;
  if (c.etapa && c.etapa !== 'gente') return false;
  if (!c.ultimaEm) return false;
  const horas = (agora.getTime() - new Date(c.ultimaEm).getTime()) / 3_600_000;
  return Number.isFinite(horas) && horas >= cfg.recomecaHoras;
}

/* ---------------- roteamento ---------------- */

export const idDoBotao = (i: number) => `menu-${i}`;
export const idDaPergunta = (i: number) => `faq-${i}`;
export const ID_PESSOA = 'pessoa';
/** Botão "Ajudou, valeu!" das respostas antigas do assistente: vale como "era só isso". */
export const ID_AJUDOU = 'ajudou';

/* "Posso te ajudar em mais alguma coisa?": Não encerra na hora, Sim volta ao menu. */
export const ID_MAIS_NAO = 'mais-nao';
export const ID_MAIS_SIM = 'mais-sim';
export const BOTOES_MAIS = { titulos: ['Não, era só isso', 'Sim, outra coisa'], ids: [ID_MAIS_NAO, ID_MAIS_SIM] };
/** Depois da resposta de uma dúvida do financeiro: resolveu, outra dúvida ou gente. */
export const BOTOES_DEPOIS_DA_DUVIDA = { titulos: ['Era só isso, valeu', 'Outra dúvida', 'Falar com uma pessoa'], ids: [ID_MAIS_NAO, ID_MAIS_SIM, 'pessoa'] };

/** O que o contato respondeu ao "algo mais?": pelo botão ou pelo que escreveu. Texto
    que não é claramente não nem sim é um assunto novo. */
export function respostaDoAlgoMais(r: { id?: string; titulo?: string }, texto: string): 'nao' | 'sim' | 'pessoa' | 'outra' {
  if (r.id === ID_MAIS_NAO || r.id === ID_AJUDOU) return 'nao';
  if (r.id === ID_MAIS_SIM) return 'sim';
  if (r.id === 'pessoa') return 'pessoa';
  const t = normal(texto).replace(/[!.,;]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!t || t.length > 40) return 'outra';
  if (/^(nao|n|nada|nop|nao obrigad[oa]|nao precisa|nao era so isso|era so isso|so isso|e so isso|so|tudo certo|tudo ok|ta tudo certo|ta otimo|ok obrigad[oa]|valeu|vlw|obrigad[oa]|brigad[oa]|muito obrigad[oa])( mesmo)?( obrigad[oa]| valeu)?$/.test(t)) return 'nao';
  if (/^(sim|s|tenho|quero|sim outra coisa|outra coisa|outra duvida|tenho outra duvida|sim tenho|sim por favor)$/.test(t)) return 'sim';
  return 'outra';
}

/* ---------------- o assunto, para a mensagem dizer do que se tratou ---------------- */

const SOBRE: [RegExp, string][] = [
  [/2.? ?via|segunda via/, 'sobre a 2ª via'],
  [/boleto/, 'sobre o boleto'],
  [/mensalidade|parcela/, 'sobre a mensalidade'],
  [/\bpix\b|pagamento|pagar|paguei|comprovante/, 'sobre o pagamento'],
  [/cancel/, 'sobre o cancelamento'],
  [/tranc/, 'sobre o trancamento'],
  [/contrato|renova/, 'sobre o contrato'],
  [/reposi|repor/, 'sobre a reposição'],
  [/remarc|marcar|marcacao|horario|agendar/, 'sobre o horário da aula'],
  [/\bprova\b|nota/, 'sobre a prova'],
  [/material|livro|apostila/, 'sobre o material'],
  [/certificado/, 'sobre o certificado'],
  [/\baula\b|\baulas\b/, 'sobre as aulas'],
];

/** " sobre o boleto": o assunto mais recente do contato neste atendimento, para a
    mensagem de reserva dizer do que se tratou. Sem assunto claro, vazio. */
export function sobreOQue(linhas: Linha[]): string {
  for (const l of [...linhas].reverse()) {
    if (l.de !== 'aluno') continue;
    const t = normal(l.texto);
    const achado = SOBRE.find(([r]) => r.test(t));
    if (achado) return ` ${achado[1]}`;
  }
  return '';
}

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
  etapa?: string | null;
  relogioDesde?: string | null;
  relogioMotivo?: string | null;
  followUpEm?: string | null;
}

export type AcaoDoRelogio = 'nada' | 'followup' | 'encerra' | 'avalia_despedida' | 'fecha_resolvido';

/** O contato agradeceu ("valeu!"): espera este tanto, para quem está atendendo poder
    responder antes, e então a IA lê se resolveu e pergunta se precisa de algo mais. */
export const DESPEDIDA_MIN = 2;

/** O menor tempo que o relógio olha: a busca do cron começa daqui. */
export const menorEspera = (cfg: ConfigAutomatico) => Math.min(DESPEDIDA_MIN, cfg.fu1Min);

/** O que o cron faz com a conversa agora. Os minutos contam da última fala da escola
    que espera resposta: o 1º follow-up não zera o relógio. Quem já resolveu e não
    respondeu ao "algo mais?" é encerrado no tempo do 1º follow-up, sem follow-up. */
export function acaoDoRelogio(c: EstadoDoRelogio, cfg: ConfigAutomatico, agora: Date): AcaoDoRelogio {
  if (c.estado === 'encerrada' || !c.relogioDesde) return 'nada';
  const min = (agora.getTime() - new Date(c.relogioDesde).getTime()) / 60_000;
  if (!Number.isFinite(min)) return 'nada';
  if (c.relogioMotivo === 'despedida') return min >= DESPEDIDA_MIN ? 'avalia_despedida' : 'nada';
  if (min < cfg.fu1Min) return 'nada';
  if (c.etapa === 'mais') return 'fecha_resolvido';
  if (min >= cfg.encMin) return 'encerra';
  return c.followUpEm ? 'nada' : 'followup';
}

/** Setor que recebeu a conversa e ainda não respondeu: volta para a Recepção. */
export function deveVoltarParaRecepcao(
  c: { estado: string; setor: Setor; aguardandoSetorDesde?: string | null },
  cfg: ConfigAutomatico, agora: Date,
): boolean {
  if (c.estado === 'encerrada' || c.setor === 'recepcao' || !c.aguardandoSetorDesde) return false;
  const desde = new Date(c.aguardandoSetorDesde);
  /* com horário de atendimento, só conta o tempo em que a equipe estava: passar para o
     Financeiro às 21h não devolve para a Recepção às 23h */
  const h = cfg.horarioLigado && cfg.faixas.length
    ? minutosUteis(cfg.faixas, desde, agora) / 60
    : (agora.getTime() - desde.getTime()) / 3_600_000;
  return Number.isFinite(h) && h >= cfg.voltaHoras;
}

/* ---------------- os textos da IA ---------------- */

export type Momento = 'saudacao' | 'encaminha' | 'followup' | 'encerramento' | 'despedida' | 'fora' | 'mais' | 'fechamento';

export interface Linha { de: 'aluno' | 'escola'; quem?: string; texto: string }

export interface ContextoDaConversa {
  nome: string;
  ehAluno: boolean;
  observacao?: string;
  linhas: Linha[];
  /** o horário de atendimento agora; sem ele, a IA trata como dentro do horário */
  horario?: SituacaoDoHorario;
  /** em que etapa está: no menu, o follow-up vai com os botões de novo */
  etapa?: string;
}

export const primeiro = (nome: string) => (nome || '').trim().split(/\s+/)[0] || '';

/** Texto de reserva preenchido: é o que sai quando a IA não responde. {primeiro_nome}
    é o nome do contato (sem nome, a palavra sai com a vírgula dela), {volta} é quando
    a equipe volta e {sobre} é o assunto (" sobre o boleto", ou nada). */
export function comNome(modelo: string, nome: string, volta = '', sobre = '') {
  const p = primeiro(nome);
  let t = modelo;
  if (!p) {
    t = t.replace(/,\s*\{primeiro_nome\}/g, '').replace(/\{primeiro_nome\},?\s*/g, '');
    t = t.charAt(0).toUpperCase() + t.slice(1);
  }
  return t.split('{primeiro_nome}').join(p)
    .split('{volta}').join(volta || 'no próximo horário de atendimento')
    .split('{sobre}').join(sobre)
    .replace(/\s+([!?.,])/g, '$1');
}

export function reservaDo(momento: Momento, cfg: ConfigAutomatico, nome: string, horario?: SituacaoDoHorario, sobre = '') {
  const fora = horario && !horario.aberto;
  const t = {
    saudacao: fora ? cfg.foraSaudReserva : cfg.saudReserva,
    encaminha: fora ? cfg.foraEncaminhaReserva : cfg.encaminhaReserva,
    followup: cfg.fu1Reserva, encerramento: cfg.encReserva, despedida: cfg.maisReserva,
    fora: cfg.foraAvisoReserva, mais: cfg.maisReserva, fechamento: cfg.fechaReserva,
  }[momento];
  return comNome(t, nome, horario?.volta, sobre);
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

function blocoDoHorario(ctx: ContextoDaConversa) {
  const h = ctx.horario;
  if (!h) return '';
  return `\nHORÁRIO DE ATENDIMENTO DA EQUIPE: ${h.texto}.\nAGORA: ${h.aberto ? 'a equipe está no horário.' : `a equipe está fora do horário e volta ${h.volta || 'no próximo horário de atendimento'}.`}\n`;
}

function quemE(ctx: ContextoDaConversa) {
  const quem = ctx.ehAluno ? 'já é aluno(a) cadastrado(a) da escola' : 'ainda não é aluno cadastrado; o nome veio do perfil do WhatsApp';
  return `CONTATO: ${ctx.nome || 'sem nome'} (primeiro nome: ${primeiro(ctx.nome) || 'desconhecido'}), ${quem}.${ctx.observacao ? `\nO QUE O TIME ANOTOU SOBRE ELE: ${ctx.observacao}` : ''}`;
}

/** O pedido para a IA escrever uma mensagem do atendimento. A resposta vem em JSON
    {situacao, pendencia, mensagem}, com o formato garantido pelo servidor. */
export function promptMensagem(cfg: ConfigAutomatico, momento: Momento, ctx: ContextoDaConversa): string {
  const cab = `Tu escreve mensagens de WhatsApp em nome da Nexus English Center, unidade Chapecó, uma escola de inglês próxima do aluno.\n\n${blocoDoTom(cfg)}\n\n${REGRAS_FIXAS}\n${blocoDoHorario(ctx)}\n${quemE(ctx)}\n\nCONVERSA DESTE ATENDIMENTO, DA MAIS ANTIGA PARA A MAIS NOVA:\n${transcricao(ctx.linhas)}\n`;
  const botoes = cfg.botoes.map((b) => `"${b.texto}"`).join(', ');
  const fora = ctx.horario && !ctx.horario.aberto;
  const volta = ctx.horario?.volta || 'no próximo horário de atendimento';
  const instrucaoFora = `\nFORA DO HORÁRIO, A MENSAGEM TAMBÉM PRECISA: ${cfg.foraInstrucao} A equipe volta ${volta}.`;

  if (momento === 'saudacao') {
    return `${cab}\nMOMENTO: o contato acabou de escrever e começa um atendimento novo. Escreva a saudação que vai junto com os botões ${botoes}. Não repita os botões no texto.\nO QUE A SAUDAÇÃO PRECISA FAZER: ${cfg.saudInstrucao}${fora ? `${instrucaoFora} Os botões continuam valendo: a pessoa escolhe o assunto e já explica.` : ''}\n\nResponda com situacao "pendente", pendencia vazia e a saudação em mensagem.`;
  }
  if (momento === 'encaminha') {
    if (fora) {
      return `${cab}\nMOMENTO: a conversa entrou na fila da equipe, que agora está fora do horário. Escreva um aviso curto.${instrucaoFora}\nNão responda a pergunta dele.\n\nResponda com situacao "pendente", pendencia vazia e o aviso em mensagem.`;
    }
    return `${cab}\nMOMENTO: a conversa está indo agora para uma pessoa do time, que vai responder por aqui. Escreva um aviso curto para o contato saber que foi ouvido e que alguém já vai responder. Não responda a pergunta dele e não diga quanto tempo vai levar.\n\nResponda com situacao "pendente", pendencia vazia e o aviso em mensagem.`;
  }
  if (momento === 'fora') {
    return `${cab}\nMOMENTO: o contato escreveu fora do horário numa conversa que já está com a equipe. Escreva um aviso curto: a mensagem chegou, a equipe está fora do horário e volta ${volta}, e responde por aqui. Se ele ainda não disse o que precisa, peça para já deixar escrito. Não responda a pergunta dele.\n\nResponda com situacao "pendente", pendencia vazia e o aviso em mensagem.`;
  }

  const botoesMais = BOTOES_MAIS.titulos.map((b) => `"${b}"`).join(' e ');
  const fechaAssunto = `escreva uma frase curta fechando o assunto pelo nome dele (por exemplo: "Que bom que deu certo com o boleto, Larissa!") e perguntando se pode ajudar em mais alguma coisa. Vão junto os botões ${botoesMais}; não repita os botões no texto.`;
  const leitura = `\nAntes de escrever, leia de quem é a vez:\n- "pendente": a última fala que espera resposta é da escola, e ficou algo esperando o contato.\n- "resolvida": o contato já agradeceu, confirmou ou se despediu, e não falta nada.\n- "aluno_esperando": o contato está esperando uma resposta ou uma ação da escola.\nSe for "aluno_esperando", deixe a mensagem vazia: não se manda nada para quem está esperando a gente.\nSe for "resolvida", ${fechaAssunto}\nEm pendencia, escreva numa frase curta o que ficou pendente.`;

  if (momento === 'followup') {
    const noMenu = ctx.etapa === 'menu' ? ' A pessoa recebeu os botões do menu e não tocou em nenhum: os mesmos botões vão de novo junto desta mensagem; não repita os botões no texto.' : '';
    return `${cab}\nMOMENTO: 1º follow-up. Passaram ${cfg.fu1Min} minutos sem resposta do contato.${noMenu}\nO QUE ESTA MENSAGEM PRECISA FAZER: ${cfg.fu1Instrucao}\n${leitura}`;
  }
  if (momento === 'encerramento') {
    return `${cab}\nMOMENTO: encerramento. Passaram ${cfg.encMin} minutos sem resposta do contato, e depois desta mensagem o atendimento fecha.\nO QUE ESTA MENSAGEM PRECISA FAZER: ${cfg.encInstrucao}\n${leitura}`;
  }
  if (momento === 'mais') {
    return `${cab}\nMOMENTO: o assunto deste atendimento acabou de se resolver. ${fechaAssunto}\n\nResponda com situacao "resolvida", pendencia vazia e a frase em mensagem.`;
  }
  if (momento === 'fechamento') {
    return `${cab}\nMOMENTO: a pessoa do time que está atendendo vai encerrar este atendimento agora.\nO QUE ESTA MENSAGEM PRECISA FAZER: ${cfg.fechaInstrucao}\nNão pergunte nada: o atendimento fecha logo depois.\n\nResponda com a situacao que a conversa mostra, pendencia vazia e o aviso de encerramento em mensagem.`;
  }
  return `${cab}\nMOMENTO: o contato mandou o que parece um agradecimento ou uma despedida.\n${leitura}`;
}

/** As instruções do assistente do financeiro e contrato. A conversa vai em seguida,
    como turnos; a resposta vem em JSON {acao, mensagem, resumo}. */
export function regrasDoAssistente(cfg: ConfigAutomatico, ctx: ContextoDaConversa): string {
  const faq = cfg.faq.length
    ? cfg.faq.map((q) => `- ${q.t}: ${q.r || '(sem resposta escrita)'}`).join('\n')
    : '(nenhuma pergunta escrita ainda)';
  const quem = cfg.passaPara === 'recepcao' ? 'a Recepção' : 'uma pessoa do Financeiro';
  const fora = ctx.horario && !ctx.horario.aberto
    ? `\nAGORA A EQUIPE ESTÁ FORA DO HORÁRIO e volta ${ctx.horario.volta || 'no próximo horário de atendimento'}. Tu continua respondendo o que está nas perguntas e respostas. Se for passar para uma pessoa, diga que a equipe está fora do horário, quando volta, e peça para o contato já deixar escrito o que precisa.`
    : '';
  return `Tu é o assistente do financeiro e dos contratos da Nexus English Center, unidade Chapecó, conversando pelo WhatsApp.\n\nCOMPORTAMENTO, ESCRITO PELA ESCOLA:\n${cfg.prompt}\n\n${blocoDoTom(cfg)}\n\nPERGUNTAS E RESPOSTAS DA ESCOLA (a única fonte do que tu pode afirmar):\n${faq}\n\nQUANDO PASSAR PARA UMA PESSOA:\n${cfg.passaQuando}\nQuem assume é ${quem}.${fora}\n\n${REGRAS_FIXAS}\n${blocoDoHorario(ctx)}\n${quemE(ctx)}\n\nEm acao, "responder" quando a resposta está nas perguntas e respostas, e "passar" quando precisa de gente. Em mensagem, o que o contato vai ler. Em resumo, só quando for passar: uma ou duas frases para a pessoa que vai assumir.\n\nA conversa começa agora.`;
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
