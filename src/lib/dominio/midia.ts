/* Foto, áudio, vídeo e documento na conversa, nos dois sentidos.
   O que chega o servidor baixa da Meta e guarda no Storage; o que sai a equipe sobe no
   Storage e o servidor manda para a Meta. Aqui moram as regras: que tipo de arquivo o
   WhatsApp aceita e com que tamanho, onde guardar, e como chamar na tela.
   Prova: node --experimental-strip-types testes/midia.ts */

export type TipoDeMidia = 'image' | 'video' | 'audio' | 'document';

const MB = 1024 * 1024;
/** O Storage da escola aceita até 20 MB por arquivo (storage.rules). */
export const LIMITE_DO_STORAGE = 20 * MB;

/* o que a Cloud API aceita, por tipo; o resto vai como documento ou é recusado */
const IMAGEM = ['image/jpeg', 'image/png'];
const VIDEO = ['video/mp4', 'video/3gpp'];
/* audio/webm não é aceito pela Meta: o servidor converte para ogg antes (dominio/ogg.ts) */
const AUDIO = ['audio/aac', 'audio/amr', 'audio/mpeg', 'audio/mp4', 'audio/ogg', 'audio/webm'];
const DOCUMENTO = [
  'application/pdf', 'text/plain', 'application/msword', 'application/vnd.ms-excel', 'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
];
const LIMITE: Record<TipoDeMidia, number> = { image: 5 * MB, video: 16 * MB, audio: 16 * MB, document: LIMITE_DO_STORAGE };

/** "audio/webm;codecs=opus" vira "audio/webm"; os apelidos viram o nome que a Meta conhece. */
export function mimeLimpo(mime: string) {
  const base = (mime || '').split(';')[0].trim().toLowerCase();
  const apelidos: Record<string, string> = {
    'audio/x-m4a': 'audio/mp4', 'audio/m4a': 'audio/mp4', 'audio/mp3': 'audio/mpeg', 'audio/x-aac': 'audio/aac',
    'image/jpg': 'image/jpeg', 'audio/opus': 'audio/ogg',
  };
  return apelidos[base] || base;
}

const ROTULO: Record<TipoDeMidia, string> = { image: 'Foto', video: 'Vídeo', audio: 'Áudio', document: 'Documento' };
const EMOJI: Record<TipoDeMidia, string> = { image: '📷', video: '🎥', audio: '🎤', document: '📄' };

const tamanhoLegivel = (bytes: number) =>
  bytes >= MB ? `${(bytes / MB).toFixed(bytes >= 10 * MB ? 0 : 1).replace('.', ',')} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

/** Como o arquivo sai pelo WhatsApp, ou por que não sai. */
export function comoEnviar(mime: string, tamanho: number): { tipo: TipoDeMidia; mime: string } | { erro: string } {
  const m = mimeLimpo(mime);
  let tipo: TipoDeMidia | null = null;
  if (IMAGEM.includes(m)) tipo = 'image';
  else if (VIDEO.includes(m)) tipo = 'video';
  else if (AUDIO.includes(m)) tipo = 'audio';
  else if (DOCUMENTO.includes(m)) tipo = 'document';
  else if (m.startsWith('image/')) return { erro: 'O WhatsApp só aceita foto em JPG ou PNG. Tire um print ou salve a imagem como JPG.' };
  else if (m.startsWith('video/')) return { erro: 'O WhatsApp só aceita vídeo em MP4.' };
  else return { erro: 'O WhatsApp não aceita esse tipo de arquivo. Mande em PDF, Word, Excel, foto JPG ou PNG.' };

  if (!tamanho) return { erro: 'O arquivo está vazio.' };
  if (tamanho > LIMITE[tipo]) {
    /* foto grande ainda pode ir como documento, sem perder qualidade */
    if (tipo === 'image' && tamanho <= LIMITE.document) return { tipo: 'document', mime: m };
    return { erro: `O arquivo tem ${tamanhoLegivel(tamanho)} e o limite para ${ROTULO[tipo].toLowerCase()} é ${tamanhoLegivel(LIMITE[tipo])}.` };
  }
  return { tipo, mime: m };
}


/** O tipo pela cara do mime, para mostrar (o que chegou já veio decidido pela Meta). */
export function tipoPeloMime(mime?: string): TipoDeMidia {
  const m = mimeLimpo(mime || '');
  if (m.startsWith('image/')) return 'image';
  if (m.startsWith('video/')) return 'video';
  if (m.startsWith('audio/')) return 'audio';
  return 'document';
}

/** "Foto", "Áudio", "Vídeo", ou o nome do documento. */
export function rotuloDaMidia(mime?: string, nome?: string) {
  const t = tipoPeloMime(mime);
  return t === 'document' ? nome || 'Documento' : ROTULO[t];
}

/** A prévia na lista de conversas, como no WhatsApp: "📷 Foto", "🎤 Áudio". */
export function previaDaMidia(mime?: string, nome?: string, legenda?: string) {
  const t = tipoPeloMime(mime);
  return `${EMOJI[t]} ${legenda?.trim() || rotuloDaMidia(mime, nome)}`;
}

const EXTENSAO: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'video/mp4': 'mp4', 'video/3gpp': '3gp',
  'audio/ogg': 'ogg', 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/aac': 'aac', 'audio/amr': 'amr',
  'audio/webm': 'webm', 'application/pdf': 'pdf', 'text/plain': 'txt',
};

/** O nome do arquivo sem nada que quebre caminho: acento sai, espaço vira -. */
export function nomeSeguro(nome: string) {
  const limpo = (nome || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^\w.-]+/g, '-').replace(/-+/g, '-').replace(/-+\./g, '.').replace(/^[-.]+|[-.]+$/g, '').slice(-80);
  return limpo || 'arquivo';
}

/** Onde a mídia mora no Storage: dentro da pasta da conversa, sempre. */
export function caminhoDaMidia(conversaId: string, id: string, mime: string, nome?: string) {
  const ext = (nome && /\.\w{1,5}$/.test(nome) ? nome.split('.').pop()?.toLowerCase() : EXTENSAO[mimeLimpo(mime)]) || 'bin';
  const base = nome ? nomeSeguro(nome.replace(/\.\w{1,5}$/, '')) : 'midia';
  return `conversas/${conversaId}/${id}-${base}.${ext}`;
}

/** O servidor só manda o que está na pasta desta conversa. */
export const caminhoEhDaConversa = (caminho: string, conversaId: string) =>
  Boolean(conversaId) && caminho.startsWith(`conversas/${conversaId}/`) && !caminho.includes('..')
  && /^[\w./-]+$/.test(caminho);

/** 0:07, 1:32: a duração do áudio gravado. */
export function duracao(segundos: number) {
  const s = Math.max(0, Math.floor(segundos));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** O que gravar o navegador: ogg (Firefox) e mp4 (Safari) a Meta aceita direto; webm o servidor converte. */
export function formatoDeGravacao(suporta: (mime: string) => boolean) {
  return ['audio/ogg;codecs=opus', 'audio/webm;codecs=opus', 'audio/mp4', 'audio/webm'].find(suporta) || '';
}
