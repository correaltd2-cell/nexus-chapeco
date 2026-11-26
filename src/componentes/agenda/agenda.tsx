'use client';
/* A tela da agenda. Junta a Semana (a visão padrão: as faixas da escola, todas as aulas à vista),
   a Grade (um dia, uma coluna por professor), o calendário (Mês e Dia), os filtros, o
   modal da aula e o do bloqueio, e decide o que fazer quando alguém arrasta uma aula:
   pergunta "só esta ou esta e as próximas" quando é de uma série, e confere conflito
   antes de gravar. Na Grade, arrastar para a coluna de outro professor troca o
   professor, pela mesma conferência. O domingo não aparece (DIAS_FECHADOS). */
import dynamic from 'next/dynamic';
import { useCallback, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useSearchParams } from 'next/navigation';
import type { CalendarRef } from '@fullcalendar/react';
import { useSessao } from '@/componentes/sessao';
import { avisa } from '@/componentes/aviso';
import { Ic } from '@/componentes/icones';
import { horaConhecida, useAgora } from '@/componentes/relogio';
import { useBloqueiosNaAgenda, useCanceladasNaAgenda } from '@/componentes/preferencias';
import { confereRemarcacao, remarca, type NovoLugar } from '@/lib/dados/agenda';
import {
  diaAbertoDesde, diaDaSemana, diaLocal, diasAbertosDaSemana, filtra, horaLocal, inicioDoDia, LISTA_STATUS, passaDia,
  permissoesDe, somaDias, sobrepoe, STATUS, type Agendamento, type Conflito, type Escopo, type Modalidade,
} from '@/lib/dominio/agenda';
import { contaDoPeriodo, faixasDoDia, GRADE_FIM, GRADE_INICIO, isoNoDia, minutosNoDia, proximaFaixa } from '@/lib/dominio/agenda-grade';
import { useAgendamentos, useCadastros } from './dados';
import { Multi } from './escolha';
import ModalDaAula, { type Abertura } from './aula';
import ModalDoBloqueio, { type AberturaDeBloqueio } from './bloqueio';
import AbasDaAgenda from './abas';
import Grade from './grade';
import Semana from './semana';
import type { Visao } from './calendario';

const Calendario = dynamic(() => import('./calendario'), { ssr: false, loading: () => <div className="ag-cal carregando" aria-busy="true" /> });

type VisaoDaAgenda = 'semana' | 'grade' | Visao;
const VISOES: [VisaoDaAgenda, string][] = [['semana', 'Semana'], ['grade', 'Grade'], ['dayGridMonth', 'Mês'], ['timeGridDay', 'Dia']];
/** Mês e Dia são do calendário (FullCalendar); Semana e Grade são feitas aqui. */
const doCalendario = (v: VisaoDaAgenda): v is Visao => v === 'dayGridMonth' || v === 'timeGridDay';
const SIGLA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

/* celular: a Semana empilha os dias e a Grade mostra um professor por vez */
const ouveTela = (f: () => void) => { window.addEventListener('resize', f); return () => window.removeEventListener('resize', f); };
const useEstreita = () => useSyncExternalStore(ouveTela, () => window.innerWidth < 760, () => false);

