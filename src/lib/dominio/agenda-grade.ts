/* A Grade e a Semana da agenda: contas puras, sem banco e sem tela.
   As linhas são as faixas da escola (26/11/2026): de manhã hora cheia (8h às 12h), o
   almoço, e de tarde e de noite hora quebrada (13h30 às 21h30); o sábado é hora cheia.
   Grade (24/11/2026) = um dia por vez, uma coluna por professor. Semana (a visão padrão)
   = os dias abertos lado a lado e as faixas de cima para baixo; cada célula lista TODAS
   as aulas que começam naquela faixa, uma embaixo da outra, sem "+N", e a aula de mais
   de uma hora aparece também na faixa seguinte, como na agenda antiga do ELLO. Mora aqui:
   - as faixas de cada dia e as que se abrem para caber o que cai fora;
   - a ordem das colunas da Grade ("A definir" sempre primeiro, depois quem tem mais aula);
   - o encaixe das aulas na coluna (lado a lado só quando duas se sobrepõem);
   - a altura de cada linha da Grade, que cresce para o cartão mostrar todos os alunos;
   - a volta do pixel para a hora (arrastar e soltar);
   - as células da Semana e onde cada bloqueio aparece nela;
   - o contador, os nomes curtos e a tinta suave da cor do professor.
   As regras da agenda (conflito, recorrência, permissão) continuam em agenda.ts.
   Prova: node --experimental-strip-types testes/agenda-grade.ts */
import { BLOQUEIOS, diaLocal, inicioDoDia, textoSobre, type Agendamento, type Bloqueio, type Professor } from './agenda.ts';

/* ================= a régua do dia: as faixas da escola ================= */

/* Pedido do cliente (26/11/2026): "a partir da tarde, a nossa agenda é com horário
   quebrado, da 1h30 até as 9h30. De manhã é horário cheio, das 8 ao meio-dia. O sábado
   também é horário cheio." Substitui a hora cheia o dia todo de 24/11. */

/** Uma linha da agenda: de ini até fim (sem incluir), em minutos desde a meia-noite. */
export interface Faixa { ini: number; fim: number }

const deHora = (de: number, ate: number): Faixa[] => {
  const l: Faixa[] = [];
  for (let m = de; m < ate; m += 60) l.push({ ini: m, fim: Math.min(m + 60, ate) });
  return l;
};

/** Segunda a sexta: 8h às 12h em hora cheia, o almoço (12h às 13h30) e 13h30 às 21h30
    em hora quebrada. */
export const FAIXAS_DIA_UTIL: Faixa[] = [...deHora(8 * 60, 12 * 60), { ini: 12 * 60, fim: 13 * 60 + 30 }, ...deHora(13 * 60 + 30, 21 * 60 + 30)];
/** Sábado: hora cheia, 8h ao meio-dia; aula depois disso abre as linhas dela, de hora em hora. */
export const FAIXAS_SABADO: Faixa[] = deHora(8 * 60, 12 * 60);

/** O começo e o fim do dia útil (a régua que vale quando não há aula fora dela). */
export const GRADE_INICIO = FAIXAS_DIA_UTIL[0].ini;
export const GRADE_FIM = FAIXAS_DIA_UTIL[FAIXAS_DIA_UTIL.length - 1].fim;

/** As faixas de um dia (o sábado tem as dele). */
export const faixasDoDia = (diaDaSemana: number) => (diaDaSemana === 6 ? FAIXAS_SABADO : FAIXAS_DIA_UTIL);

/** As faixas abertas para caber cada minuto dado: antes do começo, de hora em hora para
    trás; depois do fim, de hora em hora para frente. Nada some da tela. */
export function faixasCom(base: Faixa[], minutos: number[]): Faixa[] {
  const l = [...base];
  const validos = minutos.filter((m) => Number.isFinite(m)).map((m) => Math.min(Math.max(m, 0), 24 * 60));
  if (!validos.length) return l;
  const menor = Math.min(...validos);
  const maior = Math.max(...validos);
  while (menor < l[0].ini && l[0].ini > 0) l.unshift({ ini: Math.max(0, l[0].ini - 60), fim: l[0].ini });
  while (maior > l[l.length - 1].fim && l[l.length - 1].fim < 24 * 60) {
    const f = l[l.length - 1].fim;
    l.push({ ini: f, fim: Math.min(24 * 60, f + 60) });
  }
  return l;
}

