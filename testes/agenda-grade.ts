/* Prova da Grade e da Semana enxuta da agenda (src/lib/dominio/agenda-grade.ts) e dos
   dias em que a escola abre (DIAS_FECHADOS em src/lib/dominio/agenda.ts).
   Nomes e ids inventados.
   Rodar:  node --experimental-strip-types testes/agenda-grade.ts  */
import {
  DIAS_FECHADOS, diaAberto, diaAbertoDesde, diasAbertosDaSemana, passaDia, textoSobre,
  type Agendamento, type Professor,
} from '../src/lib/dominio/agenda.ts';
import {
  alturaDoCartao, alturaPedida, alturasDasLinhas, arredonda, colunasDaGrade, compactaSemana, contaDoPeriodo, encaixa, GRADE_FIM, GRADE_INICIO,
  hhmm, ID_SEM_PROFESSOR, isoNoDia, mantemOrdem, LINHAS, MEDIDAS, minutoDoY, minutosNoDia, misturaCor, motivoCompleto, motivoCurto,
  nomeCurtoDaAula, nomesCurtosDosProfessores, nomesQueCabem, rotulosDasLinhas, tintaDoProfessor, topos, yDoMinuto,
  type ItemDaSemana,
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

/* ---------------- a régua ---------------- */
igual('28 linhas de 7h30 às 21h30', [LINHAS, rotulosDasLinhas()[0], rotulosDasLinhas()[LINHAS - 1]], [28, '07:30', '21:00']);
igual('minutos no dia de Chapecó', [minutosNoDia(em('2026-11-27', '18:30'), '2026-11-27'), hhmm(18 * 60 + 30)], [1110, '18:30']);
igual('ida e volta do minuto', isoNoDia('2026-11-27', 1110), em('2026-11-27', '18:30'));

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
], '2026-11-27');
igual('duas sobrepostas ficam lado a lado; a seguinte volta inteira',
  enc.map((e) => [e.id, e.faixa, e.faixas]), [['a', 0, 2], ['b', 1, 2], ['c', 0, 1]]);
const borda = encaixa([
  { id: 'cedo', inicio: em('2026-11-27', '07:00'), fim: em('2026-11-27', '08:00') },
  { id: 'tarde', inicio: em('2026-11-27', '21:00'), fim: em('2026-11-27', '22:00') },
], '2026-11-27');
igual('nada some: o que sai da grade aparece cortado na borda',
  borda.map((e) => [e.ini, e.fim, e.cortadoAntes, e.cortadoDepois]), [[GRADE_INICIO, 480, true, false], [1260, GRADE_FIM, false, true]]);

/* ---------------- a altura das linhas ---------------- */
igual('cartão de 1 hora com 3 alunos cabe na base', alturasDasLinhas([{ ini: 1110, fim: 1170, alunos: 3 }]).every((h) => h === MEDIDAS.base), true);
const altas = alturasDasLinhas([{ ini: 1110, fim: 1170, alunos: 7 }]);
const r = (1110 - GRADE_INICIO) / 30;
igual('7 alunos fazem as duas linhas crescerem, só elas', [altas[r] > MEDIDAS.base, altas[r + 1] > MEDIDAS.base, altas[r - 1], altas[r + 2]], [true, true, MEDIDAS.base, MEDIDAS.base]);
igual('e o cartão passa a ter a altura que pede', altas[r] + altas[r + 1] >= alturaPedida(7), true);
igual('com a altura que pediu, o cartão desenhado mostra todos os nomes', nomesQueCabem(alturaDoCartao(altas[r] + altas[r + 1]), 7), { nomes: 7, mais: 0 });
for (let n = 1; n <= 8; n += 1) {
  const h = alturasDasLinhas([{ ini: 1110, fim: 1170, alunos: n }]);
  igual(`1 hora com ${n} alunos mostra todos`, nomesQueCabem(alturaDoCartao(h[r] + h[r + 1]), n).mais, 0);
  const m = alturasDasLinhas([{ ini: 1110, fim: 1140, alunos: n }]);
  igual(`meia hora com ${n} alunos mostra todos`, nomesQueCabem(alturaDoCartao(m[r]), n).mais, 0);
}
igual('aula enorme mostra 7 e o +N', nomesQueCabem(alturaDoCartao(alturaPedida(20)), 20), { nomes: 7, mais: 13 });
igual('cartão pequeno: um nome e o +N', nomesQueCabem(MEDIDAS.base, 3), { nomes: 0, mais: 3 });
const t = topos(altas);
igual('px e minuto vão e voltam', [Math.round(minutoDoY(yDoMinuto(1125, altas, t), altas, t)), arredonda(1127), arredonda(1133)], [1125, 1125, 1140]);
igual('o px fora da grade fica na borda', [minutoDoY(-20, altas), minutoDoY(99999, altas)], [GRADE_INICIO, GRADE_FIM]);

