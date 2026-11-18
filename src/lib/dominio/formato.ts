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

export function hora(iso: string) {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function dataBR(iso: string) {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Hora quando é hoje, "ontem", dia da semana na mesma semana, data depois disso. */
export function quando(iso: string, agora = new Date()) {
  const d = new Date(iso);
  const dias = Math.round((dia0(agora).getTime() - dia0(d).getTime()) / 864e5);
  if (dias <= 0) return hora(iso);
  if (dias === 1) return 'ontem';
  if (dias < 7) return SEMANA[d.getDay()].slice(0, 3);
  return dataBR(iso);
}

/** Separador de dia dentro da conversa. */
export function diaPorExtenso(iso: string, agora = new Date()) {
  const d = new Date(iso);
  const dias = Math.round((dia0(agora).getTime() - dia0(d).getTime()) / 864e5);
  if (dias <= 0) return 'Hoje';
  if (dias === 1) return 'Ontem';
  const mes = d.toLocaleDateString('pt-BR', { month: 'long' });
  return `${SEMANA[d.getDay()]}, ${d.getDate()} de ${mes}`;
}

export const mesmoDia = (a: string, b: string) =>
  dia0(new Date(a)).getTime() === dia0(new Date(b)).getTime();

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
