'use client';
/* A logo da Central de Atendimento Nexus Chapecó: um balão de conversa em 3D com o N
   em relevo. A borda de baixo dá a espessura, o brilho de cima dá o vidro, uma faixa
   de luz passa de tempos em tempos e o ponto verde pulsa dizendo "atendimento ao
   vivo". Tudo SVG desenhado aqui, sem imagem de fora. Quem pede menos movimento no
   aparelho vê a logo parada (regra global de prefers-reduced-motion). */
import { useId } from 'react';

/* balão: retângulo de cantos redondos com a pontinha embaixo à esquerda */
const BALAO = 'M20 4H44a14 14 0 0 1 14 14v16a14 14 0 0 1-14 14H26l-11 8.5 2.5-8.7A14 14 0 0 1 6 34V18A14 14 0 0 1 20 4z';
const BRILHO = 'M20 6.5H44a11.5 11.5 0 0 1 11.5 11.5v1.5c-8 4.5-39 4.5-47 0V18A11.5 11.5 0 0 1 20 6.5z';
const LETRA = 'M19 38V14h6.5l13 15.5V14H45v24h-6.5l-13-15.5V38z';

export default function Logo({ tamanho = 40, vivo = true, flutua = false }: {
  tamanho?: number; vivo?: boolean; flutua?: boolean;
}) {
  const id = useId().replace(/:/g, '');
  const u = (nome: string) => `url(#${id}-${nome})`;
  return (
    <svg className={flutua ? 'logo flutua' : 'logo'} width={tamanho} height={tamanho} viewBox="0 0 64 64"
         role="img" aria-label="Nexus Chapecó, central de atendimento">
      <defs>
        <linearGradient id={`${id}-face`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFB45E" />
          <stop offset=".45" stopColor="#F6821F" />
          <stop offset="1" stopColor="#DC570B" />
        </linearGradient>
        <linearGradient id={`${id}-lado`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#B4450A" />
          <stop offset="1" stopColor="#7A2C05" />
        </linearGradient>
        <linearGradient id={`${id}-brilho`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity=".6" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={`${id}-letra`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFFFFF" />
          <stop offset="1" stopColor="#FFE4C7" />
        </linearGradient>
        <linearGradient id={`${id}-faixa`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset=".5" stopColor="#fff" stopOpacity=".55" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <clipPath id={`${id}-corte`}><path d={BALAO} /></clipPath>
      </defs>
      <ellipse cx="31" cy="60.5" rx="19" ry="2.6" fill="#000" opacity=".16" />
      <path d={BALAO} transform="translate(0 3.5)" fill={u('lado')} />
      <path d={BALAO} fill={u('face')} />
      <path d={BRILHO} fill={u('brilho')} />
      <g clipPath={u('corte')}>
        <rect className="logo-faixa" x="-34" y="-4" width="20" height="72" fill={u('faixa')} />
      </g>
      <path d={LETRA} transform="translate(1.3 2.3)" fill="#7A2C05" opacity=".5" />
      <path d={LETRA} fill={u('letra')} />
      {vivo && (
        <g>
          <circle className="logo-onda" cx="55" cy="9" r="6" fill="#25D366" />
          <circle cx="55" cy="9" r="5" fill="#25D366" stroke="#fff" strokeWidth="2" />
        </g>
      )}
    </svg>
  );
}
