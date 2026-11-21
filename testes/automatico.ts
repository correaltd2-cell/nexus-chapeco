/* Prova das regras do atendimento automático: para onde cada mensagem vai, quando o
   relógio manda follow-up ou encerra, quando a conversa volta para a Recepção, e que
   a Coordenação nunca recebe direto do aluno.
   Rodar:  node --experimental-strip-types testes/automatico.ts  */
import {
  AUTOMATICO_PADRAO, acaoDoRelogio, avisaForaDoHorario, comNome, depoisDoMenuConfuso, destinoDoAssunto,
  deveVoltarParaRecepcao, escolhaDoMenu, leAutomatico, pareceDespedida, promptMensagem, recomecaAtendimento,
  regrasDoAssistente, reservaDo, respostaDoAlgoMais, semAulaMarcada, situacaoDoHorario, sobreOQue, textoDaTransferencia, turnosDoAssistente,
  type ConfigAutomatico,
} from '../src/lib/dominio/automatico.ts';
import { leAssunto } from '../src/lib/dominio/triagem.ts';

let falhas = 0;
function igual<T>(nome: string, veio: T, esperado: T) {
  if (JSON.stringify(veio) !== JSON.stringify(esperado)) {
    falhas += 1;
    console.log(`  x ${nome}\n    esperado ${JSON.stringify(esperado)}, veio ${JSON.stringify(veio)}`);
  }
}

const cfg: ConfigAutomatico = leAutomatico({ ...AUTOMATICO_PADRAO, ligado: true });
const AGORA = new Date('2026-11-18T14:30:00-03:00');
const antes = (min: number) => new Date(AGORA.getTime() - min * 60_000).toISOString();

/* ---------- configuração ---------- */
igual('nasce desligado', leAutomatico(null).ligado, false);
igual('o aviso aos coordenadores nasce desligado', leAutomatico(null).avisoLigado, false);
igual('sempre três botões', leAutomatico({ botoes: [] }).botoes.length, 3);
igual('botão corta em 20 letras', leAutomatico({ botoes: [{ texto: 'Um texto grande demais para botão', destino: 'recepcao' }] }).botoes[0].texto.length, 20);
igual('destino estranho volta ao padrão', leAutomatico({ botoes: [{ texto: 'X', destino: 'coordenacao' as never }] }).botoes[0].destino, 'aulas');
igual('Minhas aulas nasce mostrando a próxima aula da agenda', AUTOMATICO_PADRAO.botoes.map((b) => b.destino), ['aulas', 'assistente', 'recepcao']);
igual('a escola pode mandar Minhas aulas direto para a Recepção', leAutomatico({ botoes: [{ texto: 'Minhas aulas', destino: 'recepcao' }] }).botoes[0].destino, 'recepcao');
igual('o destino das aulas é guardado', leAutomatico({ botoes: [{ texto: 'X', destino: 'recepcao' }, { texto: 'Y', destino: 'aulas' }] }).botoes[1].destino, 'aulas');
igual('encerramento sempre depois do follow-up', leAutomatico({ fu1Min: 40, encMin: 20 }).encMin, 41);
igual('no máximo 9 perguntas', leAutomatico({ faq: Array.from({ length: 15 }, (_, i) => ({ t: `p${i}`, r: '' })) }).faq.length, 9);
igual('pergunta sem título sai', leAutomatico({ faq: [{ t: '  ', r: 'x' }, { t: 'ok', r: 'y' }] }).faq.length, 1);
igual('nome do modelo só com letras, números e _', leAutomatico({ avisoModelo: 'Aviso Demanda-Coord' }).avisoModelo, 'aviso_demanda_coord');

/* ---------- menu ---------- */
igual('botão pelo id', escolhaDoMenu(cfg, { id: 'menu-1' }), 'assistente');
igual('botão pelo texto, sem acento e caixa', escolhaDoMenu(cfg, { titulo: 'minhas AULAS' }), 'aulas');
igual('texto que não é botão', escolhaDoMenu(cfg, { titulo: 'oi' }), null);
igual('primeira confusão repete o menu', depoisDoMenuConfuso(0), 'repete');
igual('segunda confusão vai para gente', depoisDoMenuConfuso(1), 'recepcao');

