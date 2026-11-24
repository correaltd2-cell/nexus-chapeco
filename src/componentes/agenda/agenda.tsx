'use client';
/* A tela da agenda. Junta o calendário, os filtros, o modal da aula e o do bloqueio,
   e decide o que fazer quando alguém arrasta uma aula (perguntando "só esta ou esta e
   as próximas" quando é de uma série, e conferindo conflito antes de gravar). */
import dynamic from 'next/dynamic';
import { useCallback, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useSearchParams } from 'next/navigation';
import type { CalendarRef } from '@fullcalendar/react';
import { useSessao } from '@/componentes/sessao';
import { avisa } from '@/componentes/aviso';
import { Ic } from '@/componentes/icones';
import { horaConhecida, useAgora } from '@/componentes/relogio';
import { confereRemarcacao, remarca } from '@/lib/dados/agenda';
import { filtra, LISTA_STATUS, permissoesDe, STATUS, type Agendamento, type Conflito, type Escopo, type Modalidade } from '@/lib/dominio/agenda';
import { useAgendamentos, useCadastros } from './dados';
import { Multi } from './escolha';
import ModalDaAula, { type Abertura } from './aula';
import ModalDoBloqueio, { type AberturaDeBloqueio } from './bloqueio';
import AbasDaAgenda from './abas';
import type { Visao } from './calendario';

const Calendario = dynamic(() => import('./calendario'), { ssr: false, loading: () => <div className="ag-cal carregando" aria-busy="true" /> });

/* celular abre no dia; computador na semana */
const ouveTela = (f: () => void) => { window.addEventListener('resize', f); return () => window.removeEventListener('resize', f); };
const useEstreita = () => useSyncExternalStore(ouveTela, () => window.innerWidth < 760, () => false);

