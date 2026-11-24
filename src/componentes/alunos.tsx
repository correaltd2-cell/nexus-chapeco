'use client';
/* Alunos: a planilha de marcação da escola, dentro do sistema, ocupando a tela inteira.
   Em cima, a marcação da semana numa linha só e os filtros (as contas vão nos próprios
   filtros); o resto da tela é a planilha, com uma rolagem só, nos dois sentidos, e a
   barra de rolagem sempre à vista (pedido do cliente, 24/11/2026: "não tô conseguindo
   rolar só lá no final").
   As colunas são as da marcação (dominio/alunos.ts, COLUNAS_DA_MARCACAO). Quem é o aluno
   e como falar com ele (telefones, responsável, e-mail) mora em Cadastros, onde o aluno
   também entra; o que se cadastra lá aparece aqui na hora. */
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Ic } from '@/componentes/icones';
import GradeDeAlunos from '@/componentes/alunos-grade';
import SemanaDaMarcacao from '@/componentes/alunos-semana';
import { BarraDeSelecao, baixaCsv, horarioDe, situacaoDe, useAlunosDaEscola, type AlunoComOrigem } from '@/componentes/alunos-comum';
import { contas, normal } from '@/lib/dominio/planilha';
import { COLUNAS_DA_MARCACAO, type AlunoDaGrade } from '@/lib/dominio/alunos';

type Filtro = 'ativos' | 'nao_marcaram' | 'trancados' | 'off' | 'obs' | 'inativos' | 'todos';

export default function Alunos() {
  const { alunos, carregou, conversaDe, veConversas, podeEditar, podeApagar } = useAlunosDaEscola();
  const [filtro, setFiltro] = useState<Filtro>('ativos');
  const [trilha, setTrilha] = useState<'todas' | 'adultos' | 'kids'>('todas');
  const [semConversa, setSemConversa] = useState(false);
  const [busca, setBusca] = useState('');
  const [selecionados, setSelecionados] = useState<Set<string>>(() => new Set());

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
    && (!termo || normal(`${a.nome} ${a.codigo || ''} ${a.responsavelNome || ''} ${a.nivel} ${a.livroOriginal || ''} ${horarioDe(a)} ${a.professorDoLivro || ''} ${a.observacao || ''}`).includes(termo)
      || (digitos.length >= 4 && `${a.telefone} ${a.responsavelTelefone || ''}`.includes(digitos))));

  const filtros: { k: Filtro; r: string; n: number; alerta?: boolean }[] = [
    { k: 'ativos', r: 'Ativos', n: conta.ativos },
    ...(temMarcacao ? [{ k: 'nao_marcaram' as Filtro, r: 'Não marcaram', n: conta.naoMarcaram, alerta: conta.naoMarcaram > 0 }] : []),
    { k: 'trancados', r: 'Trancados', n: conta.trancados },
    { k: 'off', r: 'Off', n: conta.off },
    { k: 'obs', r: 'Obs', n: conta.obs },
    ...(conta.inativos ? [{ k: 'inativos' as Filtro, r: 'Inativos', n: conta.inativos }] : []),
    { k: 'todos', r: 'Todos', n: conta.total },
  ];
  const verQuemNaoMarcou = () => { setFiltro('nao_marcaram'); setTrilha('todas'); setBusca(''); setSemConversa(false); };

  return (
    <div className="alu alu-tela">
      <header className="vh alu-h">
        <h1>Alunos</h1>
        <span className="alu-h-sub">Planilha de marcação</span>
        <div className="alu-acoes">
          <button type="button" className="btn" onClick={() => baixaCsv(visiveis, conversaDe, `alunos-${filtro}`)} disabled={!visiveis.length}>
            <Ic n="doc" />Baixar CSV
          </button>
          {podeEditar && <Link className="btn p" href="/cadastros?novo=1"><Ic n="mais" />Cadastrar aluno</Link>}
        </div>
      </header>

      {temMarcacao && <SemanaDaMarcacao alunos={alunos as AlunoDaGrade[]} aoVerQuemNaoMarcou={verQuemNaoMarcou} />}

      <div className="alu-filtros">
        <div className="chips" role="group" aria-label="Situação">
          {filtros.map((f) => (
            <button key={f.k} type="button" className={`chip${f.alerta ? ' alu-chip-alerta' : ''}`} aria-pressed={filtro === f.k} onClick={() => setFiltro(f.k)}>
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
          <input value={busca} placeholder="Procurar por nome, código, livro, horário ou observação" aria-label="Procurar aluno"
                 onChange={(e) => setBusca(e.target.value)} />
        </label>
        <span className="ag-conta num">{visiveis.length} {visiveis.length === 1 ? 'aluno' : 'alunos'}</span>
      </div>

      <BarraDeSelecao selecionados={selecionados} alunos={visiveis} podeApagar={podeApagar} aoLimpar={() => setSelecionados(new Set())} />

      {!carregou ? (
        <p className="vz alu-vazio" role="status">Carregando os alunos...</p>
      ) : !alunos.length ? (
        <div className="vz alu-vazio">
          <p>A planilha de marcação ainda está vazia.</p>
          <p>Cadastre os alunos em Cadastros, um a um ou trazendo a planilha que a escola já usa (Excel ou CSV): eles aparecem aqui na hora.</p>
          {podeEditar && <Link className="btn p" href="/cadastros?novo=1"><Ic n="mais" />Cadastrar aluno</Link>}
        </div>
      ) : !visiveis.length ? (
        <p className="vz alu-vazio">Nenhum aluno com esse filtro.</p>
      ) : (
        <GradeDeAlunos colunas={COLUNAS_DA_MARCACAO} chave="marcacao" alunos={visiveis as AlunoDaGrade[]} todos={alunos as AlunoDaGrade[]}
                       podeEditar={podeEditar} conversaDe={veConversas ? conversaDe : undefined}
                       selecionados={selecionados} aoSelecionar={podeApagar ? setSelecionados : undefined} />
      )}
    </div>
  );
}