/* ---------- assunto claro: pula o menu ---------- */
const destino = (t: string) => destinoDoAssunto(leAssunto(t).assunto, cfg);
igual('boleto vai para o assistente', destino('me manda a segunda via do boleto'), 'assistente');
igual('reposição vai para a Recepção', destino('faltei na aula de sábado, tem como repor?'), 'recepcao');
igual('cancelamento vai para gente na Recepção', destino('quero cancelar meu curso'), 'recepcao');
igual('pedir a coordenação vai para a Recepção, nunca direto', destino('quero falar com a coordenacao'), 'recepcao');
igual('oi não diz assunto', destino('oi, boa tarde'), null);
const semAssistente = leAutomatico({ ...cfg, botoes: cfg.botoes.map((b) => ({ ...b, destino: 'recepcao' as const })) });
igual('sem botão do assistente, financeiro vai para a Recepção', destinoDoAssunto('financeiro', semAssistente), 'recepcao');

/* ---------- despedida ---------- */
igual('valeu é despedida', pareceDespedida('Valeu!! 🙌'), true);
igual('obrigada é despedida', pareceDespedida('Perfeito, obrigada!'), true);
igual('fico no aguardo não é', pareceDespedida('obrigada, fico no aguardo'), false);
igual('pergunta não é', pareceDespedida('obrigado! e o material?'), false);
igual('texto comum não é', pareceDespedida('não vou conseguir ir na quinta'), false);

/* ---------- relógio ---------- */
const c = (o: Record<string, unknown>) => ({ estado: 'aberta', ...o });
igual('sem relógio, nada', acaoDoRelogio(c({}), cfg, AGORA), 'nada');
igual('antes dos 15 min, nada', acaoDoRelogio(c({ relogioDesde: antes(14) }), cfg, AGORA), 'nada');
igual('aos 15 min, follow-up', acaoDoRelogio(c({ relogioDesde: antes(15) }), cfg, AGORA), 'followup');
igual('follow-up já mandado, espera', acaoDoRelogio(c({ relogioDesde: antes(20), followUpEm: antes(5) }), cfg, AGORA), 'nada');
igual('aos 30 min, encerra', acaoDoRelogio(c({ relogioDesde: antes(30), followUpEm: antes(15) }), cfg, AGORA), 'encerra');
igual('passou dos 30 sem follow-up, encerra direto', acaoDoRelogio(c({ relogioDesde: antes(45) }), cfg, AGORA), 'encerra');
igual('agradeceu: espera 2 min para quem atende responder', acaoDoRelogio(c({ relogioDesde: antes(1), relogioMotivo: 'despedida' }), cfg, AGORA), 'nada');
igual('agradeceu há 2 min: a IA lê e pergunta se precisa de algo mais', acaoDoRelogio(c({ relogioDesde: antes(2), relogioMotivo: 'despedida' }), cfg, AGORA), 'avalia_despedida');
igual('no menu, aos 15 min, follow-up', acaoDoRelogio(c({ etapa: 'menu', relogioDesde: antes(15) }), cfg, AGORA), 'followup');
igual('"algo mais?" sem resposta: antes dos 15 min espera', acaoDoRelogio(c({ etapa: 'mais', relogioDesde: antes(10) }), cfg, AGORA), 'nada');
igual('"algo mais?" sem resposta aos 15 min: encerra, sem follow-up', acaoDoRelogio(c({ etapa: 'mais', relogioDesde: antes(15) }), cfg, AGORA), 'fecha_resolvido');
igual('encerrada não faz nada', acaoDoRelogio(c({ estado: 'encerrada', relogioDesde: antes(60) }), cfg, AGORA), 'nada');

