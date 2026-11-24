/* O texto de um arquivo do Word (.docx), lido sem programa nenhum: o .docx é um zip, e
   o texto mora em word/document.xml. Serve para a leitura do contrato (o servidor manda
   o texto para a IA). Cada parágrafo vira uma linha; tabulação vira tab.
   Prova: node --experimental-strip-types testes/contrato.ts */
import { strFromU8, unzipSync } from 'fflate';

const ENTIDADES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

export function textoDoXmlDoWord(xml: string): string {
  return xml
    .replace(/<w:tab\/>/g, '\t')
    .replace(/<w:(br|cr)\/>/g, '\n')
    .replace(/<\/w:p>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&(amp|lt|gt|quot|apos);/g, (_, e: string) => ENTIDADES[e])
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** O texto do .docx, ou null se o arquivo não for um .docx que dê para abrir. */
export function textoDoDocx(bytes: Uint8Array): string | null {
  try {
    const zip = unzipSync(bytes, { filter: (f) => f.name === 'word/document.xml' });
    const xml = zip['word/document.xml'];
    return xml ? textoDoXmlDoWord(strFromU8(xml)) : null;
  } catch {
    return null;
  }
}
