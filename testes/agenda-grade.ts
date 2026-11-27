/* Prova da Grade e da Semana da agenda (src/lib/dominio/agenda-grade.ts) e dos
   dias em que a escola abre (DIAS_FECHADOS em src/lib/dominio/agenda.ts).
   Nomes e ids inventados.
   Rodar:  node --experimental-strip-types testes/agenda-grade.ts  */
import {
  DIAS_FECHADOS, diaAberto, diaAbertoDesde, diasAbertosDaSemana, passaDia, textoSobre,
  type Agendamento, type Bloqueio, type Professor,
} from '../src/lib/dominio/agenda.ts';
import {
  alturaDoCartao, alturaPedida, alturasDasLinhas, arredonda, bloqueiosDaSemana, chaveDaCelula, colunasDaGrade, contaDoPeriodo, continuacoes, encaixa,
  FAIXAS_DIA_UTIL, FAIXAS_SABADO, faixaDe, faixasCom, faixasDoDia, GRADE_FIM, GRADE_INICIO,
  encaixaSemana, hhmm, horarioDe, ID_SEM_PROFESSOR, larguraDoDia, largurasQueCabem, proximaFaixa, tamanhoDoBloco, isoNoDia, mantemOrdem, montaSemana, MEDIDAS, minutoDoY, minutosNoDia, misturaCor, motivoCompleto, motivoCurto, SEMANA_ELLO,
  nomeCurtoDaAula, nomesCurtosDosProfessores, nomesQueCabem, rotulosDasLinhas, tintaDoProfessor, topos, yDoMinuto,
} from '../src/lib/dominio/agenda-grade.ts';

let falhas = 0;
function igual<T>(nome: string, veio: T, esperado: T) {
  if (JSON.stringify(veio) !== JSON.stringify(esperado)) {
    falhas += 1;
    console.log(`  x ${nome}\n    esperado ${JSON.stringify(esperado)}\n    veio     ${JSON.stringify(veio)}`);
  }
}
const em = (dia: string, hora: string) => new Date(`${dia}T${hora}:00-03:00`).toISOString();

/* ---------------- domingo fora ---------------- */
igual('domingo é o dia fechado', DIAS_FECHADOS, [0]);
igual('dias abertos', ['2026-11-22', '2026-11-23', '2026-11-28'].map((d) => diaAberto(d)), [false, true, true]);
igual('sábado para frente vai para segunda', passaDia('2026-11-28', 1), '2026-11-30');
igual('segunda para trás volta para sábado', passaDia('2026-11-30', -1), '2026-11-28');
igual('dia comum anda um', [passaDia('2026-11-24', 1), passaDia('2026-11-24', -1)], ['2026-11-25', '2026-11-23']);
igual('hoje num domingo leva para a segunda seguinte', diaAbertoDesde('2026-11-29'), '2026-11-30');
igual('link num domingo cai na segunda', diaAbertoDesde('2026-11-22'), '2026-11-23');
igual('dia aberto fica onde está', diaAbertoDesde('2026-11-25'), '2026-11-25');
igual('a semana de seg a sáb', diasAbertosDaSemana('2026-11-25'), ['2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26', '2026-11-27', '2026-11-28']);
igual('a semana de um domingo é a que começa nele', diasAbertosDaSemana('2026-11-29')[0], '2026-11-30');
igual('se um dia abrir no domingo, é só a constante', [passaDia('2026-11-28', 1, []), diasAbertosDaSemana('2026-11-25', []).length], ['2026-11-29', 7]);

/* ---------------- a régua: as faixas da escola (26/11/2026) ---------------- */
const U = FAIXAS_DIA_UTIL;
igual('dia útil: 8h ao meio-dia em hora cheia, o almoço e 13h30 às 21h30 em hora quebrada', rotulosDasLinhas(U),
  ['08:00', '09:00', '10:00', '11:00', '12:00', '13:30', '14:30', '15:30', '16:30', '17:30', '18:30', '19:30', '20:30']);
