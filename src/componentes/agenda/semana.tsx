'use client';
/* A Semana da agenda, a visão padrão (refeita em 24/11/2026, pedido do cliente: "quando
   tem mais de 3 aulas, fica aparecendo um +2. Não pode acontecer, tem que sempre mostrar
   todos"; "pode ser hora cheia"; "mais fácil de enxergar").
   - Colunas = os dias abertos (segunda a sábado); linhas = as faixas da escola
     (26/11/2026): 8h às 12h em hora cheia, o almoço, e 13h30 às 21h30 em hora quebrada.
     Linhas separadas por uma borda mais grossa, para nada se amontoar.
   - Cada célula lista TODAS as aulas que começam naquela faixa, uma embaixo da outra:
     bolinha de status, horário, aula, professor e quantos alunos (os nomes no passar o
     mouse e no modal). A linha cresce o que precisar; faixa sem nada fica baixinha.
   - Aula de mais de uma hora (o B2) aparece também na faixa seguinte, como continuação
     ("até 20:00"), como na agenda antiga do ELLO.
   - Cor do professor suave no fundo e cheia na borda; cancelada bem apagada.
   - Bloqueio da escola pinta as células que cobre; o do professor (com a chave "Mostrar
     bloqueios") entra como item listrado pequeno.
   - Clique no espaço vazio da célula: aula nova naquele dia e hora. Arrastar a aula para
     outra célula: outro dia e hora, com os mesmos minutos (quem confere e grava é
     agenda.tsx). O nome do dia abre a Grade daquele dia.
   - No celular, os dias um embaixo do outro, só com as horas que têm aula.
   As contas moram em src/lib/dominio/agenda-grade.ts (montaSemana, bloqueiosDaSemana). */
import { Fragment, useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent } from 'react';
import { Ic } from '@/componentes/icones';
import { diaDaSemana, diaLocal, faltaPresenca, STATUS, type Agendamento, type Bloqueio, type Professor } from '@/lib/dominio/agenda';
import {
  bloqueiosDaSemana, chaveDaCelula, ehADefinir, faixaDe, hhmm, horarioDe, isoNoDia, minutosNoDia, montaSemana, motivoCompleto,
  motivoCurto, nomeCurtoDaAula, nomesCurtosDosProfessores, tintaDoProfessor, type Faixa, type NaCelula,
} from '@/lib/dominio/agenda-grade';
import CartaoDaAula, { type Dica } from './cartao-da-aula';

interface Props {
  dias: string[];                      // os dias abertos da semana, em ordem
  agendamentos: Agendamento[];         // já filtradas
  bloqueios: Bloqueio[];               // os da escola sempre; os de professor só se pedir
  professores: Professor[];
  nomeDaAula: (id: string) => string;
  podeCriar: boolean;
  podeRemarcar: boolean;
  agora: Date;                         // new Date(0) enquanto a hora não é conhecida
  hoje: string;                        // AAAA-MM-DD, '' enquanto não se sabe
  estreita: boolean;                   // celular: os dias empilhados
  rolarAte?: string;                   // HH:MM: abre perto dessa hora
  aoNova: (inicio: Date, fim: Date) => void;
  aoAbrir: (id: string) => void;
  aoAbrirBloqueio: (id: string) => void;
  aoAbrirDia: (dia: string) => void;
  aoMover: (id: string, inicio: Date, fim: Date) => void;
}

const SIGLA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const NOME_DIA = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

/** As cores do professor como variáveis do CSS (fundo e texto de cada tema). */
function tinta(cor: string): CSSProperties {
  const t = tintaDoProfessor(cor);
  return { '--g-cor': t.cheia, '--g-fc': t.fundoClaro, '--g-tc': t.textoClaro, '--g-fe': t.fundoEscuro, '--g-te': t.textoEscuro } as CSSProperties;
}