/* ---------------- a Semana enxuta ---------------- */
const item = (id: string, ini: string, fim: string, prioridade = 0, d = '2026-11-27'): ItemDaSemana => ({ id, inicio: em(d, ini), fim: em(d, fim), prioridade });
const oito = Array.from({ length: 8 }, (_, i) => item(`s${i}`, '18:30', '19:30'));
const c8 = compactaSemana(oito);
igual('8 no mesmo horário: 3 e um +5 às 18:30', [c8.visiveis.size, c8.mais.length, c8.mais[0]?.hora, c8.mais[0]?.ocultos.length], [3, 1, '18:30', 5]);
igual('o +N é de meia hora, no próprio dia', [c8.mais[0]?.inicio, c8.mais[0]?.fim, c8.mais[0]?.dia], [em('2026-11-27', '18:30'), em('2026-11-27', '19:00'), '2026-11-27']);
const c4 = compactaSemana(oito.slice(0, 4));
igual('4 no mesmo horário aparecem todos', [c4.visiveis.size, c4.mais.length], [4, 0]);
const c5 = compactaSemana(oito.slice(0, 5));
igual('5 viram 3 e +2', [c5.visiveis.size, c5.mais[0]?.ocultos.length], [3, 2]);
const comCancelada = compactaSemana([item('cancelada', '18:30', '19:30', 1), ...oito.slice(0, 4)]);
igual('a cancelada é a primeira a ir para o +N', [comCancelada.visiveis.has('cancelada'), comCancelada.mais[0]?.ocultos.includes('cancelada')], [false, true]);
const escada = compactaSemana([...oito.slice(0, 4), item('t1', '19:00', '20:00'), item('t2', '19:00', '20:00')]);
igual('nenhum horário passa de 4 colunas', (() => {
  const todos = [...oito.slice(0, 4), item('t1', '19:00', '20:00'), item('t2', '19:00', '20:00')];
  let pior = 0;
  for (let m = 0; m < 1440; m += 30) {
    const at = new Date(em('2026-11-27', '00:00')).getTime() + m * 60_000;
    const vis = todos.filter((i) => escada.visiveis.has(i.id) && new Date(i.inicio).getTime() <= at && at < new Date(i.fim).getTime()).length;
    const mais = escada.mais.filter((x) => new Date(x.inicio).getTime() <= at && at < new Date(x.fim).getTime()).length;
    pior = Math.max(pior, vis + mais);
  }
  return pior <= 4;
})(), true);
const doisDias = compactaSemana([...oito, ...Array.from({ length: 2 }, (_, i) => item(`q${i}`, '18:30', '19:30', 0, '2026-11-26'))]);
igual('cada dia conta o seu', [doisDias.visiveis.has('q0'), doisDias.visiveis.has('q1'), doisDias.mais.length], [true, true, 1]);

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

/* ---------------- a tinta ---------------- */
igual('mistura de cor', [misturaCor('#000000', '#FFFFFF', 0.5), misturaCor('#8CFF00', '#FFFFFF', 0)], ['#808080', '#FFFFFF']);
const neon = tintaDoProfessor('#8cff00');
igual('neon entra suave no fundo claro, com texto escuro', [neon.fundoClaro, neon.textoClaro], [misturaCor('#8cff00', '#FFFFFF', 0.16), '#141414']);
igual('no escuro, o fundo suave pede texto claro', tintaDoProfessor('#faa0eb').textoEscuro, '#FFFFFF');
igual('texto sempre pelo textoSobre', [neon.sobreACheia, tintaDoProfessor('#2E67B1').sobreACheia], [textoSobre('#8cff00'), textoSobre('#2E67B1')]);
igual('cor inválida vira cinza', tintaDoProfessor('verde').cheia, '#8E8E88');
/* o texto em cima do fundo suave tem contraste de leitura (4,5:1) nos dois temas */
const lum = (c: string) => {
  const v = [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16) / 255).map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
  return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
};
const contraste = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const CORES = ['#8cff00', '#faa0eb', '#F6C28B', '#9FD3A8', '#A9C6EC', '#E7B3D8', '#F2DD8A', '#B9A7E8', '#8FD6D1', '#F4A9A0', '#2E67B1', '#141414', '#FFFFFF', '#FF0000', '#00FFFF', '#FFFF00'];
igual('contraste de 4,5:1 no fundo suave, claro e escuro', CORES.filter((c) => {
  const x = tintaDoProfessor(c);
  return contraste(x.fundoClaro, x.textoClaro) < 4.5 || contraste(x.fundoEscuro, x.textoEscuro) < 4.5;
}), []);

if (falhas) {
  console.log(`agenda (grade): ${falhas} falha(s)`);
  process.exit(1);
}
console.log('agenda (grade): tudo certo');