igual('o almoço vai do meio-dia às 13h30 e a última faixa acaba às 21h30', [hhmm(U[4].fim), hhmm(U[U.length - 1].fim), hhmm(GRADE_INICIO), hhmm(GRADE_FIM)], ['13:30', '21:30', '08:00', '21:30']);
igual('as faixas não têm buraco', U.every((f, i) => i === 0 || f.ini === U[i - 1].fim), true);
igual('sábado em hora cheia', [rotulosDasLinhas(FAIXAS_SABADO), faixasDoDia(6) === FAIXAS_SABADO, faixasDoDia(3) === U], [['08:00', '09:00', '10:00', '11:00'], true, true]);
igual('aula às 7h abre a faixa das 7h; às 22h, a das 21h30', [rotulosDasLinhas(faixasCom(U, [7 * 60]))[0], rotulosDasLinhas(faixasCom(U, [22 * 60 + 15])).slice(-1)[0]], ['07:00', '21:30']);
igual('sábado com aula às 14h abre de hora em hora', rotulosDasLinhas(faixasCom(FAIXAS_SABADO, [14 * 60, 15 * 60])), ['08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00']);
igual('a faixa de um minuto', [18 * 60 + 30, 19 * 60, 12 * 60 + 45, 5 * 60, 23 * 60].map((m) => hhmm(U[faixaDe(U, m)].ini)), ['18:30', '18:30', '12:00', '08:00', '20:30']);
igual('a aula nova do botão cai no começo da próxima faixa', [9 * 60 + 10, 14 * 60 + 10, 12 * 60 + 5, 21 * 60].map((m) => { const x = proximaFaixa(U, m); return x === null ? null : hhmm(x); }), ['10:00', '14:30', '13:30', null]);
igual('minutos no dia de Chapecó', [minutosNoDia(em('2026-11-27', '18:30'), '2026-11-27'), hhmm(18 * 60 + 30)], [1110, '18:30']);
igual('ida e volta do minuto', isoNoDia('2026-11-27', 1110), em('2026-11-27', '18:30'));
igual('aula de mais de uma hora continua na faixa seguinte (B2 das 18h30 às 20h)',
  [continuacoes(1110, 1200, U).map((r) => hhmm(U[r].ini)), continuacoes(1110, 1230, U).map((r) => hhmm(U[r].ini))], [['19:30'], ['19:30']]);
igual('duas horas ocupam duas faixas; de manhã também', [continuacoes(1110, 1230 + 0, U).length, continuacoes(8 * 60, 10 * 60, U).map((r) => hhmm(U[r].ini))], [1, ['09:00']]);
igual('aula de 1 hora não continua, nem fora do encaixe; 15 minutos na seguinte não conta',
  [continuacoes(1110, 1170, U), continuacoes(14 * 60, 15 * 60, U), continuacoes(13 * 60 + 30, 14 * 60 + 45, U)], [[], [], []]);

/* ---------------- as colunas ---------------- */
const prof = (id: string, nome: string, cor = '#A9C6EC'): Professor => ({ id, nome, cor, ativo: true });
const PROFS = [prof('p1', 'Helena Souza'), prof('p2', 'Bruno Lima'), prof('p3', 'Ana Paula'), prof('p4', 'Ana Beatriz Costa'), prof('px', 'A DEFINIR')];
const aula = (id: string, professorId: string, ini: string, fim: string, alunos = 2, status: Agendamento['status'] = 'agendado', dia = '2026-11-27'): Agendamento => ({
  id, inicio: em(dia, ini), fim: em(dia, fim), status, professorId, moduloId: 'm', aulaId: 'a', modalidade: 'presencial',
  recorrenciaId: null, lembreteEnviadoEm: null,
  alunoIds: Array.from({ length: alunos }, (_, i) => `${id}-al${i}`), alunos: Array.from({ length: alunos }, (_, i) => ({ id: `${id}-al${i}`, nome: `Aluno ${i}`, presenca: null })),
  criadoPor: '', criadoEm: '', atualizadoPor: '', atualizadoEm: '',
});
igual('nomes curtos, com inicial quando o primeiro nome repete',
  nomesCurtosDosProfessores(['Helena Souza', 'Ana Paula', 'Ana Beatriz Costa', 'Bruno']), ['Helena', 'Ana P.', 'Ana C.', 'Bruno']);
