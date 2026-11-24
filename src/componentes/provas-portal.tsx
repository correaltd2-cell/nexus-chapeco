'use client';
/* A aba Provas do aluno (no painel da conversa e no cadastro): as provas que ele tem no
   portal de alunos (nexusenglish.com.br), o estado de cada uma, e liberar e mandar o
   link pelo WhatsApp. A prova em si (questões, respostas, áudio, correção, tempo) fica
   no portal; aqui só se vincula, consulta, libera e envia, sempre pelo servidor.
   Enquanto a ligação com o portal não estiver configurada, a aba diz isso e não mostra
   nada inventado. Regras: dominio/provas-portal.ts e provas-portal/fluxo.ts. */
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { assinaFiltro, modoDemo } from '@/lib/dados/fonte';
import { useSessao } from '@/componentes/sessao';
import { avisa } from '@/componentes/aviso';
import { Ic } from '@/componentes/icones';
import { horaConhecida, useAgora } from '@/componentes/relogio';
import {
  NOME_DA_SITUACAO_DA_MENSAGEM, NOME_DO_ESTADO, acoesDaProva, podeNoPortal, situacaoDaMensagem,
  type AlunoNoPortal, type OperacaoDaProva, type ProvaNoPortal,
} from '@/lib/dominio/provas-portal';
import { dataHoraBR, janelaAberta, telefoneLegivel } from '@/lib/dominio/formato';
import type { Conversa, Mensagem } from '@/lib/dominio/tipos';

type AlunoDaAba = { id: string; nome: string; portalStudentId?: string | null; portalNome?: string | null };
type ConversaDaAba = Pick<Conversa, 'id' | 'nome' | 'waId' | 'janelaAte' | 'setor'>;
type Resposta = { ok: boolean; erro?: string; codigo?: string; operacao?: OperacaoDaProva } & Record<string, unknown>;

const COR_DO_ESTADO: Record<string, string> = { bloqueada: 'cz', liberada: 'lr', iniciada: 'az', concluida: 'vd', desconhecido: 'cz' };

const novaChave = () => (globalThis.crypto?.randomUUID?.() ?? '');

