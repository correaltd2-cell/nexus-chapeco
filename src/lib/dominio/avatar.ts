/* O bonequinho de cada pessoa da equipe (26/11/2026, pedido do cliente: "um avatar, como
   se fosse um emojizinho de cada usuário, para conseguir colocar cabelo, botar o
   personagem, e ele fica aparecendo bem lá embaixo discreto"; "quando abre o sistema, o
   bonequinho dando tchau em tela grande").
   Desenho nosso, em SVG (componentes/avatar.tsx), montado com as escolhas daqui. Cada um
   monta o seu em Configurações, Seu bonequinho, e ele mora no próprio perfil
   (perfis/{uid}.avatar). Quem ainda não montou ganha um padrão tirado do nome, sempre
   o mesmo, para a equipe já aparecer com cara.
   Prova: node --experimental-strip-types testes/avatar.ts */

export const PELES = ['#FBE0C8', '#F1C6A0', '#DDA57A', '#B97D52', '#8C5A37', '#5E3A22'] as const;

export const CABELOS = ['curto', 'lateral', 'arrepiado', 'cacheado', 'comprido', 'rabo', 'coque', 'careca'] as const;
export type Cabelo = (typeof CABELOS)[number];
export const NOME_CABELO: Record<Cabelo, string> = {
  curto: 'Curto', lateral: 'De lado', arrepiado: 'Arrepiado', cacheado: 'Cacheado',
  comprido: 'Comprido', rabo: 'Rabo de cavalo', coque: 'Coque', careca: 'Careca',
};

export const CORES_DE_CABELO = ['#1E1A17', '#4A2E1E', '#7A4A2A', '#B5793F', '#E2C07A', '#A6A29C', '#C2410C', '#6D28D9'] as const;
export const ROUPAS = ['#F6821F', '#141414', '#2D5C9E', '#1F3D2B', '#8CD866', '#E79BE3', '#F2D33C', '#FFFFFF'] as const;
export const FUNDOS = ['#FDE7D3', '#E4EEF9', '#E5F4DD', '#F7E3F5', '#FFF4C7', '#ECEAE4'] as const;

export interface Avatar {
  pele: string;        // #RRGGBB, uma das PELES
  cabelo: Cabelo;
  corCabelo: string;   // uma das CORES_DE_CABELO
  roupa: string;       // uma das ROUPAS
  fundo: string;       // uma das FUNDOS (o círculo do menu)
  barba: boolean;
  oculos: boolean;
  tchau: boolean;      // dá tchau em tela grande quando a pessoa abre o sistema
}

/** Um número estável do nome: a mesma pessoa ganha sempre o mesmo padrão. */
function semente(texto: string): number {
  let h = 2166136261;
  for (const c of (texto || '').trim().toLowerCase()) {
    h ^= c.charCodeAt(0);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}

/** O bonequinho de quem ainda não montou o seu: tirado do nome, sem barba nem óculos. */
export function avatarPadrao(nome: string): Avatar {
  const s = semente(nome);
  const pega = <T,>(l: readonly T[], passo: number) => l[Math.floor(s / passo) % l.length];
  return {
    pele: pega(PELES, 1),
    cabelo: pega(CABELOS.filter((c) => c !== 'careca'), 7),
    corCabelo: pega(CORES_DE_CABELO.slice(0, 5), 53),
    roupa: pega(ROUPAS, 311),
    fundo: pega(FUNDOS, 1999),
    barba: false,
    oculos: false,
    tchau: true,
  };
}

const da = <T extends string>(lista: readonly T[], v: unknown, reserva: T): T =>
  typeof v === 'string' && (lista as readonly string[]).includes(v) ? (v as T) : reserva;

/** O bonequinho gravado no perfil, conferido: o que vier estranho volta ao padrão do nome. */
export function leAvatar(bruto: unknown, nome: string): Avatar {
  const p = avatarPadrao(nome);
  if (!bruto || typeof bruto !== 'object') return p;
  const b = bruto as Record<string, unknown>;
  return {
    pele: da(PELES, b.pele, p.pele),
    cabelo: da(CABELOS, b.cabelo, p.cabelo),
    corCabelo: da(CORES_DE_CABELO, b.corCabelo, p.corCabelo),
    roupa: da(ROUPAS, b.roupa, p.roupa),
    fundo: da(FUNDOS, b.fundo, p.fundo),
    barba: typeof b.barba === 'boolean' ? b.barba : p.barba,
    oculos: typeof b.oculos === 'boolean' ? b.oculos : p.oculos,
    tchau: typeof b.tchau === 'boolean' ? b.tchau : p.tchau,
  };
}

/** "Oi, Guilherme!" e a frase de baixo do tchau, que muda com a hora do dia (de Chapecó). */
export function saudacao(nome: string, hora: number): { titulo: string; frase: string } {
  const primeiro = (nome || '').trim().split(/\s+/)[0] || 'pessoal';
  const frase = hora >= 5 && hora < 12 ? 'Bom dia! Bora pra mais um dia na Nexus.'
    : hora >= 12 && hora < 18 ? 'Boa tarde! Bom trabalho por aí.'
      : 'Boa noite! Tamo junto até o fim do expediente.';
  return { titulo: `Oi, ${primeiro}!`, frase };
}

/** O tchau aparece uma vez por pessoa a cada vez que o sistema abre no navegador. */
export const chaveDoTchau = (uid: string) => `nexus-tchau-${uid}`;
export const DURACAO_DO_TCHAU_MS = 2800;