const dia = [aula('x1', 'p2', '18:30', '19:30'), aula('x2', 'p2', '19:30', '20:30'), aula('x3', 'p1', '18:30', '19:30'), aula('x4', 'sumiu', '08:00', '09:00')];
const cols = colunasDaGrade(PROFS, dia);
igual('A definir primeiro, depois quem tem mais aula, empate pelo nome',
  cols.map((c) => `${c.curto}:${c.aulas}`), ['A definir:1', 'Bruno:2', 'Helena:1', 'Ana C.:0', 'Ana P.:0']);
igual('aula de professor fora da equipe vai para A definir', cols[0].id, 'px');
const semFila = colunasDaGrade(PROFS.filter((p) => p.id !== 'px'), dia);
igual('sem professor A definir na equipe, nasce a coluna da fila', [semFila[0].id, semFila[0].curto, semFila[0].aulas], [ID_SEM_PROFESSOR, 'A definir', 1]);
igual('a coluna da fila não aparece vazia', colunasDaGrade(PROFS.filter((p) => p.id !== 'px'), dia.slice(0, 3)).some((c) => c.aDefinir), false);
const depois = colunasDaGrade(PROFS, [...dia, aula('x5', 'p1', '20:30', '21:30'), aula('x6', 'p1', '07:30', '08:30')]);
igual('a ordem parada não deixa a coluna pular depois de arrastar',
  mantemOrdem(depois, cols.map((c) => c.id)).map((c) => c.id), cols.map((c) => c.id));
igual('quem entra depois vai para o fim', mantemOrdem(cols, ['p1', 'p2']).map((c) => c.id), ['px', 'p1', 'p2', 'p4', 'p3']);
igual('o filtro de professor escolhe as colunas', colunasDaGrade(PROFS, dia, ['p1']).map((c) => c.id), ['p1']);

/* ---------------- o encaixe ---------------- */
const enc = encaixa([
  { id: 'a', inicio: em('2026-11-27', '18:30'), fim: em('2026-11-27', '19:30') },
  { id: 'b', inicio: em('2026-11-27', '19:00'), fim: em('2026-11-27', '20:00') },
  { id: 'c', inicio: em('2026-11-27', '20:00'), fim: em('2026-11-27', '21:00') },
], '2026-11-27', U);
igual('duas sobrepostas ficam lado a lado; a seguinte volta inteira',
  enc.map((e) => [e.id, e.faixa, e.faixas]), [['a', 0, 2], ['b', 1, 2], ['c', 0, 1]]);
const borda = encaixa([
  { id: 'cedo', inicio: em('2026-11-27', '07:30'), fim: em('2026-11-27', '08:30') },
  { id: 'tarde', inicio: em('2026-11-27', '21:00'), fim: em('2026-11-27', '22:00') },
], '2026-11-27', U);
igual('nada some: o que sai da régua aparece cortado na borda',
  borda.map((e) => [e.ini, e.fim, e.cortadoAntes, e.cortadoDepois]), [[GRADE_INICIO, 510, true, false], [1260, GRADE_FIM, false, true]]);

