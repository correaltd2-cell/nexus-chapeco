/* O atendimento automático em ação, no servidor: reage a cada mensagem do contato,
   roda o relógio do follow-up e devolve para a Recepção a conversa que um setor nao
   respondeu. As decisoes moram em src/lib/dominio/automatico.ts (puras, testadas);
   aqui fica so o que fala com o banco, com a Meta e com a IA.

   Tres travas de seguranca, de proposito:
   - nada roda com a chave mestra desligada (config/automatico.ligado)
   - nada sai fora da janela de 24 horas: aqui so se responde a quem acabou de escrever
   - mensagem antiga importada do celular (historico da coexistencia) nunca chega aqui */
import 'server-only';
import { FieldValue, type DocumentReference, type Firestore } from 'firebase-admin/firestore';
import { mandaBotoes, mandaFigurinha, mandaLista, mandaTemplate, mandaTexto, temConfig } from './cloud';
import { ENDERECO } from '@/lib/dominio/modelos';
import { leAtendimento } from '@/lib/dominio/config';
import { escreveMensagem, iaLigada, respondeComoAssistente, type Leitura } from '@/lib/ia/claude';
import { leAssunto } from '@/lib/dominio/triagem';
import { janelaAberta } from '@/lib/dominio/formato';
import { FIGURINHA_DO_SETOR, NOME_SETOR } from '@/lib/dominio/acessos';
import { respostaDasAulas } from '@/lib/dominio/agenda';
import { aulasDoContato } from '@/lib/agenda-servidor';
import { descreveErro, falhou } from '@/lib/saude';
import { comReserva } from '@/lib/firebase/indice';
import {
  BOTOES_DEPOIS_DA_DUVIDA, BOTOES_MAIS, ID_AJUDOU, ID_PESSOA, acaoDoRelogio, avisaForaDoHorario, comNome,
  depoisDoMenuConfuso, destinoDoAssunto, deveVoltarParaRecepcao, escolhaDoMenu, idDaPergunta, idDoBotao, leAutomatico,
  menorEspera, pareceDespedida, primeiro, promptMensagem, recomecaAtendimento, reservaDo, respostaDoAlgoMais,
  setorDoPassa, situacaoDoHorario, sobreOQue, turnosDoAssistente,
  type ConfigAutomatico, type ContextoDaConversa, type Destino, type Linha, type Momento, type SituacaoDoHorario,
} from '@/lib/dominio/automatico';
import type { Conversa, Mensagem, Perfil, QuemEncerrou, Setor } from '@/lib/dominio/tipos';

const APAGA = () => FieldValue.delete();
const agoraIso = () => new Date().toISOString();

export async function leConfig(bd: Firestore): Promise<ConfigAutomatico> {
  const d = await bd.doc('config/automatico').get();
  return leAutomatico(d.exists ? (d.data() as Partial<ConfigAutomatico>) : null);
}

/** A conversa deste atendimento, para a IA ler. Nota interna e aviso do sistema ficam de fora.
    Lê do começo do atendimento (ou dos últimos 7 dias, quando ele não tem começo marcado)
    em ordem crescente, que é o índice que existe (conversaId, criadaEm); limitToLast
    pediria o índice decrescente, e foi isso que derrubou o "Encerrar atendimento". */
export async function linhasDoAtendimento(bd: Firestore, conversaId: string, desde?: string): Promise<Linha[]> {
  const piso = desde || new Date(Date.now() - 7 * 86_400_000).toISOString();
  const mensagens = await comReserva('mensagens do atendimento',
    async () => (await bd.collection('mensagens')
      .where('conversaId', '==', conversaId).where('criadaEm', '>=', piso).orderBy('criadaEm').get())
      .docs.map((d) => d.data() as Mensagem),
    async () => (await bd.collection('mensagens').where('conversaId', '==', conversaId).get())
      .docs.map((d) => d.data() as Mensagem)
      .filter((m) => (m.criadaEm || '') >= piso)
      .sort((a, b) => (a.criadaEm || '').localeCompare(b.criadaEm || '')));
  return mensagens
    .filter((m) => m.autor !== 'sistema')
    .slice(-30)
    .map((m) => ({
      de: m.direcao === 'entrada' ? 'aluno' as const : 'escola' as const,
      quem: m.autor === 'lumi' ? 'atendimento automático' : m.autorNome || 'equipe',
      texto: m.texto || (m.midiaNome ? `(mandou ${m.midiaNome})` : '(mandou uma mídia)'),
    }));
}

