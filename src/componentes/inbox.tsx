'use client';
/* O atendimento. Arranjo de aplicativo de mensagens de proposito: o time ja sabe usar.
   Le do Firestore em tempo real; manda pela rota /api/whatsapp/enviar, que é quem
   tem o segredo. */
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useSearchParams } from 'next/navigation';
import { assina, atualiza, cria, modoDemo } from '@/lib/dados/fonte';
import { useSessao } from '@/componentes/sessao';
import { Ic } from '@/componentes/icones';
import PainelContato from '@/componentes/painel-contato';
import { usePainelRecolhido } from '@/componentes/painel-recolhido';
import { horaConhecida, useAgora } from '@/componentes/relogio';
import { NOME_CURTO_SETOR, SETORES, veSetor } from '@/lib/dominio/acessos';
import {
  buscaCasou, etiquetasEmUso, passaNaEtiqueta, passaNoFiltro, passaNoSetor, situacao, type Filtro,
} from '@/lib/dominio/conversas';
import { corDaEtiqueta } from '@/lib/dominio/quadros';
import {
  corta, diaPorExtenso, hora, iniciais, janelaAberta, mesmoDia, paraCampoDeHora, quando, tomDoNome,
} from '@/lib/dominio/formato';
import type { Conversa, Mensagem, MensagemAgendada, Setor } from '@/lib/dominio/tipos';

/* os emojis de toda hora, numa grade só: sem biblioteca, sem rede */
const EMOJIS = ['😊', '🙂', '😉', '😄', '😂', '🥰', '😍', '🤗', '🙏', '👍', '👏', '🙌', '💪', '👋', '✅', '🎉',
  '❤️', '🧡', '⭐', '🔥', '💯', '🤔', '😅', '😢', '📚', '✏️', '📝', '📅', '⏰', '📍', '📞', '💬'];

function Avatar({ nome, foto, c }: { nome: string; foto?: string; c?: string }) {
  const classe = ['av', c, !foto && tomDoNome(nome)].filter(Boolean).join(' ');
  return (
    <span className={classe} aria-hidden="true">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {foto ? <img src={foto} alt="" /> : iniciais(nome)}
    </span>
  );
}

function Ticks({ m }: { m: Mensagem }) {
  if (m.direcao !== 'saida') return null;
  if (m.falhouEm) return <span className="tk-x" title={m.falhaMotivo || 'não entregue'} aria-label="não entregue">!</span>;
  const lido = Boolean(m.lidoEm);
  return (
    <svg className={lido ? 'tk lido' : 'tk'} viewBox="0 0 15 11" role="img"
         aria-label={lido ? 'lida' : m.entregueEm ? 'entregue' : 'enviada'}>
      <path d="M1 6.5l3 3 6-7.5" />
      {(lido || m.entregueEm) && <path d="M6.8 8.7l.8.8 6-7.5" />}
    </svg>
  );
}

