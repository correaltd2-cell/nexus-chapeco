/* Prova da mídia na conversa: o que o WhatsApp aceita, onde guarda, como chama, e a
   conversão do áudio do Chrome (WebM) para o que a Meta aceita (OGG).
   A amostra é uma gravação de 1 segundo feita pelo MediaRecorder do Chromium.
   Rodar:  node --experimental-strip-types testes/midia.ts  */
import { readFileSync } from 'node:fs';
import {
  caminhoDaMidia, caminhoEhDaConversa, comoEnviar, duracao, formatoDeGravacao, mimeLimpo, nomeSeguro,
  previaDaMidia, rotuloDaMidia,
} from '../src/lib/dominio/midia.ts';
import { amostrasDoPacote, crcOgg, webmParaOgg } from '../src/lib/dominio/ogg.ts';

let falhas = 0;
function igual<T>(nome: string, veio: T, esperado: T) {
  if (JSON.stringify(veio) !== JSON.stringify(esperado)) {
    falhas += 1;
    console.log(`  x ${nome}\n    esperado ${JSON.stringify(esperado)}, veio ${JSON.stringify(veio)}`);
  }
}
const MB = 1024 * 1024;

/* ---- o que sai e como ---- */
igual('foto jpg', comoEnviar('image/jpeg', 2 * MB), { tipo: 'image', mime: 'image/jpeg' });
igual('foto grande vai como documento', comoEnviar('image/png', 8 * MB), { tipo: 'document', mime: 'image/png' });
igual('pdf', comoEnviar('application/pdf', 3 * MB), { tipo: 'document', mime: 'application/pdf' });
igual('áudio do Chrome', comoEnviar('audio/webm;codecs=opus', 40_000), { tipo: 'audio', mime: 'audio/webm' });
igual('áudio do iPhone', comoEnviar('audio/x-m4a', 40_000), { tipo: 'audio', mime: 'audio/mp4' });
igual('vídeo mp4', comoEnviar('video/mp4', 10 * MB), { tipo: 'video', mime: 'video/mp4' });
igual('vídeo grande demais', comoEnviar('video/mp4', 18 * MB), { erro: 'O arquivo tem 18 MB e o limite para vídeo é 16 MB.' });
igual('webp não é foto para o WhatsApp', 'erro' in comoEnviar('image/webp', 1000), true);
igual('zip não sai', 'erro' in comoEnviar('application/zip', 1000), true);
igual('vazio não sai', comoEnviar('application/pdf', 0), { erro: 'O arquivo está vazio.' });
igual('documento acima do Storage', 'erro' in comoEnviar('application/pdf', 25 * MB), true);
igual('mime com codecs', mimeLimpo('Audio/Ogg; codecs=opus'), 'audio/ogg');

/* ---- nomes e caminhos ---- */
igual('nome sem acento nem espaço', nomeSeguro('Comprovante de matrícula (1).pdf'), 'Comprovante-de-matricula-1.pdf');
igual('caminho de documento', caminhoDaMidia('c1', 'm9', 'application/pdf', 'Boleto Nov.pdf'), 'conversas/c1/m9-Boleto-Nov.pdf');
igual('caminho de áudio sem nome', caminhoDaMidia('c1', 'm9', 'audio/ogg'), 'conversas/c1/m9-midia.ogg');
igual('caminho da própria conversa', caminhoEhDaConversa('conversas/c1/saida/1-a.pdf', 'c1'), true);
igual('caminho de outra conversa', caminhoEhDaConversa('conversas/c2/a.pdf', 'c1'), false);
igual('caminho que sobe pasta', caminhoEhDaConversa('conversas/c1/../c2/a.pdf', 'c1'), false);
igual('conversa vazia não vale', caminhoEhDaConversa('conversas//a.pdf', ''), false);

/* ---- na tela ---- */
igual('rótulo de foto', rotuloDaMidia('image/jpeg'), 'Foto');
igual('rótulo de documento é o nome', rotuloDaMidia('application/pdf', 'boleto.pdf'), 'boleto.pdf');
igual('prévia de áudio', previaDaMidia('audio/ogg'), '🎤 Áudio');
igual('prévia de foto com legenda', previaDaMidia('image/jpeg', '', 'meu comprovante'), '📷 meu comprovante');
igual('duração', [duracao(7), duracao(92), duracao(-1)], ['0:07', '1:32', '0:00']);
igual('Chrome grava webm', formatoDeGravacao((m) => m.startsWith('audio/webm')), 'audio/webm;codecs=opus');
igual('Firefox grava ogg', formatoDeGravacao((m) => m.startsWith('audio/ogg') || m.startsWith('audio/webm')), 'audio/ogg;codecs=opus');
igual('Safari grava mp4', formatoDeGravacao((m) => m === 'audio/mp4'), 'audio/mp4');
igual('sem gravador', formatoDeGravacao(() => false), '');

/* ---- quanto som tem cada pacote ---- */
igual('CELT 20 ms', amostrasDoPacote(Uint8Array.of(0xf8)), 960);
igual('SILK 60 ms', amostrasDoPacote(Uint8Array.of(0x18)), 2880);
igual('dois quadros de 20 ms', amostrasDoPacote(Uint8Array.of(0xf9)), 1920);
igual('código 3 com 3 quadros', amostrasDoPacote(Uint8Array.of(0xfb, 0x03)), 2880);

/* ---- WebM do Chrome para OGG ---- */
const webm = new Uint8Array(readFileSync(new URL('./amostras/gravacao-chrome.webm', import.meta.url)));
const ogg = webmParaOgg(webm);
igual('converteu', Boolean(ogg), true);
if (ogg) {
  const paginas: { tipo: number; granulo: number; crcOk: boolean; inicio: string }[] = [];
  let p = 0;
  while (p < ogg.length) {
    const v = new DataView(ogg.buffer, ogg.byteOffset + p);
    const nSeg = ogg[p + 26];
    const corpo = ogg.subarray(p + 27, p + 27 + nSeg).reduce((n, x) => n + x, 0);
    const tamanho = 27 + nSeg + corpo;
    const copia = ogg.slice(p, p + tamanho);
    copia.fill(0, 22, 26);
    paginas.push({
      tipo: ogg[p + 5],
      granulo: v.getUint32(6, true),
      crcOk: crcOgg(copia) === v.getUint32(22, true),
      inicio: String.fromCharCode(...ogg.subarray(p + 27 + nSeg, p + 27 + nSeg + 8)),
    });
    p += tamanho;
  }
  igual('começa com OggS', String.fromCharCode(...ogg.subarray(0, 4)), 'OggS');
  igual('toda página com CRC certo', paginas.every((pg) => pg.crcOk), true);
  igual('primeira página abre o fluxo com OpusHead', [paginas[0].tipo, paginas[0].inicio], [2, 'OpusHead']);
  igual('segunda é OpusTags', paginas[1].inicio, 'OpusTags');
  igual('última fecha o fluxo', paginas[paginas.length - 1].tipo, 4);
  const segundos = paginas[paginas.length - 1].granulo / 48000;
  igual('dura perto de 1 segundo', segundos > 0.8 && segundos < 1.3, true);
  igual('granulo só cresce', paginas.slice(2).every((pg, i, a) => i === 0 || pg.granulo > a[i - 1].granulo), true);
}
igual('o que não é WebM não converte', webmParaOgg(Uint8Array.of(1, 2, 3, 4)), null);

if (falhas) {
  console.log(`\n${falhas} falha(s).`);
  process.exit(1);
}
console.log('mídia: tudo certo.');
