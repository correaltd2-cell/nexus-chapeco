/* Regras de leitura das conversas que valem na tela e no servidor. */
import type { Conversa, Mensagem, Setor } from './tipos';
import { NOME_SETOR } from './acessos';

/** A frase que descreve o estado da conversa, sempre igual em toda tela. */
export function situacao(c: Conversa): string {
  if (c.estado === 'encerrada') return `${NOME_SETOR[c.setor]}, encerrada`;
  if (c.setor === 'financeiro' && c.estado === 'ia') return 'Financeiro, com a IA';
  if (c.estado === 'aguardando') return `${NOME_SETOR[c.setor]}, esperando o time`;
  return NOME_SETOR[c.setor];
}

/** A última fala de gente ou do contato, que vira a prévia na lista. */
export const ultimaFala = (ms: Mensagem[]) =>
  [...ms].reverse().find((m) => m.autor !== 'sistema');

export const previaDe = (m?: Mensagem) => {
  if (!m) return '';
  if (m.texto) return m.texto;
  if (!m.midiaMime) return 'Mensagem';
  if (m.midiaMime.startsWith('image/')) return 'Foto';
  if (m.midiaMime.startsWith('audio/')) return 'Áudio';
  if (m.midiaMime.startsWith('video/')) return 'Vídeo';
  return m.midiaNome || 'Documento';
};

/** Conversa esperando a gente: o contato falou por último e ninguém respondeu. */
export function esperandoResposta(c: Conversa, ultima?: Mensagem) {
  if (c.estado === 'encerrada') return false;
  if (c.estado === 'aguardando') return true;
  return Boolean(ultima && ultima.direcao === 'entrada');
}

export type Filtro = 'todas' | 'nao_lidas' | Setor | 'retornos' | 'encerradas';

export function passaNoFiltro(c: Conversa, f: Filtro) {
  if (f === 'encerradas') return c.estado === 'encerrada';
  if (c.estado === 'encerrada') return false;
  if (f === 'todas') return true;
  if (f === 'nao_lidas') return c.naoLidas > 0;
  if (f === 'retornos') return Boolean(c.retorno);
  return c.setor === f;
}

export function buscaCasou(c: Conversa, busca: string) {
  const q = busca.trim().toLowerCase();
  if (!q) return true;
  const digitos = q.replace(/\D/g, '');
  if (c.nome.toLowerCase().includes(q)) return true;
  return Boolean(digitos && c.waId.replace(/\D/g, '').includes(digitos));
}