export const contextoDe = (c: Partial<Conversa>, linhas: Linha[], horario?: SituacaoDoHorario): ContextoDaConversa => ({
  nome: c.nome || '', ehAluno: Boolean(c.alunoId), observacao: c.observacao, linhas, horario, etapa: c.etapa,
});

/** O texto de reserva de um momento, com o nome, a hora da volta e o assunto. */
const reservaDe = (momento: Momento, cfg: ConfigAutomatico, ctx: ContextoDaConversa) =>
  reservaDo(momento, cfg, ctx.nome, ctx.horario, sobreOQue(ctx.linhas));

/** O texto de um momento: a IA escreve; sem ela, o texto de reserva das Configurações. */
async function textoDo(momento: Momento, cfg: ConfigAutomatico, ctx: ContextoDaConversa) {
  const leitura = await escreveMensagem(promptMensagem(cfg, momento, ctx));
  return { leitura, texto: leitura?.mensagem || reservaDe(momento, cfg, ctx) };
}

/* ---------------- falar com o contato ---------------- */

interface Envio {
  texto: string;
  botoes?: { titulos: string[]; ids: string[] };
  lista?: { botao: string; linhas: { id: string; titulo: string }[] };
  /* liga: a fala espera resposta, o relógio do follow-up começa agora.
     mantem: não mexe no relógio (o follow-up conta da fala que esperava resposta).
     nao: aviso que não espera resposta, como "já te passo pra recepção". */
  relogio: 'liga' | 'mantem' | 'nao';
}

async function fala(bd: Firestore, ref: DocumentReference, c: { waId?: string; janelaAte?: string }, e: Envio) {
  const texto = e.texto.trim();
  if (!texto || !c.waId || !janelaAberta(c)) return false;
  const r = e.botoes
    ? await mandaBotoes(c.waId, texto, e.botoes.titulos, e.botoes.ids)
    : e.lista
      ? await mandaLista(c.waId, texto, e.lista.botao, e.lista.linhas)
      : await mandaTexto(c.waId, texto);
  const agora = agoraIso();
  const opcoes = e.botoes?.titulos || e.lista?.linhas.map((l) => l.titulo);
  await bd.collection('mensagens').add({
    conversaId: ref.id, direcao: 'saida', autor: 'lumi', autorNome: 'Atendimento automático',
    texto, ...(opcoes ? { botoes: opcoes } : {}),
    waMessageId: r.waMessageId || null,
    falhouEm: r.ok ? null : agora, falhaMotivo: r.ok ? null : r.erro || null,
    criadaEm: agora,
  });
  const campos: Record<string, unknown> = { ultimaEm: agora, ultimaPreviaTexto: texto };
  if (e.relogio === 'liga' && r.ok) {
    Object.assign(campos, { relogioDesde: agora, relogioMotivo: APAGA(), followUpEm: APAGA() });
  }
  await ref.update(campos);
  return r.ok;
}

/** A figurinha do setor ("Agora quem te atende é o Financeiro"), quando a conversa passa
    para ele: o contato vê a troca sem ler mais uma mensagem. Só com a janela de 24 horas
    aberta (figurinha não é modelo) e com a opção ligada em Configurações, Atendimento. */
export async function mandaFigurinhaDoSetor(
  bd: Firestore, ref: DocumentReference, c: { waId?: string; janelaAte?: string }, setor: Setor,
) {
  if (!c.waId || !janelaAberta(c) || !temConfig()) return false;
  const cfg = leAtendimento((await bd.doc('config/atendimento').get()).data());
  if (!cfg.figurinhaAoPassar) return false;
  const caminho = FIGURINHA_DO_SETOR[setor];
  const r = await mandaFigurinha(c.waId, `${ENDERECO}${caminho}`);
  const agora = agoraIso();
  await bd.collection('mensagens').add({
    conversaId: ref.id, direcao: 'saida', autor: 'lumi', autorNome: 'Figurinha do setor', texto: '',
    figurinha: true, midiaMime: 'image/webp', midiaLink: caminho, midiaNome: `Agora com ${NOME_SETOR[setor]}`,
    waMessageId: r.waMessageId || null, falhouEm: r.ok ? null : agora, falhaMotivo: r.ok ? null : r.erro || null,
    criadaEm: agora,
  });
  await ref.update({ ultimaEm: agora, ultimaPreviaTexto: `Figurinha: agora com ${NOME_SETOR[setor]}` });
  return r.ok;
}

