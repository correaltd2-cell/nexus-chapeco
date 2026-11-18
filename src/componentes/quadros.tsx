'use client';
/* Os quadros. Mesmo arranjo do Trello, porque é o que o time ja sabe usar:
   quadro, listas, cartoes que se arrastam, etiqueta, pessoa, prazo, checklist,
   comentario, anexo, filtro e arquivo. O que ele nao tem é a ligacao com a conversa
   do aluno, que é o motivo de existir aqui dentro. */
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { assina, atualiza, cria, lote } from '@/lib/dados/fonte';
import { Ic } from '@/componentes/icones';
import { avisa } from '@/componentes/aviso';
import { useSessao } from '@/componentes/sessao';
import CartaoAberto from '@/componentes/cartao-aberto';
import {
  ETIQUETAS_PADRAO, LISTAS_PADRAO, PASSO, cartoesDaLista, feitosDoChecklist, filtrosVazios,
  listasVisiveis, ordemEntre, passaNosFiltros, precisaRenumerar, quantosFiltros, renumera, vencido,
} from '@/lib/dominio/quadros';
import { dataBR, iniciais } from '@/lib/dominio/formato';
import type { Cartao, Lista, Perfil, Quadro } from '@/lib/dominio/tipos';

const agora = () => new Date().toISOString();

