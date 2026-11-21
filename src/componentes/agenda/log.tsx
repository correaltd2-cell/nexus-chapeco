'use client';
/* O log da agenda: tudo o que alguém criou, editou, excluiu, mudou de status ou lançou
   de presença, com o antes e o depois de cada campo que mudou. Ninguém apaga. */
import { useEffect, useMemo, useState } from 'react';
import { useSessao } from '@/componentes/sessao';
import { assinaFiltro } from '@/lib/dados/fonte';
import { diaLocal, horaLocal, mudancas, permissoesDe, STATUS, type AcaoLog, type LogAgenda, type ResumoAluno, type StatusAula } from '@/lib/dominio/agenda';
import { useCadastros } from './dados';
import AbasDaAgenda from './abas';

const ACOES: Record<AcaoLog, string> = {
  criou: 'Criou', editou: 'Editou', excluiu: 'Excluiu', mudou_status: 'Mudou o status', lancou_presenca: 'Lançou presença',
};
const CAMPO: Record<string, string> = {
  inicio: 'Início', fim: 'Fim', status: 'Status', professorId: 'Professor', moduloId: 'Módulo', aulaId: 'Aula',
  modalidade: 'Modalidade', recorrenciaId: 'Série', alunos: 'Alunos', lembreteEnviadoEm: 'Lembrete',
};
const menosDias = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
const br = (iso: string) => `${diaLocal(iso).split('-').reverse().join('/')} ${horaLocal(iso)}`;

export default function LogDaAgenda() {
  const { perfil } = useSessao();
  const cad = useCadastros();
  const [de, setDe] = useState(() => menosDias(7));
  const [ate, setAte] = useState(() => menosDias(-1));
  const [usuario, setUsuario] = useState('');
  const [acao, setAcao] = useState<AcaoLog | ''>('');
  const [logs, setLogs] = useState<LogAgenda[]>([]);

  useEffect(() => {
    if (!de || !ate) return;
    return assinaFiltro('logs_agenda', [
      { campo: 'data', op: '>=', valor: new Date(`${de}T00:00:00-03:00`).toISOString() },
      { campo: 'data', op: '<', valor: new Date(`${ate}T23:59:59-03:00`).toISOString() },
    ], (d) => setLogs((d as unknown as LogAgenda[]).sort((a, b) => b.data.localeCompare(a.data))));
  }, [de, ate]);

  const usuarios = useMemo(() => [...new Map(logs.map((l) => [l.usuarioId, l.usuarioNome])).entries()], [logs]);
  const visiveis = logs.filter((l) => (!usuario || l.usuarioId === usuario) && (!acao || l.acao === acao));

  const valor = (campo: string, v: unknown): string => {
    if (v === null || v === undefined || v === '') return 'vazio';
    if (campo === 'inicio' || campo === 'fim' || campo === 'lembreteEnviadoEm') return br(String(v));
    if (campo === 'status') return STATUS[v as StatusAula]?.nome || String(v);
    if (campo === 'professorId') return cad.professores.find((p) => p.id === v)?.nome || String(v);
    if (campo === 'moduloId') return cad.modulos.find((m) => m.id === v)?.nome || String(v);
    if (campo === 'aulaId') return cad.aulas.find((a) => a.id === v)?.nome || String(v);
    if (campo === 'recorrenciaId') return 'faz parte de uma série';
    if (campo === 'alunos' && Array.isArray(v)) {
      return (v as (ResumoAluno & { obs?: string })[]).map((a) => `${a.nome}${a.presenca ? ` (${a.presenca === 'presente' ? 'presente' : 'faltou'})` : ''}`).join(', ') || 'nenhum';
    }
    return String(v);
  };

  if (perfil && !permissoesDe(perfil.papel).criar) {
    return <div className="ag"><header className="vh"><h1>Log</h1></header><p className="vz">O log da agenda é da recepção, da coordenação e da gestão.</p></div>;
  }

  return (
    <div className="ag rel">
      <header className="vh ag-h">
        <h1>Agenda</h1>
        <AbasDaAgenda atual="log" />
      </header>
      <div className="ag-filtros rel-filtros">
        <label className="rel-data">De <input className="cx num" type="date" value={de} onChange={(e) => setDe(e.target.value)} /></label>
        <label className="rel-data">até <input className="cx num" type="date" value={ate} onChange={(e) => setAte(e.target.value)} /></label>
        <select className="cx rel-sel" value={usuario} onChange={(e) => setUsuario(e.target.value)} aria-label="Quem">
          <option value="">Todo mundo</option>
          {usuarios.map(([id, nome]) => <option key={id} value={id}>{nome}</option>)}
        </select>
        <select className="cx rel-sel" value={acao} onChange={(e) => setAcao(e.target.value as AcaoLog | '')} aria-label="Ação">
          <option value="">Toda ação</option>
          {(Object.keys(ACOES) as AcaoLog[]).map((a) => <option key={a} value={a}>{ACOES[a]}</option>)}
        </select>
        <span className="ag-conta num">{visiveis.length} {visiveis.length === 1 ? 'registro' : 'registros'}</span>
      </div>
      <div className="rel-corpo">
        <section className="bl rel-bloco">
          {!visiveis.length && <p className="vz">Nada registrado nesse período. Tudo o que mexe na agenda aparece aqui.</p>}
          <ol className="log-lista">
            {visiveis.map((l) => {
              const campos = mudancas(l.antes, l.depois);
              const ref = (l.depois || l.antes || {}) as Record<string, unknown>;
              return (
                <li key={l.id}>
                  <div className="log-h">
                    <span className="num">{br(l.data)}</span>
                    <b>{l.usuarioNome}</b>
                    <span className={`log-acao ${l.acao}`}>{ACOES[l.acao]}</span>
                    <span className="log-alvo">
                      {ref.aulaId ? valor('aulaId', ref.aulaId) : 'Aula'}{ref.inicio ? `, ${br(String(ref.inicio))}` : ''}
                    </span>
                  </div>
                  {campos.length > 0 && l.acao !== 'criou' && l.acao !== 'excluiu' && (
                    <table className="log-dif">
                      <tbody>
                        {campos.map((c) => (
                          <tr key={c}>
                            <th>{CAMPO[c] || c}</th>
                            <td className="antes">{valor(c, l.antes?.[c])}</td>
                            <td className="seta" aria-hidden="true">→</td>
                            <td className="depois">{valor(c, l.depois?.[c])}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  {(l.acao === 'criou' || l.acao === 'excluiu') && (
                    <p className="log-resumo">
                      {valor('professorId', ref.professorId)} · {valor('alunos', ref.alunos)}
                    </p>
                  )}
                </li>
              );
            })}
          </ol>
        </section>
      </div>
    </div>
  );
}