async function recado(bd: Firestore, conversaId: string, texto: string) {
  await bd.collection('mensagens').add({
    conversaId, direcao: 'saida', autor: 'sistema', autorNome: 'Sistema', texto, criadaEm: agoraIso(),
  });
}

/** O que muda na conversa quando alguém do time fala com o contato (pelo sistema, pelo
    celular ou por mensagem programada). Quem fala agora é gente; o relógio do follow-up
    começa, a nao ser que tenha saido por modelo (janela fechada: nao ha o que retomar). */
export function camposDaFalaDaEscola(quando: string, ligaRelogio = true): Record<string, unknown> {
  return {
    etapa: 'gente', tentativasMenu: APAGA(), aguardandoSetorDesde: APAGA(), ultimaDaEquipeEm: quando,
    relogioMotivo: APAGA(), followUpEm: APAGA(),
    relogioDesde: ligaRelogio ? quando : APAGA(),
  };
}

/** Encerra o atendimento. A conversa volta para a Recepção, e a próxima mensagem do
    contato começa o fluxo de novo. */
export async function encerra(
  bd: Firestore, ref: DocumentReference, por: QuemEncerrou, aviso: string, quemNome?: string,
) {
  await ref.update({
    estado: 'encerrada', encerradaEm: agoraIso(), encerradaPor: por,
    encerradaPorNome: quemNome || APAGA(),
    setor: 'recepcao', agenteAtivo: true,
    etapa: APAGA(), tentativasMenu: APAGA(), atendimentoDesde: APAGA(),
    relogioDesde: APAGA(), relogioMotivo: APAGA(), followUpEm: APAGA(),
    aguardandoSetorDesde: APAGA(), aguardandoDesde: APAGA(), processandoEm: APAGA(),
  });
  await recado(bd, ref.id, aviso);
}

/* ---------------- a mensagem que acabou de chegar ---------------- */

/** O id e o texto do botão ou da linha de lista que o contato tocou. */
function respostaInterativa(m: Record<string, unknown>, texto: string): { id?: string; titulo?: string } {
  if (m.type === 'interactive') {
    const i = m.interactive as { button_reply?: { id?: string; title?: string }; list_reply?: { id?: string; title?: string } } | undefined;
    const r = i?.button_reply || i?.list_reply;
    return { id: r?.id, titulo: r?.title };
  }
  if (m.type === 'button') {
    const b = m.button as { payload?: string; text?: string } | undefined;
    return { id: b?.payload, titulo: b?.text };
  }
  return { titulo: texto };
}

interface Rodada {
  bd: Firestore;
  ref: DocumentReference;
  c: Partial<Conversa>;      // como estava antes desta mensagem, com a janela ja renovada
  cfg: ConfigAutomatico;
  horario: SituacaoDoHorario;   // a equipe está no horário agora? quando volta?
  texto: string;
  quando: string;
  resposta: { id?: string; titulo?: string };
}