/* ---------------- a altura das linhas (uma por faixa) ---------------- */
const r = faixaDe(U, 18 * 60 + 30);
igual('aula de 1 hora com 3 alunos cabe na base', alturasDasLinhas([{ ini: 1110, fim: 1170, alunos: 3 }], U).every((h) => h === MEDIDAS.base), true);
const altas = alturasDasLinhas([{ ini: 1110, fim: 1170, alunos: 7 }], U);
igual('7 alunos fazem só a faixa das 18h30 crescer', [altas[r] > MEDIDAS.base, altas[r - 1], altas[r + 1]], [true, MEDIDAS.base, MEDIDAS.base]);
igual('e o cartão desenhado mostra todos os nomes', nomesQueCabem(alturaDoCartao(altas[r]), 7), { nomes: 7, mais: 0 });
for (let n = 1; n <= 8; n += 1) {
  const h = alturasDasLinhas([{ ini: 1110, fim: 1170, alunos: n }], U);
  igual(`1 hora com ${n} alunos mostra todos`, nomesQueCabem(alturaDoCartao(h[r]), n).mais, 0);
  const m = alturasDasLinhas([{ ini: 1140, fim: 1200, alunos: n }], U);
  const yy = topos(m);
  igual(`aula das 19:00 (no meio de duas faixas) com ${n} alunos mostra todos`, nomesQueCabem(alturaDoCartao(yDoMinuto(1200, U, m, yy) - yDoMinuto(1140, U, m, yy)), n).mais, 0);
  const meia = alturasDasLinhas([{ ini: 1110, fim: 1140, alunos: n }], U);
  igual(`meia hora com ${n} alunos mostra todos`, nomesQueCabem(alturaDoCartao(meia[r] / 2), n).mais, 0);
  const longa = alturasDasLinhas([{ ini: 1110, fim: 1230, alunos: n }], U);
  const ly = topos(longa);
  igual(`aula de 2 horas com ${n} alunos ocupa as duas faixas`, [yDoMinuto(1110, U, longa, ly) === ly[r], yDoMinuto(1230, U, longa, ly) === ly[r + 2]], [true, true]);
}
igual('aula enorme mostra 7 e o +N', nomesQueCabem(alturaDoCartao(alturaPedida(20)), 20), { nomes: 7, mais: 13 });
igual('cartão pequeno: um nome e o +N', nomesQueCabem(30, 3), { nomes: 0, mais: 3 });
const t = topos(altas);
igual('px e minuto vão e voltam, também no almoço de 90 minutos',
  [Math.round(minutoDoY(yDoMinuto(1125, U, altas, t), U, altas, t)), Math.round(minutoDoY(yDoMinuto(765, U, altas, t), U, altas, t)), arredonda(1127), arredonda(1133)], [1125, 765, 1125, 1140]);
igual('o px fora da grade fica na borda', [minutoDoY(-20, U, altas), minutoDoY(99999, U, altas)], [GRADE_INICIO, GRADE_FIM]);
igual('a faixa das 13h30 começa no topo da linha dela', yDoMinuto(13 * 60 + 30, U, altas, t), t[faixaDe(U, 13 * 60 + 30)]);

/* ---------------- a Semana: as faixas, todas as aulas ---------------- */
const SEMANA_DIAS = diasAbertosDaSemana('2026-11-25');
const k = (dia: string, hora: string) => chaveDaCelula(dia, Number(hora.slice(0, 2)) * 60 + Number(hora.slice(3, 5)));
const oito = Array.from({ length: 8 }, (_, i) => aula(`s${i}`, `p${(i % 4) + 1}`, '18:30', '19:30'));
const sem = montaSemana([...oito, aula('cedo', 'p1', '18:30', '19:30'), aula('meio', 'p1', '19:00', '20:00'), aula('qui', 'p1', '08:00', '09:00', 1, 'agendado', '2026-11-26')], SEMANA_DIAS,
  (a, b) => a.professorId.localeCompare(b.professorId));
const sexta = sem.celulas.get(k('2026-11-27', '18:30')) || [];
igual('sexta às 18h30: as 10 aulas, nenhuma escondida', sexta.length, 10);
igual('no mesmo horário pelo professor; a das 19:00 por último', [sexta.slice(0, 3).map((x) => x.a.professorId), sexta[sexta.length - 1].a.id], [['p1', 'p1', 'p1'], 'meio']);
igual('a das 19:00 fica na faixa das 18h30 e não continua (1 hora)', [sem.celulas.has(k('2026-11-27', '19:30'))], [false]);
igual('contagem por dia', [sem.porDia.get('2026-11-27'), sem.porDia.get('2026-11-26'), sem.porDia.get('2026-11-23')], [10, 1, 0]);
igual('as linhas de sempre: as faixas do dia útil', [hhmm(sem.faixas[0].ini), hhmm(sem.faixas[sem.faixas.length - 1].ini), sem.faixas.length], ['08:00', '20:30', 13]);
igual('a célula mais cheia de cada faixa', [sem.maisCheia.get(18 * 60 + 30), sem.maisCheia.get(8 * 60), sem.maisCheia.has(12 * 60)], [10, 1, false]);
const b2 = montaSemana([aula('b2', 'p1', '18:30', '20:00'), aula('dois', 'p2', '18:30', '20:30'), aula('outra', 'p3', '19:30', '20:30')], SEMANA_DIAS);
const as1930 = b2.celulas.get(k('2026-11-27', '19:30')) || [];
igual('B2 das 18h30 às 20h e a de 2 horas aparecem também às 19h30, como continuação, antes das que começam ali',
  as1930.map((x) => [x.a.id, x.continua]), [['b2', true], ['dois', true], ['outra', false]]);