/* ---------- volta para a Recepção ---------- */
const TARDE = new Date('2026-11-18T16:30:00-03:00');
igual('coordenação sem responder 2 h volta', deveVoltarParaRecepcao({ estado: 'aguardando', setor: 'coordenacao', aguardandoSetorDesde: new Date(TARDE.getTime() - 120 * 60_000).toISOString() }, cfg, TARDE), true);
igual('o almoço não conta nas 2 h', deveVoltarParaRecepcao({ estado: 'aguardando', setor: 'coordenacao', aguardandoSetorDesde: antes(120) }, cfg, AGORA), false);
igual('passou às 21h, de manhã ainda não volta', deveVoltarParaRecepcao({ estado: 'aguardando', setor: 'financeiro', aguardandoSetorDesde: '2026-11-18T21:00:00-03:00' }, cfg, new Date('2026-11-19T08:45:00-03:00')), false);
igual('passou às 21h, às 9h30 volta', deveVoltarParaRecepcao({ estado: 'aguardando', setor: 'financeiro', aguardandoSetorDesde: '2026-11-18T21:00:00-03:00' }, cfg, new Date('2026-11-19T09:30:00-03:00')), true);
igual('sem horário, conta o relógio', deveVoltarParaRecepcao({ estado: 'aguardando', setor: 'coordenacao', aguardandoSetorDesde: antes(120) }, leAutomatico({ ...cfg, horarioLigado: false }), AGORA), true);
igual('com 1 h ainda não', deveVoltarParaRecepcao({ estado: 'aguardando', setor: 'coordenacao', aguardandoSetorDesde: antes(60) }, cfg, AGORA), false);
igual('quem já está na Recepção não volta', deveVoltarParaRecepcao({ estado: 'aguardando', setor: 'recepcao', aguardandoSetorDesde: antes(500) }, cfg, AGORA), false);

/* ---------- horário de atendimento ---------- */
const NOITE = new Date('2026-11-18T22:10:00-03:00');      // quarta, depois das 21h30
const SABADO = new Date('2026-11-21T15:00:00-03:00');
igual('horário nasce ligado, com o da escola', [leAutomatico(null).horarioLigado, leAutomatico(null).faixas.length], [true, 11]);
igual('documento salvo antes do horário: vem ligado', leAutomatico({ ligado: true }).horarioLigado, true);
igual('dá para desligar', leAutomatico({ horarioLigado: false }).horarioLigado, false);
igual('à tarde está aberto', situacaoDoHorario(cfg, AGORA), { aberto: true, volta: '', texto: 'segunda a sexta, das 8h às 12h e das 13h30 às 21h30; sábado, das 9h às 12h' });
igual('de noite, volta amanhã às 8h', situacaoDoHorario(cfg, NOITE).volta, 'amanhã às 8h');
igual('sábado à tarde, volta segunda', situacaoDoHorario(cfg, SABADO).volta, 'segunda às 8h');
igual('desligado, sempre aberto', situacaoDoHorario(leAutomatico({ horarioLigado: false }), NOITE).aberto, true);
igual('sem faixa nenhuma, sempre aberto', situacaoDoHorario(leAutomatico({ faixas: [] }), NOITE).aberto, true);

const fora = situacaoDoHorario(cfg, NOITE);
igual('saudação de reserva fora do horário', reservaDo('saudacao', cfg, 'Larissa Menegat', fora),
  'Oi, Larissa! Aqui é a Nexus Chapecó 🧡 Agora a equipe está fora do horário, mas já escolhe uma opção aqui embaixo e me conta o que precisa: amanhã às 8h a gente retoma contigo.');