export async function atendeAoVivo(
  bd: Firestore, ref: DocumentReference, antes: Partial<Conversa>,
  m: Record<string, unknown>, texto: string, quando: string, janelaAte: string,
) {
  const cfg = await leConfig(bd);
  if (!cfg.ligado || !temConfig()) return;

  const agora = new Date();
  const r: Rodada = {
    bd, ref, c: { ...antes, janelaAte }, cfg, horario: situacaoDoHorario(cfg, agora),
    texto, quando, resposta: respostaInterativa(m, texto),
  };
  /* conversa que ficou parada horas, sem ninguém esperando resposta, recomeça pelo menu */
  const recomeca = recomecaAtendimento(antes, cfg, agora);
  const novo = antes.estado === 'encerrada' || antes.etapa === 'inicio' || recomeca;
  /* o contato falou: o relógio para, quem decide o próximo passo é a etapa */
  const paraRelogio = { relogioDesde: APAGA(), relogioMotivo: APAGA(), followUpEm: APAGA() };

  if (novo) {
    if (recomeca) await recado(bd, ref.id, `A conversa estava parada desde ${new Date(antes.ultimaEm || quando).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' })}: o atendimento recomeçou pelo menu.`);
    await ref.update({
      ...paraRelogio, etapa: 'menu', tentativasMenu: 0, atendimentoDesde: quando,
      setor: 'recepcao', aguardandoSetorDesde: APAGA(),
    });
    const destino = cfg.pulaMenu ? destinoDoAssunto(leAssunto(texto).assunto, cfg) : null;
    if (destino) return segue(r, destino);
    return mandaMenu(r, 'saudacao');
  }

  if (antes.etapa === 'menu') {
    await ref.update(paraRelogio);
    const destino = escolhaDoMenu(cfg, r.resposta) ?? destinoDoAssunto(leAssunto(texto).assunto, cfg);
    if (destino) return segue(r, destino);
    const tentativas = antes.tentativasMenu || 0;
    if (depoisDoMenuConfuso(tentativas) === 'repete') {
      await ref.update({ tentativasMenu: tentativas + 1 });
      return mandaMenu(r, 'denovo');
    }
    return paraRecepcao(r);
  }

  if (antes.etapa === 'assistente') {
    await ref.update(paraRelogio);
    /* "valeu!" para o assistente: o assunto se resolveu, pergunta se precisa de algo mais */
    if (!r.resposta.id && pareceDespedida(texto)) return perguntaAlgoMais(r);
    return assistente(r);
  }

  /* respondeu ao "posso te ajudar em mais alguma coisa?" */
  if (antes.etapa === 'mais') {
    await ref.update(paraRelogio);
    const escolha = respostaDoAlgoMais(r.resposta, texto);
    if (escolha === 'nao') return fechaResolvido(r, 'O contato disse que era só isso. Atendimento encerrado.');
    if (escolha === 'sim') return mandaMenu(r, 'mais');
    if (escolha === 'pessoa') return passaParaGente(r, 'Pediu para falar com uma pessoa.', true);
    const destino = destinoDoAssunto(leAssunto(texto).assunto, cfg);
    if (destino) return segue(r, destino);
    return voltaParaGente(r);
  }

  /* viu a próxima aula: Confirmar e Remarcar já foram tratados na chegada
     (respondeLembrete). O que chega aqui é "Falar com a recepção" ou texto, e vai para gente. */
  if (antes.etapa === 'aulas') {
    await ref.update(paraRelogio);
    return paraRecepcao(r);
  }

  /* com gente: nada responde sozinho. Se parece agradecimento, o relógio liga: em 2
     minutos (se ninguém do time responder antes) a IA lê se resolveu e pergunta se
     precisa de mais alguma coisa, com os botões. Fora do horário, um aviso de que a
     equipe volta tal hora, uma vez por fechamento. */
  if (pareceDespedida(texto)) {
    await ref.update({ relogioDesde: quando, relogioMotivo: 'despedida', followUpEm: APAGA() });
    return;
  }
  await ref.update(paraRelogio);
  if (avisaForaDoHorario(antes, cfg, agora)) {
    const linhas = await linhasDoAtendimento(bd, ref.id, antes.atendimentoDesde || quando);
    const { texto: aviso } = await textoDo('fora', cfg, contextoDe(r.c, linhas, r.horario));
    if (await fala(bd, ref, r.c, { texto: aviso, relogio: 'nao' })) await ref.update({ avisoForaEm: agora.toISOString() });
  }
}

async function mandaMenu(r: Rodada, qual: 'saudacao' | 'denovo' | 'mais') {
  if (qual === 'mais') await r.ref.update({ etapa: 'menu', tentativasMenu: 0 });
  const linhas = qual === 'saudacao' ? await linhasDoAtendimento(r.bd, r.ref.id, r.quando) : [];
  const texto = qual === 'saudacao'
    ? (await textoDo('saudacao', r.cfg, contextoDe(r.c, linhas, r.horario))).texto
    : qual === 'mais'
      ? comNome('Claro, {primeiro_nome}! Sobre o que mais tu quer falar? 👇', r.c.nome || '')
      : r.cfg.menuDeNovo;
  await fala(r.bd, r.ref, r.c, {
    texto,
    botoes: { titulos: r.cfg.botoes.map((b) => b.texto), ids: r.cfg.botoes.map((_, i) => idDoBotao(i)) },
    relogio: 'liga',
  });
}

async function segue(r: Rodada, destino: Destino) {
  if (destino === 'recepcao') return paraRecepcao(r);
  if (destino === 'aulas') return mostraAulas(r);
  await r.ref.update({ setor: 'financeiro', estado: 'ia', agenteAtivo: true, etapa: 'assistente', tentativasMenu: 0 });
  r.c = { ...r.c, setor: 'financeiro', estado: 'ia', etapa: 'menu' };
  return assistente(r);
}

/** "Minhas aulas": a próxima aula, lida da agenda, com Confirmar presença, Remarcar e
    Falar com a recepção. Dia e hora vêm do banco, nunca da IA. Sem aula marcada, ou sem
    saber de quem é o número, vai para a Recepção como antes, com um recado para o time. */
