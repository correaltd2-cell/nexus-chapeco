'use client';
/* Os dois gráficos do relatório da agenda, em SVG próprio.
   Barras: aulas por professor, uma série só (cor da marca); a cor de cada professor
   aparece como amostra ao lado do nome, a mesma do calendário. Valor na ponta.
   Linhas: a evolução das notas de um aluno nas quatro habilidades, com legenda,
   rótulo no fim de cada linha e a linha vertical que mostra os valores do ponto.
   Os quatro tons foram conferidos para daltonismo nos dois temas (validador da skill
   de visualização); dois têm contraste baixo no claro, por isso o rótulo direto e a
   tabela da linha do tempo, que traz os mesmos números. */
import { useMemo, useState } from 'react';
import { HABILIDADES, type Habilidade, type Notas } from '@/lib/dominio/agenda';

export function BarrasPorProfessor({ dados }: { dados: { nome: string; cor: string; aulas: number }[] }) {
  if (!dados.length) return <p className="vz">Nenhuma aula no filtro.</p>;
  const max = Math.max(...dados.map((d) => d.aulas), 1);
  return (
    <ul className="rel-barras" aria-label="Aulas por professor">
      {dados.map((d) => (
        <li key={d.nome}>
          <span className="rel-barras-n"><i style={{ background: d.cor }} aria-hidden="true" />{d.nome}</span>
          <span className="rel-barras-t" title={`${d.nome}: ${d.aulas} ${d.aulas === 1 ? 'aula' : 'aulas'}`}>
            <span className="rel-barra" style={{ width: `${(d.aulas / max) * 100}%` }} />
            <b className="num">{d.aulas}</b>
          </span>
        </li>
      ))}
    </ul>
  );
}

const NOME: Record<Habilidade, string> = { fala: 'Fala', leitura: 'Leitura', escuta: 'Escuta', escrita: 'Escrita' };
const L = 44, R = 92, T = 14, B = 26, W = 640, H = 220;

export function EvolucaoDasNotas({ pontos }: { pontos: { dia: string; notas: Notas }[] }) {
  const [foco, setFoco] = useState<number | null>(null);
  const series = useMemo(() => HABILIDADES.map((h) => ({
    h, valores: pontos.map((p, i) => ({ i, v: typeof p.notas[h] === 'number' ? (p.notas[h] as number) : null })).filter((x) => x.v !== null) as { i: number; v: number }[],
  })).filter((s) => s.valores.length), [pontos]);
  if (!series.length) return <p className="vz">Nenhuma nota lançada no período. As notas entram pelo modal da aula, em Notas.</p>;

  const x = (i: number) => L + (pontos.length === 1 ? (W - L - R) / 2 : (i / (pontos.length - 1)) * (W - L - R));
  const y = (v: number) => T + (1 - v / 10) * (H - T - B);
  /* rótulos do fim: na altura do último valor, empurrados para não encostar */
  const fins = series.map((s) => ({ h: s.h, v: s.valores[s.valores.length - 1].v, y: y(s.valores[s.valores.length - 1].v) })).sort((a, b) => a.y - b.y);
  for (let k = 1; k < fins.length; k += 1) if (fins[k].y - fins[k - 1].y < 13) fins[k].y = fins[k - 1].y + 13;
  const marcas = pontos.length <= 8 ? pontos.map((_, i) => i) : [0, Math.round((pontos.length - 1) / 2), pontos.length - 1];

  function aoMover(e: React.MouseEvent<SVGSVGElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    let melhor = 0;
    for (let i = 1; i < pontos.length; i += 1) if (Math.abs(x(i) - px) < Math.abs(x(melhor) - px)) melhor = i;
    setFoco(melhor);
  }

  return (
    <div className="rel-linhas ag-viz">
      <div className="rel-legenda" aria-label="Legenda">
        {series.map((s) => <span key={s.h}><i className={`s-${s.h}`} />{NOME[s.h]}</span>)}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Evolução das notas por habilidade, de 0 a 10"
           onMouseMove={aoMover} onMouseLeave={() => setFoco(null)}>
        {[0, 5, 10].map((v) => (
          <g key={v}>
            <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} className="rel-grade" />
            <text x={L - 8} y={y(v) + 4} textAnchor="end" className="rel-eixo">{v}</text>
          </g>
        ))}
        {marcas.map((i) => (
          <text key={i} x={x(i)} y={H - 6} textAnchor="middle" className="rel-eixo">{pontos[i].dia}</text>
        ))}
        {series.map((s) => (
          <g key={s.h} className={`s-${s.h}`}>
            <polyline fill="none" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round"
                      points={s.valores.map((p) => `${x(p.i)},${y(p.v)}`).join(' ')} />
            {s.valores.length === 1 && <circle cx={x(s.valores[0].i)} cy={y(s.valores[0].v)} r={4} />}
            <circle className="rel-fim" cx={x(s.valores[s.valores.length - 1].i)} cy={y(s.valores[s.valores.length - 1].v)} r={4} />
          </g>
        ))}
        {fins.map((f) => (
          <text key={f.h} x={W - R + 10} y={f.y + 4} className="rel-rotulo">{NOME[f.h]} {String(f.v).replace('.', ',')}</text>
        ))}
        {foco !== null && (
          <g className="rel-foco">
            <line x1={x(foco)} x2={x(foco)} y1={T} y2={H - B} />
            {series.map((s) => {
              const p = s.valores.find((q) => q.i === foco);
              return p ? <circle key={s.h} className={`s-${s.h}`} cx={x(foco)} cy={y(p.v)} r={4.5} /> : null;
            })}
          </g>
        )}
      </svg>
      {foco !== null && (
        <div className="rel-dica" style={{ left: `calc(18px + min(100% - 36px, 760px) * ${x(foco) / W})` }}>
          <b>{pontos[foco].dia}</b>
          {series.map((s) => {
            const p = s.valores.find((q) => q.i === foco);
            return <span key={s.h}><i className={`s-${s.h}`} />{NOME[s.h]} <b className="num">{p ? String(p.v).replace('.', ',') : 'sem nota'}</b></span>;
          })}
        </div>
      )}
    </div>
  );
}
