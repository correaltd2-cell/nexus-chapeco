/* A agenda de aulas: regras puras, sem banco e sem tela.
   Agendamento = uma aula num horário, com um professor e vários alunos dentro.
   O status é do agendamento; presença, observação e notas são de cada aluno.
   Quem grava é a tela (componentes/agenda) e o servidor (lembrete, resumo, semente);
   as regras moram aqui para valer igual nos dois.
   Prova: node --experimental-strip-types testes/agenda.ts */
import type { Papel } from './tipos';

/* ================= tipos ================= */

export type StatusAula = 'agendado' | 'confirmado' | 'realizado' | 'cancelado' | 'remarcado';
export type Presenca = 'presente' | 'faltou' | null;
export type Modalidade = 'presencial' | 'online';
export type TipoRecorrencia = 'diaria' | 'semanal' | 'mensal';
export type TipoBloqueio = 'feriado' | 'ferias' | 'reuniao' | 'indisponivel';
export type Escopo = 'este' | 'proximos';
export type AcaoLog = 'criou' | 'editou' | 'excluiu' | 'mudou_status' | 'lancou_presenca';

export interface Notas { fala?: number | null; leitura?: number | null; escuta?: number | null; escrita?: number | null }
export const HABILIDADES = ['fala', 'leitura', 'escuta', 'escrita'] as const;
export type Habilidade = (typeof HABILIDADES)[number];

/** agendamentos/{id}/alunos/{alunoId}: o que é de cada aluno na aula. */
export interface AlunoNaAula {
  alunoId: string;
  nomeAluno: string;
  presenca: Presenca;
  obs: string;
  notas?: Notas;
  /* resposta ao lembrete do WhatsApp */
  resposta?: 'confirmou' | 'remarcar' | null;
  respostaEm?: string | null;
}

/** O resumo dos alunos que fica no próprio agendamento, para o calendário desenhar
    sem abrir a subcoleção de cada aula. A fonte de cada aluno é a subcoleção. */
export interface ResumoAluno { id: string; nome: string; presenca: Presenca }

export interface Agendamento {
  id: string;
  inicio: string;               // ISO com fuso
  fim: string;
  status: StatusAula;
  professorId: string;
  moduloId: string;
  aulaId: string;
  modalidade: Modalidade;
  recorrenciaId: string | null;
  lembreteEnviadoEm: string | null;
  alunoIds: string[];           // para achar as aulas de um aluno
  alunos: ResumoAluno[];
  criadoPor: string;
  criadoEm: string;
  atualizadoPor: string;
  atualizadoEm: string;
  teste?: boolean;              // dado fictício da semente, que sai pelo botão de limpar
}

export interface Recorrencia {
  id: string;
  tipo: TipoRecorrencia;
  repeticoes?: number | null;
  ateData?: string | null;      // AAAA-MM-DD
  diasDaSemana?: number[];      // 0 domingo ... 6 sábado (semanal)
  criadoPor?: string;
  criadoEm?: string;
  teste?: boolean;
}

export interface Bloqueio {
  id: string;
  tipo: TipoBloqueio;
  professorId: string | null;   // null = escola inteira
  inicio: string;
  fim: string;
  motivo: string;
  criadoPor?: string;
  criadoEm?: string;
  teste?: boolean;
}

export interface Modulo { id: string; nome: string; modalidade: Modalidade; ordem: number; ativo: boolean; teste?: boolean }
export interface AulaDoCurriculo { id: string; moduloId: string; nome: string; nivel: string; ordem: number; ativo: boolean; teste?: boolean }

export interface LogAgenda {
  id: string;
  agendamentoId: string;
  acao: AcaoLog;
  usuarioId: string;
  usuarioNome: string;
  antes: Record<string, unknown> | null;
  depois: Record<string, unknown> | null;
  data: string;
  teste?: boolean;
}

/** O que a agenda precisa saber de cada professor (vem do perfil da equipe). */
export interface Professor { id: string; nome: string; cor: string; ativo: boolean }

/* ================= status ================= */

export const STATUS: Record<StatusAula, { nome: string; cor: string }> = {
  agendado: { nome: 'Agendado', cor: '#2E67B1' },
  confirmado: { nome: 'Confirmado', cor: '#1E8A52' },
  realizado: { nome: 'Realizado', cor: '#141414' },
  cancelado: { nome: 'Cancelado', cor: '#8E8E88' },
  remarcado: { nome: 'Remarcado', cor: '#7B4CC4' },
};
export const LISTA_STATUS = Object.keys(STATUS) as StatusAula[];