async function mostraAulas(r: Rodada) {
  let achou: Awaited<ReturnType<typeof aulasDoContato>> = null;
  try {
    achou = await aulasDoContato(r.bd, { alunoId: r.c.alunoId, waId: r.c.waId });
  } catch (e) {
    await falhou('agenda', `Minhas aulas: ${descreveErro(e)}`);
  }
  if (!achou) {
    await recado(r.bd, r.ref.id, 'Pediu as aulas pelo botão, mas não achei aula marcada na agenda para este contato.');
    return paraRecepcao(r);
  }
  const { texto, botoes } = respostaDasAulas({
    contato: r.c.nome || achou.alunoNome, aluno: achou.alunoNome, paraResponsavel: achou.paraResponsavel,
    alunoId: achou.alunoId, proxima: achou.proxima, depois: achou.depois,
  });
  await r.ref.update({ etapa: 'aulas', tentativasMenu: 0 });
  await fala(r.bd, r.ref, r.c, {
    texto, botoes: { titulos: botoes.map((b) => b.titulo), ids: botoes.map((b) => b.id) }, relogio: 'liga',
  });
}

/** O assunto se resolveu: "posso te ajudar em mais alguma coisa?", com Não e Sim.
    A frase é da IA, citando o assunto; sem ela, o texto de reserva. */
async function perguntaAlgoMais(r: Rodada, pronta?: string) {
  const linhas = await linhasDoAtendimento(r.bd, r.ref.id, r.c.atendimentoDesde || r.quando);
  const texto = pronta || (await textoDo('mais', r.cfg, contextoDe(r.c, linhas, r.horario))).texto;
  await r.ref.update({ etapa: 'mais', tentativasMenu: 0 });
  await fala(r.bd, r.ref, r.c, { texto, botoes: BOTOES_MAIS, relogio: 'liga' });
}

/** "Não, era só isso" (ou sem resposta ao "algo mais?"): uma frase rápida e encerra. */
async function fechaResolvido(r: Rodada, recadoFinal: string) {
  const linhas = await linhasDoAtendimento(r.bd, r.ref.id, r.c.atendimentoDesde || r.quando);
  await fala(r.bd, r.ref, r.c, { texto: comNome(r.cfg.fimReserva, r.c.nome || '', '', sobreOQue(linhas)), relogio: 'mantem' });
  await encerra(r.bd, r.ref, 'cliente', recadoFinal);
}

/** Escreveu outra coisa depois do "algo mais?": fica com quem estava atendendo. Se
    ninguém da equipe falou neste atendimento, vai para a Recepção com o aviso de sempre. */
async function voltaParaGente(r: Rodada) {
  const comGente = Boolean(r.c.ultimaDaEquipeEm && r.c.atendimentoDesde && r.c.ultimaDaEquipeEm >= r.c.atendimentoDesde);
  if (!comGente) return paraRecepcao(r);
  await r.ref.update({ estado: 'aguardando', aguardandoDesde: r.quando, agenteAtivo: false, etapa: 'gente', tentativasMenu: APAGA() });
  if (avisaForaDoHorario(r.c, r.cfg, new Date())) {
    const linhas = await linhasDoAtendimento(r.bd, r.ref.id, r.c.atendimentoDesde || r.quando);
    const { texto } = await textoDo('fora', r.cfg, contextoDe(r.c, linhas, r.horario));
    if (await fala(r.bd, r.ref, r.c, { texto, relogio: 'nao' })) await r.ref.update({ avisoForaEm: agoraIso() });
  }
}

/** Presença confirmada pelo "Minhas aulas": em vez de fechar calado, pergunta se precisa
    de mais alguma coisa (chamado pela chegada da mensagem, em recebimento.ts). */
export async function depoisDeConfirmar(bd: Firestore, ref: DocumentReference, antes: Partial<Conversa>, quando: string, janelaAte: string) {
  const cfg = await leConfig(bd);
  if (!cfg.ligado || !temConfig()) {
    await encerra(bd, ref, 'cliente', 'Presença confirmada pelo WhatsApp. Atendimento encerrado.');
    return;
  }
  const r: Rodada = { bd, ref, c: { ...antes, janelaAte }, cfg, horario: situacaoDoHorario(cfg, new Date()), texto: '', quando, resposta: {} };
  await perguntaAlgoMais(r, comNome('Posso te ajudar em mais alguma coisa, {primeiro_nome}?', antes.nome || ''));
}

