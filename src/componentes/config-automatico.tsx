'use client';
/* Configurações do atendimento automático: saudação e botões, o jeito de falar da
   escola, os tempos do follow-up, o assistente do financeiro e contrato, o aviso aos
   coordenadores, e a área para testar a IA antes de ligar.
   Os campos editam um rascunho; nada vale até "Salvar alterações". A chave mestra
   salva na hora, porque é ela que liga e desliga tudo. */
import { useEffect, useMemo, useState } from 'react';
import { assina, define, modoDemo } from '@/lib/dados/fonte';
import { avisa } from '@/componentes/aviso';
import { NOME_SETOR } from '@/lib/dominio/acessos';
import {
  LIMITE, leAutomatico, type ConfigAutomatico, type Destino, type Momento,
} from '@/lib/dominio/automatico';
import { corta } from '@/lib/dominio/formato';
import type { Conversa, Perfil } from '@/lib/dominio/tipos';

type Chama = (caminho: string, corpo?: unknown) => Promise<Record<string, unknown>>;

const MOMENTOS: { k: Momento; r: string }[] = [
  { k: 'followup', r: '1º follow-up' },
  { k: 'encerramento', r: 'encerramento por falta de resposta' },
  { k: 'despedida', r: 'despedida de quem já resolveu' },
  { k: 'saudacao', r: 'saudação com os botões' },
  { k: 'encaminha', r: 'aviso de que vai para a Recepção' },
];

const SITUACAO: Record<string, string> = {
  pendente: 'ficou algo esperando o contato',
  resolvida: 'já resolveu',
  aluno_esperando: 'quem espera é o contato: nada sai',
};

export default function AtendimentoAutomatico({ salva, podeMexer, chama, perfis }: {
  salva: ConfigAutomatico; podeMexer: boolean; chama: Chama; perfis: Perfil[];
}) {
  const [base, setBase] = useState(salva);
  const [rasc, setRasc] = useState(salva);
  const mudou = JSON.stringify(rasc) !== JSON.stringify(base);
  /* chegou versão nova do banco e ninguém está editando: a tela acompanha */
  if (JSON.stringify(salva) !== JSON.stringify(base) && !mudou) {
    setBase(salva);
    setRasc(salva);
  }

  const muda = <K extends keyof ConfigAutomatico>(k: K, v: ConfigAutomatico[K]) => setRasc((r) => ({ ...r, [k]: v }));
  const bloqueia = !podeMexer;

  async function salvar() {
    const limpa = leAutomatico({ ...rasc, ligado: salva.ligado });
    await define('config', 'automatico', { ...limpa });
    setBase(limpa); setRasc(limpa);
    avisa('Atendimento automático salvo');
  }

  async function chave(ligado: boolean) {
    await define('config', 'automatico', { ...leAutomatico(base), ligado });
    avisa(ligado ? 'Atendimento automático ligado' : 'Atendimento automático desligado');
  }

  return (
    <>
      <section className="bl" id="automatico">
        <p className="bt">Atendimento automático</p>
        <div className="frm">
          <label className="lig">
            <input type="checkbox" checked={salva.ligado} disabled={bloqueia}
                   onChange={(e) => void chave(e.target.checked)} />
            <span>
              <b>{salva.ligado ? 'Ligado' : 'Desligado'}</b>
              Ligado, quem escreve recebe a saudação com os botões, o assistente responde
              financeiro e contrato, e quem some recebe o follow-up e o encerramento.
              Desligado, nada responde sozinho e tudo funciona como antes. Teste a IA aqui
              embaixo antes de ligar.
            </span>
          </label>
          {salva.ligado && modoDemo && (
            <p className="obs">Na demonstração não há WhatsApp: a chave fica guardada, mas nada é enviado.</p>
          )}
        </div>
      </section>

      <fieldset className="cfg-grupo" disabled={bloqueia}>
        <Saudacao rasc={rasc} muda={muda} />
        <Tom rasc={rasc} muda={muda} />
        <Tempos rasc={rasc} muda={muda} />
        <Assistente rasc={rasc} muda={muda} setRasc={setRasc} />
        <Aviso rasc={rasc} muda={muda} perfis={perfis} />
      </fieldset>

      {podeMexer && <Testar rasc={rasc} chama={chama} />}

      {mudou && podeMexer && (
        <div className="salvar-barra" role="region" aria-label="Alterações do atendimento automático">
          <span>Alterações no atendimento automático ainda não salvas.</span>
          <button className="btn" onClick={() => setRasc(base)}>Descartar</button>
          <button className="btn p" onClick={() => void salvar()}>Salvar alterações</button>
        </div>
      )}
    </>
  );
}

