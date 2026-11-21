/* Dados fictícios da agenda: 3 professores, 15 alunos, os módulos e as aulas do
   currículo, duas semanas de aulas (a passada e esta) com séries que seguem pelas
   próximas semanas, alguns bloqueios e o log. Nomes inventados.
   A mesma semente serve à demonstração (lib/dados/exemplo.ts) e ao botão de carregar
   dados de teste no banco de verdade (/api/agenda/teste), que marca tudo com
   `teste: true` para sair pelo botão de limpar. Sempre igual para a mesma data. */
import {
  conflitosDe, diaLocal, ocorrencias, somaDias,
  type Agendamento, type AlunoNaAula, type AulaDoCurriculo, type Bloqueio, type LogAgenda, type Modulo,
  type Notas, type Presenca, type Recorrencia, type StatusAula,
} from './agenda.ts';
import type { Aluno } from './tipos.ts';

export interface Semente {
  professores: { id: string; nome: string; email: string; cor: string }[];
  alunos: Aluno[];
  modulos: Modulo[];
  aulas: AulaDoCurriculo[];
  recorrencias: Recorrencia[];
  bloqueios: Bloqueio[];
  agendamentos: (Agendamento & { alunosDaAula: AlunoNaAula[] })[];
  logs: LogAgenda[];
}

const NIVEIS = ['Starter', 'A1', 'A2', 'B1', 'B2'];
const dois = (n: number) => String(n).padStart(2, '0');

export const MODULOS_PADRAO: Omit<Modulo, 'ativo'>[] = [
  { id: 'm-fixa', nome: 'Turma Fixa', modalidade: 'presencial', ordem: 1 },
  { id: 'm-fixa-on', nome: 'Turma Fixa ON', modalidade: 'online', ordem: 2 },
  { id: 'm-flex', nome: 'Flex', modalidade: 'presencial', ordem: 3 },
  { id: 'm-flex-on', nome: 'Flex ON', modalidade: 'online', ordem: 4 },
  { id: 'm-particular', nome: 'Particular', modalidade: 'presencial', ordem: 5 },
  { id: 'm-particular-on', nome: 'Particular ON', modalidade: 'online', ordem: 6 },
  { id: 'm-kids', nome: 'Kids', modalidade: 'presencial', ordem: 7 },
  { id: 'm-club', nome: 'Nexus Club', modalidade: 'presencial', ordem: 8 },
  { id: 'm-ciclo', nome: 'Ciclo', modalidade: 'presencial', ordem: 9 },
];

/** O currículo de partida: cada nível com as lições 1 a 20, conversação e check. */
export function aulasPadrao(): AulaDoCurriculo[] {
  const aulas: AulaDoCurriculo[] = [];
  const poe = (moduloId: string, nivel: string, nome: string, ordem: number, id: string) =>
    aulas.push({ id: `${moduloId}-${id}`, moduloId, nivel, nome, ordem, ativo: true });
  for (const m of ['m-fixa', 'm-fixa-on', 'm-flex', 'm-flex-on']) {
    NIVEIS.forEach((nivel, n) => {
      const base = n * 100;
      for (let l = 1; l <= 20; l += 1) poe(m, nivel, `${nivel} - L${dois(l)}`, base + l, `${nivel.toLowerCase()}-l${dois(l)}`);
      poe(m, nivel, `${nivel} - Conversation`, base + 21, `${nivel.toLowerCase()}-conversation`);
      poe(m, nivel, `${nivel} - Check`, base + 22, `${nivel.toLowerCase()}-check`);
    });
  }
  for (const m of ['m-particular', 'm-particular-on']) {
    ['Private class', 'Aula experimental', 'Training', 'Conversation'].forEach((nome, i) =>
      poe(m, 'Livre', nome, i + 1, nome.toLowerCase().replace(/\s+/g, '-')));
  }
  ['Kids 1', 'Kids 2', 'Kids 3'].forEach((nivel, n) => {
    for (let l = 1; l <= 20; l += 1) poe('m-kids', nivel, `${nivel} - L${dois(l)}`, n * 100 + l, `k${n + 1}-l${dois(l)}`);
  });
  poe('m-club', 'Livre', 'Nexus Club', 1, 'club');
  for (let c = 1; c <= 4; c += 1) poe('m-ciclo', 'Livre', `Ciclo ${c}`, c, `ciclo-${c}`);
  return aulas;
}

