'use client';
/* O relatório da agenda: filtros, indicadores, aulas por professor, a lista com os
   alunos de cada aula e, quando um aluno só está escolhido, a linha do tempo dele com a
   evolução das notas. Exporta CSV (abre no Excel) e tem versão para imprimir.
   Bloqueios ficam fora, a não ser que a pessoa peça. */
import { useEffect, useMemo, useState } from 'react';
import { useSessao } from '@/componentes/sessao';
import { Ic } from '@/componentes/icones';
import { useAgora, horaConhecida } from '@/componentes/relogio';
import { alunosDaAula } from '@/lib/dados/agenda';
import {
  BLOQUEIOS, csv, diaLocal, filtra, HABILIDADES, horaLocal, indicadores, LISTA_STATUS, mediaDas, permissoesDe, STATUS,
  type Agendamento, type AlunoNaAula, type Modalidade, type StatusAula,
} from '@/lib/dominio/agenda';
import { useAgendamentos, useCadastros } from './dados';
import { Multi } from './escolha';
import AbasDaAgenda from './abas';
import { BarrasPorProfessor, EvolucaoDasNotas } from './graficos';

const hojeLocal = () => diaLocal(new Date());
const menosDias = (dia: string, n: number) => {
  const d = new Date(`${dia}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
};
const br = (dia: string) => dia.split('-').reverse().join('/');
const nota = (n?: number | null) => (typeof n === 'number' ? String(n).replace('.', ',') : '');
const NOME_PRESENCA = { presente: 'Presente', faltou: 'Faltou' } as const;

export default function RelatorioDaAgenda() {
  const { perfil } = useSessao();
  const cad = useCadastros();
  const agora = useAgora();
  const [de, setDe] = useState(() => menosDias(hojeLocal(), 30));
  const [ate, setAte] = useState(hojeLocal);
  const [professorIds, setProfessorIds] = useState<string[]>([]);
  const [alunoIds, setAlunoIds] = useState<string[]>([]);
  const [situacao, setSituacao] = useState<'ativos' | 'inativos' | 'ambos'>('ambos');
  const [moduloIds, setModuloIds] = useState<string[]>([]);
  const [aulaIds, setAulaIds] = useState<string[]>([]);
  const [status, setStatus] = useState<StatusAula[]>([]);
  const [presenca, setPresenca] = useState<'presente' | 'faltou' | 'sem' | null>(null);
  const [modalidade, setModalidade] = useState<Modalidade | null>(null);
  const [comBloqueios, setComBloqueios] = useState(false);
  const [detalhes, setDetalhes] = useState<Record<string, AlunoNaAula[]>>({});

  const deIso = de ? new Date(`${de}T00:00:00-03:00`).toISOString() : '';
  const ateIso = ate ? new Date(`${menosDias(ate, -1)}T00:00:00-03:00`).toISOString() : '';
  const { agendamentos } = useAgendamentos(deIso, ateIso);

  const ativos = useMemo(() => new Map(cad.alunos.map((a) => [a.id, a.ativo])), [cad.alunos]);
  const daSituacao = (id: string) => situacao === 'ambos' || (situacao === 'ativos' ? ativos.get(id) !== false : ativos.get(id) === false);

  const lista = useMemo(() => filtra(agendamentos, { professorIds, alunoIds, moduloIds, aulaIds, status, presenca, modalidade })
    .filter((a) => situacao === 'ambos' || a.alunoIds.some(daSituacao))
    .sort((a, b) => a.inicio.localeCompare(b.inicio)),
  // eslint-disable-next-line react-hooks/exhaustive-deps -- daSituacao depende só de situacao e ativos
  [agendamentos, professorIds, alunoIds, moduloIds, aulaIds, status, presenca, modalidade, situacao, ativos]);

  /* obs e notas moram na subcoleção de cada aula: lê as que faltam */
  useEffect(() => {
    const faltam = lista.filter((a) => !detalhes[a.id]).slice(0, 300);
    if (!faltam.length) return;
    let vivo = true;
    void Promise.all(faltam.map(async (a) => [a.id, await alunosDaAula(a.id)] as const)).then((pares) => {
      if (vivo) setDetalhes((d) => ({ ...d, ...Object.fromEntries(pares) }));
    });
    return () => { vivo = false; };
  }, [lista, detalhes]);

  const nomeAula = (id: string) => cad.aulas.find((a) => a.id === id)?.nome || 'Aula';
  const nomeModulo = (id: string) => cad.modulos.find((m) => m.id === id)?.nome || '';
  const prof = (id: string) => cad.professores.find((p) => p.id === id);
  const ind = indicadores(lista, horaConhecida(agora) ? agora : new Date(0));
  const barras = ind.porProfessor.map((x) => ({ nome: prof(x.professorId)?.nome || 'Sem professor', cor: prof(x.professorId)?.cor || '#D6D6D0', aulas: x.aulas }));
  const bloqueios = comBloqueios
    ? cad.bloqueios.filter((b) => diaLocal(b.inicio) <= ate && diaLocal(b.fim) >= de && (!professorIds.length || !b.professorId || professorIds.includes(b.professorId)))
    : [];

  const alunosDaLinha = (a: Agendamento) => (detalhes[a.id] || a.alunos.map((x) => ({ alunoId: x.id, nomeAluno: x.nome, presenca: x.presenca, obs: '' } as AlunoNaAula)))
    .filter((x) => daSituacao(x.alunoId) && (!alunoIds.length || alunoIds.includes(x.alunoId)));

  /* visão por aluno: um aluno só escolhido */
  const umAluno = alunoIds.length === 1 ? cad.alunos.find((a) => a.id === alunoIds[0]) : null;
  const doAluno = umAluno ? lista.map((a) => ({ a, x: detalhes[a.id]?.find((y) => y.alunoId === umAluno.id) })) : [];
  const comNotas = doAluno.filter(({ x }) => x?.notas && mediaDas(x.notas) !== null);
  /* duas aulas no mesmo dia ganham a hora no rótulo */
  const repetidos = new Set(comNotas.map(({ a }) => diaLocal(a.inicio)).filter((d, i, l) => l.indexOf(d) !== i));
  const pontos = comNotas.map(({ a, x }) => ({
    dia: `${br(diaLocal(a.inicio)).slice(0, 5)}${repetidos.has(diaLocal(a.inicio)) ? ` ${horaLocal(a.inicio)}` : ''}`,
    notas: x?.notas || {},
  }));

  function exporta() {
    const linhas: unknown[][] = [];
    for (const a of lista) {
      const base = [br(diaLocal(a.inicio)), horaLocal(a.inicio), horaLocal(a.fim), prof(a.professorId)?.nome || '', nomeModulo(a.moduloId),
        nomeAula(a.aulaId), a.modalidade === 'online' ? 'Online' : 'Presencial', STATUS[a.status].nome];
      const alunos = alunosDaLinha(a);
      if (!alunos.length) linhas.push([...base, '', '', '', '', '', '', '']);
      for (const x of alunos) {
        linhas.push([...base, x.nomeAluno, x.presenca ? NOME_PRESENCA[x.presenca] : 'Sem presença',
          ...HABILIDADES.map((h) => nota(x.notas?.[h])), x.obs || '']);
      }
    }
    for (const b of bloqueios) linhas.push([br(diaLocal(b.inicio)), horaLocal(b.inicio), horaLocal(b.fim), prof(b.professorId || '')?.nome || 'Escola inteira', '', b.motivo, '', BLOQUEIOS[b.tipo], '', '', '', '', '', '', '']);
    const texto = csv(['Data', 'Início', 'Fim', 'Professor', 'Módulo', 'Aula', 'Modalidade', 'Status', 'Aluno', 'Presença', 'Fala', 'Leitura', 'Escuta', 'Escrita', 'Observação'], linhas);
    const url = URL.createObjectURL(new Blob([texto], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `agenda-${de}-a-${ate}.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  if (perfil && !permissoesDe(perfil.papel).criar) {
    return <div className="ag"><header className="vh"><h1>Relatório</h1></header><p className="vz">O relatório da agenda é da recepção, da coordenação e da gestão.</p></div>;
  }

  return (
    <div className="ag rel">
      <header className="vh ag-h">
        <h1>Agenda</h1>
        <AbasDaAgenda atual="relatorio" />
        <div className="fim rel-acoes">
          <button className="btn" onClick={exporta} disabled={!lista.length}><Ic n="doc" />Exportar CSV</button>
          <button className="btn so-largo" onClick={() => window.print()}>Imprimir</button>
        </div>
      </header>
      <p className="rel-impresso">Relatório da agenda, de {br(de)} a {br(ate)}. Nexus English Center Chapecó.</p>

      <div className="ag-filtros rel-filtros">
        <label className="rel-data">De <input className="cx num" type="date" value={de} max={ate} onChange={(e) => setDe(e.target.value)} /></label>
        <label className="rel-data">até <input className="cx num" type="date" value={ate} min={de} onChange={(e) => setAte(e.target.value)} /></label>
        <Multi rotulo="Professor" valor={professorIds} aoMudar={setProfessorIds} opcoes={cad.professores.map((p) => ({ id: p.id, nome: p.nome, cor: p.cor }))} comBusca={false} />
        <div className="ag-seg pequeno" role="group" aria-label="Situação do aluno">
          {([['ativos', 'Ativos'], ['inativos', 'Inativos'], ['ambos', 'Ambos']] as const).map(([v, n]) => (
            <button key={v} type="button" aria-pressed={situacao === v} onClick={() => setSituacao(v)}>{n}</button>
          ))}
        </div>
        <Multi rotulo="Aluno" valor={alunoIds} aoMudar={setAlunoIds}
               opcoes={cad.alunos.filter((a) => daSituacao(a.id)).map((a) => ({ id: a.id, nome: a.nome, detalhe: a.ativo ? a.nivel : 'inativo' }))} />
        <Multi rotulo="Módulo" valor={moduloIds} aoMudar={(v) => { setModuloIds(v); setAulaIds([]); }} opcoes={cad.modulos.map((m) => ({ id: m.id, nome: m.nome }))} comBusca={false} />
        <Multi rotulo="Aula" valor={aulaIds} aoMudar={setAulaIds}
               opcoes={cad.aulas.filter((a) => !moduloIds.length || moduloIds.includes(a.moduloId)).map((a) => ({ id: a.id, nome: a.nome, grupo: nomeModulo(a.moduloId) }))} />
        <Multi rotulo="Status" valor={status} aoMudar={(v) => setStatus(v as StatusAula[])} comBusca={false}
               opcoes={LISTA_STATUS.map((s) => ({ id: s, nome: STATUS[s].nome, cor: STATUS[s].cor }))} />
        <div className="ag-seg pequeno" role="group" aria-label="Presença">
          {([[null, 'Toda presença'], ['presente', 'Presentes'], ['faltou', 'Faltas'], ['sem', 'Sem presença']] as const).map(([v, n]) => (
            <button key={n} type="button" aria-pressed={presenca === v} onClick={() => setPresenca(v)}>{n}</button>
          ))}
        </div>
        <div className="ag-seg pequeno" role="group" aria-label="Modalidade">
          {([[null, 'Todas'], ['presencial', 'Presencial'], ['online', 'Online']] as const).map(([v, n]) => (
            <button key={n} type="button" aria-pressed={modalidade === v} onClick={() => setModalidade(v)}>{n}</button>
          ))}
        </div>
        <label className="lig rel-bl"><input type="checkbox" checked={comBloqueios} onChange={(e) => setComBloqueios(e.target.checked)} />Mostrar bloqueios</label>
      </div>

      <div className="rel-corpo">
        <section className="rel-kpis" aria-label="Indicadores">
          {[
            ['Total de aulas', String(ind.total), 'sem canceladas e remarcadas'],
            ['Realizadas', String(ind.realizadas), ind.total ? `${Math.round((ind.realizadas / ind.total) * 100)}% do total` : ''],
            ['Taxa de presença', ind.taxaPresenca === null ? 'sem dado' : `${Math.round(ind.taxaPresenca * 100)}%`, `${ind.presentes} presenças`],
            ['Faltas', String(ind.faltas), ''],
            ['Cancelamentos', String(ind.cancelamentos), ind.remarcadas ? `e ${ind.remarcadas} remarcadas` : ''],
            ['Pendentes de presença', String(ind.pendentes), 'aulas que já passaram'],
          ].map(([rotulo, valor, sub]) => (
            <div key={rotulo} className={`rel-kpi${rotulo === 'Pendentes de presença' && ind.pendentes ? ' alerta' : ''}`}>
              <span>{rotulo}</span><b>{valor}</b>{sub && <small>{sub}</small>}
            </div>
          ))}
        </section>

        <section className="bl rel-bloco">
          <p className="bt">Aulas por professor</p>
          <BarrasPorProfessor dados={barras} />
        </section>

        {umAluno && (
          <section className="bl rel-bloco">
            <p className="bt">Linha do tempo de {umAluno.nome}</p>
            <EvolucaoDasNotas pontos={pontos} />
            <table className="rel-tab">
              <thead><tr><th>Data</th><th>Aula</th><th>Presença</th>{HABILIDADES.map((h) => <th key={h} className="num-col">{h[0].toUpperCase() + h.slice(1)}</th>)}<th>Observação</th></tr></thead>
              <tbody>
                {doAluno.map(({ a, x }) => (
                  <tr key={a.id} className={x?.presenca === 'faltou' ? 'falta' : undefined}>
                    <td className="num">{br(diaLocal(a.inicio))} {horaLocal(a.inicio)}</td>
                    <td>{nomeAula(a.aulaId)}<small>{STATUS[a.status].nome}</small></td>
                    <td>{x?.presenca ? NOME_PRESENCA[x.presenca] : 'Sem presença'}</td>
                    {HABILIDADES.map((h) => <td key={h} className="num num-col">{nota(x?.notas?.[h])}</td>)}
                    <td>{x?.obs}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        <section className="bl rel-bloco">
          <p className="bt">Aulas <span className="num">{lista.length}</span></p>
          {!lista.length && !bloqueios.length && <p className="vz">Nenhuma aula com esses filtros. Aumente o período ou tire um filtro.</p>}
          <ol className="rel-lista">
            {lista.map((a) => (
              <li key={a.id}>
                <div className="rel-linha">
                  <span className="num">{br(diaLocal(a.inicio))} {horaLocal(a.inicio)}</span>
                  <span><i style={{ background: prof(a.professorId)?.cor }} aria-hidden="true" />{prof(a.professorId)?.nome || 'Sem professor'}</span>
                  <span>{nomeModulo(a.moduloId)}</span>
                  <b>{nomeAula(a.aulaId)}</b>
                  <span className="rel-st"><i style={{ background: STATUS[a.status].cor }} aria-hidden="true" />{STATUS[a.status].nome}</span>
                </div>
                <table className="rel-tab sub">
                  <tbody>
                    {alunosDaLinha(a).map((x) => (
                      <tr key={x.alunoId} className={x.presenca === 'faltou' ? 'falta' : undefined}>
                        <td>{x.nomeAluno}</td>
                        <td>{x.presenca ? NOME_PRESENCA[x.presenca] : 'Sem presença'}</td>
                        <td className="num">{x.notas && mediaDas(x.notas) !== null ? HABILIDADES.map((h) => nota(x.notas?.[h]) || '-').join(' / ') : ''}</td>
                        <td>{x.obs}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </li>
            ))}
            {bloqueios.map((b) => (
              <li key={b.id} className="rel-bl-linha">
                <div className="rel-linha">
                  <span className="num">{br(diaLocal(b.inicio))} {horaLocal(b.inicio)}</span>
                  <span>{prof(b.professorId || '')?.nome || 'Escola inteira'}</span>
                  <b>{b.motivo || BLOQUEIOS[b.tipo]}</b>
                  <span className="rel-st"><i className="ag-bl-amostra" />{BLOQUEIOS[b.tipo]}</span>
                </div>
              </li>
            ))}
          </ol>
          {lista.length > 0 && <p className="obs rel-leg">Notas na ordem fala / leitura / escuta / escrita.</p>}
        </section>
      </div>
    </div>
  );
}
