'use client';
/* O modal da aula: criar, editar, lançar presença, excluir, lembrete e resumo com IA.
   O professor da aula vê tudo, mas só mexe no status e no que é de cada aluno; o
   resto aparece travado (e o firestore.rules recusaria de qualquer jeito). */
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { busca, modoDemo } from '@/lib/dados/fonte';
import { useSessao } from '@/componentes/sessao';
import { avisa } from '@/componentes/aviso';
import { Ic } from '@/componentes/icones';
import { Busca, type Opcao } from './escolha';
import type { Cadastros } from './dados';
import { alunosDaAula, confere, exclui, gravaAula, type AlunoEditado, type Pedido, type Quem } from '@/lib/dados/agenda';
import {
  diaLocal, HABILIDADES, LISTA_STATUS, notaValida, ocorrencias, permissoesDe, problemasDoRascunho, resumoSemIa, STATUS,
  type Agendamento, type AlunoNaAula, type Conflito, type Escopo, type Modalidade, type Presenca, type RegraDeRepeticao,
  type ResumoDoAluno, type StatusAula, type TipoRecorrencia,
} from '@/lib/dominio/agenda';
import { paraCampoDeHora } from '@/lib/dominio/formato';

/* a aula nova pode vir já preenchida: da conversa, com o aluno e a sugestão de horário */
export type Abertura =
  | {
    tipo: 'nova'; inicio: string; fim: string;
    alunos?: { id: string; nome: string }[]; professorId?: string; moduloId?: string; aulaId?: string; modalidade?: Modalidade;
  }
  | { tipo: 'editar'; agendamento: Agendamento };

/** O que foi salvo, para quem abriu o modal (a conversa) preparar o aviso ao aluno. */
export interface AulaSalva { nova: boolean; inicio: string; professorId: string; mudouHorario: boolean; alunoIds: string[] }

/* quem vê as conversas de todos os setores acha a do aluno pelo id dele */
const VE_TODAS = ['admin', 'gestor', 'recepcao'];

const DIAS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
const NOME_DIA = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const NOME_HAB: Record<string, string> = { fala: 'Fala', leitura: 'Leitura', escuta: 'Escuta', escrita: 'Escrita' };
const deCampo = (v: string) => (v ? new Date(v).toISOString() : '');
const brData = (iso: string) => diaLocal(iso).split('-').reverse().join('/');

interface LinhaDeAluno extends AlunoEditado { resposta?: AlunoNaAula['resposta']; notasAbertas?: boolean; notasTexto?: Record<string, string> }

