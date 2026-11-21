/* WebM para OGG, sem ffmpeg.
   O Chrome grava áudio em WebM com Opus dentro, e a Meta só aceita Opus dentro de OGG.
   O som é o mesmo: só troca a embalagem. Aqui o WebM é lido (EBML), os pacotes Opus
   são tirados como estão e embrulhados em páginas OGG (RFC 3533 e RFC 7845).
   Não recodifica nada, então é rápido e não perde qualidade.
   Prova: node --experimental-strip-types testes/midia.ts */

/* ---------------- leitura do WebM (EBML) ---------------- */

const ID = {
  Segment: 0x18538067, Tracks: 0x1654ae6b, TrackEntry: 0xae, TrackNumber: 0xd7, CodecID: 0x86,
  CodecPrivate: 0x63a2, Audio: 0xe1, Channels: 0x9f, Cluster: 0x1f43b675, BlockGroup: 0xa0,
  Block: 0xa1, SimpleBlock: 0xa3,
};
/* elementos que são caixa de outros: a leitura entra neles em vez de pular */
const CAIXAS = new Set([ID.Segment, ID.Tracks, ID.TrackEntry, ID.Audio, ID.Cluster, ID.BlockGroup]);

function leVint(b: Uint8Array, p: number, guardaMarca: boolean) {
  const primeiro = b[p];
  if (primeiro === undefined || primeiro === 0) return null;
  let tamanho = 1;
  while (!(primeiro & (0x80 >> (tamanho - 1)))) tamanho += 1;
  if (p + tamanho > b.length) return null;
  let valor = guardaMarca ? primeiro : primeiro & (0xff >> tamanho);
  let tudoUm = valor === (0xff >> tamanho);
  for (let i = 1; i < tamanho; i += 1) {
    valor = valor * 256 + b[p + i];
    if (b[p + i] !== 0xff) tudoUm = false;
  }
  return { valor, tamanho, desconhecido: !guardaMarca && tudoUm };
}

interface Leitura { cabecalho: Uint8Array | null; canais: number; pacotes: Uint8Array[] }

function leWebm(b: Uint8Array): Leitura | null {
  const faixas: { numero: number; codec: string; privado: Uint8Array | null; canais: number }[] = [];
  let faixa: (typeof faixas)[number] | null = null;
  const blocos: { faixa: number; dados: Uint8Array }[] = [];
  let p = 0;
  while (p < b.length) {
    const id = leVint(b, p, true);
    if (!id) break;
    const tam = leVint(b, p + id.tamanho, false);
    if (!tam) break;
    const inicio = p + id.tamanho + tam.tamanho;
    if (CAIXAS.has(id.valor)) {
      if (id.valor === ID.TrackEntry) { faixa = { numero: 0, codec: '', privado: null, canais: 1 }; faixas.push(faixa); }
      p = inicio;
      continue;
    }
    if (tam.desconhecido) return null; /* só caixa pode ter tamanho desconhecido */
    const fim = Math.min(inicio + tam.valor, b.length);
    const dados = b.subarray(inicio, fim);
    if (faixa && id.valor === ID.TrackNumber) faixa.numero = numero(dados);
    if (faixa && id.valor === ID.CodecID) faixa.codec = String.fromCharCode(...dados);
    if (faixa && id.valor === ID.CodecPrivate) faixa.privado = dados;
    if (faixa && id.valor === ID.Channels) faixa.canais = numero(dados) || 1;
    if (id.valor === ID.SimpleBlock || id.valor === ID.Block) {
      const n = leVint(dados, 0, false);
      if (!n) return null;
      const bandeiras = dados[n.tamanho + 2];
      if (bandeiras & 0x06) return null; /* "lacing": o navegador não usa para Opus; se vier, desiste */
      blocos.push({ faixa: n.valor, dados: dados.subarray(n.tamanho + 3) });
    }
    p = fim;
  }
  const opus = faixas.find((f) => f.codec === 'A_OPUS');
  if (!opus) return null;
  const pacotes = blocos.filter((x) => x.faixa === opus.numero && x.dados.length).map((x) => x.dados);
  if (!pacotes.length) return null;
  return { cabecalho: opus.privado, canais: opus.canais, pacotes };
}

function numero(d: Uint8Array) {
  let v = 0;
  for (const x of d) v = v * 256 + x;
  return v;
}

/* ---------------- quanto som cada pacote Opus tem (RFC 6716, 3.1) ---------------- */