igual('encaminhamento de reserva fora do horário', reservaDo('encaminha', cfg, 'Larissa', fora), 'Anotado, Larissa! Já me conta aqui o que precisa, que amanhã às 8h a equipe te responde 😊');
igual('no horário, a saudação de sempre', reservaDo('saudacao', cfg, 'Larissa', situacaoDoHorario(cfg, AGORA)), 'Oi, Larissa! Aqui é a Nexus Chapecó 🧡 Sobre o que tu quer falar?');
const ctxFora = { nome: 'Larissa', ehAluno: true, linhas: [{ de: 'aluno' as const, texto: 'oi' }], horario: fora };
igual('a IA sabe que está fora e quando volta', promptMensagem(cfg, 'saudacao', ctxFora).includes('a equipe está fora do horário e volta amanhã às 8h'), true);
igual('a IA recebe o pedido de explicar o que precisa', promptMensagem(cfg, 'saudacao', ctxFora).includes('FORA DO HORÁRIO, A MENSAGEM TAMBÉM PRECISA'), true);
igual('no horário, a saudação não fala de fora', promptMensagem(cfg, 'saudacao', { ...ctxFora, horario: situacaoDoHorario(cfg, AGORA) }).includes('FORA DO HORÁRIO, A MENSAGEM'), false);
igual('o assistente sabe que a equipe está fora', regrasDoAssistente(cfg, ctxFora).includes('AGORA A EQUIPE ESTÁ FORA DO HORÁRIO e volta amanhã às 8h'), true);

/* a saudação já avisou que está fora: o resto do atendimento não repete */
igual('indo para a fila depois da saudação de fora: só confirma', reservaDo('encaminha', cfg, 'Guilherme', fora, ' sobre as aulas', true), 'Combinado, Guilherme! Pode escrever aqui o que tu precisa sobre as aulas.');
igual('indo direto para a fila, sem saudação antes: avisa', reservaDo('encaminha', cfg, 'Guilherme', fora, '', false).includes('amanhã às 8h'), true);
igual('a IA sabe que não pode repetir', promptMensagem(cfg, 'encaminha', { ...ctxFora, jaAvisouFora: true }).includes('não repita esse aviso'), true);
igual('o assistente também não repete', regrasDoAssistente(cfg, { ...ctxFora, jaAvisouFora: true }).includes('não repita o horário'), true);
igual('Minhas aulas sem aula marcada, fora do horário', semAulaMarcada('Guilherme Correa', fora),
  'Guilherme, não encontrei aula marcada na agenda para este número. Me conta aqui o que tu precisa sobre as aulas, que a equipe te responde amanhã às 8h.');
igual('Minhas aulas sem aula marcada, no horário', semAulaMarcada('Guilherme', situacaoDoHorario(cfg, AGORA)),
  'Guilherme, não encontrei aula marcada na agenda para este número. Me conta aqui o que tu precisa sobre as aulas, que a recepção já te responde.');

/* aviso numa conversa que já está com a equipe: um por fechamento */
igual('no horário não avisa', avisaForaDoHorario({}, cfg, AGORA), false);
igual('fora do horário avisa', avisaForaDoHorario({}, cfg, NOITE), true);
igual('já avisou depois que fechou: não repete', avisaForaDoHorario({ avisoForaEm: '2026-11-18T21:50:00-03:00' }, cfg, NOITE), false);
igual('o aviso de ontem não conta hoje', avisaForaDoHorario({ avisoForaEm: '2026-11-17T22:00:00-03:00' }, cfg, NOITE), true);
igual('alguém da equipe falou depois de fechar: não avisa', avisaForaDoHorario({ ultimaDaEquipeEm: '2026-11-18T21:45:00-03:00' }, cfg, NOITE), false);
igual('a equipe falou antes de fechar: avisa', avisaForaDoHorario({ ultimaDaEquipeEm: '2026-11-18T21:00:00-03:00' }, cfg, NOITE), true);

/* conversa parada recomeça pelo menu */
igual('parada há 13 h, com gente: recomeça', recomecaAtendimento({ estado: 'aberta', etapa: 'gente', ultimaEm: antes(13 * 60) }, cfg, AGORA), true);
igual('conversa antiga sem etapa: recomeça', recomecaAtendimento({ estado: 'aberta', ultimaEm: antes(20 * 60) }, cfg, AGORA), true);
igual('parada há 2 h: segue com gente', recomecaAtendimento({ estado: 'aberta', etapa: 'gente', ultimaEm: antes(120) }, cfg, AGORA), false);
igual('contato esperando a gente: não recomeça', recomecaAtendimento({ estado: 'aguardando', etapa: 'gente', ultimaEm: antes(48 * 60) }, cfg, AGORA), false);
igual('no meio do assistente: não recomeça', recomecaAtendimento({ estado: 'ia', etapa: 'assistente', ultimaEm: antes(48 * 60) }, cfg, AGORA), false);
igual('com 0 horas, nunca recomeça', recomecaAtendimento({ estado: 'aberta', etapa: 'gente', ultimaEm: antes(48 * 60) }, leAutomatico({ recomecaHoras: 0 }), AGORA), false);

