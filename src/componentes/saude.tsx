'use client';
/* O que a gestão vê da saúde do sistema: a faixa vermelha no topo de todas as telas
   quando algo grave parou, e a seção Saúde do sistema nas Configurações, com tudo o
   que aconteceu e o que fazer. As regras são de src/lib/dominio/saude.ts. */
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { assina, define, modoDemo } from '@/lib/dados/fonte';
import { useAgora, horaConhecida } from '@/componentes/relogio';
import { avisa } from '@/componentes/aviso';
import { leAutomatico, type ConfigAutomatico } from '@/lib/dominio/automatico';
import {
  avisosDaSaude, camposDoJaVi, linhasDaSaude, type Aviso, type EstadoServidor, type Saude,
} from '@/lib/dominio/saude';

/* ---------- o servidor alcança o banco? (uma pergunta só, por mais telas que ouçam) ---------- */
const CONFERE_MS = 5 * 60_000;
let servidor: EstadoServidor = 'desconhecido';
const ouvintes = new Set<() => void>();
let relogio: ReturnType<typeof setInterval> | null = null;

async function confereServidor() {
  let novo: EstadoServidor;
  try {
    const r = await fetch('/api/saude', { cache: 'no-store' });
    const corpo = r.ok ? ((await r.json()) as { servidor?: EstadoServidor }) : null;
    novo = corpo?.servidor || 'fora';
  } catch {
    novo = 'desconhecido'; /* sem internet aqui não é o servidor fora */
  }
  if (novo !== servidor) {
    servidor = novo;
    ouvintes.forEach((f) => f());
  }
}

function ouveServidor(aviso: () => void) {
  if (modoDemo) return () => {};
  ouvintes.add(aviso);
  if (ouvintes.size === 1) {
    void confereServidor();
    relogio = setInterval(() => void confereServidor(), CONFERE_MS);
  }
  return () => {
    ouvintes.delete(aviso);
    if (!ouvintes.size && relogio) { clearInterval(relogio); relogio = null; }
  };
}

const naoOuve = () => () => {};
const useServidor = (ligado: boolean) =>
  useSyncExternalStore(ligado ? ouveServidor : naoOuve, () => (ligado ? servidor : 'desconhecido'),
    () => 'desconhecido' as EstadoServidor);

/* ---------- a saúde, lida do banco ---------- */
function useSaude(ligado: boolean) {
  const [configs, setConfigs] = useState<Record<string, unknown>[]>([]);
  useEffect(() => (ligado ? assina('config', (d) => setConfigs(d)) : undefined), [ligado]);
  const estadoDoServidor = useServidor(ligado);
  const agora = useAgora();

  return useMemo(() => {
    const saude = (configs.find((c) => c.id === 'saude') || null) as Saude | null;
    const automatico = leAutomatico(configs.find((c) => c.id === 'automatico') as Partial<ConfigAutomatico> | undefined);
    /* antes de saber a hora, nada de alarme: "há 56 anos" assustaria à toa */
    const avisos: Aviso[] = ligado && horaConhecida(agora)
      ? avisosDaSaude(saude, agora, { automaticoLigado: automatico.ligado, servidor: estadoDoServidor })
      : [];
    return { saude, avisos, agora };
  }, [configs, ligado, estadoDoServidor, agora]);
}

async function jaVi(saude: Saude | null) {
  await define('config', 'saude', { ...camposDoJaVi(saude, new Date()) });
  avisa('Falhas marcadas como vistas');
}

/** A faixa vermelha no topo. Só aparece para a gestão, e só para o que é grave. */
export function FaixaDeSaude({ gestao }: { gestao: boolean }) {
  const { saude, avisos } = useSaude(gestao && !modoDemo);
  const graves = avisos.filter((a) => a.grave);
  if (!graves.length) return null;
  const a = graves[0];
  return (
    <div className="fita-saude" role="alert">
      <span className="fs-txt">
        <b>{a.titulo}.</b>{' '}
        <span className="so-largo">{a.detalhe}</span>
        {graves.length > 1 && <span className="fs-mais"> E mais {graves.length - 1}.</span>}
      </span>
      <Link href="/ajustes#saude">Ver o que fazer</Link>
      {graves.every((g) => g.dispensavel) && (
        <button onClick={() => void jaVi(saude)}>Já vi</button>
      )}
    </div>
  );
}

/** A seção nas Configurações: tudo o que parou, o que fazer, e quando cada parte andou. */
export function SaudeDoSistema() {
  const { saude, avisos, agora } = useSaude(!modoDemo);
  const linhas = horaConhecida(agora) ? linhasDaSaude(saude, agora) : [];
  const temDispensavel = avisos.some((a) => a.dispensavel);

  return (
    <section className="bl" id="saude">
      <p className="bt">
        Saúde do sistema
        {temDispensavel && (
          <button className="tx-btn" onClick={() => void jaVi(saude)}>Já vi</button>
        )}
      </p>

      {modoDemo && (
        <p className="vz">Na demonstração não existe servidor: isso funciona no sistema publicado.</p>
      )}
      {!modoDemo && !avisos.length && (
        <p className="vz">
          Tudo funcionando. Quando alguma parte parar, ela aparece aqui e numa faixa
          vermelha no topo de todas as telas, com o que fazer.
        </p>
      )}

      {avisos.map((a) => (
        <div key={a.chave} className="lin">
          <span className={`pt ${a.grave ? 'erro' : 'aviso'}`} aria-hidden="true" />
          <span className="co">
            <b>{a.titulo}</b>
            <small>{a.detalhe}</small>
            <small className="cons">{a.conserto}</small>
          </span>
        </div>
      ))}

      {!modoDemo && linhas.length > 0 && (
        <dl className="batidas">
          {linhas.map((l) => (
            <div key={l.rotulo}>
              <dt>{l.rotulo}</dt>
              <dd className={l.conhecido ? '' : 'nunca'}>{l.valor}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}
