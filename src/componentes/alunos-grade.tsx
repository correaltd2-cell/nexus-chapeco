'use client';
/* A planilha de alunos do sistema: as colunas da aba ATIVOS, editáveis como planilha.
   Clique (ou Enter, ou comece a digitar) numa célula para mudar; Enter grava e desce,
   Tab grava e vai para a do lado, Esc desiste; as setas andam entre as células. Caixa
   de seleção e lista gravam na hora. O que cada célula grava mora em dominio/alunos.ts;
   a gravação é a mesma do resto do sistema, com as regras do Firestore valendo. */
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import Link from 'next/link';
import { atualiza } from '@/lib/dados/fonte';
import { avisa } from '@/componentes/aviso';
import { Ic } from '@/componentes/icones';
import { horaConhecida, useAgora } from '@/componentes/relogio';
import {
  COLUNAS_DA_GRADE, NOME_DA_MODALIDADE, NOME_DA_SAUDE, SITUACOES, camposEditados, dataCompleta, situacaoDoAluno, valorDaCelula,
  type AlunoDaGrade, type ColunaDaGrade, type TipoDaColuna,
} from '@/lib/dominio/alunos';
import { NOME_DA_SITUACAO, horarioEmTexto, type SituacaoAluno } from '@/lib/dominio/planilha';
import { telefoneLegivel } from '@/lib/dominio/formato';

interface Editando { id: string; k: ColunaDaGrade; r: number; c: number }

const campo = (a: AlunoDaGrade, k: ColunaDaGrade) => (a as unknown as Record<string, unknown>)[k];
const MOVE: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };

export default function GradeDeAlunos({
  alunos, todos, podeEditar, conversaDe, destaque,
}: {
  alunos: AlunoDaGrade[];          // as linhas que aparecem, já filtradas e em ordem
  todos: AlunoDaGrade[];           // todos os alunos, para conferir código repetido
  podeEditar: boolean;
  conversaDe?: Map<string, string>;
  destaque?: string | null;        // o aluno que acabou de ser criado
}) {
  const [editando, setEditando] = useState<Editando | null>(null);
  const [rascunho, setRascunho] = useState('');
  const caixa = useRef<HTMLDivElement>(null);
  const aberta = useRef<Editando | null>(null);
  const focado = useRef<string | null>(null);
  const agora = useAgora();
  const hoje = horaConhecida(agora) ? agora.toISOString().slice(0, 10) : '';

  /* o aluno novo ganha o foco na primeira célula, uma vez */
  useEffect(() => {
    if (!destaque || focado.current === destaque) return;
    const el = caixa.current?.querySelector<HTMLElement>(`[data-cel="${destaque}:codigo"]`);
    if (!el) return;
    focado.current = destaque;
    el.focus();
    el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [destaque, alunos]);

  const foca = (r: number, c: number) => requestAnimationFrame(() => {
    caixa.current?.querySelector<HTMLElement>(`[data-pos="${r}:${c}"]`)?.focus();
  });

  async function grava(a: AlunoDaGrade, k: ColunaDaGrade, valor: string | boolean) {
    const e = camposEditados(k, valor, a, todos);
    if ('erro' in e) { avisa(e.erro); return; }
    if (!Object.keys(e.campos).length) return;
    try {
      await atualiza('alunos', a.id, { ...e.campos, atualizadoEm: new Date().toISOString() });
    } catch {
      avisa('Não consegui salvar. Confira a internet e tente de novo.');
    }
  }

  function edita(a: AlunoDaGrade, k: ColunaDaGrade, tipo: TipoDaColuna, r: number, c: number, inicial?: string) {
    if (!podeEditar) return;
    const ed = { id: a.id, k, r, c };
    aberta.current = ed;
    setEditando(ed);
    setRascunho(inicial ?? (tipo === 'telefone' && campo(a, k) ? telefoneLegivel(String(campo(a, k))) : valorDaCelula(k, a)));
  }

  /** Fecha o editor. Com erro: no Enter o editor fica aberto; ao sair da célula, desiste. */
  function confirma(depois: 'baixo' | null) {
    const ed = aberta.current;
    if (!ed) return;
    const a = alunos.find((x) => x.id === ed.id);
    if (a) {
      const e = camposEditados(ed.k, rascunho, a, todos);
      if ('erro' in e) {
        avisa(e.erro);
        if (depois) return;
      } else void grava(a, ed.k, rascunho);
    }
    aberta.current = null;
    setEditando(null);
    if (depois === 'baixo') foca(ed.r + 1, ed.c);
  }

  function cancela() {
    const ed = aberta.current;
    aberta.current = null;
    setEditando(null);
    if (ed) foca(ed.r, ed.c);
  }

  function teclaDoEditor(e: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>, longo: boolean) {
    if (e.key === 'Enter' && !(longo && e.shiftKey)) { e.preventDefault(); confirma('baixo'); }
    if (e.key === 'Escape') { e.preventDefault(); cancela(); }
  }

  /* setas andam entre as células (inclusive saindo de uma lista, que senão trocaria o valor) */
  function navega(e: KeyboardEvent<HTMLDivElement>) {
    const alvo = e.target as HTMLElement;
    const pos = alvo.dataset.pos;
    const mov = MOVE[e.key];
    if (!pos || !mov || e.altKey) return;
    const [r, c] = pos.split(':').map(Number);
    const prox = caixa.current?.querySelector<HTMLElement>(`[data-pos="${r + mov[0]}:${c + mov[1]}"]`);
    e.preventDefault();
    prox?.focus();
  }

  function teclaDaCelula(e: KeyboardEvent<HTMLButtonElement>, a: AlunoDaGrade, k: ColunaDaGrade, tipo: TipoDaColuna, r: number, c: number) {
    if (e.key === 'Enter' || e.key === 'F2') { e.preventDefault(); edita(a, k, tipo, r, c); return; }
    if (e.key === 'Backspace') { e.preventDefault(); edita(a, k, tipo, r, c, ''); return; }
    /* começar a digitar abre a célula com a letra digitada, como no Excel */
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey && tipo !== 'data') { e.preventDefault(); edita(a, k, tipo, r, c, e.key); }
  }

  function editor(tipo: TipoDaColuna, rotulo: string, nome: string) {
    const comum = {
      className: 'alu-g-ed', value: rascunho, autoFocus: true, 'aria-label': `${rotulo} de ${nome}`,
      onBlur: () => confirma(null),
    };
    if (tipo === 'longo') {
      return <textarea {...comum} rows={3} onChange={(e) => setRascunho(e.target.value)} onKeyDown={(e) => teclaDoEditor(e, true)} />;
    }
    return (
      <input {...comum} type={tipo === 'data' ? 'date' : 'text'} inputMode={tipo === 'telefone' ? 'tel' : undefined}
             onChange={(e) => setRascunho(e.target.value)} onKeyDown={(e) => teclaDoEditor(e, false)}
             onFocus={(e) => { if (tipo !== 'data') e.currentTarget.setSelectionRange(e.currentTarget.value.length, e.currentTarget.value.length); }} />
    );
  }

  function mostra(a: AlunoDaGrade, k: ColunaDaGrade, tipo: TipoDaColuna) {
    const v = campo(a, k);
    if (k === 'livroOriginal') return a.livroOriginal || a.nivel || '';
    if (v === null || v === undefined || v === '') return '';
    if (tipo === 'telefone') return telefoneLegivel(String(v));
    if (tipo === 'data') return dataCompleta(String(v));
    return String(v);
  }

  function celula(a: AlunoDaGrade, col: (typeof COLUNAS_DA_GRADE)[number], r: number, c: number, s: SituacaoAluno) {
    const { k, tipo, rotulo } = col;
    const id = `${a.id}:${k}`;
    const marca = { 'data-pos': `${r}:${c}`, 'data-cel': id };
    const rotuloAria = `${rotulo} de ${a.nome}`;

    if (editando && editando.id === a.id && editando.k === k) return editor(tipo, rotulo, a.nome);

    if (tipo === 'sim') {
      if (k === 'marcouSemana' && s !== 'ativo') return <span className="alu-g-nada" tabIndex={-1} {...marca} title="Só aluno ativo marca a semana">—</span>;
      return (
        <input type="checkbox" className="alu-g-caixa-sel" {...marca} checked={campo(a, k) === true} disabled={!podeEditar} aria-label={rotuloAria}
               onChange={(e) => void grava(a, k, e.target.checked)} />
      );
    }
    if (tipo === 'situacao' || tipo === 'modalidade' || tipo === 'saude') {
      const valor = tipo === 'situacao' ? s : String(campo(a, k) ?? '');
      const opcoes: [string, string][] = tipo === 'situacao'
        ? SITUACOES.map((x) => [x, NOME_DA_SITUACAO[x]])
        : [['', '—'], ...Object.entries(tipo === 'modalidade' ? NOME_DA_MODALIDADE : NOME_DA_SAUDE)];
      const cor = tipo === 'situacao' ? `alu-sit ${s}` : tipo === 'saude' && valor ? `alu-saude ${valor}` : '';
      return (
        <select className={`alu-g-sel ${cor}`} {...marca} value={valor} disabled={!podeEditar} aria-label={rotuloAria}
                onChange={(e) => void grava(a, k, e.target.value)}
                /* digitar com a lista em foco trocaria o valor pela letra (um "t" tranca o aluno) */
                onKeyDown={(e) => { if (e.key.length === 1 && e.key !== ' ' && !e.ctrlKey && !e.metaKey) e.preventDefault(); }}>
          {opcoes.map(([v, n]) => <option key={v} value={v}>{n}</option>)}
        </select>
      );
    }
    const texto = mostra(a, k, tipo);
    const vencido = k === 'contratoFim' && hoje && a.contratoFim && a.contratoFim < hoje;
    const titulo = k === 'horarioFixoTexto' && a.horariosFixos?.length ? `O sistema leu: ${horarioEmTexto(a.horariosFixos)}`
      : k === 'livroOriginal' && a.livroOriginal ? [a.nivel, a.tipoCurso && a.tipoCurso !== 'turma' ? a.tipoCurso : '', a.professorDoLivro ? `com ${a.professorDoLivro}` : '', a.trilha === 'kids' ? 'Kids' : ''].filter(Boolean).join(' · ')
        : tipo === 'longo' ? texto : undefined;
    const naoLido = k === 'horarioFixoTexto' && a.horarioFixoTexto && !a.horariosFixos?.length;
    return (
      <button type="button" className={`alu-g-cel${vencido ? ' alerta' : ''}${naoLido ? ' aviso' : ''}`} {...marca}
              aria-label={`${rotuloAria}: ${texto || 'vazio'}`} title={naoLido ? 'O sistema não entendeu esse horário. Escreva como "quartas às 13h30".' : titulo}
              onClick={() => edita(a, k, tipo, r, c)} onKeyDown={(e) => teclaDaCelula(e, a, k, tipo, r, c)}>
        {k === 'nome' ? <b>{texto}</b> : texto}
      </button>
    );
  }

  return (
    <div className="alu-g-caixa" ref={caixa} onKeyDown={navega}>
      <table className="alu-g" aria-label="Planilha de alunos" aria-rowcount={alunos.length + 1}>
        <thead>
          <tr>
            {COLUNAS_DA_GRADE.map((col) => (
              <th key={col.k} className={`alu-g-${col.k}`} title={col.dica} scope="col">{col.rotulo}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {alunos.map((a, r) => {
            const s = situacaoDoAluno(a);
            const conversa = conversaDe?.get(a.id);
            return (
              <tr key={a.id} className={a.id === destaque ? 'alu-g-novo' : undefined}>
                {COLUNAS_DA_GRADE.map((col, c) => (
                  <td key={col.k} className={`alu-g-${col.k}${editando?.id === a.id && editando.k === col.k ? ' editando' : ''}`}>
                    {celula(a, col, r, c, s)}
                    {col.k === 'nome' && conversa && (
                      <Link href={`/conversas?conversa=${conversa}`} className="alu-g-conversa" title="Abrir a conversa" aria-label={`Abrir a conversa de ${a.nome}`} tabIndex={-1}>
                        <Ic n="chat" />
                      </Link>
                    )}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
