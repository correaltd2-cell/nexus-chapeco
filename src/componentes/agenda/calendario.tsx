'use client';
/* O calendário da agenda para o Mês e o Dia, com o FullCalendar 7. Só desenha e avisa o
   que a pessoa fez (tocou num dia, num horário, numa aula, arrastou); quem decide e grava
   é agenda.tsx. A Semana (a visão padrão) e a Grade são feitas aqui no sistema
   (semana.tsx e grade.tsx).
   - Mês: cada dia mostra quantas aulas e quantos alunos tem, nunca um "+N" que esconde
     aula; o dia abre a Grade daquele dia.
   - Dia: linhas de hora cheia, das 7h às 22h; o bloco tem a cor do professor suave no
     fundo e cheia na borda, a bolinha de status, o selo do WhatsApp quando o lembrete
     saiu, o ponto de alerta quando passou sem presença, e os alunos (quem faltou riscado).
   Bloqueio da escola é faixa cinza listrada por baixo; o de um professor só aparece no
   Dia se a pessoa pedir, como bloco pequeno listrado. Domingo não aparece. */
import { useMemo, useState, type CSSProperties, type RefObject } from 'react';
import FullCalendar, { type CalendarRef, type EventInput } from '@fullcalendar/react';
import classicTheme from '@fullcalendar/react/themes/classic';
import dayGridPlugin from '@fullcalendar/react/daygrid';
import timeGridPlugin from '@fullcalendar/react/timegrid';
import interactionPlugin from '@fullcalendar/react/interaction';
import ptBr from '@fullcalendar/react/locales/pt-br';
import '@fullcalendar/react/skeleton.css';
import '@fullcalendar/react/themes/classic/theme.css';
import '@fullcalendar/react/themes/classic/palette.css';
import { Ic } from '@/componentes/icones';
import { DIAS_FECHADOS, faltaPresenca, nomesCurtos, STATUS, type Agendamento, type Bloqueio, type Professor } from '@/lib/dominio/agenda';
import { contaDoPeriodo, motivoCompleto, motivoCurto, tintaDoProfessor } from '@/lib/dominio/agenda-grade';
import CartaoDaAula, { type Dica } from './cartao-da-aula';

export type Visao = 'dayGridMonth' | 'timeGridDay';

interface Props {
  calRef: RefObject<CalendarRef | null>;
  visao: Visao;
  dataInicial?: string;           // AAAA-MM-DD
  rolarAte?: string;              // HH:MM:SS: o Dia rola até perto dessa hora
  agendamentos: Agendamento[];
  bloqueios: Bloqueio[];
  professores: Professor[];
  nomeDaAula: (id: string) => string;
  podeCriar: boolean;
  podeRemarcar: boolean;
  agora: Date;
  aoMudarPeriodo: (de: Date, ate: Date, visao: Visao) => void;
  aoSelecionar: (inicio: Date, fim: Date) => void;
  /** clique (ou toque) num horário do Dia */
  aoClicar: (quando: Date) => void;
  aoAbrir: (id: string) => void;
  aoAbrirBloqueio: (id: string) => void;
  aoMover: (id: string, inicio: Date, fim: Date, desfaz: () => void) => void;
  /** no Mês, o dia (ou o número dele) abre a Grade daquele dia */
  aoAbrirDia: (dia: Date) => void;
}

/** As cores do professor como variáveis do CSS (fundo e texto de cada tema). */
function tinta(cor: string): CSSProperties {
  const t = tintaDoProfessor(cor);
  return { '--g-cor': t.cheia, '--g-fc': t.fundoClaro, '--g-tc': t.textoClaro, '--g-fe': t.fundoEscuro, '--g-te': t.textoEscuro } as CSSProperties;
}

/* o bloco pinta a si mesmo (a tinta do professor); o calendário não põe cor nem borda */
const SEM_COR = { color: 'transparent' };

/** O dia (AAAA-MM-DD) de uma data do calendário, que vem no fuso do navegador. */
const diaDoNavegador = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/* O calendário escuta o toque direto no elemento (antes do React): o nome do bloqueio
   segura o toque ali mesmo, senão o horário embaixo também abre a aula nova. */