const fmt = (d: Date, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('pt-BR', o).format(d);
/** "segunda-feira, 23 de novembro", lido no calendário de Chapecó. */
const tituloDoDia = (dia: string) => fmt(new Date(`${dia}T12:00:00Z`), { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });

/** "novembro de 2026" (Mês) e "sábado, 21 de novembro" (Dia). */
function tituloDoPeriodo(de: Date, visao: Visao) {
  if (visao === 'dayGridMonth') return fmt(new Date(de.getTime() + 15 * 86_400_000), { month: 'long', year: 'numeric' });
  return fmt(de, { weekday: 'long', day: 'numeric', month: 'long' });
}

/** "23 a 28 de novembro de 2026": os dias abertos da semana. */
function tituloDaSemana(dias: string[]) {
  if (!dias.length) return '';
  const [a, b] = [new Date(`${dias[0]}T12:00:00Z`), new Date(`${dias[dias.length - 1]}T12:00:00Z`)];
  return a.getUTCMonth() === b.getUTCMonth()
    ? `${a.getUTCDate()} a ${fmt(b, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })}`
    : `${fmt(a, { day: 'numeric', month: 'short', timeZone: 'UTC' })} a ${fmt(b, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })}`;
}

/** O dia (AAAA-MM-DD) de uma data do calendário, que vem no fuso do navegador. */
const diaDoNavegador = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

interface Arraste { alvo: Agendamento; novo: NovoLugar; desfaz: () => void; escopo?: Escopo; conflitos?: Conflito[] }

export default function Agenda() {
  const { perfil } = useSessao();
  /* o professor vê só as aulas dele (26/11/2026): pede só elas ao banco, sem a ficha
     completa dos alunos, e os filtros de professor e de aluno somem */
  const professor = perfil?.papel === 'professor';
  const souEu = professor && perfil ? perfil.id : '';
  const cad = useCadastros({ semAlunos: !perfil || professor });
  const estreita = useEstreita();
  const agora = useAgora();
  const calRef = useRef<CalendarRef | null>(null);
  const perm = permissoesDe(perfil?.papel);
  const [bloqueiosNaAgenda, setBloqueiosNaAgenda] = useBloqueiosNaAgenda();
  const [canceladas, setCanceladas] = useCanceladasNaAgenda();

  /* /aulas?aluno=ID&data=AAAA-MM-DD&hora=HH:MM: o "Ver na agenda" da conversa já abre
     filtrado pelo aluno, no dia e perto da hora da próxima aula dele. Domingo vira a
     segunda seguinte. */
  const params = useSearchParams();
  const alunoPedido = params.get('aluno');
  const dataPedida = /^\d{4}-\d{2}-\d{2}$/.test(params.get('data') || '') ? diaAbertoDesde(params.get('data') || '') : '';
  const horaPedida = /^\d{2}:\d{2}$/.test(params.get('hora') || '') ? params.get('hora') || '' : '';
  /* no calendário, uma hora antes da aula, para ela aparecer com folga */
  const rolarNoCalendario = horaPedida ? (() => {
    const [h, m] = horaPedida.split(':').map(Number);
    const min = Math.max(GRADE_INICIO, h * 60 + m - 60);
    return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}:00`;
  })() : '';

  /* a agenda abre na Semana (pedido do cliente, 24/11/2026) */
  const [visao, setVisao] = useState<VisaoDaAgenda>('semana');
  const [diaEscolhido, setDiaEscolhido] = useState<string | null>(null);
  const [rolarPara, setRolarPara] = useState(horaPedida);
  const hoje = horaConhecida(agora) ? diaAbertoDesde(diaLocal(agora)) : '';
  const dia = diaEscolhido || dataPedida || hoje;
  const diasDaSemana = useMemo(() => (dia ? diasAbertosDaSemana(dia) : []), [dia]);

  const [periodoDoCalendario, setPeriodoDoCalendario] = useState({ de: '', ate: '', titulo: '' });
  const vazio = { de: '', ate: '', titulo: '' };
  const periodo = visao === 'grade'
    ? (dia ? { de: inicioDoDia(dia), ate: inicioDoDia(somaDias(dia, 1)), titulo: tituloDoDia(dia) } : vazio)
    : visao === 'semana'
      ? (diasDaSemana.length ? { de: inicioDoDia(diasDaSemana[0]), ate: inicioDoDia(somaDias(diasDaSemana[diasDaSemana.length - 1], 1)), titulo: tituloDaSemana(diasDaSemana) } : vazio)
      : periodoDoCalendario;
  const { agendamentos } = useAgendamentos(periodo.de, periodo.ate, souEu);

  const [professorIdsEscolhidos, setProfessorIds] = useState<string[]>([]);
  const professorIds = useMemo(() => (souEu ? [souEu] : professorIdsEscolhidos), [souEu, professorIdsEscolhidos]);
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

  /* só o que é do período na tela (enquanto o período novo chega, o anterior não vaza
     para o dia errado da Grade) */
  const visiveis = useMemo(() => {
    const de = periodo.de ? new Date(periodo.de).getTime() : 0;
    const ate = periodo.ate ? new Date(periodo.ate).getTime() : 0;
    return filtra(agendamentos, { professorIds, alunoIds, moduloIds, aulaIds, modalidade })
      .filter((a) => { const t = new Date(a.inicio).getTime(); return t >= de && t < ate; })
      .filter((a) => canceladas === 'mostradas' || a.status !== 'cancelado');
  }, [agendamentos, periodo.de, periodo.ate, professorIds, alunoIds, moduloIds, aulaIds, modalidade, canceladas]);
  const conta = useMemo(() => contaDoPeriodo(visiveis), [visiveis]);

  const doFiltro = useMemo(() => cad.bloqueios.filter((b) => !b.professorId || !professorIds.length || professorIds.includes(b.professorId)),
    [cad.bloqueios, professorIds]);
  const bloqueiosDoPeriodo = useMemo(() => (periodo.de && periodo.ate
    ? doFiltro.filter((b) => sobrepoe(b, { inicio: periodo.de, fim: periodo.ate })) : []), [doFiltro, periodo.de, periodo.ate]);
  /* na Semana e no Dia, o bloqueio de professor só aparece se pedir; o da escola sempre */
  const bloqueiosNoCalendario = useMemo(() => doFiltro.filter((b) => !b.professorId || bloqueiosNaAgenda === 'mostrados'),
    [doFiltro, bloqueiosNaAgenda]);
  const filtrando = (souEu ? 0 : professorIdsEscolhidos.length) + alunoIds.length + moduloIds.length + aulaIds.length + (modalidade ? 1 : 0) > 0;

  const aoMudarPeriodo = useCallback((de: Date, ate: Date, v: Visao) => {
    setPeriodoDoCalendario({ de: de.toISOString(), ate: ate.toISOString(), titulo: tituloDoPeriodo(de, v) });
    setVisao(v);
  }, []);
  const api = () => calRef.current?.getApi();

  /** Abre a Grade num dia (e perto de uma hora). */
  function abreGrade(d: string, hora = '') {
    setDiaEscolhido(diaAbertoDesde(d));
    setRolarPara(hora);
    setVisao('grade');
  }
  function trocaVisao(v: VisaoDaAgenda) {
    if (v === visao) return;
    if (!doCalendario(v)) {
      /* Semana e Grade abrem no dia em que o calendário estava */
      if (doCalendario(visao)) { const d = api()?.getDate(); if (d) setDiaEscolhido(diaAbertoDesde(diaDoNavegador(d))); }
      setRolarPara('');
      setVisao(v);
      return;
    }
    if (!doCalendario(visao)) { setVisao(v); return; }   // o calendário nasce no dia que estava na tela
    api()?.changeView(v);
  }
  function anda(n: 1 | -1) {
    if (visao === 'semana') { if (dia) { setDiaEscolhido(diaAbertoDesde(somaDias(dia, 7 * n))); setRolarPara(''); } return; }
    if (visao === 'grade') { if (dia) { setDiaEscolhido(passaDia(dia, n)); setRolarPara(''); } return; }
    if (visao === 'timeGridDay') {
      /* no Dia, a seta pula o dia fechado: de sábado vai para segunda, e volta */
      const d = api()?.getDate();
      if (d) api()?.gotoDate(new Date(`${passaDia(diaDoNavegador(d), n)}T12:00:00`));
      return;
    }
    if (n > 0) api()?.next(); else api()?.prev();
  }
  function vaiParaHoje() {
    if (!doCalendario(visao)) { if (hoje) { setDiaEscolhido(hoje); setRolarPara(''); } return; }
    if (hoje) api()?.gotoDate(new Date(`${hoje}T12:00:00`));
  }

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
      const troca = a.novo.professorId !== undefined && a.novo.professorId !== a.alvo.professorId;
      avisa(troca ? `${n > 1 ? `${n} aulas passaram` : 'Aula passou'} para ${nomes.professor(a.novo.professorId || '')}` : n > 1 ? `${n} aulas remarcadas` : 'Aula remarcada');
      setArraste(null);
    } catch {
      a.desfaz();
      setArraste(null);
      avisa('Não consegui remarcar. Nada mudou.');
    } finally { setMovendo(false); }
  }

  function aoMover(id: string, inicio: Date, fim: Date, desfaz: () => void, professorId?: string) {
    const alvo = agendamentos.find((a) => a.id === id);
    if (!alvo || !perm.remarcar) { desfaz(); return; }
    const a: Arraste = { alvo, novo: { inicio: inicio.toISOString(), fim: fim.toISOString(), ...(professorId !== undefined ? { professorId } : {}) }, desfaz };
    if (alvo.recorrenciaId) setArraste(a);
    else void confereEGrava(a, 'este');
  }
  function desfazArraste() {
    arraste?.desfaz();
    setArraste(null);
  }

  function novaAula(professorId: string, inicio: Date, fim: Date) {
    if (!perm.criar) { avisa('Quem marca aula é a recepção, a coordenação ou a gestão.'); return; }
    setAberta({ tipo: 'nova', inicio: inicio.toISOString(), fim: fim.toISOString(), ...(professorId ? { professorId } : {}) });
  }
  function novaAulaDoBotao() {
    /* o começo da próxima faixa (de manhã a próxima hora cheia, de tarde 14h30, 15h30...);
       na Semana ou na Grade de outro dia, nesse dia, no mesmo horário */
    const agoraJa = new Date();
    const diaJa = diaLocal(agoraJa);
    const proxima = proximaFaixa(faixasDoDia(diaDaSemana(diaJa)), minutosNoDia(agoraJa.toISOString(), diaJa));
    const ini = proxima !== null ? new Date(isoNoDia(diaJa, proxima)) : new Date(new Date().setMinutes(60, 0, 0));
    const naTela = visao === 'semana' ? (diasDaSemana.includes(diaLocal(ini)) ? diaLocal(ini) : diasDaSemana[0]) : dia;
    if (!doCalendario(visao) && naTela && naTela !== diaLocal(ini)) {
      const min = Math.min(Math.max(minutosNoDia(ini.toISOString(), diaLocal(ini)), GRADE_INICIO), GRADE_FIM - 60);
      novaAula('', new Date(isoNoDia(naTela, min)), new Date(isoNoDia(naTela, min + 60)));
      return;
    }
    novaAula('', ini, new Date(ini.getTime() + 3600_000));
  }

  const opAulas = useMemo(() => cad.aulas
    .filter((a) => a.ativo && (!moduloIds.length || moduloIds.includes(a.moduloId)))
    .map((a) => ({ id: a.id, nome: a.nome, grupo: cad.modulos.find((m) => m.id === a.moduloId)?.nome })), [cad.aulas, cad.modulos, moduloIds]);

  /* o que muda no arraste, em uma linha: "sexta, 27/11, das 18:30 às 19:30, com Helena" */
  const resumoDoArraste = arraste ? (() => {
    const d = diaLocal(arraste.novo.inicio);
    const troca = arraste.novo.professorId !== undefined && arraste.novo.professorId !== arraste.alvo.professorId;
    return `${tituloDoDia(d).split(',')[0]}, ${d.slice(8, 10)}/${d.slice(5, 7)}, das ${horaLocal(arraste.novo.inicio)} às ${horaLocal(arraste.novo.fim)}${troca ? `, com ${nomes.professor(arraste.novo.professorId || '')}` : ''}.`;
  })() : '';

  return (
    <div className="ag">
      <header className="vh ag-h">
        <h1>Agenda</h1>
        <AbasDaAgenda atual="agenda" />
        {perm.criar && (
          <div className="fim">
            <button className="btn" title="Novo bloqueio" onClick={() => setBloqueio({})}><Ic n="x" /><span className="so-largo">Bloqueio</span></button>
            <button className="btn p" onClick={novaAulaDoBotao}><Ic n="mais" />Nova aula</button>
          </div>
        )}
      </header>

      <div className="ag-barra">
        <div className="ag-nav">
          <button className="ib" aria-label={visao === 'semana' ? 'Semana anterior' : visao === 'grade' || visao === 'timeGridDay' ? 'Dia anterior' : 'Mês anterior'} onClick={() => anda(-1)}><Ic n="volta" /></button>
          <button className="ib" aria-label={visao === 'semana' ? 'Próxima semana' : visao === 'grade' || visao === 'timeGridDay' ? 'Próximo dia' : 'Próximo mês'} onClick={() => anda(1)}><Ic n="seta" /></button>
          <button className="chip" onClick={vaiParaHoje}>Hoje</button>
          <b className="ag-titulo">{periodo.titulo}</b>
          <span className="ag-contador num" aria-live="polite">{conta.texto}</span>
        </div>
        <div className="ag-seg ag-visao" role="group" aria-label="Visão">
          {VISOES.map(([v, n]) => (
            <button key={v} type="button" aria-pressed={visao === v} onClick={() => trocaVisao(v)}>{n}</button>
          ))}
        </div>
      </div>

      {visao === 'grade' && dia && (
        <div className="ag-dias-semana chips" role="group" aria-label="Dias da semana">
          {diasAbertosDaSemana(dia).map((d) => (
            <button key={d} type="button" className="chip" aria-pressed={d === dia} onClick={() => { setDiaEscolhido(d); setRolarPara(''); }}>
              {SIGLA[diaDaSemana(d)]} <span className="num">{d.slice(8, 10)}</span>
            </button>
          ))}
        </div>
      )}

      <div className="ag-filtros">
        {!professor && (
          <>
            <Multi rotulo="Professor" valor={professorIds} aoMudar={setProfessorIds}
                   opcoes={cad.professores.map((p) => ({ id: p.id, nome: p.nome, cor: p.cor }))} comBusca={cad.professores.length > 6} />
            <Multi rotulo="Aluno" valor={alunoIds} aoMudar={setAlunoIds}
                   opcoes={cad.alunos.map((a) => ({ id: a.id, nome: a.nome, codigo: a.codigo, detalhe: a.ativo ? a.nivel : 'inativo' }))} />
          </>
        )}
        <Multi rotulo="Módulo" valor={moduloIds} aoMudar={(v) => { setModuloIds(v); setAulaIds([]); }}
               opcoes={cad.modulos.map((m) => ({ id: m.id, nome: m.nome }))} comBusca={false} />
        <Multi rotulo="Aula" valor={aulaIds} aoMudar={setAulaIds} opcoes={opAulas} />
        <div className="ag-seg pequeno" role="group" aria-label="Modalidade">
          {([[null, 'Todas'], ['presencial', 'Presencial'], ['online', 'Online']] as [Modalidade | null, string][]).map(([v, n]) => (
            <button key={n} type="button" aria-pressed={modalidade === v} onClick={() => setModalidade(v)}>{n}</button>
          ))}
        </div>
        {(visao === 'semana' || visao === 'timeGridDay') && (
          <button type="button" className="chip ag-chave" aria-pressed={bloqueiosNaAgenda === 'mostrados'}
                  title="Reuniões e indisponibilidades dos professores. Na Grade, ficam sempre na coluna de cada um."
                  onClick={() => setBloqueiosNaAgenda(bloqueiosNaAgenda === 'mostrados' ? 'escondidos' : 'mostrados')}>
            Mostrar bloqueios <span className="num">{bloqueiosDoPeriodo.length}</span>
          </button>
        )}
        <button type="button" className="chip ag-chave" aria-pressed={canceladas === 'escondidas'}
                onClick={() => setCanceladas(canceladas === 'escondidas' ? 'mostradas' : 'escondidas')}>
          Esconder canceladas
        </button>
        {filtrando && (
          <button className="tx-btn" onClick={() => { setProfessorIds([]); setAlunoIds([]); setModuloIds([]); setAulaIds([]); setModalidade(null); }}>
            Limpar filtros
          </button>
        )}
        {/* a legenda fica recolhida, para a agenda ter mais espaço */}
        <details className="ag-legenda-d">
          <summary className="chip">Legenda</summary>
          <div className="ag-legenda" aria-label="Legenda">
            {LISTA_STATUS.map((s) => <span key={s}><i className="ag-st" style={{ background: STATUS[s].cor }} />{STATUS[s].nome}</span>)}
            <span><i className="ag-wa"><Ic n="chat" /></i>Lembrete enviado</span>
            <span><i className="ag-alerta" />Falta presença</span>
            <span><i className="ag-bl-amostra" />Bloqueio</span>
            {!estreita && <span>Arraste a aula para outro horário{visao === 'grade' ? ' ou para a coluna de outro professor' : ''}.</span>}
          </div>
        </details>
      </div>

      {visao === 'semana' ? (
        diasDaSemana.length ? (
          <Semana
            dias={diasDaSemana}
            agendamentos={visiveis}
            bloqueios={bloqueiosNoCalendario}
            professores={cad.professores}
            nomeDaAula={nomeDaAula}
            podeCriar={perm.criar}
            podeRemarcar={perm.remarcar}
            agora={horaConhecida(agora) ? agora : new Date(0)}
            hoje={hoje}
            estreita={estreita}
            rolarAte={rolarPara}
            aoNova={(inicio, fim) => novaAula('', inicio, fim)}
            aoAbrir={(id) => { const a = agendamentos.find((x) => x.id === id); if (a) setAberta({ tipo: 'editar', agendamento: a }); }}
            aoAbrirBloqueio={(id) => { const b = cad.bloqueios.find((x) => x.id === id); if (b) setBloqueio({ bloqueio: b }); }}
            aoAbrirDia={(d) => abreGrade(d)}
            aoMover={(id, inicio, fim) => aoMover(id, inicio, fim, () => {})}
          />
        ) : <div className="ag-sem carregando" aria-busy="true" />
      ) : visao === 'grade' ? (
        dia ? (
          <Grade
            dia={dia}
            agendamentos={visiveis}
            bloqueios={doFiltro}
            professores={cad.professores}
            soProfessores={professorIds}
            nomeDaAula={nomeDaAula}
            podeCriar={perm.criar}
            podeRemarcar={perm.remarcar}
            agora={horaConhecida(agora) ? agora : new Date(0)}
            rolarAte={rolarPara}
            estreita={estreita}
            aoNova={novaAula}
            aoAbrir={(id) => { const a = agendamentos.find((x) => x.id === id); if (a) setAberta({ tipo: 'editar', agendamento: a }); }}
            aoAbrirBloqueio={(id) => { const b = cad.bloqueios.find((x) => x.id === id); if (b) setBloqueio({ bloqueio: b }); }}
            aoMover={(id, inicio, fim, professorId) => aoMover(id, inicio, fim, () => {}, professorId)}
          />
        ) : <div className="ag-grade carregando" aria-busy="true" />
      ) : (
        <Calendario
          calRef={calRef}
          visao={visao}
          dataInicial={dia}
          rolarAte={rolarNoCalendario}
          agendamentos={visiveis}
          bloqueios={bloqueiosNoCalendario}
          professores={cad.professores}
          nomeDaAula={nomeDaAula}
          podeCriar={perm.criar}
          podeRemarcar={perm.remarcar}
          agora={horaConhecida(agora) ? agora : new Date(0)}
          aoMudarPeriodo={aoMudarPeriodo}
          aoSelecionar={(inicio, fim) => novaAula('', inicio, fim)}
          aoClicar={(quando) => novaAula('', quando, new Date(quando.getTime() + 3_600_000))}
          aoAbrirDia={(d) => abreGrade(diaDoNavegador(d))}
          aoAbrir={(id) => { const a = agendamentos.find((x) => x.id === id); if (a) setAberta({ tipo: 'editar', agendamento: a }); }}
          aoAbrirBloqueio={(id) => { const b = cad.bloqueios.find((x) => x.id === id); if (b) setBloqueio({ bloqueio: b }); }}
          aoMover={(id, inicio, fim, desfaz) => aoMover(id, inicio, fim, desfaz)}
        />
      )}

      {aberta && (
        <ModalDaAula key={aberta.tipo === 'editar' ? aberta.agendamento.id : `nova-${aberta.inicio}-${aberta.professorId || ''}`}
                     abertura={aberta} cad={cad} aoFechar={() => setAberta(null)} />
      )}
      {bloqueio && <ModalDoBloqueio abertura={bloqueio} cad={cad} aoFechar={() => setBloqueio(null)} />}

      {arraste && (
        <div className="mod ag-mod">
          <div className="mod-c ag-mc pequeno" role="dialog" aria-modal="true" aria-label="Remarcar aula">
            <header className="ag-mh"><h2>Remarcar aula</h2></header>
            <div className="ag-mb">
              <p className="ag-arraste-resumo">{resumoDoArraste}</p>
              {!arraste.conflitos ? (
                <>
                  <p>Esta aula faz parte de uma série. {arraste.novo.professorId !== undefined && arraste.novo.professorId !== arraste.alvo.professorId ? 'O novo horário e o professor valem' : 'O novo horário vale'} para:</p>
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
