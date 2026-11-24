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
     com a planilha do Google, para depois.
   - Cadastrar pelo contrato (24/11/2026): o contrato (PDF, Word ou foto) sobe para a pasta
     do aluno no Storage, /api/alunos/contrato lê com a IA, e dominio/contrato.ts vira a
     ficha (fim do contrato e menor pela regra). A recepção confere e cadastra; o arquivo
     fica guardado no aluno e abre pela coluna Contrato. */
import { useRef, useState, type DragEvent, type FormEvent } from 'react';
import Link from 'next/link';
import { ref as refArquivo, uploadBytes } from 'firebase/storage';
import { cria, define, modoDemo, novoId } from '@/lib/dados/fonte';
import { arquivos } from '@/lib/firebase/cliente';
import { useSessao } from '@/componentes/sessao';
import { avisa } from '@/componentes/aviso';
import { Ic } from '@/componentes/icones';
import GradeDeAlunos from '@/componentes/alunos-grade';
import { PlanilhaDoGoogle, TrazerDeArquivo } from '@/componentes/alunos-importar';
import { BarraDeSelecao, baixaCsv, situacaoDe, useAlunosDaEscola } from '@/componentes/alunos-comum';
import { COLUNAS_DO_CADASTRO, NOME_DA_MODALIDADE, cadastroDoAluno, cpfLegivel, proximoCodigo, type AlunoDaGrade, type FichaDoAluno } from '@/lib/dominio/alunos';
import { telefoneLegivel } from '@/lib/dominio/formato';
import { normal, type AlunoDoSistema } from '@/lib/dominio/planilha';
import { CONTRATO_DE_EXEMPLO, caminhoDoContrato, fichaDoContrato, tipoDoContrato, type LidoDoContrato } from '@/lib/dominio/contrato';
import { reduzParaLer } from '@/lib/dominio/foto';
import ProvasDoAluno from '@/componentes/provas-portal';
import { alunosDoContato } from '@/lib/dominio/contato';
import { podeNoPortal } from '@/lib/dominio/provas-portal';

type Filtro = 'todos' | 'ativos' | 'sem_telefone' | 'menores';
type Painel = 'ficha' | 'arquivo' | 'google' | null;
interface Contrato { alunoId: string; caminho: string; nome: string }
type Leitura =
  | { estado: 'lendo'; nome: string }
  | { estado: 'pronto'; nome: string; faltou: string[]; avisos: string[]; demo: boolean }
  | { estado: 'erro'; nome: string; mensagem: string };
const ACEITA = '.pdf,.docx,image/jpeg,image/png,image/webp,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document';

const FICHA_VAZIA: FichaDoAluno = {
  nome: '', menor: false, codigo: '', nascimento: '', documento: '', telefone: '', email: '', endereco: '', responsavelNome: '', responsavelTelefone: '',
  livroOriginal: '', modalidade: '', horarioFixoTexto: '', contratoFim: '', contratoAssinado: false, observacao: '',
};