/** "15 a 21 de novembro de 2026", "novembro de 2026", "sábado, 21 de novembro". */
function tituloDoPeriodo(de: Date, ate: Date, visao: Visao) {
  const f = (d: Date, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('pt-BR', o).format(d);
  if (visao === 'dayGridMonth') return f(new Date(de.getTime() + 15 * 86_400_000), { month: 'long', year: 'numeric' });
  if (visao === 'timeGridDay') return f(de, { weekday: 'long', day: 'numeric', month: 'long' });
  const fim = new Date(ate.getTime() - 1);
  return de.getMonth() === fim.getMonth()
    ? `${de.getDate()} a ${f(fim, { day: 'numeric', month: 'long', year: 'numeric' })}`
    : `${f(de, { day: 'numeric', month: 'short' })} a ${f(fim, { day: 'numeric', month: 'short', year: 'numeric' })}`;
}

interface Arraste { alvo: Agendamento; novo: { inicio: string; fim: string }; desfaz: () => void; escopo?: Escopo; conflitos?: Conflito[] }

export default function Agenda() {
  const { perfil } = useSessao();
  const cad = useCadastros();
  const estreita = useEstreita();
  const agora = useAgora();
  const calRef = useRef<CalendarRef | null>(null);
  const perm = permissoesDe(perfil?.papel);

  const [periodo, setPeriodo] = useState({ de: '', ate: '', titulo: '', visao: 'timeGridWeek' as Visao });
  const { agendamentos } = useAgendamentos(periodo.de, periodo.ate);
  const [professorIds, setProfessorIds] = useState<string[]>([]);
  /* /aulas?aluno=ID&data=AAAA-MM-DD: o "Ver na agenda" da conversa já abre filtrado
     pelo aluno, na semana da próxima aula dele */
  const params = useSearchParams();
  const alunoPedido = params.get('aluno');
  const dataPedida = /^\d{4}-\d{2}-\d{2}$/.test(params.get('data') || '') ? params.get('data') || '' : '';
  const horaPedida = /^\d{2}:\d{2}$/.test(params.get('hora') || '') ? params.get('hora') || '' : '';
  /* uma hora antes da aula, para ela aparecer com folga; nunca antes do início da grade */
  const rolarAte = horaPedida ? (() => {
    const [h, m] = horaPedida.split(':').map(Number);
    const min = Math.max(7 * 60 + 30, h * 60 + m - 60);
    return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}:00`;
  })() : '';
  const [alunoIds, setAlunoIds] = useState<string[]>(alunoPedido ? [alunoPedido] : []);
  const [alunoVisto, setAlunoVisto] = useState(alunoPedido);
  if (alunoPedido !== alunoVisto) {
    setAlunoVisto(alunoPedido);
    if (alunoPedido) setAlunoIds([alunoPedido]);
  }
  const [moduloIds, setModuloIds] = useState<string[]>([]);
  const [aulaIds, setAulaIds] = useState<string[]>([]);
  const [modalidade, setModalidade] = useState<Modalidade | null>(null);
  const [aberta, setAberta] = useState<Abertura | null>(null);
  const [bloqueio, setBloqueio] = useState<AberturaDeBloqueio | null>(null);
  const [arraste, setArraste] = useState<Arraste | null>(null);
  const [movendo, setMovendo] = useState(false);

  const nomeDaAula = useMemo(() => {
    const m = new Map(cad.aulas.map((a) => [a.id, a.nome]));
    return (id: string) => m.get(id) || 'Aula';
  }, [cad.aulas]);

  const visiveis = useMemo(() => filtra(agendamentos, { professorIds, alunoIds, moduloIds, aulaIds, modalidade }),
    [agendamentos, professorIds, alunoIds, moduloIds, aulaIds, modalidade]);
  const bloqueiosVisiveis = useMemo(() => cad.bloqueios.filter((b) => !b.professorId || !professorIds.length || professorIds.includes(b.professorId)),
    [cad.bloqueios, professorIds]);
  const filtrando = professorIds.length + alunoIds.length + moduloIds.length + aulaIds.length + (modalidade ? 1 : 0) > 0;

  const aoMudarPeriodo = useCallback((de: Date, ate: Date, _titulo: string, visao: Visao) => {
    setPeriodo({ de: de.toISOString(), ate: ate.toISOString(), titulo: tituloDoPeriodo(de, ate, visao), visao });
  }, []);
  const api = () => calRef.current?.getApi();

  const quem = { id: perfil?.id || '', nome: perfil?.nome || 'Equipe', papel: perfil?.papel || 'recepcao' as const };
  const nomes = {
    professor: (id: string) => cad.professores.find((p) => p.id === id)?.nome || 'O professor',
    aluno: (id: string) => cad.alunos.find((a) => a.id === id)?.nome || 'Um aluno',
  };

  async function confereEGrava(a: Arraste, escopo: Escopo, forcar = false) {
    setMovendo(true);
    try {
      if (!forcar) {
        const c = await confereRemarcacao(a.alvo, a.novo, escopo, cad.bloqueios, nomes);
        if (c.length) { setArraste({ ...a, escopo, conflitos: c }); return; }
      }
      const n = await remarca(quem, a.alvo, a.novo, escopo);
      avisa(n > 1 ? `${n} aulas remarcadas` : 'Aula remarcada');
      setArraste(null);
    } catch {
      a.desfaz();
      setArraste(null);
      avisa('Não consegui remarcar. Nada mudou.');
    } finally { setMovendo(false); }
  }

  function aoMover(id: string, inicio: Date, fim: Date, desfaz: () => void) {
    const alvo = agendamentos.find((a) => a.id === id);
    if (!alvo || !perm.remarcar) { desfaz(); return; }
    const a: Arraste = { alvo, novo: { inicio: inicio.toISOString(), fim: fim.toISOString() }, desfaz };
    if (alvo.recorrenciaId) setArraste(a);
    else void confereEGrava(a, 'este');
  }
  function desfazArraste() {
    arraste?.desfaz();
    setArraste(null);
  }

  const opAulas = useMemo(() => cad.aulas
    .filter((a) => a.ativo && (!moduloIds.length || moduloIds.includes(a.moduloId)))
    .map((a) => ({ id: a.id, nome: a.nome, grupo: cad.modulos.find((m) => m.id === a.moduloId)?.nome })), [cad.aulas, cad.modulos, moduloIds]);

  return (
    <div className="ag">
      <header className="vh ag-h">
        <h1>Agenda</h1>
        <AbasDaAgenda atual="agenda" />
        {perm.criar && (
          <div className="fim">
            <button className="btn" title="Novo bloqueio" onClick={() => setBloqueio({})}><Ic n="x" /><span className="so-largo">Bloqueio</span></button>
            <button className="btn p" onClick={() => {
              const ini = new Date(); ini.setMinutes(ini.getMinutes() < 30 ? 30 : 60, 0, 0);
              setAberta({ tipo: 'nova', inicio: ini.toISOString(), fim: new Date(ini.getTime() + 3600_000).toISOString() });
            }}><Ic n="mais" />Nova aula</button>
          </div>
        )}
      </header>

      <div className="ag-barra">
        <div className="ag-nav">
          <button className="ib" aria-label="Período anterior" onClick={() => api()?.prev()}><Ic n="volta" /></button>
          <button className="ib" aria-label="Próximo período" onClick={() => api()?.next()}><Ic n="seta" /></button>
          <button className="chip" onClick={() => api()?.today()}>Hoje</button>
          <b className="ag-titulo">{periodo.titulo}</b>
        </div>
        <div className="ag-seg ag-visao" role="group" aria-label="Visão">
          {([['dayGridMonth', 'Mês'], ['timeGridWeek', 'Semana'], ['timeGridDay', 'Dia']] as [Visao, string][]).map(([v, n]) => (
            <button key={v} type="button" aria-pressed={periodo.visao === v} onClick={() => api()?.changeView(v)}>{n}</button>
          ))}
        </div>
      </div>

      <div className="ag-filtros">
        <Multi rotulo="Professor" valor={professorIds} aoMudar={setProfessorIds}
               opcoes={cad.professores.map((p) => ({ id: p.id, nome: p.nome, cor: p.cor }))} comBusca={cad.professores.length > 6} />
        <Multi rotulo="Aluno" valor={alunoIds} aoMudar={setAlunoIds}
               opcoes={cad.alunos.map((a) => ({ id: a.id, nome: a.nome, codigo: a.codigo, detalhe: a.ativo ? a.nivel : 'inativo' }))} />
        <Multi rotulo="Módulo" valor={moduloIds} aoMudar={(v) => { setModuloIds(v); setAulaIds([]); }}
               opcoes={cad.modulos.map((m) => ({ id: m.id, nome: m.nome }))} comBusca={false} />
        <Multi rotulo="Aula" valor={aulaIds} aoMudar={setAulaIds} opcoes={opAulas} />
        <div className="ag-seg pequeno" role="group" aria-label="Modalidade">
          {([[null, 'Todas'], ['presencial', 'Presencial'], ['online', 'Online']] as [Modalidade | null, string][]).map(([v, n]) => (
            <button key={n} type="button" aria-pressed={modalidade === v} onClick={() => setModalidade(v)}>{n}</button>
          ))}
        </div>
        {filtrando && (
          <button className="tx-btn" onClick={() => { setProfessorIds([]); setAlunoIds([]); setModuloIds([]); setAulaIds([]); setModalidade(null); }}>
            Limpar filtros
          </button>
        )}
        <span className="ag-conta num">{visiveis.length} {visiveis.length === 1 ? 'aula' : 'aulas'}</span>
      </div>

      <Calendario
        calRef={calRef}
        visao={estreita ? 'timeGridDay' : 'timeGridWeek'}
        dataInicial={dataPedida}
        rolarAte={rolarAte}
        agendamentos={visiveis}
        bloqueios={bloqueiosVisiveis}
        professores={cad.professores}
        nomeDaAula={nomeDaAula}
        podeCriar={perm.criar}
        podeRemarcar={perm.remarcar}
        agora={horaConhecida(agora) ? agora : new Date(0)}
        aoMudarPeriodo={aoMudarPeriodo}
        aoSelecionar={(inicio, fim) => setAberta({ tipo: 'nova', inicio: inicio.toISOString(), fim: fim.toISOString() })}
        aoClicar={(quando, diaInteiro) => {
          /* no mês, o dia abre o dia; no dia e na semana, o horário abre a aula nova */
          if (diaInteiro) { api()?.changeView('timeGridDay', quando); return; }
          if (!perm.criar) { avisa('Quem marca aula é a recepção, a coordenação ou a gestão.'); return; }
          setAberta({ tipo: 'nova', inicio: quando.toISOString(), fim: new Date(quando.getTime() + 3_600_000).toISOString() });
        }}
        aoAbrir={(id) => { const a = agendamentos.find((x) => x.id === id); if (a) setAberta({ tipo: 'editar', agendamento: a }); }}
        aoAbrirBloqueio={(id) => { const b = cad.bloqueios.find((x) => x.id === id); if (b) setBloqueio({ bloqueio: b }); }}
        aoMover={aoMover}
      />

      <div className="ag-legenda" aria-label="Legenda">
        {LISTA_STATUS.map((s) => <span key={s}><i className="ag-st" style={{ background: STATUS[s].cor }} />{STATUS[s].nome}</span>)}
        <span><i className="ag-wa"><Ic n="chat" /></i>Lembrete enviado</span>
        <span><i className="ag-alerta" />Falta presença</span>
        <span><i className="ag-bl-amostra" />Bloqueio</span>
      </div>

      {aberta && (
        <ModalDaAula key={aberta.tipo === 'editar' ? aberta.agendamento.id : `nova-${aberta.inicio}`}
                     abertura={aberta} cad={cad} aoFechar={() => setAberta(null)} />
      )}
      {bloqueio && <ModalDoBloqueio abertura={bloqueio} cad={cad} aoFechar={() => setBloqueio(null)} />}

      {arraste && (
        <div className="mod ag-mod">
          <div className="mod-c ag-mc pequeno" role="dialog" aria-modal="true" aria-label="Remarcar aula">
            <header className="ag-mh"><h2>Remarcar aula</h2></header>
            <div className="ag-mb">
              {!arraste.conflitos ? (
                <>
                  <p>Esta aula faz parte de uma série. O novo horário vale para:</p>
                  <div className="ag-mf-col">
                    <button className="btn" disabled={movendo} onClick={() => void confereEGrava(arraste, 'este')}>Só esta aula</button>
                    <button className="btn p" disabled={movendo} onClick={() => void confereEGrava(arraste, 'proximos')}>Esta e as próximas</button>
                  </div>
                </>
              ) : (
                <div className="ag-conf" role="alert">
                  <b>Conflito de horário</b>
                  <ul>{arraste.conflitos.slice(0, 6).map((c, i) => <li key={i}>{c.mensagem}</li>)}</ul>
                  {!perm.forcarConflito && <p className="obs">Só a administração pode remarcar por cima de um conflito.</p>}
                  {perm.forcarConflito && (
                    <button className="btn" disabled={movendo} onClick={() => void confereEGrava(arraste, arraste.escopo || 'este', true)}>Remarcar mesmo assim</button>
                  )}
                </div>
              )}
            </div>
            <footer className="ag-mf"><span className="ag-mf-meio" /><button className="btn" onClick={desfazArraste}>Desfazer</button></footer>
          </div>
        </div>
      )}
    </div>
  );
}
