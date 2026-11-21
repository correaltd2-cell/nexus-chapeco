'use client';
/* Quem grava a agenda pelo navegador. Cada ação vai num lote só (a aula, os alunos dela
   e a linha do log valem juntos ou não valem) e passa pelas regras de
   src/lib/dominio/agenda.ts antes. O firestore.rules confere de novo quem pode o quê:
   o professor que tentar mais do que presença e status é recusado lá.
   Os ids da subcoleção de alunos são o próprio id do aluno. */
import { APAGAR, busca, grava, novoId, type Campos, type OpGravacao } from './fonte';
import {
  atingidos, CAMPOS_DA_SERIE, conflitosDe, deslocaHorario, ocorrencias, retrato,
  type AcaoLog, type Agendamento, type AlunoNaAula, type Bloqueio, type Conflito, type Escopo, type Notas,
  type Rascunho, type RegraDeRepeticao,
} from '@/lib/dominio/agenda';
import type { Papel } from '@/lib/dominio/tipos';

export interface Quem { id: string; nome: string; papel: Papel }

export type AlunoEditado = Pick<AlunoNaAula, 'alunoId' | 'nomeAluno' | 'presenca' | 'obs'> & { notas?: Notas };

export interface Pedido {
  quem: Quem;
  rascunho: Omit<Rascunho, 'alunos'> & { alunos: AlunoEditado[] };
  original?: Agendamento;              // edição
  alunosOriginais?: AlunoNaAula[];     // a subcoleção como estava ao abrir
  escopo: Escopo;
  regra?: RegraDeRepeticao | null;     // criação que se repete
  pular?: string[];                    // inícios das ocorrências que ficam de fora
}

const agora = () => new Date().toISOString();
const DIA = 86_400_000;

/* ---------------- leitura ---------------- */

export async function alunosDaAula(agendamentoId: string): Promise<AlunoNaAula[]> {
  const docs = await busca(`agendamentos/${agendamentoId}/alunos`, []);
  return docs.map((d) => ({
    alunoId: String(d.alunoId || d.id), nomeAluno: String(d.nomeAluno || ''),
    presenca: (d.presenca as AlunoNaAula['presenca']) ?? null, obs: String(d.obs || ''),
    notas: (d.notas as Notas | undefined) || undefined,
    resposta: (d.resposta as AlunoNaAula['resposta']) ?? null, respostaEm: (d.respostaEm as string | null) ?? null,
  }));
}

/** As aulas entre duas datas (com folga de um dia), para conferir conflito. */
async function aulasEntre(de: string, ate: string) {
  const docs = await busca('agendamentos', [
    { campo: 'inicio', op: '>=', valor: new Date(new Date(de).getTime() - DIA).toISOString() },
    { campo: 'inicio', op: '<', valor: new Date(new Date(ate).getTime() + DIA).toISOString() },
  ]);
  return docs as unknown as Agendamento[];
}

async function serieDe(recorrenciaId: string) {
  return (await busca('agendamentos', [{ campo: 'recorrenciaId', op: '==', valor: recorrenciaId }])) as unknown as Agendamento[];
}

/* ---------------- montagem ---------------- */

const resumo = (alunos: AlunoEditado[]) => alunos.map((a) => ({ id: a.alunoId, nome: a.nomeAluno, presenca: a.presenca ?? null }));

function docDoAluno(a: AlunoEditado) {
  return {
    alunoId: a.alunoId, nomeAluno: a.nomeAluno, presenca: a.presenca ?? null, obs: a.obs || '',
    ...(a.notas && Object.values(a.notas).some((n) => typeof n === 'number') ? { notas: a.notas } : {}),
    resposta: null, respostaEm: null,
  };
}

function opLog(quem: Quem, agendamentoId: string, acao: AcaoLog, antes: unknown, depois: unknown): OpGravacao {
  return {
    tipo: 'definir', colecao: 'logs_agenda', id: novoId('logs_agenda'),
    campos: {
      agendamentoId, acao, usuarioId: quem.id, usuarioNome: quem.nome,
      antes: (antes ?? null) as Campos | null, depois: (depois ?? null) as Campos | null, data: agora(),
    },
  };
}

