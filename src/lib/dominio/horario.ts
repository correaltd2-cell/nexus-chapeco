/* O horário de atendimento da escola: quando a equipe está, quando volta e quanto tempo
   de atendimento passou entre duas horas. Puro, no fuso de Chapecó (o servidor roda em
   UTC), provado em testes/horario.ts.
   Pedido do cliente (21/11/2026): segunda a sexta, das 8h ao meio-dia e das 13h30 às
   21h30; sábado, das 9h ao meio-dia. Fora disso, o atendimento automático avisa que a
   equipe está fora e quando volta.
   O Brasil não tem horário de verão desde 2019: a conta de "quando volta" anda em
   minutos a partir de agora, sem procurar mudança de fuso no meio. */

/** Uma faixa de atendimento num dia da semana (0 é domingo). */
export interface Faixa { dia: number; abre: string; fecha: string }

export const FUSO = 'America/Sao_Paulo';
export const DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

export const HORARIO_PADRAO: Faixa[] = [
  ...[1, 2, 3, 4, 5].flatMap((dia) => [{ dia, abre: '08:00', fecha: '12:00' }, { dia, abre: '13:30', fecha: '21:30' }]),
  { dia: 6, abre: '09:00', fecha: '12:00' },
];

const DIA = 1440;

/** "8:00", "08h", "8h30", "13" → minutos do dia; o que não for hora, null. */
export function minutosDa(hora: string): number | null {
  const m = /^\s*(\d{1,2})\s*(?:[:h]\s*(\d{2})?)?\s*$/i.exec(hora || '');
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2] || 0);
  if (h > 24 || min > 59 || (h === 24 && min > 0)) return null;
  return h * 60 + min;
}

const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

/** Como se fala a hora: 8h, 13h30, meio-dia fica 12h. */
export const horaFalada = (min: number) => `${Math.floor(min / 60)}h${min % 60 ? String(min % 60).padStart(2, '0') : ''}`;

/** Lê as faixas guardadas sem quebrar: descarta o que veio torto e põe em ordem. */
export function leFaixas(bruto: unknown): Faixa[] {
  if (!Array.isArray(bruto)) return HORARIO_PADRAO.map((f) => ({ ...f }));
  return bruto
    .map((f) => {
      const x = f as Partial<Faixa>;
      const dia = Number(x?.dia);
      const a = minutosDa(String(x?.abre ?? ''));
      const z = minutosDa(String(x?.fecha ?? ''));
      if (!Number.isInteger(dia) || dia < 0 || dia > 6 || a === null || z === null || z <= a) return null;
      return { dia, abre: hhmm(a), fecha: hhmm(z) };
    })
    .filter((f): f is Faixa => Boolean(f))
    .sort((x, y) => x.dia - y.dia || x.abre.localeCompare(y.abre));
}

/** As faixas de um dia escritas como a pessoa digita: "08:00-12:00, 13:30-21:30". */
export const textoDoDia = (faixas: Faixa[], dia: number) =>
  faixas.filter((f) => f.dia === dia).map((f) => `${f.abre}-${f.fecha}`).join(', ');

/** O que a pessoa digitou para um dia, virado faixas. Vazio é fechado. */
export function faixasDoTexto(dia: number, texto: string): { faixas: Faixa[] } | { erro: string } {
  const partes = (texto || '').split(/[,;]|\be\b/).map((p) => p.trim()).filter(Boolean);
  const faixas: Faixa[] = [];
  for (const p of partes) {
    const [ab, fe] = p.split(/\s*(?:-|–|até|às|as|a)\s*/i).filter(Boolean);
    const a = minutosDa(ab || '');
    const z = minutosDa(fe || '');
    if (a === null || z === null) return { erro: `Não entendi "${p}". Escreva como 08:00-12:00.` };
    if (z <= a) return { erro: `Em "${p}" o fim vem antes do começo.` };
    faixas.push({ dia, abre: hhmm(a), fecha: hhmm(z) });
  }
  faixas.sort((x, y) => x.abre.localeCompare(y.abre));
  for (let i = 1; i < faixas.length; i += 1) {
    if (faixas[i].abre < faixas[i - 1].fecha) return { erro: 'Duas faixas do mesmo dia se cruzam.' };
  }
  return { faixas };
}

/* ---------------- o relógio de Chapecó ---------------- */

const SEMANA: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
let formatador: Intl.DateTimeFormat | null = null;

