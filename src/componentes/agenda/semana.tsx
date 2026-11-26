'use client';
/* A Semana da agenda, a visão padrão, do jeito do ELLO (26/11/2026, pedido do cliente
   com a foto da agenda antiga: "quero a agenda nesse mesmo formato, porque eu preciso
   saber quando preenche 2 horários" e "copiar exatamente as mesmas cores").
   - Colunas = os dias abertos (segunda a sábado); a régua = as faixas da escola: 8h às
     12h em hora cheia, o almoço, e 13h30 às 21h30 em hora quebrada, com borda grossa
     entre elas.
   - Cada aula é um bloco na altura do horário dela, que desce até onde ela acaba: o B2
     das 18h30 às 20h ocupa a faixa das 18h30 e metade da das 19h30. As que se
     sobrepõem ficam lado a lado, e o dia alarga para caber (rola de lado, nada espreme).
   - O bloco tem a cor cheia do professor e o texto que lê melhor em cima dela: bolinha
     de status, a aula e o professor (alunos no passar o mouse e no modal). Cancelada
     bem apagada.
   - Bloqueio da escola pinta o dia de listras; o do professor (com a chave "Mostrar
     bloqueios") entra como bloco listrado ao lado das aulas.
   - Clique no horário vazio: aula nova naquele dia e faixa. Arrastar: outro dia e outro
     horário, de 15 em 15 minutos (quem confere e grava é agenda.tsx). O nome do dia
     abre a Grade daquele dia.
   - No celular, os dias um embaixo do outro, só com as horas que têm aula (a lista).
   As contas moram em src/lib/dominio/agenda-grade.ts (encaixaSemana, larguraDoDia,
   montaSemana para a lista do celular). */
import { useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent } from 'react';
import { Ic } from '@/componentes/icones';
import { diaDaSemana, diaLocal, faltaPresenca, STATUS, type Agendamento, type Bloqueio, type Professor } from '@/lib/dominio/agenda';
import {
  arredonda, bloqueiosDaSemana, chaveDaCelula, ehADefinir, encaixaSemana, hhmm, horarioDe, isoNoDia, larguraDoDia, minutoDoY, minutosNoDia,
  montaSemana, motivoCompleto, motivoCurto, nomeCurtoDaAula, nomesCurtosDosProfessores, SEMANA_ELLO, tintaDoProfessor, topos, yDoMinuto,
  type Encaixe, type NaCelula,
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
  const arrasto = useRef<{ id: string; deslocamento: number; duracao: number } | null>(null);
  const [sombra, setSombra] = useState<{ dia: string; ini: number; fim: number } | null>(null);
  const [dica, setDica] = useState<Dica | null>(null);

  const prof = useMemo(() => new Map(professores.map((x) => [x.id, x])), [professores]);
  const curto = useMemo(() => {
    const nomes = nomesCurtosDosProfessores(professores.map((x) => x.nome));
    return new Map(professores.map((x, i) => [x.id, ehADefinir(x.nome) ? 'A definir' : nomes[i]]));
  }, [professores]);
  const nomeDoProf = (id: string) => curto.get(id) || 'A definir';

  /* a lista do celular (e a régua da semana: as faixas que cabem todas as aulas) */
  const semana = useMemo(() => {
    const nome = (id: string) => curto.get(id) || 'A definir';
    return montaSemana(agendamentos, dias, (a, b) => nome(a.professorId).localeCompare(nome(b.professorId), 'pt-BR'));
  }, [agendamentos, dias, curto]);
  const naCelula = useMemo(() => bloqueiosDaSemana(bloqueios, dias, semana.faixas), [bloqueios, dias, semana.faixas]);
  const porId = useMemo(() => new Map(agendamentos.map((a) => [a.id, a])), [agendamentos]);

  /* ---------------- a régua do jeito do ELLO ---------------- */
  const faixas = semana.faixas;
  const comeco = faixas[0].ini;
  const final = faixas[faixas.length - 1].fim;
  const alturas = useMemo(() => faixas.map(() => SEMANA_ELLO.alturaDaFaixa), [faixas]);
  const t = useMemo(() => topos(alturas), [alturas]);
  const altura = t[t.length - 1];
  const y = (min: number) => yDoMinuto(min, faixas, alturas, t);
  /* o bloqueio do professor entra no encaixe ao lado das aulas; o da escola pinta o dia */
  const doProfessor = useMemo(() => bloqueios.filter((b) => b.professorId), [bloqueios]);
  const daEscola = useMemo(() => bloqueios.filter((b) => !b.professorId), [bloqueios]);
  const blPorId = useMemo(() => new Map(doProfessor.map((b) => [`bl:${b.id}`, b])), [doProfessor]);
  const encaixes = useMemo(() => encaixaSemana([
    ...agendamentos,
    ...doProfessor.map((b) => ({ id: `bl:${b.id}`, inicio: b.inicio, fim: b.fim })),
  ], dias, faixas), [agendamentos, doProfessor, dias, faixas]);

  /* abre perto da hora pedida; na semana de hoje, uma hora antes de agora; senão, no começo */
  const conhecida = agora.getTime() > 0;
  const naSemana = conhecida && dias.includes(hoje);
  const minutoAgora = naSemana && hoje ? minutosNoDia(agora.toISOString(), hoje) : -1;
  const minutoAlvo = p.rolarAte
    ? Number(p.rolarAte.slice(0, 2)) * 60 + Number(p.rolarAte.slice(3, 5)) - 60
    : minutoAgora >= 0 ? minutoAgora - 60 : comeco;
  const yAlvo = yDoMinuto(minutoAlvo, faixas, alturas, t);
  const chegou = agendamentos.length > 0;
  const qualSemana = dias.join();
  useEffect(() => {
    const el = rolagem.current;
    if (!el || estreita) return;
    el.scrollTop = Math.max(0, yAlvo);
    /* só ao trocar de semana ou de hora pedida, e quando as aulas chegam */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qualSemana, p.rolarAte, chegou, estreita]);

  /* ---------------- arrastar: outro dia, outro horário ---------------- */
  function comeca(e: DragEvent<HTMLDivElement>, a: Agendamento, enc: Encaixe) {
    const r = e.currentTarget.getBoundingClientRect();
    const dia = diaLocal(a.inicio);
    const noBloco = minutoDoY(y(enc.ini) + (e.clientY - r.top), faixas, alturas, t) - enc.ini;
    arrasto.current = {
      id: a.id, deslocamento: Math.max(0, noBloco),
      duracao: Math.max(15, minutosNoDia(a.fim, dia) - minutosNoDia(a.inicio, dia)),
    };
    setDica(null);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', a.id);
  }
  function lugar(e: DragEvent<HTMLDivElement>) {
    const a = arrasto.current;
    if (!a) return null;
    const topo = e.currentTarget.getBoundingClientRect().top;
    const ini = arredonda(minutoDoY(e.clientY - topo, faixas, alturas, t) - a.deslocamento);
    const cabe = Math.min(Math.max(ini, comeco), final - Math.min(a.duracao, final - comeco));
    return { ini: cabe, fim: cabe + a.duracao };
  }
  function passa(e: DragEvent<HTMLDivElement>, dia: string) {
    if (!arrasto.current) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const l = lugar(e);
    if (l && (sombra?.dia !== dia || sombra.ini !== l.ini)) setSombra({ dia, ...l });
  }
  function solta(e: DragEvent<HTMLDivElement>, dia: string) {
    e.preventDefault();
    const a = arrasto.current;
    const l = lugar(e);
    arrasto.current = null;
    setSombra(null);
    const original = a ? porId.get(a.id) : undefined;
    if (!a || !l || !original) return;
    const diaAntes = diaLocal(original.inicio);
    if (dia === diaAntes && l.ini === minutosNoDia(original.inicio, diaAntes)) return;
    p.aoMover(original.id, new Date(isoNoDia(dia, l.ini)), new Date(isoNoDia(dia, l.fim)));
  }
  const termina = () => { arrasto.current = null; setSombra(null); };

  function nova(dia: string, ini: number) {
    p.aoNova(new Date(isoNoDia(dia, ini)), new Date(isoNoDia(dia, Math.min(ini + 60, 24 * 60))));
  }

  /* ---------------- um item (função que desenha, não componente: o arraste não pode
     perder o elemento quando a tela redesenha) ---------------- */
  function aula({ a, continua }: NaCelula<Agendamento>) {
    const dia = diaLocal(a.inicio);
    const cor = prof.get(a.professorId)?.cor || '#8E8E88';
    const n = a.alunos.length;
    const parado = a.status === 'cancelado' || a.status === 'remarcado';
    const arrastavel = false; /* na lista do celular não se arrasta */
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

  /* ---------------- computador: a régua do ELLO ---------------- */
  function bloco(e: Encaixe, dia: string) {
    const b = blPorId.get(e.id);
    const topo = y(e.ini) + 1;
    const alto = Math.max(18, y(e.fim) - y(e.ini) - 2);
    const lado = { left: `calc(${(e.faixa / e.faixas) * 100}% + 1px)`, width: `calc(${100 / e.faixas}% - 2px)` };
    if (b) {
      const cor = prof.get(b.professorId || '')?.cor || '#8E8E88';
      return (
        <button key={e.id} type="button" className="ag-s-bl" style={{ top: topo, height: alto, ...lado, ...tinta(cor) }}
                title={`${motivoCompleto(b)} · ${nomeDoProf(b.professorId || '')} · ${horarioDoBloqueio(b, dia)}`}
                onClick={() => p.aoAbrirBloqueio(b.id)}>
          <span>{motivoCurto(b)}</span>
          <small>{nomeDoProf(b.professorId || '')}</small>
        </button>
      );
    }
    const a = porId.get(e.id);
    if (!a) return null;
    const cor = prof.get(a.professorId)?.cor || '#8E8E88';
    const n = a.alunos.length;
    const parado = a.status === 'cancelado' || a.status === 'remarcado';
    const arrastavel = p.podeRemarcar && a.status !== 'realizado';
    const rotulo = `${horarioDe(a, dia)}, ${p.nomeDaAula(a.aulaId)}, ${nomeDoProf(a.professorId)}, ${n} ${n === 1 ? 'aluno' : 'alunos'}, ${STATUS[a.status].nome}`;
    return (
      <div key={a.id} role="button" tabIndex={0} aria-label={rotulo}
           className={`ag-s-aula ag-tinta st-${a.status}${parado ? ' parado' : ''}${a.status === 'cancelado' ? ' cancelada' : ''}${e.faixas > 2 ? ' fino' : ''}`}
           style={{ top: topo, height: alto, ...lado, ...tinta(cor) }}
           draggable={arrastavel}
           onDragStart={arrastavel ? (ev) => comeca(ev, a, e) : undefined}
           onDragEnd={termina}
           onClick={() => { setDica(null); p.aoAbrir(a.id); }}
           onKeyDown={(ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); p.aoAbrir(a.id); } }}
           onMouseEnter={(ev) => { if (arrasto.current) return; const r = ev.currentTarget.getBoundingClientRect(); setDica({ a, x: r.right + 8, y: r.top }); }}
           onMouseLeave={() => setDica(null)}>
        <span className="ag-s-topo">
          <span className="ag-st" style={{ background: STATUS[a.status].cor }} />
          {faltaPresenca(a, agora) && <span className="ag-alerta" title="Falta lançar presença" />}
          {a.lembreteEnviadoEm && <span className="ag-wa" title="Lembrete enviado no WhatsApp"><Ic n="chat" /></span>}
        </span>
        <b>{nomeCurtoDaAula(p.nomeDaAula(a.aulaId))}</b>
        <span className="ag-s-prof">{nomeDoProf(a.professorId)}</span>
      </div>
    );
  }

  return (
    <div className="ag-sem ello" ref={rolagem}>
      <div className="ag-g-folha">
        <div className="ag-g-topo">
          <div className="ag-g-canto" />
          {dias.map((dia) => {
            const n = semana.porDia.get(dia) || 0;
            return (
              <button key={dia} type="button" className={`ag-sem-cab${dia === hoje ? ' hoje' : ''}`}
                      style={{ flexBasis: larguraDoDia(encaixes.get(dia) || []) }}
                      onClick={() => p.aoAbrirDia(dia)} title="Abrir este dia na Grade, por professor">
                <span>{SIGLA[diaDaSemana(dia)]}</span>
                <b className="num">{dia.slice(8, 10)}/{dia.slice(5, 7)}</b>
                <small className="num">{n} {n === 1 ? 'aula' : 'aulas'}</small>
              </button>
            );
          })}
        </div>

        <div className="ag-g-corpo" style={{ height: altura }}>
          <div className="ag-g-horas" aria-hidden="true">
            {faixas.map((f, i) => (
              <span key={f.ini} style={{ top: t[i], height: alturas[i] }}>{hhmm(f.ini)}</span>
            ))}
          </div>

          {dias.map((dia) => (
            <div key={dia} className={`ag-g-col ag-s-dia${dia === hoje ? ' hoje' : ''}`} style={{ flexBasis: larguraDoDia(encaixes.get(dia) || []) }}
                 onDragOver={(e) => passa(e, dia)} onDrop={(e) => solta(e, dia)}
                 onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setSombra((s) => (s?.dia === dia ? null : s)); }}>
              {faixas.map((f, i) => (
                <button key={f.ini} type="button" tabIndex={-1} className="ag-g-slot"
                        style={{ top: t[i], height: alturas[i] }} disabled={!p.podeCriar}
                        aria-label={`Nova aula ${NOME_DIA[diaDaSemana(dia)]} às ${hhmm(f.ini)}`}
                        title={p.podeCriar ? `Nova aula ${NOME_DIA[diaDaSemana(dia)]} às ${hhmm(f.ini)}` : undefined}
                        onClick={() => nova(dia, f.ini)} />
              ))}

              {daEscola.map((b) => {
                const ini = Math.max(comeco, minutosNoDia(b.inicio, dia));
                const fim = Math.min(final, minutosNoDia(b.fim, dia));
                if (fim <= ini) return null;
                return (
                  <div key={b.id} className="ag-g-bl ag-s-escola" style={{ top: y(ini), height: y(fim) - y(ini) }} title={motivoCompleto(b)}>
                    <button type="button" className="ag-g-bl-tx" onClick={() => p.aoAbrirBloqueio(b.id)}>{motivoCurto(b)}</button>
                  </div>
                );
              })}

              {sombra?.dia === dia && <div className="ag-g-sombra" style={{ top: y(sombra.ini), height: y(sombra.fim) - y(sombra.ini) }} />}

              {(encaixes.get(dia) || []).map((e) => bloco(e, dia))}

              {dia === hoje && minutoAgora >= comeco && minutoAgora <= final && <div className="ag-g-agora ag-s-agora" style={{ top: y(minutoAgora) }} aria-hidden="true" />}
            </div>
          ))}
        </div>
      </div>
      {dica && <CartaoDaAula {...dica} professor={prof.get(dica.a.professorId)} aula={p.nomeDaAula(dica.a.aulaId)} />}
    </div>
  );
}
