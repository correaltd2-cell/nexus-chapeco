'use client';
/* A casca do sistema, no mesmo arranjo da Luz por Assinatura: rail escuro com os
   nomes das seções à esquerda, interface clara ao lado. No celular o rail sai e
   entra a barra de abas embaixo.
   A trava de rota vale aqui E nas regras do Firestore, porque esconder o item do
   menu não é acesso negado. */
import { useEffect, useMemo } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Ic, SpriteDeIcones } from '@/componentes/icones';
import { useSessao, useTema } from '@/componentes/sessao';
import { MODULOS, NOME_MODULO, NOME_PAPEL, ehGestao, modulosDoPapel, type Modulo } from '@/lib/dominio/acessos';
import { modoDemo } from '@/lib/dados/fonte';
import { FaixaDeSaude } from '@/componentes/saude';
import { useCorDoMenu, useLarguraDoMenu } from '@/componentes/menu-lateral';

const ROTA: Record<Modulo, string> = {
  conversas: '/conversas', quadros: '/quadros', provas: '/provas',
  aulas: '/aulas', relatorios: '/relatorios', ajustes: '/ajustes',
};

const ICONE: Record<Modulo, string> = {
  conversas: 'chat', quadros: 'quadro', provas: 'doc',
  aulas: 'agenda', relatorios: 'grafico', ajustes: 'ajuste',
};

/* os grupos do menu, na ordem em que a escola pensa */
const GRUPOS: { titulo: string; modulos: Modulo[] }[] = [
  { titulo: 'Atendimento', modulos: ['conversas', 'quadros'] },
  { titulo: 'Escola', modulos: ['aulas', 'provas'] },
  { titulo: 'Gestão', modulos: ['relatorios', 'ajustes'] },
];

/* no celular a barra de baixo cabe quatro */
const NO_CELULAR: Modulo[] = ['conversas', 'quadros', 'aulas', 'ajustes'];

export default function CascaDoSistema({ children }: { children: React.ReactNode }) {
  const { estado, perfil, sair } = useSessao();
  const { escuro, setTema } = useTema();
  const [largura, setLargura] = useLarguraDoMenu();
  const [corDoMenu] = useCorDoMenu();
  const rota = usePathname();
  const router = useRouter();

  const meus = useMemo(() => (perfil ? modulosDoPapel(perfil.papel) : []), [perfil]);
  const atual = (MODULOS.find((m) => rota.startsWith(ROTA[m])) || 'conversas') as Modulo;

  useEffect(() => {
    if (estado === 'fora' || estado === 'sem-perfil') router.replace('/entrar');
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

  const rotulo = escuro ? 'Mudar para o tema claro' : 'Mudar para o tema escuro';
  /* a largura e a cor do menu são escolha de quem usa (menu-lateral.ts); no automático
     o CSS recolhe sozinho até 1440px, e os dois botões abaixo aparecem conforme o caso */
  const classeDaCasca = [
    'app', largura !== 'auto' && `menu-${largura}`, corDoMenu === 'claro' && 'menu-claro',
  ].filter(Boolean).join(' ');

  return (
    <>
      <SpriteDeIcones />
      <div className={classeDaCasca}>
        <aside className="rail">
          <div className="brand">
            <div className="brand-mark">
              <span className="bulb" aria-hidden="true">N</span>
              <div>
                <div className="brand-name">Nexus English Center</div>
                <div className="brand-sub">Chapecó</div>
              </div>
            </div>
          </div>

          <nav className="nav" aria-label="Seções do sistema">
            {GRUPOS.map((g) => {
              const itens = g.modulos.filter((m) => meus.includes(m));
              if (!itens.length) return null;
              return (
                <div key={g.titulo}>
                  <div className="nav-label">{g.titulo}</div>
                  {itens.map((m) => (
                    <Link key={m} href={ROTA[m]} className="nav-item"
                          title={NOME_MODULO[m]} aria-label={NOME_MODULO[m]}
                          aria-current={atual === m ? 'page' : undefined}>
                      <Ic n={ICONE[m]} />
                      <span>{NOME_MODULO[m]}</span>
                    </Link>
                  ))}
                </div>
              );
            })}
          </nav>

          <div className="rail-tg">
            <button className="menu-recolhe" onClick={() => setLargura('recolhido')}
                    title="Recolher o menu" aria-label="Recolher o menu">
              <Ic n="recolher" /><span>Recolher menu</span>
            </button>
            <button className="menu-abre" onClick={() => setLargura('aberto')}
                    title="Abrir o menu com os nomes" aria-label="Abrir o menu com os nomes">
              <Ic n="expandir" /><span>Abrir menu</span>
            </button>
          </div>

          <div className="rail-foot">
            <button className="me" onClick={() => void sair()} title={`${perfil.nome}. Sair`}>
              <span className="eu-foto" aria-hidden="true">{perfil.nome.slice(0, 1).toUpperCase()}</span>
              <div>
                <b>{perfil.nome}</b>
                <small>{NOME_PAPEL[perfil.papel]}</small>
              </div>
            </button>
            <button className="ib" onClick={() => setTema(escuro ? 'claro' : 'escuro')}
                    title={rotulo} aria-label={rotulo}>
              <Ic n={escuro ? 'sol' : 'lua'} />
            </button>
          </div>
        </aside>

        <main className="views">
          {modoDemo && (
            <p className="fita-demo">
              Demonstração, com dados fictícios. Nada aqui é aluno de verdade, e o que você mudar
              some ao recarregar a página.
            </p>
          )}
          <FaixaDeSaude gestao={ehGestao(perfil.papel)} />
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
