'use client';
/* Configurações: o que a escola muda sem precisar de mim.
   So entra aqui botao que faz alguma coisa de verdade. O que ainda nao existe fica
   de fora, porque interruptor que nao liga nada ensina o time a nao confiar na tela. */
import { useEffect, useMemo, useState } from 'react';
import { assina, atualiza, define, modoDemo, modoSimulacao } from '@/lib/dados/fonte';
import { entraNaSimulacao, saiDaSimulacao } from '@/lib/dados/simulacao';
import { useSessao, useTema, type Tema } from '@/componentes/sessao';
import { avisa } from '@/componentes/aviso';
import { Ic } from '@/componentes/icones';
import { ehGestao, NOME_PAPEL, NOME_SETOR, SETORES } from '@/lib/dominio/acessos';
import { leAtendimento, type ConfigDoAtendimento } from '@/lib/dominio/config';
import { ASSINATURA_MAXIMO, nomeDaAssinatura } from '@/lib/dominio/assinatura';
import { leAutomatico, type ConfigAutomatico } from '@/lib/dominio/automatico';
import AtendimentoAutomatico from '@/componentes/config-automatico';
import { SaudeDoSistema } from '@/componentes/saude';
import { ModelosDeMensagem } from '@/componentes/modelos';
import { AvisosNoAparelho } from '@/componentes/avisos';
import SeuBoneco from '@/componentes/seu-boneco';
import {
  useAnimacao, useCorDoMenu, useLarguraDoMenu, type CorDoMenu, type LarguraDoMenu,
} from '@/componentes/preferencias';
import { dataBR, telefoneLegivel } from '@/lib/dominio/formato';
import type { Papel, Perfil, Setor } from '@/lib/dominio/tipos';

interface Conferencia {
  chave: string; titulo: string; estado: 'ok' | 'falta' | 'erro' | 'aviso';
  detalhe: string; conserto?: string;
}

const PAPEIS: Papel[] = ['admin', 'gestor', 'recepcao', 'coordenacao', 'professor'];
/* o que cada papel vê, em uma frase, para quem cria o login saber o que está dando */
const OQUEVE: Record<Papel, string> = {
  admin: 'Vê e mexe em tudo, inclusive configurações e equipe.',
  gestor: 'Vê e mexe em tudo da operação, inclusive configurações e equipe.',
  recepcao: 'Vê todas as conversas, a agenda inteira, alunos, quadros e relatórios.',
  coordenacao: 'Vê só as conversas dos setores marcados, e a agenda inteira, alunos e quadros.',
  professor: 'Vê só a agenda, e nela só as aulas dele; lança status e presença. Não vê conversas.',
};