/* ---------- assunto resolvido: "posso te ajudar em mais alguma coisa?" ---------- */
igual('botão Não', respostaDoAlgoMais({ id: 'mais-nao' }, 'Não, era só isso'), 'nao');
igual('botão Sim', respostaDoAlgoMais({ id: 'mais-sim' }, 'Sim, outra coisa'), 'sim');
igual('botão antigo Ajudou vale como não', respostaDoAlgoMais({ id: 'ajudou' }, 'Ajudou, valeu!'), 'nao');
igual('botão Falar com uma pessoa', respostaDoAlgoMais({ id: 'pessoa' }, 'Falar com uma pessoa'), 'pessoa');
igual('escreveu não', respostaDoAlgoMais({}, 'Não, obrigado!'), 'nao');
igual('escreveu só isso mesmo', respostaDoAlgoMais({}, 'só isso mesmo'), 'nao');
igual('escreveu era só isso', respostaDoAlgoMais({}, 'era só isso'), 'nao');
igual('escreveu valeu', respostaDoAlgoMais({}, 'valeu!!'), 'nao');
igual('escreveu sim', respostaDoAlgoMais({}, 'sim'), 'sim');
igual('escreveu tenho outra dúvida', respostaDoAlgoMais({}, 'tenho outra dúvida'), 'sim');
igual('"não consigo pagar" não é não: é assunto novo', respostaDoAlgoMais({}, 'não consigo pagar esse mês'), 'outra');
igual('pergunta nova é assunto novo', respostaDoAlgoMais({}, 'e o material, quando chega?'), 'outra');

/* ---------- o assunto, para dizer do que se tratou ---------- */
const lin = (...t: string[]) => t.map((texto, i) => ({ de: (i % 2 ? 'escola' : 'aluno') as 'aluno' | 'escola', texto }));
igual('boletos', sobreOQue(lin('quero ver sobre meus boletos')), ' sobre o boleto');
igual('o assunto mais recente do contato', sobreOQue(lin('quero ver meus boletos', 'claro!', 'e tem reposição sábado?')), ' sobre a reposição');
igual('o que a escola escreveu não conta', sobreOQue([{ de: 'escola', texto: 'teu boleto está aqui' }]), '');
igual('sem assunto claro, nada', sobreOQue(lin('oi', 'oi!', 'tudo bem?')), '');
igual('encerramento por silêncio, com o assunto', reservaDo('encerramento', cfg, 'Guilherme Correa', undefined, ' sobre o boleto'),
  'Guilherme, como não tive retorno, vou encerrar por aqui o atendimento sobre o boleto. Quando quiser retomar, é só mandar uma mensagem 😊');
igual('encerrar na mão, com o assunto', reservaDo('fechamento', cfg, 'Guilherme', undefined, ' sobre o boleto'),
  'Guilherme, vou encerrar por aqui o atendimento sobre o boleto. Se precisar de mais alguma coisa, é só mandar uma mensagem 😊');
igual('encerrar na mão, sem assunto', reservaDo('fechamento', cfg, 'Guilherme'),
  'Guilherme, vou encerrar por aqui o atendimento. Se precisar de mais alguma coisa, é só mandar uma mensagem 😊');