export default function ProvasDoAluno({ aluno, conversas, conversaInicial }: {
  aluno: AlunoDaAba; conversas: ConversaDaAba[]; conversaInicial?: string;
}) {
  const { perfil, usuario } = useSessao();
  const relogio = useAgora();
  const agora = horaConhecida(relogio) ? relogio : null;
  /* na demonstração e na simulação não há servidor nem portal: a aba fica como "não configurada" */
  const offline = modoDemo || !usuario;
  const [estado, setEstado] = useState<{ configurado: boolean } | null>(null);
  const [rodada, setRodada] = useState(0);
  const [lista, setLista] = useState<{ chave: string; ok: boolean; provas: ProvaNoPortal[]; atualizadoEm: string; erro: string } | null>(null);
  const [ops, setOps] = useState<OperacaoDaProva[]>([]);
  const [conversaId, setConversaId] = useState(conversaInicial || conversas[0]?.id || '');
  const [liberando, setLiberando] = useState<ProvaNoPortal | null>(null);
  const [vinculando, setVinculando] = useState(false);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [desvinculando, setDesvinculando] = useState(false);
  const papel = perfil?.papel;
  const conversa = conversas.find((c) => c.id === conversaId) || conversas[0] || null;

  async function chama(caminho: string, opcoes: { metodo?: string; corpo?: unknown } = {}): Promise<Resposta> {
    if (!usuario) return { ok: false, erro: 'Faça login de novo.' };
    try {
      const r = await fetch(caminho, {
        method: opcoes.metodo || 'GET',
        headers: { authorization: `Bearer ${await usuario.getIdToken()}`, ...(opcoes.corpo ? { 'content-type': 'application/json' } : {}) },
        body: opcoes.corpo ? JSON.stringify(opcoes.corpo) : undefined,
      });
      return (await r.json()) as Resposta;
    } catch {
      return { ok: false, erro: 'Não consegui falar com a central. Confira a internet e tente de novo.' };
    }
  }

  /* a integração está configurada? (só o sim ou não vem do servidor) */
  useEffect(() => {
    if (offline) return;
    let vivo = true;
    void chama('/api/provas/portal/estado').then((r) => { if (vivo) setEstado({ configurado: r.ok && r.configurado === true }); });
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offline, usuario]);
  const configurado = !offline && estado?.configurado === true;

  /* as provas do portal: de novo a cada "Atualizar" e quando o vínculo muda */
  const chaveDaLista = `${aluno.id}|${aluno.portalStudentId || ''}|${rodada}`;
  useEffect(() => {
    if (!configurado || !aluno.portalStudentId) return;
    let vivo = true;
    void chama(`/api/provas/portal/provas?alunoId=${encodeURIComponent(aluno.id)}`).then((r) => {
      if (!vivo) return;
      const dados = r.lista as { provas: ProvaNoPortal[]; atualizadoEm: string } | undefined;
      setLista({ chave: chaveDaLista, ok: r.ok, provas: dados?.provas || [], atualizadoEm: dados?.atualizadoEm || '', erro: r.ok ? '' : r.erro || 'Não consegui consultar o portal.' });
    });
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configurado, chaveDaLista]);
  const carregando = configurado && Boolean(aluno.portalStudentId) && lista?.chave !== chaveDaLista;

  /* o que a central já fez com as provas deste aluno, ao vivo */
  useEffect(() => (offline ? undefined : assinaFiltro('provas_portal', [{ campo: 'alunoId', op: '==', valor: aluno.id }],
    (d) => setOps(d as unknown as OperacaoDaProva[]))), [offline, aluno.id]);
  const ultimaDe = useMemo(() => {
    const m = new Map<string, OperacaoDaProva>();
    for (const o of [...ops].sort((a, b) => b.criadoEm.localeCompare(a.criadoEm))) if (!m.has(o.provaId)) m.set(o.provaId, o);
    return m;
  }, [ops]);

  async function retoma(op: OperacaoDaProva) {
    setOcupado(op.provaId);
    const r = await chama('/api/provas/portal/liberar', { metodo: 'POST', corpo: { alunoId: aluno.id, provaId: op.provaId, conversaId: op.conversaId, chave: op.id, retomar: true } });
    setOcupado(null);
    avisa(r.ok ? 'Liberação conferida com o portal' : r.erro || 'O portal ainda não confirmou.');
    setRodada((x) => x + 1);
  }

  async function reenviaMensagem(prova: ProvaNoPortal) {
    if (!conversa) return;
    setOcupado(prova.id);
    const r = await chama('/api/provas/portal/reenviar', { metodo: 'POST', corpo: { alunoId: aluno.id, provaId: prova.id, conversaId: conversa.id, chave: novaChave() } });
    setOcupado(null);
    avisa(r.ok ? 'Mensagem da prova mandada de novo' : r.erro || 'A mensagem não saiu.');
    setRodada((x) => x + 1);
  }

  async function desvincula() {
    const r = await chama('/api/provas/portal/vinculo', { metodo: 'DELETE', corpo: { alunoId: aluno.id } });
    setDesvinculando(false);
    avisa(r.ok ? 'Vínculo com o portal desfeito' : r.erro || 'Não consegui desfazer o vínculo.');
  }

  /* ---------------- sem configuração ---------------- */
  if (!configurado) {
    return (
      <div className="pp">
        <div className="pp-aviso">
          <Ic n="info" />
          <span>
            <b>{!offline && estado === null ? 'Conferindo a ligação com o portal...' : 'Ligação com o portal de provas ainda não configurada'}</b>
            {(offline || estado !== null) && (
              <>As provas ficam no portal do aluno (nexusenglish.com.br). Quando a API do portal estiver pronta e as chaves
                estiverem na Vercel, aqui aparecem as provas de {aluno.nome.split(' ')[0]}, com liberar e enviar o link pelo WhatsApp.
                {modoDemo ? ' Na demonstração não há portal ligado.' : ''}</>
            )}
          </span>
        </div>
        <button className="btn" disabled><Ic n="mais" />Vincular aluno do portal</button>
      </div>
    );
  }

  /* ---------------- sem vínculo ---------------- */
  if (!aluno.portalStudentId) {
    return (
      <div className="pp">
        {vinculando
          ? <VincularAluno aluno={aluno} chama={chama} aoFechar={() => setVinculando(false)} />
          : (
            <>
              <p className="pp-txt">{aluno.nome} ainda não está vinculado a um aluno do portal. Procure e confirme quem é: o vínculo nunca é feito só pelo nome ou pelo telefone.</p>
              {podeNoPortal(papel, 'vincular')
                ? <button className="btn p" onClick={() => setVinculando(true)}><Ic n="mais" />Vincular aluno do portal</button>
                : <p className="obs">Quem vincula é a recepção ou a gestão.</p>}
            </>
          )}
      </div>
    );
  }

  /* ---------------- vinculado ---------------- */
  const podeMandar = podeNoPortal(papel, 'liberar');
  return (
    <div className="pp">
      <div className="pp-vinculo">
        <span><small>No portal</small><b>{aluno.portalNome || aluno.nome}</b><small className="num">{aluno.portalStudentId}</small></span>
        <button className="tx-btn" disabled={carregando} onClick={() => setRodada((x) => x + 1)}>{carregando ? 'Atualizando...' : 'Atualizar'}</button>
        {podeNoPortal(papel, 'desvincular') && !desvinculando && <button className="tx-btn" onClick={() => setDesvinculando(true)}>Desvincular</button>}
      </div>
      {desvinculando && (
        <div className="pp-conf">
          <p>Desfazer o vínculo de {aluno.nome} com {aluno.portalNome || 'o aluno do portal'}? As provas e o histórico no portal não mudam; só a central deixa de saber quem é.</p>
          <div className="ln"><button className="btn perigo-claro" onClick={() => void desvincula()}>Desvincular</button><button className="tx-btn" onClick={() => setDesvinculando(false)}>Cancelar</button></div>
        </div>
      )}

      {podeMandar && (
        conversas.length ? (
          conversas.length > 1 && (
            <label className="pp-para">Mandar por
              <select className="cx" value={conversa?.id || ''} onChange={(e) => setConversaId(e.target.value)}>
                {conversas.map((c) => <option key={c.id} value={c.id}>{c.nome} · {telefoneLegivel(c.waId)}</option>)}
              </select>
            </label>
          )
        ) : <p className="obs">Este aluno ainda não tem conversa no WhatsApp com a escola: dá para consultar as provas, mas não para mandar o link.</p>
      )}

      {carregando && !lista && <p className="obs" role="status">Consultando o portal...</p>}
      {lista && !lista.ok && <p className="erro">{lista.erro}</p>}
      {lista?.ok && !lista.provas.length && <p className="obs">O portal não tem provas para este aluno ainda.</p>}

      <ul className="pp-lista">
        {(lista?.ok ? lista.provas : []).map((p) => {
          const op = ultimaDe.get(p.id) || null;
          const acoes = acoesDaProva(p, op);
          return (
            <li key={p.id} className="pp-prova">
              <div className="pp-prova-cab">
                <span className="pp-prova-tit"><b>{p.titulo}</b><small>{[p.nivel, p.modulo ? `módulo ${p.modulo}` : ''].filter(Boolean).join(' · ')}</small></span>
                <span className={`lbp lb-${COR_DO_ESTADO[p.estado]}`} title={p.estado === 'desconhecido' ? `O portal disse "${p.estadoOriginal}"` : undefined}>{NOME_DO_ESTADO[p.estado]}</span>
              </div>
              <p className="pp-prova-det">
                {p.estado === 'bloqueada' && !p.podeLiberar && (p.motivoBloqueio || 'O portal ainda não deixa liberar.')}
                {p.liberacao?.liberadaEm && `Liberada em ${dataHoraBR(p.liberacao.liberadaEm)}. `}
                {p.iniciadaEm && `Iniciada em ${dataHoraBR(p.iniciadaEm)}. `}
                {p.concluidaEm && `Concluída em ${dataHoraBR(p.concluidaEm)}. `}
                {p.resultado && `Resultado: ${p.resultado.situacao.replace(/_/g, ' ')}${typeof p.resultado.nota === 'number' ? `, nota ${p.resultado.nota}` : ''}.`}
              </p>
              {op && <AndamentoDaCentral op={op} />}
              {podeMandar && (
                <div className="pp-acoes">
                  {acoes.liberar && <button className="btn p" disabled={!conversa || ocupado === p.id} onClick={() => setLiberando(p)}><Ic n="envia" />Liberar e enviar</button>}
                  {acoes.retomar && op && <button className="btn" disabled={ocupado === p.id} onClick={() => void retoma(op)}>{ocupado === p.id ? 'Conferindo...' : 'Conferir de novo'}</button>}
                  {acoes.reenviar && <button className="btn" disabled={!conversa || ocupado === p.id} onClick={() => void reenviaMensagem(p)}>{ocupado === p.id ? 'Mandando...' : 'Reenviar mensagem'}</button>}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {lista?.ok && lista.atualizadoEm && <p className="obs">Situação do portal em {dataHoraBR(lista.atualizadoEm)}.</p>}

      {liberando && conversa && (
        <ConfirmaLiberacao aluno={aluno} prova={liberando} conversa={conversa} agora={agora} chama={chama}
                           aoFechar={() => { setLiberando(null); setRodada((x) => x + 1); }} />
      )}
    </div>
  );
}

/* ---------------- o que a central fez com a prova ---------------- */

const hhmm = (iso?: string | null) => (iso ? dataHoraBR(iso) : '');

function AndamentoDaCentral({ op }: { op: OperacaoDaProva }) {
  const l = op.liberacao;
  const texto = {
    pedida: `Liberação pedida por ${l.pedidaPor.nome} em ${hhmm(l.pedidaEm)}, esperando o portal.`,
    confirmada: `Liberada pela central: ${l.pedidaPor.nome}, ${hhmm(l.respondidaEm || l.pedidaEm)}.`,
    sem_confirmacao: `O portal não confirmou a liberação pedida por ${l.pedidaPor.nome} em ${hhmm(l.pedidaEm)}. Ela pode ter acontecido ou não; nenhuma mensagem saiu.`,
    recusada: `O portal recusou a liberação: ${l.erro || l.codigo || ''}`,
    ja_estava_liberada: 'A prova já estava liberada no portal; nada foi liberado de novo.',
    externa: 'Liberada direto no portal; a central só mandou o link.',
  }[l.estado];
  const alerta = l.estado === 'sem_confirmacao' || l.estado === 'recusada';
  return (
    <div className={`pp-andamento${alerta ? ' alerta' : ''}`}>
      <p><Ic n="check" />{texto}</p>
      {op.envios.map((e) => <LinhaDoEnvio key={e.chave} opId={op.id} envio={e} />)}
    </div>
  );
}

function LinhaDoEnvio({ opId, envio }: { opId: string; envio: OperacaoDaProva['envios'][number] }) {
  const [mensagem, setMensagem] = useState<Mensagem | null>(null);
  /* o status de entrega vem dos eventos do WhatsApp na mensagem gravada (webhook) */
  useEffect(() => (envio.mensagemId ? assinaFiltro('mensagens', [{ campo: 'provaEnvio', op: '==', valor: opId }],
    (d) => setMensagem((d as unknown as Mensagem[]).find((m) => m.id === envio.mensagemId) || null)) : undefined), [opId, envio.mensagemId]);
  const s = situacaoDaMensagem(envio, mensagem);
  const quando = s === 'lida' ? mensagem?.lidoEm : s === 'entregue' ? mensagem?.entregueEm : envio.em;
  return (
    <p className={`pp-envio ${s}`}>
      <Ic n={s === 'falhou' ? 'x' : 'envia'} />
      <span>
        Mensagem ({envio.canal === 'modelo' ? 'modelo aprovado' : 'texto'}) por {envio.por.nome}: <b>{NOME_DA_SITUACAO_DA_MENSAGEM[s]}</b>
        {quando ? `, ${dataHoraBR(quando)}` : ''}{s === 'falhou' && (envio.erro || mensagem?.falhaMotivo) ? `. ${envio.erro || mensagem?.falhaMotivo}` : ''}
      </span>
    </p>
  );
}

/* ---------------- confirmar e liberar ---------------- */

function ConfirmaLiberacao({ aluno, prova, conversa, agora, chama, aoFechar }: {
  aluno: AlunoDaAba; prova: ProvaNoPortal; conversa: ConversaDaAba; agora: Date | null;
  chama: (caminho: string, opcoes?: { metodo?: string; corpo?: unknown }) => Promise<Resposta>;
  aoFechar: () => void;
}) {
  /* uma chave por confirmação: o clique repetido, ou a rede que repete o pedido, cai na mesma liberação */
  const [chave] = useState(novaChave);
  const [indo, setIndo] = useState(false);
  const [fim, setFim] = useState<Resposta | null>(null);
  const janela = agora ? janelaAberta(conversa, agora) : false;

  async function confirma() {
    if (indo) return;
    setIndo(true);
    const r = await chama('/api/provas/portal/liberar', { metodo: 'POST', corpo: { alunoId: aluno.id, provaId: prova.id, conversaId: conversa.id, chave } });
    setFim(r);
    setIndo(false);
  }

  const op = fim?.operacao;
  return (
    <div className="mod" onMouseDown={(e) => { if (e.target === e.currentTarget && !indo) aoFechar(); }}>
      <div className="mod-c pp-mod" role="dialog" aria-modal="true" aria-label="Liberar e enviar a prova">
        <header className="pp-mod-h"><b>Liberar e enviar a prova</b><button className="ib" aria-label="Fechar" disabled={indo} onClick={aoFechar}><Ic n="x" /></button></header>
        {!fim ? (
          <>
            <dl className="pp-dl">
              <dt>Aluno</dt><dd>{aluno.nome}<small>no portal: {aluno.portalNome || aluno.portalStudentId}</small></dd>
              <dt>Prova</dt><dd>{prova.titulo}<small>{[prova.nivel, prova.modulo ? `módulo ${prova.modulo}` : ''].filter(Boolean).join(' · ')}</small></dd>
              <dt>Vai para</dt><dd>{conversa.nome}<small className="num">{telefoneLegivel(conversa.waId)}</small></dd>
              <dt>Como</dt>
              <dd>{janela ? 'Mensagem de texto com o link (janela de 24 horas aberta)' : 'Pelo modelo aprovado prova_liberada (a janela de 24 horas está fechada)'}</dd>
            </dl>
            <p className="obs">A central pede a liberação ao portal, espera a confirmação com o link e só então manda pelo WhatsApp. Liberação e envio ficam registrados com o seu nome.</p>
            <div className="ln">
              <button className="btn p" disabled={indo} onClick={() => void confirma()}><Ic n="envia" />{indo ? 'Liberando e enviando...' : 'Liberar e enviar'}</button>
              <button className="btn" disabled={indo} onClick={aoFechar}>Cancelar</button>
            </div>
          </>
        ) : (
          <>
            <p className={fim.ok ? 'pp-ok' : 'erro'}>
              {fim.ok
                ? (op?.liberacao.estado === 'confirmada' && op.envios.some((e) => e.estado === 'aceito')
                  ? 'Prova liberada no portal e mensagem aceita pelo WhatsApp. A entrega aparece na aba quando o celular confirmar.'
                  : 'Pedido registrado. Acompanhe o andamento na aba.')
                : fim.erro}
            </p>
            <div className="ln"><button className="btn p" onClick={aoFechar}>Fechar</button></div>
          </>
        )}
      </div>
    </div>
  );
}

/* ---------------- vincular ---------------- */

function VincularAluno({ aluno, chama, aoFechar }: {
  aluno: AlunoDaAba;
  chama: (caminho: string, opcoes?: { metodo?: string; corpo?: unknown }) => Promise<Resposta>;
  aoFechar: () => void;
}) {
  const [busca, setBusca] = useState(aluno.nome);
  const [achados, setAchados] = useState<AlunoNoPortal[] | null>(null);
  const [erro, setErro] = useState('');
  const [escolhido, setEscolhido] = useState<AlunoNoPortal | null>(null);
  const [confirmo, setConfirmo] = useState(false);
  const [indo, setIndo] = useState(false);

  async function procura(e: FormEvent) {
    e.preventDefault();
    setIndo(true); setErro(''); setEscolhido(null); setConfirmo(false);
    const r = await chama(`/api/provas/portal/alunos?busca=${encodeURIComponent(busca)}`);
    setIndo(false);
    if (!r.ok) { setErro(r.erro || 'Não consegui procurar no portal.'); setAchados(null); return; }
    setAchados((r.alunos as AlunoNoPortal[]) || []);
  }

  async function vincula() {
    if (!escolhido || !confirmo) return;
    setIndo(true);
    const r = await chama('/api/provas/portal/vinculo', { metodo: 'POST', corpo: { alunoId: aluno.id, portalStudentId: escolhido.id } });
    setIndo(false);
    if (!r.ok) { setErro(r.erro || 'Não consegui vincular.'); return; }
    avisa(`${aluno.nome} vinculado ao portal`);
    aoFechar();
  }

  return (
    <div className="pp-vincular">
      <form className="ln" onSubmit={(e) => void procura(e)}>
        <input className="cx" value={busca} autoFocus minLength={3} placeholder="Nome, e-mail ou código no portal" aria-label="Procurar aluno no portal" onChange={(e) => setBusca(e.target.value)} />
        <button className="btn" type="submit" disabled={indo || busca.trim().length < 3}><Ic n="busca" />Procurar</button>
      </form>
      {erro && <p className="erro">{erro}</p>}
      {achados && !achados.length && <p className="obs">Ninguém no portal com essa busca. Tente o e-mail ou o código do aluno.</p>}
      {achados && achados.length > 0 && !escolhido && (
        <ul className="pp-achados">
          {achados.map((a) => (
            <li key={a.id}>
              <button onClick={() => { setEscolhido(a); setConfirmo(false); }}>
                <b>{a.nome}</b>
                <small>{[a.turma, a.nivel, a.emailMascarado, a.telefoneFinal ? `tel. final ${a.telefoneFinal}` : '', a.ativo ? '' : 'inativo no portal'].filter(Boolean).join(' · ')}</small>
              </button>
            </li>
          ))}
        </ul>
      )}
      {escolhido && (
        <div className="pp-conf">
          <dl className="pp-dl">
            <dt>Na central</dt><dd>{aluno.nome}</dd>
            <dt>No portal</dt><dd>{escolhido.nome}<small>{[escolhido.turma, escolhido.emailMascarado, escolhido.telefoneFinal ? `tel. final ${escolhido.telefoneFinal}` : '', escolhido.id].filter(Boolean).join(' · ')}</small></dd>
          </dl>
          <label className="lig"><input type="checkbox" checked={confirmo} onChange={(e) => setConfirmo(e.target.checked)} /><span><b>Confirmo que é a mesma pessoa</b>Conferi a turma, o e-mail ou o telefone, não só o nome.</span></label>
          <div className="ln">
            <button className="btn p" disabled={!confirmo || indo} onClick={() => void vincula()}>{indo ? 'Vinculando...' : 'Vincular'}</button>
            <button className="tx-btn" onClick={() => setEscolhido(null)}>Escolher outro</button>
          </div>
        </div>
      )}
      <button className="tx-btn" onClick={aoFechar}>Cancelar</button>
    </div>
  );
}
