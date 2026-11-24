'use client';
/* Escolhas com busca, para os filtros (várias) e para o modal (uma). */
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Ic } from '@/componentes/icones';

export interface Opcao { id: string; nome: string; cor?: string; grupo?: string; detalhe?: string; codigo?: string }

/* procura pelo nome e, no aluno, pelo código */
const acha = (o: Opcao, termo: string) => sem(`${o.codigo || ''} ${o.nome}`).includes(sem(termo));

const sem = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function useFora(aberto: boolean, fecha: () => void) {
  const caixa = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!aberto) return;
    const ouve = (e: MouseEvent) => { if (caixa.current && !caixa.current.contains(e.target as Node)) fecha(); };
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') fecha(); };
    document.addEventListener('mousedown', ouve);
    document.addEventListener('keydown', tecla);
    return () => { document.removeEventListener('mousedown', ouve); document.removeEventListener('keydown', tecla); };
  }, [aberto, fecha]);
  return caixa;
}

/** Filtro de várias opções: o botão mostra quantas estão marcadas. */
export function Multi({ rotulo, opcoes, valor, aoMudar, comBusca = true }: {
  rotulo: string; opcoes: Opcao[]; valor: string[]; aoMudar: (v: string[]) => void; comBusca?: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const [termo, setTermo] = useState('');
  const caixa = useFora(aberto, () => setAberto(false));
  const visiveis = useMemo(() => (termo ? opcoes.filter((o) => acha(o, termo)) : opcoes).slice(0, 200), [opcoes, termo]);
  const marcadas = opcoes.filter((o) => valor.includes(o.id));
  const texto = !marcadas.length ? rotulo : marcadas.length === 1 ? marcadas[0].nome : `${rotulo}: ${marcadas.length}`;
  const troca = (id: string) => aoMudar(valor.includes(id) ? valor.filter((v) => v !== id) : [...valor, id]);
  /* o nome do grupo aparece na primeira opção dele */
  const comTitulo = visiveis.map((o, i) => ({ o, titulo: o.grupo && o.grupo !== visiveis[i - 1]?.grupo ? o.grupo : '' }));
  return (
    <div className="ag-esc" ref={caixa}>
      <button type="button" className={`chip ag-esc-b${valor.length ? ' tem' : ''}`} aria-expanded={aberto} aria-pressed={valor.length > 0}
              onClick={() => setAberto(!aberto)}>
        {marcadas.length === 1 && marcadas[0].cor && <i className="ag-esc-cor" style={{ background: marcadas[0].cor }} aria-hidden="true" />}
        <span>{texto}</span>
        <Ic n="seta" c="ag-esc-seta" />
      </button>
      {aberto && (
        <div className="ag-esc-p" role="dialog" aria-label={rotulo}>
          {comBusca && (
            <input className="cx" autoFocus placeholder={`Procurar ${rotulo.toLowerCase()}`} value={termo}
                   onChange={(e) => setTermo(e.target.value)} />
          )}
          <ul>
            {comTitulo.map(({ o, titulo }) => {
              return (
                <li key={o.id}>
                  {titulo && <p className="ag-esc-g">{titulo}</p>}
                  <label>
                    <input type="checkbox" checked={valor.includes(o.id)} onChange={() => troca(o.id)} />
                    {o.cor && <i className="ag-esc-cor" style={{ background: o.cor }} aria-hidden="true" />}
                    {o.codigo && <b className="num ag-esc-cod">{o.codigo}</b>}
                    <span>{o.nome}{o.detalhe && <small>{o.detalhe}</small>}</span>
                  </label>
                </li>
              );
            })}
            {!visiveis.length && <li className="ag-esc-vz">Nada com esse nome.</li>}
          </ul>
          {valor.length > 0 && <button type="button" className="tx-btn" onClick={() => aoMudar([])}>Limpar</button>}
        </div>
      )}
    </div>
  );
}

/** Uma opção, escolhida digitando: professor e aluno no modal. */
export function Busca({ opcoes, valor, aoEscolher, placeholder, desabilitado, rotulo, limpaDepois }: {
  opcoes: Opcao[]; valor: string; aoEscolher: (id: string) => void; placeholder: string;
  desabilitado?: boolean; rotulo: string; limpaDepois?: boolean;
}) {
  const atual = opcoes.find((o) => o.id === valor);
  const [termo, setTermo] = useState<string | null>(null);
  const [indice, setIndice] = useState(0);
  const caixa = useFora(termo !== null, () => setTermo(null));
  const idLista = useId();
  const lista = useMemo(() => (termo === null ? [] : opcoes.filter((o) => acha(o, termo)).slice(0, 8)), [opcoes, termo]);
  function escolhe(o: Opcao) {
    aoEscolher(o.id);
    setTermo(null);
    setIndice(0);
  }
  return (
    <div className="ag-esc ag-esc-unica" ref={caixa}>
      {atual?.cor && !limpaDepois && <i className="ag-esc-cor dentro" style={{ background: atual.cor }} aria-hidden="true" />}
      <input className={atual?.cor && !limpaDepois ? 'cx com-cor' : 'cx'} aria-label={rotulo} disabled={desabilitado}
             placeholder={placeholder} role="combobox" aria-expanded={lista.length > 0} aria-autocomplete="list" aria-controls={idLista}
             value={termo ?? (limpaDepois ? '' : atual?.nome || '')}
             onFocus={() => setTermo(limpaDepois ? '' : '')}
             onChange={(e) => { setTermo(e.target.value); setIndice(0); }}
             onKeyDown={(e) => {
               if (e.key === 'ArrowDown') { e.preventDefault(); setIndice((i) => Math.min(i + 1, lista.length - 1)); }
               if (e.key === 'ArrowUp') { e.preventDefault(); setIndice((i) => Math.max(i - 1, 0)); }
               if (e.key === 'Enter' && lista[indice]) { e.preventDefault(); escolhe(lista[indice]); }
             }} />
      {lista.length > 0 && (
        <ul className="ag-esc-p lista" role="listbox" id={idLista}>
          {lista.map((o, i) => (
            <li key={o.id} role="option" aria-selected={i === indice}>
              <button type="button" onMouseDown={(e) => { e.preventDefault(); escolhe(o); }}>
                {o.cor && <i className="ag-esc-cor" style={{ background: o.cor }} aria-hidden="true" />}
                {o.codigo && <b className="num ag-esc-cod">{o.codigo}</b>}
                    <span>{o.nome}{o.detalhe && <small>{o.detalhe}</small>}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
