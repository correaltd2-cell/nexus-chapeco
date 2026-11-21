'use client';
/* Alunos: a lista da escola, puxada da planilha do Google que a escola já mantém.
   Em cima, as contas do painel da planilha feitas certo (ativos, quem marcou a semana,
   quem não marcou, trancados, off, obs); depois a planilha (ligar, conferir antes de
   importar, atualizar agora); embaixo, os alunos, com o detalhe de cada um, quem já tem
   conversa ligada e o CSV para o relatório.
   As regras da planilha moram em src/lib/dominio/planilha.ts; quem lê o Google é o
   servidor (/api/alunos/planilha), com a conta de serviço do sistema. */
import { Fragment, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { assina, modoDemo } from '@/lib/dados/fonte';
import { useSessao } from '@/componentes/sessao';
import { avisa } from '@/componentes/aviso';
import { Ic } from '@/componentes/icones';
import {
  CAMPOS, NOME_DA_SITUACAO, NOME_DO_CAMPO, contas, horarioEmTexto, normal,
  type Campo, type Mapa, type SituacaoAluno,
} from '@/lib/dominio/planilha';
import { alunosDoContato } from '@/lib/dominio/contato';
import { csv } from '@/lib/dominio/agenda';
import { dataBR, dataHoraBR, telefoneLegivel } from '@/lib/dominio/formato';
import type { Aluno, Conversa } from '@/lib/dominio/tipos';

type AlunoComOrigem = Aluno & { teste?: boolean };
type Filtro = 'ativos' | 'nao_marcaram' | 'trancados' | 'off' | 'obs' | 'inativos' | 'todos';

type Contas = ReturnType<typeof contas>;
interface Resumo { quando: string; quem: string; titulo: string; aba: string; lidos: number; ativos: number; novos: number; atualizados: number; iguais: number; foraDaPlanilha: number; vinculadas: number; problemas: number; contas?: Contas }
interface ConfigSalva { planilhaId: string; aba: string; titulo?: string; mapa?: Mapa; automatico: boolean; ultima?: Resumo; erro?: { quando: string; motivo: string } | null }
interface Amostra { linha: number; nome: string; menor: boolean; telefone: string; nivel: string; tipoCurso: string | null; situacao: SituacaoAluno; marcouSemana: boolean | null; horarioFixoTexto: string; horariosFixos: { dia: number; hora: string }[]; trilha: string }
interface Conferencia {
  titulo: string; abas: string[]; aba: string;
  leitura: { cabecalho: string[]; linhaCabecalho: number; colunas: Partial<Record<Campo, number>>; colunaDeMarcacao: boolean; problemas: { linha: number; motivo: string }[]; situacoesDesconhecidas: string[]; total: number; ativos: number; contas: Contas };
  amostra: Amostra[];
  plano: { novos: number; atualizados: number; iguais: number; foraDaPlanilha: number; exemplosNovos: string[]; exemplosAtualizados: string[]; exemplosFora: string[] };
  vincular: number;
  vincularPeloNome: number;
}

const VE_TODAS = ['admin', 'gestor', 'recepcao'];
const situacaoDe = (a: Pick<Aluno, 'situacao' | 'ativo'>): SituacaoAluno => a.situacao ?? (a.ativo ? 'ativo' : 'inativo');
const NOME_DA_SAUDE = { evoluindo: 'Evoluindo', atencao: 'Atenção', critico: 'Crítico' } as const;
const NOME_DO_TIPO = { turma: 'turma', particular: 'particular', clube: 'clube de conversação' } as const;
const horarioDe = (a: Pick<Aluno, 'horariosFixos' | 'horarioFixoTexto'>) => (a.horariosFixos?.length ? horarioEmTexto(a.horariosFixos) : a.horarioFixoTexto || '');

export default function Alunos() {
  const { perfil } = useSessao();
  const [alunos, setAlunos] = useState<AlunoComOrigem[]>([]);
  const [conversas, setConversas] = useState<Conversa[]>([]);
  const [filtro, setFiltro] = useState<Filtro>('ativos');
  const [trilha, setTrilha] = useState<'todas' | 'adultos' | 'kids'>('todas');
  const [semConversa, setSemConversa] = useState(false);
  const [busca, setBusca] = useState('');
  const [aberto, setAberto] = useState<string | null>(null);
  const veConversas = Boolean(perfil && VE_TODAS.includes(perfil.papel));

  useEffect(() => assina('alunos', (d) => setAlunos((d as unknown as AlunoComOrigem[]).filter((a) => !a.teste).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')))), []);
  useEffect(() => (veConversas ? assina('conversas', (d) => setConversas(d as unknown as Conversa[])) : undefined), [veConversas]);

  /* a conversa de cada aluno: a ligada a ele, ou a que o telefone acha */
  const conversaDe = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of conversas) {
      for (const a of alunosDoContato(alunos, c)) if (!m.has(a.id)) m.set(a.id, c.id);
    }
    return m;
  }, [conversas, alunos]);

  const conta = useMemo(() => contas(alunos.map((a) => ({
    situacao: situacaoDe(a), marcouSemana: a.marcouSemana ?? null, horariosFixos: a.horariosFixos || [], temFixo: a.temFixo ?? null,
  }))), [alunos]);
  const temMarcacao = alunos.some((a) => typeof a.marcouSemana === 'boolean');

  const passa = (a: AlunoComOrigem) => {
    const s = situacaoDe(a);
    if (filtro === 'ativos') return s === 'ativo';
    if (filtro === 'nao_marcaram') return s === 'ativo' && a.marcouSemana === false;
    if (filtro === 'trancados') return s === 'trancado';
    if (filtro === 'off') return s === 'off';
    if (filtro === 'obs') return s === 'obs';
    if (filtro === 'inativos') return s === 'inativo';
    return true;
  };
  const termo = normal(busca);
  const digitos = busca.replace(/\D/g, '');
  const visiveis = alunos.filter((a) => passa(a)
    && (trilha === 'todas' || a.trilha === trilha)
    && (!semConversa || !conversaDe.has(a.id))
    && (!termo || normal(`${a.nome} ${a.codigo || ''} ${a.responsavelNome || ''} ${a.nivel} ${a.livroOriginal || ''} ${horarioDe(a)} ${a.professorDoLivro || ''}`).includes(termo)
      || (digitos.length >= 4 && `${a.telefone} ${a.responsavelTelefone || ''}`.includes(digitos))));

  const filtros: { k: Filtro; r: string; n: number }[] = [
    { k: 'ativos', r: 'Ativos', n: conta.ativos },
    ...(temMarcacao ? [{ k: 'nao_marcaram' as Filtro, r: 'Não marcaram', n: conta.naoMarcaram }] : []),
    { k: 'trancados', r: 'Trancados', n: conta.trancados },
    { k: 'off', r: 'Off', n: conta.off },
    { k: 'obs', r: 'Obs', n: conta.obs },
    ...(conta.inativos ? [{ k: 'inativos' as Filtro, r: 'Inativos', n: conta.inativos }] : []),
    { k: 'todos', r: 'Todos', n: conta.total },
  ];

  function baixa() {
    const sim = (v?: boolean | null) => (v === true ? 'sim' : v === false ? 'não' : '');
    const texto = csv(['Código', 'Aluno', 'Menor', 'Situação', 'Marcou a próxima semana', 'Horário fixo', 'Livro', 'Tipo', 'Modalidade', 'Curso',
      'Classificação', 'App', 'Nex-IA', 'Falta por livro', 'Fim do contrato', 'Telefone', 'Responsável', 'Telefone do responsável', 'Observação', 'Conversa no sistema'],
    visiveis.map((a) => [a.codigo || '', a.nome, sim(a.menor), NOME_DA_SITUACAO[situacaoDe(a)], situacaoDe(a) === 'ativo' ? sim(a.marcouSemana) : '',
      horarioDe(a), a.livroOriginal || a.nivel, a.tipoCurso ? NOME_DO_TIPO[a.tipoCurso] : '', a.modalidade || '', a.trilha === 'kids' ? 'Kids' : 'Adultos',
      a.saude ? NOME_DA_SAUDE[a.saude] : '', sim(a.appAtivo), sim(a.nexiaAtivo), sim(a.pendenciaLivro), a.contratoFim ? dataBR(a.contratoFim) : '',
      a.telefone ? telefoneLegivel(a.telefone) : '', a.responsavelNome || '', a.responsavelTelefone ? telefoneLegivel(a.responsavelTelefone) : '',
      a.observacao || '', conversaDe.has(a.id) ? 'sim' : 'não']));
    const url = URL.createObjectURL(new Blob([texto], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `alunos-${filtro}-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  const hoje = new Date().toISOString().slice(0, 10);
  const colunas = veConversas ? 6 : 5;

  return (
    <div className="alu">
      <header className="vh alu-h">
        <h1>Alunos</h1>
      </header>
      <div className="alu-corpo">
        {alunos.length > 0 && (
          <section className="rel-kpis alu-kpis" aria-label="Contas dos alunos">
            {([
              ['Ativos', conta.ativos, `de ${conta.total} alunos`, 'ativos'],
              ...(temMarcacao ? [
                ['Marcaram a próxima semana', conta.marcaram, `${conta.ativos ? Math.round((conta.marcaram / conta.ativos) * 100) : 0}% dos ativos`, 'ativos'],
                ['Não marcaram', conta.naoMarcaram, 'ativos sem aula marcada', 'nao_marcaram'],
              ] : []),
              ['Trancados', conta.trancados, 'matrícula suspensa', 'trancados'],
              ['Off e obs', conta.off + conta.obs, `${conta.off} off, ${conta.obs} obs`, 'off'],
              ['Com horário fixo', conta.comFixo, 'entre os ativos', 'ativos'],
            ] as [string, number, string, Filtro][]).map(([rotulo, n, sub, f]) => (
              <button key={rotulo} type="button" className={`rel-kpi alu-kpi${rotulo === 'Não marcaram' && n ? ' alerta' : ''}`} onClick={() => setFiltro(f)}>
                <span>{rotulo}</span><b className="num">{n}</b><small>{sub}</small>
              </button>
            ))}
          </section>
        )}

        <PlanilhaDoGoogle />

        <section className="bl alu-lista">
          <div className="alu-filtros">
            <div className="chips" role="group" aria-label="Situação">
              {filtros.map((f) => (
                <button key={f.k} type="button" className="chip" aria-pressed={filtro === f.k} onClick={() => setFiltro(f.k)}>
                  {f.r}<span className="num">{f.n}</span>
                </button>
              ))}
            </div>
            <div className="chips" role="group" aria-label="Curso">
              {(['todas', 'adultos', 'kids'] as const).map((t) => (
                <button key={t} type="button" className="chip" aria-pressed={trilha === t} onClick={() => setTrilha(t)}>
                  {t === 'todas' ? 'Adultos e Kids' : t === 'adultos' ? 'Adultos' : 'Kids'}
                </button>
              ))}
              {veConversas && (
                <button type="button" className="chip" aria-pressed={semConversa} onClick={() => setSemConversa(!semConversa)}>Sem conversa</button>
              )}
            </div>
            <label className="alu-busca">
              <Ic n="busca" />
              <input value={busca} placeholder="Procurar por nome, código, livro, horário ou telefone" aria-label="Procurar aluno"
                     onChange={(e) => setBusca(e.target.value)} />
            </label>
            <span className="ag-conta num">{visiveis.length} {visiveis.length === 1 ? 'aluno' : 'alunos'}</span>
            <button className="btn" onClick={baixa} disabled={!visiveis.length}><Ic n="doc" />Baixar CSV</button>
          </div>

          {!alunos.length ? (
            <p className="vz">Nenhum aluno no sistema ainda. Ligue a planilha do Google aqui em cima e importe: a lista aparece aqui e as conversas se ligam aos alunos.</p>
          ) : !visiveis.length ? (
            <p className="vz">Nenhum aluno com esse filtro.</p>
          ) : (
            <div className="alu-tab-caixa">
              <table className="rel-tab alu-tab">
                <thead>
                  <tr><th>Aluno</th><th>Livro</th><th>Horário fixo</th><th>Situação</th><th>Classificação</th>{veConversas && <th>Conversa</th>}</tr>
                </thead>
                <tbody>
                  {visiveis.map((a) => {
                    const s = situacaoDe(a);
                    const aberta = aberto === a.id;
                    const vencido = a.contratoFim && a.contratoFim < hoje;
                    return (
                      <Fragment key={a.id}>
                        <tr className={aberta ? 'alu-aberta' : undefined}>
                          <td className="alu-c-nome">
                            <button type="button" className="alu-nome" aria-expanded={aberta} onClick={() => setAberto(aberta ? null : a.id)}>
                              <b>{a.nome}</b>
                            </button>
                            <small>{[a.codigo ? `cód. ${a.codigo}` : '', a.menor ? 'menor de idade' : '', a.responsavelNome ? `resp. ${a.responsavelNome}` : ''].filter(Boolean).join(' · ')}</small>
                          </td>
                          <td className="alu-c-nivel">
                            {[a.nivel, a.licao ? `lição ${a.licao}` : ''].filter(Boolean).join(' · ') || '—'}
                            <small>{[a.tipoCurso && a.tipoCurso !== 'turma' ? NOME_DO_TIPO[a.tipoCurso] : '', a.modalidade && a.modalidade !== 'presencial' ? a.modalidade : '', a.professorDoLivro ? `com ${a.professorDoLivro}` : '', a.trilha === 'kids' ? 'Kids' : ''].filter(Boolean).join(' · ')}</small>
                          </td>
                          <td className="alu-c-tel">{horarioDe(a) || <span className="alu-falta">sem horário fixo</span>}</td>
                          <td className="alu-c-sit">
                            <span className={`alu-sit ${s}`}>{NOME_DA_SITUACAO[s]}</span>
                            {s === 'ativo' && typeof a.marcouSemana === 'boolean' && (
                              <small className={a.marcouSemana ? 'alu-marcou' : 'alu-naomarcou'}>{a.marcouSemana ? 'marcou a semana' : 'não marcou'}</small>
                            )}
                          </td>
                          <td className="alu-c-orig">{a.saude ? <span className={`alu-saude ${a.saude}`}>{NOME_DA_SAUDE[a.saude]}</span> : <span className="alu-falta">—</span>}</td>
                          {veConversas && (
                            <td className="alu-c-conv">
                              {conversaDe.has(a.id)
                                ? <Link href={`/conversas?conversa=${conversaDe.get(a.id)}`} className="alu-conversa"><Ic n="chat" />Abrir</Link>
                                : <span className="alu-falta">sem conversa</span>}
                            </td>
                          )}
                        </tr>
                        {aberta && (
                          <tr className="alu-detalhe">
                            <td colSpan={colunas}>
                              <dl>
                                {a.observacao && <><dt>Observação</dt><dd>{a.observacao}</dd></>}
                                {a.horarioFixoTexto && <><dt>Horário na planilha</dt><dd>{a.horarioFixoTexto}</dd></>}
                                {a.livroOriginal && <><dt>BOOK na planilha</dt><dd>{a.livroOriginal}</dd></>}
                                <dt>Modalidade</dt><dd>{a.modalidade || '—'}</dd>
                                <dt>App e Nex-IA</dt><dd>App {a.appAtivo ? 'sim' : a.appAtivo === false ? 'não' : '—'} · Nex-IA {a.nexiaAtivo ? 'sim' : a.nexiaAtivo === false ? 'não' : '—'}</dd>
                                {a.pendenciaLivro && <><dt>Livro</dt><dd className="alu-alerta">falta o livro</dd></>}
                                <dt>Contrato</dt>
                                <dd className={vencido ? 'alu-alerta' : undefined}>
                                  {a.contratoFim ? `${vencido ? 'venceu' : 'vence'} em ${dataBR(a.contratoFim)}` : 'sem data de fim na planilha'}{a.contratoAssinado ? ' · assinado' : ''}
                                </dd>
                                <dt>Telefone</dt>
                                <dd>{a.telefone ? telefoneLegivel(a.telefone) : 'ainda sem'}{a.responsavelTelefone ? ` · responsável ${telefoneLegivel(a.responsavelTelefone)}` : ''}</dd>
                                {a.linhaPlanilha && <><dt>Na planilha</dt><dd>linha {a.linhaPlanilha}</dd></>}
                              </dl>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

/* ================= a planilha do Google ================= */

function PlanilhaDoGoogle() {
  const { perfil, usuario } = useSessao();
  const gestao = perfil?.papel === 'admin' || perfil?.papel === 'gestor';
  const atualiza = gestao || perfil?.papel === 'recepcao';
  const [estado, setEstado] = useState<{ email: string; projeto: string; config: ConfigSalva | null } | null>(null);
  const [montando, setMontando] = useState(false);
  const [link, setLink] = useState('');
  const [aba, setAba] = useState('');
  const [mapa, setMapa] = useState<Mapa>({});
  const [automatico, setAutomatico] = useState(true);
  const [conf, setConf] = useState<Conferencia | null>(null);
  const [indo, setIndo] = useState('');
  const [erro, setErro] = useState('');

  async function chama(metodo: 'GET' | 'POST', corpo?: unknown) {
    if (!usuario) throw new Error('sem login');
    const token = await usuario.getIdToken();
    const r = await fetch('/api/alunos/planilha', {
      method: metodo, headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      ...(corpo ? { body: JSON.stringify(corpo) } : {}),
    });
    return (await r.json()) as Record<string, unknown>;
  }

  async function recarrega() {
    if (modoDemo || !usuario) return;
    const r = await chama('GET');
    if (r.ok) setEstado({ email: String(r.email || ''), projeto: String(r.projeto || ''), config: (r.config as ConfigSalva) || null });
  }
  useEffect(() => {
    if (modoDemo || !usuario) return;
    let vivo = true;
    void (async () => {
      const token = await usuario.getIdToken();
      const r = (await (await fetch('/api/alunos/planilha', { headers: { authorization: `Bearer ${token}` } })).json()) as Record<string, unknown>;
      if (vivo && r.ok) setEstado({ email: String(r.email || ''), projeto: String(r.projeto || ''), config: (r.config as ConfigSalva) || null });
    })();
    return () => { vivo = false; };
  }, [usuario]);

  const config = estado?.config;

  async function conferir(o: { aba?: string; mapa?: Mapa } = {}) {
    setIndo('Lendo a planilha...'); setErro('');
    try {
      const r = await chama('POST', { acao: 'conferir', link: link || config?.planilhaId || '', aba: o.aba ?? aba, mapa: o.mapa ?? mapa });
      if (!r.ok) { setErro(String(r.erro)); setConf(null); return; }
      const c = r.conferencia as Conferencia;
      setConf(c); setAba(c.aba);
      /* o mapa na tela começa com o que foi reconhecido */
      const reconhecido: Mapa = {};
      for (const { campo } of CAMPOS) {
        const i = c.leitura.colunas[campo];
        reconhecido[campo] = i === undefined ? null : c.leitura.cabecalho[i];
      }
      setMapa(reconhecido);
    } catch { setErro('Não consegui falar com o servidor.'); } finally { setIndo(''); }
  }

  async function importar() {
    setIndo('Importando...'); setErro('');
    try {
      const r = await chama('POST', { acao: 'importar', link: link || config?.planilhaId || '', aba, mapa, automatico });
      if (!r.ok) { setErro(String(r.erro)); return; }
      const res = r.resumo as Resumo;
      avisa(`${res.novos} alunos novos, ${res.atualizados} atualizados, ${res.vinculadas} conversas ligadas`);
      setConf(null); setMontando(false); setLink('');
      await recarrega();
    } catch { setErro('Não consegui falar com o servidor.'); } finally { setIndo(''); }
  }

  async function atualizaAgora() {
    setIndo('Atualizando...'); setErro('');
    try {
      const r = await chama('POST', { acao: 'importar' });
      if (!r.ok) setErro(String(r.erro));
      else { const res = r.resumo as Resumo; avisa(`${res.novos} novos, ${res.atualizados} atualizados, ${res.vinculadas} conversas ligadas`); }
      await recarrega();
    } catch { setErro('Não consegui falar com o servidor.'); } finally { setIndo(''); }
  }

  async function mudaAutomatico(v: boolean) {
    const r = await chama('POST', { acao: 'automatico', automatico: v });
    if (!r.ok) setErro(String(r.erro)); else { avisa(v ? 'Atualiza sozinha de hora em hora' : 'Atualização automática desligada'); await recarrega(); }
  }

  function copia(t: string) {
    navigator.clipboard?.writeText(t).then(() => avisa('E-mail copiado'), () => undefined);
  }

  if (modoDemo) {
    return (
      <section className="bl alu-pl">
        <p className="bt">Planilha do Google</p>
        <p className="vz">
          Na demonstração não há servidor para ler a planilha. No sistema publicado, a gestão cola aqui o link da planilha de marcação
          (aba ATIVOS), confere o que vai entrar e importa; depois ela se atualiza sozinha de hora em hora, e as conversas se ligam aos alunos.
        </p>
      </section>
    );
  }
  if (!estado) return <section className="bl alu-pl"><p className="bt">Planilha do Google</p><p className="vz">Carregando...</p></section>;

  const ligada = Boolean(config?.planilhaId);
  const erroSalvo = config?.erro && (!config.ultima || config.erro.quando > config.ultima.quando) ? config.erro : null;
  const c = conf?.leitura.contas;

  return (
    <section className="bl alu-pl">
      <p className="bt">Planilha do Google</p>

      {ligada && !montando && (
        <div className="frm">
          <p className="alu-pl-linha">
            <Ic n="lista" />
            <span>Ligada à planilha <b>{config?.titulo || 'de alunos'}</b>, aba <b>{config?.aba}</b>.
              {config?.automatico ? ' Atualiza sozinha de hora em hora.' : ' Atualiza quando alguém toca em Atualizar agora.'}</span>
          </p>
          {config?.ultima && (
            <p className="obs">
              Última leitura em {dataHoraBR(config.ultima.quando)}, por {config.ultima.quem}: {config.ultima.lidos} alunos na planilha,
              {' '}{config.ultima.novos} novos, {config.ultima.atualizados} atualizados, {config.ultima.vinculadas} conversas ligadas
              {config.ultima.foraDaPlanilha ? `, ${config.ultima.foraDaPlanilha} alunos do sistema que não estão mais na planilha` : ''}.
              {' '}A marcação da semana mostrada aqui é a dessa leitura.
            </p>
          )}
          {erroSalvo && <p className="erro">A última leitura falhou em {dataHoraBR(erroSalvo.quando)}: {erroSalvo.motivo}</p>}
          <div className="ln">
            {atualiza && <button className="btn p" disabled={Boolean(indo)} onClick={() => void atualizaAgora()}>{indo || 'Atualizar agora'}</button>}
            {gestao && <button className="btn" onClick={() => { setMontando(true); setConf(null); setLink(''); setMapa(config?.mapa || {}); setAba(config?.aba || ''); setAutomatico(config?.automatico ?? true); }}>Trocar planilha ou colunas</button>}
            {gestao && (
              <label className="lig alu-auto">
                <input type="checkbox" checked={Boolean(config?.automatico)} onChange={(e) => void mudaAutomatico(e.target.checked)} />
                <span><b>Atualizar sozinha de hora em hora</b></span>
              </label>
            )}
          </div>
        </div>
      )}

      {(!ligada || montando) && (
        gestao ? (
          <div className="frm">
            <ol className="alu-passos">
              <li>
                <b>Compartilhe a planilha com o sistema, como leitor.</b> No Google Sheets, toque em Compartilhar e adicione este e-mail:
                <span className="alu-email"><code>{estado.email || 'conta de serviço não configurada'}</code>
                  {estado.email && <button type="button" className="tx-btn" onClick={() => copia(estado.email)}>Copiar</button>}</span>
              </li>
              <li>
                <b>Ligue a API do Google Sheets no projeto, uma vez só.</b>{' '}
                <a href={`https://console.cloud.google.com/apis/library/sheets.googleapis.com?project=${estado.projeto}`} target="_blank" rel="noopener noreferrer">Abrir no Google Cloud</a> e tocar em Ativar.
              </li>
              <li>
                <b>Cole o link da planilha</b> (o endereço que aparece no navegador quando ela está aberta). Na planilha de marcação, a aba é a ATIVOS.
                <div className="ln">
                  <input className="cx" value={link} placeholder="https://docs.google.com/spreadsheets/d/..." aria-label="Link da planilha"
                         onChange={(e) => setLink(e.target.value)} />
                  <button className="btn p" disabled={Boolean(indo) || (!link.trim() && !config?.planilhaId)} onClick={() => void conferir()}>
                    {indo === 'Lendo a planilha...' ? indo : 'Conferir planilha'}
                  </button>
                  {montando && <button className="btn" onClick={() => { setMontando(false); setConf(null); }}>Cancelar</button>}
                </div>
              </li>
            </ol>
          </div>
        ) : (
          <p className="vz">A gestão ainda não ligou a planilha de alunos.</p>
        )
      )}

      {erro && <p className="erro" style={{ margin: '0 18px 12px' }}>{erro}</p>}

      {conf && (
        <div className="frm alu-conf">
          <div className="ln">
            <label className="alu-campo">Aba
              <select className="cx" value={aba} onChange={(e) => { setAba(e.target.value); void conferir({ aba: e.target.value, mapa: {} }); }}>
                {conf.abas.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </label>
            <p className="obs" style={{ alignSelf: 'end' }}>{conf.titulo}: cabeçalho na linha {conf.leitura.linhaCabecalho}.</p>
          </div>

          <p className="alu-sub">Colunas</p>
          <p className="obs">O sistema reconheceu as colunas pelo nome. Se alguma estiver errada, troque aqui e confira de novo.</p>
          <div className="alu-mapa">
            {CAMPOS.map(({ campo, obrigatorio }) => (
              <label key={campo} className="alu-campo">
                <span>{NOME_DO_CAMPO[campo]}{obrigatorio ? ' *' : ''}</span>
                <select className="cx" value={mapa[campo] ?? ''} onChange={(e) => setMapa({ ...mapa, [campo]: e.target.value || null })}>
                  <option value="">não tem</option>
                  {conf.leitura.cabecalho.map((h, i) => h && <option key={`${h}-${i}`} value={h}>{h}</option>)}
                </select>
              </label>
            ))}
          </div>
          <div className="ln"><button className="btn" disabled={Boolean(indo)} onClick={() => void conferir({ mapa })}>Conferir de novo com estas colunas</button></div>

          <p className="alu-sub">O que a planilha diz</p>
          {c && (
            <ul className="alu-res">
              <li><b className="num">{c.total}</b> alunos, <b className="num">{c.ativos}</b> ativos.</li>
              {conf.leitura.colunaDeMarcacao && <li><b className="num">{c.marcaram}</b> marcaram a próxima semana e <b className="num">{c.naoMarcaram}</b> ainda não.</li>}
              <li><b className="num">{c.trancados}</b> trancados, <b className="num">{c.off}</b> off (inclusive quem volta num mês), <b className="num">{c.obs}</b> obs{c.inativos ? `, ${c.inativos} inativos` : ''}.</li>
              <li><b className="num">{c.comFixo}</b> ativos com horário fixo.</li>
            </ul>
          )}

          <p className="alu-sub">O que vai acontecer no sistema</p>
          <ul className="alu-res">
            <li><b className="num">{conf.plano.novos}</b> entram{conf.plano.exemplosNovos.length ? `: ${conf.plano.exemplosNovos.join(', ')}${conf.plano.novos > 5 ? '...' : ''}` : '.'}</li>
            <li><b className="num">{conf.plano.atualizados}</b> já existem e mudam{conf.plano.exemplosAtualizados.length ? `: ${conf.plano.exemplosAtualizados.join('; ')}${conf.plano.atualizados > 5 ? '...' : ''}` : '.'}</li>
            {conf.plano.iguais > 0 && <li><b className="num">{conf.plano.iguais}</b> já estão iguais.</li>}
            <li>
              <b className="num">{conf.vincular}</b> conversas sem aluno vão ficar ligadas
              {conf.vincularPeloNome ? ` (${conf.vincularPeloNome} pelo nome do contato no WhatsApp, quando só um aluno bate)` : ''}.
              {!conf.leitura.colunas.telefone && ' A planilha não tem telefone: as outras conversas se ligam no painel do contato, com um toque, e o número fica guardado no aluno.'}
            </li>
            {conf.plano.foraDaPlanilha > 0 && <li><b className="num">{conf.plano.foraDaPlanilha}</b> alunos do sistema não estão nesta planilha ({conf.plano.exemplosFora.join(', ')}). Ninguém é apagado nem desativado por isso.</li>}
          </ul>
          {conf.leitura.situacoesDesconhecidas.length > 0 && (
            <p className="obs alerta">Situações que não reconheci, tratadas como ativo: {conf.leitura.situacoesDesconhecidas.join(', ')}.</p>
          )}
          {conf.leitura.problemas.length > 0 && (
            <details className="alu-prob">
              <summary>{conf.leitura.problemas.length} {conf.leitura.problemas.length === 1 ? 'linha com problema' : 'linhas com problema'}</summary>
              <ul>{conf.leitura.problemas.slice(0, 40).map((p, i) => <li key={i}><span className="num">linha {p.linha}</span>: {p.motivo}</li>)}</ul>
            </details>
          )}

          <p className="alu-sub">As primeiras linhas, como vão entrar</p>
          <div className="alu-tab-caixa">
            <table className="rel-tab">
              <thead><tr><th>Linha</th><th>Aluno</th><th>Livro</th><th>Horário fixo</th><th>Situação</th></tr></thead>
              <tbody>
                {conf.amostra.map((a) => (
                  <tr key={a.linha}>
                    <td className="num">{a.linha}</td>
                    <td>{a.nome}{a.menor && <small>menor de idade</small>}</td>
                    <td>{a.nivel || '—'}{(a.tipoCurso && a.tipoCurso !== 'turma') || a.trilha === 'kids' ? <small>{[a.tipoCurso && a.tipoCurso !== 'turma' ? a.tipoCurso : '', a.trilha === 'kids' ? 'Kids' : ''].filter(Boolean).join(' · ')}</small> : null}</td>
                    <td>{a.horariosFixos.length ? horarioEmTexto(a.horariosFixos) : a.horarioFixoTexto || '—'}</td>
                    <td>
                      <span className={`alu-sit ${a.situacao}`}>{NOME_DA_SITUACAO[a.situacao]}</span>
                      {a.situacao === 'ativo' && typeof a.marcouSemana === 'boolean' && <small>{a.marcouSemana ? 'marcou a semana' : 'não marcou'}</small>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <label className="lig">
            <input type="checkbox" checked={automatico} onChange={(e) => setAutomatico(e.target.checked)} />
            <span><b>Atualizar sozinha de hora em hora</b>A escola continua mexendo na planilha como sempre; o sistema acompanha.</span>
          </label>
          <div className="ln">
            <button className="btn p" disabled={Boolean(indo) || !conf.leitura.total || mapa.nome === null} onClick={() => void importar()}>
              {indo === 'Importando...' ? indo : `Importar ${conf.leitura.total} alunos`}
            </button>
            {mapa.nome === null && <span className="obs alerta">Escolha a coluna do nome do aluno.</span>}
          </div>
        </div>
      )}
    </section>
  );
}
