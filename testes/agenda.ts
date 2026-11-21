/* Prova da agenda: validação, conflitos, recorrência, "este e os próximos",
   permissões, indicadores, CSV, log e lembrete.
   Rodar:  node --experimental-strip-types testes/agenda.ts  */
import {
  atingidos, conflitosDe, contaComoAula, csv, deslocaHorario, diaLocal, diaPorExtenso, faltaPresenca,
  filtra, horaFalada, horaLocal, indicadores, lePayload, mediaDas, mudancas, notaValida, ocorrencias,
  payloadDoLembrete, permissoesDe, precisaLembrete, problemasDoRascunho, sobrepoe, textoSobre,
  type Agendamento, type Rascunho,
} from '../src/lib/dominio/agenda.ts';

let falhas = 0;
function igual<T>(nome: string, veio: T, esperado: T) {
  if (JSON.stringify(veio) !== JSON.stringify(esperado)) {
    falhas += 1;
    console.log(`  x ${nome}\n    esperado ${JSON.stringify(esperado)}, veio ${JSON.stringify(veio)}`);
  }
}
const iso = (s: string) => new Date(s).toISOString();

/* ---- tempo de Chapecó ---- */
igual('dia local de madrugada UTC é o dia anterior', diaLocal('2026-11-21T02:00:00Z'), '2026-11-20');
igual('hora local', horaLocal('2026-11-21T21:30:00Z'), '18:30');
igual('dia por extenso', diaPorExtenso('2026-11-26T21:30:00Z'), 'quinta-feira, 26/11');
igual('hora falada', [horaFalada('2026-11-26T21:30:00Z'), horaFalada('2026-11-26T12:00:00Z')], ['18h30', '9h']);

/* ---- validação ---- */
const base: Rascunho = {
  inicio: iso('2026-11-24T18:00:00-03:00'), fim: iso('2026-11-24T19:00:00-03:00'), status: 'agendado',
  professorId: 'p1', moduloId: 'm1', aulaId: 'a1', modalidade: 'presencial',
  alunos: [{ alunoId: 'x', nomeAluno: 'Ana', presenca: null }],
};
igual('rascunho bom', problemasDoRascunho(base), []);
igual('fim antes do início', problemasDoRascunho({ ...base, fim: base.inicio }), ['O fim precisa ser depois do início.']);
igual('sem professor nem aula', problemasDoRascunho({ ...base, professorId: '', aulaId: '' }), ['Escolha o professor.', 'Escolha a aula.']);
igual('realizado sem presença', problemasDoRascunho({ ...base, status: 'realizado' }),
  ['Para marcar como realizada, lance a presença de todos os alunos.']);
igual('realizado com presença', problemasDoRascunho({ ...base, status: 'realizado', alunos: [{ ...base.alunos[0], presenca: 'faltou' }] }), []);
igual('aluno repetido', problemasDoRascunho({ ...base, alunos: [base.alunos[0], base.alunos[0]] }), ['O mesmo aluno está duas vezes na aula.']);

/* ---- conflitos ---- */
const ag = (id: string, ini: string, fim: string, extra: Partial<Agendamento> = {}) => ({
  id, inicio: iso(ini), fim: iso(fim), status: 'agendado' as const, professorId: 'p1', alunoIds: ['x'],
  alunos: [{ id: 'x', nome: 'Ana Lima', presenca: null }], ...extra,
});
const outra = ag('e1', '2026-11-24T18:30:00-03:00', '2026-11-24T19:30:00-03:00');
const novo = { inicio: base.inicio, fim: base.fim, professorId: 'p1', alunoIds: ['x'] };
const c1 = conflitosDe(novo, [outra], []);
igual('mesmo professor e mesmo aluno', c1.map((c) => c.tipo), ['professor', 'aluno']);
igual('mensagem com nome do aluno', c1[1].mensagem, 'Ana Lima já está em outra aula em 24/11 às 18:30.');
igual('encostado não conflita', conflitosDe(novo, [ag('e2', '2026-11-24T19:00:00-03:00', '2026-11-24T20:00:00-03:00')], []), []);
igual('cancelada não ocupa', conflitosDe(novo, [{ ...outra, status: 'cancelado' as const }], []), []);
igual('a própria aula não conflita', conflitosDe({ ...novo, id: 'e1' }, [outra], []), []);
igual('outro professor e outro aluno', conflitosDe({ ...novo, professorId: 'p2', alunoIds: ['y'] }, [outra], []), []);
const feriado = { id: 'b1', tipo: 'feriado' as const, professorId: null, inicio: iso('2026-11-24T00:00:00-03:00'), fim: iso('2026-11-25T00:00:00-03:00'), motivo: 'Natal' };
igual('feriado da escola', conflitosDe(novo, [], [feriado]).map((c) => c.mensagem), ['24/11 às 18:00 cai em feriado (Natal) da escola.']);
igual('férias de outro professor não pega', conflitosDe(novo, [], [{ ...feriado, tipo: 'ferias', professorId: 'p2' }]), []);
igual('férias do professor pega', conflitosDe(novo, [], [{ ...feriado, tipo: 'ferias', professorId: 'p1' }]).length, 1);
igual('ignora o resto da série', conflitosDe(novo, [outra], [], {}, new Set(['e1'])), []);
igual('sobreposição', [sobrepoe(novo, outra), sobrepoe(novo, { inicio: base.fim, fim: iso('2026-11-24T20:00:00-03:00') })], [true, false]);

