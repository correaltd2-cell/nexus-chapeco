'use client';
/* O desenho do bonequinho (26/11/2026). Desenho nosso, em SVG: rosto, cabelo, barba e
   óculos opcionais, a roupa nos ombros e, quando acena, o braço dando tchau. As escolhas
   e o padrão de quem ainda não montou moram em src/lib/dominio/avatar.ts.
   - BonecoNoCirculo: o pequeno, dentro de um círculo com o fundo escolhido (menu, lista).
   - Boneco: o desenho solto, para o editor e para o tchau em tela grande. */
import { useId } from 'react';
import type { Avatar, Cabelo } from '@/lib/dominio/avatar';

/* rosto: centro (60,54), raio 25; ombros de 88 para baixo */
function CabeloAtras({ c, cor }: { c: Cabelo; cor: string }) {
  if (c === 'comprido') return <path d="M31 54 C29 27 45 19 60 19 C75 19 91 27 89 54 L92 96 C84 101 75 100 71 95 L71 62 L49 62 L49 95 C45 100 36 101 28 96 Z" fill={cor} />;
  if (c === 'rabo') return <path d="M82 40 C96 40 101 58 96 74 C93 84 86 88 82 86 C88 76 89 62 80 50 Z" fill={cor} />;
  if (c === 'coque') return <circle cx="60" cy="21" r="11" fill={cor} />;
  if (c === 'cacheado') {
    return (
      <g fill={cor}>
        {[[36, 44], [33, 56], [84, 44], [87, 56], [38, 66], [82, 66]].map(([x, y]) => <circle key={`${x}-${y}`} cx={x} cy={y} r="8" />)}
      </g>
    );
  }
  return null;
}

function CabeloFrente({ c, cor }: { c: Cabelo; cor: string }) {
  switch (c) {
    case 'curto':
      return <path d="M34 52 C33 32 45 24 60 24 C76 24 88 32 86 52 C81 44 71 39 60 39 C49 39 39 44 34 52 Z" fill={cor} />;
    case 'lateral':
      return <path d="M33 54 C30 32 46 22 62 23 C78 24 90 35 87 54 C84 46 78 40 71 37 C62 45 47 47 33 54 Z" fill={cor} />;
    case 'arrepiado':
      return <path d="M34 50 L35 32 L43 38 L46 23 L54 33 L60 18 L66 33 L74 23 L77 38 L85 32 L86 50 C79 42 70 39 60 39 C50 39 41 42 34 50 Z" fill={cor} />;
    case 'cacheado':
      return (
        <g fill={cor}>
          {[[40, 34], [50, 27], [60, 25], [70, 27], [80, 34], [45, 40], [56, 35], [66, 35], [76, 40], [36, 46], [84, 46]].map(([x, y]) => (
            <circle key={`${x}-${y}`} cx={x} cy={y} r="8" />
          ))}
        </g>
      );
    case 'comprido':
      return <path d="M34 50 C36 32 48 25 60 25 C73 25 85 32 86 50 C77 41 66 37 53 39 C45 41 39 45 34 50 Z" fill={cor} />;
    case 'rabo':
    case 'coque':
      return <path d="M34 50 C34 32 46 25 60 25 C75 25 86 32 86 50 C80 42 71 38 60 38 C49 38 40 42 34 50 Z" fill={cor} />;
    default:
      return null;
  }
}

/** O desenho, num grupo de 120 por 120. */
function Desenho({ a, acenando }: { a: Avatar; acenando: boolean }) {
  const linha = '#2A1E17';
  return (
    <g>
      <CabeloAtras c={a.cabelo} cor={a.corCabelo} />
      {/* ombros e pescoço */}
      <path d="M20 122 C20 99 37 88 60 88 C83 88 100 99 100 122 Z" fill={a.roupa} />
      <path d="M20 122 C20 99 37 88 60 88 C83 88 100 99 100 122" fill="none" stroke="rgba(0,0,0,.12)" strokeWidth="1.5" />
      <path d="M52 76 L52 90 C55 94 65 94 68 90 L68 76 Z" fill={a.pele} />
      <path d="M52 86 C56 89 64 89 68 86 L68 90 C65 94 55 94 52 90 Z" fill="rgba(0,0,0,.10)" />
      {/* orelhas e rosto */}
      <circle cx="35" cy="57" r="5.5" fill={a.pele} />
      <circle cx="85" cy="57" r="5.5" fill={a.pele} />
      <circle cx="60" cy="54" r="25" fill={a.pele} />
      <CabeloFrente c={a.cabelo} cor={a.corCabelo} />
      {a.barba && <path d="M36 58 C37 76 48 82 60 82 C72 82 83 76 84 58 C80 67 71 71 60 71 C49 71 40 67 36 58 Z" fill={a.corCabelo} />}
      {/* olhos, bochecha e sorriso */}
      <circle cx="50" cy="56" r="2.8" fill={linha} />
      <circle cx="70" cy="56" r="2.8" fill={linha} />
      <circle cx="44" cy="64" r="4" fill="#F28B82" opacity=".35" />
      <circle cx="76" cy="64" r="4" fill="#F28B82" opacity=".35" />
      <path d={a.barba ? 'M53 66 Q60 71 67 66' : 'M52 65 Q60 72 68 65'} fill="none" stroke={a.barba ? '#F7E9E0' : linha} strokeWidth="2.4" strokeLinecap="round" />
      {a.oculos && (
        <g fill="rgba(255,255,255,.18)" stroke={linha} strokeWidth="2.2">
          <circle cx="50" cy="56" r="7.5" />
          <circle cx="70" cy="56" r="7.5" />
          <path d="M57.5 56 L62.5 56 M42.5 55 L36 53 M77.5 55 L84 53" fill="none" />
        </g>
      )}
      {acenando && (
        <g className="boneco-braco">
          <path d="M92 104 C98 96 102 86 104 74" fill="none" stroke={a.roupa} strokeWidth="12" strokeLinecap="round" />
          <circle cx="104.5" cy="66" r="8" fill={a.pele} />
          <path d="M99 60 L100 54 M104 58 L104.5 52 M109 60 L110 55" stroke={a.pele} strokeWidth="3.6" strokeLinecap="round" />
        </g>
      )}
    </g>
  );
}

export function Boneco({ a, acenando = false, titulo, className }: { a: Avatar; acenando?: boolean; titulo?: string; className?: string }) {
  return (
    <svg viewBox="0 0 120 120" className={className} role={titulo ? 'img' : undefined} aria-label={titulo} aria-hidden={titulo ? undefined : true}>
      <Desenho a={a} acenando={acenando} />
    </svg>
  );
}

/** O bonequinho pequeno, no círculo com o fundo escolhido. */
export function BonecoNoCirculo({ a, tamanho = 36, titulo }: { a: Avatar; tamanho?: number; titulo?: string }) {
  const id = useId();
  return (
    <span className="boneco-circulo" style={{ width: tamanho, height: tamanho, background: a.fundo }} title={titulo} aria-hidden={titulo ? undefined : true}>
      <svg viewBox="12 14 96 96" width={tamanho} height={tamanho} aria-hidden="true">
        <clipPath id={`bc-${id}`}><circle cx="60" cy="62" r="48" /></clipPath>
        <g clipPath={`url(#bc-${id})`}>
          <Desenho a={a} acenando={false} />
        </g>
      </svg>
    </span>
  );
}