export default function Configuracoes() {
  const { perfil, usuario, sair } = useSessao();
  const { tema, setTema } = useTema();
  const gestao = perfil ? ehGestao(perfil.papel) : false;

  const [configs, setConfigs] = useState<Record<string, unknown>[]>([]);
  const [perfis, setPerfis] = useState<Perfil[]>([]);

  useEffect(() => assina('config', (d) => setConfigs(d as Record<string, unknown>[])), []);
  useEffect(() => assina('perfis', (d) => setPerfis(d as unknown as Perfil[])), []);

  const atendimento = useMemo(() => {
    const doc = configs.find((c) => c.id === 'atendimento');
    return leAtendimento(doc as Parameters<typeof leAtendimento>[0]);
  }, [configs]);

  const automatico = useMemo(() => {
    const doc = configs.find((c) => c.id === 'automatico');
    return leAutomatico(doc as Partial<ConfigAutomatico> | undefined);
  }, [configs]);

  async function salvaAtendimento(campos: Partial<typeof atendimento>) {
    await define('config', 'atendimento', { ...atendimento, ...campos });
    avisa('Configuração salva');
  }

  async function chama(caminho: string, corpo?: unknown) {
    if (!usuario) throw new Error('sem login');
    const token = await usuario.getIdToken();
    const r = await fetch(caminho, {
      method: corpo ? 'POST' : 'GET',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      ...(corpo ? { body: JSON.stringify(corpo) } : {}),
    });
    return (await r.json()) as Record<string, unknown>;
  }

  return (
    <div className="cfg">
      <header className="cfg-h">
        <h1>Configurações</h1>
        <p>O que a escola muda sozinha, sem precisar de mim.</p>
      </header>

      {perfil && (
        <ModoSimulacao nome={perfil.nome} gestao={gestao} liberada={atendimento.simulacaoLiberada}
                       aoMudar={(v) => void salvaAtendimento({ simulacaoLiberada: v })} />
      )}

      {perfil && !modoDemo && <SuaConta nome={perfil.nome} email={perfil.email} papel={NOME_PAPEL[perfil.papel]} aoSair={() => void sair()} />}
      <Atendimento valor={atendimento} podeMexer={gestao} aoSalvar={salvaAtendimento} />
      {perfil && <SuaAssinatura perfil={perfil} ligada={atendimento.assinarMensagens} />}
      {perfil && <SeuBoneco key={perfil.id} perfil={perfil} />}
      <AtendimentoAutomatico salva={automatico} podeMexer={gestao} chama={chama} perfis={perfis} />
      <ModelosDeMensagem gestao={gestao} chama={chama} />
      <Aparencia tema={tema} setTema={setTema} />
      <AvisosNoAparelho gestao={gestao} />
      {gestao && <Equipe perfis={perfis} eu={perfil} chama={chama} />}
      {gestao && <SaudeDoSistema />}
      {gestao && <WhatsApp chama={chama} />}
      {!gestao && (
        <section className="bl">
          <p className="bt">Equipe e WhatsApp</p>
          <p className="vz">Quem monta a equipe e liga o WhatsApp é a administração.</p>
        </section>
      )}
    </div>
  );
}

/* ================= sua conta (26/11/2026: "opção de sair da conta") ================= */
function SuaConta({ nome, email, papel, aoSair }: { nome: string; email: string; papel: string; aoSair: () => void }) {
  return (
    <section className="bl">
      <p className="bt">Sua conta</p>
      <div className="lin">
        <Ic n="pessoas" />
        <span className="co">
          <b>{nome}</b>
          <small>{papel}{email ? `, ${email}` : ''}</small>
        </span>
        <button type="button" className="btn" onClick={aoSair}><Ic n="sair" />Sair da conta</button>
      </div>
      <p className="vz">
        O login vale só enquanto a aba está aberta. Quem marcou Continuar conectado na
        entrada fica entrando direto neste aparelho até tocar em Sair da conta.
      </p>
    </section>
  );
}

/* ================= modo simulação ================= */
function ModoSimulacao({ nome, gestao, liberada, aoMudar }: {
  nome: string; gestao: boolean; liberada: boolean; aoMudar: (v: boolean) => void;
}) {
  const [erro, setErro] = useState('');
  if (modoSimulacao) {
    return (
      <section className="bl" id="simulacao">
        <p className="bt">Modo simulação</p>
        <div className="frm">
          <p>Você está no modo simulação: tudo o que aparece é fictício, e nada vai para o WhatsApp nem para o banco.</p>
          <div className="ln"><button type="button" className="btn p" onClick={saiDaSimulacao}>Sair da simulação</button></div>
        </div>
      </section>
    );
  }
  /* a demonstração sem banco já é toda fictícia; e sem liberação, só a gestão vê */
  if (modoDemo || (!liberada && !gestao)) return null;
  return (
    <section className="bl" id="simulacao">
      <p className="bt">Modo simulação</p>
      <div className="frm">
        <p className="obs forte">
          Para mostrar à equipe como o sistema funciona. Abre conversas, quadros, alunos, agenda e relatórios
          fictícios neste aparelho: dá para transferir de setor, encerrar, mexer na agenda e na planilha à vontade.
          Nada vai para o WhatsApp nem para o banco, e não sobra nada para apagar depois. Para voltar, toque em
          Sair da simulação, na faixa do topo.
        </p>
        {liberada && (
          <div className="ln">
            <button type="button" className="btn p" onClick={() => {
              if (!entraNaSimulacao(nome)) setErro('Este navegador não deixou guardar a escolha (janela anônima?). Abra numa janela normal e tente de novo.');
            }}>Entrar no modo simulação</button>
          </div>
        )}
        {erro && <p className="erro">{erro}</p>}
        {gestao && (
          <label className="lig">
            <input type="checkbox" checked={liberada} onChange={(e) => aoMudar(e.target.checked)} />
            <span>
              <b>Mostrar o modo simulação para a equipe</b>
              Desligado, o botão some das Configurações de todo mundo. Quem estiver dentro da simulação
              sai pela faixa do topo.
            </span>
          </label>
        )}
      </div>
    </section>
  );
}

