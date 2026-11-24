'use client';
/* A planilha de alunos do sistema, com cara e jeito de Excel. Serve às duas telas: a
   planilha de marcação (Alunos) e a planilha do cadastro (Cadastros), cada uma com as
   suas colunas (dominio/alunos.ts).
   - Clique (ou Enter, ou comece a digitar) numa célula para mudar; Enter grava e desce,
     Tab grava e vai para a do lado, Esc desiste; as setas andam entre as células.
     Caixa de seleção e lista gravam na hora.
   - A borda do cabeçalho de cada coluna se arrasta para alargar ou estreitar; dois
     cliques voltam ao tamanho de partida. A largura fica guardada no aparelho.
   - O número da linha seleciona o aluno (Shift seleciona um trecho), para apagar.
   - Código e nome ficam presos à esquerda; o cabeçalho fica preso em cima.
   Durante o arraste a largura muda direto no estilo da tabela (sem redesenhar 3 mil
   células a cada movimento) e só vai para o estado ao soltar. */
import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type KeyboardEvent, type PointerEvent as EventoDePonteiro } from 'react';
import Link from 'next/link';
import { getDownloadURL, ref as refArquivo } from 'firebase/storage';
import { atualiza } from '@/lib/dados/fonte';
import { arquivos } from '@/lib/firebase/cliente';
import { avisa } from '@/componentes/aviso';
import { Ic } from '@/componentes/icones';
import { horaConhecida, useAgora } from '@/componentes/relogio';
import {
  COLUNA, NOME_DA_MODALIDADE, NOME_DA_SAUDE, SITUACOES, camposEditados, cpfLegivel, dataCompleta, situacaoDoAluno, valorDaCelula,
  type AlunoDaGrade, type ColunaDaGrade, type DefinicaoDaColuna, type TipoDaColuna,
} from '@/lib/dominio/alunos';
import { NOME_DA_SITUACAO, horarioEmTexto, type SituacaoAluno } from '@/lib/dominio/planilha';
import { telefoneLegivel } from '@/lib/dominio/formato';

interface Editando { id: string; k: ColunaDaGrade; r: number; c: number }
type Larguras = Partial<Record<ColunaDaGrade, number>>;

const campo = (a: AlunoDaGrade, k: ColunaDaGrade) => (a as unknown as Record<string, unknown>)[k];
const MOVE: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
const NUM = 46;                       // a coluna do número da linha
const MIN = 44;
const MAX = 900;
const limita = (w: number) => Math.round(Math.min(MAX, Math.max(MIN, w)));
const chaveDasLarguras = (chave: string) => `nexus-larguras-${chave}`;

/* no celular o código não fica preso e o nome começa mais estreito: senão as colunas
   presas tomam a tela inteira e não sobra lugar para o resto */
const CELULAR = '(max-width: 759px)';
const NO_CELULAR: Larguras = { codigo: 56, nome: 168, observacao: 200 };
const ouveTela = (aviso: () => void) => {
  const mq = window.matchMedia(CELULAR);
  mq.addEventListener('change', aviso);
  return () => mq.removeEventListener('change', aviso);
};
const ehCelular = () => window.matchMedia(CELULAR).matches;

function leLarguras(chave: string): Larguras {
  try {
    const bruto = JSON.parse(localStorage.getItem(chaveDasLarguras(chave)) || '{}') as Record<string, unknown>;
    const saida: Larguras = {};
    for (const [k, v] of Object.entries(bruto)) if (k in COLUNA && typeof v === 'number') saida[k as ColunaDaGrade] = limita(v);
    return saida;
  } catch {
    return {};
  }
}

