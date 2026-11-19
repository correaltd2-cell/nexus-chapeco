'use client';
/* A comemoração de passar a conversa de setor: um cartão que salta com o avatar de quem
   recebe, um aviãozinho entrando e confete, por menos de dois segundos. Não pega clique
   (pointer-events: none), então a recepção segue trabalhando por baixo. Quem chama é o
   painel do contato, depois que a passagem deu certo; quem desenha é este componente,
   montado uma vez na casca. Desliga em Configurações, Aparência. */
import { useEffect, useSyncExternalStore, type CSSProperties } from 'react';
import { assina } from '@/lib/dados/fonte';
import { Ic } from '@/componentes/icones';
import { ICONE_DO_SETOR } from '@/componentes/setor';
import { animacaoLigada, useAnimacao } from '@/componentes/preferencias';
import { festaDaTransferencia, quemRecebe, type Festa as DadosDaFesta } from '@/lib/dominio/festa';
import type { Perfil, Setor } from '@/lib/dominio/tipos';

const DURACAO_MS = 1900;

let atual: (DadosDaFesta & { chave: number }) | null = null;
let pessoas: Perfil[] = [];
let relogio: ReturnType<typeof setTimeout> | null = null;
const ouvintes = new Set<() => void>();
const avisa = () => ouvintes.forEach((f) => f());

/** Chamar depois que a conversa passou de setor. */
export function comemoraTransferencia(setor: Setor) {
  if (!animacaoLigada()) return;
  atual = { ...festaDaTransferencia(setor, quemRecebe(setor, pessoas), Math.random()), chave: Date.now() };
  avisa();
  if (relogio) clearTimeout(relogio);
  relogio = setTimeout(() => { atual = null; avisa(); }, DURACAO_MS);
}

function ouve(aviso: () => void) {
  ouvintes.add(aviso);
  return () => { ouvintes.delete(aviso); };
}

const CONFETES = Array.from({ length: 12 }, (_, i) => i);

export default function Festa() {
  const [animacao] = useAnimacao();
  /* a equipe, para saber quem é a pessoa de cada coordenação */
  useEffect(() => (animacao === 'ligada'
    ? assina('perfis', (d) => { pessoas = d as unknown as Perfil[]; })
    : undefined), [animacao]);
  const f = useSyncExternalStore(ouve, () => atual, () => null);
  if (!f) return null;
  return (
    <div className="festa" role="status" aria-live="polite">
      <div key={f.chave} className={`festa-c st-${f.setor}`}>
        <span className="festa-av" aria-hidden="true">
          {f.inicial || <Ic n={ICONE_DO_SETOR[f.setor]} />}
          <span className="festa-aviao"><Ic n="envia" /></span>
          <span className="festa-confete">
            {CONFETES.map((i) => <i key={i} style={{ '--a': `${i * 30}deg` } as CSSProperties} />)}
          </span>
        </span>
        <span className="festa-tx">
          <b>{f.titulo}</b>
          <small>{f.frase}</small>
        </span>
      </div>
    </div>
  );
}