igual('a aula longa conta uma vez no dia', b2.porDia.get('2026-11-27'), 3);
const fora = montaSemana([aula('tarde', 'p1', '22:00', '23:00'), aula('dom', 'p1', '10:00', '11:00', 1, 'agendado', '2026-11-29'), aula('sab', 'p1', '14:00', '15:00', 1, 'agendado', '2026-11-28')], SEMANA_DIAS);
igual('aula depois das 21h30 abre a linha dela; domingo não entra; sábado à tarde cai na faixa dela',
  [rotulosDasLinhas(fora.faixas).slice(-2), fora.porDia.get('2026-11-27'), fora.celulas.has(k('2026-11-28', '13:30'))], [['21:30', '22:30'], 1, true]);
igual('montar a semana não perde aula', montaSemana(oito, SEMANA_DIAS).celulas.get(k('2026-11-27', '18:30'))?.length, 8);

const bl = (id: string, professorId: string | null, dia: string, ini: string, fim: string, tipo: Bloqueio['tipo'] = 'reuniao'): Bloqueio =>
  ({ id, tipo, professorId, inicio: em(dia, ini), fim: em(dia, fim), motivo: '' });
const nas = bloqueiosDaSemana([
  bl('reu', 'p1', '2026-11-23', '09:00', '10:00'),
  bl('feriado', null, '2026-11-28', '10:00', '12:00', 'feriado'),
  bl('tarde', null, '2026-11-25', '14:00', '16:00', 'reuniao'),
], SEMANA_DIAS, sem.faixas);
igual('reunião do professor: um item só, na célula das 9h', [nas.get(k('2026-11-23', '09:00'))?.rotulos.map((b) => b.id), nas.get(k('2026-11-23', '10:00'))], [['reu'], undefined]);
igual('o da escola pinta as faixas que cobre e tem o nome na primeira',
  [nas.get(k('2026-11-28', '10:00'))?.rotulos.length, nas.get(k('2026-11-28', '10:00'))?.daEscola.length, nas.get(k('2026-11-28', '11:00'))?.rotulos.length, nas.get(k('2026-11-28', '11:00'))?.daEscola.length, nas.has(k('2026-11-28', '12:00'))],
  [1, 1, 0, 1, false]);
igual('à tarde, o bloqueio das 14h às 16h pega as faixas das 13h30, 14h30 e 15h30',
  ['13:30', '14:30', '15:30', '16:30'].map((h) => nas.get(k('2026-11-25', h))?.daEscola.length || 0), [1, 1, 1, 0]);
const ferias = bloqueiosDaSemana([{ ...bl('ferias', 'p2', '2026-11-24', '00:00', '00:00', 'ferias'), fim: em('2026-11-26', '00:00') }], SEMANA_DIAS, sem.faixas);
igual('bloqueio de vários dias aparece em cada dia, na primeira faixa', [ferias.get(k('2026-11-24', '08:00'))?.rotulos.length, ferias.get(k('2026-11-25', '08:00'))?.rotulos.length, ferias.has(k('2026-11-26', '08:00'))], [1, 1, false]);
igual('horário do item', horarioDe(oito[0], '2026-11-27'), '18:30 às 19:30');