/* ---- recorrência ---- */
const ini = iso('2026-11-24T18:00:00-03:00'); /* terça */
const fim = iso('2026-11-24T19:30:00-03:00');
const sem = ocorrencias(ini, fim, { tipo: 'semanal', repeticoes: 4 });
igual('semanal 4 vezes', sem.map((o) => diaLocal(o.inicio)), ['2026-11-24', '2026-12-01', '2026-12-08', '2026-12-15']);
igual('mantém horário e duração', [horaLocal(sem[3].inicio), horaLocal(sem[3].fim)], ['18:00', '19:30']);
igual('semanal terça e quinta até data', ocorrencias(ini, fim, { tipo: 'semanal', diasDaSemana: [2, 4], ateData: '2026-12-03' }).map((o) => diaLocal(o.inicio)),
  ['2026-11-24', '2026-11-26', '2026-12-01', '2026-12-03']);
igual('diária 3 vezes', ocorrencias(ini, fim, { tipo: 'diaria', repeticoes: 3 }).map((o) => diaLocal(o.inicio)), ['2026-11-24', '2026-11-25', '2026-11-26']);
igual('mensal pula mês sem o dia', ocorrencias(iso('2027-01-31T10:00:00-03:00'), iso('2027-01-31T11:00:00-03:00'), { tipo: 'mensal', repeticoes: 3 })
  .map((o) => diaLocal(o.inicio)), ['2027-01-31', '2027-03-31', '2027-05-31']);
igual('sem repetição é uma só', ocorrencias(ini, fim, { tipo: 'semanal' }).length, 1);
igual('teto de ocorrências', ocorrencias(ini, fim, { tipo: 'diaria', repeticoes: 9999 }).length, 120);

/* ---- este e os próximos ---- */
const serie = sem.map((o, i) => ({ id: `s${i}`, inicio: o.inicio, recorrenciaId: 'r1' }));
const lista = [...serie, { id: 'avulsa', inicio: sem[2].inicio, recorrenciaId: null }];
igual('só este', atingidos(lista, serie[1], 'este').map((a) => a.id), ['s1']);
igual('este e os próximos', atingidos(lista, serie[1], 'proximos').map((a) => a.id), ['s1', 's2', 's3']);
igual('avulsa é sempre só ela', atingidos(lista, lista[4], 'proximos').map((a) => a.id), ['avulsa']);
const depois = { inicio: iso('2026-11-25T19:00:00-03:00'), fim: iso('2026-11-25T20:00:00-03:00') }; /* +1 dia, 1 h depois, 1 h de duração */
const desl = deslocaHorario(sem[2], sem[0], depois);
igual('desloca a série', [diaLocal(desl.inicio), horaLocal(desl.inicio), horaLocal(desl.fim)], ['2026-12-09', '19:00', '20:00']);

/* ---- permissões ---- */
const prof = permissoesDe('professor', true);
igual('professor da aula', [prof.criar, prof.excluir, prof.remarcar, prof.trocarAlunos, prof.editarStatus, prof.lancarPresenca], [false, false, false, false, true, true]);
igual('professor de outra aula', [permissoesDe('professor', false).editarStatus, permissoesDe('professor', false).lancarPresenca], [false, false]);
igual('recepção cuida de tudo', [permissoesDe('recepcao').criar, permissoesDe('recepcao').remarcar, permissoesDe('recepcao').forcarConflito], [true, true, false]);
igual('só admin força conflito', permissoesDe('admin').forcarConflito, true);