export const BLOQUEIOS: Record<TipoBloqueio, string> = {
  feriado: 'Feriado', ferias: 'Férias', reuniao: 'Reunião', indisponivel: 'Indisponível',
};

/** Cancelado e remarcado não contam como aula dada. */
export const contaComoAula = (s: StatusAula) => s !== 'cancelado' && s !== 'remarcado';

/** Cores para o professor que ainda não escolheu a dele. */
export const CORES_DE_PROFESSOR = ['#F6C28B', '#9FD3A8', '#A9C6EC', '#E7B3D8', '#F2DD8A', '#B9A7E8', '#8FD6D1', '#F4A9A0'];
export const corDoProfessor = (p: { cor?: string } | undefined, indice = 0) =>
  p?.cor && /^#[0-9a-f]{6}$/i.test(p.cor) ? p.cor : CORES_DE_PROFESSOR[indice % CORES_DE_PROFESSOR.length];

/** Texto escuro ou claro, o que ler melhor em cima da cor do professor. */
export function textoSobre(cor: string) {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(cor);
  if (!m) return '#141414';
  const [r, g, b] = [m[1], m[2], m[3]].map((h) => parseInt(h, 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.36 ? '#141414' : '#FFFFFF';
}

/* ================= tempo ================= */

const ms = (iso: string) => new Date(iso).getTime();
/** Chapecó não tem horário de verão desde 2019: o fuso é fixo. */
export const FUSO_MIN = -180;

/** O dia no calendário de Chapecó (AAAA-MM-DD), qualquer que seja o fuso de quem roda. */
export function diaLocal(iso: string | Date) {
  const d = new Date((typeof iso === 'string' ? ms(iso) : iso.getTime()) + FUSO_MIN * 60_000);
  return d.toISOString().slice(0, 10);
}

/** Meia-noite de um dia de Chapecó, em ISO. */
export const inicioDoDia = (dia: string) => new Date(`${dia}T00:00:00-03:00`).toISOString();
export const somaDias = (dia: string, n: number) => {
  const d = new Date(`${dia}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** "16:00" no relógio de Chapecó. */
export const horaLocal = (iso: string) => new Date(ms(iso) + FUSO_MIN * 60_000).toISOString().slice(11, 16);

export const sobrepoe = (a: { inicio: string; fim: string }, b: { inicio: string; fim: string }) =>
  ms(a.inicio) < ms(b.fim) && ms(b.inicio) < ms(a.fim);

/* ================= validação ================= */

export interface Rascunho {
  id?: string;
  inicio: string;
  fim: string;
  status: StatusAula;
  professorId: string;
  moduloId: string;
  aulaId: string;
  modalidade: Modalidade;
  alunos: Pick<AlunoNaAula, 'alunoId' | 'nomeAluno' | 'presenca'>[];
}

/** O que impede salvar, em português. Vazio é pode salvar. */
export function problemasDoRascunho(r: Rascunho): string[] {
  const p: string[] = [];
  if (!r.inicio || !r.fim || Number.isNaN(ms(r.inicio)) || Number.isNaN(ms(r.fim))) p.push('Preencha o início e o fim.');
  else if (ms(r.fim) <= ms(r.inicio)) p.push('O fim precisa ser depois do início.');
  if (!r.professorId) p.push('Escolha o professor.');
  if (!r.moduloId) p.push('Escolha o módulo.');
  if (!r.aulaId) p.push('Escolha a aula.');
  const ids = r.alunos.map((a) => a.alunoId);
  if (new Set(ids).size !== ids.length) p.push('O mesmo aluno está duas vezes na aula.');
  if (r.status === 'realizado' && r.alunos.some((a) => !a.presenca)) {
    p.push('Para marcar como realizada, lance a presença de todos os alunos.');
  }
  if (r.status === 'realizado' && !r.alunos.length) p.push('Aula realizada precisa de pelo menos um aluno.');
  return p;
}

/* ================= conflitos ================= */

export interface Conflito {
  tipo: 'professor' | 'aluno' | 'bloqueio';
  mensagem: string;
  com: string;                  // id do agendamento ou do bloqueio
  inicio: string;               // da ocorrência que conflita
}

/**
 * Mesmo professor ou mesmo aluno em horário sobreposto, ou horário dentro de bloqueio
 * da escola ou do professor. Aula cancelada ou remarcada não ocupa horário.
 */
export function conflitosDe(
  c: { id?: string; inicio: string; fim: string; professorId: string; alunoIds: string[] },
  existentes: Pick<Agendamento, 'id' | 'inicio' | 'fim' | 'status' | 'professorId' | 'alunoIds' | 'alunos'>[],
  bloqueios: Pick<Bloqueio, 'id' | 'inicio' | 'fim' | 'professorId' | 'tipo' | 'motivo'>[],
  nomes: { professor?: (id: string) => string; aluno?: (id: string) => string } = {},
  ignorar: ReadonlySet<string> = new Set(),
): Conflito[] {
  const saida: Conflito[] = [];
  const hora = (iso: string) => `${diaLocal(iso).split('-').reverse().slice(0, 2).join('/')} às ${horaLocal(iso)}`;
  for (const e of existentes) {
    if (e.id === c.id || ignorar.has(e.id) || !contaComoAula(e.status) || !sobrepoe(c, e)) continue;
    if (c.professorId && e.professorId === c.professorId) {
      saida.push({
        tipo: 'professor', com: e.id, inicio: c.inicio,
        mensagem: `${nomes.professor?.(c.professorId) || 'O professor'} já tem aula em ${hora(e.inicio)}.`,
      });
    }
    for (const a of c.alunoIds) {
      if (!(e.alunoIds || []).includes(a)) continue;
      saida.push({
        tipo: 'aluno', com: e.id, inicio: c.inicio,
        mensagem: `${nomes.aluno?.(a) || e.alunos?.find((x) => x.id === a)?.nome || 'Um aluno'} já está em outra aula em ${hora(e.inicio)}.`,
      });
    }
  }
  for (const b of bloqueios) {
    if (!sobrepoe(c, b) || (b.professorId && b.professorId !== c.professorId)) continue;
    saida.push({
      tipo: 'bloqueio', com: b.id, inicio: c.inicio,
      mensagem: `${hora(c.inicio)} cai em ${BLOQUEIOS[b.tipo].toLowerCase()}${b.motivo ? ` (${b.motivo})` : ''}${b.professorId ? ' do professor' : ' da escola'}.`,
    });
  }
  return saida;
}

/** Só a administração passa por cima de um conflito. */
export const podeForcarConflito = (papel: Papel) => papel === 'admin';

/* ================= recorrência ================= */

export const LIMITE_DE_OCORRENCIAS = 120;

export interface RegraDeRepeticao {
  tipo: TipoRecorrencia;
  repeticoes?: number | null;    // quantas aulas no total, contando a primeira
  ateData?: string | null;       // AAAA-MM-DD, inclusive
  diasDaSemana?: number[];       // semanal; vazio = o mesmo dia da primeira
}

/** As ocorrências de uma aula que se repete, todas com o mesmo horário e duração. */
export function ocorrencias(inicio: string, fim: string, regra: RegraDeRepeticao): { inicio: string; fim: string }[] {
  const duracao = ms(fim) - ms(inicio);
  const hora = ms(inicio) - ms(inicioDoDia(diaLocal(inicio)));
  const primeiroDia = diaLocal(inicio);
  const total = Math.min(regra.repeticoes && regra.repeticoes > 0 ? regra.repeticoes : LIMITE_DE_OCORRENCIAS, LIMITE_DE_OCORRENCIAS);
  const ate = regra.ateData || null;
  if (!regra.repeticoes && !ate) return [{ inicio, fim }];

  const dias: string[] = [];
  const cabe = (d: string) => !ate || d <= ate;
  if (regra.tipo === 'diaria') {
    for (let i = 0; dias.length < total && i < 400; i += 1) {
      const d = somaDias(primeiroDia, i);
      if (!cabe(d)) break;
      dias.push(d);
    }
  } else if (regra.tipo === 'semanal') {
    const semana = new Date(`${primeiroDia}T12:00:00Z`).getUTCDay();
    const escolhidos = (regra.diasDaSemana?.length ? regra.diasDaSemana : [semana]).slice().sort();
    for (let i = 0; dias.length < total && i < 400 * 7; i += 1) {
      const d = somaDias(primeiroDia, i);
      if (!cabe(d)) break;
      if (escolhidos.includes(new Date(`${d}T12:00:00Z`).getUTCDay())) dias.push(d);
    }
  } else {
    const [a, m, dia] = primeiroDia.split('-').map(Number);
    for (let i = 0; dias.length < total && i < 240; i += 1) {
      const alvo = new Date(Date.UTC(a, m - 1 + i, 1, 12));
      const ultimo = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0, 12)).getUTCDate();
      if (dia > ultimo) continue; /* dia 31 não existe em todo mês: pula, não inventa */
      const d = `${alvo.getUTCFullYear()}-${String(alvo.getUTCMonth() + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
      if (!cabe(d)) break;
      dias.push(d);
    }
  }
  return dias.map((d) => {
    const i = ms(inicioDoDia(d)) + hora;
    return { inicio: new Date(i).toISOString(), fim: new Date(i + duracao).toISOString() };
  });
}

/** Quais agendamentos uma alteração atinge: só este, ou este e os próximos da série. */
export function atingidos<T extends Pick<Agendamento, 'id' | 'inicio' | 'recorrenciaId'>>(lista: T[], alvo: T, escopo: Escopo): T[] {
  if (escopo === 'este' || !alvo.recorrenciaId) return [alvo];
  return lista
    .filter((a) => a.recorrenciaId === alvo.recorrenciaId && ms(a.inicio) >= ms(alvo.inicio))
    .sort((a, b) => ms(a.inicio) - ms(b.inicio));
}

/** Leva a mudança de horário do alvo para outra ocorrência da série: o mesmo
    deslocamento no início e a mesma duração nova. */
export function deslocaHorario(
  ocorrencia: { inicio: string; fim: string },
  alvoAntes: { inicio: string; fim: string },
  alvoDepois: { inicio: string; fim: string },
) {
  const delta = ms(alvoDepois.inicio) - ms(alvoAntes.inicio);
  const duracao = ms(alvoDepois.fim) - ms(alvoDepois.inicio);
  const i = ms(ocorrencia.inicio) + delta;
  return { inicio: new Date(i).toISOString(), fim: new Date(i + duracao).toISOString() };
}

/** O que passa para as próximas ocorrências quando a escolha é "este e os próximos".
    Status, presença, observação e notas são de cada aula e não passam. */
export const CAMPOS_DA_SERIE = ['professorId', 'moduloId', 'aulaId', 'modalidade'] as const;

/* ================= permissões ================= */

export interface Permissoes {
  ver: boolean;
  criar: boolean;
  excluir: boolean;
  remarcar: boolean;          // mudar horário, arrastar, redimensionar
  trocarAlunos: boolean;
  editarDados: boolean;       // professor, módulo, aula, modalidade, recorrência
  editarStatus: boolean;
  lancarPresenca: boolean;    // presença, observação, notas
  bloquear: boolean;          // criar e editar bloqueio
  forcarConflito: boolean;
}

/** Admin, gestão, recepção e coordenação cuidam da agenda; o professor só lança a aula
    dele. A mesma regra está no firestore.rules, que é a trava de verdade. */
export function permissoesDe(papel: Papel | undefined, ehDaAula = false): Permissoes {
  const cuida = papel === 'admin' || papel === 'gestor' || papel === 'recepcao' || papel === 'coordenacao';
  const professor = papel === 'professor' && ehDaAula;
  return {
    ver: Boolean(papel),
    criar: cuida,
    excluir: cuida,
    remarcar: cuida,
    trocarAlunos: cuida,
    editarDados: cuida,
    editarStatus: cuida || professor,
    lancarPresenca: cuida || professor,
    bloquear: cuida,
    forcarConflito: papel === 'admin',
  };
}

/* ================= leitura na tela ================= */

/** A aula já passou e tem aluno sem presença lançada: o ponto de alerta do bloco. */
export const faltaPresenca = (a: Pick<Agendamento, 'fim' | 'status' | 'alunos'>, agora: Date) =>
  ms(a.fim) < agora.getTime() && contaComoAula(a.status) && a.alunos.some((x) => !x.presenca);

/** "A2 - L19" + nomes curtos dos alunos, como no bloco do calendário. */
export function nomesCurtos(alunos: ResumoAluno[]) {
  return alunos.map((a) => {
    const partes = a.nome.trim().split(/\s+/);
    return partes.length > 1 ? `${partes[0]} ${partes[partes.length - 1][0]}.` : partes[0];
  });
}

/* ================= relatório ================= */

export interface Indicadores {
  total: number;
  realizadas: number;
  presentes: number;
  faltas: number;
  taxaPresenca: number | null;   // 0 a 1, ou null sem nenhuma presença lançada
  cancelamentos: number;
  remarcadas: number;
  pendentes: number;             // passaram e falta lançar presença
  porProfessor: { professorId: string; aulas: number }[];
}

export function indicadores(lista: Pick<Agendamento, 'fim' | 'status' | 'alunos' | 'professorId'>[], agora: Date): Indicadores {
  let presentes = 0;
  let faltas = 0;
  const porProfessor = new Map<string, number>();
  for (const a of lista) {
    if (!contaComoAula(a.status)) continue;
    porProfessor.set(a.professorId, (porProfessor.get(a.professorId) || 0) + 1);
    for (const x of a.alunos) {
      if (x.presenca === 'presente') presentes += 1;
      if (x.presenca === 'faltou') faltas += 1;
    }
  }
  return {
    total: lista.filter((a) => contaComoAula(a.status)).length,
    realizadas: lista.filter((a) => a.status === 'realizado').length,
    presentes,
    faltas,
    taxaPresenca: presentes + faltas ? presentes / (presentes + faltas) : null,
    cancelamentos: lista.filter((a) => a.status === 'cancelado').length,
    remarcadas: lista.filter((a) => a.status === 'remarcado').length,
    pendentes: lista.filter((a) => faltaPresenca(a, agora)).length,
    porProfessor: [...porProfessor].map(([professorId, aulas]) => ({ professorId, aulas })).sort((a, b) => b.aulas - a.aulas),
  };
}

export interface FiltroRelatorio {
  de?: string;                  // AAAA-MM-DD
  ate?: string;
  professorIds?: string[];
  moduloIds?: string[];
  aulaIds?: string[];
  alunoIds?: string[];
  status?: StatusAula[];
  presenca?: 'presente' | 'faltou' | 'sem' | null;
  modalidade?: Modalidade | null;
}

/** Os agendamentos que passam no filtro do relatório (e da agenda). */
export function filtra<T extends Pick<Agendamento, 'inicio' | 'professorId' | 'moduloId' | 'aulaId' | 'alunoIds' | 'status' | 'alunos' | 'modalidade'>>(
  lista: T[], f: FiltroRelatorio,
): T[] {
  return lista.filter((a) => {
    const dia = diaLocal(a.inicio);
    if (f.de && dia < f.de) return false;
    if (f.ate && dia > f.ate) return false;
    if (f.professorIds?.length && !f.professorIds.includes(a.professorId)) return false;
    if (f.moduloIds?.length && !f.moduloIds.includes(a.moduloId)) return false;
    if (f.aulaIds?.length && !f.aulaIds.includes(a.aulaId)) return false;
    if (f.alunoIds?.length && !f.alunoIds.some((id) => (a.alunoIds || []).includes(id))) return false;
    if (f.status?.length && !f.status.includes(a.status)) return false;
    if (f.modalidade && a.modalidade !== f.modalidade) return false;
    if (f.presenca) {
      const doFiltro = f.alunoIds?.length ? a.alunos.filter((x) => f.alunoIds?.includes(x.id)) : a.alunos;
      const quer = f.presenca === 'sem' ? null : f.presenca;
      if (!doFiltro.some((x) => x.presenca === quer)) return false;
    }
    return true;
  });
}

/** Média das notas lançadas (0 a 10), ou null. */
export function mediaDas(notas?: Notas) {
  const v = HABILIDADES.map((h) => notas?.[h]).filter((n): n is number => typeof n === 'number');
  return v.length ? Math.round((v.reduce((s, n) => s + n, 0) / v.length) * 10) / 10 : null;
}

/** Nota digitada: de 0 a 10, com uma casa; vazio é sem nota. */
export function notaValida(texto: string): number | null {
  const t = texto.trim().replace(',', '.');
  if (!t) return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0 || n > 10) return null;
  return Math.round(n * 10) / 10;
}

/* ================= CSV ================= */

const celula = (v: unknown) => {
  const s = v === null || v === undefined ? '' : String(v);
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** CSV que abre certo no Excel em português: ponto e vírgula e BOM. */
export function csv(cabecalho: string[], linhas: unknown[][]) {
  return `﻿${[cabecalho, ...linhas].map((l) => l.map(celula).join(';')).join('\r\n')}\r\n`;
}

/* ================= log ================= */

/** Os campos que mudaram entre antes e depois, para a tela do log. */
export function mudancas(antes: Record<string, unknown> | null, depois: Record<string, unknown> | null) {
  const chaves = new Set([...Object.keys(antes || {}), ...Object.keys(depois || {})]);
  const ignora = new Set(['atualizadoEm', 'atualizadoPor', 'criadoEm', 'criadoPor', 'id']);
  return [...chaves].filter((k) => !ignora.has(k) && JSON.stringify(antes?.[k] ?? null) !== JSON.stringify(depois?.[k] ?? null)).sort();
}

/** O retrato de um agendamento que vai para o log (sem o que é repetido ou volátil). */
export function retrato(a: Partial<Agendamento> & { alunosDaAula?: Partial<AlunoNaAula>[] }) {
  const { inicio, fim, status, professorId, moduloId, aulaId, modalidade, recorrenciaId, alunos, alunosDaAula } = a;
  return {
    inicio, fim, status, professorId, moduloId, aulaId, modalidade, recorrenciaId,
    alunos: alunosDaAula
      ? alunosDaAula.map((x) => ({ id: x.alunoId, nome: x.nomeAluno, presenca: x.presenca ?? null, obs: x.obs || '', notas: x.notas || null }))
      : alunos,
  };
}

/* ================= WhatsApp ================= */

/** A aula de amanhã ainda sem lembrete: o relógio da véspera manda para cada aluno. */
export const precisaLembrete = (a: Pick<Agendamento, 'inicio' | 'status' | 'lembreteEnviadoEm'>, agora: Date) =>
  diaLocal(a.inicio) === somaDias(diaLocal(agora), 1) && a.status === 'agendado' && !a.lembreteEnviadoEm;

/** O botão do lembrete leva o agendamento e o aluno, para a resposta achar a aula. */
export const payloadDoLembrete = (acao: 'confirmar' | 'remarcar', agendamentoId: string, alunoId: string) =>
  `agenda:${acao}:${agendamentoId}:${alunoId}`;

export function lePayload(p: string | undefined | null) {
  const m = /^agenda:(confirmar|remarcar):([\w-]+):([\w-]+)$/.exec(p || '');
  return m ? { acao: m[1] as 'confirmar' | 'remarcar', agendamentoId: m[2], alunoId: m[3] } : null;
}

/** Dia da aula por extenso, para o lembrete: "quinta-feira, 26/11". */
export function diaPorExtenso(iso: string) {
  const dia = diaLocal(iso);
  const semana = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'][new Date(`${dia}T12:00:00Z`).getUTCDay()];
  return `${semana}, ${dia.slice(8, 10)}/${dia.slice(5, 7)}`;
}

/** "18h30", "9h" para o lembrete. */
export function horaFalada(iso: string) {
  const [h, m] = horaLocal(iso).split(':');
  return `${Number(h)}h${m === '00' ? '' : m}`;
}

/* ================= a agenda dentro da conversa ================= */

/** "quinta, 26/11, às 19h": como a aula aparece numa mensagem para o aluno. */
export const quandoFalado = (iso: string) => `${diaPorExtenso(iso).replace('-feira', '')}, às ${horaFalada(iso)}`;

const primeiroDe = (nome: string) => (nome || '').trim().split(/\s+/)[0] || '';

/** As próximas aulas de um aluno: as que ainda não acabaram, sem as canceladas e remarcadas. */
export function proximasAulas<T extends Pick<Agendamento, 'inicio' | 'fim' | 'status'>>(lista: T[], agora: Date, n = 3): T[] {
  return lista
    .filter((a) => ms(a.fim) > agora.getTime() && (a.status === 'agendado' || a.status === 'confirmado'))
    .sort((a, b) => ms(a.inicio) - ms(b.inicio))
    .slice(0, n);
}

/** As últimas aulas que já passaram e contam, da mais recente para trás. */
export function ultimasAulas<T extends Pick<Agendamento, 'inicio' | 'fim' | 'status'>>(lista: T[], agora: Date, n = 2): T[] {
  return lista
    .filter((a) => ms(a.fim) <= agora.getTime() && contaComoAula(a.status))
    .sort((a, b) => ms(b.inicio) - ms(a.inicio))
    .slice(0, n);
}

export type AvisoDeAula = 'marcada' | 'remarcada' | 'confirmada' | 'proxima';

/**
 * O texto que a equipe manda depois de mexer na agenda pela conversa. Ele vai para a
 * caixa de escrever, e quem envia é gente. Com o responsável, fala do aluno pelo nome.
 * Pessoa vai pelo nome sem artigo, como no resto do sistema.
 */
export function textoDoAviso(tipo: AvisoDeAula, o: {
  contato: string; aluno: string; paraResponsavel: boolean; inicio: string; professor?: string;
}) {
  const oi = primeiroDe(o.contato);
  const quando = quandoFalado(o.inicio);
  const com = o.professor ? `, com ${primeiroDe(o.professor)}` : '';
  const aula = o.paraResponsavel ? `a aula de ${primeiroDe(o.aluno)}` : 'tua aula';
  const Aula = aula[0].toUpperCase() + aula.slice(1);
  switch (tipo) {
    case 'marcada': return `Pronto, ${oi}! ${Aula} ficou marcada para ${quando}${com}. Qualquer coisa, é só chamar por aqui.`;
    case 'remarcada': return `Pronto, ${oi}! ${Aula} foi remarcada para ${quando}${com}.`;
    case 'confirmada': return `Combinado, ${oi}! Presença confirmada para ${quando}${com}. Até lá!`;
    default: return o.paraResponsavel
      ? `${oi}, a próxima aula de ${primeiroDe(o.aluno)} é ${quando}${com}.`
      : `${oi}, tua próxima aula é ${quando}${com}.`;
  }
}

/** O modelo aprovado que diz a mesma coisa quando a janela de 24 horas fechou. */
export function modeloDoAviso(tipo: AvisoDeAula, o: { contato: string; inicio: string }) {
  const valores = [primeiroDe(o.contato), diaPorExtenso(o.inicio), horaFalada(o.inicio)];
  if (tipo === 'remarcada') return { nome: 'aula_remarcada', valores };
  if (tipo === 'marcada') return { nome: 'aula_marcada', valores };
  return { nome: 'confirmacao_aula', valores };
}

export const ID_FALAR_COM_RECEPCAO = 'aulas-recepcao';

/**
 * A resposta do botão "Minhas aulas" do atendimento automático: a próxima aula do
 * aluno, lida da agenda, com Confirmar e Remarcar (os mesmos do lembrete da véspera)
 * e a saída para a Recepção. Texto fixo de propósito: dia e hora não passam pela IA.
 */
export function respostaDasAulas(o: {
  contato: string; aluno: string; paraResponsavel: boolean; alunoId: string;
  proxima: Pick<Agendamento, 'id' | 'inicio' | 'status'> & { professor?: string; aula?: string };
  depois?: string[];
}) {
  const oi = primeiroDe(o.contato);
  const de = o.paraResponsavel ? `A próxima aula de ${primeiroDe(o.aluno)}` : 'Tua próxima aula';
  const com = o.proxima.professor ? `, com ${primeiroDe(o.proxima.professor)}` : '';
  const qual = o.proxima.aula ? ` (${o.proxima.aula})` : '';
  const depois = (o.depois || []).slice(0, 2).map(quandoFalado);
  const confirmada = o.proxima.status === 'confirmado';
  const linhas = [
    `Oi, ${oi}! ${de} é ${quandoFalado(o.proxima.inicio)}${com}${qual}.`,
    ...(depois.length ? [`Depois: ${depois.join('; ')}.`] : []),
    confirmada ? 'A presença já está confirmada 👍' : 'Podemos contar contigo?',
  ];
  const botoes = [
    ...(confirmada ? [] : [{ id: payloadDoLembrete('confirmar', o.proxima.id, o.alunoId), titulo: 'Confirmar presença' }]),
    { id: payloadDoLembrete('remarcar', o.proxima.id, o.alunoId), titulo: 'Remarcar' },
    { id: ID_FALAR_COM_RECEPCAO, titulo: 'Falar com a recepção' },
  ];
  return { texto: linhas.join('\n'), botoes };
}

/**
 * O horário que a tela sugere para a próxima aula marcada pela conversa: o mesmo dia
 * da semana e hora da última aula do aluno, na primeira semana livre depois dela, com o
 * mesmo professor, módulo e modalidade, e a aula seguinte do currículo. Sem aula
 * nenhuma, amanhã às 19h. É só o ponto de partida: a pessoa muda no modal.
 */
export function sugereAula(lista: Agendamento[], agora: Date, curriculo: AulaDoCurriculo[] = []) {
  const ultima = lista.filter((a) => contaComoAula(a.status)).sort((a, b) => ms(b.inicio) - ms(a.inicio))[0];
  if (!ultima) {
    const inicio = new Date(`${somaDias(diaLocal(agora), 1)}T19:00:00-03:00`).toISOString();
    return { inicio, fim: new Date(ms(inicio) + 3_600_000).toISOString(), professorId: '', moduloId: '', aulaId: '', modalidade: 'presencial' as Modalidade };
  }
  const duracao = ms(ultima.fim) - ms(ultima.inicio);
  let ini = ms(ultima.inicio);
  do { ini += 7 * 86_400_000; } while (ini <= agora.getTime());
  const doModulo = curriculo.filter((c) => c.moduloId === ultima.moduloId && c.ativo).sort((a, b) => a.ordem - b.ordem);
  const i = doModulo.findIndex((c) => c.id === ultima.aulaId);
  return {
    inicio: new Date(ini).toISOString(), fim: new Date(ini + duracao).toISOString(),
    professorId: ultima.professorId, moduloId: ultima.moduloId,
    aulaId: i >= 0 && doModulo[i + 1] ? doModulo[i + 1].id : ultima.aulaId,
    modalidade: ultima.modalidade,
  };
}

/* ================= resumo do progresso ================= */

export interface AulaDoHistorico { inicio: string; aula: string; presenca: Presenca; obs: string; notas?: Notas | null }
export interface ResumoDoAluno { alunoId: string; nome: string; resumo: string; atencao: string[]; comIa: boolean; aulas: number }

const umaCasa = (n: number) => String(Math.round(n * 10) / 10).replace('.', ',');
const NOME_HABILIDADE: Record<Habilidade, string> = { fala: 'fala', leitura: 'leitura', escuta: 'escuta', escrita: 'escrita' };

/** O resumo sem IA: contas e as observações que pedem cuidado. É o que aparece
    quando a IA não está ligada, e é a base que a IA recebe. */
export function resumoSemIa(nome: string, historico: AulaDoHistorico[]): Omit<ResumoDoAluno, 'alunoId' | 'comIa'> {
  const primeiro = nome.split(' ')[0];
  if (!historico.length) return { nome, resumo: `${primeiro} ainda não tem aulas anteriores registradas.`, atencao: [], aulas: 0 };
  const presentes = historico.filter((h) => h.presenca === 'presente').length;
  const faltas = historico.filter((h) => h.presenca === 'faltou').length;
  const medias = HABILIDADES.map((hab) => {
    const v = historico.map((h) => h.notas?.[hab]).filter((n): n is number => typeof n === 'number');
    return { hab, media: v.length ? v.reduce((s, n) => s + n, 0) / v.length : null };
  });
  const comNota = medias.filter((m) => m.media !== null) as { hab: Habilidade; media: number }[];
  const partes = [`Nas últimas ${historico.length} aulas, ${primeiro} teve ${presentes} ${presentes === 1 ? 'presença' : 'presenças'} e ${faltas} ${faltas === 1 ? 'falta' : 'faltas'}.`];
  if (comNota.length) partes.push(`Notas médias: ${comNota.map((m) => `${NOME_HABILIDADE[m.hab]} ${umaCasa(m.media)}`).join(', ')}.`);
  const atencao: string[] = [];
  if (faltas >= 2) atencao.push(`${faltas} faltas nas últimas ${historico.length} aulas.`);
  for (const m of comNota) if (m.media < 7) atencao.push(`Nota baixa em ${NOME_HABILIDADE[m.hab]} (${umaCasa(m.media)}).`);
  for (const h of historico) {
    if (/revis|precis|trav|confund|atras|dificuld/i.test(h.obs)) atencao.push(`${h.obs} (${diaLocal(h.inicio).split('-').reverse().slice(0, 2).join('/')})`);
  }
  return { nome, resumo: partes.join(' '), atencao: atencao.slice(0, 5), aulas: historico.length };
}

/** O pedido para a IA: as últimas aulas de um aluno, e o que se quer de volta. */
export function promptDoResumo(nome: string, historico: AulaDoHistorico[]) {
  const linhas = historico.map((h) => {
    const n = h.notas ? HABILIDADES.filter((x) => typeof h.notas?.[x] === 'number').map((x) => `${x} ${h.notas?.[x]}`).join(', ') : '';
    return `- ${diaLocal(h.inicio)} | ${h.aula} | ${h.presenca || 'sem presença lançada'}${n ? ` | notas: ${n}` : ''}${h.obs ? ` | obs: ${h.obs}` : ''}`;
  }).join('\n');
  return `Você é coordenador pedagógico de uma escola de inglês (Nexus English Center Chapecó).
Escreva, em português do Brasil, um resumo curto do progresso do aluno ${nome} a partir das últimas aulas abaixo, para o professor ler antes da próxima aula.

Regras:
- resumo: no máximo 3 frases, direto, sem travessão, sem inventar nada que não esteja nas aulas.
- atencao: de 0 a 4 pontos de atenção curtos (faltas, dificuldade que se repete, nota baixa). Lista vazia se não houver.
- As notas vão de 0 a 10.

Últimas aulas (da mais recente para a mais antiga):
${linhas || '(nenhuma aula registrada)'}`;
}