type Muda = <K extends keyof ConfigAutomatico>(k: K, v: ConfigAutomatico[K]) => void;

function Contador({ n, max }: { n: number; max: number }) {
  return <span className={n > max ? 'cont atr num' : 'cont num'}>{n}/{max}</span>;
}

function Texto({ id, rotulo, valor, aoMudar, linhas, ajuda }: {
  id: string; rotulo: string; valor: string; aoMudar: (v: string) => void; linhas?: number; ajuda?: string;
}) {
  return (
    <div>
      <label htmlFor={id}>{rotulo}</label>
      {linhas
        ? <textarea id={id} className="cx" rows={linhas} value={valor} onChange={(e) => aoMudar(e.target.value)} />
        : <input id={id} className="cx" value={valor} onChange={(e) => aoMudar(e.target.value)} />}
      {ajuda && <p className="obs">{ajuda}</p>}
    </div>
  );
}

function Minutos({ id, antes, depois, valor, min, max, aoMudar }: {
  id: string; antes: string; depois: string; valor: number; min: number; max: number; aoMudar: (n: number) => void;
}) {
  return (
    <div className="ln minutos">
      <label htmlFor={id}>{antes}</label>
      <input id={id} className="cx num" type="number" min={min} max={max} value={valor}
             onChange={(e) => aoMudar(Number(e.target.value))} />
      <span className="obs">{depois}</span>
    </div>
  );
}

/* ---------------- saudação e botões ---------------- */
function Saudacao({ rasc, muda }: { rasc: ConfigAutomatico; muda: Muda }) {
  const mudaBotao = (i: number, campo: 'texto' | 'destino', v: string) =>
    muda('botoes', rasc.botoes.map((b, j) => (j === i ? { ...b, [campo]: v } : b)));
  return (
    <section className="bl">
      <p className="bt">Saudação e botões</p>
      <div className="frm">
        <p className="obs forte">
          O WhatsApp aceita no máximo 3 botões, com até 20 letras cada. A Coordenação não
          aparece como destino de propósito: ela só recebe conversa por dentro do sistema.
          &quot;Mostra a próxima aula&quot; lê a agenda do aluno e manda o dia e a hora com os botões
          Confirmar presença, Remarcar e Falar com a recepção; sem aula marcada, vai para a Recepção.
        </p>
        <div className="bt-linhas">
          {rasc.botoes.map((b, i) => (
            <div key={i} className="bt-linha">
              <span className="num obs">{i + 1}</span>
              <span className="ln" style={{ margin: 0 }}>
                <input className="cx" aria-label={`Texto do botão ${i + 1}`} maxLength={LIMITE.botao}
                       value={b.texto} onChange={(e) => mudaBotao(i, 'texto', e.target.value)} />
                <Contador n={b.texto.length} max={LIMITE.botao} />
              </span>
              <select className="cx" aria-label={`Destino do botão ${i + 1}`} value={b.destino}
                      onChange={(e) => mudaBotao(i, 'destino', e.target.value as Destino)}>
                <option value="aulas">mostra a próxima aula</option>
                <option value="recepcao">vai para a Recepção</option>
                <option value="assistente">vai para o assistente</option>
              </select>
            </div>
          ))}
        </div>
        <label className="lig">
          <input type="checkbox" checked={rasc.pulaMenu} onChange={(e) => muda('pulaMenu', e.target.checked)} />
          <span>
            <b>Pular o menu quando o assunto já está claro</b>
            Se a primeira mensagem já diz o assunto com sinal forte (boleto, reposição,
            cancelamento), a conversa vai direto para o lugar certo, sem perguntar de novo.
          </span>
        </label>
        <Texto id="au-saud" rotulo="O que a saudação precisa fazer (instrução para a IA)" linhas={3}
               valor={rasc.saudInstrucao} aoMudar={(v) => muda('saudInstrucao', v)} />
        <Texto id="au-saudr" rotulo="Texto de reserva da saudação" valor={rasc.saudReserva}
               aoMudar={(v) => muda('saudReserva', v)} ajuda="Sai quando a IA está fora do ar. {primeiro_nome} vira o nome do contato." />
        <Texto id="au-denovo" rotulo="Quando o contato digita e não dá para entender, o menu volta com" valor={rasc.menuDeNovo}
               aoMudar={(v) => muda('menuDeNovo', v)} ajuda="Na segunda vez sem dar para entender, a conversa vai para a Recepção." />
        <Texto id="au-enc" rotulo="Texto de reserva do aviso de que vai para a Recepção" valor={rasc.encaminhaReserva}
               aoMudar={(v) => muda('encaminhaReserva', v)} />
      </div>
    </section>
  );
}