/** A faixa em que um minuto cai (antes da primeira, a primeira; depois da última, a última). */
export function faixaDe(faixas: Faixa[], min: number): number {
  if (min < faixas[0].ini) return 0;
  const i = faixas.findIndex((f) => min >= f.ini && min < f.fim);
  return i < 0 ? faixas.length - 1 : i;
}

/** O começo da próxima faixa depois de um minuto (a aula nova do botão: às 14h10, 14h30);
    null quando o dia já acabou. */
export const proximaFaixa = (faixas: Faixa[], min: number) => faixas.find((f) => f.ini > min)?.ini ?? null;

export const hhmm = (min: number) => {
  const m = Math.round(min);
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};

/** Minutos desde a meia-noite de Chapecó daquele dia (passa de 1440 se for no dia seguinte). */
export const minutosNoDia = (iso: string, dia: string) =>
  Math.round((new Date(iso).getTime() - new Date(inicioDoDia(dia)).getTime()) / 60_000);

/** O instante (ISO) de um minuto num dia de Chapecó. */
export const isoNoDia = (dia: string, min: number) => new Date(new Date(inicioDoDia(dia)).getTime() + min * 60_000).toISOString();

/** "08:00", "09:00" ... "13:30", "14:30" ... "20:30": o começo de cada linha. */
export const rotulosDasLinhas = (faixas: Faixa[]) => faixas.map((f) => hhmm(f.ini));

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

/** Os itens de uma coluna no dia: o trecho dentro da régua e a faixa (lado a lado) de
    cada um. Nada some: o que passa da régua aparece cortado na borda. */
