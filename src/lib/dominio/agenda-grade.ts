/* A Grade e a Semana da agenda: contas puras, sem banco e sem tela.
   Grade (24/11/2026) = um dia por vez, uma coluna por professor, linhas de hora cheia
   das 7h às 22h. Semana (refeita em 24/11/2026, a visão padrão) = os dias abertos lado a
   lado e as horas cheias de cima para baixo; cada célula lista TODAS as aulas que começam
   naquela hora, uma embaixo da outra, sem "+N". Mora aqui:
   - a ordem das colunas da Grade ("A definir" sempre primeiro, depois quem tem mais aula);
   - o encaixe das aulas na coluna (lado a lado só quando duas se sobrepõem);
   - a altura de cada linha da Grade, que cresce para o cartão mostrar todos os alunos;
   - a volta do pixel para a hora (arrastar e soltar);
   - as células da Semana e onde cada bloqueio aparece nela;
   - o contador, os nomes curtos e a tinta suave da cor do professor.
   As regras da agenda (conflito, recorrência, permissão) continuam em agenda.ts.
   Prova: node --experimental-strip-types testes/agenda-grade.ts */
import { BLOQUEIOS, diaLocal, inicioDoDia, textoSobre, type Agendamento, type Bloqueio, type Professor } from './agenda.ts';

/* ================= a régua do dia ================= */

/* hora cheia (pedido do cliente: "pode ser hora cheia, não precisa ser hora quebrada") */
export const GRADE_INICIO = 7 * 60;   // minutos desde a meia-noite
export const GRADE_FIM = 22 * 60;
export const PASSO = 60;
export const LINHAS = (GRADE_FIM - GRADE_INICIO) / PASSO;

export const hhmm = (min: number) => {
  const m = Math.round(min);
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};

/** Minutos desde a meia-noite de Chapecó daquele dia (passa de 1440 se for no dia seguinte). */
export const minutosNoDia = (iso: string, dia: string) =>
  Math.round((new Date(iso).getTime() - new Date(inicioDoDia(dia)).getTime()) / 60_000);

/** O instante (ISO) de um minuto num dia de Chapecó. */
export const isoNoDia = (dia: string, min: number) => new Date(new Date(inicioDoDia(dia)).getTime() + min * 60_000).toISOString();

/** "07:00", "08:00" ... "21:00": o começo de cada linha. */
export const rotulosDasLinhas = () => Array.from({ length: LINHAS }, (_, i) => hhmm(GRADE_INICIO + i * PASSO));

/* ================= as colunas ================= */

/** Coluna das aulas cujo professor não está na equipe, quando não existe um "A definir". */
export const ID_SEM_PROFESSOR = '';