/* ================= atendimento ================= */
function Atendimento({ valor, podeMexer, aoSalvar }: {
  valor: ConfigDoAtendimento;
  podeMexer: boolean;
  aoSalvar: (c: Partial<ConfigDoAtendimento>) => Promise<void>;
}) {
  const [minutos, setMinutos] = useState(String(valor.minutosDeAguardo));
  const [textoPassa, setTextoPassa] = useState(valor.textoAoPassar);
  return (
    <section className="bl">
      <p className="bt">Atendimento</p>
      <div className="frm">
        <label className="lig">
          <input type="checkbox" checked={valor.abreTarefaNaTriagem} disabled={!podeMexer}
                 onChange={(e) => void aoSalvar({ abreTarefaNaTriagem: e.target.checked })} />
          <span>
            <b>A triagem abre a tarefa no quadro</b>
            Quando a mensagem que chega tem assunto claro (cancelamento, boleto, prova),
            o sistema abre um cartão no quadro daquele setor e deixa o recado na conversa.
            Assunto duvidoso não abre nada, e cada conversa só tem uma tarefa aberta.
            A triagem nunca responde o contato.
          </span>
        </label>
        <label className="lig">
          <input type="checkbox" checked={valor.assinarMensagens} disabled={!podeMexer}
                 onChange={(e) => void aoSalvar({ assinarMensagens: e.target.checked })} />
          <span>
            <b>Assinar as mensagens com o nome de quem envia</b>
            A mensagem sai no WhatsApp com o nome da pessoa em negrito em cima, e o aluno
            sabe com quem está falando. Vale para texto, legenda de foto e documento e
            mensagem programada. Modelo aprovado sai sem assinatura, do jeito que a Meta aprovou.
          </span>
        </label>
        <label className="lig">
          <input type="checkbox" checked={valor.avisaAoPassar} disabled={!podeMexer}
                 onChange={(e) => void aoSalvar({ avisaAoPassar: e.target.checked })} />
          <span>
            <b>Avisar o contato ao passar a conversa para outro setor</b>
            Sai uma mensagem curta dizendo para onde a conversa foi. Fora do horário, ela diz
            também quando a equipe volta. Só sai com a janela de 24 horas aberta.
          </span>
        </label>
        {valor.avisaAoPassar && (
          <div>
            <label htmlFor="cfg-passa">Mensagem ao passar a conversa</label>
            <div className="ln">
              <input id="cfg-passa" className="cx" value={textoPassa} disabled={!podeMexer}
                     onChange={(e) => setTextoPassa(e.target.value)} />
              {podeMexer && textoPassa.trim() !== valor.textoAoPassar && (
                <button className="btn p" disabled={!textoPassa.trim()} onClick={() => void aoSalvar({ textoAoPassar: textoPassa.trim() })}>Salvar</button>
              )}
            </div>
            <p className="obs">{'{primeiro_nome}'} vira o nome do contato e {'{setor}'} vira o setor com o artigo (o Financeiro, a Coordenação).</p>
          </div>
        )}
        <div>
          <label htmlFor="cfg-min">Tempo de aguardo fica vermelho depois de</label>
          <div className="ln">
            <input id="cfg-min" className="cx" type="number" min={1} max={480} value={minutos}
                   disabled={!podeMexer} style={{ maxWidth: 110 }}
                   onChange={(e) => setMinutos(e.target.value)} />
            <span className="obs" style={{ alignSelf: 'center' }}>minutos sem resposta</span>
            {podeMexer && Number(minutos) !== valor.minutosDeAguardo && (
              <button className="btn p" onClick={() => void aoSalvar({ minutosDeAguardo: Number(minutos) })}>
                Salvar
              </button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ================= assinatura de cada um ================= */
function SuaAssinatura({ perfil, ligada }: { perfil: Perfil; ligada: boolean }) {
  const [valor, setValor] = useState(perfil.assinatura || '');
  const nome = nomeDaAssinatura({ nome: perfil.nome, assinatura: valor });
  const mudou = valor.trim() !== (perfil.assinatura || '').trim();
  async function salva() {
    await atualiza('perfis', perfil.id, { assinatura: valor.trim() });
    avisa('Assinatura salva');
  }
  return (
    <section className="bl">
      <p className="bt">Sua assinatura</p>
      <div className="frm">
        <div>
          <label htmlFor="cfg-assinatura">Como seu nome aparece nas mensagens</label>
          <div className="ln">
            <input id="cfg-assinatura" className="cx" value={valor} maxLength={ASSINATURA_MAXIMO}
                   placeholder={nomeDaAssinatura({ nome: perfil.nome })} onChange={(e) => setValor(e.target.value)} />
            {mudou && <button className="btn p" onClick={() => void salva()}>Salvar assinatura</button>}
          </div>
          <p className="obs">Em branco, vai o seu primeiro nome. Pode ser algo como &quot;Gui | Recepção&quot;.</p>
        </div>
        <div className="assin-previa" aria-label="Como o aluno lê">
          <div className="w out p">
            <div className="b"><span className="tx assin-tx">
              <b>{nome}:</b>{'\n'}Oi! Sua aula de quinta está confirmada.
            </span></div>
          </div>
        </div>
        {!ligada && <p className="obs alerta">A assinatura está desligada pela administração, em Atendimento, logo acima.</p>}
      </div>
    </section>
  );
}

/* ================= aparência ================= */
function Aparencia({ tema, setTema }: { tema: Tema; setTema: (t: Tema) => void }) {
  const [largura, setLargura] = useLarguraDoMenu();
  const [corDoMenu, setCorDoMenu] = useCorDoMenu();
  const [animacao, setAnimacao] = useAnimacao();
  const temas: { k: Tema; r: string; d: string }[] = [
    { k: 'auto', r: 'Automático', d: 'segue o aparelho' },
    { k: 'claro', r: 'Claro', d: 'sempre claro' },
    { k: 'escuro', r: 'Escuro', d: 'sempre escuro' },
  ];
  const larguras: { k: LarguraDoMenu; r: string; d: string }[] = [
    { k: 'auto', r: 'Automático', d: 'recolhe em tela pequena' },
    { k: 'aberto', r: 'Aberto', d: 'sempre com os nomes' },
    { k: 'recolhido', r: 'Recolhido', d: 'só ícone e nome curto' },
  ];
  const cores: { k: CorDoMenu; r: string }[] = [
    { k: 'escuro', r: 'Escuro' },
    { k: 'claro', r: 'Claro' },
  ];
  return (
    <section className="bl">
      <p className="bt">Aparência</p>
      <p className="sub-bt">Tema</p>
      <div className="esc">
        {temas.map((o) => (
          <button key={o.k} className="chip" aria-pressed={tema === o.k} onClick={() => setTema(o.k)}>
            {o.r}<span className="num">{o.d}</span>
          </button>
        ))}
      </div>
      <p className="sub-bt">Menu lateral</p>
      <div className="esc">
        {larguras.map((o) => (
          <button key={o.k} className="chip" aria-pressed={largura === o.k} onClick={() => setLargura(o.k)}>
            {o.r}<span className="num">{o.d}</span>
          </button>
        ))}
      </div>
      <p className="sub-bt">Cor do menu</p>
      <div className="esc">
        {cores.map((o) => (
          <button key={o.k} className="chip" aria-pressed={corDoMenu === o.k} onClick={() => setCorDoMenu(o.k)}>
            {o.r}
          </button>
        ))}
      </div>
      <p className="sub-bt">Animação ao passar a conversa de setor</p>
      <div className="esc">
        <button className="chip" aria-pressed={animacao === 'ligada'} onClick={() => setAnimacao('ligada')}>
          Ligada<span className="num">menos de 2 segundos</span>
        </button>
        <button className="chip" aria-pressed={animacao === 'desligada'} onClick={() => setAnimacao('desligada')}>
          Desligada
        </button>
      </div>
      <p className="vz">
        As escolhas valem neste aparelho e ficam guardadas nele. O menu também abre e
        recolhe pelo botão logo acima do seu nome. A animação não trava nada: dá para
        seguir clicando por baixo dela.
      </p>
    </section>
  );
}

/* ================= equipe ================= */
function Equipe({ perfis, eu, chama }: {
  perfis: Perfil[]; eu: Perfil | null;
  chama: (caminho: string, corpo?: unknown) => Promise<Record<string, unknown>>;
}) {
  const [abrindo, setAbrindo] = useState(false);
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [papel, setPapel] = useState<Papel>('recepcao');
  const [setores, setSetores] = useState<Setor[]>([]);
  const [senha, setSenha] = useState('');
  const [deQuem, setDeQuem] = useState('');
  const [erro, setErro] = useState('');
  const [indo, setIndo] = useState(false);
  /* o aviso de conversa nova chega no celular pessoal de quem é da coordenação */
  const [avisoDe, setAvisoDe] = useState<string | null>(null);
  const [fone, setFone] = useState('');
  const [avisar, setAvisar] = useState(false);
  /* quem já tem login (o servidor confere no Firebase): quem está na equipe sem login,
     como os professores que vieram do ELLO, ganha o login pela própria linha, com o
     mesmo id, para as aulas continuarem dele */
  const [logins, setLogins] = useState<Record<string, { email: string; bloqueado: boolean }> | null>(null);
  /* sem a conferência a tela não sabe quem está sem login: diz o porquê em vez de
     mostrar todo mundo como se tivesse */
  const [erroLogins, setErroLogins] = useState('');
  const [rodada, setRodada] = useState(0);
  const [editando, setEditando] = useState<{ id: string; tipo: 'login' | 'papel' } | null>(null);
  const [emailDaLinha, setEmailDaLinha] = useState('');
  const [papelDaLinha, setPapelDaLinha] = useState<Papel>('professor');
  const [setoresDaLinha, setSetoresDaLinha] = useState<Setor[]>([]);
  const qtos = perfis.length;
  useEffect(() => {
    if (modoDemo) return;
    let vale = true;
    chama('/api/equipe').then((r) => {
      if (!vale) return;
      if (r.ok) { setLogins(r.logins as Record<string, { email: string; bloqueado: boolean }>); setErroLogins(''); }
      else setErroLogins(String(r.erro || 'Não consegui conferir quem já tem login.'));
    }).catch(() => { if (vale) setErroLogins('Não consegui falar com o servidor para conferir quem já tem login.'); });
    return () => { vale = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qtos, rodada]);

  function abreLinha(p: Perfil, tipo: 'login' | 'papel') {
    if (editando?.id === p.id && editando.tipo === tipo) { setEditando(null); return; }
    setEditando({ id: p.id, tipo });
    setEmailDaLinha(p.email || '');
    setPapelDaLinha(p.papel);
    setSetoresDaLinha(p.setores || []);
    setErro('');
  }

  function abreAviso(p: Perfil) {
    if (avisoDe === p.id) { setAvisoDe(null); return; }
    setAvisoDe(p.id); setFone(p.telefone || ''); setAvisar(p.avisaNoWhats);
  }

  async function salvaAviso(p: Perfil) {
    let digitos = fone.replace(/\D/g, '');
    if (digitos.length === 10 || digitos.length === 11) digitos = `55${digitos}`;
    if (avisar && digitos.length < 12) { setErro('Escreva o celular com DDD, por exemplo 49 99123-4567.'); return; }
    setErro('');
    await atualiza('perfis', p.id, { telefone: digitos, avisaNoWhats: avisar && Boolean(digitos) });
    setAvisoDe(null);
    avisa(avisar ? `${p.nome} recebe o aviso no WhatsApp` : `${p.nome} não recebe mais o aviso`);
  }

  const lista = [...perfis].sort((a, b) => Number(b.ativo) - Number(a.ativo) || a.nome.localeCompare(b.nome));

  async function acao(corpo: Record<string, unknown>, feito: string) {
    if (modoDemo) { setErro('Na demonstração não existe login de verdade: isso funciona com o Firebase ligado.'); return; }
    setIndo(true); setErro(''); setSenha('');
    try {
      const r = await chama('/api/equipe', corpo);
      if (!r.ok) { setErro(String(r.erro || 'Não consegui.')); return; }
      if (r.senha) { setSenha(String(r.senha)); setDeQuem(String(corpo.nome || corpo.uid || '')); }
      avisa(feito);
      if (corpo.acao === 'criar') { setAbrindo(false); setNome(''); setEmail(''); setSetores([]); }
      setEditando(null);
      setRodada((n) => n + 1);
    } catch {
      setErro('Não consegui falar com o servidor.');
    } finally {
      setIndo(false);
    }
  }

  return (
    <section className="bl">
      <p className="bt">
        Equipe
        <button className="tx-btn" onClick={() => { setAbrindo(!abrindo); setErro(''); }}>
          {abrindo ? 'Cancelar' : 'Criar login'}
        </button>
      </p>

      {abrindo && (
        <div className="frm">
          <div className="ln">
            <input className="cx" placeholder="Nome" value={nome} onChange={(e) => setNome(e.target.value)} />
            <input className="cx" type="email" placeholder="E-mail" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <label htmlFor="eq-papel">Papel</label>
            <select id="eq-papel" className="cx" value={papel} onChange={(e) => setPapel(e.target.value as Papel)}>
              {PAPEIS.map((p) => <option key={p} value={p}>{NOME_PAPEL[p]}</option>)}
            </select>
          </div>
          <p className="obs">{OQUEVE[papel]}</p>
          {papel === 'coordenacao' && (
            <div>
              <label>Setores que essa pessoa atende (ela vê só as conversas deles)</label>
              <div className="tags">
                {SETORES.map((s) => (
                  <button key={s} className="tag" aria-pressed={setores.includes(s)}
                          onClick={() => setSetores(setores.includes(s) ? setores.filter((x) => x !== s) : [...setores, s])}>
                    {NOME_SETOR[s]}
                  </button>
                ))}
              </div>
            </div>
          )}
          <p className="obs">
            A senha provisória aparece aqui uma vez, para você passar à pessoa. Ela não fica guardada.
            Quem já está na lista abaixo (como os professores que vieram do ELLO) ganha o login
            pela própria linha, para não ficar em dobro.
          </p>
          <div className="acoes">
            <button className="btn p" disabled={indo || !nome.trim() || !email.trim()}
                    onClick={() => void acao({ acao: 'criar', nome, email, papel, setores }, 'Login criado')}>
              Criar login
            </button>
          </div>
        </div>
      )}

      {senha && (
        <div className="senha">
          <b>Senha provisória de {deQuem}</b>
          <code>{senha}</code>
          <span>Passe para a pessoa e peça que troque no primeiro acesso. Esta tela não mostra de novo.</span>
        </div>
      )}
      {erro && <p className="erro" style={{ padding: '0 18px 10px' }}>{erro}</p>}
      {erroLogins && !erro && <p className="erro" style={{ padding: '0 18px 10px' }}>{erroLogins}</p>}

      {lista.map((p) => (
        <div key={p.id}>
        <div className="lin">
          <Ic n="pessoas" />
          <span className="co">
            <b>{p.nome}{p.id === eu?.id ? ' (você)' : ''}</b>
            <small>
              {NOME_PAPEL[p.papel]}
              {(p.setores || []).length ? `, ${(p.setores || []).map((s) => NOME_SETOR[s]).join(', ')}` : ''}
              {logins && !logins[p.id] ? ', sem login' : ''}
              {p.ativo ? '' : ', sem acesso'}
              {p.criadoEm ? `, desde ${dataBR(p.criadoEm)}` : ''}
              {p.avisaNoWhats && p.telefone ? `, aviso no WhatsApp ${telefoneLegivel(p.telefone)}` : ''}
            </small>
          </span>
          <button className="tx-btn" aria-expanded={avisoDe === p.id} onClick={() => abreAviso(p)}>
            Aviso no WhatsApp
          </button>
          {p.id !== eu?.id && (
            <>
              <button className="tx-btn" aria-expanded={editando?.id === p.id && editando.tipo === 'papel'} onClick={() => abreLinha(p, 'papel')}>
                Papel
              </button>
              {logins && !logins[p.id] ? (
                <button className="tx-btn" aria-expanded={editando?.id === p.id && editando.tipo === 'login'} onClick={() => abreLinha(p, 'login')}>
                  Criar login
                </button>
              ) : (
                <button className="tx-btn" disabled={indo}
                        onClick={() => void acao({ acao: 'senha', uid: p.id, nome: p.nome }, 'Senha nova gerada')}>
                  Senha nova
                </button>
              )}
              <button className="tx-btn" disabled={indo}
                      onClick={() => void acao({ acao: 'acesso', uid: p.id, ativo: !p.ativo }, p.ativo ? 'Acesso retirado' : 'Acesso devolvido')}>
                {p.ativo ? 'Tirar acesso' : 'Devolver acesso'}
              </button>
            </>
          )}
        </div>
        {editando?.id === p.id && (
          <div className="frm">
            {editando.tipo === 'login' && (
              <>
                <p className="obs forte">
                  {p.nome.split(' ')[0]} já está na equipe{p.papel === 'professor' ? ' e as aulas apontam para este cadastro' : ''}.
                  O login nasce no mesmo cadastro, sem criar outra pessoa.
                </p>
                <div className="ln">
                  <input className="cx" type="email" placeholder="E-mail" aria-label={`E-mail de ${p.nome}`}
                         value={emailDaLinha} onChange={(e) => setEmailDaLinha(e.target.value)} />
                </div>
              </>
            )}
            <div>
              <label htmlFor={`papel-${p.id}`}>Papel</label>
              <select id={`papel-${p.id}`} className="cx" value={papelDaLinha} onChange={(e) => setPapelDaLinha(e.target.value as Papel)}>
                {PAPEIS.map((x) => <option key={x} value={x}>{NOME_PAPEL[x]}</option>)}
              </select>
            </div>
            {papelDaLinha === 'coordenacao' && (
              <div>
                <label>Setores que essa pessoa atende (ela vê só as conversas deles)</label>
                <div className="tags">
                  {SETORES.map((s) => (
                    <button key={s} className="tag" aria-pressed={setoresDaLinha.includes(s)}
                            onClick={() => setSetoresDaLinha(setoresDaLinha.includes(s) ? setoresDaLinha.filter((x) => x !== s) : [...setoresDaLinha, s])}>
                      {NOME_SETOR[s]}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <p className="obs">{OQUEVE[papelDaLinha]}</p>
            <div className="acoes">
              <button className="btn" onClick={() => setEditando(null)}>Cancelar</button>
              {editando.tipo === 'login' ? (
                <button className="btn p" disabled={indo || !emailDaLinha.trim()}
                        onClick={() => void acao({ acao: 'login', uid: p.id, nome: p.nome, email: emailDaLinha, papel: papelDaLinha, setores: papelDaLinha === 'coordenacao' ? setoresDaLinha : [] }, 'Login criado')}>
                  Criar login
                </button>
              ) : (
                <button className="btn p" disabled={indo}
                        onClick={() => void acao({ acao: 'papel', uid: p.id, papel: papelDaLinha, setores: papelDaLinha === 'coordenacao' ? setoresDaLinha : [] }, 'Papel salvo')}>
                  Salvar papel
                </button>
              )}
            </div>
          </div>
        )}
        {avisoDe === p.id && (
          <div className="frm">
            <p className="obs forte">
              Quando alguém passa uma conversa para o setor de {p.nome.split(' ')[0]}, chega neste
              celular um aviso com o botão que abre a conversa no sistema. Vale para Coordenação,
              Coordenação Kids e Financeiro, com o aviso ligado no atendimento automático.
            </p>
            <div className="ln">
              <input className="cx" inputMode="tel" aria-label={`Celular de ${p.nome}`} placeholder="49 99123-4567"
                     value={fone} onChange={(e) => setFone(e.target.value)} />
            </div>
            <label className="lig">
              <input type="checkbox" checked={avisar} onChange={(e) => setAvisar(e.target.checked)} />
              <span><b>Receber o aviso no WhatsApp</b>A mensagem sai pelo número da escola, por modelo aprovado.</span>
            </label>
            <div className="acoes">
              <button className="btn" onClick={() => setAvisoDe(null)}>Cancelar</button>
              <button className="btn p" onClick={() => void salvaAviso(p)}>Salvar aviso</button>
            </div>
          </div>
        )}
        </div>
      ))}
      <p className="vz">
        Quem sai da escola perde o acesso, não some: conversa, cartão e correção de prova
        apontam para a pessoa, e apagar deixaria buraco no histórico do aluno.
      </p>
    </section>
  );
}

/* ================= whatsapp ================= */
function WhatsApp({ chama }: { chama: (caminho: string, corpo?: unknown) => Promise<Record<string, unknown>> }) {
  const [conferencias, setConferencias] = useState<Conferencia[] | null>(null);
  const [indo, setIndo] = useState(false);
  const [erro, setErro] = useState('');
  const [para, setPara] = useState('');

  async function confere() {
    if (modoDemo) { setErro('Na demonstração não existe conexão com a Meta: isso funciona no sistema publicado.'); return; }
    setIndo(true); setErro('');
    try {
      const r = await chama('/api/whatsapp/conexao');
      if (!r.ok) { setErro(String(r.erro || 'Não consegui conferir.')); return; }
      setConferencias(r.conferencias as Conferencia[]);
    } catch {
      setErro('Não consegui falar com o servidor.');
    } finally { setIndo(false); }
  }

  async function manda(corpo: Record<string, unknown>, feito: string) {
    setIndo(true); setErro('');
    try {
      const r = await chama('/api/whatsapp/conexao', corpo);
      if (!r.ok) { setErro(String(r.erro || 'Não consegui.')); return; }
      avisa(feito);
      await confere();
    } catch {
      setErro('Não consegui falar com o servidor.');
    } finally { setIndo(false); }
  }

  return (
    <section className="bl">
      <p className="bt">
        WhatsApp oficial
        <button className="tx-btn" disabled={indo} onClick={() => void confere()}>
          {indo ? 'Conferindo...' : 'Conferir agora'}
        </button>
      </p>

      {!conferencias && !erro && (
        <p className="vz">
          Toque em conferir para o sistema perguntar à Meta se o número está conectado,
          se as mensagens chegam aqui e o que falta. Nenhuma chave aparece nesta tela.
        </p>
      )}
      {erro && <p className="erro" style={{ padding: '0 18px 10px' }}>{erro}</p>}

      {conferencias?.map((c) => (
        <div key={c.chave} className="lin">
          <span className={`pt ${c.estado}`} aria-hidden="true" />
          <span className="co">
            <b>{c.titulo}</b>
            <small>{c.detalhe}</small>
            {c.conserto && <small className="cons">{c.conserto}</small>}
          </span>
        </div>
      ))}

      {conferencias && (
        <div className="frm">
          <div className="ln">
            <button className="btn" disabled={indo} onClick={() => void manda({ acao: 'assinar' }, 'Aplicativo assinado')}>
              Assinar agora
            </button>
            <input className="cx" placeholder="5549991234567" value={para} inputMode="numeric"
                   aria-label="Número para o teste" onChange={(e) => setPara(e.target.value)} />
            <button className="btn" disabled={indo || para.replace(/\D/g, '').length < 12}
                    onClick={() => void manda({ acao: 'teste', para }, 'Teste enviado')}>
              Mandar um teste
            </button>
          </div>
          <p className="obs">
            Assinar adiciona o sistema à conta do WhatsApp sem remover quem já está lá,
            então dá para ligar com o atendimento rodando. O teste usa o modelo hello_world,
            o único que sai sem a janela de 24 horas aberta.
          </p>
        </div>
      )}
    </section>
  );
}