/* números que parecem sorteados, mas saem sempre iguais */
function sorteio(semente: number) {
  let s = semente >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

const OBS_BOAS = [
  'Participou bem da conversação.',
  'Boa evolução na fala, ainda trava no past simple.',
  'Fez a tarefa de casa completa.',
  'Ótima pronúncia nos exercícios de listening.',
  'Precisa revisar o vocabulário da lição anterior.',
  'Chegou 10 minutos atrasado.',
  'Mais confiante para falar em grupo.',
  'Confundiu present perfect com simple past, revisar.',
];
const OBS_FALTA = ['Faltou sem avisar.', 'Avisou que estaria viajando.', 'Avisou que estava doente.'];

export function semente(hoje: Date, o: { prefixo?: string; teste?: boolean; criadoPor?: string; professorIds?: [string, string, string] } = {}): Semente {
  const px = o.prefixo || '';
  const criadoPor = o.criadoPor || 'u-gui';
  const marca = o.teste ? { teste: true } : {};
  const rnd = sorteio(20261121);

  /* ---------------- equipe e alunos ---------------- */
  const [idHelena, idTiago, idPaula] = o.professorIds || [`${px}u-helena`, `${px}u-tiago`, `${px}u-paula`];
  const professores = [
    { id: idHelena, nome: 'Helena Duarte', email: 'helena@nexus.demo', cor: '#F6C28B' },
    { id: idTiago, nome: 'Tiago Moretti', email: 'tiago@nexus.demo', cor: '#9FD3A8' },
    { id: idPaula, nome: 'Paula Sartori', email: 'paula@nexus.demo', cor: '#A9C6EC' },
  ];
  const agora = hoje.toISOString();
  let cod = 140;
  /* os campos que vêm da planilha da escola (aba ATIVOS), para a tela de Alunos ter o que mostrar */
  const aluno = (id: string, nome: string, nivel: string, extra: Partial<Aluno> = {}): Aluno => ({
    id: `${px}${id}`, nome, telefone: '', trilha: nivel.startsWith('Kids') ? 'kids' : 'adultos', nivel, licao: 10,
    ativo: true, criadoEm: agora, atualizadoEm: agora,
    codigo: String((cod += 7)), situacao: 'ativo', marcouSemana: true, saude: 'evoluindo', modalidade: 'presencial',
    menor: nivel.startsWith('Kids'), appAtivo: true, nexiaAtivo: cod % 2 === 0, origem: 'planilha',
    ...marca, ...extra,
  });
  const alunos: Aluno[] = [
    aluno('a-giovana', 'Giovana Lazzari', 'A2', { horarioFixoTexto: 'terças às 18h', horariosFixos: [{ dia: 2, hora: '18:00' }], temFixo: true }),
    aluno('a-renan', 'Renan Antunes', 'B2', { horarioFixoTexto: 'terças 18h e quintas 18h', horariosFixos: [{ dia: 2, hora: '18:00' }, { dia: 4, hora: '18:00' }], temFixo: true, contratoFim: '2027-06-30' }),
    aluno('a-pedro', 'Pedro Bortoli', 'Kids 2', { responsavelNome: 'Cláudia Bortoli' }),
    aluno('a-bianca', 'Bianca Zanella', 'A2', { saude: 'atencao', observacao: 'Parcela de outubro em atraso.', marcouSemana: false }),
    aluno('a-jonas', 'Jonas Pereira', 'B1'),
    aluno('a-eduardo', 'Eduardo Lunardi', 'B1', { saude: 'critico', observacao: 'Pediu cancelamento: mudou de horário no trabalho.', marcouSemana: false }),
    aluno('a-larissa', 'Larissa Menegat', 'B2'),
    aluno('a-marina', 'Marina Teles', 'B2'),
    aluno('a-lucas', 'Lucas Fiorentin', 'A2', { marcouSemana: false, modalidade: 'online', livroOriginal: 'A2 ON' }),
    aluno('a-camila', 'Camila Rech', 'B1', { horarioFixoTexto: 'terças às 19h', horariosFixos: [{ dia: 2, hora: '19:00' }], temFixo: true }),
    aluno('a-rodrigo', 'Rodrigo Baldissera', 'B1'),
    aluno('a-alice', 'Alice Dalmolin', 'Kids 2', { responsavelNome: 'Fernanda Dalmolin' }),
    aluno('a-theo', 'Theo Zanatta', 'Kids 2', { responsavelNome: 'Marcos Zanatta' }),
    aluno('a-rafael', 'Rafael Tonello', 'A1', { ativo: false, situacao: 'trancado', marcouSemana: null, observacao: 'Trancou por 3 meses, volta em janeiro.' }),
    aluno('a-sabrina', 'Sabrina Kunz', 'A1', { ativo: false, situacao: 'off', marcouSemana: null, horarioFixoTexto: 'JANEIRO' }),
  ];
  const nomeDe = new Map(alunos.map((a) => [a.id, a.nome]));
  const A = (id: string) => `${px}${id}`;

  /* ---------------- currículo ---------------- */
  const modulos: Modulo[] = MODULOS_PADRAO.map((m) => ({ ...m, ativo: true, ...marca }));
  const aulas = aulasPadrao().map((a) => ({ ...a, ...marca }));
  const aulaPorId = new Set(aulas.map((a) => a.id));

  /* ---------------- datas ---------------- */
  const diaHoje = diaLocal(hoje);
  const semanaDeHoje = new Date(`${diaHoje}T12:00:00Z`).getUTCDay();
  const segundaPassada = somaDias(diaHoje, -((semanaDeHoje + 6) % 7) - 7);
  const dia = (n: number) => somaDias(segundaPassada, n);       // 0 = segunda passada
  const em = (d: string, hora: string) => new Date(`${d}T${hora}:00-03:00`).toISOString();

  /* ---------------- bloqueios ---------------- */
  const bloqueios: Bloqueio[] = [
    { id: `${px}bl-feriado`, tipo: 'feriado', professorId: null, inicio: em(dia(11), '00:00'), fim: em(dia(12), '00:00'), motivo: 'Feriado municipal' },
    { id: `${px}bl-reuniao`, tipo: 'reuniao', professorId: null, inicio: em(dia(12), '08:00'), fim: em(dia(12), '09:30'), motivo: 'Reunião pedagógica' },
    { id: `${px}bl-ferias`, tipo: 'ferias', professorId: idTiago, inicio: em(dia(16), '00:00'), fim: em(dia(19), '00:00'), motivo: 'Férias do Tiago' },
    { id: `${px}bl-consulta`, tipo: 'indisponivel', professorId: idPaula, inicio: em(dia(7), '14:00'), fim: em(dia(7), '16:00'), motivo: 'Consulta médica' },
  ].map((b) => ({ ...b, criadoPor, criadoEm: agora, ...marca })) as Bloqueio[];

  /* ---------------- aulas ---------------- */
  const recorrencias: Recorrencia[] = [];
  const agendamentos: Semente['agendamentos'] = [];
  const logs: LogAgenda[] = [];
  let n = 0;

  const notas = (): Notas => {
    const nota = () => Math.round((6 + rnd() * 4) * 2) / 2;
    return { fala: nota(), leitura: nota(), escuta: nota(), escrita: nota() };
  };

  function cria(
    ini: string, fim: string, professorId: string, moduloId: string, aulaId: string, ids: string[],
    extra: { recorrenciaId?: string | null; status?: StatusAula } = {},
  ) {
    /* avulsa pode vir só com o nome curto da aula: "private-class" vira "m-particular-private-class" */
    if (!aulaPorId.has(aulaId)) aulaId = `${moduloId}-${aulaId}`;
    if (!aulaPorId.has(aulaId)) throw new Error(`aula inexistente na semente: ${aulaId}`);
    const passou = new Date(fim).getTime() < hoje.getTime();
    const ontem = diaLocal(ini) === somaDias(diaHoje, -1) || diaLocal(ini) === somaDias(diaHoje, -2);
    let status: StatusAula = extra.status || 'agendado';
    /* as de anteontem e ontem ficam esperando a presença, para o alerta aparecer */
    const lancada = passou && !ontem && !extra.status;
    const alunosDaAula: AlunoNaAula[] = ids.map((id) => {
      const faltou = lancada && rnd() < 0.12;
      const comNota = lancada && !faltou && rnd() < 0.8;
      return {
        alunoId: id, nomeAluno: nomeDe.get(id) || id,
        presenca: (lancada ? (faltou ? 'faltou' : 'presente') : null) as Presenca,
        obs: lancada ? (faltou ? OBS_FALTA[Math.floor(rnd() * OBS_FALTA.length)] : rnd() < 0.45 ? OBS_BOAS[Math.floor(rnd() * OBS_BOAS.length)] : '') : '',
        ...(comNota ? { notas: notas() } : {}),
        resposta: null, respostaEm: null,
      };
    });
    if (lancada) status = 'realizado';
    const proxima = !passou && diaLocal(ini) <= somaDias(diaHoje, 2);
    if (proxima && status === 'agendado' && rnd() < 0.4) status = 'confirmado';
    n += 1;
    const id = `${px}ag-${String(n).padStart(3, '0')}`;
    const a = {
      id, inicio: ini, fim, status, professorId, moduloId, aulaId,
      modalidade: moduloId.endsWith('-on') ? 'online' as const : 'presencial' as const,
      recorrenciaId: extra.recorrenciaId ?? null,
      lembreteEnviadoEm: proxima ? em(somaDias(diaLocal(ini), -1), '18:00') : null,
      alunoIds: ids,
      alunos: alunosDaAula.map((x) => ({ id: x.alunoId, nome: x.nomeAluno, presenca: x.presenca })),
      criadoPor, criadoEm: em(dia(0), '07:30'), atualizadoPor: criadoPor, atualizadoEm: agora,
      alunosDaAula, ...marca,
    };
    agendamentos.push(a);
    if (lancada && n % 3 === 0) {
      logs.push({
        id: `${px}log-${n}`, agendamentoId: id, acao: 'lancou_presenca', usuarioId: professorId,
        usuarioNome: professores.find((p) => p.id === professorId)?.nome || 'Professor',
        antes: { aulaId, inicio: ini, alunos: a.alunos.map((x) => ({ ...x, presenca: null })) }, depois: { aulaId, inicio: ini, alunos: a.alunos },
        data: fim, ...marca,
      });
    }
    return a;
  }

  /** Uma série semanal que começa na segunda passada e segue por 6 semanas. */
  function serie(rid: string, dias: number[], hora: string, horaFim: string, professorId: string, moduloId: string, aulaBase: string, primeiraLicao: number, ids: string[]) {
    const recorrenciaId = `${px}${rid}`;
    recorrencias.push({ id: recorrenciaId, tipo: 'semanal', repeticoes: dias.length * 6, diasDaSemana: dias, criadoPor, criadoEm: em(dia(0), '07:30'), ...marca });
    const primeiro = dia(((dias[0] + 6) % 7));
    const lista = ocorrencias(em(primeiro, hora), em(primeiro, horaFim), { tipo: 'semanal', repeticoes: dias.length * 6, diasDaSemana: dias });
    let licao = primeiraLicao;
    let primeiraDaSerie = true;
    for (const oc of lista) {
      /* não cria em cima de bloqueio: a tela também avisaria */
      if (conflitosDe({ ...oc, professorId, alunoIds: ids }, [], bloqueios).length) continue;
      const aulaId = aulaBase.includes('{l}') ? `${moduloId}-${aulaBase.replace('{l}', dois(Math.min(licao, 20)))}` : `${moduloId}-${aulaBase}`;
      const a = cria(oc.inicio, oc.fim, professorId, moduloId, aulaId, ids, { recorrenciaId });
      if (primeiraDaSerie) {
        logs.push({
          id: `${px}log-serie-${rid}`, agendamentoId: a.id, acao: 'criou', usuarioId: criadoPor, usuarioNome: 'Guilherme',
          antes: null, depois: { inicio: a.inicio, fim: a.fim, professorId, moduloId, aulaId, recorrenciaId, alunos: a.alunos }, data: a.criadoEm, ...marca,
        });
        primeiraDaSerie = false;
      }
      licao += 1;
    }
  }

  serie('rec-a2-manha', [2, 4], '09:00', '10:00', idHelena, 'm-fixa', 'a2-l{l}', 10, [A('a-giovana'), A('a-bianca'), A('a-lucas')]);
  serie('rec-b1-noite', [1, 3], '19:00', '20:30', idHelena, 'm-fixa', 'b1-l{l}', 4, [A('a-jonas'), A('a-eduardo'), A('a-camila'), A('a-rodrigo')]);
  serie('rec-kids', [1, 3], '17:00', '18:00', idTiago, 'm-kids', 'k2-l{l}', 6, [A('a-pedro'), A('a-alice'), A('a-theo')]);
  serie('rec-b2-on', [2, 4], '18:00', '19:00', idPaula, 'm-fixa-on', 'b2-l{l}', 12, [A('a-larissa'), A('a-marina'), A('a-renan')]);
  serie('rec-club', [6], '10:00', '11:30', idPaula, 'm-club', 'club', 1, [A('a-giovana'), A('a-jonas'), A('a-larissa'), A('a-bianca'), A('a-camila')]);
  serie('rec-flex', [5], '08:00', '09:00', idTiago, 'm-flex', 'b1-l{l}', 8, [A('a-rodrigo')]);

  /* avulsas das duas semanas */
  cria(em(dia(2), '14:00'), em(dia(2), '15:00'), idPaula, 'm-particular', 'aula-experimental', [A('a-rafael')]);
  cria(em(dia(4), '10:00'), em(dia(4), '11:00'), idHelena, 'm-particular', 'private-class', [A('a-sabrina')], { status: 'cancelado' });
  cria(em(dia(10), '15:00'), em(dia(10), '16:00'), idTiago, 'm-flex', 'b1-conversation', [A('a-eduardo')], { status: 'remarcado' });
  cria(em(dia(12), '09:30'), em(dia(12), '10:30'), idTiago, 'm-flex', 'b1-conversation', [A('a-eduardo')]);
  cria(em(dia(7), '12:00'), em(dia(7), '13:00'), idPaula, 'm-particular-on', 'training', [A('a-renan')]);
  cria(em(dia(8), '15:00'), em(dia(8), '16:00'), idHelena, 'm-flex', 'a2-l12', [A('a-lucas'), A('a-giovana')]);
  cria(em(dia(15), '20:00'), em(dia(15), '21:00'), idPaula, 'm-ciclo', 'ciclo-2', [A('a-marina'), A('a-renan')]);
  cria(em(dia(16), '11:00'), em(dia(16), '12:00'), idHelena, 'm-particular', 'conversation', [A('a-camila')]);

  return { professores, alunos, modulos, aulas, recorrencias, bloqueios, agendamentos, logs };
}