export default function Semana(p: Props) {
  const { dias, agendamentos, bloqueios, professores, agora, hoje, estreita } = p;
  const rolagem = useRef<HTMLDivElement | null>(null);
  const arrasto = useRef<{ id: string } | null>(null);
  const [alvo, setAlvo] = useState<string | null>(null);
  const [dica, setDica] = useState<Dica | null>(null);

  const prof = useMemo(() => new Map(professores.map((x) => [x.id, x])), [professores]);
  const curto = useMemo(() => {
    const nomes = nomesCurtosDosProfessores(professores.map((x) => x.nome));
    return new Map(professores.map((x, i) => [x.id, ehADefinir(x.nome) ? 'A definir' : nomes[i]]));
  }, [professores]);
  const nomeDoProf = (id: string) => curto.get(id) || 'A definir';

  const semana = useMemo(() => {
    const nome = (id: string) => curto.get(id) || 'A definir';
    return montaSemana(agendamentos, dias, (a, b) => nome(a.professorId).localeCompare(nome(b.professorId), 'pt-BR'));
  }, [agendamentos, dias, curto]);
  const naCelula = useMemo(() => bloqueiosDaSemana(bloqueios, dias, semana.faixas), [bloqueios, dias, semana.faixas]);
  const porId = useMemo(() => new Map(agendamentos.map((a) => [a.id, a])), [agendamentos]);

  /* abre perto da hora pedida; na semana de hoje, uma hora antes de agora; senão, no começo */
  const conhecida = agora.getTime() > 0;
  const naSemana = conhecida && dias.includes(hoje);
  const minutoAlvo = p.rolarAte
    ? Number(p.rolarAte.slice(0, 2)) * 60 + Number(p.rolarAte.slice(3, 5)) - 60
    : naSemana && hoje ? minutosNoDia(agora.toISOString(), hoje) - 60 : -1;
  const faixaAlvo = minutoAlvo >= 0 ? semana.faixas[faixaDe(semana.faixas, minutoAlvo)].ini : -1;
  const chegou = agendamentos.length > 0;
  const qualSemana = dias.join();
  useEffect(() => {
    const el = rolagem.current;
    if (!el || estreita) return;
    const linha = faixaAlvo >= 0 ? (el.querySelector(`[data-faixa="${faixaAlvo}"]`) as HTMLElement | null) : null;
    const topo = (el.querySelector('.ag-sem-cab') as HTMLElement | null)?.offsetHeight || 0;
    el.scrollTop = linha ? Math.max(0, linha.offsetTop - topo) : 0;
    /* só ao trocar de semana ou de hora pedida, e quando as aulas chegam */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qualSemana, p.rolarAte, chegou, estreita]);

  /* ---------------- arrastar ---------------- */
  function comeca(e: DragEvent<HTMLDivElement>, a: Agendamento) {
    arrasto.current = { id: a.id };
    setDica(null);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', a.id);
  }
  function passa(e: DragEvent<HTMLDivElement>, k: string) {
    if (!arrasto.current) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (alvo !== k) setAlvo(k);
  }
  function solta(e: DragEvent<HTMLDivElement>, dia: string, faixa: Faixa) {
    e.preventDefault();
    const id = arrasto.current?.id;
    arrasto.current = null;
    setAlvo(null);
    const a = id ? porId.get(id) : undefined;
    if (!a) return;
    const diaAntes = diaLocal(a.inicio);
    const ini = minutosNoDia(a.inicio, diaAntes);
    const duracao = minutosNoDia(a.fim, diaAntes) - ini;
    /* cai na faixa nova com a mesma distância do começo da faixa que tinha */
    const daFaixa = semana.faixas[faixaDe(semana.faixas, ini)];
    const novoIni = faixa.ini + Math.min(Math.max(0, ini - daFaixa.ini), faixa.fim - faixa.ini - 15);
    if (dia === diaAntes && novoIni === ini) return;
    p.aoMover(a.id, new Date(isoNoDia(dia, novoIni)), new Date(isoNoDia(dia, novoIni + duracao)));
  }
  const termina = () => { arrasto.current = null; setAlvo(null); };

  function nova(dia: string, faixa: Faixa) {
    p.aoNova(new Date(isoNoDia(dia, faixa.ini)), new Date(isoNoDia(dia, faixa.ini + 60)));
  }

  /* ---------------- um item (função que desenha, não componente: o arraste não pode
     perder o elemento quando a tela redesenha) ---------------- */
  function aula({ a, continua }: NaCelula<Agendamento>) {
    const dia = diaLocal(a.inicio);
    const cor = prof.get(a.professorId)?.cor || '#8E8E88';
    const n = a.alunos.length;
    const parado = a.status === 'cancelado' || a.status === 'remarcado';
    const arrastavel = p.podeRemarcar && a.status !== 'realizado' && !estreita && !continua;
    const longa = minutosNoDia(a.fim, dia) - minutosNoDia(a.inicio, dia) > 60;
    const ate = hhmm(minutosNoDia(a.fim, dia));
    const rotulo = `${horarioDe(a, dia)}, ${p.nomeDaAula(a.aulaId)}, ${nomeDoProf(a.professorId)}, ${n} ${n === 1 ? 'aluno' : 'alunos'}, ${STATUS[a.status].nome}`;
    if (continua) {
      return (
        <div key={`${a.id}-segue`} role="button" tabIndex={0} style={tinta(cor)}
             className={`ag-sem-aula ag-tinta continua st-${a.status}${parado ? ' parado' : ''}${a.status === 'cancelado' ? ' cancelada' : ''}`}
             onClick={() => { setDica(null); p.aoAbrir(a.id); }}
             onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); p.aoAbrir(a.id); } }}
             onMouseEnter={(e) => { const r = e.currentTarget.getBoundingClientRect(); setDica({ a, x: r.right + 8, y: r.top }); }}
             onMouseLeave={() => setDica(null)}
             aria-label={`Continuação: ${rotulo}`}>
          <span className="ag-sem-l1">
            <span className="ag-sem-seta" aria-hidden="true">↳</span>
            <b>{nomeCurtoDaAula(p.nomeDaAula(a.aulaId))}</b>
            <span className="num ag-sem-h">até {ate}</span>
          </span>
          <span className="ag-sem-l2">{nomeDoProf(a.professorId)} · continuação</span>
        </div>
      );
    }
    return (
      <div key={a.id} role="button" tabIndex={0} style={tinta(cor)}
           className={`ag-sem-aula ag-tinta st-${a.status}${parado ? ' parado' : ''}${a.status === 'cancelado' ? ' cancelada' : ''}${longa ? ' segue' : ''}`}
           draggable={arrastavel}
           onDragStart={arrastavel ? (e) => comeca(e, a) : undefined}
           onDragEnd={termina}
           onClick={() => { setDica(null); p.aoAbrir(a.id); }}
           onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); p.aoAbrir(a.id); } }}
           onMouseEnter={(e) => { const r = e.currentTarget.getBoundingClientRect(); setDica({ a, x: r.right + 8, y: r.top }); }}
           onMouseLeave={() => setDica(null)}
           aria-label={rotulo}>
        <span className="ag-sem-l1">
          <span className="ag-st" style={{ background: STATUS[a.status].cor }} />
          <span className="num ag-sem-h">{horarioDe(a, dia).slice(0, 5)}</span>
          <b>{nomeCurtoDaAula(p.nomeDaAula(a.aulaId))}</b>
          {faltaPresenca(a, agora) && <span className="ag-alerta" title="Falta lançar presença" />}
          {a.lembreteEnviadoEm && <span className="ag-wa" title="Lembrete enviado no WhatsApp"><Ic n="chat" /></span>}
        </span>
        <span className="ag-sem-l2">{nomeDoProf(a.professorId)} · {n} {n === 1 ? 'aluno' : 'alunos'}{longa ? ` · até ${ate}` : ''}</span>
      </div>
    );
  }

  function horarioDoBloqueio(b: Bloqueio, dia: string) {
    const ini = Math.max(0, minutosNoDia(b.inicio, dia));
    const fim = Math.min(24 * 60, minutosNoDia(b.fim, dia));
    return ini === 0 && fim === 24 * 60 ? 'o dia todo' : `${hhmm(ini)} às ${hhmm(fim)}`;
  }
  function bloqueiosDa(k: string, dia: string) {
    return (naCelula.get(k)?.rotulos || []).map((b) => (
      <button key={b.id} type="button" className={`ag-sem-bl${b.professorId ? '' : ' escola'}`} title={motivoCompleto(b)}
              onClick={(e) => { e.stopPropagation(); p.aoAbrirBloqueio(b.id); }}>
        <span>{motivoCurto(b)}{b.professorId ? ` · ${nomeDoProf(b.professorId)}` : ''}</span>
        <small className="num">{horarioDoBloqueio(b, dia)}</small>
      </button>
    ));
  }

  /* ---------------- celular: os dias empilhados ---------------- */
  if (estreita) {
    return (
      <div className="ag-sem lista" ref={rolagem}>
        {dias.map((dia) => {
          const n = semana.porDia.get(dia) || 0;
          const faixas = semana.faixas.filter((f) => semana.celulas.get(chaveDaCelula(dia, f.ini))?.length || naCelula.get(chaveDaCelula(dia, f.ini))?.rotulos.length);
          return (
            <section key={dia} className={dia === hoje ? 'hoje' : undefined}>
              <button type="button" className="ag-sem-dia" onClick={() => p.aoAbrirDia(dia)}>
                <b>{NOME_DIA[diaDaSemana(dia)]}, {dia.slice(8, 10)}/{dia.slice(5, 7)}</b>
                <small className="num">{n} {n === 1 ? 'aula' : 'aulas'}</small>
              </button>
              {!faixas.length && <p className="ag-sem-vazio">Nenhuma aula neste dia.</p>}
              {faixas.map((f) => {
                const k = chaveDaCelula(dia, f.ini);
                return (
                  <div key={f.ini} className="ag-sem-linha">
                    <span className="num ag-sem-hora-l">{hhmm(f.ini)}</span>
                    <div className="ag-sem-itens">
                      {bloqueiosDa(k, dia)}
                      {(semana.celulas.get(k) || []).map(aula)}
                    </div>
                  </div>
                );
              })}
            </section>
          );
        })}
      </div>
    );
  }

  /* ---------------- computador: a grade da semana ---------------- */
  return (
    <div className="ag-sem" ref={rolagem}>
      <div className="ag-sem-folha" style={{ gridTemplateColumns: `58px repeat(${dias.length}, minmax(170px, 1fr))`, minWidth: 58 + dias.length * 170 }}>
        <div className="ag-sem-canto" />
        {dias.map((dia) => {
          const n = semana.porDia.get(dia) || 0;
          return (
            <button key={dia} type="button" className={`ag-sem-cab${dia === hoje ? ' hoje' : ''}`} onClick={() => p.aoAbrirDia(dia)}
                    title="Abrir este dia na Grade, por professor">
              <span>{SIGLA[diaDaSemana(dia)]}</span>
              <b className="num">{dia.slice(8, 10)}</b>
              <small className="num">{n} {n === 1 ? 'aula' : 'aulas'}</small>
            </button>
          );
        })}

        {semana.faixas.map((f) => {
          const cheia = semana.maisCheia.has(f.ini) || dias.some((d) => naCelula.get(chaveDaCelula(d, f.ini))?.rotulos.length);
          return (
            <Fragment key={f.ini}>
              <div className={`ag-sem-hora${cheia ? '' : ' vazia'}`} data-faixa={f.ini}>{hhmm(f.ini)}</div>
              {dias.map((dia) => {
                const k = chaveDaCelula(dia, f.ini);
                const aulas = semana.celulas.get(k) || [];
                const escola = naCelula.get(k)?.daEscola.length;
                return (
                  <div key={k}
                       className={`ag-sem-cel${cheia ? '' : ' vazia'}${dia === hoje ? ' hoje' : ''}${escola ? ' escola' : ''}${alvo === k ? ' alvo' : ''}`}
                       onClick={(e) => { if (e.target === e.currentTarget) nova(dia, f); }}
                       onDragOver={(e) => passa(e, k)}
                       onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setAlvo((x) => (x === k ? null : x)); }}
                       onDrop={(e) => solta(e, dia, f)}
                       title={aulas.length ? undefined : p.podeCriar ? `Nova aula ${NOME_DIA[diaDaSemana(dia)]} às ${hhmm(f.ini)}` : undefined}>
                    {bloqueiosDa(k, dia)}
                    {aulas.map(aula)}
                  </div>
                );
              })}
            </Fragment>
          );
        })}
      </div>
      {dica && <CartaoDaAula {...dica} professor={prof.get(dica.a.professorId)} aula={p.nomeDaAula(dica.a.aulaId)} />}
    </div>
  );
}
