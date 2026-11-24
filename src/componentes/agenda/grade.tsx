'use client';
/* A Grade da agenda (24/11/2026): um dia por vez, uma coluna por professor, como a
   recepção trabalha ("quem está livre às 18h30?"). Feita aqui, sem plugin do calendário.
   - Colunas: "A definir" sempre primeiro (a fila sem professor), depois quem tem mais aula
     no dia; cabeçalho e coluna de horas presos ao rolar; nada se espreme (rola de lado).
   - Linhas de 30 em 30 minutos, das 7h30 às 21h30; a linha cresce para o cartão mostrar
     todos os alunos.
   - Cartão: a cor do professor suave no fundo e a cheia na borda, bolinha de status, nome
     da aula e os alunos, um por linha, quem faltou riscado.
   - Bloqueio do professor só na coluna dele; o da escola atravessa todas.
   - Clique no horário vazio: aula nova com aquele professor, dia e hora. Arrastar: outro
     horário e, em outra coluna, outro professor (quem confere e grava é agenda.tsx).
   - No celular, um professor por vez, trocando pelo seletor ou deslizando.
   As contas moram em src/lib/dominio/agenda-grade.ts. */
import { useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent } from 'react';
import { Ic } from '@/componentes/icones';
import { diaLocal, faltaPresenca, horaLocal, inicioDoDia, somaDias, sobrepoe, STATUS, type Agendamento, type Bloqueio, type Professor } from '@/lib/dominio/agenda';
import {
  alturaDoCartao, alturasDasLinhas, arredonda, colunaDaAula, colunasDaGrade, encaixa, GRADE_FIM, GRADE_INICIO, ID_SEM_PROFESSOR, idDaFila,
  isoNoDia, mantemOrdem, minutoDoY, minutosNoDia, motivoCompleto, motivoCurto, nomesQueCabem, PASSO, rotulosDasLinhas, tintaDoProfessor,
  topos, yDoMinuto, type ColunaDaGrade, type Encaixe,
} from '@/lib/dominio/agenda-grade';

interface Props {
  dia: string;                         // AAAA-MM-DD, sempre um dia aberto
  agendamentos: Agendamento[];         // as aulas do dia, já filtradas
  bloqueios: Bloqueio[];
  professores: Professor[];
  soProfessores: string[];             // o filtro de professor
  nomeDaAula: (id: string) => string;
  podeCriar: boolean;
  podeRemarcar: boolean;
  agora: Date;                         // new Date(0) enquanto a hora não é conhecida
  rolarAte?: string;                   // HH:MM: abre perto dessa hora
  estreita: boolean;                   // celular: um professor por vez
  aoNova: (professorId: string, inicio: Date, fim: Date) => void;
  aoAbrir: (id: string) => void;
  aoAbrirBloqueio: (id: string) => void;
  aoMover: (id: string, inicio: Date, fim: Date, professorId?: string) => void;
}

const LARGURA_MINIMA = 150;
const LARGURA_POR_FAIXA = 130;

/** As cores do professor como variáveis do CSS (fundo e texto de cada tema). */
function tinta(cor: string): CSSProperties {
  const t = tintaDoProfessor(cor);
  return { '--g-cor': t.cheia, '--g-fc': t.fundoClaro, '--g-tc': t.textoClaro, '--g-fe': t.fundoEscuro, '--g-te': t.textoEscuro } as CSSProperties;
}

/** "Maria Ferreira": primeiro e último nome, que cabem na coluna e não se confundem. */
const nomeNaGrade = (nome: string) => {
  const p = (nome || '').trim().split(/\s+/).filter(Boolean);
  return p.length > 1 ? `${p[0]} ${p[p.length - 1]}` : p[0] || 'Aluno';
};

interface Arrasto { id: string; colunaDeOrigem: string; deslocamento: number; duracao: number }

