'use client';
/* Alunos: a planilha de alunos da escola, dentro do sistema.
   Em cima, as contas que o painel da planilha antiga fazia (ativos, quem marcou a semana,
   quem não marcou, trancados, off, obs) e a marcação da semana; embaixo, os alunos, na
   planilha editável (as colunas da aba ATIVOS) ou na lista com o detalhe de cada um.
   A carga inicial vem do arquivo que a escola já tem (Excel ou CSV), conferida antes de
   gravar; a ligação com a planilha do Google fica guardada para depois.
   Regras: dominio/alunos.ts (célula, aluno novo, semana) e dominio/planilha.ts (leitura). */
import { Fragment, useEffect, useMemo, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { assina, cria } from '@/lib/dados/fonte';
import { useSessao } from '@/componentes/sessao';
import { avisa } from '@/componentes/aviso';
import { Ic } from '@/componentes/icones';
import GradeDeAlunos from '@/componentes/alunos-grade';
import SemanaDaMarcacao from '@/componentes/alunos-semana';
import { PlanilhaDoGoogle, TrazerDeArquivo } from '@/componentes/alunos-importar';
import { NOME_DA_SITUACAO, contas, horarioEmTexto, normal, type AlunoDoSistema, type SituacaoAluno } from '@/lib/dominio/planilha';
import { dataCompleta, novoAluno, type AlunoDaGrade } from '@/lib/dominio/alunos';
import { alunosDoContato } from '@/lib/dominio/contato';
import { csv } from '@/lib/dominio/agenda';
import { telefoneLegivel } from '@/lib/dominio/formato';
import type { Aluno, Conversa } from '@/lib/dominio/tipos';

type AlunoComOrigem = Aluno & { teste?: boolean };
type Filtro = 'ativos' | 'nao_marcaram' | 'trancados' | 'off' | 'obs' | 'inativos' | 'todos';

const VE_TODAS = ['admin', 'gestor', 'recepcao'];
const EDITA = ['admin', 'gestor', 'recepcao', 'coordenacao'];
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
  const [vista, setVista] = useState<'planilha' | 'lista'>('planilha');
  const [importando, setImportando] = useState(false);
  const [novoNome, setNovoNome] = useState<string | null>(null);
  const [destaque, setDestaque] = useState<string | null>(null);
  const [googleAberto, setGoogleAberto] = useState(false);
  const veConversas = Boolean(perfil && VE_TODAS.includes(perfil.papel));
  const podeEditar = Boolean(perfil && EDITA.includes(perfil.papel));

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

  /* o que a importação compara: os alunos e as conversas como estão agora */
  const paraImportar = useMemo(() => ({
    alunos: alunos as unknown as AlunoDoSistema[],
    conversas: conversas.map((c) => ({ id: c.id, waId: c.waId, nome: c.nome, alunoId: c.alunoId })),
  }), [alunos, conversas]);

  async function criaAluno(e: FormEvent) {
    e.preventDefault();
    const r = novoAluno(novoNome || '', new Date().toISOString());
    if ('erro' in r) { avisa(r.erro); return; }
    try {
      const id = await cria('alunos', r.campos);
      /* o aluno novo aparece: limpa o que o esconderia e leva o foco para a linha dele */
      setFiltro('ativos'); setTrilha('todas'); setSemConversa(false); setBusca(''); setVista('planilha');
      setNovoNome(null); setDestaque(id);
      setTimeout(() => setDestaque((d) => (d === id ? null : d)), 5000);
      avisa(`${String(r.campos.nome)} entrou. Preencha o código, o livro e o horário.`);
    } catch {
      avisa('Não consegui criar o aluno. Confira a internet e tente de novo.');
    }
  }

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
      a.saude ? NOME_DA_SAUDE[a.saude] : '', sim(a.appAtivo), sim(a.nexiaAtivo), sim(a.pendenciaLivro), a.contratoFim ? dataCompleta(a.contratoFim) : '',
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
        <div className="alu-acoes">
          {veConversas && alunos.length > 0 && !importando && (
            <button type="button" className="btn" onClick={() => setImportando(true)}><Ic n="doc" />Trazer de um arquivo</button>
          )}
          {podeEditar && (
            <button type="button" className="btn p" onClick={() => setNovoNome(novoNome === null ? '' : null)}><Ic n="mais" />Novo aluno</button>
          )}
        </div>
      </header>
      <div className="alu-corpo">
        {alunos.length > 0 && (
          <section className="rel-kpis alu-kpis" aria-label="Contas dos alunos">
            {([
              ['Ativos', conta.ativos, `de ${conta.total} alunos`, 'ativos'],
              ...(temMarcacao ? [['Não marcaram', conta.naoMarcaram, 'ativos sem aula marcada', 'nao_marcaram']] : []),
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

        {temMarcacao && <SemanaDaMarcacao alunos={alunos as AlunoDaGrade[]} aoVerQuemNaoMarcou={() => { setFiltro('nao_marcaram'); setTrilha('todas'); setBusca(''); setSemConversa(false); }} />}

        {veConversas && (importando || !alunos.length) && (
          importando ? (
            <TrazerDeArquivo alunos={paraImportar.alunos} conversas={paraImportar.conversas} aoFechar={() => setImportando(false)} />
          ) : (
            <section className="bl alu-pl alu-convite">
              <p className="bt">Começar a planilha de alunos</p>
              <div className="frm">
                <p className="alu-pl-linha">
                  <Ic n="doc" />
                  <span>
                    Traga a planilha que a escola já usa (a de marcação, aba ATIVOS) em Excel ou CSV: o sistema reconhece as colunas,
                    mostra o que vai entrar e só grava quando você mandar. Depois a lista mora aqui e se edita como planilha.
                  </span>
                </p>
                <div className="ln"><button type="button" className="btn p" onClick={() => setImportando(true)}><Ic n="doc" />Trazer de um arquivo</button></div>
              </div>
            </section>
          )
        )}

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
            <div className="chips alu-vista" role="group" aria-label="Como mostrar">
              <button type="button" className="chip" aria-pressed={vista === 'planilha'} onClick={() => setVista('planilha')}><Ic n="grade" />Planilha</button>
              <button type="button" className="chip" aria-pressed={vista === 'lista'} onClick={() => setVista('lista')}><Ic n="lista" />Lista</button>
            </div>
            <button className="btn" onClick={baixa} disabled={!visiveis.length}><Ic n="doc" />Baixar CSV</button>
          </div>

          {novoNome !== null && (
            <form className="alu-novo" onSubmit={(e) => void criaAluno(e)}>
              <label className="alu-campo">Nome do aluno
                <input className="cx" value={novoNome} autoFocus placeholder="Nome e sobrenome (escreva - menor no fim se for menor de idade)"
                       onChange={(e) => setNovoNome(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape') setNovoNome(null); }} />
              </label>
              <button type="submit" className="btn p" disabled={!novoNome.trim()}>Criar aluno</button>
              <button type="button" className="btn" onClick={() => setNovoNome(null)}>Cancelar</button>
            </form>
          )}

          {!alunos.length ? (
            <p className="vz">Nenhum aluno no sistema ainda. Traga a planilha da escola aqui em cima ou toque em Novo aluno: a lista aparece aqui e as conversas se ligam aos alunos.</p>
          ) : !visiveis.length ? (
            <p className="vz">Nenhum aluno com esse filtro.</p>
          ) : vista === 'planilha' ? (
            <GradeDeAlunos alunos={visiveis as AlunoDaGrade[]} todos={alunos as AlunoDaGrade[]} podeEditar={podeEditar}
                           conversaDe={veConversas ? conversaDe : undefined} destaque={destaque} />
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
                                  {a.contratoFim ? `${vencido ? 'venceu' : 'vence'} em ${dataCompleta(a.contratoFim)}` : 'sem data de fim na planilha'}{a.contratoAssinado ? ' · assinado' : ''}
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

        {veConversas && (
          <details className="bl alu-google" onToggle={(e) => setGoogleAberto((e.target as HTMLDetailsElement).open)}>
            <summary><Ic n="lista" />Ligar a planilha do Google <span>fica para depois</span></summary>
            {googleAberto && <PlanilhaDoGoogle />}
          </details>
        )}
      </div>
    </div>
  );
}