const normaliza = (t: string) => (t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();

/** O professor "A definir" é a fila das aulas que ainda não têm professor. */
export const ehADefinir = (nome: string) => /^(a definir|sem professor)\b/.test(normaliza(nome));

/** O primeiro nome; quando dois professores começam igual, com a inicial do último. */
export function nomesCurtosDosProfessores(nomes: string[]): string[] {
  const partes = nomes.map((n) => (n || '').trim().split(/\s+/).filter(Boolean));
  const primeiros = partes.map((p) => normaliza(p[0] || ''));
  return partes.map((p, i) => {
    if (!p.length) return '';
    const repetido = primeiros.filter((x) => x === primeiros[i]).length > 1;
    return repetido && p.length > 1 ? `${p[0]} ${p[p.length - 1][0]}.` : p[0];
  });
}

export interface ColunaDaGrade {
  id: string;          // id do professor; '' é a fila sem professor
  nome: string;
  curto: string;
  cor: string;
  aDefinir: boolean;
  aulas: number;       // quantas aulas (das que estão na tela) ele tem no dia
}

/** A coluna de uma aula: a do professor dela, ou a fila "A definir" quando ele não está na equipe. */
export function colunaDaAula(professorId: string, ids: ReadonlySet<string>, idDaFila: string) {
  return professorId && ids.has(professorId) ? professorId : idDaFila;
}

/** O id da coluna "A definir": o professor com esse nome, ou a coluna sem professor. */
export const idDaFila = (professores: Pick<Professor, 'id' | 'nome'>[]) =>
  professores.find((p) => ehADefinir(p.nome))?.id ?? ID_SEM_PROFESSOR;

/**
 * As colunas do dia: todos os professores (os do filtro, se houver), com "A definir"
 * sempre na primeira e o resto na ordem de quem tem mais aula; empate vai pelo nome.
 * A coluna sem professor só aparece quando há aula nela.
 */
export function colunasDaGrade(
  professores: Professor[], aulas: Pick<Agendamento, 'professorId'>[], soEstes: string[] = [],
): ColunaDaGrade[] {
  const ids = new Set(professores.map((p) => p.id));
  const fila = idDaFila(professores);
  const conta = new Map<string, number>();
  for (const a of aulas) {
    const c = colunaDaAula(a.professorId, ids, fila);
    conta.set(c, (conta.get(c) || 0) + 1);
  }
  const curtos = nomesCurtosDosProfessores(professores.map((p) => p.nome));
  const lista: ColunaDaGrade[] = professores.map((p, i) => {
    const aDefinir = ehADefinir(p.nome);
    return { id: p.id, nome: p.nome, curto: aDefinir ? 'A definir' : curtos[i], cor: p.cor, aDefinir, aulas: conta.get(p.id) || 0 };
  });
  if (fila === ID_SEM_PROFESSOR && conta.get(ID_SEM_PROFESSOR)) {
    lista.push({ id: ID_SEM_PROFESSOR, nome: 'A definir', curto: 'A definir', cor: '#8E8E88', aDefinir: true, aulas: conta.get(ID_SEM_PROFESSOR) || 0 });
  }
  return lista
    .filter((c) => !soEstes.length || soEstes.includes(c.id))
    .sort((a, b) => Number(b.aDefinir) - Number(a.aDefinir) || b.aulas - a.aulas || a.nome.localeCompare(b.nome, 'pt-BR'));
}

/** A ordem das colunas fica parada enquanto a pessoa está no mesmo dia: arrastar uma
    aula para outro professor não faz a coluna dele pular de lugar. Quem entrou depois
    vai para o fim; "A definir" continua primeiro. */
export function mantemOrdem(colunas: ColunaDaGrade[], ordem: string[]): ColunaDaGrade[] {
  const pos = new Map(ordem.map((id, i) => [id, i]));
  const de = (c: ColunaDaGrade) => pos.get(c.id) ?? ordem.length + colunas.indexOf(c);
  return [...colunas].sort((a, b) => Number(b.aDefinir) - Number(a.aDefinir) || de(a) - de(b));
}

/* ================= o encaixe na coluna ================= */

export interface Encaixe {
  id: string;
  ini: number;          // minutos, já dentro da grade
  fim: number;
  faixa: number;        // 0, 1...: lado a lado quando dois se sobrepõem
  faixas: number;       // quantas faixas o grupo dele usa
  cortadoAntes: boolean;
  cortadoDepois: boolean;
}

/** Os itens de uma coluna no dia: o trecho dentro da grade e a faixa de cada um. Nada
    some: o que começa antes das 7h30 ou passa das 21h30 aparece cortado na borda. */
export function encaixa(itens: { id: string; inicio: string; fim: string }[], dia: string): Encaixe[] {
  const base = itens.map((x) => {
    const i = minutosNoDia(x.inicio, dia);
    const f = minutosNoDia(x.fim, dia);
    const ini = Math.min(Math.max(i, GRADE_INICIO), GRADE_FIM - PASSO / 2);
    const fim = Math.min(Math.max(f, ini + PASSO / 2), GRADE_FIM);
    return { id: x.id, ini, fim, faixa: 0, faixas: 1, cortadoAntes: i < GRADE_INICIO, cortadoDepois: f > GRADE_FIM };
  });
  const ordem = [...base].sort((a, b) => a.ini - b.ini || b.fim - a.fim || a.id.localeCompare(b.id));
  let grupo: Encaixe[] = [];
  let fins: number[] = [];
  let fimDoGrupo = -Infinity;
  const fecha = () => {
    for (const g of grupo) g.faixas = fins.length;
    grupo = [];
    fins = [];
  };
  for (const e of ordem) {
    if (e.ini >= fimDoGrupo) { fecha(); fimDoGrupo = -Infinity; }
    let f = fins.findIndex((x) => x <= e.ini);
    if (f < 0) { f = fins.length; fins.push(e.fim); } else fins[f] = e.fim;
    e.faixa = f;
    grupo.push(e);
    fimDoGrupo = Math.max(fimDoGrupo, e.fim);
  }
  fecha();
  return base;
}

/* ================= a altura das linhas ================= */

export interface Medidas {
  base: number;        // px de cada linha de uma hora
  vao: number;         // o espaço entre um cartão e o seguinte, que sai da altura dele
  folga: number;       // respiro de cima e de baixo do cartão
  cabecalho: number;   // a linha da bolinha e do nome da aula
  linha: number;       // cada aluno
  maxAlunos: number;   // acima disso, o cartão mostra um a menos e o "+N"
  maxLinha: number;    // nenhuma linha passa disso
}
export const MEDIDAS: Medidas = { base: 80, vao: 2, folga: 8, cabecalho: 19, linha: 16, maxAlunos: 8, maxLinha: 320 };

/** A altura que o trecho do cartão pede para mostrar todos os alunos (até o máximo),
    contando o vão até o cartão de baixo. */
export const alturaPedida = (alunos: number, m: Medidas = MEDIDAS) =>
  m.vao + m.folga + m.cabecalho + Math.max(1, Math.min(alunos, m.maxAlunos)) * m.linha;

/** A altura do cartão desenhado num trecho de tantos px (o trecho menos o vão). */
export const alturaDoCartao = (trecho: number, m: Medidas = MEDIDAS) => Math.max(18, trecho - m.vao);

/** Quanto do trecho [ini, fim) cai em cada linha (0 a 1). */
function cobertura(ini: number, fim: number) {
  const c: number[] = Array(LINHAS).fill(0);
  for (let r = 0; r < LINHAS; r += 1) {
    const a = GRADE_INICIO + r * PASSO;
    const sobra = Math.min(fim, a + PASSO) - Math.max(ini, a);
    if (sobra > 0) c[r] = sobra / PASSO;
  }
  return c;
}

/**
 * A altura de cada linha de uma hora. Começa na base e cresce onde um cartão precisa
 * para mostrar todos os alunos. A linha vale para todas as colunas, como numa planilha.
 */
export function alturasDasLinhas(cartoes: { ini: number; fim: number; alunos: number }[], m: Medidas = MEDIDAS): number[] {
  const h: number[] = Array(LINHAS).fill(m.base);
  const ordem = [...cartoes].sort((a, b) => (a.fim - a.ini) - (b.fim - b.ini));
  for (let volta = 0; volta < 2; volta += 1) {
    for (const c of ordem) {
      const cob = cobertura(c.ini, c.fim);
      const soma = cob.reduce((s, x) => s + x, 0);
      if (!soma) continue;
      const tem = cob.reduce((s, x, r) => s + x * h[r], 0);
      const falta = alturaPedida(c.alunos, m) - tem;
      if (falta <= 0.5) continue;
      const mais = Math.ceil(falta / soma);
      cob.forEach((x, r) => { if (x > 0) h[r] = Math.min(m.maxLinha, h[r] + mais); });
    }
  }
  return h;
}

/** Onde começa cada linha, em px (uma posição a mais: o fim da grade). */
export function topos(alturas: number[]): number[] {
  const t = [0];
  for (const a of alturas) t.push(t[t.length - 1] + a);
  return t;
}

/** O px de um minuto na grade. */
export function yDoMinuto(min: number, alturas: number[], t: number[] = topos(alturas)) {
  const x = Math.min(Math.max((min - GRADE_INICIO) / PASSO, 0), LINHAS);
  const r = Math.min(LINHAS - 1, Math.floor(x));
  return t[r] + (x - r) * alturas[r];
}

/** O minuto de um px na grade (a volta de yDoMinuto), para soltar a aula arrastada. */
export function minutoDoY(y: number, alturas: number[], t: number[] = topos(alturas)) {
  const yy = Math.min(Math.max(y, 0), t[LINHAS]);
  let r = 0;
  while (r < LINHAS - 1 && t[r + 1] <= yy) r += 1;
  return GRADE_INICIO + (r + (yy - t[r]) / alturas[r]) * PASSO;
}

/** Arredonda para o passo do arraste (15 minutos). */
export const arredonda = (min: number, passo = 15) => Math.round(min / passo) * passo;

/** Quantos nomes cabem num cartão desta altura, e quantos vão para o "+N". */
export function nomesQueCabem(altura: number, alunos: number, m: Medidas = MEDIDAS): { nomes: number; mais: number } {
  const linhas = Math.max(0, Math.floor((altura - m.folga - m.cabecalho) / m.linha));
  if (alunos <= linhas) return { nomes: alunos, mais: 0 };
  const nomes = Math.max(0, linhas - 1);
  return { nomes, mais: alunos - nomes };
}

/* ================= a Semana: hora cheia, todas as aulas ================= */

/** As horas que a Semana sempre mostra (7h a 21h); aula fora disso abre a linha dela. */
export const SEMANA_INICIO = 7;
export const SEMANA_FIM = 21;

/** A hora cheia em que a aula começa, no dia dela (18:30 fica na linha das 18h). */
export const horaDoInicio = (iso: string, dia: string) =>
  Math.min(23, Math.max(0, Math.floor(minutosNoDia(iso, dia) / 60)));

export const chaveDaCelula = (dia: string, hora: number) => `${dia}|${hora}`;

export interface Semana<T> {
  horas: number[];                       // as linhas, de cima para baixo
  celulas: Map<string, T[]>;             // dia|hora: as aulas, em ordem de horário
  porDia: Map<string, number>;           // quantas aulas em cada dia
  maisCheia: Map<number, number>;        // a célula mais cheia de cada hora (para a altura)
}

/**
 * A Semana: cada aula na célula do dia e da hora cheia em que começa, todas, uma
 * embaixo da outra (por horário e, no mesmo horário, pelo desempate dado, o nome do
 * professor). Nenhuma fica de fora: aula antes das 7h ou depois das 21h abre a linha.
 */
export function montaSemana<T extends { id: string; inicio: string }>(
  itens: T[], dias: string[], desempate: (a: T, b: T) => number = () => 0,
): Semana<T> {
  const aberto = new Set(dias);
  const celulas = new Map<string, T[]>();
  const porDia = new Map<string, number>(dias.map((d) => [d, 0]));
  const horas = new Set<number>();
  for (let h = SEMANA_INICIO; h <= SEMANA_FIM; h += 1) horas.add(h);
  for (const a of itens) {
    const dia = diaLocal(a.inicio);
    if (!aberto.has(dia)) continue;
    const h = horaDoInicio(a.inicio, dia);
    horas.add(h);
    const k = chaveDaCelula(dia, h);
    celulas.set(k, [...(celulas.get(k) || []), a]);
    porDia.set(dia, (porDia.get(dia) || 0) + 1);
  }
  const maisCheia = new Map<number, number>();
  for (const [k, l] of celulas) {
    l.sort((a, b) => new Date(a.inicio).getTime() - new Date(b.inicio).getTime() || desempate(a, b) || a.id.localeCompare(b.id));
    const h = Number(k.split('|')[1]);
    maisCheia.set(h, Math.max(maisCheia.get(h) || 0, l.length));
  }
  return { horas: [...horas].sort((a, b) => a - b), celulas, porDia, maisCheia };
}

export interface BloqueioNaCelula { rotulos: Bloqueio[]; daEscola: Bloqueio[] }

/**
 * Onde cada bloqueio aparece na Semana: o da escola pinta todas as células que cobre,
 * com o nome na primeira; o do professor (quando a pessoa pede para ver) entra como um
 * item pequeno só na primeira célula que cobre, em cada dia.
 */
export function bloqueiosDaSemana(bloqueios: Bloqueio[], dias: string[], horas: number[]): Map<string, BloqueioNaCelula> {
  const m = new Map<string, BloqueioNaCelula>();
  const pega = (k: string) => { const c = m.get(k) || { rotulos: [], daEscola: [] }; m.set(k, c); return c; };
  for (const b of bloqueios) {
    for (const dia of dias) {
      const ini = Math.max(0, minutosNoDia(b.inicio, dia));
      const fim = Math.min(24 * 60, minutosNoDia(b.fim, dia));
      if (fim <= ini) continue;
      const cobre = horas.filter((h) => h * 60 < fim && (h + 1) * 60 > ini);
      if (!cobre.length) continue;
      pega(chaveDaCelula(dia, cobre[0])).rotulos.push(b);
      if (!b.professorId) for (const h of cobre) pega(chaveDaCelula(dia, h)).daEscola.push(b);
    }
  }
  return m;
}

/** "18:30 às 19:30": o horário do item da Semana. */
export const horarioDe = (a: { inicio: string; fim: string }, dia: string) =>
  `${hhmm(minutosNoDia(a.inicio, dia))} às ${hhmm(minutosNoDia(a.fim, dia))}`;

/* ================= o que se lê ================= */

/** "155 aulas · 98 alunos": as aulas na tela e quantos alunos diferentes estão nelas. */
export function contaDoPeriodo(aulas: Pick<Agendamento, 'alunoIds' | 'alunos'>[]) {
  const ids = new Set<string>();
  for (const a of aulas) for (const id of a.alunoIds?.length ? a.alunoIds : (a.alunos || []).map((x) => x.id)) ids.add(id);
  const n = aulas.length;
  const m = ids.size;
  return { aulas: n, alunos: m, texto: `${n} ${n === 1 ? 'aula' : 'aulas'} · ${m} ${m === 1 ? 'aluno' : 'alunos'}` };
}

/** "A2 - L11" vira "A2 L11": o nome da aula enxuto para o bloco pequeno. */
export const nomeCurtoDaAula = (nome: string) => (nome || '').replace(/\s+[-\u2013\u2014|]\s+/g, ' ').replace(/\s+/g, ' ').trim();

const frase = (t: string) => {
  const x = t.trim();
  if (!x) return '';
  const gritado = x === x.toUpperCase() && x !== x.toLowerCase();
  const y = gritado ? x.toLowerCase() : x;
  return y.charAt(0).toUpperCase() + y.slice(1);
};

/** O motivo curto da faixa do bloqueio: "Reunião", "Não abrir: Pilates". */
export function motivoCurto(b: Pick<Bloqueio, 'tipo' | 'motivo'>): string {
  const partes = (b.motivo || '').split(/\s+[-\u2013\u2014|]\s+|\s*:\s*/).map(frase).filter(Boolean);
  return partes.length ? partes.join(': ') : BLOQUEIOS[b.tipo];
}

/** O motivo inteiro, para o passar o mouse: "Indisponível: Consulta médica". */
export function motivoCompleto(b: Pick<Bloqueio, 'tipo' | 'motivo'>): string {
  const curto = motivoCurto(b);
  const tipo = BLOQUEIOS[b.tipo];
  return normaliza(curto).startsWith(normaliza(tipo)) ? curto : `${tipo}: ${curto}`;
}

/* ================= a cor do professor, suave ================= */

/** O fundo do cartão nos dois temas: o --surface de cada um (globals.css). */
export const SUPERFICIE = { claro: '#FFFFFF', escuro: '#484844' } as const;
/** Quanto da cor do professor entra no fundo: pouco, para cor neon não cansar a vista. */
export const PESO_DA_TINTA = { claro: 0.16, escuro: 0.22 } as const;

const rgb = (cor: string) => {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec((cor || '').trim());
  return m ? [m[1], m[2], m[3]].map((h) => parseInt(h, 16)) : null;
};

/** A cor misturada com o fundo, em sRGB: peso 0 é o fundo, 1 é a cor. */
export function misturaCor(cor: string, fundo: string, peso: number): string {
  const c = rgb(cor) || [142, 142, 136];
  const f = rgb(fundo) || [255, 255, 255];
  return `#${c.map((x, i) => Math.round(x * peso + f[i] * (1 - peso)).toString(16).padStart(2, '0')).join('').toUpperCase()}`;
}

/** As cores do cartão de um professor: a cheia (borda) e o fundo suave de cada tema,
    cada um com o texto que lê melhor em cima dele (textoSobre). */
export function tintaDoProfessor(cor: string) {
  const cheia = rgb(cor) ? cor : '#8E8E88';
  const fundoClaro = misturaCor(cheia, SUPERFICIE.claro, PESO_DA_TINTA.claro);
  const fundoEscuro = misturaCor(cheia, SUPERFICIE.escuro, PESO_DA_TINTA.escuro);
  return {
    cheia, sobreACheia: textoSobre(cheia),
    fundoClaro, textoClaro: textoSobre(fundoClaro),
    fundoEscuro, textoEscuro: textoSobre(fundoEscuro),
  };
}
