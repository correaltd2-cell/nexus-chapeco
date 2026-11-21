/* Ler o arquivo que a escola já tem (Excel .xlsx ou CSV) no próprio navegador, sem
   mandar o arquivo para lugar nenhum. Devolve as linhas como texto, do mesmo jeito que
   a planilha do Google devolve o valor formatado: data em dd/mm/aaaa, caixa de seleção
   como TRUE ou FALSE, número sem ".0". Assim quem lê (dominio/planilha.ts) é um só.
   O .xlsx é um zip de XML: abrimos com o fflate e lemos só a aba escolhida. */
import { strFromU8, unzipSync } from 'fflate';

export interface Pasta {
  abas: string[];
  /** As linhas da aba como a pessoa vê: a linha 1 da planilha é a posição 0. */
  linhas(aba: string): string[][];
}

export class ErroDoArquivo extends Error {}

const ENTIDADES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

/** Texto de dentro do XML, com as entidades e os escapes do Excel (_x000D_) desfeitos. */
export function desfazXml(t: string): string {
  return t
    .replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, e: string) => {
      if (e[0] !== '#') return ENTIDADES[e.toLowerCase()] ?? '';
      return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1)));
    })
    .replace(/_x([0-9a-f]{4})_/gi, (_, h: string) => String.fromCharCode(parseInt(h, 16)));
}

const atributo = (tag: string, nome: string) => {
  const m = new RegExp(`(?:^|\\s)${nome}="([^"]*)"`).exec(tag);
  return m ? desfazXml(m[1]) : undefined;
};

/* o texto de um <si> ou <is>: todos os <t>, menos a leitura fonética (<rPh>) */
function textoDe(xml: string): string {
  const sem = xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '');
  let t = '';
  for (const m of sem.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>|<t(?:\s[^>]*)?\/>/g)) t += desfazXml(m[1] || '');
  return t;
}

/** A coluna da referência da célula ("AB12" → 27). */
export function indiceDaColuna(letras: string): number {
  let n = 0;
  for (const c of letras.toUpperCase()) n = n * 26 + (c.charCodeAt(0) - 64);
  return n - 1;
}

/* ---------- formatos de número: o que é data e o que é hora ---------- */

const DATA_PRONTA = new Set([14, 15, 16, 17, 22, 27, 28, 29, 30, 31, 34, 35, 36, 50, 51, 52, 53, 54, 57, 58]);
const HORA_PRONTA = new Set([18, 19, 20, 21, 32, 33, 45, 46, 47, 55, 56]);

export type TipoDoFormato = 'data' | 'hora' | 'numero';