/** Vai para gente na Recepção, com um aviso curto que não espera resposta. */
async function paraRecepcao(r: Rodada) {
  await r.ref.update({
    setor: 'recepcao', estado: 'aguardando', aguardandoDesde: r.quando, agenteAtivo: false,
    etapa: 'gente', tentativasMenu: APAGA(),
  });
  const linhas = await linhasDoAtendimento(r.bd, r.ref.id, r.c.atendimentoDesde || r.quando);
  const { texto } = await textoDo('encaminha', r.cfg, contextoDe(r.c, linhas, r.horario));
  const ok = await fala(r.bd, r.ref, r.c, { texto, relogio: 'nao' });
  /* fora do horário este aviso já disse quando a equipe volta: não repete até fechar de novo */
  if (ok && !r.horario.aberto) await r.ref.update({ avisoForaEm: agoraIso() });
}

/** O assistente não resolveu: passa para gente, com um resumo para ninguém perguntar tudo de novo. */
async function passaParaGente(r: Rodada, resumo: string, avisa: boolean) {
  const setor = setorDoPassa(r.cfg);
  await r.ref.update({
    setor, estado: 'aguardando', aguardandoDesde: agoraIso(), agenteAtivo: false,
    etapa: 'gente', tentativasMenu: APAGA(),
    aguardandoSetorDesde: setor === 'recepcao' ? APAGA() : agoraIso(),
  });
  await recado(r.bd, r.ref.id, `O assistente passou a conversa para ${NOME_SETOR[setor]}. Resumo: ${resumo}`);
  if (avisa) await fala(r.bd, r.ref, r.c, { texto: reservaDo('encaminha', r.cfg, r.c.nome || '', r.horario), relogio: 'nao' });
  await mandaFigurinhaDoSetor(r.bd, r.ref, r.c, setor);
  if (!r.horario.aberto) await r.ref.update({ avisoForaEm: agoraIso() });
}

async function assistente(r: Rodada) {
  const { cfg } = r;
  if (cfg.modo === 'ia' && iaLigada()) {
    const linhas = await linhasDoAtendimento(r.bd, r.ref.id, r.c.atendimentoDesde || r.quando);
    const resposta = await respondeComoAssistente(turnosDoAssistente(cfg, contextoDe(r.c, linhas, r.horario)));
    if (resposta) {
      const passa = resposta.acao === 'passar';
      await fala(r.bd, r.ref, r.c, { texto: resposta.mensagem, relogio: passa ? 'nao' : 'liga' });
      if (passa) await passaParaGente(r, resposta.resumo || 'O assistente não soube responder.', false);
      return;
    }
    /* a IA não respondeu: segue no modo botões, que não depende dela */
  }
  return assistenteEmBotoes(r);
}

async function assistenteEmBotoes(r: Rodada) {
  const { cfg, resposta } = r;
  const id = resposta.id || '';
  if (id === ID_PESSOA) return passaParaGente(r, 'Pediu para falar com uma pessoa.', true);
  if (id === ID_AJUDOU) return fechaResolvido(r, 'Resolvido pelo assistente. Atendimento encerrado.');
  const pelaLista = /^faq-(\d)$/.exec(id);
  if (pelaLista) {
    const q = cfg.faq[Number(pelaLista[1])];
    if (!q || !q.r) return passaParaGente(r, `Perguntou sobre "${q?.t || 'uma dúvida'}", que ainda não tem resposta escrita.`, true);
    /* a resposta já pergunta se precisa de mais alguma coisa: Era só isso encerra na hora */
    await r.ref.update({ etapa: 'mais', tentativasMenu: 0 });
    return fala(r.bd, r.ref, r.c, {
      texto: `${q.r}\n\nPosso te ajudar em mais alguma coisa?`, botoes: BOTOES_DEPOIS_DA_DUVIDA, relogio: 'liga',
    });
  }
  /* digitou, ou acabou de chegar: a lista vai uma vez; digitou de novo, vai para gente */
  const tentativas = r.c.etapa === 'assistente' ? r.c.tentativasMenu || 0 : 0;
  if (tentativas >= 1 || !cfg.faq.length) {
    return passaParaGente(r, `Escreveu: "${r.texto.slice(0, 200)}".`, true);
  }
  await r.ref.update({ tentativasMenu: tentativas + 1 });
  return fala(r.bd, r.ref, r.c, {
    texto: `Beleza${r.c.nome ? `, ${primeiro(r.c.nome)}` : ''}! Escolhe tua dúvida aqui embaixo 👇`,
    lista: {
      botao: 'Ver as dúvidas',
      linhas: [...cfg.faq.map((q, i) => ({ id: idDaPergunta(i), titulo: q.t })), { id: ID_PESSOA, titulo: 'Falar com uma pessoa' }],
    },
    relogio: 'liga',
  });
}

