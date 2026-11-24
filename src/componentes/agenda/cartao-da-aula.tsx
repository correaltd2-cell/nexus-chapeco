'use client';
/* O cartão do passar o mouse numa aula (Semana e Dia): horário, status, professor, aula
   e os alunos com a presença. Fica à direita do bloco, ou à esquerda se não couber. */
import { horaLocal, STATUS, type Agendamento, type Professor } from '@/lib/dominio/agenda';

export interface Dica { a: Agendamento; x: number; y: number }

export default function CartaoDaAula({ a, x, y, professor, aula }: Dica & { professor?: Professor; aula: string }) {
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