/** Pelo código do formato: tem dia, mês ou ano é data; só hora, minuto e segundo é hora. */
export function tipoDoFormato(id: number, codigo?: string): TipoDoFormato {
  if (codigo === undefined) return DATA_PRONTA.has(id) ? 'data' : HORA_PRONTA.has(id) ? 'hora' : 'numero';
  /* tira texto entre aspas, escapes e [cor] ou [$-416]; [h] e [mm] são horas corridas */
  const limpo = codigo.replace(/"[^"]*"|\\.|\[(?![hms]+\])[^\]]*\]/gi, '').replace(/[[\]]/g, '').toLowerCase();
  if (/general|^[#0.,%\s;-]*$/.test(limpo)) return 'numero';
  if (/[dy]/.test(limpo) || (/m/.test(limpo) && !/[hs]/.test(limpo))) return 'data';
  if (/[hs]/.test(limpo)) return 'hora';
  return 'numero';
}

const dois = (n: number) => String(n).padStart(2, '0');

/** O número de série do Excel virado data dd/mm/aaaa (e hora, se tiver). */
export function dataDoExcel(serie: number, sistema1904 = false): string {
  const dias = serie + (sistema1904 ? 1462 : 0);
  const d = new Date(Math.round((dias - 25569) * 86400) * 1000);
  if (Number.isNaN(d.getTime())) return String(serie);
  const data = `${dois(d.getUTCDate())}/${dois(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
  const temHora = d.getUTCHours() || d.getUTCMinutes();
  return temHora ? `${data} ${dois(d.getUTCHours())}:${dois(d.getUTCMinutes())}` : data;
}

export function horaDoExcel(serie: number): string {
  const minutos = Math.round((serie - Math.floor(serie)) * 1440) % 1440;
  return `${dois(Math.floor(minutos / 60))}:${dois(minutos % 60)}`;
}

function numeroEmTexto(v: string): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return v;
  if (Number.isInteger(n)) return Math.abs(n) < 1e21 ? n.toFixed(0) : String(n);
  return String(Number(n.toPrecision(15)));
}

/* ---------- a pasta ---------- */

const corta = (linha: string[]) => {
  let fim = linha.length;
  while (fim > 0 && !linha[fim - 1]) fim -= 1;
  return linha.slice(0, fim);
};

/** As linhas de uma aba a partir do XML dela. */
export function linhasDaAba(
  xml: string,
  textos: string[],
  formatos: TipoDoFormato[],
  sistema1904 = false,
): string[][] {
  const linhas: string[][] = [];
  let proxima = 0;
  for (const r of xml.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const numero = Number(atributo(r[1], 'r'));
    const i = Number.isFinite(numero) && numero > 0 ? numero - 1 : proxima;
    proxima = i + 1;
    if (!r[2]) continue;
    const linha: string[] = [];
    let coluna = 0;
    for (const c of r[2].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ref = /^([A-Z]+)/i.exec(atributo(c[1], 'r') || '');
      const j = ref ? indiceDaColuna(ref[1]) : coluna;
      coluna = j + 1;
      const corpo = c[2] || '';
      const tipo = atributo(c[1], 't') || 'n';
      const v = /<v>([\s\S]*?)<\/v>/.exec(corpo)?.[1];
      let valor = '';
      if (tipo === 'inlineStr') valor = textoDe(/<is>([\s\S]*?)<\/is>/.exec(corpo)?.[1] || '');
      else if (v === undefined) valor = '';
      else if (tipo === 's') valor = textos[Number(v)] ?? '';
      else if (tipo === 'b') valor = v.trim() === '1' ? 'TRUE' : 'FALSE';
      else if (tipo === 'e') valor = '';
      else if (tipo === 'str' || tipo === 'd') valor = desfazXml(v);
      else {
        const n = Number(v);
        const formato = formatos[Number(atributo(c[1], 's') || 0)] || 'numero';
        valor = !Number.isFinite(n) ? desfazXml(v)
          : formato === 'data' ? dataDoExcel(n, sistema1904)
            : formato === 'hora' ? horaDoExcel(n)
              : numeroEmTexto(v);
      }
      if (valor) {
        while (linha.length < j) linha.push('');
        linha[j] = valor.replace(/\r\n?/g, '\n');
      }
    }
    while (linhas.length < i) linhas.push([]);
    linhas[i] = corta(linha);
  }
  while (linhas.length && !linhas[linhas.length - 1].length) linhas.pop();
  return linhas;
}

/** Abre um .xlsx. Lê o índice das abas agora e cada aba só quando pedida. */
export function abreXlsx(bytes: Uint8Array): Pasta {
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) {
    throw new ErroDoArquivo('Esse arquivo não é um Excel .xlsx. No Excel ou no Google Sheets, salve ou baixe como .xlsx (ou .csv) e tente de novo.');
  }
  const leve = (nomes: (n: string) => boolean) => {
    try {
      return unzipSync(bytes, { filter: (f) => nomes(f.name) });
    } catch {
      throw new ErroDoArquivo('Não consegui abrir esse arquivo. Ele pode estar corrompido ou protegido por senha.');
    }
  };
  const base = leve((n) => ['xl/workbook.xml', 'xl/_rels/workbook.xml.rels', 'xl/sharedStrings.xml', 'xl/styles.xml'].includes(n));
  const texto = (n: string) => (base[n] ? strFromU8(base[n]) : '');
  const livro = texto('xl/workbook.xml');
  if (!livro) throw new ErroDoArquivo('Esse arquivo não parece uma planilha do Excel.');

  const sistema1904 = /<workbookPr\b[^>]*date1904="(1|true)"/.test(livro);
  const destinos = new Map<string, string>();
  for (const m of texto('xl/_rels/workbook.xml.rels').matchAll(/<Relationship\b[^>]*>/g)) {
    const id = atributo(m[0], 'Id');
    const alvo = atributo(m[0], 'Target');
    if (id && alvo) destinos.set(id, alvo.startsWith('/') ? alvo.slice(1) : `xl/${alvo.replace(/^\.\//, '')}`);
  }
  const abas: { nome: string; arquivo: string }[] = [];
  for (const m of livro.matchAll(/<sheet\b[^>]*>/g)) {
    const nome = atributo(m[0], 'name');
    const id = atributo(m[0], 'r:id');
    const estado = atributo(m[0], 'state');
    const arquivo = id ? destinos.get(id) : undefined;
    if (nome && arquivo && estado !== 'veryHidden') abas.push({ nome, arquivo });
  }
  if (!abas.length) throw new ErroDoArquivo('A planilha não tem nenhuma aba com dados.');

  const textos = [...texto('xl/sharedStrings.xml').matchAll(/<si>([\s\S]*?)<\/si>|<si\/>/g)].map((m) => textoDe(m[1] || ''));
  const estilos = texto('xl/styles.xml');
  const codigos = new Map<number, string>();
  for (const m of estilos.matchAll(/<numFmt\b[^>]*>/g)) {
    const id = Number(atributo(m[0], 'numFmtId'));
    const codigo = atributo(m[0], 'formatCode');
    if (Number.isFinite(id) && codigo !== undefined) codigos.set(id, codigo);
  }
  const xfs = /<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/.exec(estilos)?.[1] || '';
  const formatos = [...xfs.matchAll(/<xf\b[^>]*?(?:\/>|>)/g)].map((m) => {
    const id = Number(atributo(m[0], 'numFmtId') || 0);
    return tipoDoFormato(id, codigos.get(id));
  });

  const lidas = new Map<string, string[][]>();
  return {
    abas: abas.map((a) => a.nome),
    linhas(nome) {
      const aba = abas.find((a) => a.nome === nome);
      if (!aba) throw new ErroDoArquivo(`Não achei a aba ${nome}.`);
      const pronta = lidas.get(nome);
      if (pronta) return pronta;
      const xml = leve((n) => n === aba.arquivo)[aba.arquivo];
      const linhas = xml ? linhasDaAba(strFromU8(xml), textos, formatos, sistema1904) : [];
      lidas.set(nome, linhas);
      return linhas;
    },
  };
}

/* ---------- CSV ---------- */

/** O separador de um CSV: o que mais aparece fora de aspas na primeira linha com dado
    (o Excel em português salva com ponto e vírgula). */
function separadorDe(texto: string): string {
  const linha = texto.split(/\r?\n/).find((l) => l.trim()) || '';
  const conta = { ';': 0, ',': 0, '\t': 0 } as Record<string, number>;
  let aspas = false;
  for (const c of linha) {
    if (c === '"') aspas = !aspas;
    else if (!aspas && c in conta) conta[c] += 1;
  }
  const [mais, vezes] = Object.entries(conta).sort((a, b) => b[1] - a[1])[0];
  return vezes ? mais : ',';
}

/** Lê um CSV com aspas, quebras de linha dentro de aspas e o separador que vier. */
export function leCsv(texto: string): string[][] {
  const t = texto.replace(/^﻿/, '');
  const sep = separadorDe(t);
  const linhas: string[][] = [];
  let linha: string[] = [];
  let campo = '';
  let aspas = false;
  for (let i = 0; i < t.length; i += 1) {
    const c = t[i];
    if (aspas) {
      if (c === '"' && t[i + 1] === '"') { campo += '"'; i += 1; } else if (c === '"') aspas = false; else campo += c;
    } else if (c === '"' && campo === '') aspas = true;
    else if (c === sep) { linha.push(campo); campo = ''; } else if (c === '\n' || c === '\r') {
      if (c === '\r' && t[i + 1] === '\n') i += 1;
      linha.push(campo); linhas.push(corta(linha)); linha = []; campo = '';
    } else campo += c;
  }
  if (campo || linha.length) { linha.push(campo); linhas.push(corta(linha)); }
  while (linhas.length && !linhas[linhas.length - 1].length) linhas.pop();
  return linhas;
}

/** O texto de um CSV: tenta UTF-8 e, se vier quebrado, o Windows-1252 do Excel antigo. */
export function textoDoCsv(bytes: Uint8Array): string {
  const utf8 = new TextDecoder('utf-8').decode(bytes);
  return utf8.includes('�') ? new TextDecoder('windows-1252').decode(bytes) : utf8;
}

/** Abre o arquivo pelo nome: .xlsx ou .csv. */
export function abreArquivo(nome: string, bytes: Uint8Array): Pasta {
  const n = nome.toLowerCase();
  if (n.endsWith('.csv') || n.endsWith('.txt') || n.endsWith('.tsv')) {
    const linhas = leCsv(textoDoCsv(bytes));
    const aba = nome.replace(/\.[^.]+$/, '') || 'Arquivo';
    return { abas: [aba], linhas: () => linhas };
  }
  if (n.endsWith('.xls') || n.endsWith('.ods') || n.endsWith('.numbers')) {
    throw new ErroDoArquivo('Esse formato eu não leio. Salve como .xlsx (Excel) ou .csv e tente de novo. No Google Sheets: Arquivo, Fazer download, Microsoft Excel.');
  }
  return abreXlsx(bytes);
}
