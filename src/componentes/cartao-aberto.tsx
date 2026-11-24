'use client';
/* O cartao aberto. Tudo que o Trello tem de util: descricao, etiquetas do quadro (e
   criar etiqueta por nome aqui mesmo), pessoas, urgencia, prazo com data e hora, capa,
   checklist, comentarios, anexos, mover de lista, copiar e arquivar. Arquivado mostra a
   faixa de arquivado, restaura ou exclui de vez. */
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { getDownloadURL, ref as refArquivo, uploadBytes } from 'firebase/storage';
import { arquivos } from '@/lib/firebase/cliente';
import { APAGAR, atualiza, modoDemo } from '@/lib/dados/fonte';
import { Ic } from '@/componentes/icones';
import { avisa } from '@/componentes/aviso';
import { useSessao } from '@/componentes/sessao';
import {
  CAPAS, URGENCIAS, estadoDoPrazo, feitosDoChecklist, juntaPrazo, novoId, partesDoPrazo, textoDoPrazo, type Urgencia,
} from '@/lib/dominio/quadros';
import { NovaEtiqueta } from '@/componentes/quadro-paineis';
import { situacao } from '@/lib/dominio/conversas';
import { dataBR, iniciais } from '@/lib/dominio/formato';
import type { Cartao, Conversa, Etiqueta, Lista, Perfil, Quadro } from '@/lib/dominio/tipos';

interface Props {
  cartao: Cartao;
  conversa?: Conversa;
  listas: Lista[];
  quadros: Quadro[];
  equipe: Perfil[];
  etiquetas: Etiqueta[];
  agora: Date | null;
  aoCriarEtiqueta: (nome: string, cor: string) => Promise<string | null>;
  aoCopiar: () => void;
  aoExcluir: () => void;
  fechar: () => void;
  irParaConversa: (conversaId: string) => void;
}

const TEXTO_DO_ESTADO = { atrasado: 'Atrasado', breve: 'Vence em breve', concluido: 'Concluído', normal: 'No prazo' } as const;

