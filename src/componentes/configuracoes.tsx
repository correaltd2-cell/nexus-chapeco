'use client';
/* Configurações: o que a escola muda sem precisar de mim.
   So entra aqui botao que faz alguma coisa de verdade. O que ainda nao existe fica
   de fora, porque interruptor que nao liga nada ensina o time a nao confiar na tela. */
import { useEffect, useMemo, useState } from 'react';
import { assina, atualiza, define, modoDemo } from '@/lib/dados/fonte';
import { useSessao, useTema, type Tema } from '@/componentes/sessao';
import { avisa } from '@/componentes/aviso';
import { Ic } from '@/componentes/icones';
import { ehGestao, NOME_PAPEL, NOME_SETOR, SETORES } from '@/lib/dominio/acessos';
import { leAtendimento } from '@/lib/dominio/config';
import { leAutomatico, type ConfigAutomatico } from '@/lib/dominio/automatico';
import AtendimentoAutomatico from '@/componentes/config-automatico';
import { SaudeDoSistema } from '@/componentes/saude';
import { ModelosDeMensagem } from '@/componentes/modelos';
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

export default function Configuracoes() {
  const { perfil, usuario } = useSessao();
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

      <Atendimento valor={atendimento} podeMexer={gestao} aoSalvar={salvaAtendimento} />
      <AtendimentoAutomatico salva={automatico} podeMexer={gestao} chama={chama} perfis={perfis} />
      <ModelosDeMensagem gestao={gestao} chama={chama} />
      <Aparencia tema={tema} setTema={setTema} />
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

/* ================= atendimento ================= */
function Atendimento({ valor, podeMexer, aoSalvar }: {
  valor: { abreTarefaNaTriagem: boolean; minutosDeAguardo: number };
  podeMexer: boolean;
  aoSalvar: (c: Partial<{ abreTarefaNaTriagem: boolean; minutosDeAguardo: number }>) => Promise<void>;
}) {
  const [minutos, setMinutos] = useState(String(valor.minutosDeAguardo));
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
          {papel === 'coordenacao' && (
            <div>
              <label>Setores que essa pessoa atende</label>
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

      {lista.map((p) => (
        <div key={p.id}>
        <div className="lin">
          <Ic n="pessoas" />
          <span className="co">
            <b>{p.nome}{p.id === eu?.id ? ' (você)' : ''}</b>
            <small>
              {NOME_PAPEL[p.papel]}
              {p.setores.length ? `, ${p.setores.map((s) => NOME_SETOR[s]).join(', ')}` : ''}
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
              <button className="tx-btn" disabled={indo}
                      onClick={() => void acao({ acao: 'senha', uid: p.id, nome: p.nome }, 'Senha nova gerada')}>
                Senha nova
              </button>
              <button className="tx-btn" disabled={indo}
                      onClick={() => void acao({ acao: 'acesso', uid: p.id, ativo: !p.ativo }, p.ativo ? 'Acesso retirado' : 'Acesso devolvido')}>
                {p.ativo ? 'Tirar acesso' : 'Devolver acesso'}
              </button>
            </>
          )}
        </div>
        {avisoDe === p.id && (
          <div className="frm">
            <p className="obs forte">
              Quando alguém passa uma conversa para o setor de {p.nome.split(' ')[0]}, chega neste
              celular um aviso com o botão que abre a conversa no sistema. Vale para Coordenação e
              Coordenação Kids, com o aviso ligado no atendimento automático.
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
