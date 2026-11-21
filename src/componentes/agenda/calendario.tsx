'use client';
/* O calendário da agenda, com o FullCalendar 7. Só desenha e avisa o que a pessoa fez
   (selecionou horário, tocou numa aula, arrastou); quem decide e grava é agenda.tsx.
   Bloco: cor do professor, bolinha de status no canto, selo do WhatsApp quando o
   lembrete saiu, ponto de alerta quando a aula passou sem presença, e aluno que faltou
   riscado. Bloqueio é faixa cinza listrada por baixo, nunca aula. */
import { useMemo, useState, type RefObject } from 'react';
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
import {
  BLOQUEIOS, faltaPresenca, horaLocal, nomesCurtos, STATUS, textoSobre,
  type Agendamento, type Bloqueio, type Professor,
} from '@/lib/dominio/agenda';

export type Visao = 'dayGridMonth' | 'timeGridWeek' | 'timeGridDay';

interface Props {
  calRef: RefObject<CalendarRef | null>;
  visao: Visao;
  dataInicial?: string;           // AAAA-MM-DD: o link da conversa abre na semana da aula
  rolarAte?: string;              // HH:MM:SS: e rola até perto da hora dela
  agendamentos: Agendamento[];
  bloqueios: Bloqueio[];
  professores: Professor[];
  nomeDaAula: (id: string) => string;
  podeCriar: boolean;
  podeRemarcar: boolean;
  agora: Date;
  aoMudarPeriodo: (de: Date, ate: Date, titulo: string, visao: Visao) => void;
  aoSelecionar: (inicio: Date, fim: Date) => void;
  /** clique (ou toque) num horário; no mês, num dia */
  aoClicar: (quando: Date, diaInteiro: boolean) => void;
  aoAbrir: (id: string) => void;
  aoAbrirBloqueio: (id: string) => void;
  aoMover: (id: string, inicio: Date, fim: Date, desfaz: () => void) => void;
}