/** Que ação foi essa, para o log: só status, só presença, ou edição. */
function acaoDaEdicao(antes: Agendamento, r: Pedido['rascunho'], alunosAntes: AlunoNaAula[]): AcaoLog {
  const mudouDados = r.inicio !== antes.inicio || r.fim !== antes.fim || CAMPOS_DA_SERIE.some((c) => r[c] !== antes[c])
    || r.alunos.map((a) => a.alunoId).join() !== alunosAntes.map((a) => a.alunoId).join();
  if (mudouDados) return 'editou';
  const mudouPresenca = r.alunos.some((a) => {
    const b = alunosAntes.find((x) => x.alunoId === a.alunoId);
    return !b || b.presenca !== (a.presenca ?? null) || (b.obs || '') !== (a.obs || '') || JSON.stringify(b.notas || null) !== JSON.stringify(a.notas || null);
  });
  if (mudouPresenca) return 'lancou_presenca';
  return 'mudou_status';
}

/* ---------------- conflitos ---------------- */

export interface Conferencia {
  ocorrencias: { inicio: string; fim: string }[];
  conflitos: Conflito[];
}

/** Confere o pedido contra a agenda e os bloqueios, ocorrência por ocorrência. */
export async function confere(
  p: Pedido, bloqueios: Bloqueio[], nomes: Parameters<typeof conflitosDe>[3] = {},
): Promise<Conferencia> {
  const r = p.rascunho;
  const alunoIds = r.alunos.map((a) => a.alunoId);
  let candidatas: { id?: string; inicio: string; fim: string }[];
  let ignorar = new Set<string>();

  if (!p.original) {
    candidatas = p.regra ? ocorrencias(r.inicio, r.fim, p.regra) : [{ inicio: r.inicio, fim: r.fim }];
    const pular = new Set(p.pular || []);
    candidatas = candidatas.filter((c) => !pular.has(c.inicio));
  } else if (p.escopo === 'proximos' && p.original.recorrenciaId) {
    const serie = atingidos(await serieDe(p.original.recorrenciaId), p.original, 'proximos');
    ignorar = new Set(serie.map((a) => a.id));
    candidatas = serie.map((a) => ({ id: a.id, ...(a.id === p.original?.id ? { inicio: r.inicio, fim: r.fim } : deslocaHorario(a, p.original as Agendamento, r)) }));
  } else {
    candidatas = [{ id: p.original.id, inicio: r.inicio, fim: r.fim }];
  }
  if (!candidatas.length) return { ocorrencias: [], conflitos: [] };

  const de = candidatas[0].inicio;
  const ate = candidatas[candidatas.length - 1].fim;
  const existentes = await aulasEntre(de, ate);
  const conflitos = candidatas.flatMap((c) =>
    conflitosDe({ ...c, professorId: r.professorId, alunoIds }, existentes, bloqueios, nomes, ignorar));
  return { ocorrencias: candidatas.map(({ inicio, fim }) => ({ inicio, fim })), conflitos };
}

/* ---------------- gravar ---------------- */