function seguraToque(el: HTMLElement | null) {
  if (!el || el.dataset.seguro) return;
  el.dataset.seguro = '1';
  for (const tipo of ['pointerdown', 'mousedown', 'touchstart', 'pointerup', 'mouseup', 'touchend']) {
    el.addEventListener(tipo, (e) => e.stopPropagation());
  }
}

export default function Calendario({ calRef, ...p }: Props) {
  const [dica, setDica] = useState<Dica | null>(null);
  const [tipo, setTipo] = useState<Visao>(p.visao);
  const { agendamentos, bloqueios, professores, podeRemarcar, podeCriar, visao, agora, nomeDaAula, dataInicial, rolarAte } = p;
  const porId = useMemo(() => new Map(agendamentos.map((a) => [a.id, a])), [agendamentos]);
  const prof = useMemo(() => new Map(professores.map((x) => [x.id, x])), [professores]);
  const mes = tipo === 'dayGridMonth';

  /* no Mês, o resumo de cada dia: todas as aulas contadas, nenhuma escondida */
  const doDia = useMemo(() => {
    const m = new Map<string, Agendamento[]>();
    for (const a of agendamentos) {
      const d = diaDoNavegador(new Date(a.inicio));
      m.set(d, [...(m.get(d) || []), a]);
    }
    return new Map([...m].map(([d, l]) => [d, contaDoPeriodo(l)]));
  }, [agendamentos]);

  const eventos = useMemo<EventInput[]>(() => [
    ...(mes ? [] : agendamentos).map((a) => {
      const parado = a.status === 'cancelado' || a.status === 'remarcado';
      return {
        id: a.id, start: a.inicio, end: a.fim, ...SEM_COR,
        editable: podeRemarcar && a.status !== 'realizado',
        className: `ag-ev st-${a.status}${parado ? ' parado' : ''}${a.status === 'cancelado' ? ' cancelada' : ''}`,
        extendedProps: { tipo: 'aula' },
      };
    }),
    /* bloqueio da escola: faixa por baixo; o do professor (quando pedido): bloco pequeno */
    ...bloqueios.filter((b) => !b.professorId).map((b) => ({
      id: `bl:${b.id}`, start: b.inicio, end: b.fim, display: 'background',
      className: 'ag-bl', extendedProps: { tipo: 'bloqueio', bloqueio: b },
    })),
    ...(mes ? [] : bloqueios.filter((b) => b.professorId)).map((b) => ({
      id: `bl:${b.id}`, start: b.inicio, end: b.fim, ...SEM_COR, editable: false,
      className: 'ag-ev ag-ev-bl', extendedProps: { tipo: 'bloqueio', bloqueio: b },
    })),
  ], [agendamentos, bloqueios, podeRemarcar, mes]);

  return (
    <div className={`ag-cal${mes ? ' mes' : ''}`}>
      <FullCalendar
        ref={calRef}
        plugins={[classicTheme, dayGridPlugin, timeGridPlugin, interactionPlugin]}
        locale={ptBr}
        initialView={visao}
        initialDate={dataInicial || undefined}
        headerToolbar={false}
        hiddenDays={[...DIAS_FECHADOS]}
        height="100%"
        allDaySlot={false}
        /* hora cheia (pedido do cliente) */
        slotMinTime="07:00:00"
        slotMaxTime="22:00:00"
        slotDuration="01:00:00"
        slotHeaderInterval="01:00:00"
        slotHeaderFormat={{ hour: '2-digit', minute: '2-digit', hour12: false }}
        slotMinHeight={64}
        scrollTime={rolarAte || '07:00:00'}
        nowIndicator
        slotEventOverlap={false}
        eventMinHeight={26}
        dayMaxEvents={false}
        selectable={podeCriar}
        selectMirror
        /* clique simples é dateClick (funciona com toque no celular, sem segurar o dedo);
           arrastar alguns pixels escolhe um trecho maior */
        selectMinDistance={6}
        selectLongPressDelay={300}
        navLinks
        navLinkDayClick={(d) => { setDica(null); p.aoAbrirDia(d); }}
        dayLaneClass="ag-faixa"
        dayCellClass="ag-dia"
        dayCellTopContent={(i) => {
          if (i.view.type !== 'dayGridMonth') return undefined;
          const c = doDia.get(diaDoNavegador(i.date));
          return (
            <span className="ag-mes-dia">
              <span className="ag-mes-n">{i.dayNumberText}</span>
              {c && c.aulas > 0 && (
                <span className="ag-mes-conta">
                  <b className="num">{c.aulas}</b> {c.aulas === 1 ? 'aula' : 'aulas'}
                  <small className="num">{c.alunos} {c.alunos === 1 ? 'aluno' : 'alunos'}</small>
                </span>
              )}
            </span>
          );
        }}
        dateClick={(i) => {
          setDica(null);
          if (i.allDay) p.aoAbrirDia(i.date);
          else p.aoClicar(i.date);
        }}
        editable={podeRemarcar}
        eventTimeFormat={{ hour: '2-digit', minute: '2-digit', hour12: false }}
        events={eventos}
        datesSet={(i) => { setDica(null); setTipo(i.view.type as Visao); p.aoMudarPeriodo(i.start, i.end, i.view.type as Visao); }}
        select={(i) => { p.aoSelecionar(i.start, i.end); i.view.calendar.unselect(); }}
        eventClick={(i) => {
          i.jsEvent.preventDefault();
          setDica(null);
          if (i.event.extendedProps.tipo === 'bloqueio') p.aoAbrirBloqueio(i.event.id.slice(3));
          else p.aoAbrir(i.event.id);
        }}
        eventMouseEnter={(i) => {
          const a = porId.get(i.event.id);
          if (!a) return;
          const r = i.el.getBoundingClientRect();
          setDica({ a, x: r.right + 8, y: r.top });
        }}
        eventMouseLeave={() => setDica(null)}
        eventDrop={(i) => {
          if (!i.event.start || !i.event.end) { i.revert(); return; }
          p.aoMover(i.event.id, i.event.start, i.event.end, i.revert);
        }}
        eventResize={(i) => {
          if (!i.event.start || !i.event.end) { i.revert(); return; }
          p.aoMover(i.event.id, i.event.start, i.event.end, i.revert);
        }}
        backgroundEventContent={(i) => {
          const b = i.event.extendedProps.bloqueio as Bloqueio | undefined;
          if (!b) return null;
          /* a faixa deixa o clique passar para o horário; o nome abre o bloqueio, e o
             calendário não pode ver esse toque, senão abre também a aula nova */
          return (
            <span className="ag-bl-tx" role="button" tabIndex={0} title={motivoCompleto(b)} ref={seguraToque}
                  onClick={(e) => { e.stopPropagation(); setDica(null); p.aoAbrirBloqueio(b.id); }}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); p.aoAbrirBloqueio(b.id); } }}>
              {motivoCurto(b)}
            </span>
          );
        }}
        eventContent={(i) => {
          if (i.event.extendedProps.tipo === 'bloqueio') {
            const b = i.event.extendedProps.bloqueio as Bloqueio;
            const quem = b.professorId ? prof.get(b.professorId)?.nome.split(' ')[0] : '';
            return (
              <div className="ag-b ag-bl-b" title={`${motivoCompleto(b)}${quem ? ` (${quem})` : ''}`}>
                <span>{motivoCurto(b)}</span>{quem && <small>{quem}</small>}
              </div>
            );
          }
          const a = porId.get(i.event.id);
          if (!a) return null;
          const cor = prof.get(a.professorId)?.cor || '#8E8E88';
          const nomes = nomesCurtos(a.alunos);
          return (
            <div className="ag-b ag-tinta" style={tinta(cor)}>
              <span className="ag-icones">
                {faltaPresenca(a, agora) && <span className="ag-alerta" title="Falta lançar presença" />}
                {a.lembreteEnviadoEm && <span className="ag-wa" title="Lembrete enviado no WhatsApp"><Ic n="chat" /></span>}
                <span className="ag-st" style={{ background: STATUS[a.status].cor }} title={STATUS[a.status].nome} />
              </span>
              <b className="ag-aula">{nomeDaAula(a.aulaId)}</b>
              <span className="ag-alunos">
                {a.alunos.map((x, k) => (
                  <span key={x.id} className={x.presenca === 'faltou' ? 'falta' : undefined}>{nomes[k]}</span>
                ))}
              </span>
            </div>
          );
        }}
      />
      {dica && <CartaoDaAula {...dica} professor={prof.get(dica.a.professorId)} aula={nomeDaAula(dica.a.aulaId)} />}
    </div>
  );
}