export default function Grade(p: Props) {
  const { dia, agendamentos, bloqueios, professores, agora, estreita } = p;
  const rolagem = useRef<HTMLDivElement | null>(null);
  const arrasto = useRef<Arrasto | null>(null);
  const toque = useRef<{ x: number; y: number } | null>(null);
  const [sombra, setSombra] = useState<{ col: string; ini: number; fim: number } | null>(null);
  const [escolhida, setEscolhida] = useState<string | null>(null);

  const idsDaEquipe = useMemo(() => new Set(professores.map((x) => x.id)), [professores]);
  const fila = useMemo(() => idDaFila(professores), [professores]);
  const calculadas = useMemo(() => colunasDaGrade(professores, agendamentos, p.soProfessores), [professores, agendamentos, p.soProfessores]);
  /* a ordem (quem tem mais aula) vale ao abrir o dia e quando as aulas chegam; depois
     fica parada, para a coluna não pular de lugar quando alguém arrasta uma aula */
  const [ordem, setOrdem] = useState<{ dia: string; comAulas: boolean; ids: string[] }>({ dia: '', comAulas: false, ids: [] });
  if (ordem.dia !== dia || (!ordem.comAulas && agendamentos.length > 0)) {
    setOrdem({ dia, comAulas: agendamentos.length > 0, ids: calculadas.map((c) => c.id) });
  }
  const todas = useMemo(() => mantemOrdem(calculadas, ordem.dia === dia ? ordem.ids : calculadas.map((c) => c.id)), [calculadas, ordem, dia]);

  /* no celular, um professor por vez: o escolhido, ou o primeiro que tem aula no dia */
  const atual = useMemo(() => (estreita ? (todas.find((c) => c.id === escolhida) || todas.find((c) => c.aulas > 0) || todas[0]) : null),
    [estreita, todas, escolhida]);
  const colunas = useMemo(() => (estreita ? (atual ? [atual] : []) : todas), [estreita, atual, todas]);
  const indiceAtual = atual ? todas.indexOf(atual) : -1;
  const vaiPara = (n: number) => { const c = todas[(n + todas.length) % todas.length]; if (c) setEscolhida(c.id); };

  const porColuna = useMemo(() => {
    const m = new Map<string, Agendamento[]>();
    for (const a of agendamentos) {
      const c = colunaDaAula(a.professorId, idsDaEquipe, fila);
      m.set(c, [...(m.get(c) || []), a]);
    }
    return m;
  }, [agendamentos, idsDaEquipe, fila]);

  const doDia = useMemo(() => {
    const janela = { inicio: inicioDoDia(dia), fim: inicioDoDia(somaDias(dia, 1)) };
    return bloqueios.filter((b) => sobrepoe(b, janela));
  }, [bloqueios, dia]);
  const daEscola = doDia.filter((b) => !b.professorId);

  const encaixes = useMemo(() => new Map(colunas.map((c) => [c.id, encaixa(porColuna.get(c.id) || [], dia)])), [colunas, porColuna, dia]);
  const porId = useMemo(() => new Map(agendamentos.map((a) => [a.id, a])), [agendamentos]);

  /* as linhas crescem só pelo que está na tela */
  const alturas = useMemo(() => alturasDasLinhas([...encaixes.values()].flat().map((e) => ({
    ini: e.ini, fim: e.fim, alunos: porId.get(e.id)?.alunos.length || 0,
  }))), [encaixes, porId]);
  const t = useMemo(() => topos(alturas), [alturas]);
  const altura = t[t.length - 1];
  const rotulos = useMemo(() => rotulosDasLinhas(), []);
  const y = (min: number) => yDoMinuto(min, alturas, t);

  /* abre perto da hora pedida; hoje, uma hora antes de agora; senão, no começo */
  const conhecida = agora.getTime() > 0;
  const hojeAqui = conhecida && diaLocal(agora) === dia;
  const minutoAgora = hojeAqui ? minutosNoDia(agora.toISOString(), dia) : -1;
  const alvo = p.rolarAte
    ? Number(p.rolarAte.slice(0, 2)) * 60 + Number(p.rolarAte.slice(3, 5)) - PASSO
    : hojeAqui ? minutoAgora - 60 : GRADE_INICIO;
  const yDoAlvo = yDoMinuto(alvo, alturas, t);
  /* rola ao trocar de dia ou de hora pedida, e de novo quando as aulas do dia chegam
     (as linhas crescem); depois, quem rola é a pessoa */
  const chegou = agendamentos.length > 0;
  useEffect(() => {
    const el = rolagem.current;
    if (el) el.scrollTop = Math.max(0, yDoAlvo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dia, p.rolarAte, hojeAqui, chegou]);

  function largura(c: ColunaDaGrade) {
    const faixas = Math.max(1, ...(encaixes.get(c.id) || []).map((e) => e.faixas));
    return Math.max(LARGURA_MINIMA, faixas * LARGURA_POR_FAIXA);
  }

  function novaEm(c: ColunaDaGrade, linha: number) {
    const ini = GRADE_INICIO + linha * PASSO;
    p.aoNova(c.id, new Date(isoNoDia(dia, ini)), new Date(isoNoDia(dia, Math.min(ini + 60, GRADE_FIM))));
  }

  /* ---------------- arrastar ---------------- */
  function comeca(e: DragEvent<HTMLDivElement>, a: Agendamento, enc: Encaixe, coluna: string) {
    const r = e.currentTarget.getBoundingClientRect();
    const noCartao = minutoDoY(y(enc.ini) + (e.clientY - r.top), alturas, t) - enc.ini;
    arrasto.current = {
      id: a.id, colunaDeOrigem: coluna, deslocamento: Math.max(0, noCartao),
      duracao: Math.max(PASSO / 2, minutosNoDia(a.fim, dia) - minutosNoDia(a.inicio, dia)),
    };
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', a.id);
  }
  function lugar(e: DragEvent<HTMLDivElement>) {
    const a = arrasto.current;
    if (!a) return null;
    const topo = e.currentTarget.getBoundingClientRect().top;
    const ini = arredonda(minutoDoY(e.clientY - topo, alturas, t) - a.deslocamento);
    const cabe = Math.min(Math.max(ini, GRADE_INICIO), GRADE_FIM - Math.min(a.duracao, GRADE_FIM - GRADE_INICIO));
    return { ini: cabe, fim: cabe + a.duracao };
  }
  function passa(e: DragEvent<HTMLDivElement>, c: ColunaDaGrade) {
    /* a coluna sem professor da equipe não recebe aula: não há a quem passar */
    if (!arrasto.current || c.id === ID_SEM_PROFESSOR) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const l = lugar(e);
    if (l && (sombra?.col !== c.id || sombra.ini !== l.ini)) setSombra({ col: c.id, ...l });
  }
  function solta(e: DragEvent<HTMLDivElement>, c: ColunaDaGrade) {
    e.preventDefault();
    const a = arrasto.current;
    const l = lugar(e);
    arrasto.current = null;
    setSombra(null);
    if (!a || !l || c.id === ID_SEM_PROFESSOR) return;
    const original = porId.get(a.id);
    if (!original) return;
    const mesmoLugar = c.id === a.colunaDeOrigem && l.ini === minutosNoDia(original.inicio, dia);
    if (mesmoLugar) return;
    p.aoMover(a.id, new Date(isoNoDia(dia, l.ini)), new Date(isoNoDia(dia, l.fim)), c.id !== a.colunaDeOrigem ? c.id : undefined);
  }
  const terminaArrasto = () => { arrasto.current = null; setSombra(null); };

  /* ---------------- celular: deslizar troca o professor ---------------- */
  const deslizaInicio = (x: number, yy: number) => { toque.current = { x, y: yy }; };
  const deslizaFim = (x: number, yy: number) => {
    const ini = toque.current;
    toque.current = null;
    if (!estreita || !ini) return;
    const dx = x - ini.x;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(yy - ini.y) * 1.5) vaiPara(indiceAtual + (dx < 0 ? 1 : -1));
  };

  if (!todas.length) {
    return (
      <div className="ag-grade vazia">
        <p>Nenhum professor na agenda ainda. Quem dá aula entra em Cadastros, Professores.</p>
      </div>
    );
  }

  return (
    <>
      {estreita && atual && (
        <div className="ag-g-troca" role="group" aria-label="Professor na grade">
          <button className="ib" aria-label="Professor anterior" onClick={() => vaiPara(indiceAtual - 1)}><Ic n="volta" /></button>
          <select className="cx ag-tinta" aria-label="Escolher o professor" value={atual.id} onChange={(e) => setEscolhida(e.target.value)} style={tinta(atual.cor)}>
            {todas.map((c) => <option key={c.id || 'fila'} value={c.id}>{c.aDefinir ? 'A definir (sem professor)' : c.nome} · {c.aulas} {c.aulas === 1 ? 'aula' : 'aulas'}</option>)}
          </select>
          <button className="ib" aria-label="Próximo professor" onClick={() => vaiPara(indiceAtual + 1)}><Ic n="seta" /></button>
        </div>
      )}
      <div className={`ag-grade${estreita ? ' um' : ''}`} ref={rolagem}
           onTouchStart={(e) => deslizaInicio(e.touches[0].clientX, e.touches[0].clientY)}
           onTouchEnd={(e) => deslizaFim(e.changedTouches[0].clientX, e.changedTouches[0].clientY)}>
        <div className="ag-g-folha">
          <div className="ag-g-topo">
            <div className="ag-g-canto" />
            {colunas.map((c) => (
              <div key={c.id || 'fila'} className={`ag-g-cab${c.aDefinir ? ' fila' : ' ag-tinta'}`} style={{ flexBasis: largura(c), ...tinta(c.cor) }}
                   title={c.aDefinir ? 'Aulas que ainda não têm professor' : c.nome}>
                <b>{c.curto}</b>
                <small className="num">{c.aulas} {c.aulas === 1 ? 'aula' : 'aulas'}</small>
              </div>
            ))}
          </div>

          <div className="ag-g-corpo" style={{ height: altura }}>
            <div className="ag-g-horas" aria-hidden="true">
              {rotulos.map((r, i) => (
                <span key={r} className={r.endsWith(':30') ? 'meia' : undefined} style={{ top: t[i], height: alturas[i] }}>{r}</span>
              ))}
            </div>

            {colunas.map((c) => (
              <div key={c.id || 'fila'} className={`ag-g-col${c.aDefinir ? ' fila' : ''}`} style={{ flexBasis: largura(c) }}
                   onDragOver={(e) => passa(e, c)} onDrop={(e) => solta(e, c)}
                   onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setSombra((s) => (s?.col === c.id ? null : s)); }}>
                {alturas.map((h, i) => (
                  <button key={i} type="button" tabIndex={-1} className={`ag-g-slot${rotulos[i].endsWith(':30') ? ' meia' : ''}`}
                          style={{ top: t[i], height: h }} aria-label={`Nova aula com ${c.curto} às ${rotulos[i]}`}
                          onClick={() => novaEm(c, i)} />
                ))}

                {doDia.filter((b) => b.professorId && b.professorId === c.id).map((b) => {
                  const ini = Math.max(GRADE_INICIO, minutosNoDia(b.inicio, dia));
                  const fim = Math.min(GRADE_FIM, minutosNoDia(b.fim, dia));
                  if (fim <= ini) return null;
                  return (
                    <div key={b.id} className="ag-g-bl" style={{ top: y(ini), height: y(fim) - y(ini) }} title={motivoCompleto(b)}>
                      <button type="button" className="ag-g-bl-tx" onClick={() => p.aoAbrirBloqueio(b.id)}>{motivoCurto(b)}</button>
                    </div>
                  );
                })}

                {sombra?.col === c.id && <div className="ag-g-sombra" style={{ top: y(sombra.ini), height: y(sombra.fim) - y(sombra.ini) }} />}

                {(encaixes.get(c.id) || []).map((e) => {
                  const a = porId.get(e.id);
                  if (!a) return null;
                  const topo = y(e.ini);
                  const alto = alturaDoCartao(y(e.fim) - topo);
                  const cabe = nomesQueCabem(alto, a.alunos.length);
                  const parado = a.status === 'cancelado' || a.status === 'remarcado';
                  const arrastavel = p.podeRemarcar && a.status !== 'realizado';
                  const cor = professores.find((x) => x.id === a.professorId)?.cor || c.cor;
                  return (
                    <div key={a.id} role="button" tabIndex={0}
                         className={`ag-g-aula ag-tinta st-${a.status}${parado ? ' parado' : ''}${a.status === 'cancelado' ? ' cancelada' : ''}${e.faixas > 1 ? ' estreito' : ''}`}
                         style={{ top: topo + 1, height: alto, left: `calc(${(e.faixa / e.faixas) * 100}% + 3px)`, width: `calc(${100 / e.faixas}% - 6px)`, ...tinta(cor) }}
                         title={`${horaLocal(a.inicio)} às ${horaLocal(a.fim)} · ${STATUS[a.status].nome}${e.cortadoAntes || e.cortadoDepois ? ' (passa do horário da grade)' : ''}`}
                         draggable={arrastavel}
                         onDragStart={arrastavel ? (ev) => comeca(ev, a, e, c.id) : undefined}
                         onDragEnd={terminaArrasto}
                         onClick={() => p.aoAbrir(a.id)}
                         onKeyDown={(ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); p.aoAbrir(a.id); } }}>
                      <span className="ag-g-a-topo">
                        <span className="ag-st" style={{ background: STATUS[a.status].cor }} />
                        <b>{p.nomeDaAula(a.aulaId)}</b>
                        {!cabe.nomes && cabe.mais > 0 && <small className="num">+{cabe.mais}</small>}
                        {faltaPresenca(a, agora) && <span className="ag-alerta" title="Falta lançar presença" />}
                        {a.lembreteEnviadoEm && <span className="ag-wa" title="Lembrete enviado no WhatsApp"><Ic n="chat" /></span>}
                      </span>
                      {a.alunos.length === 0 && cabe.nomes === 0 && alto > 36 && <span className="ag-g-al vazio">sem alunos</span>}
                      {a.alunos.slice(0, cabe.nomes).map((x) => (
                        <span key={x.id} className={`ag-g-al${x.presenca === 'faltou' ? ' falta' : ''}`}>{nomeNaGrade(x.nome)}</span>
                      ))}
                      {cabe.nomes > 0 && cabe.mais > 0 && <span className="ag-g-al mais">+{cabe.mais} {cabe.mais === 1 ? 'aluno' : 'alunos'}</span>}
                    </div>
                  );
                })}
              </div>
            ))}

            {daEscola.map((b) => {
              const ini = Math.max(GRADE_INICIO, minutosNoDia(b.inicio, dia));
              const fim = Math.min(GRADE_FIM, minutosNoDia(b.fim, dia));
              if (fim <= ini) return null;
              return (
                <div key={b.id} className="ag-g-bl escola" style={{ top: y(ini), height: y(fim) - y(ini) }} title={motivoCompleto(b)}>
                  <button type="button" className="ag-g-bl-tx" onClick={() => p.aoAbrirBloqueio(b.id)}>{motivoCurto(b)}</button>
                </div>
              );
            })}

            {minutoAgora >= GRADE_INICIO && minutoAgora <= GRADE_FIM && <div className="ag-g-agora" style={{ top: y(minutoAgora) }} aria-hidden="true" />}
          </div>
        </div>
      </div>
    </>
  );
}
