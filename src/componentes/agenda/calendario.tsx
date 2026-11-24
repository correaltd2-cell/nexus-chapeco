'use client';
/* O calendário da agenda (Semana, Mês e Dia), com o FullCalendar 7. Só desenha e avisa o
   que a pessoa fez (selecionou horário, tocou numa aula, arrastou); quem decide e grava é
   agenda.tsx. A visão padrão é a Grade (grade.tsx); esta fica para ver a semana e o mês.
   Bloco: a cor do professor suave no fundo e cheia na borda, bolinha de status no canto,
   selo do WhatsApp quando o lembrete saiu, ponto de alerta quando a aula passou sem
   presença. Na Semana o bloco é enxuto (hora, aula e quantos alunos; os nomes ficam no
   passar o mouse e no modal) e, acima de 4 no mesmo horário, aparecem 3 e um "+N" que
   abre a Grade ali (dominio/agenda-grade.ts). No Dia, os nomes aparecem, e quem faltou
   fica riscado. Bloqueio da escola é faixa cinza listrada por baixo; o de um professor
   só aparece se a pessoa pedir, como bloco pequeno listrado. Domingo não aparece. */
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
import {
  DIAS_FECHADOS, diaLocal, faltaPresenca, horaLocal, nomesCurtos, STATUS,
  type Agendamento, type Bloqueio, type Professor,
} from '@/lib/dominio/agenda';
import { compactaSemana, motivoCompleto, motivoCurto, nomeCurtoDaAula, tintaDoProfessor, type ItemDaSemana, type MaisNaSemana } from '@/lib/dominio/agenda-grade';

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
  /** o nome do dia (Semana e Mês) abre a Grade daquele dia */
  aoAbrirDia: (dia: Date) => void;
  /** o "+N" da Semana abre a Grade naquele dia e hora */
  aoMais: (dia: string, hora: string) => void;
}

/** As cores do professor como variáveis do CSS (fundo e texto de cada tema). */
function tinta(cor: string): CSSProperties {
  const t = tintaDoProfessor(cor);
  return { '--g-cor': t.cheia, '--g-fc': t.fundoClaro, '--g-tc': t.textoClaro, '--g-fe': t.fundoEscuro, '--g-te': t.textoEscuro } as CSSProperties;
}