export default function ModalDaAula({ abertura, cad, aoFechar, aoSalvar }: {
  abertura: Abertura; cad: Cadastros; aoFechar: () => void; aoSalvar?: (a: AulaSalva) => void;
}) {
  const { perfil, usuario } = useSessao();
  const original = abertura.tipo === 'editar' ? abertura.agendamento : undefined;
  const pre = abertura.tipo === 'nova' ? abertura : undefined;
  const perm = permissoesDe(perfil?.papel, Boolean(original && perfil && original.professorId === perfil.id));
  const quem: Quem = { id: perfil?.id || '', nome: perfil?.nome || 'Equipe', papel: perfil?.papel || 'recepcao' };

  /* ---------- o formulário ---------- */
  const [status, setStatus] = useState<StatusAula>(original?.status || 'agendado');
  const [inicio, setInicio] = useState(paraCampoDeHora(new Date(original?.inicio || (abertura.tipo === 'nova' ? abertura.inicio : ''))));
  const [fim, setFim] = useState(paraCampoDeHora(new Date(original?.fim || (abertura.tipo === 'nova' ? abertura.fim : ''))));
  const [professorId, setProfessorId] = useState(original?.professorId || pre?.professorId || (perfil && cad.professores.some((p) => p.id === perfil.id) ? perfil.id : ''));
  const [moduloId, setModuloId] = useState(original?.moduloId || pre?.moduloId || '');
  const [aulaId, setAulaId] = useState(original?.aulaId || pre?.aulaId || '');
  const [modalidade, setModalidade] = useState<Modalidade>(original?.modalidade || pre?.modalidade || 'presencial');
  const [alunos, setAlunos] = useState<LinhaDeAluno[]>(original
    ? original.alunos.map((a) => ({ alunoId: a.id, nomeAluno: a.nome, presenca: a.presenca, obs: '' }))
    : (pre?.alunos || []).map((a) => ({ alunoId: a.id, nomeAluno: a.nome, presenca: null, obs: '' })));
  const [alunosAntes, setAlunosAntes] = useState<AlunoNaAula[] | null>(original ? null : []);
  const [escopo, setEscopo] = useState<Escopo>('este');
  const [repete, setRepete] = useState<'nao' | TipoRecorrencia>('nao');
  const [dias, setDias] = useState<number[]>([]);
  const [vezes, setVezes] = useState('8');
  const [ateData, setAteData] = useState('');
  const [modoFim, setModoFim] = useState<'vezes' | 'ate'>('vezes');

  /* ---------- o que acontece ---------- */
  const [erros, setErros] = useState<string[]>([]);
  const [conflitos, setConflitos] = useState<Conflito[] | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [confirmaExcluir, setConfirmaExcluir] = useState(false);
  const [resumos, setResumos] = useState<ResumoDoAluno[] | null>(null);
  const [pensando, setPensando] = useState(false);
  const [lembrete, setLembrete] = useState('');

  /* o atalho para a conversa de cada aluno da aula */
  const [conversaDe, setConversaDe] = useState<Record<string, string>>({});
  const idsDosAlunos = alunos.map((a) => a.alunoId).join('|');
  const veConversas = Boolean(perfil && VE_TODAS.includes(perfil.papel));
  useEffect(() => {
    if (!veConversas || !idsDosAlunos) return;
    let vivo = true;
    void Promise.all(idsDosAlunos.split('|').map(async (id) => {
      const achadas = await busca('conversas', [{ campo: 'alunoId', op: '==', valor: id }]).catch(() => []);
      return [id, achadas[0]?.id ? String(achadas[0].id) : ''] as const;
    })).then((pares) => { if (vivo) setConversaDe(Object.fromEntries(pares.filter(([, c]) => c))); });
    return () => { vivo = false; };
  }, [veConversas, idsDosAlunos]);

  /* a subcoleção traz obs, notas e a resposta ao lembrete de cada aluno */
  useEffect(() => {
    if (!original) return;
    let vivo = true;
    void alunosDaAula(original.id).then((lista) => {
      if (!vivo) return;
      setAlunosAntes(lista);
      setAlunos(lista.map((a) => ({ ...a, notas: a.notas })));
    });
    return () => { vivo = false; };
  }, [original]);

  const aulasDoModulo = useMemo(() => cad.aulas.filter((a) => a.moduloId === moduloId && (a.ativo || a.id === aulaId)), [cad.aulas, moduloId, aulaId]);
  const niveis = useMemo(() => [...new Set(aulasDoModulo.map((a) => a.nivel))], [aulasDoModulo]);
  const opProfessores: Opcao[] = cad.professores.map((p) => ({ id: p.id, nome: p.nome, cor: p.cor }));
  const opAlunos: Opcao[] = cad.alunos
    .filter((a) => a.ativo && !alunos.some((x) => x.alunoId === a.id))
    .map((a) => ({ id: a.id, nome: a.nome, detalhe: [a.nivel, a.responsavelNome ? `resp. ${a.responsavelNome}` : ''].filter(Boolean).join(' · ') }));
  const recorrente = Boolean(original?.recorrenciaId);
  const travado = !perm.editarDados;
  const regra: RegraDeRepeticao | null = !original && repete !== 'nao'
    ? { tipo: repete, diasDaSemana: repete === 'semanal' ? dias : undefined, ...(modoFim === 'vezes' ? { repeticoes: Math.max(1, Number(vezes) || 1) } : { ateData: ateData || null }) }
    : null;
  const previa = regra && inicio && fim ? ocorrencias(deCampo(inicio), deCampo(fim), regra) : [];
  const nomeDoProfessor = (id: string) => cad.professores.find((p) => p.id === id)?.nome || 'O professor';
  const nomeDoAluno = (id: string) => cad.alunos.find((a) => a.id === id)?.nome || alunos.find((a) => a.alunoId === id)?.nomeAluno || 'Um aluno';

  function trocaModulo(id: string) {
    setModuloId(id);
    setAulaId('');
    const m = cad.modulos.find((x) => x.id === id);
    if (m) setModalidade(m.modalidade);
  }
  function mudaAluno(id: string, campos: Partial<LinhaDeAluno>) {
    setAlunos((lista) => lista.map((a) => (a.alunoId === id ? { ...a, ...campos } : a)));
    setConflitos(null);
  }
  function poeAluno(id: string) {
    const a = cad.alunos.find((x) => x.id === id);
    if (!a) return;
    setAlunos((lista) => [...lista, { alunoId: a.id, nomeAluno: a.nome, presenca: null, obs: '' }]);
    setConflitos(null);
  }

  function pedido(pular: string[] = []): Pedido {
    return {
      quem,
      rascunho: {
        inicio: deCampo(inicio), fim: deCampo(fim), status, professorId, moduloId, aulaId, modalidade,
        alunos: alunos.map(({ alunoId, nomeAluno, presenca, obs, notas }) => ({ alunoId, nomeAluno, presenca, obs, notas })),
      },
      original, alunosOriginais: alunosAntes || [], escopo: recorrente ? escopo : 'este', regra, pular,
    };
  }

  async function salva(o: { forcar?: boolean; pular?: string[] } = {}) {
    if (!perfil) return;
    const p = pedido(o.pular);
    const problemas = problemasDoRascunho({ ...p.rascunho, alunos: p.rascunho.alunos });
    if (regra && !previa.length) problemas.push('A repetição não gera nenhuma aula. Confira os dias e o fim.');
    setErros(problemas);
    if (problemas.length) return;
    setSalvando(true);
    try {
      /* horário, professor e alunos mexem com conflito; status e presença não */
      const mexeAgenda = !original || p.rascunho.inicio !== original.inicio || p.rascunho.fim !== original.fim
        || professorId !== original.professorId || p.rascunho.alunos.map((a) => a.alunoId).join() !== original.alunoIds.join()
        || (status !== original.status && (original.status === 'cancelado' || original.status === 'remarcado'));
      if (mexeAgenda && !o.forcar) {
        const c = await confere(p, cad.bloqueios, { professor: nomeDoProfessor, aluno: nomeDoAluno });
        if (c.conflitos.length) { setConflitos(c.conflitos); return; }
      }
      const r = await gravaAula(p);
      avisa(r.criadas > 1 ? `${r.criadas} aulas criadas` : r.criadas ? 'Aula criada' : r.alteradas > 1 ? `${r.alteradas} aulas alteradas` : 'Aula salva');
      aoSalvar?.({
        nova: !original, inicio: p.rascunho.inicio, professorId,
        mudouHorario: Boolean(original && p.rascunho.inicio !== original.inicio), alunoIds: p.rascunho.alunos.map((a) => a.alunoId),
      });
      aoFechar();
    } catch (e) {
      setErros([e instanceof Error && /permission/i.test(e.message)
        ? 'O banco recusou: você não tem permissão para essa mudança.'
        : 'Não consegui salvar agora. Confira a internet e tente de novo.']);
    } finally {
      setSalvando(false);
    }
  }

  async function excluiAula() {
    if (!original) return;
    if (!confirmaExcluir) { setConfirmaExcluir(true); return; }
    setSalvando(true);
    try {
      const n = await exclui(quem, original, recorrente ? escopo : 'este');
      avisa(n > 1 ? `${n} aulas excluídas` : 'Aula excluída');
      aoFechar();
    } catch {
      setErros(['Não consegui excluir agora.']);
    } finally { setSalvando(false); }
  }

  async function chamaServidor(rota: string) {
    if (!usuario || !original) return null;
    const token = await usuario.getIdToken();
    const r = await fetch(rota, {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ agendamentoId: original.id }),
    });
    return (await r.json()) as Record<string, unknown>;
  }

  async function mandaLembrete() {
    if (modoDemo) { setLembrete('Na demonstração não sai WhatsApp: no sistema publicado, cada aluno recebe o lembrete com os botões Confirmar e Remarcar.'); return; }
    setLembrete('Enviando...');
    try {
      const r = await chamaServidor('/api/agenda/lembrete');
      setLembrete(String(r?.mensagem || r?.erro || 'Não consegui enviar.'));
    } catch { setLembrete('Não consegui falar com o servidor.'); }
  }

  async function pedeResumo() {
    if (!original) return;
    setPensando(true);
    try {
      if (modoDemo) {
        /* sem servidor na demonstração: o resumo sem IA, montado aqui com os mesmos dados */
        const lista: ResumoDoAluno[] = [];
        for (const a of alunos) {
          const docs = (await busca('agendamentos', [{ campo: 'alunoIds', op: 'contem', valor: a.alunoId }], 'inicio')) as unknown as Agendamento[];
          const ant = docs.filter((d) => d.inicio < original.inicio && d.status !== 'cancelado').slice(-5).reverse();
          const hist = [];
          for (const d of ant) {
            const sub = (await alunosDaAula(d.id)).find((x) => x.alunoId === a.alunoId);
            hist.push({ inicio: d.inicio, aula: cad.aulas.find((x) => x.id === d.aulaId)?.nome || '', presenca: sub?.presenca ?? null, obs: sub?.obs || '', notas: sub?.notas });
          }
          lista.push({ alunoId: a.alunoId, comIa: false, ...resumoSemIa(a.nomeAluno, hist) });
        }
        setResumos(lista);
        return;
      }
      const r = await chamaServidor('/api/agenda/resumo');
      if (r?.ok) setResumos(r.resumos as ResumoDoAluno[]);
      else setErros([String(r?.erro || 'O resumo não saiu.')]);
    } catch {
      setErros(['Não consegui falar com o servidor.']);
    } finally { setPensando(false); }
  }

  const titulo = original ? (perm.editarDados ? 'Editar aula' : 'Lançar aula') : 'Nova aula';
  const pulaveis = conflitos && regra ? [...new Set(conflitos.map((c) => c.inicio))] : [];

  return (
    <div className="mod ag-mod" onMouseDown={(e) => { if (e.target === e.currentTarget) aoFechar(); }}>
      <form className="mod-c ag-mc" role="dialog" aria-modal="true" aria-label={titulo} onSubmit={(e) => { e.preventDefault(); void salva(); }}>
        <header className="ag-mh">
          <h2>{titulo}</h2>
          {original && <span className="ag-pill" style={{ background: STATUS[original.status].cor }}>{STATUS[original.status].nome}</span>}
          {recorrente && <span className="ag-serie"><Ic n="relogio" /> Faz parte de uma série</span>}
          <button type="button" className="ib" aria-label="Fechar" onClick={aoFechar}><Ic n="x" /></button>
        </header>

        <div className="ag-mb">
          <div className="ag-campos">
            <label className="ag-c"><span>Status</span>
              <select className="cx" value={status} disabled={!perm.editarStatus} onChange={(e) => setStatus(e.target.value as StatusAula)}>
                {LISTA_STATUS.map((s) => <option key={s} value={s}>{STATUS[s].nome}</option>)}
              </select>
            </label>
            <label className="ag-c"><span>Início</span>
              <input className="cx num" type="datetime-local" step={900} value={inicio} disabled={!perm.remarcar}
                     onChange={(e) => { setInicio(e.target.value); setConflitos(null); }} />
            </label>
            <label className="ag-c"><span>Fim</span>
              <input className="cx num" type="datetime-local" step={900} value={fim} disabled={!perm.remarcar}
                     onChange={(e) => { setFim(e.target.value); setConflitos(null); }} />
            </label>
            <div className="ag-c largo"><span>Professor</span>
              <Busca rotulo="Professor" opcoes={opProfessores} valor={professorId} desabilitado={travado}
                     placeholder="Procurar professor" aoEscolher={(id) => { setProfessorId(id); setConflitos(null); }} />
            </div>
            <label className="ag-c"><span>Módulo</span>
              <select className="cx" value={moduloId} disabled={travado} onChange={(e) => trocaModulo(e.target.value)}>
                <option value="">Escolha</option>
                {cad.modulos.filter((m) => m.ativo || m.id === moduloId).map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
              </select>
            </label>
            <label className="ag-c"><span>Aula</span>
              <select className="cx" value={aulaId} disabled={travado || !moduloId} onChange={(e) => setAulaId(e.target.value)}>
                <option value="">{moduloId ? 'Escolha a aula' : 'Escolha o módulo antes'}</option>
                {niveis.map((n) => (
                  <optgroup key={n} label={n}>
                    {aulasDoModulo.filter((a) => a.nivel === n).map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}
                  </optgroup>
                ))}
              </select>
            </label>
            <div className="ag-c"><span>Modalidade</span>
              <div className="ag-seg" role="group" aria-label="Modalidade">
                {(['presencial', 'online'] as Modalidade[]).map((m) => (
                  <button key={m} type="button" aria-pressed={modalidade === m} disabled={travado} onClick={() => setModalidade(m)}>
                    {m === 'presencial' ? 'Presencial' : 'Online'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {!original && perm.criar && (
            <fieldset className="ag-rep">
              <legend>Repetir</legend>
              <div className="ag-seg" role="group" aria-label="Repetição">
                {([['nao', 'Não repete'], ['diaria', 'Todo dia'], ['semanal', 'Toda semana'], ['mensal', 'Todo mês']] as const).map(([v, n]) => (
                  <button key={v} type="button" aria-pressed={repete === v} onClick={() => setRepete(v)}>{n}</button>
                ))}
              </div>
              {repete === 'semanal' && (
                <div className="ag-dias" role="group" aria-label="Dias da semana">
                  {DIAS.map((d, i) => (
                    <button key={i} type="button" aria-pressed={dias.includes(i) || Boolean(!dias.length && inicio && new Date(inicio).getDay() === i)}
                            title={NOME_DIA[i]} onClick={() => setDias((x) => (x.includes(i) ? x.filter((y) => y !== i) : [...x, i]))}>{d}</button>
                  ))}
                </div>
              )}
              {repete !== 'nao' && (
                <div className="ag-fim">
                  <label><input type="radio" checked={modoFim === 'vezes'} onChange={() => setModoFim('vezes')} /> Repetir
                    <input className="cx num" type="number" min={2} max={120} value={vezes} onChange={(e) => setVezes(e.target.value)} disabled={modoFim !== 'vezes'} /> vezes
                  </label>
                  <label><input type="radio" checked={modoFim === 'ate'} onChange={() => setModoFim('ate')} /> Até
                    <input className="cx num" type="date" value={ateData} onChange={(e) => setAteData(e.target.value)} disabled={modoFim !== 'ate'} />
                  </label>
                  <p className="obs">
                    {previa.length > 1
                      ? `${previa.length} aulas, de ${brData(previa[0].inicio)} a ${brData(previa[previa.length - 1].inicio)}.`
                      : 'Escolha até quando repete.'}
                  </p>
                </div>
              )}
            </fieldset>
          )}

          <section className="ag-turma">
            <div className="ag-al-h">
              <h3>Alunos <span className="num">{alunos.length}</span></h3>
              {perm.trocarAlunos && (
                <Busca rotulo="Adicionar aluno" opcoes={opAlunos} valor="" limpaDepois placeholder="Adicionar aluno (digite o nome)" aoEscolher={poeAluno} />
              )}
            </div>
            {original && alunosAntes === null && <p className="vz">Carregando os alunos...</p>}
            {!alunos.length && alunosAntes !== null && <p className="vz">Nenhum aluno ainda. {perm.trocarAlunos ? 'Procure pelo nome acima.' : ''}</p>}
            <ul>
              {alunos.map((a) => (
                <li key={a.alunoId} className={a.presenca === 'faltou' ? 'falta' : undefined}>
                  <div className="ag-al-l">
                    <b>{a.nomeAluno}</b>
                    {conversaDe[a.alunoId] && (
                      <Link className="ib ag-conversa" href={`/conversas?conversa=${conversaDe[a.alunoId]}`}
                            title={`Abrir a conversa de ${a.nomeAluno}`} aria-label={`Abrir a conversa de ${a.nomeAluno}`}>
                        <Ic n="chat" />
                      </Link>
                    )}
                    {a.resposta === 'confirmou' && <span className="ag-resp ok">confirmou no WhatsApp</span>}
                    {a.resposta === 'remarcar' && <span className="ag-resp">pediu para remarcar</span>}
                    <div className="ag-pres" role="group" aria-label={`Presença de ${a.nomeAluno}`}>
                      {([[null, 'Sem presença'], ['presente', 'Presente'], ['faltou', 'Faltou']] as [Presenca, string][]).map(([v, n]) => (
                        <button key={n} type="button" aria-pressed={a.presenca === v} disabled={!perm.lancarPresenca}
                                className={v || 'sem'} onClick={() => mudaAluno(a.alunoId, { presenca: v })}>{n}</button>
                      ))}
                    </div>
                    <button type="button" className="tx-btn" aria-expanded={Boolean(a.notasAbertas)}
                            onClick={() => mudaAluno(a.alunoId, { notasAbertas: !a.notasAbertas })}>
                      Notas{a.notas && Object.values(a.notas).some((n) => typeof n === 'number') ? ' ✓' : ''}
                    </button>
                    {perm.trocarAlunos && (
                      <button type="button" className="ib" title={`Tirar ${a.nomeAluno} da aula`} aria-label={`Tirar ${a.nomeAluno} da aula`}
                              onClick={() => { setAlunos((l) => l.filter((x) => x.alunoId !== a.alunoId)); setConflitos(null); }}>
                        <Ic n="x" />
                      </button>
                    )}
                  </div>
                  <textarea className="cx" rows={1} placeholder="Observação sobre o aluno nesta aula" value={a.obs} disabled={!perm.lancarPresenca}
                            onChange={(e) => mudaAluno(a.alunoId, { obs: e.target.value })} />
                  {a.notasAbertas && (
                    <div className="ag-notas">
                      {HABILIDADES.map((h) => (
                        <label key={h}><span>{NOME_HAB[h]}</span>
                          <input className="cx num" inputMode="decimal" placeholder="0 a 10" disabled={!perm.lancarPresenca}
                                 value={a.notasTexto?.[h] ?? (typeof a.notas?.[h] === 'number' ? String(a.notas?.[h]).replace('.', ',') : '')}
                                 onChange={(e) => {
                                   const texto = e.target.value;
                                   mudaAluno(a.alunoId, {
                                     notasTexto: { ...(a.notasTexto || {}), [h]: texto },
                                     notas: { ...(a.notas || {}), [h]: notaValida(texto) },
                                   });
                                 }} />
                        </label>
                      ))}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>

          {recorrente && (perm.editarDados || perm.excluir) && (
            <fieldset className="ag-escopo">
              <legend>Aplicar alteração em</legend>
              <label><input type="radio" checked={escopo === 'este'} onChange={() => setEscopo('este')} /> Só este</label>
              <label><input type="radio" checked={escopo === 'proximos'} onChange={() => setEscopo('proximos')} /> Este e os próximos</label>
              {escopo === 'proximos' && <p className="obs">Horário, professor, módulo, aula, modalidade e alunos vão para as próximas. Status e presença ficam em cada aula.</p>}
            </fieldset>
          )}

          {resumos && (
            <section className="ag-resumo" aria-live="polite">
              <h3>Resumo {resumos.some((r) => r.comIa) ? 'com IA' : 'das últimas aulas'}</h3>
              {resumos.map((r) => (
                <div key={r.alunoId}>
                  <b>{r.nome}</b>
                  <p>{r.resumo}</p>
                  {r.atencao.length > 0 && <ul>{r.atencao.map((t) => <li key={t}>{t}</li>)}</ul>}
                </div>
              ))}
              {!resumos.some((r) => r.comIa) && <p className="obs">Sem a IA ligada, este é o resumo pelas contas e observações das últimas 5 aulas.</p>}
            </section>
          )}

          {lembrete && <p className="obs ag-msg">{lembrete}</p>}
          {erros.length > 0 && <div className="ag-erro" role="alert">{erros.map((e) => <p key={e}>{e}</p>)}</div>}
          {conflitos && (
            <div className="ag-conf" role="alert">
              <b>Conflito de horário</b>
              <ul>{conflitos.slice(0, 6).map((c, i) => <li key={i}>{c.mensagem}</li>)}</ul>
              {conflitos.length > 6 && <p>E mais {conflitos.length - 6}.</p>}
              <div className="ag-conf-a">
                {regra && pulaveis.length > 0 && pulaveis.length < previa.length && (
                  <button type="button" className="btn" disabled={salvando} onClick={() => void salva({ pular: pulaveis })}>
                    Criar sem as {pulaveis.length} {pulaveis.length === 1 ? 'data' : 'datas'} com conflito
                  </button>
                )}
                {perm.forcarConflito
                  ? <button type="button" className="btn" disabled={salvando} onClick={() => void salva({ forcar: true })}>Salvar mesmo assim</button>
                  : <p className="obs">Só a administração pode salvar por cima de um conflito. Mude o horário ou fale com ela.</p>}
              </div>
            </div>
          )}
        </div>

        <footer className="ag-mf">
          {original && perm.excluir && (
            <button type="button" className={confirmaExcluir ? 'btn perigo' : 'tx-btn perigo'} disabled={salvando} onClick={() => void excluiAula()}>
              {confirmaExcluir ? (recorrente && escopo === 'proximos' ? 'Confirmar: excluir esta e as próximas' : 'Confirmar exclusão') : 'Excluir'}
            </button>
          )}
          <span className="ag-mf-meio">
            {original && (
              <>
                <button type="button" className="btn" disabled={pensando} onClick={() => void pedeResumo()}>
                  <Ic n="raio" />{pensando ? 'Pensando...' : 'Resumo com IA'}
                </button>
                {perm.editarDados && (
                  <button type="button" className="btn" onClick={() => void mandaLembrete()}>
                    <Ic n="chat" />{original.lembreteEnviadoEm ? 'Reenviar lembrete' : 'Enviar lembrete no WhatsApp'}
                  </button>
                )}
              </>
            )}
          </span>
          {(perm.editarStatus || perm.criar) && (
            <button type="submit" className="btn p" disabled={salvando}>{salvando ? 'Salvando...' : 'Salvar'}</button>
          )}
        </footer>
      </form>
    </div>
  );
}