/* ---------------- jeito de falar ---------------- */
function Tom({ rasc, muda }: { rasc: ConfigAutomatico; muda: Muda }) {
  return (
    <section className="bl">
      <p className="bt">Jeito de falar da Nexus</p>
      <div className="frm">
        <p className="obs forte">
          Vale para a saudação, os follow-ups, a despedida e o assistente. É daqui que a IA
          tira o tom da escola, então quanto mais parecido com a recepção de verdade, melhor.
        </p>
        <Texto id="au-tom" rotulo="O tom, com as palavras de vocês" linhas={4} valor={rasc.tom} aoMudar={(v) => muda('tom', v)} />
        <Texto id="au-ex" rotulo="Mensagens reais que a recepção mandou e vocês gostaram" linhas={5} valor={rasc.exemplos}
               aoMudar={(v) => muda('exemplos', v)} ajuda="Uma por linha. São elas que ensinam o jeito da escola." />
        <Texto id="au-nunca" rotulo="O que nunca dizer" linhas={3} valor={rasc.nunca} aoMudar={(v) => muda('nunca', v)} />
      </div>
    </section>
  );
}

/* ---------------- tempos ---------------- */
function Tempos({ rasc, muda }: { rasc: ConfigAutomatico; muda: Muda }) {
  return (
    <section className="bl">
      <p className="bt">Tempos e follow-ups</p>
      <div className="frm">
        <p className="obs forte">
          O relógio só corre quando a última fala que espera resposta é da escola. Se quem
          espera é o contato, nada se encerra: quem avisa o time é o tempo de aguardo vermelho.
        </p>
        <Minutos id="au-fu1" antes="1º follow-up depois de" depois="minutos sem resposta do contato"
                 valor={rasc.fu1Min} min={1} max={600} aoMudar={(n) => muda('fu1Min', n)} />
        <Texto id="au-fu1i" rotulo="O que o 1º follow-up precisa fazer (instrução para a IA)" linhas={3}
               valor={rasc.fu1Instrucao} aoMudar={(v) => muda('fu1Instrucao', v)} />
        <Texto id="au-fu1r" rotulo="Texto de reserva do 1º follow-up" valor={rasc.fu1Reserva} aoMudar={(v) => muda('fu1Reserva', v)} />
        <Minutos id="au-encm" antes="Encerra depois de" depois="minutos sem resposta, com o 2º follow-up"
                 valor={rasc.encMin} min={2} max={1440} aoMudar={(n) => muda('encMin', n)} />
        <Texto id="au-enci" rotulo="O que a despedida por falta de resposta precisa fazer (instrução para a IA)" linhas={3}
               valor={rasc.encInstrucao} aoMudar={(v) => muda('encInstrucao', v)} />
        <Texto id="au-encr" rotulo="Texto de reserva do encerramento" valor={rasc.encReserva} aoMudar={(v) => muda('encReserva', v)} />
        <div>
          <label htmlFor="au-resol">Quando a conversa já se resolveu (&quot;valeu, obrigada!&quot;)</label>
          <select id="au-resol" className="cx" value={rasc.resolvida}
                  onChange={(e) => muda('resolvida', e.target.value === 'nada' ? 'nada' : 'despedida')}>
            <option value="despedida">manda uma despedida curta e encerra</option>
            <option value="nada">encerra sem mandar nada</option>
          </select>
        </div>
        <Texto id="au-desp" rotulo="Texto de reserva da despedida" valor={rasc.despedidaReserva} aoMudar={(v) => muda('despedidaReserva', v)} />
        <label className="lig">
          <input type="checkbox" checked={rasc.manualDespedida} onChange={(e) => muda('manualDespedida', e.target.checked)} />
          <span>
            <b>Ao encerrar na mão, mandar uma despedida</b>
            Quem está atendendo toca em &quot;Encerrar atendimento&quot; no topo da conversa; antes de
            encerrar, sai uma despedida curta escrita pela IA.
          </span>
        </label>
        <Minutos id="au-volta" antes="Setor que não respondeu devolve a conversa para a Recepção depois de" depois="horas"
                 valor={rasc.voltaHoras} min={1} max={72} aoMudar={(n) => muda('voltaHoras', n)} />
      </div>
    </section>
  );
}

