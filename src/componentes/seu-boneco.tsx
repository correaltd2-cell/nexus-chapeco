'use client';
/* Configurações, Seu bonequinho (26/11/2026): cada um monta o seu (pele, cabelo, cor do
   cabelo, roupa, fundo, barba e óculos) e escolhe se ele dá tchau quando o sistema abre.
   O desenho aparece embaixo do menu e no tchau. Grava no próprio perfil (as regras do
   Firestore deixam cada um mudar o seu perfil, menos papel, setores e acesso). */
import { useState } from 'react';
import { atualiza } from '@/lib/dados/fonte';
import { avisa } from '@/componentes/aviso';
import { Boneco } from '@/componentes/avatar';
import { CABELOS, CORES_DE_CABELO, FUNDOS, leAvatar, NOME_CABELO, PELES, ROUPAS, type Avatar } from '@/lib/dominio/avatar';
import type { Perfil } from '@/lib/dominio/tipos';

function Cores({ rotulo, lista, valor, muda }: { rotulo: string; lista: readonly string[]; valor: string; muda: (c: string) => void }) {
  return (
    <div className="bnc-linha">
      <span className="bnc-rot">{rotulo}</span>
      <div className="bnc-cores" role="radiogroup" aria-label={rotulo}>
        {lista.map((c) => (
          <button key={c} type="button" role="radio" aria-checked={valor === c} aria-label={`${rotulo} ${c}`}
                  className="bnc-cor" style={{ background: c }} onClick={() => muda(c)} />
        ))}
      </div>
    </div>
  );
}

export default function SeuBoneco({ perfil }: { perfil: Perfil }) {
  const salvo = leAvatar(perfil.avatar, perfil.nome);
  const [a, setA] = useState<Avatar>(salvo);
  const [vendoTchau, setVendoTchau] = useState(false);
  const mudou = JSON.stringify(a) !== JSON.stringify(salvo);
  const muda = <K extends keyof Avatar>(k: K, v: Avatar[K]) => setA((x) => ({ ...x, [k]: v }));

  async function salva() {
    await atualiza('perfis', perfil.id, { avatar: a });
    avisa('Bonequinho salvo');
  }

  return (
    <section className="bl">
      <p className="bt">Seu bonequinho</p>
      <div className="frm bnc">
        <div className="bnc-previa" style={{ background: a.fundo }}>
          <Boneco a={a} acenando={vendoTchau} titulo={`Bonequinho de ${perfil.nome}`} className="bnc-svg" />
          <button type="button" className="btn bnc-ver" onClick={() => setVendoTchau((v) => !v)}>
            {vendoTchau ? 'Parar o tchau' : 'Ver o tchau'}
          </button>
        </div>
        <div className="bnc-opcoes">
          <Cores rotulo="Pele" lista={PELES} valor={a.pele} muda={(c) => muda('pele', c)} />
          <div className="bnc-linha">
            <span className="bnc-rot">Cabelo</span>
            <div className="bnc-cabelos" role="radiogroup" aria-label="Cabelo">
              {CABELOS.map((c) => (
                <button key={c} type="button" role="radio" aria-checked={a.cabelo === c} className="bnc-cab" onClick={() => muda('cabelo', c)}>
                  <Boneco a={{ ...a, cabelo: c, barba: false, oculos: false }} />
                  <small>{NOME_CABELO[c]}</small>
                </button>
              ))}
            </div>
          </div>
          <Cores rotulo="Cor do cabelo" lista={CORES_DE_CABELO} valor={a.corCabelo} muda={(c) => muda('corCabelo', c)} />
          <Cores rotulo="Roupa" lista={ROUPAS} valor={a.roupa} muda={(c) => muda('roupa', c)} />
          <Cores rotulo="Fundo" lista={FUNDOS} valor={a.fundo} muda={(c) => muda('fundo', c)} />
          <div className="bnc-linha bnc-chaves">
            <label className="lig"><input type="checkbox" checked={a.barba} onChange={(e) => muda('barba', e.target.checked)} /><span><b>Barba</b></span></label>
            <label className="lig"><input type="checkbox" checked={a.oculos} onChange={(e) => muda('oculos', e.target.checked)} /><span><b>Óculos</b></span></label>
            <label className="lig"><input type="checkbox" checked={a.tchau} onChange={(e) => muda('tchau', e.target.checked)} />
              <span><b>Dar tchau quando eu abrir o sistema</b>Em tela grande, por menos de 3 segundos, uma vez por vez que você entra.</span></label>
          </div>
          <div className="acoes">
            {mudou && <button type="button" className="btn" onClick={() => setA(salvo)}>Desfazer</button>}
            <button type="button" className="btn p" disabled={!mudou} onClick={() => void salva()}>Salvar bonequinho</button>
          </div>
        </div>
      </div>
    </section>
  );
}
