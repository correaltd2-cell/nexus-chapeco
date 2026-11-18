/* Como o sistema escreve numero, data e hora na tela. Um lugar so, para a mesma
   conversa nao aparecer com duas caras em telas diferentes. */

export const iniciais = (nome: string) =>
  nome.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase() || '?';

export const primeiroNome = (nome: string) => nome.split(' ')[0] || nome;

export const corta = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

export const brl = (cents: number) =>
  (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const SEMANA = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

export const dia0 = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/** Le uma data.
   "2026-11-17" sozinho tem que valer como o dia 17 AQUI, nao meia-noite em Londres:
   `new Date("2026-11-17")` vira 16/11 as 21h no horario de Chapeco, e o prazo aparece
   um dia antes e vencido sem estar. Com hora junto, o texto ja diz o fuso. */
export function paraData(iso: string): Date {
  const so = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (so) return new Date(Number(so[1]), Number(so[2]) - 1, Number(so[3]));
  return new Date(iso);
}

/** O ultimo instante do dia de uma data. É com ele que se compara prazo. */
export function fimDoDia(iso: string): Date {
  const d = paraData(iso);
  d.setHours(23, 59, 59, 999);
  return d;
}

export function hora(iso: string) {
  const d = paraData(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function dataBR(iso: string) {
  const d = paraData(iso);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Hora quando é hoje, "ontem", dia da semana na mesma semana, data depois disso. */
export function quando(iso: string, agora = new Date()) {
  const d = paraData(iso);
  const dias = Math.round((dia0(agora).getTime() - dia0(d).getTime()) / 864e5);
  if (dias <= 0) return hora(iso);
  if (dias === 1) return 'ontem';
  if (dias < 7) return SEMANA[d.getDay()].slice(0, 3);
  return dataBR(iso);
}

/** Separador de dia dentro da conversa. */
export function diaPorExtenso(iso: string, agora = new Date()) {
  const d = paraData(iso);
  const dias = Math.round((dia0(agora).getTime() - dia0(d).getTime()) / 864e5);
  if (dias <= 0) return 'Hoje';
  if (dias === 1) return 'Ontem';
  const mes = d.toLocaleDateString('pt-BR', { month: 'long' });
  return `${SEMANA[d.getDay()]}, ${d.getDate()} de ${mes}`;
}

export const mesmoDia = (a: string, b: string) =>
  dia0(paraData(a)).getTime() === dia0(paraData(b)).getTime();

/** Telefone do jeito que gente lê: +55 49 99123-4567 */
export function telefoneLegivel(bruto: string) {
  const d = bruto.replace(/\D/g, '');
  if (d.length < 12) return bruto;
  const pais = d.slice(0, d.length - 11) || '55';
  const ddd = d.slice(-11, -9);
  const corpo = d.slice(-9);
  return `+${pais} ${ddd} ${corpo.slice(0, 5)}-${corpo.slice(5)}`;
}

/** A segunda-feira da semana de uma data, no formato 2026-11-16. */
export function semanaDe(d = new Date()) {
  const x = dia0(d);
  const dow = x.getDay();
  x.setDate(x.getDate() - (dow === 0 ? 6 : dow - 1));
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
}

/** A janela de 24 horas da Meta: depois dela, so template aprovado. */
export function janelaAberta(conversa: { janelaAte?: string }, agora = new Date()) {
  return Boolean(conversa.janelaAte && new Date(conversa.janelaAte).getTime() > agora.getTime());
}

/** Quanto tempo passou, do jeito que gente fala: "12 min", "2 h 14 min", "3 dias". */
export function duracao(desde: string, agora = new Date()) {
  const ms = agora.getTime() - paraData(desde).getTime();
  if (ms < 60_000) return 'agora';
  const min = Math.floor(ms / 60_000);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return min % 60 ? `${h} h ${min % 60} min` : `${h} h`;
  const d = Math.floor(h / 24);
  return d === 1 ? '1 dia' : `${d} dias`;
}

/** Dia e hora por extenso curto: "18/11 às 14:30". */
export const dataHoraBR = (iso: string) => `${dataBR(iso)} às ${hora(iso)}`;

/** O valor que o campo datetime-local entende, no fuso de quem está na tela. */
export function paraCampoDeHora(d: Date) {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Só a data, no formato do campo de prazo: 2026-11-18. */
export function paraCampoDeData(d: Date) {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
