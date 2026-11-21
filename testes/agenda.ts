/* Prova da agenda: validação, conflitos, recorrência, "este e os próximos",
   permissões, indicadores, CSV, log e lembrete.
   Rodar:  node --experimental-strip-types testes/agenda.ts  */
import {
  atingidos, conflitosDe, contaComoAula, csv, deslocaHorario, diaLocal, diaPorExtenso, faltaPresenca,
  filtra, horaFalada, horaLocal, indicadores, lePayload, mediaDas, mudancas, notaValida, ocorrencias,
  payloadDoLembrete, permissoesDe, precisaLembrete, problemasDoRascunho, proximasAulas, quandoFalado,
  respostaDasAulas, sobrepoe, sugereAula, textoDoAviso, textoSobre, ultimasAulas, modeloDoAviso,
  ID_FALAR_COM_RECEPCAO, type Agendamento, type AulaDoCurriculo, type Rascunho,
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

/* ---- a agenda dentro da conversa ---- */
const ja = new Date('2026-11-24T12:00:00-03:00');
const aulaDe = (id: string, inicio: string, status: Agendamento['status'] = 'agendado', extra: Partial<Agendamento> = {}): Agendamento => ({
  id, inicio: iso(inicio), fim: new Date(new Date(inicio).getTime() + 3600_000).toISOString(), status,
  professorId: 'p1', moduloId: 'm1', aulaId: 'm1-l10', modalidade: 'presencial', recorrenciaId: null, lembreteEnviadoEm: null,
  alunoIds: ['x'], alunos: [], criadoPor: '', criadoEm: '', atualizadoPor: '', atualizadoEm: '', ...extra,
});
const doAluno = [
  aulaDe('passada', '2026-11-19T19:00:00-03:00', 'realizado'),
  aulaDe('cancelada', '2026-11-25T19:00:00-03:00', 'cancelado'),
  aulaDe('agora', '2026-11-24T11:30:00-03:00'),                  /* começou e não acabou: ainda é próxima */
  aulaDe('quinta', '2026-11-26T19:00:00-03:00', 'confirmado'),
  aulaDe('outra', '2026-12-01T19:00:00-03:00'),
  aulaDe('longe', '2026-12-08T19:00:00-03:00'),
];
igual('próximas: sem cancelada, a que está acontecendo primeiro', proximasAulas(doAluno, ja).map((a) => a.id), ['agora', 'quinta', 'outra']);
igual('últimas: só o que já passou e conta', ultimasAulas(doAluno, ja).map((a) => a.id), ['passada']);
igual('quando falado', quandoFalado(iso('2026-11-26T19:00:00-03:00')), 'quinta, 26/11, às 19h');
igual('aviso de aula marcada', textoDoAviso('marcada', { contato: 'Renan Antunes', aluno: 'Renan Antunes', paraResponsavel: false, inicio: iso('2026-11-26T19:00:00-03:00'), professor: 'Helena Duarte' }),
  'Pronto, Renan! Tua aula ficou marcada para quinta, 26/11, às 19h, com Helena. Qualquer coisa, é só chamar por aqui.');
igual('aviso ao responsável fala do aluno', textoDoAviso('remarcada', { contato: 'Cláudia Bortoli', aluno: 'Pedro Bortoli', paraResponsavel: true, inicio: iso('2026-11-26T08:30:00-03:00') }),
  'Pronto, Cláudia! A aula de Pedro foi remarcada para quinta, 26/11, às 8h30.');
igual('aviso de presença confirmada', textoDoAviso('confirmada', { contato: 'Ana', aluno: 'Ana', paraResponsavel: false, inicio: iso('2026-11-26T19:00:00-03:00') }),
  'Combinado, Ana! Presença confirmada para quinta, 26/11, às 19h. Até lá!');
igual('janela fechada: modelo do aviso', modeloDoAviso('marcada', { contato: 'Renan Antunes', inicio: iso('2026-11-26T19:00:00-03:00') }),
  { nome: 'aula_marcada', valores: ['Renan', 'quinta-feira, 26/11', '19h'] });
igual('remarcada usa o modelo de aula remarcada', modeloDoAviso('remarcada', { contato: 'Ana', inicio: iso('2026-11-26T19:00:00-03:00') }).nome, 'aula_remarcada');

const resp = respostaDasAulas({
  contato: 'Renan Antunes', aluno: 'Renan Antunes', paraResponsavel: false, alunoId: 'a-renan',
  proxima: { id: 'ag1', inicio: iso('2026-11-26T19:00:00-03:00'), status: 'agendado', professor: 'Helena Duarte', aula: 'B2 - L12' },
  depois: [iso('2026-12-03T19:00:00-03:00')],
});
igual('Minhas aulas: texto', resp.texto, 'Oi, Renan! Tua próxima aula é quinta, 26/11, às 19h, com Helena (B2 - L12).\nDepois: quinta, 03/12, às 19h.\nPodemos contar contigo?');
igual('Minhas aulas: botões com o payload do lembrete', resp.botoes.map((b) => b.id), [payloadDoLembrete('confirmar', 'ag1', 'a-renan'), payloadDoLembrete('remarcar', 'ag1', 'a-renan'), ID_FALAR_COM_RECEPCAO]);
igual('Minhas aulas: botões cabem no limite da Meta (20 letras)', resp.botoes.every((b) => b.titulo.length <= 20), true);
igual('Minhas aulas: o botão volta para a agenda', lePayload(resp.botoes[0].id), { acao: 'confirmar', agendamentoId: 'ag1', alunoId: 'a-renan' });
const jaConfirmada = respostaDasAulas({
  contato: 'Cláudia', aluno: 'Pedro Bortoli', paraResponsavel: true, alunoId: 'a-pedro',
  proxima: { id: 'ag2', inicio: iso('2026-11-26T08:30:00-03:00'), status: 'confirmado' },
});
igual('responsável, aula já confirmada: sem o botão de confirmar', [jaConfirmada.texto, jaConfirmada.botoes.length],
  ['Oi, Cláudia! A próxima aula de Pedro é quinta, 26/11, às 8h30.\nA presença já está confirmada 👍', 2]);

const curriculo: AulaDoCurriculo[] = [
  { id: 'm1-l10', moduloId: 'm1', nome: 'L10', nivel: 'B2', ordem: 10, ativo: true },
  { id: 'm1-l11', moduloId: 'm1', nome: 'L11', nivel: 'B2', ordem: 11, ativo: false },
  { id: 'm1-l12', moduloId: 'm1', nome: 'L12', nivel: 'B2', ordem: 12, ativo: true },
];
const sug = sugereAula([aulaDe('ultima', '2026-11-19T19:00:00-03:00', 'realizado')], ja, curriculo);
igual('sugestão: mesma hora uma semana depois, aula seguinte ativa do currículo',
  [sug.inicio, sug.fim, sug.professorId, sug.aulaId], [iso('2026-11-26T19:00:00-03:00'), iso('2026-11-26T20:00:00-03:00'), 'p1', 'm1-l12']);
igual('sugestão pula a semana que já tem aula marcada', sugereAula(doAluno, ja, curriculo).inicio, iso('2026-12-15T19:00:00-03:00'));
igual('sugestão sem aula nenhuma: amanhã às 19h', sugereAula([], ja).inicio, iso('2026-11-25T19:00:00-03:00'));

if (falhas) {
  console.log(`\n${falhas} falha(s).`);
  process.exit(1);
}
console.log('agenda: tudo certo.');