export function encaixa(itens: { id: string; inicio: string; fim: string }[], dia: string, faixas: Faixa[]): Encaixe[] {
  const comeco = faixas[0].ini;
  const final = faixas[faixas.length - 1].fim;
  const base = itens.map((x) => {
    const i = minutosNoDia(x.inicio, dia);
    const f = minutosNoDia(x.fim, dia);
    const ini = Math.min(Math.max(i, comeco), final - 30);
    const fim = Math.min(Math.max(f, ini + 30), final);
    return { id: x.id, ini, fim, faixa: 0, faixas: 1, cortadoAntes: i < comeco, cortadoDepois: f > final };
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
  base: number;        // px de cada linha (uma faixa)
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

/** Quanto do trecho [ini, fim) cai em cada faixa (0 a 1 da faixa). */
function cobertura(ini: number, fim: number, faixas: Faixa[]) {
  return faixas.map((f) => Math.max(0, Math.min(fim, f.fim) - Math.max(ini, f.ini)) / (f.fim - f.ini));
}

/**
 * A altura de cada linha (uma faixa). Começa na base e cresce onde um cartão precisa
 * para mostrar todos os alunos. A linha vale para todas as colunas, como numa planilha.
 */
export function alturasDasLinhas(cartoes: { ini: number; fim: number; alunos: number }[], faixas: Faixa[], m: Medidas = MEDIDAS): number[] {
  const h: number[] = Array(faixas.length).fill(m.base);
  const ordem = [...cartoes].sort((a, b) => (a.fim - a.ini) - (b.fim - b.ini));
  for (let volta = 0; volta < 2; volta += 1) {
    for (const c of ordem) {
      const cob = cobertura(c.ini, c.fim, faixas);
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

/** O px de um minuto na grade (dentro da faixa, proporcional). */
export function yDoMinuto(min: number, faixas: Faixa[], alturas: number[], t: number[] = topos(alturas)) {
  const n = faixas.length;
  if (min <= faixas[0].ini) return 0;
  if (min >= faixas[n - 1].fim) return t[n];
  const r = faixaDe(faixas, min);
  const f = faixas[r];
  return t[r] + ((min - f.ini) / (f.fim - f.ini)) * alturas[r];
}

/** O minuto de um px na grade (a volta de yDoMinuto), para soltar a aula arrastada. */
export function minutoDoY(y: number, faixas: Faixa[], alturas: number[], t: number[] = topos(alturas)) {
  const n = faixas.length;
  const yy = Math.min(Math.max(y, 0), t[n]);
  let r = 0;
  while (r < n - 1 && t[r + 1] <= yy) r += 1;
  const f = faixas[r];
  return f.ini + ((yy - t[r]) / alturas[r]) * (f.fim - f.ini);
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

/* ================= a Semana: as faixas, todas as aulas ================= */

export const chaveDaCelula = (dia: string, faixaIni: number) => `${dia}|${faixaIni}`;

/** Uma aula numa célula: onde ela começa, ou a continuação da que começou na faixa de cima. */
export interface NaCelula<T> { a: T; continua: boolean }

export interface Semana<T> {
  faixas: Faixa[];                       // as linhas, de cima para baixo
  celulas: Map<string, NaCelula<T>[]>;   // dia|início da faixa: as aulas, em ordem de horário
  porDia: Map<string, number>;           // quantas aulas em cada dia (cada uma conta uma vez)
  maisCheia: Map<number, number>;        // a célula mais cheia de cada faixa (para a altura)
}

/** As faixas seguintes que uma aula de mais de uma hora também ocupa: as em que ela fica
    pelo menos meia hora (B2 das 18h30 às 20h aparece também na faixa das 19h30). */
export function continuacoes(ini: number, fim: number, faixas: Faixa[]): number[] {
  if (fim - ini <= 60) return [];
  const comeca = faixaDe(faixas, ini);
  const l: number[] = [];
  for (let r = comeca + 1; r < faixas.length; r += 1) {
    const f = faixas[r];
    if (f.ini >= fim) break;
    if (Math.min(fim, f.fim) - Math.max(ini, f.ini) >= 30) l.push(r);
  }
  return l;
}

/**
 * A Semana: cada aula na célula do dia e da faixa em que começa, todas, uma embaixo da
 * outra (as que continuam de cima primeiro; depois por horário e, no mesmo horário, pelo
 * desempate dado, o nome do professor). A aula de mais de uma hora aparece de novo nas
 * faixas seguintes que ocupa, marcada como continuação. As linhas são as do dia útil
 * (o sábado de manhã é igual); aula fora delas abre a linha dela. Nenhuma fica de fora.
 */
export function montaSemana<T extends { id: string; inicio: string; fim: string }>(
  itens: T[], dias: string[], desempate: (a: T, b: T) => number = () => 0,
): Semana<T> {
  const aberto = new Set(dias);
  const doPeriodo = itens.filter((a) => aberto.has(diaLocal(a.inicio)));
  const minutos = doPeriodo.flatMap((a) => {
    const d = diaLocal(a.inicio);
    return [minutosNoDia(a.inicio, d), minutosNoDia(a.fim, d)];
  });
  const faixas = faixasCom(FAIXAS_DIA_UTIL, minutos);
  const celulas = new Map<string, NaCelula<T>[]>();
  const porDia = new Map<string, number>(dias.map((d) => [d, 0]));
  const poe = (k: string, x: NaCelula<T>) => celulas.set(k, [...(celulas.get(k) || []), x]);
  for (const a of doPeriodo) {
    const dia = diaLocal(a.inicio);
    const ini = minutosNoDia(a.inicio, dia);
    const fim = minutosNoDia(a.fim, dia);
    poe(chaveDaCelula(dia, faixas[faixaDe(faixas, ini)].ini), { a, continua: false });
    for (const r of continuacoes(ini, fim, faixas)) poe(chaveDaCelula(dia, faixas[r].ini), { a, continua: true });
    porDia.set(dia, (porDia.get(dia) || 0) + 1);
  }
  const maisCheia = new Map<number, number>();
  for (const [k, l] of celulas) {
    l.sort((x, y) => Number(y.continua) - Number(x.continua)
      || new Date(x.a.inicio).getTime() - new Date(y.a.inicio).getTime() || desempate(x.a, y.a) || x.a.id.localeCompare(y.a.id));
    const f = Number(k.split('|')[1]);
    maisCheia.set(f, Math.max(maisCheia.get(f) || 0, l.length));
  }
  return { faixas, celulas, porDia, maisCheia };
}

export interface BloqueioNaCelula { rotulos: Bloqueio[]; daEscola: Bloqueio[] }

/**
 * Onde cada bloqueio aparece na Semana: o da escola pinta todas as células que cobre,
 * com o nome na primeira; o do professor (quando a pessoa pede para ver) entra como um
 * item pequeno só na primeira célula que cobre, em cada dia.
 */
export function bloqueiosDaSemana(bloqueios: Bloqueio[], dias: string[], faixas: Faixa[]): Map<string, BloqueioNaCelula> {
  const m = new Map<string, BloqueioNaCelula>();
  const pega = (k: string) => { const c = m.get(k) || { rotulos: [], daEscola: [] }; m.set(k, c); return c; };
  for (const b of bloqueios) {
    for (const dia of dias) {
      const ini = Math.max(0, minutosNoDia(b.inicio, dia));
      const fim = Math.min(24 * 60, minutosNoDia(b.fim, dia));
      if (fim <= ini) continue;
      const cobre = faixas.filter((f) => f.ini < fim && f.fim > ini);
      if (!cobre.length) continue;
      pega(chaveDaCelula(dia, cobre[0].ini)).rotulos.push(b);
      if (!b.professorId) for (const f of cobre) pega(chaveDaCelula(dia, f.ini)).daEscola.push(b);
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

/* ================= a cor do professor, cheia ================= */

/* 26/11/2026, pedido do cliente com a foto do ELLO: "quero copiar exatamente as mesmas
   cores". O bloco é pintado com a cor CHEIA do professor, nos dois temas, e o texto sai
   do textoSobre (branco no verde escuro do Natan, preto no verde claro da Bruna).
   Substitui a cor suave no fundo de 24/11. misturaCor segue aqui para quem precisar. */

/** O fundo do cartão nos dois temas: o --surface de cada um (globals.css). */
export const SUPERFICIE = { claro: '#FFFFFF', escuro: '#484844' } as const;

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

/** As cores do cartão de um professor: a cor cheia no fundo, nos dois temas, com o
    texto que lê melhor em cima dela (textoSobre). */
export function tintaDoProfessor(cor: string) {
  const cheia = rgb(cor) ? cor : '#8E8E88';
  const sobre = textoSobre(cheia);
  return {
    cheia, sobreACheia: sobre,
    fundoClaro: cheia, textoClaro: sobre,
    fundoEscuro: cheia, textoEscuro: sobre,
  };
}

/* ================= a Semana do jeito do ELLO ================= */

/* 26/11/2026, pedido do cliente com a foto do ELLO: "quero a agenda nesse mesmo formato,
   porque eu preciso saber quando preenche 2 horários". Cada dia é uma coluna com a régua
   das faixas; cada aula é um bloco na altura do horário dela, que desce até onde ela
   acaba (o B2 das 18h30 às 20h ocupa a faixa das 18h30 e metade da das 19h30), e as que
   se sobrepõem ficam lado a lado, cada uma com a cor cheia do professor. Substitui as
   células com lista e a continuação tracejada (que seguem só no celular). */

export const SEMANA_ELLO = {
  alturaDaFaixa: 92,    // px de cada faixa (a do almoço também)
  larguraPorBloco: 62,  // px de cada bloco lado a lado, para o nome caber em duas ou três linhas
  larguraMinima: 180,   // px de um dia com pouca coisa
} as const;

/** O encaixe das aulas (e dos bloqueios de professor, quando pedidos) de cada dia na
    régua da Semana: todos os professores na mesma coluna, lado a lado quando se
    sobrepõem. */
export function encaixaSemana(itens: { id: string; inicio: string; fim: string }[], dias: string[], faixas: Faixa[]): Map<string, Encaixe[]> {
  const porDia = new Map<string, { id: string; inicio: string; fim: string }[]>(dias.map((d) => [d, []]));
  for (const x of itens) porDia.get(diaLocal(x.inicio))?.push(x);
  return new Map(dias.map((d) => [d, encaixa(porDia.get(d) || [], d, faixas)]));
}

/** A largura de um dia: cabe o grupo com mais blocos lado a lado, e nunca menos que o mínimo. */
export const larguraDoDia = (encaixes: Encaixe[], m: { larguraPorBloco: number; larguraMinima: number } = SEMANA_ELLO) =>
  Math.max(m.larguraMinima, Math.max(1, ...encaixes.map((e) => e.faixas)) * m.larguraPorBloco);