/* ---------------- o que se lê ---------------- */
igual('contador conta alunos diferentes', contaDoPeriodo([aula('k1', 'p1', '08:00', '09:00', 2), { ...aula('k2', 'p1', '09:00', '10:00', 1), alunoIds: ['k1-al0'] }]).texto, '2 aulas · 2 alunos');
igual('contador no singular', contaDoPeriodo([aula('k3', 'p1', '08:00', '09:00', 1)]).texto, '1 aula · 1 aluno');
igual('contador vazio', contaDoPeriodo([]).texto, '0 aulas · 0 alunos');
igual('nome curto da aula', [nomeCurtoDaAula('A2 - L11'), nomeCurtoDaAula('Kids 1 | L03'), nomeCurtoDaAula('Pré-teen  B1')], ['A2 L11', 'Kids 1 L03', 'Pré-teen B1']);
igual('motivo curto do bloqueio', [
  motivoCurto({ tipo: 'reuniao', motivo: '' }),
  motivoCurto({ tipo: 'indisponivel', motivo: 'NÃO ABRIR - PILATES' }),
  motivoCurto({ tipo: 'indisponivel', motivo: 'Não abrir: Pilates' }),
  motivoCurto({ tipo: 'reuniao', motivo: 'REUNIÃO' }),
  motivoCurto({ tipo: 'reuniao', motivo: 'Reunião pedagógica' }),
], ['Reunião', 'Não abrir: Pilates', 'Não abrir: Pilates', 'Reunião', 'Reunião pedagógica']);
igual('motivo completo para o passar o mouse', [motivoCompleto({ tipo: 'indisponivel', motivo: 'Consulta médica' }), motivoCompleto({ tipo: 'reuniao', motivo: 'Reunião geral' })],
  ['Indisponível: Consulta médica', 'Reunião geral']);

igual('nome entre parênteses vira a inicial certa', nomesCurtosDosProfessores(['Karina (Junior)', 'Karina Ribas Manduca', 'Nathan Luvisetto']), ['Karina J.', 'Karina M.', 'Nathan']);

/* ---------------- a Semana do jeito do ELLO (26/11/2026) ---------------- */
const elloItens = [aula('b2', 'p1', '18:30', '20:00'), aula('a1', 'p2', '18:30', '19:30'), aula('a2', 'p3', '19:30', '20:30'), aula('cedo', 'p1', '08:00', '09:00', 1, 'agendado', '2026-11-24')];
const ello = encaixaSemana(elloItens, SEMANA_DIAS, FAIXAS_DIA_UTIL);
const sextaE = ello.get('2026-11-27') || [];
const deE = (id: string) => sextaE.find((e) => e.id === id);
igual('cada dia tem o encaixe dele, e o dia sem aula fica vazio', [sextaE.length, ello.get('2026-11-24')?.length, ello.get('2026-11-23')?.length], [3, 1, 0]);
igual('o B2 desce até as 20h: pega a faixa das 18h30 e metade da das 19h30', [deE('b2')?.ini, deE('b2')?.fim], [1110, 1200]);
igual('quem se sobrepõe fica lado a lado, na mesma linha de três', [deE('b2')?.faixa, deE('a1')?.faixa, deE('a2')?.faixa, deE('b2')?.faixas], [0, 1, 1, 2]);
igual('o B2 ocupa na tela a altura de uma faixa e meia',
  yDoMinuto(1200, U, U.map(() => SEMANA_ELLO.alturaDaFaixa)) - yDoMinuto(1110, U, U.map(() => SEMANA_ELLO.alturaDaFaixa)), SEMANA_ELLO.alturaDaFaixa * 1.5);
igual('o dia cresce para caber os blocos lado a lado; dia calmo fica no mínimo',
  [larguraDoDia(sextaE), larguraDoDia([]), larguraDoDia(encaixaSemana(oito, SEMANA_DIAS, U).get('2026-11-27') || [])],
  [SEMANA_ELLO.larguraMinima, SEMANA_ELLO.larguraMinima, 8 * SEMANA_ELLO.larguraPorBloco]);