/* ---------------- o relógio (cron de minuto em minuto) ---------------- */

/** Pega a conversa para este cron. Se outro cron está nela há menos de 3 minutos, larga. */
async function trava(bd: Firestore, ref: DocumentReference, agora: Date): Promise<Partial<Conversa> | null> {
  return bd.runTransaction(async (tx) => {
    const s = await tx.get(ref);
    if (!s.exists) return null;
    const d = s.data() as Partial<Conversa>;
    if (d.processandoEm && agora.getTime() - new Date(d.processandoEm).getTime() < 3 * 60_000) return null;
    tx.update(ref, { processandoEm: agora.toISOString() });
    return { ...d, id: s.id };
  });
}

export async function rodaRelogios(bd: Firestore, agora = new Date()) {
  const cfg = await leConfig(bd);
  const feito = { followups: 0, encerradas: 0, voltaram: 0 };
  if (!cfg.ligado || !temConfig()) return { ...feito, desligado: true };

  const limite = new Date(agora.getTime() - menorEspera(cfg) * 60_000).toISOString();
  const vencidas = await bd.collection('conversas').where('relogioDesde', '<=', limite).limit(40).get();

  for (const doc of vencidas.docs) {
    if (acaoDoRelogio(doc.data() as Conversa, cfg, agora) === 'nada') continue;
    const c = await trava(bd, doc.ref, agora);
    if (!c) continue;
    try {
      const acao = acaoDoRelogio(c as Conversa, cfg, agora);
      if (acao === 'nada') continue;
      const horario = situacaoDoHorario(cfg, agora);
      const ctx = contextoDe(c, await linhasDoAtendimento(bd, doc.id, c.atendimentoDesde), horario);
      const sobre = sobreOQue(ctx.linhas);
      const r: Rodada = { bd, ref: doc.ref, c, cfg, horario, texto: '', quando: agora.toISOString(), resposta: {} };

      /* resolveu e não respondeu ao "algo mais?": encerra, rápido, sem follow-up */
      if (acao === 'fecha_resolvido') {
        await fala(bd, doc.ref, c, { texto: comNome(cfg.fimReserva, c.nome || '', '', sobre), relogio: 'mantem' });
        await encerra(bd, doc.ref, 'cliente', 'Assunto resolvido, sem resposta ao "algo mais?". Atendimento encerrado.');
        feito.encerradas += 1;
        continue;
      }

      const momento: Momento = acao === 'followup' ? 'followup' : acao === 'encerra' ? 'encerramento' : 'despedida';
      const leitura: Leitura | null = await escreveMensagem(promptMensagem(cfg, momento, ctx));

      if (leitura?.situacao === 'aluno_esperando' || (acao === 'avalia_despedida' && leitura?.situacao === 'pendente')) {
        /* quem espera é o contato, ou ainda falta algo: nada sai, e o time ve o tempo de aguardo */
        await doc.ref.update({ relogioDesde: APAGA(), relogioMotivo: APAGA(), followUpEm: APAGA() });
        continue;
      }

      /* resolveu (a IA leu assim, ou o contato agradeceu e a IA está fora do ar):
         pergunta se precisa de mais alguma coisa, com os botões */
      if (acao === 'avalia_despedida' || leitura?.situacao === 'resolvida') {
        await doc.ref.update({ relogioMotivo: APAGA(), followUpEm: APAGA() });
        await perguntaAlgoMais(r, leitura?.mensagem || comNome(cfg.maisReserva, c.nome || '', '', sobre));
        continue;
      }

      if (acao === 'followup') {
        const texto = leitura?.mensagem || (c.etapa === 'menu' ? comNome(cfg.fuMenuReserva, c.nome || '') : reservaDe('followup', cfg, ctx));
        /* no menu, os botões vão de novo: é só tocar */
        const botoes = c.etapa === 'menu' ? { titulos: cfg.botoes.map((b) => b.texto), ids: cfg.botoes.map((_, i) => idDoBotao(i)) } : undefined;
        await fala(bd, doc.ref, c, { texto, botoes, relogio: 'mantem' });
        await doc.ref.update({ followUpEm: agora.toISOString() });
        feito.followups += 1;
        continue;
      }

      /* 30 minutos sem resposta: encerra com educação, dizendo do que se tratava */
      await fala(bd, doc.ref, c, { texto: leitura?.mensagem || reservaDe('encerramento', cfg, ctx), relogio: 'mantem' });
      await encerra(bd, doc.ref, 'silencio', 'Atendimento encerrado por falta de resposta.');
      feito.encerradas += 1;
    } catch (e) {
      console.error('[relogio]', doc.id, e);
    } finally {
      await doc.ref.update({ processandoEm: APAGA() }).catch(() => undefined);
    }
  }

  /* setor que recebeu e não respondeu: volta para a Recepção */
  const limiteVolta = new Date(agora.getTime() - cfg.voltaHoras * 3_600_000).toISOString();
  const paradas = await bd.collection('conversas').where('aguardandoSetorDesde', '<=', limiteVolta).limit(40).get();
  for (const doc of paradas.docs) {
    const c = doc.data() as Conversa;
    if (!deveVoltarParaRecepcao(c, cfg, agora)) continue;
    await doc.ref.update({ setor: 'recepcao', aguardandoSetorDesde: APAGA() });
    await recado(bd, doc.id, `Voltou para a Recepção: ${NOME_SETOR[c.setor]} não respondeu em ${cfg.voltaHoras} h.`);
    feito.voltaram += 1;
  }
  return feito;
}