export default function CadastroDeAlunos({ abrirFicha }: { abrirFicha: boolean }) {
  const { alunos, carregou, conversas, conversaDe, veConversas, podeEditar, podeApagar } = useAlunosDaEscola();
  const { usuario, perfil } = useSessao();
  const [provasDe, setProvasDe] = useState<string | null>(null);
  const veProvas = podeNoPortal(perfil?.papel, 'consultar');
  const [contrato, setContrato] = useState<Contrato | null>(null);
  const [leitura, setLeitura] = useState<Leitura | null>(null);
  const escolhe = useRef<HTMLInputElement>(null);
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

  const recomeca = () => { setFicha(FICHA_VAZIA); setContrato(null); setLeitura(null); };

  /** O contrato escolhido (ou arrastado): sobe, a IA lê, a ficha se preenche. */
  async function leContrato(arquivo: File) {
    const tipo = tipoDoContrato(arquivo.name, arquivo.type);
    setPainel('ficha');
    setEntrou(null);
    if (!tipo) { setLeitura({ estado: 'erro', nome: arquivo.name, mensagem: 'Esse tipo de arquivo não dá para ler. Use PDF, Word (.docx) ou foto (JPG ou PNG).' }); return; }
    setLeitura({ estado: 'lendo', nome: arquivo.name });
    const agora = new Date().toISOString();
    const preenche = (lido: LidoDoContrato, demo: boolean) => {
      const { ficha: lida, faltou, avisos } = fichaDoContrato(lido, agora);
      /* o que veio do contrato vale por cima; código e horário digitados ficam */
      const legivel = (t: unknown) => (t ? telefoneLegivel(String(t)) : '');
      setFicha((f) => ({
        ...FICHA_VAZIA, ...lida, codigo: f.codigo || '', horarioFixoTexto: f.horarioFixoTexto || '',
        documento: cpfLegivel(String(lida.documento || '')), telefone: legivel(lida.telefone), responsavelTelefone: legivel(lida.responsavelTelefone),
      }));
      setLeitura({ estado: 'pronto', nome: arquivo.name, faltou, avisos, demo });
    };
    /* na demonstração e na simulação nada sai do aparelho: a ficha vem com um exemplo */
    if (modoDemo) {
      await new Promise((ok) => setTimeout(ok, 900));
      preenche(CONTRATO_DE_EXEMPLO, true);
      return;
    }
    if (!usuario) return;
    try {
      const pronto = tipo === 'imagem' ? await reduzParaLer(arquivo) : arquivo;
      const alunoId = contrato?.alunoId || novoId('alunos');
      const caminho = caminhoDoContrato(alunoId, pronto.name, agora);
      await uploadBytes(refArquivo(arquivos(), caminho), pronto, { contentType: pronto.type || undefined });
      setContrato({ alunoId, caminho, nome: arquivo.name });
      const r = await fetch('/api/alunos/contrato', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${await usuario.getIdToken()}` },
        body: JSON.stringify({ caminho }),
      });
      const j = (await r.json()) as { ok: boolean; erro?: string; lido?: LidoDoContrato };
      if (!j.ok || !j.lido) { setLeitura({ estado: 'erro', nome: arquivo.name, mensagem: j.erro || 'Não consegui ler o contrato.' }); return; }
      preenche(j.lido, false);
    } catch (e) {
      const foto = e instanceof Error && e.message === 'foto';
      setLeitura({
        estado: 'erro', nome: arquivo.name,
        mensagem: foto ? 'Não consegui abrir essa foto (o formato do iPhone às vezes não abre aqui). Mande em JPG, PNG ou PDF.'
          : 'Não consegui mandar o contrato. Confira a internet e tente de novo.',
      });
    }
  }

  function solta(e: DragEvent) {
    e.preventDefault();
    const arquivo = e.dataTransfer.files?.[0];
    if (arquivo) void leContrato(arquivo);
  }

  async function cadastra(e: FormEvent) {
    e.preventDefault();
    const agora = new Date().toISOString();
    const r = cadastroDoAluno(ficha, alunos as AlunoDaGrade[], agora);
    if ('erro' in r) { avisa(r.erro); return; }
    setGravando(true);
    try {
      /* com contrato, o aluno nasce com o id da pasta onde o contrato já está */
      const campos = contrato?.caminho ? { ...r.campos, contratoArquivo: { caminho: contrato.caminho, nome: contrato.nome, enviadoEm: agora } } : r.campos;
      let id = contrato?.alunoId || '';
      if (id) await define('alunos', id, campos); else id = await cria('alunos', campos);
      const nome = String(r.campos.nome);
      setEntrou({ id, nome });
      recomeca();
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
      {podeEditar && (
        <input ref={escolhe} type="file" accept={ACEITA} className="alu-arquivo" aria-hidden="true" tabIndex={-1}
               onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void leContrato(f); }} />
      )}
      <div className="alu-cad-acoes">
        {podeEditar && (
          <button type="button" className="btn p" aria-pressed={painel === 'ficha'} onClick={() => setPainel(painel === 'ficha' ? null : 'ficha')}>
            <Ic n="mais" />Cadastrar aluno
          </button>
        )}
        {podeEditar && (
          <button type="button" className="btn" onClick={() => escolhe.current?.click()}>
            <Ic n="ficha" />Cadastrar pelo contrato
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
                           selecionados={selecionados} aoSelecionar={podeApagar ? setSelecionados : undefined}
                           aoAbrirProvas={veProvas ? (a) => setProvasDe(a.id) : undefined} />
          )}
        </div>

        {painel === 'ficha' && podeEditar && (
          <>
            <button type="button" className="alu-ficha-fundo" aria-label="Fechar a ficha" tabIndex={-1} onClick={() => setPainel(null)} />
            <form className="alu-ficha" onSubmit={(e) => void cadastra(e)} aria-label="Cadastrar aluno"
                  onKeyDown={(e) => { if (e.key === 'Escape') setPainel(null); }}
                  onDragOver={(e) => e.preventDefault()} onDrop={solta}>
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
                <div className={`alu-contrato${leitura ? ` ${leitura.estado}` : ''}`} aria-live="polite">
                  {!leitura && (
                    <>
                      <Ic n="ficha" />
                      <span className="alu-contrato-txt"><b>Cadastrar pelo contrato</b>Suba o contrato em PDF, Word ou foto (ou arraste aqui): a ficha se preenche sozinha e você só confere.</span>
                      <button type="button" className="btn" onClick={() => escolhe.current?.click()}>Escolher contrato</button>
                    </>
                  )}
                  {leitura?.estado === 'lendo' && (
                    <p className="alu-contrato-txt" role="status"><span className="alu-roda" aria-hidden="true" /><span><b>Lendo o contrato</b>{leitura.nome}: leva uns segundos.</span></p>
                  )}
                  {leitura?.estado === 'pronto' && (
                    <div className="alu-contrato-txt">
                      <b><Ic n="check" />Ficha preenchida pelo contrato</b>
                      <span>Confira os campos e toque em Cadastrar aluno.{contrato?.caminho ? ' O contrato fica guardado no cadastro do aluno.' : ''}</span>
                      {leitura.faltou.length > 0 && <span className="alu-contrato-faltou">Não achei no contrato: {leitura.faltou.join(', ')}.</span>}
                      {leitura.avisos.map((a) => <span key={a} className="alu-contrato-faltou">{a}</span>)}
                      {leitura.demo && <span className="obs">Na demonstração o contrato não é lido de verdade: a ficha vem com um exemplo fictício.</span>}
                      <button type="button" className="tx-btn" onClick={() => escolhe.current?.click()}>Trocar o contrato</button>
                    </div>
                  )}
                  {leitura?.estado === 'erro' && (
                    <div className="alu-contrato-txt">
                      <b>Não deu para ler {leitura.nome}</b>
                      <span className="erro">{leitura.mensagem}</span>
                      <button type="button" className="tx-btn" onClick={() => escolhe.current?.click()}>Escolher outro arquivo</button>
                    </div>
                  )}
                </div>
                <p className="alu-sub">Aluno</p>
                {campo('nome', 'Nome do aluno', { dica: 'Nome e sobrenome', largo: true })}
                <label className="lig alu-ficha-menor">
                  <input type="checkbox" checked={ficha.menor === true} onChange={(e) => muda('menor', e.target.checked)} />
                  <span><b>Menor de idade</b>Aparece como &quot;- menor&quot; ao lado do nome, e quem fala no WhatsApp é o responsável.</span>
                </label>
                <div className="alu-ficha-par">
                  {campo('codigo', 'Código', { dica: `Automático: ${proximoCodigo(alunos)}`, modo: 'numeric' })}
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
                {campo('endereco', 'Endereço', { dica: 'Rua, número, bairro, cidade e CEP', largo: true })}

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
                <button type="button" className="btn" onClick={() => { recomeca(); setEntrou(null); nomeRef.current?.focus(); }}>Limpar</button>
              </div>
            </form>
          </>
        )}
      </div>
      {provasDe && (() => {
        const a = alunos.find((x) => x.id === provasDe);
        if (!a) return null;
        const dele = conversas.filter((c) => alunosDoContato([a], c).length > 0);
        return (
          <>
            <button type="button" className="alu-gaveta-fundo" aria-label="Fechar as provas" tabIndex={-1} onClick={() => setProvasDe(null)} />
            <aside className="alu-gaveta" aria-label={`Provas de ${a.nome}`} onKeyDown={(e) => { if (e.key === 'Escape') setProvasDe(null); }}>
              <div className="alu-ficha-cab">
                <p className="alu-ficha-tit">Provas de {a.nome.split(' ')[0]}<small>{a.nome}{a.codigo ? ` · cód. ${a.codigo}` : ''}</small></p>
                <button type="button" className="ib" aria-label="Fechar as provas" onClick={() => setProvasDe(null)}><Ic n="x" /></button>
              </div>
              <div className="alu-ficha-corpo">
                <ProvasDoAluno key={a.id} aluno={a} conversas={dele} conversaInicial={conversaDe.get(a.id)} />
              </div>
            </aside>
          </>
        );
      })()}
    </div>
  );
}