export default function GradeDeAlunos({
  colunas, chave, alunos, todos, podeEditar, conversaDe, destaque, selecionados, aoSelecionar,
}: {
  colunas: ColunaDaGrade[];        // as colunas desta planilha, na ordem; as duas primeiras ficam presas
  chave: string;                   // onde guardar as larguras no aparelho ("marcacao", "cadastro")
  alunos: AlunoDaGrade[];          // as linhas que aparecem, já filtradas e em ordem
  todos: AlunoDaGrade[];           // todos os alunos, para conferir código repetido
  podeEditar: boolean;
  conversaDe?: Map<string, string>;
  destaque?: string | null;        // o aluno que acabou de ser criado
  selecionados?: Set<string>;
  aoSelecionar?: (ids: Set<string>) => void;
}) {
  const [editando, setEditando] = useState<Editando | null>(null);
  const [rascunho, setRascunho] = useState('');
  const [larguras, setLarguras] = useState<Larguras>(() => leLarguras(chave));
  const caixa = useRef<HTMLDivElement>(null);
  const tabela = useRef<HTMLTableElement>(null);
  const aberta = useRef<Editando | null>(null);
  const focado = useRef<string | null>(null);
  const ancora = useRef<number | null>(null);
  const agora = useAgora();
  const hoje = horaConhecida(agora) ? agora.toISOString().slice(0, 10) : '';
  const defs = colunas.map((k) => COLUNA[k]);
  const sel = selecionados ?? new Set<string>();
  const celular = useSyncExternalStore(ouveTela, ehCelular, () => false);

  /* a largura escolhida fica no aparelho */
  useEffect(() => {
    try { localStorage.setItem(chaveDasLarguras(chave), JSON.stringify(larguras)); } catch { /* aba anônima: vale só agora */ }
  }, [chave, larguras]);

  /* o aluno que acabou de entrar aparece: a planilha rola até a linha dele, uma vez, sem
     tirar o cursor de onde a pessoa está (quem cadastra vários seguidos continua na ficha) */
  useEffect(() => {
    if (!destaque || focado.current === destaque) return;
    const el = caixa.current?.querySelector<HTMLElement>(`[data-cel="${destaque}:${colunas[0]}"]`);
    if (!el) return;
    focado.current = destaque;
    el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [destaque, alunos, colunas]);

  /* ---------- larguras ---------- */

  const larguraDe = (l: Larguras, k: ColunaDaGrade) => l[k] ?? (celular ? NO_CELULAR[k] : undefined) ?? COLUNA[k].largura;

  /** As medidas da tabela em variáveis de CSS: a largura de cada coluna, o total e onde
      começam as duas colunas presas. */
  function medidas(l: Larguras): Record<string, string> {
    const v: Record<string, string> = { '--w-num': `${NUM}px` };
    let total = NUM;
    for (const k of colunas) { const w = larguraDe(l, k); v[`--w-${k}`] = `${w}px`; total += w; }
    v['--w-total'] = `${total}px`;
    v['--l-1'] = `${NUM}px`;
    v['--l-2'] = `${NUM + larguraDe(l, colunas[0])}px`;
    return v;
  }

  function arrasta(e: EventoDePonteiro<HTMLSpanElement>, k: ColunaDaGrade) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const alvo = e.currentTarget;
    const t = tabela.current;
    if (!t) return;
    const x0 = e.clientX;
    const w0 = larguraDe(larguras, k);
    let w = w0;
    alvo.setPointerCapture(e.pointerId);
    document.body.classList.add('arrastando-coluna');
    const move = (ev: PointerEvent) => {
      w = limita(w0 + ev.clientX - x0);
      for (const [nome, valor] of Object.entries(medidas({ ...larguras, [k]: w }))) t.style.setProperty(nome, valor);
    };
    const solta = () => {
      alvo.removeEventListener('pointermove', move);
      alvo.removeEventListener('pointerup', solta);
      alvo.removeEventListener('pointercancel', solta);
      document.body.classList.remove('arrastando-coluna');
      if (w !== w0) setLarguras((l) => ({ ...l, [k]: w }));
    };
    alvo.addEventListener('pointermove', move);
    alvo.addEventListener('pointerup', solta);
    alvo.addEventListener('pointercancel', solta);
  }

  function teclaDaBorda(e: KeyboardEvent<HTMLSpanElement>, k: ColunaDaGrade) {
    const passo = e.key === 'ArrowRight' ? 16 : e.key === 'ArrowLeft' ? -16 : 0;
    if (!passo) return;
    e.preventDefault();
    e.stopPropagation();
    setLarguras((l) => ({ ...l, [k]: limita(larguraDe(l, k) + passo) }));
  }

  const volta = (k: ColunaDaGrade) => setLarguras((l) => { const n = { ...l }; delete n[k]; return n; });

  /* ---------- seleção de linhas ---------- */

  function seleciona(id: string, r: number, trecho: boolean) {
    if (!aoSelecionar) return;
    const novo = new Set(sel);
    if (trecho && ancora.current !== null) {
      const [de, ate] = [Math.min(ancora.current, r), Math.max(ancora.current, r)];
      for (const a of alunos.slice(de, ate + 1)) novo.add(a.id);
    } else if (novo.has(id)) novo.delete(id);
    else novo.add(id);
    ancora.current = r;
    aoSelecionar(novo);
  }
  const todosMarcados = alunos.length > 0 && alunos.every((a) => sel.has(a.id));

  async function abreContrato(caminho: string) {
    try {
      window.open(await getDownloadURL(refArquivo(arquivos(), caminho)), '_blank', 'noopener');
    } catch {
      avisa('Não consegui abrir o contrato. Confira a internet e tente de novo.');
    }
  }

  /* ---------- edição ---------- */

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
    /* no texto longo, Alt+Enter (como no Excel) ou Shift+Enter pula linha dentro da célula */
    if (longo && e.key === 'Enter' && e.altKey && !e.shiftKey) {
      e.preventDefault();
      const t = e.currentTarget;
      const [de, ate] = [t.selectionStart ?? rascunho.length, t.selectionEnd ?? rascunho.length];
      const novo = `${rascunho.slice(0, de)}\n${rascunho.slice(ate)}`;
      setRascunho(novo);
      requestAnimationFrame(() => t.setSelectionRange(de + 1, de + 1));
      return;
    }
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
    const modo = tipo === 'telefone' ? 'tel' : tipo === 'email' ? 'email' : tipo === 'documento' ? 'numeric' : undefined;
    return (
      <input {...comum} type={tipo === 'data' ? 'date' : 'text'} inputMode={modo} spellCheck={tipo === 'texto' || undefined}
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
    if (tipo === 'documento') return cpfLegivel(String(v));
    return String(v);
  }

  function celula(a: AlunoDaGrade, col: DefinicaoDaColuna, r: number, c: number, s: SituacaoAluno) {
    const { k, tipo, rotulo } = col;
    const marca = { 'data-pos': `${r}:${c}`, 'data-cel': `${a.id}:${k}` };
    const rotuloAria = `${rotulo} de ${a.nome}`;

    if (editando && editando.id === a.id && editando.k === k) return editor(tipo, rotulo, a.nome);

    /* o contrato que entrou pelo cadastro: abre numa aba nova (não se edita aqui) */
    if (tipo === 'arquivo') {
      const arq = a.contratoArquivo;
      if (!arq?.caminho) return <span className="alu-g-nada" tabIndex={-1} {...marca} title="Sem contrato guardado">—</span>;
      return (
        <button type="button" className="alu-g-cel alu-g-abrir" {...marca} title={arq.nome} aria-label={`Abrir o contrato de ${a.nome}`}
                onClick={() => void abreContrato(arq.caminho)}>
          <Ic n="doc" />Abrir
        </button>
      );
    }

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
    const naoLido = k === 'horarioFixoTexto' && a.horarioFixoTexto && !a.horariosFixos?.length;
    const titulo = naoLido ? 'O sistema não entendeu esse horário. Escreva como "quartas às 13h30".'
      : k === 'horarioFixoTexto' && a.horariosFixos?.length ? `O sistema leu: ${horarioEmTexto(a.horariosFixos)}`
        : k === 'livroOriginal' && a.livroOriginal ? [a.nivel, a.tipoCurso && a.tipoCurso !== 'turma' ? a.tipoCurso : '', a.professorDoLivro ? `com ${a.professorDoLivro}` : '', a.trilha === 'kids' ? 'Kids' : ''].filter(Boolean).join(' · ')
          : k === 'nome' ? `${a.nome}${a.menor ? ' - menor de idade: quem fala no WhatsApp é o responsável' : ''}`
            : tipo === 'longo' || tipo === 'email' ? texto : undefined;
    return (
      <button type="button" className={`alu-g-cel${vencido ? ' alerta' : ''}${naoLido ? ' aviso' : ''}`} {...marca}
              aria-label={`${rotuloAria}: ${k === 'nome' ? valorDaCelula('nome', a) : texto || 'vazio'}`} title={titulo}
              onClick={() => edita(a, k, tipo, r, c)} onKeyDown={(e) => teclaDaCelula(e, a, k, tipo, r, c)}>
        {k === 'nome' ? <><b>{texto}</b>{a.menor && <span className="alu-g-marca-menor"> - menor</span>}</> : texto}
      </button>
    );
  }

  const presa = (i: number) => (i === 0 ? ' presa presa-1' : i === 1 ? ' presa presa-2' : '');

  return (
    <div className="alu-g-caixa" ref={caixa} onKeyDown={navega}>
      <table className="alu-g" ref={tabela} style={medidas(larguras) as CSSProperties}
             aria-label="Planilha de alunos" aria-rowcount={alunos.length + 1}>
        <colgroup>
          <col style={{ width: 'var(--w-num)' }} />
          {defs.map((d) => <col key={d.k} style={{ width: `var(--w-${d.k})` }} />)}
        </colgroup>
        <thead>
          <tr>
            <th className="alu-g-num presa" scope="col">
              {aoSelecionar ? (
                <button type="button" className="alu-g-linha" aria-pressed={todosMarcados}
                        aria-label={todosMarcados ? 'Desmarcar todos' : 'Selecionar todos os alunos da lista'}
                        title={todosMarcados ? 'Desmarcar todos' : 'Selecionar todos'}
                        onClick={() => aoSelecionar(todosMarcados ? new Set() : new Set(alunos.map((a) => a.id)))}>
                  <span className="alu-g-tique" aria-hidden="true" />
                </button>
              ) : '#'}
            </th>
            {defs.map((d, i) => (
              <th key={d.k} className={`alu-g-${d.k} alu-g-t-${d.tipo}${presa(i)}`} title={d.dica} scope="col">
                <span className="alu-g-rot">{d.rotulo}</span>
                <span className="alu-g-borda" role="separator" aria-orientation="vertical" tabIndex={0}
                      aria-label={`Largura da coluna ${d.rotulo}`} aria-valuenow={larguraDe(larguras, d.k)} aria-valuemin={MIN} aria-valuemax={MAX}
                      title="Arraste para mudar a largura. Dois cliques voltam ao tamanho de partida."
                      onPointerDown={(e) => arrasta(e, d.k)} onDoubleClick={() => volta(d.k)} onKeyDown={(e) => teclaDaBorda(e, d.k)} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {alunos.map((a, r) => {
            const s = situacaoDoAluno(a);
            const conversa = conversaDe?.get(a.id);
            const marcado = sel.has(a.id);
            const classes = [a.id === destaque ? 'alu-g-novo' : '', marcado ? 'selecionada' : ''].filter(Boolean).join(' ');
            return (
              <tr key={a.id} className={classes || undefined} aria-selected={aoSelecionar ? marcado : undefined}>
                <td className="alu-g-num presa">
                  {aoSelecionar ? (
                    <button type="button" className="alu-g-linha" aria-pressed={marcado} aria-label={`Selecionar ${a.nome}`}
                            title="Selecionar a linha (Shift seleciona um trecho)" onClick={(e) => seleciona(a.id, r, e.shiftKey)}>
                      <span className="num">{r + 1}</span>
                    </button>
                  ) : <span className="alu-g-linha num">{r + 1}</span>}
                </td>
                {defs.map((col, c) => (
                  <td key={col.k} className={`alu-g-${col.k} alu-g-t-${col.tipo}${presa(c)}${editando?.id === a.id && editando.k === col.k ? ' editando' : ''}`}>
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
