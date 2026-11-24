'use client';
/* Cadastros, parte Alunos: onde o aluno entra na escola (pedido do cliente, 24/11/2026:
   "essa aba de cadastro é onde que eu vou cadastrar o aluno. Cadastrando o aluno, ele já
   cai dentro da planilha de marcação").
   - A ficha (ao lado da planilha no computador, por cima no celular) cadastra um aluno
     com tudo o que se sabe dele; cada campo passa pela mesma regra da célula
     (dominio/alunos.ts, cadastroDoAluno). Ele nasce ativo, sem marcar a semana.
   - A planilha do cadastro mostra quem é cada aluno e como falar com ele (telefones,
     responsável, e-mail, nascimento, CPF), editável como a de marcação.
   - Daqui também se traz a planilha da escola de um arquivo, e fica guardada a ligação
     com a planilha do Google, para depois. */
import { useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { cria } from '@/lib/dados/fonte';
import { avisa } from '@/componentes/aviso';
import { Ic } from '@/componentes/icones';
import GradeDeAlunos from '@/componentes/alunos-grade';
import { PlanilhaDoGoogle, TrazerDeArquivo } from '@/componentes/alunos-importar';
import { BarraDeSelecao, baixaCsv, situacaoDe, useAlunosDaEscola } from '@/componentes/alunos-comum';
import { COLUNAS_DO_CADASTRO, NOME_DA_MODALIDADE, cadastroDoAluno, type AlunoDaGrade, type FichaDoAluno } from '@/lib/dominio/alunos';
import { normal, type AlunoDoSistema } from '@/lib/dominio/planilha';

type Filtro = 'todos' | 'ativos' | 'sem_telefone' | 'menores';
type Painel = 'ficha' | 'arquivo' | 'google' | null;

const FICHA_VAZIA: FichaDoAluno = {
  nome: '', menor: false, codigo: '', nascimento: '', documento: '', telefone: '', email: '', responsavelNome: '', responsavelTelefone: '',
  livroOriginal: '', modalidade: '', horarioFixoTexto: '', contratoFim: '', contratoAssinado: false, observacao: '',
};

export default function CadastroDeAlunos({ abrirFicha }: { abrirFicha: boolean }) {
  const { alunos, carregou, conversas, conversaDe, veConversas, podeEditar, podeApagar } = useAlunosDaEscola();
  const [painel, setPainel] = useState<Painel>(abrirFicha ? 'ficha' : null);
  const [ficha, setFicha] = useState<FichaDoAluno>(FICHA_VAZIA);
  const [entrou, setEntrou] = useState<{ id: string; nome: string } | null>(null);
  const [destaque, setDestaque] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [busca, setBusca] = useState('');
  const [selecionados, setSelecionados] = useState<Set<string>>(() => new Set());
  const [gravando, setGravando] = useState(false);
  const nomeRef = useRef<HTMLInputElement>(null);

  const muda = (k: keyof FichaDoAluno, v: string | boolean) => setFicha((f) => ({ ...f, [k]: v }));

  async function cadastra(e: FormEvent) {
    e.preventDefault();
    const r = cadastroDoAluno(ficha, alunos as AlunoDaGrade[], new Date().toISOString());
    if ('erro' in r) { avisa(r.erro); return; }
    setGravando(true);
    try {
      const id = await cria('alunos', r.campos);
      const nome = String(r.campos.nome);
      setEntrou({ id, nome });
      setFicha(FICHA_VAZIA);
      setFiltro('todos'); setBusca('');
      setDestaque(id);
      setTimeout(() => setDestaque((d) => (d === id ? null : d)), 5000);
      avisa(`${nome} entrou na planilha de marcação`);
      nomeRef.current?.focus();
    } catch {
      avisa('Não consegui cadastrar. Confira a internet e tente de novo.');
    } finally {
      setGravando(false);
    }
  }

  const termo = normal(busca);
  const digitos = busca.replace(/\D/g, '');
  const visiveis = alunos.filter((a) => (filtro === 'todos' || (filtro === 'ativos' && situacaoDe(a) === 'ativo')
      || (filtro === 'sem_telefone' && !a.telefone && !a.responsavelTelefone) || (filtro === 'menores' && a.menor))
    && (!termo || normal(`${a.nome} ${a.codigo || ''} ${a.responsavelNome || ''} ${a.email || ''} ${a.livroOriginal || ''}`).includes(termo)
      || (digitos.length >= 4 && `${a.telefone} ${a.responsavelTelefone || ''} ${a.documento || ''}`.includes(digitos))));
  const conta = {
    todos: alunos.length,
    ativos: alunos.filter((a) => situacaoDe(a) === 'ativo').length,
    sem_telefone: alunos.filter((a) => !a.telefone && !a.responsavelTelefone).length,
    menores: alunos.filter((a) => a.menor).length,
  };
  const ROTULO: Record<Filtro, string> = { todos: 'Todos', ativos: 'Ativos', sem_telefone: 'Sem telefone', menores: 'Menores' };

  const campo = (k: keyof FichaDoAluno, rotulo: string, extra: { tipo?: string; dica?: string; modo?: 'tel' | 'email' | 'numeric'; largo?: boolean } = {}) => (
    <label className={`alu-campo${extra.largo ? ' largo' : ''}`}>
      {rotulo}
      <input className="cx" type={extra.tipo || 'text'} inputMode={extra.modo} value={String(ficha[k] ?? '')} placeholder={extra.dica}
             ref={k === 'nome' ? nomeRef : undefined} autoFocus={k === 'nome'} required={k === 'nome'}
             onChange={(e) => muda(k, e.target.value)} />
    </label>
  );

  return (
    <div className="alu-cad">
      <div className="alu-cad-acoes">
        {podeEditar && (
          <button type="button" className="btn p" aria-pressed={painel === 'ficha'} onClick={() => setPainel(painel === 'ficha' ? null : 'ficha')}>
            <Ic n="mais" />Cadastrar aluno
          </button>
        )}
        {veConversas && (
          <button type="button" className="btn" aria-pressed={painel === 'arquivo'} onClick={() => setPainel(painel === 'arquivo' ? null : 'arquivo')}>
            <Ic n="doc" />Trazer de um arquivo
          </button>
        )}
        {veConversas && (
          <button type="button" className="tx-btn" aria-pressed={painel === 'google'} onClick={() => setPainel(painel === 'google' ? null : 'google')}>
            Planilha do Google <small>para depois</small>
          </button>
        )}
        <button type="button" className="btn alu-cad-csv" onClick={() => baixaCsv(visiveis, conversaDe, 'cadastro-de-alunos')} disabled={!visiveis.length}>
          <Ic n="doc" />Baixar CSV
        </button>
      </div>

      {(painel === 'arquivo' || painel === 'google') && (
        <div className="alu-cad-painel">
          {painel === 'arquivo' ? (
            <TrazerDeArquivo alunos={alunos as unknown as AlunoDoSistema[]}
                             conversas={conversas.map((c) => ({ id: c.id, waId: c.waId, nome: c.nome, alunoId: c.alunoId }))}
                             aoFechar={() => setPainel(null)} />
          ) : (
            <section className="bl alu-google">
              <p className="bt alu-pl-cab">Ligar a planilha do Google <button type="button" className="tx-btn" onClick={() => setPainel(null)}>Fechar</button></p>
              <PlanilhaDoGoogle />
            </section>
          )}
        </div>
      )}

      <div className={`alu-cad-corpo${painel === 'ficha' ? ' com-ficha' : ''}`}>
        <div className="alu-cad-lista">
          <div className="alu-filtros">
            <div className="chips" role="group" aria-label="Quais alunos">
              {(Object.keys(ROTULO) as Filtro[]).map((f) => (
                <button key={f} type="button" className="chip" aria-pressed={filtro === f} onClick={() => setFiltro(f)}>
                  {ROTULO[f]}<span className="num">{conta[f]}</span>
                </button>
              ))}
            </div>
            <label className="alu-busca">
              <Ic n="busca" />
              <input value={busca} placeholder="Procurar por nome, código, responsável, e-mail, telefone ou CPF" aria-label="Procurar aluno"
                     onChange={(e) => setBusca(e.target.value)} />
            </label>
            <span className="ag-conta num">{visiveis.length} {visiveis.length === 1 ? 'aluno' : 'alunos'}</span>
          </div>

          <BarraDeSelecao selecionados={selecionados} alunos={visiveis} podeApagar={podeApagar} aoLimpar={() => setSelecionados(new Set())} />

          {!carregou ? (
            <p className="vz alu-vazio" role="status">Carregando os alunos...</p>
          ) : !alunos.length ? (
            <div className="vz alu-vazio">
              <p>Nenhum aluno cadastrado ainda.</p>
              <p>Toque em Cadastrar aluno para o primeiro, ou traga a planilha que a escola já usa (a de marcação, aba ATIVOS) em Excel ou CSV: o sistema mostra o que vai entrar antes de gravar.</p>
            </div>
          ) : !visiveis.length ? (
            <p className="vz alu-vazio">Nenhum aluno com esse filtro.</p>
          ) : (
            <GradeDeAlunos colunas={COLUNAS_DO_CADASTRO} chave="cadastro" alunos={visiveis as AlunoDaGrade[]} todos={alunos as AlunoDaGrade[]}
                           podeEditar={podeEditar} conversaDe={veConversas ? conversaDe : undefined} destaque={destaque}
                           selecionados={selecionados} aoSelecionar={podeApagar ? setSelecionados : undefined} />
          )}
        </div>

        {painel === 'ficha' && podeEditar && (
          <>
            <button type="button" className="alu-ficha-fundo" aria-label="Fechar a ficha" tabIndex={-1} onClick={() => setPainel(null)} />
            <form className="alu-ficha" onSubmit={(e) => void cadastra(e)} aria-label="Cadastrar aluno"
                  onKeyDown={(e) => { if (e.key === 'Escape') setPainel(null); }}>
              <div className="alu-ficha-cab">
                <p className="alu-ficha-tit">Cadastrar aluno</p>
                <button type="button" className="ib" aria-label="Fechar a ficha" onClick={() => setPainel(null)}><Ic n="x" /></button>
              </div>
              <div className="alu-ficha-corpo">
                {entrou && (
                  <p className="alu-ficha-ok" role="status">
                    <Ic n="check" /><span><b>{entrou.nome}</b> entrou na planilha de marcação. <Link href="/alunos">Ver na marcação</Link></span>
                  </p>
                )}
                <p className="alu-sub">Aluno</p>
                {campo('nome', 'Nome do aluno', { dica: 'Nome e sobrenome', largo: true })}
                <label className="lig alu-ficha-menor">
                  <input type="checkbox" checked={ficha.menor === true} onChange={(e) => muda('menor', e.target.checked)} />
                  <span><b>Menor de idade</b>Aparece como &quot;- menor&quot; ao lado do nome, e quem fala no WhatsApp é o responsável.</span>
                </label>
                <div className="alu-ficha-par">
                  {campo('codigo', 'Código', { dica: 'COD da planilha' })}
                  {campo('nascimento', 'Nascimento', { tipo: 'date' })}
                </div>
                {campo('documento', 'CPF', { dica: '123.456.789-01', modo: 'numeric' })}

                <p className="alu-sub">Contato</p>
                {ficha.menor === true ? (
                  <>
                    {campo('responsavelNome', 'Responsável', { dica: 'Quem responde pelo aluno', largo: true })}
                    {campo('responsavelTelefone', 'Telefone do responsável', { dica: '49 99912-3456', modo: 'tel' })}
                    {campo('telefone', 'Telefone do aluno, se tiver', { dica: '49 99912-3456', modo: 'tel' })}
                  </>
                ) : (
                  <>
                    {campo('telefone', 'Telefone (WhatsApp)', { dica: '49 99912-3456', modo: 'tel' })}
                    {campo('responsavelNome', 'Responsável, se tiver', { dica: 'Quem paga ou responde pelo aluno' })}
                    {ficha.responsavelNome ? campo('responsavelTelefone', 'Telefone do responsável', { dica: '49 99912-3456', modo: 'tel' }) : null}
                  </>
                )}
                {campo('email', 'E-mail', { dica: 'nome@gmail.com', modo: 'email' })}

                <p className="alu-sub">Curso</p>
                {campo('livroOriginal', 'Livro', { dica: 'Como na planilha: A2, B1 PRIVATE NATHAN, NEXUS JUNIOR LIVRO 2' })}
                <div className="alu-ficha-par">
                  <label className="alu-campo">
                    Modalidade
                    <select className="cx" value={String(ficha.modalidade || '')} onChange={(e) => muda('modalidade', e.target.value)}>
                      <option value="">Escolher</option>
                      {Object.entries(NOME_DA_MODALIDADE).map(([v, n]) => <option key={v} value={v}>{n}</option>)}
                    </select>
                  </label>
                  {campo('contratoFim', 'Fim do contrato', { tipo: 'date' })}
                </div>
                {campo('horarioFixoTexto', 'Horário fixo', { dica: 'quartas às 13h30' })}
                <label className="lig">
                  <input type="checkbox" checked={ficha.contratoAssinado === true} onChange={(e) => muda('contratoAssinado', e.target.checked)} />Contrato assinado
                </label>

                <label className="alu-campo largo">
                  Observação
                  <textarea className="cx" rows={3} value={String(ficha.observacao ?? '')} onChange={(e) => muda('observacao', e.target.value)} />
                </label>
              </div>
              <div className="alu-ficha-pe">
                <button type="submit" className="btn p" disabled={gravando || !String(ficha.nome || '').trim()}>{gravando ? 'Cadastrando...' : 'Cadastrar aluno'}</button>
                <button type="button" className="btn" onClick={() => { setFicha(FICHA_VAZIA); setEntrou(null); nomeRef.current?.focus(); }}>Limpar</button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