/* ---------------- assistente ---------------- */
function Assistente({ rasc, muda, setRasc }: {
  rasc: ConfigAutomatico; muda: Muda; setRasc: (f: (r: ConfigAutomatico) => ConfigAutomatico) => void;
}) {
  const mudaPergunta = (i: number, campo: 't' | 'r', v: string) =>
    setRasc((r) => ({ ...r, faq: r.faq.map((q, j) => (j === i ? { ...q, [campo]: v } : q)) }));
  return (
    <section className="bl">
      <p className="bt">Assistente do financeiro e contrato</p>
      <div className="frm">
        <p className="obs forte">
          Vocês escrevem uma vez as perguntas que se repetem. No modo botões, elas viram uma
          lista para o contato escolher; no modo IA, são a única fonte do que o assistente
          pode afirmar. Pergunta sem resposta escrita passa para uma pessoa.
        </p>
        <div className="esc" style={{ padding: 0 }} role="radiogroup" aria-label="Modo do assistente">
          <button type="button" className="chip" aria-pressed={rasc.modo === 'botoes'} onClick={() => muda('modo', 'botoes')}>
            Botões<span className="num">lista de perguntas</span>
          </button>
          <button type="button" className="chip" aria-pressed={rasc.modo === 'ia'} onClick={() => muda('modo', 'ia')}>
            IA<span className="num">o contato escreve do jeito dele</span>
          </button>
        </div>
        <div>
          <label htmlFor="au-passa">Quando não resolve, passa para</label>
          <select id="au-passa" className="cx" value={rasc.passaPara}
                  onChange={(e) => muda('passaPara', e.target.value === 'recepcao' ? 'recepcao' : 'financeiro')}>
            <option value="financeiro">uma pessoa do Financeiro</option>
            <option value="recepcao">a Recepção</option>
          </select>
        </div>
        <Texto id="au-quando" rotulo="Quando passar para uma pessoa" linhas={3} valor={rasc.passaQuando} aoMudar={(v) => muda('passaQuando', v)} />
        <Texto id="au-prompt" rotulo="Como o assistente se comporta" linhas={4} valor={rasc.prompt} aoMudar={(v) => muda('prompt', v)} />
        <div>
          <span className="obs" style={{ padding: 0, display: 'block', marginBottom: 6 }}>
            Perguntas e respostas ({rasc.faq.length} de {LIMITE.perguntas}). &quot;Falar com uma pessoa&quot; sempre aparece no fim da lista.
          </span>
          <div className="faq">
            {rasc.faq.map((q, i) => (
              <div key={i} className="faq-it">
                <span className="ln" style={{ margin: 0 }}>
                  <input className="cx" aria-label={`Pergunta ${i + 1}`} maxLength={LIMITE.linha} value={q.t}
                         onChange={(e) => mudaPergunta(i, 't', e.target.value)} />
                  <Contador n={q.t.length} max={LIMITE.linha} />
                  <button type="button" className="ib" title="Tirar esta pergunta" aria-label={`Tirar a pergunta ${i + 1}`}
                          onClick={() => muda('faq', rasc.faq.filter((_, j) => j !== i))}>×</button>
                </span>
                <textarea className="cx" rows={2} aria-label={`Resposta da pergunta ${i + 1}`} value={q.r}
                          placeholder="Escreva a resposta da escola. Sem resposta, o assistente passa para uma pessoa."
                          onChange={(e) => mudaPergunta(i, 'r', e.target.value)} />
              </div>
            ))}
          </div>
          {rasc.faq.length < LIMITE.perguntas && (
            <button type="button" className="btn" style={{ marginTop: 8 }}
                    onClick={() => muda('faq', [...rasc.faq, { t: '', r: '' }])}>Acrescentar pergunta</button>
          )}
        </div>
      </div>
    </section>
  );
}

