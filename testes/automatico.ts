/* Prova das regras do atendimento automático: para onde cada mensagem vai, quando o
   relógio manda follow-up ou encerra, quando a conversa volta para a Recepção, e que
   a Coordenação nunca recebe direto do aluno.
   Rodar:  node --experimental-strip-types testes/automatico.ts  */
import {
  AUTOMATICO_PADRAO, acaoDoRelogio, avisaForaDoHorario, comNome, depoisDoMenuConfuso, destinoDoAssunto,
  deveVoltarParaRecepcao, escolhaDoMenu, leAutomatico, pareceDespedida, promptMensagem, recomecaAtendimento,
  regrasDoAssistente, reservaDo, situacaoDoHorario, turnosDoAssistente,
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
igual('despedida do contato é avaliada', acaoDoRelogio(c({ relogioDesde: antes(16), relogioMotivo: 'despedida' }), cfg, AGORA), 'avalia_despedida');
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