/* ---------------- ações do time ---------------- */

/** Passa a conversa para um setor. Coordenação e Coordenação Kids recebem o aviso no
    celular pessoal, por modelo aprovado, com o botão que abre a conversa no sistema. */
export async function transfere(
  bd: Firestore, ref: DocumentReference, c: Conversa, setor: Setor, quemNome: string,
) {
  const agora = agoraIso();
  await ref.update({
    setor, estado: 'aguardando', agenteAtivo: false, aguardandoDesde: agora,
    etapa: 'gente', tentativasMenu: APAGA(),
    aguardandoSetorDesde: setor === 'recepcao' ? APAGA() : agora,
    relogioDesde: APAGA(), relogioMotivo: APAGA(), followUpEm: APAGA(),
  });
  await recado(bd, ref.id, `${quemNome} passou a conversa para ${NOME_SETOR[setor]}.`);
  /* o contato vê a troca pela figurinha do setor, sem mais uma mensagem para ler */
  if (setor !== c.setor) await mandaFigurinhaDoSetor(bd, ref, c, setor);

  const avisos: string[] = [];
  const cfg = await leConfig(bd);
  if ((setor === 'coordenacao' || setor === 'kids') && cfg.avisoLigado && temConfig()) {
    const ps = await bd.collection('perfis').where('ativo', '==', true).get();
    for (const d of ps.docs) {
      const p = d.data() as Perfil;
      const fone = (p.telefone || '').replace(/\D/g, '');
      if (!p.avisaNoWhats || !fone || !(p.setores || []).includes(setor)) continue;
      const r = await mandaTemplate(fone, cfg.avisoModelo, cfg.avisoIdioma,
        [primeiro(p.nome), NOME_SETOR[setor], c.nome || c.waId], ref.id);
      const linha = r.ok
        ? `Aviso enviado no WhatsApp de ${p.nome}.`
        : `O aviso para ${p.nome} não saiu: ${r.erro || 'a Meta recusou'}.`;
      avisos.push(linha);
      await recado(bd, ref.id, linha);
    }
  }
  return avisos;
}

/** O time encerra na mão. Com a chave ligada e a despedida marcada, sai antes um aviso
    claro de que o atendimento fechou, dizendo do que se tratou (IA, ou a reserva com o assunto). */
export async function encerraNaMao(bd: Firestore, ref: DocumentReference, c: Conversa, quemNome: string) {
  const cfg = await leConfig(bd);
  if (cfg.ligado && cfg.manualDespedida && temConfig() && janelaAberta(c)) {
    const ctx = contextoDe(c, await linhasDoAtendimento(bd, ref.id, c.atendimentoDesde), situacaoDoHorario(cfg, new Date()));
    /* quem encerra é gente: sai um aviso claro de que o atendimento fechou, dizendo do
       que se tratou e que é só chamar de novo */
    const { texto } = await textoDo('fechamento', cfg, ctx);
    await fala(bd, ref, c, { texto, relogio: 'mantem' });
  }
  await encerra(bd, ref, 'atendente', `${quemNome} encerrou o atendimento.`, quemNome);
}