export default function CartaoAberto({
  cartao, conversa, listas, quadros, equipe, etiquetas, agora, aoCriarEtiqueta, aoCopiar, aoExcluir, fechar, irParaConversa,
}: Props) {
  const { perfil } = useSessao();
  const [titulo, setTitulo] = useState(cartao.titulo);
  const [descricao, setDescricao] = useState(cartao.descricao);
  const [novoItem, setNovoItem] = useState('');
  const [comentario, setComentario] = useState('');
  const [subindo, setSubindo] = useState(false);
  const [criandoEtiqueta, setCriandoEtiqueta] = useState(false);
  const [excluindo, setExcluindo] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);
  const entrada = useRef<HTMLInputElement>(null);
  const entradaArquivo = useRef<HTMLInputElement>(null);

  const lista = listas.find((l) => l.id === cartao.listaId);
  const quadro = quadros.find((q) => q.id === cartao.quadroId);
  const feitos = feitosDoChecklist(cartao);
  const pct = cartao.checklist.length ? Math.round((feitos / cartao.checklist.length) * 100) : 0;
  const prazo = partesDoPrazo(cartao.prazo);
  const estado = agora ? estadoDoPrazo(cartao, agora) : null;
  /* etiqueta que o cartão tem e o quadro não (veio da triagem, ou foi apagada do quadro) aparece também */
  const todasEtiquetas = [...etiquetas, ...cartao.etiquetas.filter((n) => !etiquetas.some((e) => e.nome === n)).map((n) => ({ nome: n, cor: 'cz' }))];

  function mudaPrazo(data: string, hora: string) {
    const novo = juntaPrazo(data, hora);
    if (!novo) { void salva({ prazo: APAGAR, prazoConcluido: false }, 'tirou o prazo'); return; }
    if (novo === cartao.prazo) return;
    void salva({ prazo: novo, prazoConcluido: false }, `marcou o prazo para ${textoDoPrazo(novo, agora || new Date(novo))}`);
  }

  async function criaEtiquetaAqui(nome: string, cor: string) {
    const erro = await aoCriarEtiqueta(nome, cor);
    if (erro) return erro;
    const n = nome.replace(/\s+/g, ' ').trim().slice(0, 30);
    await salva({ etiquetas: [...cartao.etiquetas, n] });
    setCriandoEtiqueta(false);
    return null;
  }

  useEffect(() => { caixa.current?.focus(); }, []);

  useEffect(() => {
    const ouve = (e: KeyboardEvent) => { if (e.key === 'Escape') fechar(); };
    document.addEventListener('keydown', ouve);
    return () => document.removeEventListener('keydown', ouve);
  }, [fechar]);

  const anota = (texto: string) => ({
    id: novoId(), autorNome: perfil?.nome || 'Equipe', texto, criadoEm: new Date().toISOString(),
  });

  const salva = (campos: Record<string, unknown>, atividade?: string) =>
    atualiza('cartoes', cartao.id, {
      ...campos,
      atualizadoEm: new Date().toISOString(),
      ...(atividade ? { atividade: [...cartao.atividade, anota(atividade)] } : {}),
    });

  function alternaEtiqueta(nome: string) {
    const tem = cartao.etiquetas.includes(nome);
    void salva({ etiquetas: tem ? cartao.etiquetas.filter((e) => e !== nome) : [...cartao.etiquetas, nome] });
  }

  function alternaMembro(uid: string) {
    const tem = cartao.membros.includes(uid);
    const pessoa = equipe.find((p) => p.id === uid);
    void salva(
      { membros: tem ? cartao.membros.filter((m) => m !== uid) : [...cartao.membros, uid] },
      tem ? undefined : `colocou ${pessoa?.nome || 'alguém'} no cartão`,
    );
    if (!tem && pessoa?.avisaNoWhats && pessoa.telefone && pessoa.id !== perfil?.id) {
      avisa(`${pessoa.nome} recebe o aviso deste cartão no WhatsApp`);
    }
  }

  function addItem(e: FormEvent) {
    e.preventDefault();
    const t = novoItem.trim();
    if (!t) return;
    void salva({ checklist: [...cartao.checklist, { id: novoId(), texto: t, feito: false }] });
    setNovoItem('');
    entrada.current?.focus();
  }

  function comenta(e: FormEvent) {
    e.preventDefault();
    const t = comentario.trim();
    if (!t) return;
    void atualiza('cartoes', cartao.id, {
      comentarios: [...cartao.comentarios, {
        id: novoId(), autorId: perfil?.id || '', autorNome: perfil?.nome || 'Equipe',
        texto: t, criadoEm: new Date().toISOString(),
      }],
      atualizadoEm: new Date().toISOString(),
    });
    setComentario('');
  }

  async function anexa(arquivo: File) {
    if (modoDemo) { avisa('Na demonstração não dá para subir arquivo: falta o Storage do Firebase.'); return; }
    if (arquivo.size > 20 * 1024 * 1024) { avisa('O arquivo passa de 20 MB. Mande um menor.'); return; }
    setSubindo(true);
    try {
      const caminho = `cartoes/${cartao.id}/${novoId()}-${arquivo.name}`;
      await uploadBytes(refArquivo(arquivos(), caminho), arquivo);
      await salva({
        anexos: [...cartao.anexos, {
          id: novoId(), nome: arquivo.name, path: caminho, mime: arquivo.type || 'application/octet-stream',
          tamanho: arquivo.size, criadoEm: new Date().toISOString(),
        }],
      }, `anexou ${arquivo.name}`);
    } catch {
      avisa('Não consegui subir o arquivo. Tente de novo.');
    } finally {
      setSubindo(false);
    }
  }

  async function abreAnexo(path: string) {
    if (modoDemo) { avisa('Na demonstração o anexo é só um exemplo.'); return; }
    try { window.open(await getDownloadURL(refArquivo(arquivos(), path)), '_blank', 'noopener'); }
    catch { avisa('Não consegui abrir o anexo.'); }
  }

  const linhas = [
    ...cartao.comentarios.map((c) => ({ ...c, comentario: true })),
    ...cartao.atividade.map((a) => ({ ...a, autorId: '', comentario: false })),
  ].sort((a, b) => b.criadoEm.localeCompare(a.criadoEm));

  return (
    <div className="mod" onMouseDown={(e) => { if (e.target === e.currentTarget) fechar(); }}>
      <div className="mod-c" role="dialog" aria-modal="true" aria-label={`Cartão: ${cartao.titulo}`}
           tabIndex={-1} ref={caixa}>
        {cartao.capaCor && <div className={`mod-capa cp-${cartao.capaCor}`} aria-hidden="true" />}
        {cartao.arquivado && (
          <div className="mod-arq" role="status">
            <Ic n="doc" /><span>Este cartão está arquivado: não aparece no quadro, só na busca.</span>
            <button className="btn" onClick={() => void salva({ arquivado: false }, 'restaurou o cartão')}>Restaurar</button>
            {!excluindo
              ? <button className="btn perigo-claro" onClick={() => setExcluindo(true)}>Excluir de vez</button>
              : (
                <span className="mod-arq-conf">
                  Excluir de vez? Não dá para desfazer.
                  <button className="btn perigo" onClick={aoExcluir}>Excluir</button>
                  <button className="tx-btn" onClick={() => setExcluindo(false)}>Cancelar</button>
                </span>
              )}
          </div>
        )}
        <header className="mod-h">
          <input value={titulo} maxLength={120} aria-label="Título do cartão"
                 onChange={(e) => setTitulo(e.target.value)}
                 onBlur={() => { const t = titulo.trim(); if (t && t !== cartao.titulo) void salva({ titulo: t }); }} />
          <button className="ib" aria-label="Fechar cartão" onClick={fechar}><Ic n="x" /></button>
          <p>Na lista {lista?.nome || '?'}, quadro {quadro?.nome || '?'}</p>
        </header>

        <div className="mod-b">
          <div>
            {cartao.conversaId && (
              <section className="ms">
                <h3>Conversa no WhatsApp</h3>
                <div className="mc">
                  <span className="av s" aria-hidden="true">{iniciais(conversa?.nome || '?')}</span>
                  <span className="mc-t"><b>{conversa?.nome || 'Conversa ligada a este cartão'}</b>
                    <small>{conversa
                      ? `${situacao(conversa)}${conversa.naoLidas ? `, ${conversa.naoLidas} nova${conversa.naoLidas > 1 ? 's' : ''}` : ''}`
                      : 'abrir leva direto para o atendimento'}</small></span>
                  <button className="btn p" onClick={() => irParaConversa(cartao.conversaId as string)}>
                    Abrir conversa
                  </button>
                </div>
                <div className="lnk">
                  <button className="tx-btn" onClick={() => void salva({ conversaId: APAGAR }, 'desligou o cartão da conversa')}>
                    Desligar da conversa
                  </button>
                </div>
              </section>
            )}

            <section className="ms">
              <h3>Descrição</h3>
              <textarea className="cx ms-descricao" rows={7} value={descricao} aria-label="Descrição"
                        placeholder="Escreva os detalhes deste cartão"
                        onChange={(e) => setDescricao(e.target.value)}
                        onBlur={() => { if (descricao !== cartao.descricao) void salva({ descricao }); }} />
            </section>

            <section className="ms">
              <h3>Checklist{cartao.checklist.length > 0 && <span className="num">{feitos} de {cartao.checklist.length}</span>}</h3>
              {cartao.checklist.length > 0 && (
                <div className="pg" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}
                     aria-label="Andamento do checklist"><i style={{ width: `${pct}%` }} /></div>
              )}
              {cartao.checklist.map((item) => (
                <label key={item.id} className={item.feito ? 'ci ok' : 'ci'}>
                  <input type="checkbox" checked={item.feito}
                         onChange={() => void salva({
                           checklist: cartao.checklist.map((i) => (i.id === item.id ? { ...i, feito: !i.feito } : i)),
                         })} />
                  <span>{item.texto}</span>
                  <button type="button" className="ib" aria-label={`Remover ${item.texto}`}
                          onClick={() => void salva({ checklist: cartao.checklist.filter((i) => i.id !== item.id) })}>
                    <Ic n="x" />
                  </button>
                </label>
              ))}
              <form className="ln" onSubmit={addItem}>
                <input className="cx" ref={entrada} value={novoItem} placeholder="Adicionar item"
                       autoComplete="off" aria-label="Novo item do checklist"
                       onChange={(e) => setNovoItem(e.target.value)} />
                <button className="tx-btn" type="submit">Adicionar</button>
              </form>
            </section>

            <section className="ms">
              <h3>Anexos</h3>
              {cartao.anexos.map((a) => (
                <div key={a.id} className="mc">
                  <Ic n="doc" />
                  <span className="mc-t"><b>{a.nome}</b>
                    <small>{Math.max(1, Math.round(a.tamanho / 1024))} KB</small></span>
                  <button className="tx-btn" onClick={() => void abreAnexo(a.path)}>Abrir</button>
                  <button className="tx-btn" onClick={() => void salva({ anexos: cartao.anexos.filter((x) => x.id !== a.id) })}>
                    Remover
                  </button>
                </div>
              ))}
              <div className="ln">
                <button className="btn" type="button" disabled={subindo}
                        onClick={() => entradaArquivo.current?.click()}>
                  <Ic n="mais" />{subindo ? 'Subindo o arquivo...' : 'Anexar arquivo'}
                </button>
                <input ref={entradaArquivo} type="file" hidden aria-hidden="true" tabIndex={-1}
                       onChange={(e) => { const f = e.target.files?.[0]; if (f) void anexa(f); e.target.value = ''; }} />
              </div>
            </section>

            <section className="ms">
              <h3>Comentários e atividade</h3>
              <form className="ln" style={{ marginTop: 0 }} onSubmit={comenta}>
                <input className="cx" value={comentario} autoComplete="off" aria-label="Novo comentário"
                       placeholder="Escrever um comentário para a equipe"
                       onChange={(e) => setComentario(e.target.value)} />
                <button className="tx-btn" type="submit">Comentar</button>
              </form>
              {linhas.length > 0 && (
                <ul className="atv">
                  {linhas.map((l) => (
                    <li key={l.id} className={l.comentario ? 'cm' : undefined}>
                      <b>{l.autorNome}</b>{l.comentario ? <><small className="num">{dataBR(l.criadoEm)}</small><br /></> : ' '}
                      {l.texto}
                      {!l.comentario && <small className="num">{dataBR(l.criadoEm)}</small>}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <div>
            <section className="ms">
              <h3>Etiquetas</h3>
              <div className="tags">
                {todasEtiquetas.map((e) => {
                  const on = cartao.etiquetas.includes(e.nome);
                  return (
                    <button key={e.nome} className={on ? `lbt lb-${e.cor}` : 'lbt'} aria-pressed={on}
                            onClick={() => alternaEtiqueta(e.nome)}>{e.nome}</button>
                  );
                })}
              </div>
              {criandoEtiqueta
                ? <NovaEtiqueta aoCriar={criaEtiquetaAqui} aoCancelar={() => setCriandoEtiqueta(false)} />
                : <button className="tx-btn ms-mais" onClick={() => setCriandoEtiqueta(true)}><Ic n="mais" />Criar etiqueta</button>}
            </section>

            <section className="ms">
              <h3>Urgência</h3>
              <div className="ms-urg" role="radiogroup" aria-label="Urgência do cartão">
                <button role="radio" aria-checked={!cartao.urgencia} className="ur-nada"
                        onClick={() => { if (cartao.urgencia) void salva({ urgencia: APAGAR }, 'tirou a urgência'); }}>Nenhuma</button>
                {URGENCIAS.slice().reverse().map((u) => (
                  <button key={u.k} role="radio" aria-checked={cartao.urgencia === u.k} className={`ur-${u.k}`}
                          onClick={() => { if (cartao.urgencia !== u.k) void salva({ urgencia: u.k as Urgencia }, `marcou a urgência como ${u.nome.toLowerCase()}`); }}>
                    {u.nome}
                  </button>
                ))}
              </div>
            </section>

            <section className="ms">
              <h3>Pessoas</h3>
              <div className="tags">
                {equipe.map((p) => (
                  <button key={p.id} className="tag" aria-pressed={cartao.membros.includes(p.id)}
                          onClick={() => alternaMembro(p.id)}>{p.nome}</button>
                ))}
              </div>
            </section>

            <section className="ms">
              <h3>Prazo{estado && <span className={`ms-pz pz-${estado}`}>{TEXTO_DO_ESTADO[estado]}</span>}</h3>
              <div className="ms-prazo">
                <input className="cx" type="date" value={prazo.data} aria-label="Dia do prazo"
                       onChange={(e) => mudaPrazo(e.target.value, prazo.hora)} />
                <input className="cx" type="time" value={prazo.hora} aria-label="Hora do prazo" disabled={!prazo.data}
                       onChange={(e) => mudaPrazo(prazo.data, e.target.value)} />
              </div>
              {cartao.prazo && agora && <p className={`ms-pz-txt pz-${estado || 'normal'}`}>{estado === 'atrasado' ? 'Atrasado: ' : 'Para '}{textoDoPrazo(cartao.prazo, agora).toLowerCase()}{prazo.hora ? '' : ', até o fim do dia'}</p>}
              {cartao.prazo && (
                <label className={cartao.prazoConcluido ? 'ci ok' : 'ci'}>
                  <input type="checkbox" checked={cartao.prazoConcluido}
                         onChange={() => void salva(
                           { prazoConcluido: !cartao.prazoConcluido },
                           cartao.prazoConcluido ? 'reabriu o prazo' : 'marcou o prazo como concluído',
                         )} />
                  <span style={{ textDecoration: 'none', color: 'inherit' }}>Concluído</span>
                </label>
              )}
              {cartao.prazo && <button className="tx-btn" onClick={() => mudaPrazo('', '')}>Tirar o prazo</button>}
            </section>

            <section className="ms">
              <h3>Capa</h3>
              <div className="ms-capas">
                {CAPAS.map((c) => (
                  <button key={c.k} className={`ms-capa cp-${c.k}`} aria-pressed={cartao.capaCor === c.k} aria-label={`Capa ${c.nome}`} title={c.nome}
                          onClick={() => void salva({ capaCor: cartao.capaCor === c.k ? APAGAR : c.k })} />
                ))}
              </div>
              {cartao.capaCor && <button className="tx-btn" onClick={() => void salva({ capaCor: APAGAR })}>Tirar a capa</button>}
            </section>

            <section className="ms">
              <h3>Mover para</h3>
              <select className="cx" value={cartao.listaId} aria-label="Mover o cartão para outra lista"
                      onChange={(e) => {
                        const destino = listas.find((l) => l.id === e.target.value);
                        if (!destino) return;
                        void salva({ listaId: destino.id, quadroId: destino.quadroId },
                          `moveu de ${lista?.nome || '?'} para ${destino.nome}`);
                        avisa(`Cartão movido para ${destino.nome}`);
                      }}>
                {quadros.map((q) => (
                  <optgroup key={q.id} label={q.nome}>
                    {listas.filter((l) => l.quadroId === q.id && !l.arquivada)
                      .map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}
                  </optgroup>
                ))}
              </select>
            </section>

            <section className="ms ms-acoes">
              <h3>Ações</h3>
              <button className="btn" onClick={aoCopiar}><Ic n="doc" />Copiar cartão</button>
              {!cartao.arquivado && (
                <button className="arq-b" onClick={() => {
                  void salva({ arquivado: true }, 'arquivou o cartão');
                  fechar();
                  avisa('Cartão arquivado. Ele some do quadro, mas a busca ainda acha.');
                }}>Arquivar cartão</button>
              )}
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
