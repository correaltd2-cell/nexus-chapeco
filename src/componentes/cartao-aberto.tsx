'use client';
/* O cartao aberto. Tudo que o Trello tem de util: descricao, etiquetas, pessoas,
   prazo, checklist, comentarios, anexos, mover de lista e arquivar. */
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { deleteField, doc, updateDoc } from 'firebase/firestore';
import { getDownloadURL, ref as refArquivo, uploadBytes } from 'firebase/storage';
import { arquivos, bd } from '@/lib/firebase/cliente';
import { Ic } from '@/componentes/icones';
import { avisa } from '@/componentes/aviso';
import { useSessao } from '@/componentes/sessao';
import { feitosDoChecklist } from '@/lib/dominio/quadros';
import { dataBR, iniciais } from '@/lib/dominio/formato';
import type { Cartao, Lista, Perfil, Quadro } from '@/lib/dominio/tipos';

const id9 = () => Math.random().toString(36).slice(2, 11);

interface Props {
  cartao: Cartao;
  listas: Lista[];
  quadros: Quadro[];
  equipe: Perfil[];
  etiquetas: { nome: string; cor: string }[];
  fechar: () => void;
  irParaConversa: (conversaId: string) => void;
}

export default function CartaoAberto({
  cartao, listas, quadros, equipe, etiquetas, fechar, irParaConversa,
}: Props) {
  const { perfil } = useSessao();
  const [titulo, setTitulo] = useState(cartao.titulo);
  const [descricao, setDescricao] = useState(cartao.descricao);
  const [novoItem, setNovoItem] = useState('');
  const [comentario, setComentario] = useState('');
  const [subindo, setSubindo] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);
  const entrada = useRef<HTMLInputElement>(null);

  const ref = doc(bd(), 'cartoes', cartao.id);
  const lista = listas.find((l) => l.id === cartao.listaId);
  const quadro = quadros.find((q) => q.id === cartao.quadroId);
  const feitos = feitosDoChecklist(cartao);
  const pct = cartao.checklist.length ? Math.round((feitos / cartao.checklist.length) * 100) : 0;

  useEffect(() => { caixa.current?.focus(); }, []);
  useEffect(() => { setTitulo(cartao.titulo); setDescricao(cartao.descricao); }, [cartao.id, cartao.titulo, cartao.descricao]);

  useEffect(() => {
    const ouve = (e: KeyboardEvent) => { if (e.key === 'Escape') fechar(); };
    document.addEventListener('keydown', ouve);
    return () => document.removeEventListener('keydown', ouve);
  }, [fechar]);

  const anota = (texto: string) => ({
    id: id9(), autorNome: perfil?.nome || 'Equipe', texto, criadoEm: new Date().toISOString(),
  });

  const salva = (campos: Record<string, unknown>, atividade?: string) =>
    updateDoc(ref, {
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
    void salva({ checklist: [...cartao.checklist, { id: id9(), texto: t, feito: false }] });
    setNovoItem('');
    entrada.current?.focus();
  }

  function comenta(e: FormEvent) {
    e.preventDefault();
    const t = comentario.trim();
    if (!t) return;
    void updateDoc(ref, {
      comentarios: [...cartao.comentarios, {
        id: id9(), autorId: perfil?.id || '', autorNome: perfil?.nome || 'Equipe',
        texto: t, criadoEm: new Date().toISOString(),
      }],
      atualizadoEm: new Date().toISOString(),
    });
    setComentario('');
  }

  async function anexa(arquivo: File) {
    if (arquivo.size > 20 * 1024 * 1024) { avisa('O arquivo passa de 20 MB. Mande um menor.'); return; }
    setSubindo(true);
    try {
      const caminho = `cartoes/${cartao.id}/${Date.now()}-${arquivo.name}`;
      await uploadBytes(refArquivo(arquivos(), caminho), arquivo);
      await salva({
        anexos: [...cartao.anexos, {
          id: id9(), nome: arquivo.name, path: caminho, mime: arquivo.type || 'application/octet-stream',
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
                  <span className="av s" aria-hidden="true">{iniciais(cartao.titulo)}</span>
                  <span className="mc-t"><b>Conversa ligada a este cartão</b>
                    <small>abrir leva direto para o atendimento</small></span>
                  <button className="btn p" onClick={() => irParaConversa(cartao.conversaId as string)}>
                    Abrir conversa
                  </button>
                </div>
                <div className="lnk">
                  <button className="tx-btn" onClick={() => void salva({ conversaId: deleteField() }, 'desligou o cartão da conversa')}>
                    Desligar da conversa
                  </button>
                </div>
              </section>
            )}

            <section className="ms">
              <h3>Descrição</h3>
              <textarea className="cx" rows={3} value={descricao} aria-label="Descrição"
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
                <input className="cx" type="file" aria-label="Anexar arquivo" disabled={subindo}
                       onChange={(e) => { const f = e.target.files?.[0]; if (f) void anexa(f); e.target.value = ''; }} />
              </div>
              {subindo && <p className="obs">Subindo o arquivo...</p>}
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
                {etiquetas.map((e) => {
                  const on = cartao.etiquetas.includes(e.nome);
                  return (
                    <button key={e.nome} className={on ? `lbt lb-${e.cor}` : 'lbt'} aria-pressed={on}
                            onClick={() => alternaEtiqueta(e.nome)}>{e.nome}</button>
                  );
                })}
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
              <h3>Prazo</h3>
              <input className="cx" type="date" value={cartao.prazo || ''} aria-label="Prazo do cartão"
                     onChange={(e) => void salva(
                       e.target.value ? { prazo: e.target.value } : { prazo: deleteField(), prazoConcluido: false },
                     )} />
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

            <section className="ms">
              <button className="arq-b" onClick={() => {
                void salva({ arquivado: true }, 'arquivou o cartão');
                fechar();
                avisa('Cartão arquivado. Ele fica em Itens arquivados.');
              }}>Arquivar cartão</button>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
