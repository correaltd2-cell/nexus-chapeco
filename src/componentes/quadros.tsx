'use client';
/* Os quadros. Mesmo arranjo do Trello, porque é o que o time ja sabe usar:
   quadro, listas e cartoes que se arrastam, etiqueta criada por nome, pessoa, urgencia,
   prazo com data e hora (com destaque de atrasado), capa, checklist, comentario, anexo,
   filtro, plano de fundo e arquivo. O arquivado some do quadro, mas a busca acha (pedido
   do cliente, 24/11/2026). O que o Trello nao tem é a ligacao com a conversa do aluno,
   que é o motivo de existir aqui dentro. Regras: dominio/quadros.ts. */
import {
  useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent, type FormEvent, type PointerEvent as EventoDePonteiro,
} from 'react';
import { useRouter } from 'next/navigation';
import { assina, atualiza, cria, grava, lote } from '@/lib/dados/fonte';
import { Ic } from '@/componentes/icones';
import { avisa } from '@/componentes/aviso';
import { useSessao } from '@/componentes/sessao';
import { horaConhecida, useAgora } from '@/componentes/relogio';
import CartaoAberto from '@/componentes/cartao-aberto';
import { PainelDeEtiquetas, PainelDoFundo } from '@/componentes/quadro-paineis';
import {
  LISTAS_PADRAO, NOME_DA_URGENCIA, PASSO, URGENCIAS, arquivadosNaBusca, cartoesDaLista, copiaDoCartao, corNoQuadro,
  criaEtiqueta, estadoDoPrazo, etiquetasDoQuadro, feitosDoChecklist, filtrosVazios, fundoDoQuadro, listasVisiveis, novoId,
  ordemEntre, passaNosFiltros, precisaRenumerar, quantosFiltros, renumera, reordenaListas, textoDoPrazo,
  type EstadoDoPrazo,
} from '@/lib/dominio/quadros';
import { iniciais } from '@/lib/dominio/formato';
import type { Cartao, Conversa, Etiqueta, Lista, Perfil, Quadro } from '@/lib/dominio/tipos';

const agoraIso = () => new Date().toISOString();
const TEXTO_DO_ESTADO: Record<EstadoDoPrazo, string> = { atrasado: 'Atrasado', breve: 'Vence em breve', concluido: 'Concluído', normal: 'Prazo' };