export default function Quadros() {
  const { perfil } = useSessao();
  const router = useRouter();
  const [quadros, setQuadros] = useState<Quadro[]>([]);
  const [listas, setListas] = useState<Lista[]>([]);
  const [cartoes, setCartoes] = useState<Cartao[]>([]);
  const [equipe, setEquipe] = useState<Perfil[]>([]);
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
  const arrastando = useRef<string | null>(null);
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

  const quadro = quadros.find((q) => q.id === atualId) || null;
  const minhasListas = useMemo(
    () => listasVisiveis(listas.filter((l) => l.quadroId === atualId)),
    [listas, atualId],
  );
  const aberto = cartoes.find((c) => c.id === abertoId) || null;
  const nFiltros = quantosFiltros(filtros);

  /* ---------- escrever ---------- */
  async function criaQuadro(nome: string) {
    const id = await cria('quadros', {
      nome, ordem: (quadros.length + 1) * PASSO, arquivado: false, criadoEm: agora(),
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
      atividade: [{ id: 'n0', autorNome: perfil?.nome || 'Equipe', texto: 'criou o cartão', criadoEm: agora() }],
      anexos: [], arquivado: false, criadoEm: agora(), atualizadoEm: agora(),
    });
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
        listaId, quadroId: destino.quadroId, ordem: ordemEntre(antes, depois), atualizadoEm: agora(),
      });
    }
    if (cartao.listaId !== listaId) {
      const origem = listas.find((l) => l.id === cartao.listaId);
      await atualiza('cartoes', cartaoId, {
        atividade: [...cartao.atividade, {
          id: Math.random().toString(36).slice(2, 11), autorNome: perfil?.nome || 'Equipe',
          texto: `moveu de ${origem?.nome || '?'} para ${destino.nome}`, criadoEm: agora(),
        }],
      });
      avisa(`Cartão movido para ${destino.nome}`);
    }
  }

  /* ---------- arrastar ---------- */
  const marcador = useRef<HTMLDivElement | null>(null);
  if (typeof document !== 'undefined' && !marcador.current) {
    marcador.current = document.createElement('div');
    marcador.current.className = 'kph';
  }

  const limpaArrasto = useCallback(() => {
    marcador.current?.parentNode?.removeChild(marcador.current);
    if (arrastando.current) {
      document.querySelector(`.kc[data-id="${arrastando.current}"]`)?.classList.remove('arr');
    }
    arrastando.current = null;
  }, []);

  function aoArrastarSobre(e: DragEvent<HTMLElement>, listaId: string) {
    if (!arrastando.current) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const caixa = e.currentTarget.querySelector('.kl-cs');
    if (!caixa || !marcador.current) return;
    const cards = Array.from(caixa.querySelectorAll('.kc:not(.arr)')) as HTMLElement[];
    let antes: HTMLElement | null = null;
    for (const k of cards) {
      const r = k.getBoundingClientRect();
      if (e.clientY < r.top + r.height / 2) { antes = k; break; }
    }
    if (marcador.current.parentNode !== caixa || marcador.current.nextElementSibling !== antes) {
      caixa.insertBefore(marcador.current, antes);
    }
    void listaId;
  }

  async function aoSoltar(e: DragEvent<HTMLElement>, listaId: string) {
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

  return (
    <div className="qd">
      <header className="vh">
        <h1>Quadros</h1>
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
        <div className="fim">
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

      <div className="qd-tela" ref={tela}>
        {minhasListas.map((l, i) => {
          const todos = cartoesDaLista(cartoes, l.id);
          const mostrar = todos.filter((c) => passaNosFiltros(c, filtros));
          return (
            <section key={l.id} className="kl" aria-label={`Lista ${l.nome}`}
                     onDragOver={(e) => aoArrastarSobre(e, l.id)} onDrop={(e) => void aoSoltar(e, l.id)}>
              <header className="kl-h">
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
                  <button onClick={() => {
                    void atualiza('listas', l.id, { arquivada: true });
                    setPop(null);
                    avisa('Lista arquivada. Ela fica em Itens arquivados.');
                  }}>Arquivar lista<small>dá para restaurar depois</small></button>
                </div>
              )}

              <div className="kl-cs">
                {mostrar.map((c) => {
                  const feitos = feitosDoChecklist(c);
                  return (
                    <button key={c.id} className="kc" data-id={c.id} draggable
                            onDragStart={(e) => {
                              arrastando.current = c.id;
                              e.dataTransfer.effectAllowed = 'move';
                              try { e.dataTransfer.setData('text/plain', c.titulo); } catch { /* firefox exige */ }
                              requestAnimationFrame(() => {
                                document.querySelector(`.kc[data-id="${c.id}"]`)?.classList.add('arr');
                              });
                            }}
                            onDragEnd={limpaArrasto}
                            onClick={() => setAbertoId(c.id)}>
                      {c.etiquetas.length > 0 && (
                        <span className="kc-lb">
                          {c.etiquetas.map((e) => {
                            const cor = ETIQUETAS_PADRAO.find((x) => x.nome === e)?.cor || 'az';
                            return <span key={e} className={`lbp lb-${cor}`}>{e}</span>;
                          })}
                        </span>
                      )}
                      <span className="kc-t">{c.titulo}</span>
                      <span className="kc-m">
                        {c.prazo && (
                          <span className={c.prazoConcluido ? 'num ok' : vencido(c) ? 'num atr' : 'num'}
                                title={c.prazoConcluido ? 'Concluído' : vencido(c) ? 'Prazo vencido' : 'Prazo'}>
                            <Ic n={c.prazoConcluido ? 'check' : 'relogio'} />{dataBR(c.prazo)}
                          </span>
                        )}
                        {c.descricao && <span title="Tem descrição"><Ic n="texto" /></span>}
                        {c.checklist.length > 0 && (
                          <span className="num" title="Checklist"><Ic n="lista" />{feitos}/{c.checklist.length}</span>
                        )}
                        {c.comentarios.length > 0 && (
                          <span className="num" title="Comentários"><Ic n="balao" />{c.comentarios.length}</span>
                        )}
                        {c.anexos.length > 0 && (
                          <span className="num" title="Anexos"><Ic n="doc" />{c.anexos.length}</span>
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
                })}
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
          <input className="cx" type="search" placeholder="Buscar cartão pelo título ou descrição"
                 autoComplete="off" aria-label="Buscar cartão" value={filtros.busca}
                 onChange={(e) => setFiltros({ ...filtros, busca: e.target.value })} />
          <h3>Etiquetas</h3>
          <div className="tags">
            {ETIQUETAS_PADRAO.map((e) => (
              <button key={e.nome} className="tag" aria-pressed={filtros.etiquetas.includes(e.nome)}
                      onClick={() => setFiltros({
                        ...filtros,
                        etiquetas: filtros.etiquetas.includes(e.nome)
                          ? filtros.etiquetas.filter((x) => x !== e.nome) : [...filtros.etiquetas, e.nome],
                      })}>{e.nome}</button>
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
              Só com prazo vencido
            </button>
          </div>
          <div className="rodape-f">
            <button className="tx-btn" disabled={!nFiltros} onClick={() => setFiltros(filtrosVazios())}>
              Limpar filtros
            </button>
            <button className="tx-btn" onClick={() => setPop(null)}>Fechar</button>
          </div>
        </div>
      )}

      {pop === 'menu' && (
        <div className="pop topo">
          <button onClick={() => setPop('arquivados')}>Itens arquivados</button>
        </div>
      )}

      {pop === 'arquivados' && quadro && (
        <div className="fp" role="dialog" aria-label="Itens arquivados">
          <h3 style={{ marginTop: 0 }}>Arquivados em {quadro.nome}</h3>
          {listas.filter((l) => l.quadroId === quadro.id && l.arquivada).map((l) => (
            <div key={l.id} className="arq">
              <span>{l.nome}<small>lista</small></span>
              <button className="tx-btn" onClick={() => void atualiza('listas', l.id, { arquivada: false })}>
                Restaurar
              </button>
            </div>
          ))}
          {cartoes.filter((c) => c.quadroId === quadro.id && c.arquivado).map((c) => (
            <div key={c.id} className="arq">
              <span>{c.titulo}<small>cartão</small></span>
              <button className="tx-btn" onClick={() => void atualiza('cartoes', c.id, { arquivado: false })}>
                Restaurar
              </button>
            </div>
          ))}
          {!listas.some((l) => l.quadroId === quadro.id && l.arquivada)
            && !cartoes.some((c) => c.quadroId === quadro.id && c.arquivado)
            && <p className="obs">Nada arquivado neste quadro.</p>}
          <div className="rodape-f"><span /><button className="tx-btn" onClick={() => setPop(null)}>Fechar</button></div>
        </div>
      )}

      {aberto && (
        <CartaoAberto cartao={aberto} listas={listas} quadros={quadros} equipe={equipe}
                      etiquetas={ETIQUETAS_PADRAO} fechar={() => setAbertoId(null)}
                      irParaConversa={(id) => router.push(`/conversas?conversa=${id}`)} />
      )}
    </div>
  );
}
