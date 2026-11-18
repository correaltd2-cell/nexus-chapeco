'use client';
/* A casca do sistema: trilho no computador, abas no celular, troca de tema e a trava
   de rota. Esconder o item do menu nao é acesso negado, entao a trava vale aqui E nas
   regras do Firestore. */
import { useEffect, useMemo } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Ic, SpriteDeIcones } from '@/componentes/icones';
import { useSessao, useTema } from '@/componentes/sessao';
import { MODULOS, NOME_MODULO, modulosDoPapel, type Modulo } from '@/lib/dominio/acessos';
import { modoDemo } from '@/lib/dados/fonte';

const ROTA: Record<Modulo, string> = {
  conversas: '/conversas',
  quadros: '/quadros',
  provas: '/provas',
  aulas: '/aulas',
  relatorios: '/relatorios',
  ajustes: '/ajustes',
};

const ICONE: Record<Modulo, string> = {
  conversas: 'chat',
  quadros: 'quadro',
  provas: 'doc',
  aulas: 'agenda',
  relatorios: 'grafico',
  ajustes: 'ajuste',
};

/* no celular a barra de baixo cabe quatro; o resto fica no trilho do computador */
const NO_CELULAR: Modulo[] = ['conversas', 'quadros', 'aulas', 'ajustes'];

export default function CascaDoSistema({ children }: { children: React.ReactNode }) {
  const { estado, perfil, sair } = useSessao();
  const { escuro, setTema } = useTema();
  const rota = usePathname();
  const router = useRouter();

  const meus = useMemo(() => (perfil ? modulosDoPapel(perfil.papel) : []), [perfil]);
  const atual = (MODULOS.find((m) => rota.startsWith(ROTA[m])) || 'conversas') as Modulo;

  useEffect(() => {
    if (estado === 'fora') router.replace('/entrar');
    if (estado === 'sem-perfil') router.replace('/entrar');
  }, [estado, router]);

  useEffect(() => {
    if (estado !== 'dentro' || !perfil) return;
    if (!meus.includes(atual) && meus.length) router.replace(ROTA[meus[0]]);
  }, [estado, perfil, atual, meus, router]);

  if (estado === 'sem-config') {
    return (
      <div className="login"><div className="login-c">
        <span className="eu-foto grande" aria-hidden="true">N</span>
        <h1>Falta ligar o Firebase</h1>
        <p className="obs">Preencha o .env.local com as chaves do projeto e recarregue.</p>
      </div></div>
    );
  }

  if (estado !== 'dentro' || !perfil) {
    return <div className="carregando" role="status">Carregando...</div>;
  }

  const trocaTema = () => setTema(escuro ? 'claro' : 'escuro');

  return (
    <>
      <SpriteDeIcones />
      <div className="app">
        <nav className="rail" aria-label="Seções do sistema">
          {meus.map((m) => (
            <Link key={m} href={ROTA[m]} className="ib" title={NOME_MODULO[m]}
                  aria-label={NOME_MODULO[m]} aria-current={atual === m ? 'page' : undefined}>
              <Ic n={ICONE[m]} />
            </Link>
          ))}
          <span className="sp" />
          <button className="ib" onClick={trocaTema}
                  title={escuro ? 'Mudar para o tema claro' : 'Mudar para o tema escuro'}
                  aria-label={escuro ? 'Mudar para o tema claro' : 'Mudar para o tema escuro'}>
            <Ic n={escuro ? 'sol' : 'lua'} />
          </button>
          <button className="eu-foto" onClick={() => void sair()} title={`${perfil.nome}. Sair`}
                  aria-label={`${perfil.nome}. Sair do sistema`}>
            {perfil.nome.slice(0, 1).toUpperCase()}
          </button>
        </nav>

        <main className="views">
          {modoDemo && (
            <p className="fita-demo">
              Demonstração, com dados fictícios. Nada aqui é aluno de verdade, e o que você mudar
              some ao recarregar a página.
            </p>
          )}
          {children}
        </main>

        <nav className="tabs" aria-label="Seções do sistema">
          {NO_CELULAR.filter((m) => meus.includes(m)).map((m) => (
            <Link key={m} href={ROTA[m]} aria-current={atual === m ? 'page' : undefined}>
              <span className="pl"><Ic n={ICONE[m]} /></span>
              {NOME_MODULO[m]}
            </Link>
          ))}
        </nav>
      </div>
      <div className="toast" id="toast" role="status" aria-live="polite" />
    </>
  );
}