export default function Quadros() {
  const { perfil } = useSessao();
  const router = useRouter();
  const relogio = useAgora();
  const agora = horaConhecida(relogio) ? relogio : null;
  const [quadros, setQuadros] = useState<Quadro[]>([]);
  const [listas, setListas] = useState<Lista[]>([]);
  const [cartoes, setCartoes] = useState<Cartao[]>([]);
  const [equipe, setEquipe] = useState<Perfil[]>([]);
  const [conversas, setConversas] = useState<Conversa[]>([]);
  const [atualId, setAtualId] = useState<string | null>(null);
  const [filtros, setFiltros] = useState(filtrosVazios());
  const [pop, setPop] = useState<string | null>(null);
  const [abertoId, setAbertoId] = useState<string | null>(null);
  const [addEm, setAddEm] = useState<string | null>(null);
  const [addTexto, setAddTexto] = useState('');
  const [novaLista, setNovaLista] = useState('');
  const [addLista, setAddLista] = useState(false);
  const [novoQuadro, setNovoQuadro] = useState<string | null>(null);
  const [renomeando, setRenomeando] = useState<string | null>(null);
  const [renomeiaQuadro, setRenomeiaQuadro] = useState(false);
  const [buscaArquivo, setBuscaArquivo] = useState('');
  const [alvoLista, setAlvoLista] = useState<{ id: string; antes: boolean } | null>(null);
  const arrastando = useRef<string | null>(null);
  const arrastandoLista = useRef<string | null>(null);
  const tela = useRef<HTMLDivElement>(null);

  useEffect(() => assina('quadros', (docs) => {
    const qs = (docs as unknown as Quadro[]).filter((q) => !q.arquivado).sort((a, b) => a.ordem - b.ordem);
    setQuadros(qs);
    setAtualId((a) => (a && qs.some((q) => q.id === a) ? a : qs[0]?.id || null));
  }), []);

  useEffect(() => assina('listas', (docs) => setListas(docs as unknown as Lista[])), []);
  useEffect(() => assina('cartoes', (docs) => setCartoes(docs as unknown as Cartao[])), []);
  useEffect(() => assina('perfis', (docs) => {
    setEquipe((docs as unknown as Perfil[]).filter((p) => p.ativo));
  }), []);
  useEffect(() => assina('conversas', (docs) => setConversas(docs as unknown as Conversa[])), []);

  const quadro = quadros.find((q) => q.id === atualId) || null;
  const etiquetas = etiquetasDoQuadro(quadro);
  const fundo = fundoDoQuadro(quadro);
  const minhasListas = useMemo(
    () => listasVisiveis(listas.filter((l) => l.quadroId === atualId)),
    [listas, atualId],
  );
  const aberto = cartoes.find((c) => c.id === abertoId) || null;
  const nFiltros = quantosFiltros(filtros);
  const nomeDe = useCallback((uid: string) => equipe.find((p) => p.id === uid)?.nome, [equipe]);
  const doQuadro = cartoes.filter((c) => c.quadroId === atualId && !c.arquivado);
  const atrasados = agora ? doQuadro.filter((c) => estadoDoPrazo(c, agora) === 'atrasado').length : 0;
  const arquivadosAchados = quadro ? arquivadosNaBusca(cartoes, quadro.id, filtros.busca, nomeDe) : [];
  const etiquetasDoAberto = etiquetasDoQuadro(quadros.find((q) => q.id === aberto?.quadroId));

  /* ---------- escrever ---------- */
  async function criaQuadro(nome: string) {
    const id = await cria('quadros', {
      nome, ordem: (quadros.length + 1) * PASSO, arquivado: false, criadoEm: agoraIso(),
    });
    for (let i = 0; i < LISTAS_PADRAO.length; i++) {
      await cria('listas', { quadroId: id, nome: LISTAS_PADRAO[i], ordem: (i + 1) * PASSO, arquivada: false });
    }
    setAtualId(id);
    avisa(`Quadro ${nome} criado`);
  }

  async function criaCartao(listaId: string, titulo: string) {
    const naLista = cartoesDaLista(cartoes, listaId);
    const ultimo = naLista[naLista.length - 1];
    await cria('cartoes', {
      quadroId: atualId, listaId, ordem: ultimo ? ultimo.ordem + PASSO : PASSO,
      titulo, descricao: '', etiquetas: [], membros: perfil ? [perfil.id] : [],
      prazoConcluido: false, checklist: [], comentarios: [],
      atividade: [{ id: novoId(), autorNome: perfil?.nome || 'Equipe', texto: 'criou o cartão', criadoEm: agoraIso() }],
      anexos: [], arquivado: false, criadoEm: agoraIso(), atualizadoEm: agoraIso(),
    });
  }

  /** Etiqueta nova criada de dentro do cartão: entra no quadro dele. */
  async function criaEtiquetaNoQuadro(quadroId: string, nome: string, cor: string): Promise<string | null> {
    const q = quadros.find((x) => x.id === quadroId);
    const r = criaEtiqueta(etiquetasDoQuadro(q), nome, cor);
    if ('erro' in r) return r.erro;
    try { await atualiza('quadros', quadroId, { etiquetas: r.lista }); } catch { return 'Não consegui salvar. Confira a internet e tente de novo.'; }
    return null;
  }

  async function copiaCartao(c: Cartao) {
    const naLista = cartoesDaLista(cartoes, c.listaId);
    const i = naLista.findIndex((x) => x.id === c.id);
    const depois = naLista[i + 1];
    const ordem = depois ? (c.ordem + depois.ordem) / 2 : c.ordem + PASSO;
    const id = await cria('cartoes', copiaDoCartao(c, ordem, perfil?.nome || 'Equipe', agoraIso()) as unknown as Record<string, unknown>);
    avisa('Cartão copiado');
    setAbertoId(id);
  }

  async function excluiCartao(c: Cartao) {
    await grava([{ tipo: 'apagar', colecao: 'cartoes', id: c.id }]);
    setAbertoId(null);
    avisa('Cartão excluído');
  }

  async function moveCartao(cartaoId: string, listaId: string, antesDoId: string | null) {
    const cartao = cartoes.find((c) => c.id === cartaoId);
    if (!cartao) return;
    const destino = listas.find((l) => l.id === listaId);
    if (!destino) return;
    const naLista = cartoesDaLista(cartoes, listaId).filter((c) => c.id !== cartaoId);
    const i = antesDoId ? naLista.findIndex((c) => c.id === antesDoId) : naLista.length;
    const corte = i < 0 ? naLista.length : i;
    const antes = naLista[corte - 1];
    const depois = naLista[corte];

    if (precisaRenumerar(antes, depois)) {
      /* os vizinhos encostaram: renumera a lista com folga e encaixa */
      const nova = [...naLista.slice(0, corte), cartao, ...naLista.slice(corte)];
      await lote(renumera(nova).map((x) => ({
        colecao: 'cartoes', id: x.id,
        campos: { ordem: x.ordem, ...(x.id === cartaoId ? { listaId, quadroId: destino.quadroId } : {}) },
      })));
    } else {
      await atualiza('cartoes', cartaoId, {
        listaId, quadroId: destino.quadroId, ordem: ordemEntre(antes, depois), atualizadoEm: agoraIso(),
      });
    }
    if (cartao.listaId !== listaId) {
      const origem = listas.find((l) => l.id === cartao.listaId);
      await atualiza('cartoes', cartaoId, {
        atividade: [...cartao.atividade, {
          id: novoId(), autorNome: perfil?.nome || 'Equipe',
          texto: `moveu de ${origem?.nome || '?'} para ${destino.nome}`, criadoEm: agoraIso(),
        }],
      });
      avisa(`Cartão movido para ${destino.nome}`);
    }
  }

  /* ---------- arrastar cartões ---------- */
  /* o espaco cinza que mostra onde o cartao vai cair. Nasce na primeira vez que
     alguem arrasta, nunca durante a renderizacao. */
  const marcador = useRef<HTMLDivElement | null>(null);
  const pegaMarcador = useCallback(() => {
    if (!marcador.current) {
      const el = document.createElement('div');
      el.className = 'kph';
      marcador.current = el;
    }
    return marcador.current;
  }, []);

  const limpaArrasto = useCallback(() => {
    marcador.current?.parentNode?.removeChild(marcador.current);
    if (arrastando.current) {
      document.querySelector(`.kc[data-id="${arrastando.current}"]`)?.classList.remove('arr');
    }
    arrastando.current = null;
  }, []);

  function aoArrastarSobre(e: DragEvent<HTMLElement>, listaId: string) {
    /* arrastando uma lista: marca de que lado da lista ela vai cair */
    if (arrastandoLista.current) {
      e.preventDefault();
      if (arrastandoLista.current === listaId) { if (alvoLista) setAlvoLista(null); return; }
      const r = e.currentTarget.getBoundingClientRect();
      const antes = e.clientX < r.left + r.width / 2;
      if (alvoLista?.id !== listaId || alvoLista.antes !== antes) setAlvoLista({ id: listaId, antes });
      return;
    }
    if (!arrastando.current) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const caixa = e.currentTarget.querySelector('.kl-cs');
    if (!caixa) return;
    const marca = pegaMarcador();
    const cards = Array.from(caixa.querySelectorAll('.kc:not(.arr)')) as HTMLElement[];
    let antes: HTMLElement | null = null;
    for (const k of cards) {
      const r = k.getBoundingClientRect();
      if (e.clientY < r.top + r.height / 2) { antes = k; break; }
    }
    if (marca.parentNode !== caixa || marca.nextElementSibling !== antes) {
      caixa.insertBefore(marca, antes);
    }
  }

  async function aoSoltar(e: DragEvent<HTMLElement>, listaId: string, i: number) {
    if (arrastandoLista.current) {
      e.preventDefault();
      const id = arrastandoLista.current;
      const alvo = alvoLista;
      arrastandoLista.current = null;
      setAlvoLista(null);
      if (!alvo || id === listaId) return;
      const antesDoId = alvo.antes ? listaId : minhasListas[i + 1]?.id ?? null;
      const mudancas = reordenaListas(minhasListas, id, antesDoId === id ? null : antesDoId);
      if (mudancas.length) await lote(mudancas.map((m) => ({ colecao: 'listas', id: m.id, campos: { ordem: m.ordem } })));
      return;
    }
    if (!arrastando.current) return;
    e.preventDefault();
    const id = arrastando.current;
    let proximo = marcador.current?.nextElementSibling as HTMLElement | null;
    while (proximo && (!proximo.classList.contains('kc') || proximo.classList.contains('arr'))) {
      proximo = proximo.nextElementSibling as HTMLElement | null;
    }
    const antesDoId = proximo?.dataset.id || null;
    limpaArrasto();
    await moveCartao(id, listaId, antesDoId);
  }

  /* ---------- rolar o quadro arrastando o fundo, como no Trello ---------- */
  /* clicar no fundo do quadro (fora das listas) e arrastar rola para os lados; no
     celular o dedo já rola sozinho, então só vale para mouse e caneta */
  function rolaArrastando(e: EventoDePonteiro<HTMLDivElement>) {
    if (e.button !== 0 || e.pointerType === 'touch' || e.target !== e.currentTarget) return;
    const el = e.currentTarget;
    const x0 = e.clientX;
    const s0 = el.scrollLeft;
    el.setPointerCapture(e.pointerId);
    el.classList.add('rolando');
    const move = (ev: PointerEvent) => { el.scrollLeft = s0 - (ev.clientX - x0); };
    const solta = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', solta);
      el.removeEventListener('pointercancel', solta);
      el.classList.remove('rolando');
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', solta);
    el.addEventListener('pointercancel', solta);
  }

  /* ---------- o cartão na lista ---------- */
  function cartaoNaLista(c: Cartao, arquivado = false) {
    const feitos = feitosDoChecklist(c);
    const estado = agora ? estadoDoPrazo(c, agora) : null;
    const lista = arquivado ? listas.find((l) => l.id === c.listaId) : null;
    return (
      <button key={c.id} className={`kc${estado === 'atrasado' ? ' kc-atrasado' : ''}${arquivado ? ' kc-arquivado' : ''}${c.capaCor ? ' kc-com-capa' : ''}`}
              data-id={c.id} draggable={!arquivado}
              onDragStart={arquivado ? undefined : (e) => {
                arrastando.current = c.id;
                e.dataTransfer.effectAllowed = 'move';
                try { e.dataTransfer.setData('text/plain', c.titulo); } catch { /* firefox exige */ }
                requestAnimationFrame(() => {
                  document.querySelector(`.kc[data-id="${c.id}"]`)?.classList.add('arr');
                });
              }}
              onDragEnd={arquivado ? undefined : limpaArrasto}
              onClick={() => setAbertoId(c.id)}>
        {c.capaCor && <span className={`kc-capa cp-${c.capaCor}`} aria-hidden="true" />}
        {arquivado && <span className="kc-arq-tag"><Ic n="doc" />Arquivado{lista ? ` · ${lista.nome}` : ''}</span>}
        {c.etiquetas.length > 0 && (
          <span className="kc-lb">
            {c.etiquetas.map((e) => <span key={e} className={`lbp lb-${corNoQuadro(e, etiquetas)}`}>{e}</span>)}
          </span>
        )}
        <span className="kc-t">{c.titulo}</span>
        <span className="kc-m">
          {c.urgencia && (
            <span className={`kc-urg ur-${c.urgencia}`} title={`Urgência: ${NOME_DA_URGENCIA[c.urgencia]}`}>
              {(c.urgencia === 'urgente' || c.urgencia === 'alta') && <Ic n="raio" />}{NOME_DA_URGENCIA[c.urgencia]}
            </span>
          )}
          {c.prazo && (
            <span className={`kc-prazo pz-${estado || 'normal'}`} title={estado ? TEXTO_DO_ESTADO[estado] : 'Prazo'}>
              <Ic n={estado === 'concluido' ? 'check' : 'relogio'} />
              {estado === 'atrasado' && <b>Atrasado</b>}
              <span className="num">{agora ? textoDoPrazo(c.prazo, agora) : ''}</span>
            </span>
          )}
          {c.descricao && <span title="Tem descrição"><Ic n="texto" /></span>}
          {c.checklist.length > 0 && (
            <span className={`num${feitos === c.checklist.length ? ' kc-tudo' : ''}`} title="Checklist"><Ic n="lista" />{feitos}/{c.checklist.length}</span>
          )}
          {c.comentarios.length > 0 && (
            <span className="num" title="Comentários"><Ic n="balao" />{c.comentarios.length}</span>
          )}
          {c.anexos.length > 0 && (
            <span className="num" title="Anexos"><Ic n="clipe" />{c.anexos.length}</span>
          )}
          {c.conversaId && <span title="Ligado a uma conversa"><Ic n="chat" /></span>}
          {c.membros.length > 0 && (
            <span className="mbs">
              {c.membros.map((m) => {
                const p = equipe.find((x) => x.id === m);
                return p ? <i key={m} className="mb" title={p.nome}>{iniciais(p.nome)}</i> : null;
              })}
            </span>
          )}
        </span>
      </button>
    );
  }

  /* ---------- tela ---------- */
  if (!quadros.length) {
    return (
      <div className="qd">
        <header className="vh"><h1>Quadros</h1></header>
        <div className="qd-vazio">
          <p>Nenhum quadro ainda. Os quadros são onde o time organiza o que precisa ser feito, e cada cartão pode ficar ligado à conversa do aluno.</p>
          <button className="btn p" onClick={() => void criaQuadro('Recepção')}>Criar o primeiro quadro</button>
        </div>
      </div>
    );
  }

  const estiloDoFundo: CSSProperties | undefined = fundo ? { background: fundo.css } : undefined;
  const arquivadosDoQuadro = quadro ? cartoes.filter((c) => c.quadroId === quadro.id && c.arquivado) : [];
  const termoArq = buscaArquivo.trim().toLowerCase();

  return (
    <div className={`qd${fundo ? ` qd-com-fundo ${fundo.escuro ? 'qd-escuro' : 'qd-claro'}${fundo.imagem ? ' qd-imagem' : ''}` : ''}`} style={estiloDoFundo}>
      <header className="vh qd-h">
        {renomeiaQuadro && quadro ? (
          <input className="cx qd-nome" autoFocus defaultValue={quadro.nome} maxLength={30} aria-label="Nome do quadro"
                 onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setRenomeiaQuadro(false); }}
                 onBlur={(e) => {
                   const n = e.target.value.trim();
                   if (n && n !== quadro.nome) void atualiza('quadros', quadro.id, { nome: n });
                   setRenomeiaQuadro(false);
                 }} />
        ) : <h1>Quadros</h1>}
        <div className="chips qd-abas" role="group" aria-label="Escolher quadro">
          {quadros.map((q) => (
            <button key={q.id} className="chip" aria-pressed={q.id === atualId}
                    onClick={() => { setAtualId(q.id); setPop(null); }}>{q.nome}</button>
          ))}
          {novoQuadro === null ? (
            <button className="tx-btn" onClick={() => setNovoQuadro('')}>Novo quadro</button>
          ) : (
            <form onSubmit={(e) => {
              e.preventDefault();
              const n = novoQuadro.trim();
              if (n) void criaQuadro(n);
              setNovoQuadro(null);
            }}>
              <input className="cx" autoFocus maxLength={30} value={novoQuadro} placeholder="Nome do quadro"
                     aria-label="Nome do novo quadro" onChange={(e) => setNovoQuadro(e.target.value)} />
              <button className="tx-btn" type="submit">Criar</button>
            </form>
          )}
        </div>
        <div className="fim qd-fim">
          <label className="qd-busca">
            <Ic n="busca" />
            <input type="search" value={filtros.busca} placeholder="Procurar cartões, até os arquivados" aria-label="Procurar cartões"
                   onChange={(e) => setFiltros({ ...filtros, busca: e.target.value })} />
          </label>
          {atrasados > 0 && (
            <button className="chip qd-atrasados" aria-pressed={filtros.soVencidos}
                    onClick={() => setFiltros({ ...filtros, soVencidos: !filtros.soVencidos })}>
              <Ic n="relogio" /><span className="num">{atrasados}</span> {atrasados === 1 ? 'atrasado' : 'atrasados'}
            </button>
          )}
          <button className="btn" aria-expanded={pop === 'filtro'}
                  onClick={() => setPop(pop === 'filtro' ? null : 'filtro')}>
            <Ic n="filtro" />Filtrar{nFiltros > 0 && <span className="q num">{nFiltros}</span>}
          </button>
          <button className="ib" title="Mais opções do quadro" aria-label="Mais opções do quadro"
                  aria-expanded={pop === 'menu'} onClick={() => setPop(pop === 'menu' ? null : 'menu')}>
            <Ic n="pontos" />
          </button>
        </div>
      </header>

      <div className="qd-tela" ref={tela} onPointerDown={rolaArrastando}>
        {/* na busca, os arquivados que batem vêm primeiro, para aparecer sem rolar */}
        {arquivadosAchados.length > 0 && (
          <section className="kl kl-arq" aria-label="Arquivados que batem com a busca">
            <header className="kl-h">
              <span className="kl-n">Arquivados que batem com a busca</span>
              <span className="q num">{arquivadosAchados.length}</span>
            </header>
            <div className="kl-cs">{arquivadosAchados.map((c) => cartaoNaLista(c, true))}</div>
            <p className="kvz">Abra o cartão para restaurar.</p>
          </section>
        )}

        {minhasListas.map((l, i) => {
          const todos = cartoesDaLista(cartoes, l.id);
          const mostrar = todos.filter((c) => passaNosFiltros(c, filtros, nomeDe, agora || undefined));
          const alvo = alvoLista?.id === l.id ? (alvoLista.antes ? ' kl-alvo-antes' : ' kl-alvo-depois') : '';
          return (
            <section key={l.id} className={`kl${alvo}`} aria-label={`Lista ${l.nome}`}
                     onDragOver={(e) => aoArrastarSobre(e, l.id)} onDrop={(e) => void aoSoltar(e, l.id, i)}>
              <header className="kl-h" draggable={renomeando !== l.id} title="Arraste para mudar a lista de lugar"
                      onDragStart={(e) => {
                        if (arrastando.current) return;
                        arrastandoLista.current = l.id;
                        e.dataTransfer.effectAllowed = 'move';
                        try { e.dataTransfer.setData('text/plain', l.nome); } catch { /* firefox exige */ }
                      }}
                      onDragEnd={() => { arrastandoLista.current = null; setAlvoLista(null); }}>
                {renomeando === l.id ? (
                  <input className="cx" autoFocus defaultValue={l.nome} maxLength={40} aria-label="Nome da lista"
                         onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                         onBlur={(e) => {
                           const n = e.target.value.trim();
                           if (n && n !== l.nome) void atualiza('listas', l.id, { nome: n });
                           setRenomeando(null);
                         }} />
                ) : (
                  <button className="kl-n" title="Renomear lista" onClick={() => setRenomeando(l.id)}>{l.nome}</button>
                )}
                <span className="q num">{mostrar.length === todos.length ? todos.length : `${mostrar.length} de ${todos.length}`}</span>
                <button className="ib" aria-label={`Opções da lista ${l.nome}`} aria-expanded={pop === `l-${l.id}`}
                        onClick={() => setPop(pop === `l-${l.id}` ? null : `l-${l.id}`)}>
                  <Ic n="pontos" />
                </button>
              </header>

              {pop === `l-${l.id}` && (
                <div className="pop">
                  <button onClick={() => { setRenomeando(l.id); setPop(null); }}>Renomear</button>
                  <button disabled={i === 0} onClick={() => {
                    const outra = minhasListas[i - 1];
                    void lote([
                      { colecao: 'listas', id: l.id, campos: { ordem: outra.ordem } },
                      { colecao: 'listas', id: outra.id, campos: { ordem: l.ordem } },
                    ]); setPop(null);
                  }}>Mover para a esquerda</button>
                  <button disabled={i === minhasListas.length - 1} onClick={() => {
                    const outra = minhasListas[i + 1];
                    void lote([
                      { colecao: 'listas', id: l.id, campos: { ordem: outra.ordem } },
                      { colecao: 'listas', id: outra.id, campos: { ordem: l.ordem } },
                    ]); setPop(null);
                  }}>Mover para a direita</button>
                  <button disabled={!todos.length} onClick={() => {
                    void lote(todos.map((c) => ({ colecao: 'cartoes', id: c.id, campos: { arquivado: true, atualizadoEm: agoraIso() } })));
                    setPop(null);
                    avisa(`${todos.length} ${todos.length === 1 ? 'cartão arquivado' : 'cartões arquivados'}. A busca ainda acha.`);
                  }}>Arquivar todos os cartões<small>somem da lista, a busca ainda acha</small></button>
                  <button onClick={() => {
                    void atualiza('listas', l.id, { arquivada: true });
                    setPop(null);
                    avisa('Lista arquivada. Ela fica em Itens arquivados.');
                  }}>Arquivar lista<small>dá para restaurar depois</small></button>
                </div>
              )}

              <div className="kl-cs">
                {mostrar.map((c) => cartaoNaLista(c))}
                {!mostrar.length && todos.length > 0 && <p className="kvz">Nenhum cartão passa no filtro.</p>}
              </div>

              <footer className="kl-f">
                {addEm === l.id ? (
                  <form className="kl-form" onSubmit={(e: FormEvent) => {
                    e.preventDefault();
                    const t = addTexto.trim();
                    if (!t) return;
                    void criaCartao(l.id, t);
                    setAddTexto('');
                  }}>
                    <input className="cx" autoFocus value={addTexto} placeholder="Título do cartão"
                           autoComplete="off" aria-label="Título do novo cartão"
                           onChange={(e) => setAddTexto(e.target.value)}
                           onKeyDown={(e) => { if (e.key === 'Escape') { setAddEm(null); setAddTexto(''); } }} />
                    <div className="ops">
                      <button className="btn p" type="submit">Adicionar</button>
                      <button className="ib" type="button" aria-label="Cancelar"
                              onClick={() => { setAddEm(null); setAddTexto(''); }}><Ic n="x" /></button>
                    </div>
                  </form>
                ) : (
                  <button className="kl-add" onClick={() => { setAddEm(l.id); setAddTexto(''); }}>
                    <Ic n="mais" />Adicionar cartão
                  </button>
                )}
              </footer>
            </section>
          );
        })}

        <section className="kl nova">
          <footer className="kl-f">
            {addLista ? (
              <form className="kl-form" onSubmit={(e) => {
                e.preventDefault();
                const n = novaLista.trim();
                if (!n || !atualId) return;
                void cria('listas', {
                  quadroId: atualId, nome: n,
                  ordem: (minhasListas[minhasListas.length - 1]?.ordem || 0) + PASSO, arquivada: false,
                });
                setNovaLista('');
                requestAnimationFrame(() => { if (tela.current) tela.current.scrollLeft = tela.current.scrollWidth; });
              }}>
                <input className="cx" autoFocus value={novaLista} placeholder="Nome da lista" maxLength={40}
                       autoComplete="off" aria-label="Nome da nova lista"
                       onChange={(e) => setNovaLista(e.target.value)}
                       onKeyDown={(e) => { if (e.key === 'Escape') { setAddLista(false); setNovaLista(''); } }} />
                <div className="ops">
                  <button className="btn p" type="submit">Adicionar</button>
                  <button className="ib" type="button" aria-label="Cancelar"
                          onClick={() => { setAddLista(false); setNovaLista(''); }}><Ic n="x" /></button>
                </div>
              </form>
            ) : (
              <button className="kl-add" onClick={() => setAddLista(true)}><Ic n="mais" />Adicionar lista</button>
            )}
          </footer>
        </section>
      </div>

      {pop === 'filtro' && (
        <div className="fp" role="dialog" aria-label="Filtrar cartões">
          <h3 style={{ marginTop: 0 }}>Etiquetas</h3>
          <div className="tags">
            {etiquetas.map((e) => (
              <button key={e.nome} className={filtros.etiquetas.includes(e.nome) ? `lbt lb-${e.cor}` : 'lbt'} aria-pressed={filtros.etiquetas.includes(e.nome)}
                      onClick={() => setFiltros({
                        ...filtros,
                        etiquetas: filtros.etiquetas.includes(e.nome)
                          ? filtros.etiquetas.filter((x) => x !== e.nome) : [...filtros.etiquetas, e.nome],
                      })}>{e.nome}</button>
            ))}
          </div>
          <h3>Urgência</h3>
          <div className="tags">
            {URGENCIAS.map((u) => (
              <button key={u.k} className="tag" aria-pressed={filtros.urgencias.includes(u.k)}
                      onClick={() => setFiltros({
                        ...filtros,
                        urgencias: filtros.urgencias.includes(u.k) ? filtros.urgencias.filter((x) => x !== u.k) : [...filtros.urgencias, u.k],
                      })}>{u.nome}</button>
            ))}
          </div>
          <h3>Pessoas</h3>
          <div className="tags">
            {equipe.map((p) => (
              <button key={p.id} className="tag" aria-pressed={filtros.membros.includes(p.id)}
                      onClick={() => setFiltros({
                        ...filtros,
                        membros: filtros.membros.includes(p.id)
                          ? filtros.membros.filter((x) => x !== p.id) : [...filtros.membros, p.id],
                      })}>{p.nome}</button>
            ))}
            <button className="tag" aria-pressed={filtros.semMembro}
                    onClick={() => setFiltros({ ...filtros, semMembro: !filtros.semMembro })}>Sem ninguém</button>
          </div>
          <h3>Prazo</h3>
          <div className="tags">
            <button className="tag" aria-pressed={filtros.soVencidos}
                    onClick={() => setFiltros({ ...filtros, soVencidos: !filtros.soVencidos })}>
              Só os atrasados
            </button>
          </div>
          <div className="rodape-f">
            <button className="tx-btn" disabled={!nFiltros} onClick={() => setFiltros({ ...filtrosVazios(), busca: filtros.busca })}>
              Limpar filtros
            </button>
            <button className="tx-btn" onClick={() => setPop(null)}>Fechar</button>
          </div>
        </div>
      )}

      {pop === 'menu' && (
        <div className="pop topo">
          <button onClick={() => setPop('fundo')}>Mudar o plano de fundo</button>
          <button onClick={() => setPop('etiquetas')}>Etiquetas do quadro</button>
          <button onClick={() => { setPop('arquivados'); setBuscaArquivo(''); }}>Itens arquivados</button>
          <button onClick={() => { setRenomeiaQuadro(true); setPop(null); }}>Renomear o quadro</button>
        </div>
      )}

      {pop === 'fundo' && quadro && <PainelDoFundo quadro={quadro} aoFechar={() => setPop(null)} />}
      {pop === 'etiquetas' && quadro && <PainelDeEtiquetas quadro={quadro} cartoes={cartoes} aoFechar={() => setPop(null)} />}

      {pop === 'arquivados' && quadro && (
        <div className="fp qd-painel" role="dialog" aria-label="Itens arquivados">
          <div className="qd-painel-cab"><b>Arquivados em {quadro.nome}</b><button className="ib" aria-label="Fechar" onClick={() => setPop(null)}><Ic n="x" /></button></div>
          <input className="cx" type="search" placeholder="Procurar nos arquivados" value={buscaArquivo} aria-label="Procurar nos arquivados"
                 onChange={(e) => setBuscaArquivo(e.target.value)} />
          {listas.filter((l) => l.quadroId === quadro.id && l.arquivada && (!termoArq || l.nome.toLowerCase().includes(termoArq))).map((l) => (
            <div key={l.id} className="arq">
              <span>{l.nome}<small>lista</small></span>
              <button className="tx-btn" onClick={() => void atualiza('listas', l.id, { arquivada: false })}>
                Restaurar
              </button>
            </div>
          ))}
          {arquivadosDoQuadro.filter((c) => !termoArq || c.titulo.toLowerCase().includes(termoArq)).map((c) => (
            <div key={c.id} className="arq">
              <button className="arq-abre" onClick={() => setAbertoId(c.id)}>{c.titulo}<small>cartão · {listas.find((l) => l.id === c.listaId)?.nome || 'lista arquivada'}</small></button>
              <button className="tx-btn" onClick={() => void atualiza('cartoes', c.id, { arquivado: false, atualizadoEm: agoraIso() })}>
                Restaurar
              </button>
            </div>
          ))}
          {!listas.some((l) => l.quadroId === quadro.id && l.arquivada) && !arquivadosDoQuadro.length
            && <p className="obs">Nada arquivado neste quadro.</p>}
        </div>
      )}

      {aberto && (
        <CartaoAberto key={aberto.id} cartao={aberto}
                      conversa={conversas.find((c) => c.id === aberto.conversaId)}
                      listas={listas} quadros={quadros} equipe={equipe}
                      etiquetas={etiquetasDoAberto as Etiqueta[]} agora={agora}
                      aoCriarEtiqueta={(nome, cor) => criaEtiquetaNoQuadro(aberto.quadroId, nome, cor)}
                      aoCopiar={() => void copiaCartao(aberto)} aoExcluir={() => void excluiCartao(aberto)}
                      fechar={() => setAbertoId(null)}
                      irParaConversa={(id) => router.push(`/conversas?conversa=${id}`)} />
      )}
    </div>
  );
}