igual('aula de domingo não entra (o dia não está aberto) e nada se perde',
  [...encaixaSemana([...oito, aula('dom', 'p1', '10:00', '11:00', 1, 'agendado', '2026-11-29')], SEMANA_DIAS, U).values()].flat().length, 8);

/* a semana inteira na tela (27/11/2026: "só consigo ver de segunda a quinta") */
const naturais = [180, 496, 248, 180, 434, 180];
const cabe = largurasQueCabem(naturais, 1150);
igual('em tela menor, a semana inteira cabe: a soma não passa do espaço', cabe.reduce((s, x) => s + x, 0) <= 1150, true);
igual('o dia mais cheio continua o mais largo, e a ordem dos tamanhos não muda', [cabe.indexOf(Math.max(...cabe)), cabe[1] > cabe[4] && cabe[4] > cabe[2] && cabe[2] > cabe[0]], [1, true]);
igual('sobrando espaço, ficam como estão (a tela estica)', largurasQueCabem(naturais, 4000), naturais);
igual('sem medida da tela ainda, ficam como estão', largurasQueCabem(naturais, 0), naturais);
for (const tela of [1280, 1366, 1440, 1920]) {
  const disponivel = tela - 88 - 16 - 56;   // menu recolhido, margens e a coluna das horas
  const l = largurasQueCabem(naturais, disponivel);
  igual(`tela de ${tela}px: segunda a sábado cabem`, l.length === 6 && l.reduce((s, x) => s + x, 0) <= disponivel, true);
}
igual('bloco inteiro, fino ou mínimo pela largura que sobrou', [tamanhoDoBloco(120), tamanhoDoBloco(64), tamanhoDoBloco(50), tamanhoDoBloco(39), tamanhoDoBloco(20)],
  ['inteiro', 'inteiro', 'fino', 'minimo', 'minimo']);

/* ---------------- a tinta: a cor cheia, como no ELLO (26/11/2026) ---------------- */
igual('mistura de cor', [misturaCor('#000000', '#FFFFFF', 0.5), misturaCor('#8CFF00', '#FFFFFF', 0)], ['#808080', '#FFFFFF']);
const natan = tintaDoProfessor('#1F3D2B');
const bruna = tintaDoProfessor('#8CD866');
igual('o bloco é a cor cheia nos dois temas', [natan.fundoClaro, natan.fundoEscuro, bruna.fundoClaro], ['#1F3D2B', '#1F3D2B', '#8CD866']);
igual('branco no verde escuro, preto no verde claro', [natan.textoClaro, natan.textoEscuro, bruna.textoClaro], ['#FFFFFF', '#FFFFFF', '#141414']);
igual('texto sempre pelo textoSobre', [natan.sobreACheia, tintaDoProfessor('#2E67B1').sobreACheia], [textoSobre('#1F3D2B'), textoSobre('#2E67B1')]);
igual('cor inválida vira cinza', tintaDoProfessor('verde').cheia, '#8E8E88');
/* o texto em cima da cor cheia tem contraste de leitura (4,5:1), qualquer que seja a cor */
const lum = (c: string) => {
  const v = [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16) / 255).map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
  return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
};
const contraste = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const CORES = ['#8cff00', '#faa0eb', '#F6C28B', '#9FD3A8', '#A9C6EC', '#E7B3D8', '#F2DD8A', '#B9A7E8', '#8FD6D1', '#F4A9A0', '#2E67B1', '#141414', '#FFFFFF', '#FF0000', '#00FFFF', '#FFFF00',
  '#1F3D2B', '#8CD866', '#2D5C9E', '#E79BE3', '#F08A3E', '#8E5BC6', '#2F9C8B', '#F2D33C', '#A8707A', '#808080'];
igual('contraste de 4,5:1 em cima da cor cheia', CORES.filter((c) => contraste(tintaDoProfessor(c).cheia, tintaDoProfessor(c).sobreACheia) < 4.5), []);

if (falhas) {
  console.log(`agenda (grade): ${falhas} falha(s)`);
  process.exit(1);
}
console.log('agenda (grade): tudo certo');
