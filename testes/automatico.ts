/* Prova das regras do atendimento automático: para onde cada mensagem vai, quando o
   relógio manda follow-up ou encerra, quando a conversa volta para a Recepção, e que
   a Coordenação nunca recebe direto do aluno.
   Rodar:  node --experimental-strip-types testes/automatico.ts  */
import {
  AUTOMATICO_PADRAO, acaoDoRelogio, comNome, depoisDoMenuConfuso, destinoDoAssunto,
  deveVoltarParaRecepcao, escolhaDoMenu, leAutomatico, pareceDespedida, turnosDoAssistente,
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
igual('coordenação sem responder 2 h volta', deveVoltarParaRecepcao({ estado: 'aguardando', setor: 'coordenacao', aguardandoSetorDesde: antes(120) }, cfg, AGORA), true);
igual('com 1 h ainda não', deveVoltarParaRecepcao({ estado: 'aguardando', setor: 'coordenacao', aguardandoSetorDesde: antes(60) }, cfg, AGORA), false);
igual('quem já está na Recepção não volta', deveVoltarParaRecepcao({ estado: 'aguardando', setor: 'recepcao', aguardandoSetorDesde: antes(500) }, cfg, AGORA), false);

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
