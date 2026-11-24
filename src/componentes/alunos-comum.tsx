'use client';
/* O que as duas planilhas de alunos dividem (a de marcação, em Alunos, e a do cadastro,
   em Cadastros): a lista ao vivo com a conversa de cada aluno, quem pode o quê, o CSV e
   a barra que aparece com alunos selecionados, com o apagar de vez. */
import { useEffect, useMemo, useState } from 'react';
import { assina } from '@/lib/dados/fonte';
import { apaga, planoDeApagar, type PlanoDeApagar } from '@/lib/dados/alunos';
import { useSessao } from '@/componentes/sessao';
import { avisa } from '@/componentes/aviso';
import { Ic } from '@/componentes/icones';
import { NOME_DA_SITUACAO, horarioEmTexto, type SituacaoAluno } from '@/lib/dominio/planilha';
import { cpfLegivel, dataCompleta } from '@/lib/dominio/alunos';
import { alunosDoContato } from '@/lib/dominio/contato';
import { csv } from '@/lib/dominio/agenda';
import { telefoneLegivel } from '@/lib/dominio/formato';
import type { Aluno, Conversa } from '@/lib/dominio/tipos';

export type AlunoComOrigem = Aluno & { teste?: boolean };

const VE_TODAS = ['admin', 'gestor', 'recepcao'];
const EDITA = ['admin', 'gestor', 'recepcao', 'coordenacao'];

export const situacaoDe = (a: Pick<Aluno, 'situacao' | 'ativo'>): SituacaoAluno => a.situacao ?? (a.ativo ? 'ativo' : 'inativo');
export const horarioDe = (a: Pick<Aluno, 'horariosFixos' | 'horarioFixoTexto'>) => (a.horariosFixos?.length ? horarioEmTexto(a.horariosFixos) : a.horarioFixoTexto || '');

/** Os alunos ao vivo, em ordem de nome, com a conversa de cada um (a ligada a ele, ou a
    que o telefone acha). Quem não vê todas as conversas não carrega conversa nenhuma. */
export function useAlunosDaEscola() {
  const { perfil } = useSessao();
  const [alunos, setAlunos] = useState<AlunoComOrigem[] | null>(null);
  const [conversas, setConversas] = useState<Conversa[]>([]);
  const veConversas = Boolean(perfil && VE_TODAS.includes(perfil.papel));
  const podeEditar = Boolean(perfil && EDITA.includes(perfil.papel));

  useEffect(() => assina('alunos', (d) => setAlunos((d as unknown as AlunoComOrigem[]).filter((a) => !a.teste).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')))), []);
  useEffect(() => (veConversas ? assina('conversas', (d) => setConversas(d as unknown as Conversa[])) : undefined), [veConversas]);

  const lista = useMemo(() => alunos ?? [], [alunos]);
  const conversaDe = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of conversas) {
      for (const a of alunosDoContato(lista, c)) if (!m.has(a.id)) m.set(a.id, c.id);
    }
    return m;
  }, [conversas, lista]);

  /* apagar de vez é da recepção e da gestão, que veem tudo (a coordenação muda situação) */
  return { alunos: lista, carregou: alunos !== null, conversas, conversaDe, veConversas, podeEditar, podeApagar: veConversas };
}

const NOME_DA_SAUDE = { evoluindo: 'Evoluindo', atencao: 'Atenção', critico: 'Crítico' } as const;
const NOME_DO_TIPO = { turma: 'turma', particular: 'particular', clube: 'clube de conversação' } as const;

