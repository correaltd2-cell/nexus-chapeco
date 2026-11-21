'use client';
/* As abas da agenda: o calendário, o relatório, o log e os cadastros (módulos, aulas
   do currículo e a cor de cada professor). O professor só vê o calendário. */
import Link from 'next/link';
import { useSessao } from '@/componentes/sessao';
import { permissoesDe } from '@/lib/dominio/agenda';

export type Aba = 'agenda' | 'relatorio' | 'log' | 'cadastros';
const ABAS: { id: Aba; nome: string; href: string }[] = [
  { id: 'agenda', nome: 'Calendário', href: '/aulas' },
  { id: 'relatorio', nome: 'Relatório', href: '/aulas/relatorio' },
  { id: 'log', nome: 'Log', href: '/aulas/log' },
  { id: 'cadastros', nome: 'Cadastros', href: '/aulas/cadastros' },
];

export default function AbasDaAgenda({ atual }: { atual: Aba }) {
  const { perfil } = useSessao();
  if (!permissoesDe(perfil?.papel).criar) return null;
  return (
    <nav className="chips ag-abas" aria-label="Partes da agenda">
      {ABAS.map((a) => (
        <Link key={a.id} href={a.href} className="chip" aria-current={a.id === atual ? 'page' : undefined} aria-pressed={a.id === atual}>
          {a.nome}
        </Link>
      ))}
    </nav>
  );
}