/* o bloco pinta a si mesmo (a tinta do professor); o calendário não põe cor nem borda */
const SEM_COR = { color: 'transparent' };

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
  const [tipo, setTipo] = useState<Visao>(p.visao);
  const { agendamentos, bloqueios, professores, podeRemarcar, podeCriar, visao, agora, nomeDaAula, dataInicial, rolarAte } = p;
  const porId = useMemo(() => new Map(agendamentos.map((a) => [a.id, a])), [agendamentos]);
  const prof = useMemo(() => new Map(professores.map((x) => [x.id, x])), [professores]);
  const semana = tipo === 'timeGridWeek';

  /* na Semana, acima de 4 no mesmo horário: 3 e o "+N" */
  const enxuta = useMemo(() => {
    if (!semana) return null;
    const itens: ItemDaSemana[] = [
      ...agendamentos.map((a) => ({ id: a.id, inicio: a.inicio, fim: a.fim, prioridade: a.status === 'cancelado' || a.status === 'remarcado' ? 1 : 0 })),
      ...bloqueios.filter((b) => b.professorId && diaLocal(b.inicio) === diaLocal(new Date(new Date(b.fim).getTime() - 1)))
        .map((b) => ({ id: `bl:${b.id}`, inicio: b.inicio, fim: b.fim, prioridade: 2 })),
    ];
    return compactaSemana(itens);
  }, [semana, agendamentos, bloqueios]);
  const mais = useMemo(() => new Map((enxuta?.mais || []).map((m) => [m.id, m])), [enxuta]);

  const eventos = useMemo<EventInput[]>(() => [
    ...agendamentos.filter((a) => !enxuta || enxuta.visiveis.has(a.id)).map((a) => {
      const parado = a.status === 'cancelado' || a.status === 'remarcado';
      return {
        id: a.id, start: a.inicio, end: a.fim, ...SEM_COR,
        editable: podeRemarcar && a.status !== 'realizado',
        className: `ag-ev st-${a.status}${parado ? ' parado' : ''}${a.status === 'cancelado' ? ' cancelada' : ''}`,
        extendedProps: { tipo: 'aula' },
      };
    }),
    /* bloqueio da escola: faixa por baixo do dia inteiro; o do professor (quando pedido):
       bloco pequeno, como uma aula, para não cobrir a coluna inteira */
    ...bloqueios.filter((b) => !b.professorId).map((b) => ({
      id: `bl:${b.id}`, start: b.inicio, end: b.fim, display: 'background',
      className: 'ag-bl', extendedProps: { tipo: 'bloqueio', bloqueio: b },
    })),
    ...bloqueios.filter((b) => b.professorId && (!enxuta || enxuta.visiveis.has(`bl:${b.id}`))).map((b) => ({
      id: `bl:${b.id}`, start: b.inicio, end: b.fim, ...SEM_COR, editable: false,
      className: 'ag-ev ag-ev-bl', extendedProps: { tipo: 'bloqueio', bloqueio: b },
    })),
    ...(enxuta?.mais || []).map((m) => ({
      id: m.id, start: m.inicio, end: m.fim, ...SEM_COR, editable: false,
      className: 'ag-ev ag-mais', extendedProps: { tipo: 'mais' },
    })),
  ], [agendamentos, bloqueios, podeRemarcar, enxuta]);

  return (
    <div className="ag-cal">
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
        navLinkDayClick={(d) => { setDica(null); p.aoAbrirDia(d); }}
        dayLaneClass="ag-faixa"
        dayCellClass="ag-dia"
        dateClick={(i) => { setDica(null); p.aoClicar(i.date, i.allDay); }}
        editable={podeRemarcar}
        eventTimeFormat={{ hour: '2-digit', minute: '2-digit', hour12: false }}
        events={eventos}
        datesSet={(i) => { setDica(null); setTipo(i.view.type as Visao); p.aoMudarPeriodo(i.start, i.end, i.view.title, i.view.type as Visao); }}
        select={(i) => { p.aoSelecionar(i.start, i.end); i.view.calendar.unselect(); }}
        eventClick={(i) => {
          i.jsEvent.preventDefault();
          setDica(null);
          const t = i.event.extendedProps.tipo;
          if (t === 'bloqueio') p.aoAbrirBloqueio(i.event.id.slice(3));
          else if (t === 'mais') { const m = mais.get(i.event.id); if (m) p.aoMais(m.dia, m.hora); }
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
          const t = i.event.extendedProps.tipo;
          if (t === 'mais') {
            const m = mais.get(i.event.id);
            return m ? <MaisNaHora m={m} /> : null;
          }
          if (t === 'bloqueio') {
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
          const alerta = faltaPresenca(a, agora);
          const icones = (
            <span className="ag-icones">
              {alerta && <span className="ag-alerta" title="Falta lançar presença" />}
              {a.lembreteEnviadoEm && <span className="ag-wa" title="Lembrete enviado no WhatsApp"><Ic n="chat" /></span>}
              <span className="ag-st" style={{ background: STATUS[a.status].cor }} title={STATUS[a.status].nome} />
            </span>
          );
          const n = a.alunos.length;
          if (i.view.type === 'dayGridMonth') {
            return (
              <div className="ag-b mes ag-tinta" style={tinta(cor)}>
                {icones}
                <span className="ag-linha"><span className="num">{horaLocal(a.inicio)}</span> {nomeCurtoDaAula(nomeDaAula(a.aulaId))}{n ? ` (${n})` : ''}</span>
              </div>
            );
          }
          if (i.view.type === 'timeGridWeek') {
            /* enxuto: hora, aula e quantos alunos; os nomes ficam no passar o mouse e no modal */
            return (
              <div className="ag-b compacto ag-tinta" style={tinta(cor)}>
                {icones}
                <span className="num ag-b-hora">{horaLocal(a.inicio)}</span>
                <b className="ag-aula">{nomeCurtoDaAula(nomeDaAula(a.aulaId))}</b>
                <span className="ag-b-qt">
                  <span className="longo">· {n} {n === 1 ? 'aluno' : 'alunos'}</span>
                  <span className="curto" title={`${n} ${n === 1 ? 'aluno' : 'alunos'}`}><Ic n="pessoas" />{n}</span>
                </span>
              </div>
            );
          }
          const nomes = nomesCurtos(a.alunos);
          return (
            <div className="ag-b ag-tinta" style={tinta(cor)}>
              {icones}
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

/** O "+N" da Semana: as aulas que não couberam naquele horário; abre a Grade ali. */
function MaisNaHora({ m }: { m: MaisNaSemana }) {
  return (
    <div className="ag-mais-b" title={`Mais ${m.ocultos.length} às ${m.hora}: abrir na Grade`}>
      <b className="num">+{m.ocultos.length}</b>
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