/** O CSV dos alunos que estão na tela, com tudo o que o sistema sabe de cada um. */
export function baixaCsv(alunos: AlunoComOrigem[], conversaDe: Map<string, string>, nome: string) {
  const sim = (v?: boolean | null) => (v === true ? 'sim' : v === false ? 'não' : '');
  const texto = csv(['Código', 'Aluno', 'Menor', 'Situação', 'Marcou a próxima semana', 'Observação', 'Livro', 'Tipo', 'Modalidade', 'Curso',
    'Classificação', 'App', 'Nex-IA', 'Fim do contrato', 'Contrato assinado', 'Horário fixo', 'Telefone', 'E-mail', 'Nascimento', 'CPF',
    'Responsável', 'Telefone do responsável', 'Conversa no sistema'],
  alunos.map((a) => [a.codigo || '', a.nome, sim(a.menor), NOME_DA_SITUACAO[situacaoDe(a)], situacaoDe(a) === 'ativo' ? sim(a.marcouSemana) : '',
    a.observacao || '', a.livroOriginal || a.nivel, a.tipoCurso ? NOME_DO_TIPO[a.tipoCurso] : '', a.modalidade || '', a.trilha === 'kids' ? 'Kids' : 'Adultos',
    a.saude ? NOME_DA_SAUDE[a.saude] : '', sim(a.appAtivo), sim(a.nexiaAtivo), a.contratoFim ? dataCompleta(a.contratoFim) : '', sim(a.contratoAssinado),
    horarioDe(a), a.telefone ? telefoneLegivel(a.telefone) : '', a.email || '', a.nascimento ? dataCompleta(a.nascimento) : '', a.documento ? cpfLegivel(a.documento) : '',
    a.responsavelNome || '', a.responsavelTelefone ? telefoneLegivel(a.responsavelTelefone) : '', conversaDe.has(a.id) ? 'sim' : 'não']));
  const url = URL.createObjectURL(new Blob([texto], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `${nome}-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/** A barra dos alunos selecionados: quantos, desmarcar e apagar de vez. Antes de apagar
    ela monta o plano e diz o que vai acontecer com as aulas e as conversas. */
export function BarraDeSelecao({
  selecionados, alunos, podeApagar, aoLimpar,
}: {
  selecionados: Set<string>;
  alunos: AlunoComOrigem[];
  podeApagar: boolean;
  aoLimpar: () => void;
}) {
  const { perfil } = useSessao();
  const [plano, setPlano] = useState<PlanoDeApagar | null>(null);
  const [indo, setIndo] = useState(false);
  const alvo = alunos.filter((a) => selecionados.has(a.id));
  if (!alvo.length) return null;

  const quem = { id: perfil?.id || '', nome: perfil?.nome || 'Equipe', papel: perfil?.papel || 'recepcao' as const };

  async function prepara() {
    setIndo(true);
    try {
      setPlano(await planoDeApagar(quem, alvo.map((a) => ({ id: a.id, nome: a.nome }))));
    } catch {
      avisa('Não consegui conferir as aulas e as conversas desses alunos. Confira a internet e tente de novo.');
    } finally {
      setIndo(false);
    }
  }

  async function confirma() {
    if (!plano) return;
    setIndo(true);
    try {
      await apaga(plano);
      avisa(plano.ids.length === 1 ? `${plano.nomes[0]} foi apagado` : `${plano.ids.length} alunos foram apagados`);
      setPlano(null);
      aoLimpar();
    } catch {
      avisa('Não consegui apagar. Nada foi mudado; confira a internet e tente de novo.');
    } finally {
      setIndo(false);
    }
  }

  const nomes = alvo.length <= 4 ? alvo.map((a) => a.nome).join(', ') : `${alvo.slice(0, 3).map((a) => a.nome).join(', ')} e mais ${alvo.length - 3}`;

  return (
    <div className={`alu-selecao${plano ? ' confirmando' : ''}`} role="region" aria-label="Alunos selecionados">
      {!plano ? (
        <div className="alu-selecao-linha">
          <b className="num">{plural(alvo.length, 'aluno selecionado', 'alunos selecionados')}</b>
          <span className="alu-selecao-nomes">{nomes}</span>
          {podeApagar && (
            <button type="button" className="btn perigo-claro" disabled={indo} onClick={() => void prepara()}>
              <Ic n="lixo" />{indo ? 'Conferindo...' : alvo.length === 1 ? 'Apagar aluno' : 'Apagar alunos'}
            </button>
          )}
          <button type="button" className="btn" onClick={aoLimpar}>Desmarcar</button>
        </div>
      ) : (
        <div className="alu-selecao-conf">
          <p className="alu-selecao-tit">
            {plano.ids.length === 1 ? <>Apagar <b>{plano.nomes[0]}</b> de vez?</> : <>Apagar <b>{plano.ids.length} alunos</b> de vez?</>}
          </p>
          <ul>
            <li>{plano.ids.length === 1 ? 'Some' : 'Somem'} da planilha de marcação e do cadastro.</li>
            {plano.aulas > 0 && (
              <li>
                {plano.ids.length === 1 ? 'Sai' : 'Saem'} de {plural(plano.aulas, 'aula marcada', 'aulas marcadas')} daqui para frente
                {plano.vazias > 0 && <>; {plural(plano.vazias, 'fica sem ninguém e sai', 'ficam sem ninguém e saem')} da agenda</>}.
              </li>
            )}
            <li>As aulas que já passaram ficam no histórico, com presença e notas.</li>
            {plano.conversas > 0 && <li>{plural(plano.conversas, 'conversa continua', 'conversas continuam')}, só sem a ligação com o aluno.</li>}
            <li>Não dá para desfazer. Para só tirar da lista, mude a situação para Off ou Inativo.</li>
          </ul>
          <div className="ln">
            <button type="button" className="btn perigo" disabled={indo} onClick={() => void confirma()}>
              <Ic n="lixo" />{indo ? 'Apagando...' : 'Apagar de vez'}
            </button>
            <button type="button" className="btn" disabled={indo} onClick={() => setPlano(null)}>Cancelar</button>
          </div>
        </div>
      )}
    </div>
  );
}