/** Que dia da semana e que hora é agora em Chapecó. */
export function relogioLocal(agora: Date): { dia: number; minutos: number } {
  formatador ??= new Intl.DateTimeFormat('en-US', { timeZone: FUSO, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const p = Object.fromEntries(formatador.formatToParts(agora).map((x) => [x.type, x.value]));
  return { dia: SEMANA[p.weekday] ?? 0, minutos: (Number(p.hour) % 24) * 60 + Number(p.minute) };
}

/* as faixas da semana em minutos, a partir do domingo 0h */
const naSemana = (faixas: Faixa[]) => faixas
  .map((f) => ({ ini: f.dia * DIA + (minutosDa(f.abre) ?? 0), fim: f.dia * DIA + (minutosDa(f.fecha) ?? 0) }))
  .sort((x, y) => x.ini - y.ini);

export function estaAberto(faixas: Faixa[], agora: Date): boolean {
  const { dia, minutos } = relogioLocal(agora);
  const t = dia * DIA + minutos;
  return naSemana(faixas).some((f) => t >= f.ini && t < f.fim);
}

/** Quando a equipe volta: a próxima faixa que começa depois de agora, e como dizer isso
    ("hoje às 13h30", "amanhã às 8h", "segunda às 8h"). Sem faixa nenhuma, null. */
export function proximaAbertura(faixas: Faixa[], agora: Date): { em: Date; texto: string } | null {
  const semana = naSemana(faixas);
  if (!semana.length) return null;
  const { dia, minutos } = relogioLocal(agora);
  const t = dia * DIA + minutos;
  for (let volta = 0; volta <= 1; volta += 1) {
    for (const f of semana) {
      const ini = f.ini + volta * 7 * DIA;
      if (ini <= t) continue;
      const faltam = ini - t;
      const dias = Math.floor(ini / DIA) - Math.floor(t / DIA);
      const hora = horaFalada(ini % DIA);
      const nome = DIAS[Math.floor(ini / DIA) % 7];
      const texto = dias === 0 ? `hoje às ${hora}` : dias === 1 ? `amanhã às ${hora}` : `${dias >= 7 ? 'na próxima ' : ''}${nome} às ${hora}`;
      const em = new Date(agora.getTime() + faltam * 60_000);
      em.setSeconds(0, 0);
      return { em, texto };
    }
  }
  return null;
}

/** A última vez que a equipe fechou (o fim da faixa mais recente que já acabou). */
export function ultimoFechamento(faixas: Faixa[], agora: Date): Date | null {
  const semana = naSemana(faixas);
  if (!semana.length) return null;
  const { dia, minutos } = relogioLocal(agora);
  const t = dia * DIA + minutos;
  let melhor: number | null = null;
  for (const f of semana) {
    for (const volta of [0, -1]) {
      const fim = f.fim + volta * 7 * DIA;
      if (fim <= t && (melhor === null || fim > melhor)) melhor = fim;
    }
  }
  if (melhor === null) return null;
  const em = new Date(agora.getTime() - (t - melhor) * 60_000);
  em.setSeconds(0, 0);
  return em;
}

/** Quantos minutos de atendimento passaram entre duas horas (fora do horário não conta). */
export function minutosUteis(faixas: Faixa[], desde: Date, ate: Date): number {
  const total = (ate.getTime() - desde.getTime()) / 60_000;
  if (!(total > 0)) return 0;
  const semana = naSemana(faixas);
  if (!semana.length) return total;
  const { dia, minutos } = relogioLocal(desde);
  const ini = dia * DIA + minutos;
  const fim = ini + Math.min(total, 60 * DIA);
  let soma = 0;
  for (let volta = 0; volta * 7 * DIA <= fim; volta += 1) {
    for (const f of semana) {
      const a = Math.max(ini, f.ini + volta * 7 * DIA);
      const z = Math.min(fim, f.fim + volta * 7 * DIA);
      if (z > a) soma += z - a;
    }
  }
  return soma;
}

/** O horário escrito para gente ler (e para a IA): "segunda a sexta, das 8h às 12h e
    das 13h30 às 21h30; sábado, das 9h às 12h". */
export function horarioEmTexto(faixas: Faixa[]): string {
  const doDia = (d: number) => faixas.filter((f) => f.dia === d)
    .map((f) => `das ${horaFalada(minutosDa(f.abre) ?? 0)} às ${horaFalada(minutosDa(f.fecha) ?? 0)}`).join(' e ');
  const grupos: { de: number; ate: number; texto: string }[] = [];
  for (const d of [1, 2, 3, 4, 5, 6, 0]) {
    const t = doDia(d);
    if (!t) continue;
    const ultimo = grupos[grupos.length - 1];
    const seguido = ultimo && ultimo.texto === t && (ultimo.ate + 1) % 7 === d && d !== 0;
    if (seguido) ultimo.ate = d; else grupos.push({ de: d, ate: d, texto: t });
  }
  if (!grupos.length) return 'sem horário de atendimento cadastrado';
  return grupos.map((g) => {
    const dias = g.de === g.ate ? DIAS[g.de] : g.ate === g.de + 1 ? `${DIAS[g.de]} e ${DIAS[g.ate]}` : `${DIAS[g.de]} a ${DIAS[g.ate]}`;
    return `${dias}, ${g.texto}`;
  }).join('; ');
}