/** Cria (com a série, se repete) ou edita (só este, ou este e os próximos). */
export async function gravaAula(p: Pedido): Promise<{ criadas: number; alteradas: number }> {
  const r = p.rascunho;
  const quem = p.quem;
  const quando = agora();
  const ops: OpGravacao[] = [];
  const alunoIds = r.alunos.map((a) => a.alunoId);

  /* ---- criação ---- */
  if (!p.original) {
    const pular = new Set(p.pular || []);
    const lista = (p.regra ? ocorrencias(r.inicio, r.fim, p.regra) : [{ inicio: r.inicio, fim: r.fim }])
      .filter((o) => !pular.has(o.inicio));
    const recorrenciaId = p.regra && lista.length > 1 ? novoId('recorrencias') : null;
    if (recorrenciaId && p.regra) {
      ops.push({
        tipo: 'definir', colecao: 'recorrencias', id: recorrenciaId,
        campos: {
          tipo: p.regra.tipo, repeticoes: p.regra.repeticoes ?? null, ateData: p.regra.ateData ?? null,
          diasDaSemana: p.regra.diasDaSemana || [], criadoPor: quem.id, criadoEm: quando,
        },
      });
    }
    for (const o of lista) {
      const id = novoId('agendamentos');
      const doc = {
        inicio: o.inicio, fim: o.fim, status: r.status, professorId: r.professorId, moduloId: r.moduloId,
        aulaId: r.aulaId, modalidade: r.modalidade, recorrenciaId, lembreteEnviadoEm: null,
        alunoIds, alunos: resumo(r.alunos), criadoPor: quem.id, criadoEm: quando, atualizadoPor: quem.id, atualizadoEm: quando,
      };
      ops.push({ tipo: 'definir', colecao: 'agendamentos', id, campos: doc });
      for (const a of r.alunos) ops.push({ tipo: 'definir', colecao: `agendamentos/${id}/alunos`, id: a.alunoId, campos: docDoAluno(a) });
      ops.push(opLog(quem, id, 'criou', null, retrato({ ...doc, alunosDaAula: r.alunos })));
    }
    await grava(ops);
    return { criadas: lista.length, alteradas: 0 };
  }

  /* ---- edição: o alvo ---- */
  const antes = p.original;
  const alunosAntes = p.alunosOriginais || [];
  const mudou: Campos = {};
  const novo = {
    inicio: r.inicio, fim: r.fim, status: r.status, professorId: r.professorId, moduloId: r.moduloId,
    aulaId: r.aulaId, modalidade: r.modalidade,
  };
  for (const [k, v] of Object.entries(novo)) if (antes[k as keyof Agendamento] !== v) mudou[k] = v;
  const novoResumo = resumo(r.alunos);
  if (JSON.stringify(novoResumo) !== JSON.stringify(antes.alunos)) mudou.alunos = novoResumo;
  if (alunoIds.join() !== (antes.alunoIds || []).join()) mudou.alunoIds = alunoIds;
  /* status que muda depois do lembrete não apaga o selo: o lembrete saiu */
  ops.push({ tipo: 'atualizar', colecao: 'agendamentos', id: antes.id, campos: { ...mudou, atualizadoPor: quem.id, atualizadoEm: quando } });

  for (const a of alunosAntes) {
    if (!alunoIds.includes(a.alunoId)) ops.push({ tipo: 'apagar', colecao: `agendamentos/${antes.id}/alunos`, id: a.alunoId });
  }
  for (const a of r.alunos) {
    const b = alunosAntes.find((x) => x.alunoId === a.alunoId);
    if (!b) { ops.push({ tipo: 'definir', colecao: `agendamentos/${antes.id}/alunos`, id: a.alunoId, campos: docDoAluno(a) }); continue; }
    const campos: Campos = {};
    if ((b.presenca ?? null) !== (a.presenca ?? null)) campos.presenca = a.presenca ?? null;
    if ((b.obs || '') !== (a.obs || '')) campos.obs = a.obs || '';
    if (JSON.stringify(b.notas || null) !== JSON.stringify(a.notas || null)) {
      campos.notas = a.notas && Object.values(a.notas).some((n) => typeof n === 'number') ? a.notas : APAGAR;
    }
    if (Object.keys(campos).length) ops.push({ tipo: 'atualizar', colecao: `agendamentos/${antes.id}/alunos`, id: a.alunoId, campos });
  }
  ops.push(opLog(quem, antes.id, acaoDaEdicao(antes, r, alunosAntes),
    retrato({ ...antes, alunosDaAula: alunosAntes }), retrato({ ...antes, ...novo, alunosDaAula: r.alunos })));

  /* ---- edição: este e os próximos ---- */
  let alteradas = 1;
  if (p.escopo === 'proximos' && antes.recorrenciaId) {
    const serie = atingidos(await serieDe(antes.recorrenciaId), antes, 'proximos').filter((a) => a.id !== antes.id);
    const tirados = (antes.alunoIds || []).filter((id) => !alunoIds.includes(id));
    const postos = r.alunos.filter((a) => !(antes.alunoIds || []).includes(a.alunoId));
    const mudouHorario = r.inicio !== antes.inicio || r.fim !== antes.fim;
    for (const o of serie) {
      const campos: Campos = {};
      if (mudouHorario) Object.assign(campos, deslocaHorario(o, antes, r));
      for (const c of CAMPOS_DA_SERIE) if (r[c] !== antes[c] && o[c] !== r[c]) campos[c] = r[c];
      if (tirados.length || postos.length) {
        const ficam = (o.alunos || []).filter((x) => !tirados.includes(x.id));
        const novos = postos.filter((x) => !ficam.some((f) => f.id === x.alunoId)).map((x) => ({ id: x.alunoId, nome: x.nomeAluno, presenca: null }));
        campos.alunos = [...ficam, ...novos];
        campos.alunoIds = [...ficam, ...novos].map((x) => x.id);
        for (const id of tirados) if ((o.alunoIds || []).includes(id)) ops.push({ tipo: 'apagar', colecao: `agendamentos/${o.id}/alunos`, id });
        for (const x of postos) {
          if (!(o.alunoIds || []).includes(x.alunoId)) {
            ops.push({ tipo: 'definir', colecao: `agendamentos/${o.id}/alunos`, id: x.alunoId, campos: docDoAluno({ ...x, presenca: null, obs: '', notas: undefined }) });
          }
        }
      }
      if (!Object.keys(campos).length) continue;
      ops.push({ tipo: 'atualizar', colecao: 'agendamentos', id: o.id, campos: { ...campos, atualizadoPor: quem.id, atualizadoEm: quando } });
      ops.push(opLog(quem, o.id, 'editou', retrato(o), retrato({ ...o, ...(campos as Partial<Agendamento>) })));
      alteradas += 1;
    }
  }
  await grava(ops);
  return { criadas: 0, alteradas };
}