/** Amostras a 48 kHz de um pacote Opus, pelo byte TOC. */
export function amostrasDoPacote(pacote: Uint8Array) {
  if (!pacote.length) return 0;
  const toc = pacote[0];
  const config = toc >> 3;
  let porQuadro: number;
  if (config < 12) porQuadro = [480, 960, 1920, 2880][config % 4];
  else if (config < 16) porQuadro = [480, 960][config % 2];
  else porQuadro = [120, 240, 480, 960][config % 4];
  const codigo = toc & 3;
  const quadros = codigo === 0 ? 1 : codigo < 3 ? 2 : (pacote[1] ?? 0) & 0x3f;
  return porQuadro * quadros;
}

/* ---------------- escrita do OGG ---------------- */

const TABELA_CRC = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let r = i << 24;
    for (let j = 0; j < 8; j += 1) r = r & 0x80000000 ? (r << 1) ^ 0x04c11db7 : r << 1;
    t[i] = r >>> 0;
  }
  return t;
})();

export function crcOgg(b: Uint8Array) {
  let crc = 0;
  for (const x of b) crc = ((crc << 8) ^ TABELA_CRC[((crc >>> 24) & 0xff) ^ x]) >>> 0;
  return crc >>> 0;
}

function pagina(pacotes: Uint8Array[], o: { tipo: number; granulo: number; serie: number; sequencia: number }) {
  const segmentos: number[] = [];
  for (const pk of pacotes) {
    let resto = pk.length;
    while (resto >= 255) { segmentos.push(255); resto -= 255; }
    segmentos.push(resto);
  }
  const corpo = pacotes.reduce((n, pk) => n + pk.length, 0);
  const saida = new Uint8Array(27 + segmentos.length + corpo);
  const v = new DataView(saida.buffer);
  saida.set([0x4f, 0x67, 0x67, 0x53], 0); /* OggS */
  saida[4] = 0;
  saida[5] = o.tipo;
  v.setUint32(6, o.granulo % 0x100000000, true);
  v.setUint32(10, Math.floor(o.granulo / 0x100000000), true);
  v.setUint32(14, o.serie, true);
  v.setUint32(18, o.sequencia, true);
  saida[26] = segmentos.length;
  saida.set(segmentos, 27);
  let p = 27 + segmentos.length;
  for (const pk of pacotes) { saida.set(pk, p); p += pk.length; }
  v.setUint32(22, crcOgg(saida), true);
  return saida;
}

const texto = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0));

function cabecalhoOpus(canais: number) {
  const h = new Uint8Array(19);
  const v = new DataView(h.buffer);
  h.set(texto('OpusHead'), 0);
  h[8] = 1;
  h[9] = canais;
  v.setUint16(10, 312, true);     /* pre-skip padrão do encoder */
  v.setUint32(12, 48000, true);
  return h;
}

function etiquetasOpus() {
  const fornecedor = texto('Nexus Chapeco');
  const t = new Uint8Array(8 + 4 + fornecedor.length + 4);
  const v = new DataView(t.buffer);
  t.set(texto('OpusTags'), 0);
  v.setUint32(8, fornecedor.length, true);
  t.set(fornecedor, 12);
  v.setUint32(12 + fornecedor.length, 0, true);
  return t;
}

/** O áudio do Chrome (WebM com Opus) pronto para a Meta (OGG com Opus). Null quando não é Opus. */
export function webmParaOgg(webm: Uint8Array): Uint8Array | null {
  const lido = leWebm(webm);
  if (!lido) return null;
  const head = lido.cabecalho && lido.cabecalho.length >= 19 && String.fromCharCode(...lido.cabecalho.subarray(0, 8)) === 'OpusHead'
    ? lido.cabecalho
    : cabecalhoOpus(lido.canais);
  const serie = 0x4e455855; /* "NEXU" */
  const paginas: Uint8Array[] = [
    pagina([head], { tipo: 0x02, granulo: 0, serie, sequencia: 0 }),
    pagina([etiquetasOpus()], { tipo: 0x00, granulo: 0, serie, sequencia: 1 }),
  ];
  let granulo = 0;
  let sequencia = 2;
  let grupo: Uint8Array[] = [];
  let segmentos = 0;
  const fecha = (ultima: boolean) => {
    paginas.push(pagina(grupo, { tipo: ultima ? 0x04 : 0x00, granulo, serie, sequencia }));
    sequencia += 1; grupo = []; segmentos = 0;
  };
  lido.pacotes.forEach((pk, i) => {
    const precisa = Math.floor(pk.length / 255) + 1;
    if (grupo.length && (segmentos + precisa > 255 || grupo.length >= 50)) fecha(false);
    grupo.push(pk);
    segmentos += precisa;
    granulo += amostrasDoPacote(pk);
    if (i === lido.pacotes.length - 1) fecha(true);
  });
  const total = paginas.reduce((n, pg) => n + pg.length, 0);
  const saida = new Uint8Array(total);
  let p = 0;
  for (const pg of paginas) { saida.set(pg, p); p += pg.length; }
  return saida;
}