export default function Inbox() {
  const { perfil, usuario } = useSessao();
  /* /conversas?conversa=ID abre essa conversa: é o link do cartão no quadro, da tela de
     aulas e do aviso que chega no celular do coordenador */
  const pedida = useSearchParams().get('conversa');
  const [pedidaVista, setPedidaVista] = useState(pedida);
  const [conversas, setConversas] = useState<Conversa[]>([]);
  const [todasMensagens, setTodasMensagens] = useState<Mensagem[]>([]);
  const [abertaId, setAbertaId] = useState<string | null>(pedida);
  const [filtro, setFiltro] = useState<Filtro>('todas');
  const [etiqueta, setEtiqueta] = useState<string | null>(null);
  const [setor, setSetor] = useState<Setor | null>(null);
  const [filtroAberto, setFiltroAberto] = useState(false);
  const [busca, setBusca] = useState('');
  const [rascunho, setRascunho] = useState('');
  const [emojis, setEmojis] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState('');
  /* no celular e na tela estreita: a conversa por cima da lista, e o painel por cima
     da conversa. Vem do estado, e nao de classe posta a mao no HTML: o React reescreve
     o className a cada mudanca e apagava a classe, e o primeiro toque se perdia. */
  const [naConversa, setNaConversa] = useState(Boolean(pedida));
  const [painel, setPainel] = useState(false);
  const [recolhido, setRecolhido] = usePainelRecolhido();
  const [agendadas, setAgendadas] = useState<MensagemAgendada[]>([]);
  const [programando, setProgramando] = useState(false);
  const agora = useAgora();
  const [progTexto, setProgTexto] = useState('');
  const [progQuando, setProgQuando] = useState('');
  const rolo = useRef<HTMLDivElement>(null);
  const [confirmaEncerrar, setConfirmaEncerrar] = useState<string | null>(null);
  const [encerrando, setEncerrando] = useState(false);

  /* o link mudou com a tela aberta: abre a conversa nova */
  if (pedida !== pedidaVista) {
    setPedidaVista(pedida);
    if (pedida) { setAbertaId(pedida); setNaConversa(true); setPainel(false); }
  }

  /* lista de conversas, em tempo real */
  useEffect(() => assina('conversas', (docs) => {
    setConversas((docs as unknown as Conversa[]).slice()
      .sort((a, b) => (b.ultimaEm || '').localeCompare(a.ultimaEm || '')));
  }), []);

  /* mensagens de todas as conversas; a aberta filtra em memoria */
  useEffect(() => assina('mensagens', (docs) => {
    setTodasMensagens(docs as unknown as Mensagem[]);
  }), []);

  /* o que foi escrito agora para sair depois */
  useEffect(() => assina('agendadas', (docs) => {
    setAgendadas(docs as unknown as MensagemAgendada[]);
  }), []);

  const mensagens = useMemo(
    () => todasMensagens
      .filter((m) => m.conversaId === abertaId)
      .sort((a, b) => a.criadaEm.localeCompare(b.criadaEm)),
    [todasMensagens, abertaId],
  );

  useEffect(() => {
    const r = rolo.current;
    if (r) r.scrollTop = r.scrollHeight;
  }, [mensagens]);

  const visiveis = useMemo(() => {
    if (!perfil) return [];
    return conversas
      .filter((c) => veSetor(perfil.papel, perfil.setores, c.setor))
      .filter((c) => passaNoFiltro(c, filtro))
      .filter((c) => passaNoSetor(c, setor))
      .filter((c) => passaNaEtiqueta(c, etiqueta))
      .filter((c) => buscaCasou(c, busca));
  }, [conversas, perfil, filtro, setor, etiqueta, busca]);

  /* a lista de assuntos se monta do que existe, nao de uma lista fixa */
  const assuntos = useMemo(() => etiquetasEmUso(
    conversas.filter((c) => (perfil ? veSetor(perfil.papel, perfil.setores, c.setor) : false)),
  ), [conversas, perfil]);

  const aberta = conversas.find((c) => c.id === abertaId) || null;
  const janela = aberta ? janelaAberta(aberta) : false;

  const abrir = useCallback(async (c: Conversa) => {
    setAbertaId(c.id); setNaConversa(true); setPainel(false); setRascunho('');
    if (c.naoLidas > 0) {
      try { await atualiza('conversas', c.id, { naoLidas: 0 }); } catch { /* sem permissão, segue */ }
    }
  }, []);

  /* Encerrar na mão pede dois toques: o primeiro arma, o segundo encerra. Com a chave
     do atendimento automático ligada, o servidor manda antes uma despedida curta. */
  async function encerrar() {
    if (!aberta) return;
    if (confirmaEncerrar !== aberta.id) { setConfirmaEncerrar(aberta.id); return; }
    setConfirmaEncerrar(null); setEncerrando(true); setAviso('');
    try {
      if (modoDemo) {
        const quando = new Date().toISOString();
        const quem = perfil?.nome || 'Equipe';
        await atualiza('conversas', aberta.id, {
          estado: 'encerrada', encerradaEm: quando, encerradaPor: 'atendente', encerradaPorNome: quem, setor: 'recepcao',
        });
        await cria('mensagens', {
          conversaId: aberta.id, direcao: 'saida', autor: 'sistema', texto: `${quem} encerrou o atendimento.`, criadaEm: quando,
        });
        return;
      }
      if (!usuario) return;
      const token = await usuario.getIdToken();
      const r = await fetch('/api/conversas/encerrar', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ conversaId: aberta.id }),
      });
      const resposta = (await r.json()) as { ok?: boolean; erro?: string };
      if (!r.ok || !resposta.ok) setAviso(resposta.erro || 'Não consegui encerrar agora.');
    } catch {
      setAviso('Não consegui falar com o servidor. Tente de novo.');
    } finally {
      setEncerrando(false);
    }
  }

  async function enviar(e: FormEvent) {
    e.preventDefault();
    const texto = rascunho.trim();
    if (!texto || !aberta) return;
    setEnviando(true); setAviso('');

    /* na demonstracao nao existe servidor nem Meta: a fala entra direto na base */
    if (modoDemo) {
      const agora = new Date().toISOString();
      await cria('mensagens', {
        conversaId: aberta.id, direcao: 'saida', autor: 'humano',
        autorNome: perfil?.nome || 'Equipe', texto, entregueEm: agora, criadaEm: agora,
      });
      await atualiza('conversas', aberta.id, {
        ultimaEm: agora, ultimaPreviaTexto: texto, agenteAtivo: false, naoLidas: 0,
      });
      setRascunho(''); setEnviando(false);
      return;
    }

    if (!usuario) { setEnviando(false); return; }
    try {
      const token = await usuario.getIdToken();
      const r = await fetch('/api/whatsapp/enviar', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ conversaId: aberta.id, texto }),
      });
      const resposta = (await r.json()) as { ok?: boolean; erro?: string };
      if (!r.ok || !resposta.ok) { setAviso(resposta.erro || 'Não consegui enviar agora.'); return; }
      setRascunho('');
    } catch {
      setAviso('Não consegui falar com o servidor. Tente de novo.');
    } finally {
      setEnviando(false);
    }
  }

  async function programa(e: FormEvent) {
    e.preventDefault();
    const texto = progTexto.trim();
    if (!texto || !progQuando || !aberta) return;
    const quandoSai = new Date(progQuando);
    if (quandoSai.getTime() <= new Date().getTime()) {
      setAviso('Escolha uma hora que ainda não passou.'); return;
    }
    await cria('agendadas', {
      conversaId: aberta.id, texto, quando: quandoSai.toISOString(),
      autorId: perfil?.id || '', autorNome: perfil?.nome || 'Equipe',
      estado: 'agendada', criadaEm: new Date().toISOString(),
    });
    setProgramando(false); setProgTexto(''); setProgQuando(''); setAviso('');
    setPainel(true);
  }

  /* a janela de 24 horas vale na hora do ENVIO, nao agora: se ela ja tiver fechado
     la na frente, a mensagem so sai por modelo aprovado, e isso precisa estar dito */
  const foraDaJanela = Boolean(
    progQuando && aberta?.janelaAte && new Date(progQuando).getTime() > new Date(aberta.janelaAte).getTime(),
  );
  const naFila = aberta
    ? agendadas.filter((a) => a.conversaId === aberta.id && a.estado === 'agendada').length
    : 0;

  const chipsEstado: { k: Filtro; r: string; n: number }[] = [
    { k: 'todas', r: 'Todas', n: 0 },
    { k: 'nao_lidas', r: 'Não lidas', n: conversas.filter((c) => c.estado !== 'encerrada' && c.naoLidas > 0).length },
    { k: 'retornos', r: 'Retornos', n: conversas.filter((c) => c.estado !== 'encerrada' && c.retorno).length },
    { k: 'encerradas', r: 'Encerradas', n: 0 },
  ];
  const setoresQueVejo: { s: Setor; r: string; n: number }[] = SETORES
    .filter((s) => (perfil ? veSetor(perfil.papel, perfil.setores, s) : false))
    .map((s) => ({
      s, r: NOME_CURTO_SETOR[s],
      n: conversas.filter((c) => c.estado !== 'encerrada' && c.setor === s).length,
    }));
  const refinos = (setor ? 1 : 0) + (etiqueta ? 1 : 0);

  return (
    <div className={[
      'wa', !aberta && 'vazia', recolhido && 'recolhido', naConversa && 'c-open', painel && 'p-open',
    ].filter(Boolean).join(' ')}>
      <section className="lst" aria-label="Conversas">
        <div className="lst-topo">
        <header className="lh">
          <b>Conversas</b>
          <span className="conta num" aria-live="polite">
            {visiveis.length}{visiveis.length === 1 ? ' conversa' : ' conversas'}
          </span>
        </header>
        <div className="busca-ln">
          <div className="busca">
            <Ic n="busca" />
            <input type="search" placeholder="Pesquisar" autoComplete="off" value={busca}
                   aria-label="Pesquisar conversa por nome ou telefone"
                   onChange={(e) => setBusca(e.target.value)} />
          </div>
          <button className="ib" aria-expanded={filtroAberto} title="Filtrar por assunto"
                  aria-label="Filtrar por assunto" onClick={() => setFiltroAberto(!filtroAberto)}>
            <Ic n="filtro" />
            {refinos > 0 && <span className="q">{refinos}</span>}
          </button>
        </div>
        </div>

        {filtroAberto && (
          <div className="pfl">
            {setoresQueVejo.length > 1 && (
              <>
                <h3>Setor</h3>
                <div className="tags">
                  {setoresQueVejo.map((x) => (
                    <button key={x.s} className="chip" aria-pressed={setor === x.s}
                            onClick={() => setSetor(setor === x.s ? null : x.s)}>
                      {x.r}{x.n > 0 && <span className="num">{x.n}</span>}
                    </button>
                  ))}
                </div>
              </>
            )}
            <h3>Assunto</h3>
            {assuntos.length ? (
              <div className="tags">
                {assuntos.map((a) => (
                  <button key={a} className={`lbp lb-${corDaEtiqueta(a)}`}
                          aria-pressed={etiqueta === a} style={{ opacity: etiqueta && etiqueta !== a ? 0.45 : 1 }}
                          onClick={() => setEtiqueta(etiqueta === a ? null : a)}>
                    {a}
                  </button>
                ))}
              </div>
            ) : (
              <p className="obs">
                Nenhum assunto ainda. A triagem marca sozinha conforme as mensagens chegam.
              </p>
            )}
            <div className="rodape-f">
              <button className="tx-btn" disabled={!refinos}
                      onClick={() => { setEtiqueta(null); setSetor(null); }}>
                Limpar
              </button>
              <button className="btn" onClick={() => setFiltroAberto(false)}>Fechar</button>
            </div>
          </div>
        )}
        <div className="filtros">
          <div className="chips" role="group" aria-label="Filtrar conversas">
            {chipsEstado.map((c) => (
              <button key={c.k} className="chip" aria-pressed={filtro === c.k} onClick={() => setFiltro(c.k)}>
                {c.r}{c.n > 0 && <span className="num">{c.n}</span>}
              </button>
            ))}
          </div>
        </div>
        <div className="lista">
          {visiveis.map((c) => (
            <button key={c.id} className={c.naoLidas ? 'it nl' : 'it'} aria-current={c.id === abertaId}
                    onClick={() => void abrir(c)}>
              <Avatar nome={c.nome} foto={c.foto} />
              <span className="bd">
                <span className="l1">
                  <b>{c.nome}</b>
                  <time>{c.ultimaEm ? quando(c.ultimaEm) : ''}</time>
                </span>
                <span className="l2">
                  <span className="pv">{corta(c.ultimaPreviaTexto || '', 60)}</span>
                  {c.naoLidas > 0 && <span className="bdg num">{c.naoLidas}</span>}
                </span>
                <span className="l3">
                  {c.etiquetas.map((e) => (
                    <span key={e} className={`lbp lb-${corDaEtiqueta(e)}`}>{e}</span>
                  ))}
                  <span>{situacao(c)}</span>
                  {c.retorno && <span className="rt"><Ic n="relogio" />retorno {c.retorno.quando}</span>}
                </span>
              </span>
            </button>
          ))}
          {!visiveis.length && (
            <p className="vazio">
              {conversas.length
                ? 'Nenhuma conversa nesta lista.'
                : 'Ainda não chegou nenhuma mensagem. Assim que o número estiver conectado, as conversas aparecem aqui.'}
            </p>
          )}
        </div>
      </section>

      <section className="cht" aria-label="Conversa">
        {!aberta ? (
          <div className="sem"><p>Escolha uma conversa para atender.</p></div>
        ) : (
          <>
            <header className="ch">
              <button className="ib volta" aria-label="Voltar para a lista"
                      onClick={() => { setNaConversa(false); setPainel(false); }}>
                <Ic n="volta" />
              </button>
              <button className="cab-btn" aria-label={`Dados de ${aberta.nome}`}
                      onClick={() => { setRecolhido(false); setPainel(!painel); }}>
                <Avatar nome={aberta.nome} foto={aberta.foto} c="s" />
                <span><b>{aberta.nome}</b><small>{situacao(aberta)}</small></span>
              </button>
              {aberta.estado !== 'encerrada' && (
                <button className={confirmaEncerrar === aberta.id ? 'btn enc confirma' : 'btn enc'}
                        disabled={encerrando} onBlur={() => setConfirmaEncerrar(null)}
                        title={confirmaEncerrar === aberta.id ? 'Toque de novo para encerrar' : 'Encerrar este atendimento'}
                        onClick={() => void encerrar()}>
                  {confirmaEncerrar === aberta.id ? 'Confirmar encerramento' : <>Encerrar<span className="so-largo"> atendimento</span></>}
                </button>
              )}
              <button className="ib abre" title="Abrir dados do contato" aria-label="Abrir dados do contato"
                      onClick={() => { setRecolhido(false); setPainel(!painel); }}>
                <Ic n="info" />
              </button>
            </header>

            <div className="rolo" ref={rolo}>
              {mensagens.map((m, i) => {
                const antes = mensagens[i - 1];
                const novoDia = !antes || !mesmoDia(antes.criadaEm, m.criadaEm);
                const primeira = !antes || antes.autor !== m.autor || novoDia;
                if (m.autor === 'sistema') {
                  return (
                    <Fragment key={m.id}>
                      {novoDia && <div className="cp">{diaPorExtenso(m.criadaEm)}</div>}
                      <div className="cp rec">{m.texto}</div>
                    </Fragment>
                  );
                }
                const lado = m.direcao === 'entrada' ? 'in' : 'out';
                return (
                  <Fragment key={m.id}>
                    {novoDia && <div className="cp">{diaPorExtenso(m.criadaEm)}</div>}
                    <div className={`w ${lado}${primeira ? ' p' : ''}`}>
                      <div className="b">
                        {lado === 'out' && primeira && (
                          <span className="nm">
                            {m.autor === 'lumi' ? m.autorNome || 'Atendimento automático' : m.autorNome || 'Equipe'}
                            {m.template ? ', modelo aprovado' : ''}
                          </span>
                        )}
                        {m.texto && <span className="tx">{m.texto}</span>}
                        {!m.texto && m.midiaNome && <span className="tx">{m.midiaNome}</span>}
                        <span className="mt">{hora(m.criadaEm)}<Ticks m={m} /></span>
                      </div>
                      {m.botoes?.length ? (
                        <div className="bts-msg" aria-label="Botões enviados com a mensagem">
                          {m.botoes.map((b) => <span key={b}>{b}</span>)}
                        </div>
                      ) : null}
                    </div>
                  </Fragment>
                );
              })}
              {!mensagens.length && <div className="sem"><p>Nenhuma mensagem nesta conversa ainda.</p></div>}
            </div>

            {aviso && <div className="fx"><p>{aviso}</p></div>}

            {programando && (
              <form className="prog" onSubmit={(e) => void programa(e)}>
                <input type="text" className="cx" value={progTexto} autoComplete="off" autoFocus
                       aria-label="Mensagem programada" placeholder="O que vai ser enviado"
                       onChange={(e) => setProgTexto(e.target.value)} />
                <div className="ln">
                  <input type="datetime-local" className="cx" value={progQuando} aria-label="Quando enviar"
                         min={horaConhecida(agora) ? paraCampoDeHora(agora) : undefined}
                         onChange={(e) => setProgQuando(e.target.value)} />
                </div>
                <div className="acoes">
                  <p className={foraDaJanela ? 'obs alerta' : 'obs'}>
                    {foraDaJanela
                      ? 'Nessa hora a janela de 24 horas já terá fechado: só sai por modelo aprovado, ou se o contato escrever antes.'
                      : 'A mensagem fica guardada e sai sozinha na hora marcada.'}
                  </p>
                  <button type="button" className="btn" onClick={() => setProgramando(false)}>Cancelar</button>
                  <button type="submit" className="btn p" disabled={!progTexto.trim() || !progQuando}>
                    Programar
                  </button>
                </div>
              </form>
            )}

            {janela ? (
              <form className="cmp" onSubmit={(e) => { setEmojis(false); void enviar(e); }}>
                {emojis && (
                  <div className="emo" role="group" aria-label="Emojis">
                    {EMOJIS.map((e) => (
                      <button key={e} type="button" aria-label={`Inserir ${e}`}
                              onClick={() => setRascunho((r) => r + e)}>{e}</button>
                    ))}
                  </div>
                )}
                <div className="campo">
                  <button type="button" className="ib" aria-expanded={emojis} title="Emojis" aria-label="Emojis"
                          onClick={() => setEmojis(!emojis)}>
                    <Ic n="emoji" />
                  </button>
                  <input type="text" value={rascunho} autoComplete="off" aria-label="Mensagem"
                         placeholder="Digite uma mensagem" onChange={(e) => setRascunho(e.target.value)} />
                  <button type="button" className={naFila ? 'ib tem' : 'ib'} aria-expanded={programando}
                          title={naFila ? `${naFila} mensagem programada nesta conversa` : 'Programar mensagem'}
                          aria-label="Programar mensagem"
                          onClick={() => setProgramando(!programando)}>
                    <Ic n="relogio" />
                  </button>
                </div>
                <button type="submit" className="envia" title="Enviar" aria-label="Enviar" disabled={enviando}>
                  <Ic n="envia" />
                </button>
              </form>
            ) : (
              <div className="pe">
                <p>Passaram 24 horas da última mensagem do contato. Para retomar, envie um modelo aprovado.</p>
                <button className="btn" aria-expanded={programando} onClick={() => setProgramando(!programando)}>
                  <Ic n="relogio" />Programar mensagem
                </button>
              </div>
            )}
          </>
        )}
      </section>

      <aside className="pnl" aria-label="Dados do contato">
        {aberta && (
          <PainelContato
            key={aberta.id}
            conversa={aberta}
            mensagens={mensagens}
            agendadas={agendadas.filter((a) => a.conversaId === aberta.id)}
            aoFechar={() => { setRecolhido(true); setPainel(false); }}
          />
        )}
      </aside>
    </div>
  );
}