/* ---- leitura e relatório ---- */
const agora = new Date('2026-11-24T23:00:00-03:00');
const passada = { ...ag('p', '2026-11-24T18:00:00-03:00', '2026-11-24T19:00:00-03:00') };
igual('passou sem presença', faltaPresenca(passada, agora), true);
igual('passou com presença', faltaPresenca({ ...passada, alunos: [{ id: 'x', nome: 'A', presenca: 'presente' }] }, agora), false);
igual('cancelada não pede presença', faltaPresenca({ ...passada, status: 'cancelado' }, agora), false);
igual('não conta como aula', [contaComoAula('cancelado'), contaComoAula('remarcado'), contaComoAula('confirmado')], [false, false, true]);

const rel = [
  { ...passada, professorId: 'p1', status: 'realizado' as const, alunoIds: ['x', 'y'], alunos: [{ id: 'x', nome: 'A', presenca: 'presente' as const }, { id: 'y', nome: 'B', presenca: 'faltou' as const }] },
  { ...passada, professorId: 'p1', status: 'cancelado' as const },
  { ...passada, professorId: 'p2' },
];
const ind = indicadores(rel, agora);
igual('indicadores', [ind.total, ind.realizadas, ind.presentes, ind.faltas, ind.taxaPresenca, ind.cancelamentos, ind.pendentes],
  [2, 1, 1, 1, 0.5, 1, 1]);
igual('aulas por professor', ind.porProfessor, [{ professorId: 'p1', aulas: 1 }, { professorId: 'p2', aulas: 1 }]);

const comCampos = rel.map((r, i) => ({ ...r, moduloId: i ? 'm2' : 'm1', aulaId: 'a1', modalidade: 'presencial' as const }));
igual('filtro por professor e status', filtra(comCampos, { professorIds: ['p1'], status: ['realizado'] }).length, 1);
igual('filtro por falta do aluno', filtra(comCampos, { alunoIds: ['y'], presenca: 'faltou' }).length, 1);
igual('filtro sem presença', filtra(comCampos, { presenca: 'sem' }).length, 2);
igual('filtro por período', filtra(comCampos, { de: '2026-11-25' }).length, 0);

igual('média das notas', [mediaDas({ fala: 8, leitura: 7, escuta: null }), mediaDas({})], [7.5, null]);
igual('nota digitada', [notaValida('8,5'), notaValida('11'), notaValida(''), notaValida('x')], [8.5, null, null, null]);
igual('cor clara pede texto escuro', [textoSobre('#F6C28B'), textoSobre('#141414')], ['#141414', '#FFFFFF']);

/* ---- CSV e log ---- */
igual('csv com ponto e vírgula, aspas e BOM', csv(['a', 'b'], [['x;y', 'diz "oi"']]), '﻿a;b\r\n"x;y";"diz ""oi"""\r\n');
igual('o que mudou', mudancas({ status: 'agendado', aulaId: 'a1', atualizadoEm: '1' }, { status: 'realizado', aulaId: 'a1', atualizadoEm: '2' }), ['status']);
igual('criação mostra tudo', mudancas(null, { status: 'agendado' }), ['status']);

/* ---- lembrete ---- */
const amanha = { inicio: iso('2026-11-25T08:00:00-03:00'), status: 'agendado' as const, lembreteEnviadoEm: null };
igual('aula de amanhã precisa de lembrete', precisaLembrete(amanha, agora), true);
igual('já enviado não repete', precisaLembrete({ ...amanha, lembreteEnviadoEm: 'x' }, agora), false);
igual('confirmada não precisa', precisaLembrete({ ...amanha, status: 'confirmado' }, agora), false);
igual('depois de amanhã ainda não', precisaLembrete({ ...amanha, inicio: iso('2026-11-26T08:00:00-03:00') }, agora), false);
igual('payload vai e volta', lePayload(payloadDoLembrete('remarcar', 'ag1', 'al_2')), { acao: 'remarcar', agendamentoId: 'ag1', alunoId: 'al_2' });
igual('payload de outra coisa', lePayload('Confirmo'), null);

if (falhas) {
  console.log(`\n${falhas} falha(s).`);
  process.exit(1);
}
console.log('agenda: tudo certo.');
