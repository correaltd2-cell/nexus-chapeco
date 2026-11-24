'use client';
/* Cadastros: tudo o que a escola cadastra, numa tela só (pedido do cliente, 24/11/2026).
   Alunos (a ficha e a planilha do cadastro, com os telefones), professores (a equipe que
   dá aula, com a cor na agenda) e os módulos e aulas do currículo. A planilha de marcação
   fica em Alunos, só com o que a marcação usa; o aluno cadastrado aqui cai lá na hora. */
import Link from 'next/link';
import { useSessao } from '@/componentes/sessao';
import { permissoesDe } from '@/lib/dominio/agenda';
import CadastroDeAlunos from '@/componentes/alunos-cadastro';
import CadastrosDaAgenda from '@/componentes/agenda/cadastros';

export type ParteDosCadastros = 'alunos' | 'professores' | 'aulas';
const PARTES: { id: ParteDosCadastros; nome: string; href: string }[] = [
  { id: 'alunos', nome: 'Alunos', href: '/cadastros' },
  { id: 'professores', nome: 'Professores', href: '/cadastros/professores' },
  { id: 'aulas', nome: 'Módulos e aulas', href: '/cadastros/aulas' },
];

export default function Cadastros({ parte, abrirFicha = false }: { parte: ParteDosCadastros; abrirFicha?: boolean }) {
  const { perfil } = useSessao();
  const agenda = permissoesDe(perfil?.papel).criar;
  const partes = PARTES.filter((p) => p.id === 'alunos' || agenda);
  return (
    <div className={`alu cads${parte === 'alunos' ? ' alu-tela' : ''}`}>
      <header className="vh alu-h">
        <h1>Cadastros</h1>
        <nav className="chips cads-abas" aria-label="O que cadastrar">
          {partes.map((p) => (
            <Link key={p.id} href={p.href} className="chip" aria-current={p.id === parte ? 'page' : undefined} aria-pressed={p.id === parte}>
              {p.nome}
            </Link>
          ))}
        </nav>
      </header>
      {parte === 'alunos'
        ? <CadastroDeAlunos abrirFicha={abrirFicha} />
        : <div className="cads-corpo"><CadastrosDaAgenda parte={parte} /></div>}
    </div>
  );
}