/* ---------------- aviso aos coordenadores ---------------- */
function Aviso({ rasc, muda, perfis }: { rasc: ConfigAutomatico; muda: Muda; perfis: Perfil[] }) {
  const quem = perfis.filter((p) => p.ativo && (p.setores.includes('coordenacao') || p.setores.includes('kids')));
  return (
    <section className="bl">
      <p className="bt">Aviso aos coordenadores</p>
      <div className="frm">
        <label className="lig">
          <input type="checkbox" checked={rasc.avisoLigado} onChange={(e) => muda('avisoLigado', e.target.checked)} />
          <span>
            <b>Mandar o aviso no celular pessoal</b>
            Quando alguém passa a conversa para a Coordenação ou a Coordenação Kids, quem é
            daquele setor recebe um modelo aprovado com o botão que abre a conversa no sistema.
            Ligue só depois que a Meta aprovar o modelo. É a única mensagem paga do fluxo.
          </span>
        </label>
        <div className="ln">
          <input className="cx" aria-label="Nome do modelo aprovado" value={rasc.avisoModelo} onChange={(e) => muda('avisoModelo', e.target.value)} />
          <input className="cx" aria-label="Idioma do modelo" value={rasc.avisoIdioma} style={{ flex: '0 0 90px' }}
                 onChange={(e) => muda('avisoIdioma', e.target.value)} />
        </div>
        <p className="modelo">
          Oi, <code>{'{{1}}'}</code>! Chegou uma conversa para a <code>{'{{2}}'}</code> no sistema da Nexus: <code>{'{{3}}'}</code>. Responda pelo sistema.
          {'\n'}[botão de link: abrir conversa → /conversas?conversa=<code>{'{{1}}'}</code>]
        </p>
        <div>
          <span className="obs" style={{ padding: 0 }}>Quem recebe (Equipe: setor da coordenação e &quot;avisar no WhatsApp&quot; marcado)</span>
          {quem.length ? (
            <ul className="quem-avisa">
              {quem.map((p) => (
                <li key={p.id}>
                  <b>{p.nome}</b>{' '}
                  <span className="obs" style={{ padding: 0 }}>
                    {p.setores.filter((s) => s === 'coordenacao' || s === 'kids').map((s) => NOME_SETOR[s]).join(', ')}
                    {p.avisaNoWhats && p.telefone ? ', recebe o aviso' : ', sem telefone ou sem o aviso marcado'}
                  </span>
                </li>
              ))}
            </ul>
          ) : <p className="obs">Ninguém da equipe está nos setores da coordenação ainda.</p>}
        </div>
      </div>
    </section>
  );
}

/* ---------------- testar ---------------- */
interface Leitura { situacao: string; pendencia: string; mensagem: string }
interface RespostaAssistente { acao: string; mensagem: string; resumo: string }

