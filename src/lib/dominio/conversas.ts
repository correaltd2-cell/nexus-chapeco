/* Regras de leitura das conversas que valem na tela e no servidor. */
import type { Conversa, Mensagem, Setor } from './tipos';
import { NOME_SETOR } from './acessos';
import { previaDaMidia } from './midia';

/** A frase que descreve o estado da conversa, sempre igual em toda tela. */
export function situacao(c: Conversa): string {
  if (c.estado === 'encerrada') return `${NOME_SETOR[c.setor]}, encerrada`;
  if (c.setor === 'financeiro' && c.estado === 'ia') return 'Financeiro, com a IA';
  if (c.estado === 'aguardando') return `${NOME_SETOR[c.setor]}, esperando o time`;
  return NOME_SETOR[c.setor];
}

/** A situação sem o nome do setor, para ir ao lado da etiqueta colorida do setor. */
export function detalheDaSituacao(c: Conversa): string {
  if (c.estado === 'encerrada') return 'encerrada';
  if (c.setor === 'financeiro' && c.estado === 'ia') return 'com a IA';
  if (c.estado === 'aguardando') return 'esperando o time';
  if (c.etapa === 'menu') return 'escolhendo o assunto';
  if (c.etapa === 'aulas') return 'vendo as aulas';
  return '';
}

/** A última fala de gente ou do contato, que vira a prévia na lista. */
export const ultimaFala = (ms: Mensagem[]) =>
  [...ms].reverse().find((m) => m.autor !== 'sistema');

export const previaDe = (m?: Mensagem) => {
  if (!m) return '';
  if (m.midiaMime) return previaDaMidia(m.midiaMime, m.midiaNome, m.texto);
  return m.texto || 'Mensagem';
};

/** Conversa esperando a gente: o contato falou por último e ninguém respondeu. */
export function esperandoResposta(c: Conversa, ultima?: Mensagem) {
  if (c.estado === 'encerrada') return false;
  if (c.estado === 'aguardando') return true;
  return Boolean(ultima && ultima.direcao === 'entrada');
}

/* Situação e refinamento sao coisas diferentes: a situação é o que o time alterna
   o dia inteiro e fica à vista; setor e assunto refinam e moram no funil, para
   poderem ser combinados com qualquer situação. */
export type Filtro = 'todas' | 'nao_lidas' | 'retornos' | 'encerradas';

export function passaNoFiltro(c: Conversa, f: Filtro) {
  if (f === 'encerradas') return c.estado === 'encerrada';
  if (c.estado === 'encerrada') return false;
  if (f === 'nao_lidas') return c.naoLidas > 0;
  if (f === 'retornos') return Boolean(c.retorno);
  return true;
}

export const passaNoSetor = (c: Conversa, setor: Setor | null) => !setor || c.setor === setor;

export function buscaCasou(c: Conversa, busca: string) {
  const q = busca.trim().toLowerCase();
  if (!q) return true;
  const digitos = q.replace(/\D/g, '');
  if (c.nome.toLowerCase().includes(q)) return true;
  return Boolean(digitos && c.waId.replace(/\D/g, '').includes(digitos));
}

/** Desde quando o contato espera resposta: a fala dele que ninguém respondeu.
    Devolve nada quando a bola não está com a gente. */
export function esperandoDesde(c: Conversa, ms: Mensagem[]): string | undefined {
  if (c.estado === 'encerrada') return undefined;
  const falas = ms.filter((m) => m.autor !== 'sistema')
    .sort((a, b) => a.criadaEm.localeCompare(b.criadaEm));
  const ultima = falas[falas.length - 1];
  if (!ultima || ultima.direcao !== 'entrada') {
    return c.estado === 'aguardando' ? c.aguardandoDesde : undefined;
  }
  /* a primeira mensagem da rajada: é desde ela que a pessoa está esperando */
  let desde = ultima;
  for (let i = falas.length - 2; i >= 0; i -= 1) {
    if (falas[i].direcao !== 'entrada') break;
    desde = falas[i];
  }
  return desde.criadaEm;
}

/** As etiquetas que existem de verdade nas conversas, para o filtro se montar
    sozinho em vez de listar assunto que ninguém usa. */
export const etiquetasEmUso = (cs: Conversa[]) =>
  [...new Set(cs.filter((c) => c.estado !== 'encerrada').flatMap((c) => c.etiquetas))].sort();

export const passaNaEtiqueta = (c: Conversa, etiqueta: string | null) =>
  !etiqueta || c.etiquetas.includes(etiqueta);