igual('sem nome, sem "tudo bem" no lugar', reservaDo('fechamento', cfg, ''), 'Vou encerrar por aqui o atendimento. Se precisar de mais alguma coisa, é só mandar uma mensagem 😊');
igual('sem nome no meio da frase', comNome('Oi, {primeiro_nome}! Tudo bem?', ''), 'Oi! Tudo bem?');
igual('a pergunta de algo mais', reservaDo('mais', cfg, 'Guilherme'), 'Que bom que deu certo, Guilherme! Posso te ajudar em mais alguma coisa?');
igual('quem agradeceu recebe a pergunta, não "imagina"', reservaDo('despedida', cfg, 'Guilherme'), 'Que bom que deu certo, Guilherme! Posso te ajudar em mais alguma coisa?');
const ctxBoleto = { nome: 'Guilherme', ehAluno: true, linhas: lin('quero ver sobre meus boletos', 'te mando já') };
igual('a IA, ao encerrar na mão, diz do que se tratou', promptMensagem(cfg, 'fechamento', ctxBoleto).includes('dizendo em poucas palavras do que se tratou'), true);
igual('a IA, ao resolver, pergunta se precisa de algo mais com os botões', promptMensagem(cfg, 'despedida', ctxBoleto).includes('"Não, era só isso" e "Sim, outra coisa"'), true);
igual('no menu, o follow-up sabe que os botões vão de novo', promptMensagem(cfg, 'followup', { ...ctxBoleto, etapa: 'menu' }).includes('os mesmos botões vão de novo'), true);

/* textos antigos que ninguém editou seguem o padrão novo; o que a escola escreveu fica */
const salvo = leAutomatico({ ligado: true, encReserva: '{primeiro_nome}, vou encerrar o atendimento por aqui. Quando quiser retomar, é só mandar uma mensagem 😊', fu1Reserva: 'Oi, {primeiro_nome}! Tudo certo por aí?' });
igual('o encerramento antigo vira o novo', salvo.encReserva, AUTOMATICO_PADRAO.encReserva);
igual('o follow-up escrito pela escola fica', salvo.fu1Reserva, 'Oi, {primeiro_nome}! Tudo certo por aí?');
igual('15 e 30 minutos por padrão', [leAutomatico(null).fu1Min, leAutomatico(null).encMin], [15, 30]);

/* ---------- aviso ao passar a conversa ---------- */
const PASSA = '{primeiro_nome}, tua conversa foi encaminhada para {setor}. Logo alguém te responde por aqui.';
igual('passou para o Financeiro', textoDaTransferencia(PASSA, 'financeiro', 'Guilherme Correa', situacaoDoHorario(cfg, AGORA)),
  'Guilherme, tua conversa foi encaminhada para o Financeiro. Logo alguém te responde por aqui.');
igual('passou para a Coordenação Kids', textoDaTransferencia(PASSA, 'kids', 'Cláudia'), 'Cláudia, tua conversa foi encaminhada para a Coordenação Kids. Logo alguém te responde por aqui.');
igual('fora do horário diz quando volta', textoDaTransferencia(PASSA, 'coordenacao', 'Jonas', situacaoDoHorario(cfg, NOITE)),
  'Jonas, tua conversa foi encaminhada para a Coordenação. Logo alguém te responde por aqui. A equipe está fora do horário agora e volta amanhã às 8h.');
igual('sem nome', textoDaTransferencia(PASSA, 'recepcao', ''), 'Tua conversa foi encaminhada para a Recepção. Logo alguém te responde por aqui.');

/* ---------- textos ---------- */
igual('reserva com o nome', comNome('Oi, {primeiro_nome}! Tudo bem?', 'Larissa Menegat'), 'Oi, Larissa! Tudo bem?');
const turnos = turnosDoAssistente(cfg, { nome: 'Marina', ehAluno: true, linhas: [
  { de: 'aluno', texto: 'oi' }, { de: 'escola', texto: 'oi, Marina!' }, { de: 'aluno', texto: 'como tranco?' }, { de: 'escola', texto: 'já te digo' },
] });
igual('turnos começam no contato', turnos[0].role, 'user');
igual('turnos terminam no contato', turnos[turnos.length - 1].role, 'user');

if (falhas) {
  console.log(`atendimento automático: ${falhas} caso(s) falharam`);
  process.exit(1);
}
console.log('atendimento automático: todos os casos passaram');