function Testar({ rasc, chama }: { rasc: ConfigAutomatico; chama: Chama }) {
  const [conversas, setConversas] = useState<Conversa[]>([]);
  const [conversaId, setConversaId] = useState('');
  const [momento, setMomento] = useState<Momento>('followup');
  const [gerando, setGerando] = useState(false);
  const [leitura, setLeitura] = useState<Leitura | null>(null);
  const [reserva, setReserva] = useState('');
  const [erro, setErro] = useState('');
  const [turnos, setTurnos] = useState<{ de: 'aluno' | 'escola'; texto: string; passou?: string }[]>([]);
  const [escrito, setEscrito] = useState('');

  useEffect(() => assina('conversas', (docs) => {
    setConversas((docs as unknown as Conversa[]).slice()
      .sort((a, b) => (b.ultimaEm || '').localeCompare(a.ultimaEm || '')).slice(0, 40));
  }), []);
  const escolhida = useMemo(() => conversas.find((c) => c.id === conversaId), [conversas, conversaId]);

  if (modoDemo) {
    return (
      <section className="bl">
        <p className="bt">Testar a IA</p>
        <p className="vz">A IA roda no servidor, e a demonstração não tem servidor. Para ver como ela escreve, use o simulador.</p>
      </section>
    );
  }

  async function gera() {
    if (!conversaId) { setErro('Escolha uma conversa.'); return; }
    setGerando(true); setErro(''); setLeitura(null);
    try {
      const r = await chama('/api/automatico/testar', { tipo: 'mensagem', momento, conversaId, config: rasc });
      if (!r.ok) { setErro(String(r.erro || 'Não consegui gerar agora.')); return; }
      setLeitura(r.leitura as Leitura); setReserva(String(r.reserva || ''));
    } catch {
      setErro('Não consegui falar com o servidor.');
    } finally {
      setGerando(false);
    }
  }

  async function pergunta() {
    const t = escrito.trim();
    if (!t) return;
    const novos = [...turnos, { de: 'aluno' as const, texto: t }];
    setTurnos(novos); setEscrito(''); setGerando(true); setErro('');
    try {
      const r = await chama('/api/automatico/testar', {
        tipo: 'assistente', config: rasc, nome: 'Aluno de teste', linhas: novos.map(({ de, texto }) => ({ de, texto })),
      });
      if (!r.ok) { setErro(String(r.erro || 'Não consegui gerar agora.')); setTurnos(turnos); setEscrito(t); return; }
      const resp = r.resposta as RespostaAssistente;
      setTurnos([...novos, { de: 'escola', texto: resp.mensagem, passou: resp.acao === 'passar' ? resp.resumo || 'sem resumo' : undefined }]);
    } catch {
      setErro('Não consegui falar com o servidor.'); setTurnos(turnos); setEscrito(t);
    } finally {
      setGerando(false);
    }
  }

  return (
    <section className="bl">
      <p className="bt">Testar a IA <span className="num">nada é enviado</span></p>
      <div className="frm">
        <p className="obs forte">
          Usa o que está nesta tela, mesmo antes de salvar. Ajuste o jeito de falar e gere de
          novo até ficar com a cara da escola.
        </p>
        <div className="ln">
          <select className="cx" aria-label="Conversa para testar" value={conversaId} onChange={(e) => setConversaId(e.target.value)}>
            <option value="">escolha uma conversa</option>
            {conversas.map((c) => <option key={c.id} value={c.id}>{c.nome}: {corta(c.ultimaPreviaTexto || '', 40)}</option>)}
          </select>
          <select className="cx" aria-label="O que gerar" value={momento} onChange={(e) => setMomento(e.target.value as Momento)}>
            {MOMENTOS.map((m) => <option key={m.k} value={m.k}>{m.r}</option>)}
          </select>
          <button className="btn p" disabled={gerando || !conversaId} onClick={() => void gera()}>
            {gerando ? 'Gerando...' : 'Gerar sem enviar'}
          </button>
        </div>
        {leitura && (
          <div className="teste-res">
            <p><b>{escolhida?.nome || 'Contato'}</b> <span className="obs" style={{ padding: 0 }}>{SITUACAO[leitura.situacao] || leitura.situacao}</span></p>
            {leitura.pendencia && <p className="obs" style={{ padding: 0 }}>O que ficou: {leitura.pendencia}</p>}
            <p className="balao-teste">{leitura.mensagem || '(não manda nada)'}</p>
            <p className="obs" style={{ padding: 0 }}>Se a IA cair, sai: {reserva}</p>
          </div>
        )}

        <div className="teste-chat">
          <span className="obs" style={{ padding: 0 }}>Conversar com o assistente como se fosse aluno</span>
          {turnos.map((t, i) => (
            <div key={i} className={t.de === 'aluno' ? 'tc aluno' : 'tc escola'}>
              <p>{t.texto}</p>
              {t.passou && <p className="obs" style={{ padding: 0 }}>Passaria para gente. Resumo: {t.passou}</p>}
            </div>
          ))}
          <form className="ln" onSubmit={(e) => { e.preventDefault(); void pergunta(); }}>
            <input className="cx" aria-label="Mensagem do aluno" placeholder="ex.: como faço pra trancar o curso?"
                   value={escrito} onChange={(e) => setEscrito(e.target.value)} />
            <button className="btn" type="submit" disabled={gerando || !escrito.trim()}>Perguntar</button>
            {turnos.length > 0 && <button className="btn" type="button" onClick={() => setTurnos([])}>Recomeçar</button>}
          </form>
        </div>
        {erro && <p className="erro">{erro}</p>}
      </div>
    </section>
  );
}