interface Dica { a: Agendamento; x: number; y: number }

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
  const { agendamentos, bloqueios, professores, podeRemarcar, podeCriar, visao, agora, nomeDaAula, dataInicial, rolarAte } = p;
  const porId = useMemo(() => new Map(agendamentos.map((a) => [a.id, a])), [agendamentos]);
  const prof = useMemo(() => new Map(professores.map((x) => [x.id, x])), [professores]);

  const eventos = useMemo<EventInput[]>(() => [
    ...agendamentos.map((a) => {
      const cor = prof.get(a.professorId)?.cor || '#D6D6D0';
      const parado = a.status === 'cancelado' || a.status === 'remarcado';
      return {
        id: a.id, start: a.inicio, end: a.fim, color: cor, contrastColor: textoSobre(cor),
        editable: podeRemarcar && a.status !== 'realizado',
        className: `ag-ev st-${a.status}${parado ? ' parado' : ''}`,
        extendedProps: { tipo: 'aula' },
      };
    }),
    ...bloqueios.map((b) => ({
      id: `bl:${b.id}`, start: b.inicio, end: b.fim, display: 'background',
      className: b.professorId ? 'ag-bl do-prof' : 'ag-bl',
      extendedProps: { tipo: 'bloqueio', bloqueio: b },
    })),
  ], [agendamentos, bloqueios, podeRemarcar, prof]);

  return (
    <div className="ag-cal">
      <FullCalendar
        ref={calRef}
        plugins={[classicTheme, dayGridPlugin, timeGridPlugin, interactionPlugin]}
        locale={ptBr}
        initialView={visao}
        initialDate={dataInicial || undefined}
        headerToolbar={false}
        height="100%"
        allDaySlot={false}
        slotMinTime="07:30:00"
        slotMaxTime="21:30:00"
        slotDuration="00:30:00"
        slotHeaderInterval="00:30:00"
        slotHeaderFormat={{ hour: '2-digit', minute: '2-digit', hour12: false }}
        slotMinHeight={36}
        scrollTime={rolarAte || '07:30:00'}
        nowIndicator
        slotEventOverlap={false}
        eventMinHeight={22}
        dayMaxEvents={4}
        selectable={podeCriar}
        selectMirror
        /* clique simples é dateClick (funciona com toque no celular, sem segurar o dedo);
           arrastar alguns pixels escolhe um trecho maior */
        selectMinDistance={6}
        selectLongPressDelay={300}
        navLinks
        navLinkDayClick="timeGridDay"
        dayLaneClass="ag-faixa"
        dayCellClass="ag-dia"
        dateClick={(i) => { setDica(null); p.aoClicar(i.date, i.allDay); }}
        editable={podeRemarcar}
        eventTimeFormat={{ hour: '2-digit', minute: '2-digit', hour12: false }}
        events={eventos}
        datesSet={(i) => { setDica(null); p.aoMudarPeriodo(i.start, i.end, i.view.title, i.view.type as Visao); }}
        select={(i) => { p.aoSelecionar(i.start, i.end); i.view.calendar.unselect(); }}
        eventClick={(i) => {
          i.jsEvent.preventDefault();
          setDica(null);
          const t = i.event.extendedProps.tipo;
          if (t === 'bloqueio') p.aoAbrirBloqueio(i.event.id.slice(3));
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
          const quem = b.professorId ? prof.get(b.professorId)?.nome.split(' ')[0] : '';
          /* "Feriado municipal" já diz o tipo; "Consulta médica" ganha o tipo na frente */
          const motivo = b.motivo && !b.motivo.toLowerCase().startsWith(BLOQUEIOS[b.tipo].toLowerCase()) ? `${BLOQUEIOS[b.tipo]}: ${b.motivo}` : b.motivo || BLOQUEIOS[b.tipo];
          /* a faixa deixa o clique passar para o horário; o nome abre o bloqueio, e o
             calendário não pode ver esse toque, senão abre também a aula nova */
          return (
            <span className="ag-bl-tx" role="button" tabIndex={0} title="Abrir o bloqueio" ref={seguraToque}
                  onClick={(e) => { e.stopPropagation(); setDica(null); p.aoAbrirBloqueio(b.id); }}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); p.aoAbrirBloqueio(b.id); } }}>
              {motivo}{quem && !motivo.includes(quem) ? ` (${quem})` : ''}
            </span>
          );
        }}
        eventContent={(i) => {
          const a = porId.get(i.event.id);
          if (!a) return null;
          const alerta = faltaPresenca(a, agora);
          const nomes = nomesCurtos(a.alunos);
          const mes = i.view.type === 'dayGridMonth';
          return (
            <div className={mes ? 'ag-b mes' : 'ag-b'}>
              <span className="ag-icones">
                {alerta && <span className="ag-alerta" title="Falta lançar presença" />}
                {a.lembreteEnviadoEm && <span className="ag-wa" title="Lembrete enviado no WhatsApp"><Ic n="chat" /></span>}
                <span className="ag-st" style={{ background: STATUS[a.status].cor }} title={STATUS[a.status].nome} />
              </span>
              {mes ? (
                <span className="ag-linha"><span className="num">{horaLocal(a.inicio)}</span> {nomeDaAula(a.aulaId)}{a.alunos.length ? ` (${a.alunos.length})` : ''}</span>
              ) : (
                <>
                  <b className="ag-aula">{nomeDaAula(a.aulaId)}</b>
                  <span className="ag-alunos">
                    {a.alunos.map((x, n) => (
                      <span key={x.id} className={x.presenca === 'faltou' ? 'falta' : undefined}>{nomes[n]}</span>
                    ))}
                  </span>
                </>
              )}
            </div>
          );
        }}
      />
      {dica && <CartaoDaAula {...dica} professor={prof.get(dica.a.professorId)} aula={nomeDaAula(dica.a.aulaId)} />}
    </div>
  );
}

/** O cartão do passar o mouse: horário, status, professor, aula e os alunos com presença. */
function CartaoDaAula({ a, x, y, professor, aula }: Dica & { professor?: Professor; aula: string }) {
  /* se não cabe à direita, vai para a esquerda do bloco */
  const largura = 280;
  const esquerda = typeof window !== 'undefined' && x + largura > window.innerWidth - 8 ? Math.max(8, x - largura - 24) : x;
  const topo = typeof window !== 'undefined' ? Math.min(y, window.innerHeight - 260) : y;
  return (
    <div className="ag-dica" style={{ left: esquerda, top: Math.max(8, topo) }} role="tooltip">
      <p className="num">{horaLocal(a.inicio)} às {horaLocal(a.fim)}</p>
      <p><span className="ag-st" style={{ background: STATUS[a.status].cor }} /> {STATUS[a.status].nome}</p>
      <p><b>Professor:</b> {professor?.nome || 'sem professor'}</p>
      <p><b>Aula:</b> {aula}</p>
      {a.alunos.length ? (
        <ul>
          {a.alunos.map((x) => (
            <li key={x.id} className={x.presenca === 'faltou' ? 'falta' : undefined}>
              {x.nome}<small>{x.presenca === 'presente' ? 'presente' : x.presenca === 'faltou' ? 'faltou' : 'sem presença'}</small>
            </li>
          ))}
        </ul>
      ) : <p className="vz-dica">Nenhum aluno nesta aula.</p>}
    </div>
  );
}
