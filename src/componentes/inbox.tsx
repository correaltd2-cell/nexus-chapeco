'use client';
/* O atendimento. Arranjo de aplicativo de mensagens de proposito: o time ja sabe usar.
   Le do Firestore em tempo real; manda pela rota /api/whatsapp/enviar, que é quem
   tem o segredo. */
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { assina, atualiza, cria, modoDemo } from '@/lib/dados/fonte';
import { useSessao } from '@/componentes/sessao';
import { Ic } from '@/componentes/icones';
import PainelContato from '@/componentes/painel-contato';
import { horaConhecida, useAgora } from '@/componentes/relogio';
import { NOME_CURTO_SETOR, SETORES, veSetor } from '@/lib/dominio/acessos';
import { buscaCasou, passaNoFiltro, situacao, type Filtro } from '@/lib/dominio/conversas';
import {
  corta, diaPorExtenso, hora, iniciais, janelaAberta, mesmoDia, paraCampoDeHora, quando,
} from '@/lib/dominio/formato';
import type { Conversa, Mensagem, MensagemAgendada } from '@/lib/dominio/tipos';

function Avatar({ nome, foto, c }: { nome: string; foto?: string; c?: string }) {
  return (
    <span className={c ? `av ${c}` : 'av'} aria-hidden="true">
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
  const [conversas, setConversas] = useState<Conversa[]>([]);
  const [todasMensagens, setTodasMensagens] = useState<Mensagem[]>([]);
  const [abertaId, setAbertaId] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<Filtro>('todas');
  const [busca, setBusca] = useState('');
  const [rascunho, setRascunho] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState('');
  const [painel, setPainel] = useState(false);
  const [agendadas, setAgendadas] = useState<MensagemAgendada[]>([]);
  const [programando, setProgramando] = useState(false);
  const agora = useAgora();
  const [progTexto, setProgTexto] = useState('');
  const [progQuando, setProgQuando] = useState('');
  const rolo = useRef<HTMLDivElement>(null);

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
      .filter((c) => buscaCasou(c, busca));
  }, [conversas, perfil, filtro, busca]);

  const aberta = conversas.find((c) => c.id === abertaId) || null;
  const janela = aberta ? janelaAberta(aberta) : false;

  const abrir = useCallback(async (c: Conversa) => {
    setAbertaId(c.id); setPainel(false); setRascunho('');
    document.querySelector('.wa')?.classList.add('c-open');
    if (c.naoLidas > 0) {
      try { await atualiza('conversas', c.id, { naoLidas: 0 }); } catch { /* sem permissão, segue */ }
    }
  }, []);

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
    setPainel(true); document.querySelector('.wa')?.classList.add('p-open');
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
  const chipsSetor: { k: Filtro; r: string; n: number }[] = SETORES
    .filter((s) => (perfil ? veSetor(perfil.papel, perfil.setores, s) : false))
    .map((s) => ({
      k: s as Filtro, r: NOME_CURTO_SETOR[s],
      n: conversas.filter((c) => c.estado !== 'encerrada' && c.setor === s).length,
    }));

  return (
    <div className={aberta ? 'wa' : 'wa vazia'}>
      <section className="lst" aria-label="Conversas">
        <header className="lh"><b>Conversas</b></header>
        <div className="busca">
          <Ic n="busca" />
          <input type="search" placeholder="Pesquisar" autoComplete="off" value={busca}
                 aria-label="Pesquisar conversa por nome ou telefone"
                 onChange={(e) => setBusca(e.target.value)} />
        </div>
        <div className="filtros">
          <div className="chips" role="group" aria-label="Filtrar por situação">
            {chipsEstado.map((c) => (
              <button key={c.k} className="chip" aria-pressed={filtro === c.k} onClick={() => setFiltro(c.k)}>
                {c.r}{c.n > 0 && <span className="num">{c.n}</span>}
              </button>
            ))}
          </div>
          {chipsSetor.length > 1 && (
            <div className="chips" role="group" aria-label="Filtrar por setor">
              {chipsSetor.map((c) => (
                <button key={c.k} className="chip" aria-pressed={filtro === c.k} onClick={() => setFiltro(c.k)}>
                  {c.r}{c.n > 0 && <span className="num">{c.n}</span>}
                </button>
              ))}
            </div>
          )}
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
                      onClick={() => document.querySelector('.wa')?.classList.remove('c-open', 'p-open')}>
                <Ic n="volta" />
              </button>
              <button className="cab-btn" aria-label={`Dados de ${aberta.nome}`}
                      onClick={() => { setPainel(!painel); document.querySelector('.wa')?.classList.toggle('p-open'); }}>
                <Avatar nome={aberta.nome} foto={aberta.foto} c="s" />
                <span><b>{aberta.nome}</b><small>{situacao(aberta)}</small></span>
              </button>
              <button className="ib abre" title="Dados do contato" aria-label="Dados do contato"
                      onClick={() => { setPainel(!painel); document.querySelector('.wa')?.classList.toggle('p-open'); }}>
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
                      <div className="cp">{m.texto}</div>
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
                            {m.autor === 'lumi' ? 'Lumi' : m.autorNome || 'Equipe'}
                            {m.template ? ', modelo aprovado' : ''}
                          </span>
                        )}
                        {m.texto && <span className="tx">{m.texto}</span>}
                        {!m.texto && m.midiaNome && <span className="tx">{m.midiaNome}</span>}
                        <span className="mt num">{hora(m.criadaEm)}<Ticks m={m} /></span>
                      </div>
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
              <form className="cmp" onSubmit={enviar}>
                <button type="button" className="ib prog" aria-expanded={programando}
                        title={naFila ? `${naFila} mensagem programada nesta conversa` : 'Programar mensagem'}
                        aria-label="Programar mensagem"
                        onClick={() => setProgramando(!programando)}>
                  <Ic n={naFila ? 'check' : 'relogio'} />
                </button>
                <input type="text" value={rascunho} autoComplete="off" aria-label="Mensagem"
                       placeholder="Digite uma mensagem" onChange={(e) => setRascunho(e.target.value)} />
                <button type="submit" className="ib" title="Enviar" aria-label="Enviar" disabled={enviando}>
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
            aoFechar={() => {
              setPainel(false);
              document.querySelector('.wa')?.classList.remove('p-open');
            }}
          />
        )}
      </aside>
    </div>
  );
}