/** A equipe confirmou a presença pela conversa: o aluno fica como quem confirmou (como
    no botão do lembrete) e a aula agendada vira confirmada, com o log. */
export async function confirmaPresenca(quem: Quem, ag: Agendamento, alunoId: string) {
  const quando = agora();
  const ops: OpGravacao[] = [
    { tipo: 'atualizar', colecao: `agendamentos/${ag.id}/alunos`, id: alunoId, campos: { resposta: 'confirmou', respostaEm: quando } },
  ];
  if (ag.status === 'agendado') {
    ops.push({ tipo: 'atualizar', colecao: 'agendamentos', id: ag.id, campos: { status: 'confirmado', atualizadoPor: quem.id, atualizadoEm: quando } });
    ops.push(opLog(quem, ag.id, 'mudou_status', { status: ag.status }, { status: 'confirmado' }));
  }
  await grava(ops);
}

/** Arrastar ou esticar no calendário: muda só o horário (da série, se escolhido). */
export async function remarca(quem: Quem, alvo: Agendamento, novo: { inicio: string; fim: string }, escopo: Escopo) {
  const quando = agora();
  const lista = escopo === 'proximos' && alvo.recorrenciaId ? atingidos(await serieDe(alvo.recorrenciaId), alvo, 'proximos') : [alvo];
  const ops: OpGravacao[] = [];
  for (const o of lista) {
    const h = o.id === alvo.id ? novo : deslocaHorario(o, alvo, novo);
    ops.push({ tipo: 'atualizar', colecao: 'agendamentos', id: o.id, campos: { ...h, atualizadoPor: quem.id, atualizadoEm: quando } });
    ops.push(opLog(quem, o.id, 'editou', { inicio: o.inicio, fim: o.fim }, h));
  }
  await grava(ops);
  return lista.length;
}

/** Confere conflito de um arraste antes de gravar. */
export async function confereRemarcacao(alvo: Agendamento, novo: { inicio: string; fim: string }, escopo: Escopo, bloqueios: Bloqueio[], nomes: Parameters<typeof conflitosDe>[3] = {}) {
  const lista = escopo === 'proximos' && alvo.recorrenciaId ? atingidos(await serieDe(alvo.recorrenciaId), alvo, 'proximos') : [alvo];
  const candidatas = lista.map((o) => ({ ...o, ...(o.id === alvo.id ? novo : deslocaHorario(o, alvo, novo)) }));
  const existentes = await aulasEntre(candidatas[0].inicio, candidatas[candidatas.length - 1].fim);
  const ignorar = new Set(lista.map((o) => o.id));
  return candidatas.flatMap((c) => conflitosDe(c, existentes, bloqueios, nomes, ignorar));
}

export async function exclui(quem: Quem, alvo: Agendamento, escopo: Escopo) {
  const lista = escopo === 'proximos' && alvo.recorrenciaId ? atingidos(await serieDe(alvo.recorrenciaId), alvo, 'proximos') : [alvo];
  const ops: OpGravacao[] = [];
  for (const o of lista) {
    for (const id of o.alunoIds || []) ops.push({ tipo: 'apagar', colecao: `agendamentos/${o.id}/alunos`, id });
    ops.push({ tipo: 'apagar', colecao: 'agendamentos', id: o.id });
    ops.push(opLog(quem, o.id, 'excluiu', retrato(o), null));
  }
  await grava(ops);
  return lista.length;
}

/* ---------------- bloqueios ---------------- */

export async function gravaBloqueio(quem: Quem, b: Omit<Bloqueio, 'id'> & { id?: string }) {
  const id = b.id || novoId('bloqueios');
  await grava([{
    tipo: 'definir', colecao: 'bloqueios', id,
    campos: { tipo: b.tipo, professorId: b.professorId || null, inicio: b.inicio, fim: b.fim, motivo: b.motivo.trim(), criadoPor: b.criadoPor || quem.id, criadoEm: b.criadoEm || agora() },
  }]);
}

export const excluiBloqueio = (id: string) => grava([{ tipo: 'apagar', colecao: 'bloqueios', id }]);
