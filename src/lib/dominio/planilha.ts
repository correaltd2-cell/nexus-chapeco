/* A planilha de alunos do Google dentro do sistema: as regras puras.
   A escola mantém a lista de alunos numa planilha e continua mantendo; o sistema lê,
   reconhece as colunas pelo nome (a pessoa ajusta na tela se errar), compara com os
   alunos que já existem e diz o que vai mudar antes de mudar. Depois liga as conversas
   aos alunos pelo telefone e, sem telefone na planilha, pelo nome quando só um aluno bate.

   Feito em cima da planilha de verdade da escola ("01 - MARCAÇÃO DE AULA - CHAPECO",
   aba ATIVOS): cabeçalho na linha 8, com o painel de números em cima; COD como chave;
   a coluna "yes" mistura a situação do aluno (trancado, off, obs, mês de volta) com a
   marcação da semana seguinte (yes); "ei" é o horário fixo escrito à mão; BOOK junta
   nível, tipo, modalidade e professor; " - menor" no fim do nome marca menor de idade.

   Regras de propósito:
   - célula vazia nunca apaga o que o sistema já tem (planilha com buraco não desfaz cadastro);
   - aluno que sumiu da planilha não é apagado nem desativado: aparece na conta, para a escola ver;
   - sem coluna de situação, todo mundo da planilha é ativo.
   Prova: node --experimental-strip-types testes/planilha.ts */
import { alunosDoContato, mesmoTelefone } from './contato.ts';

export type Campo =
  | 'nome' | 'telefone' | 'responsavelNome' | 'responsavelTelefone' | 'email' | 'documento'
  | 'codigo' | 'nivel' | 'licao' | 'trilha' | 'situacao' | 'horarioFixo' | 'temFixo' | 'modalidade'
  | 'classificacao' | 'app' | 'nexia' | 'pendenciaLivro' | 'contratoFim' | 'contratoAssinado' | 'observacao';

/** Os campos na ordem em que são reconhecidos: o mais específico primeiro, para
    "Telefone do responsável" não virar o telefone do aluno nem "Falta por livro" o livro. */
export const CAMPOS: { campo: Campo; rotulo: string; obrigatorio?: boolean; apelidos: string[] }[] = [
  { campo: 'responsavelTelefone', rotulo: 'Telefone do responsável', apelidos: ['telefone do responsavel', 'celular do responsavel', 'whatsapp do responsavel', 'fone do responsavel', 'telefone responsavel', 'celular responsavel', 'whatsapp responsavel', 'contato do responsavel', 'telefone da mae', 'telefone do pai', 'celular da mae', 'celular do pai', 'tel responsavel', 'tel do responsavel', 'cel responsavel', 'cel do responsavel', 'fone responsavel'] },
  { campo: 'responsavelNome', rotulo: 'Nome do responsável', apelidos: ['nome do responsavel', 'responsavel', 'responsavel financeiro', 'nome da mae', 'nome do pai', 'mae', 'pai'] },
  { campo: 'email', rotulo: 'E-mail', apelidos: ['e mail', 'email', 'e mail do aluno', 'email do aluno'] },
  { campo: 'documento', rotulo: 'CPF', apelidos: ['cpf', 'cpf do aluno', 'documento'] },
  { campo: 'codigo', rotulo: 'Código ou matrícula', apelidos: ['cod', 'codigo', 'matricula', 'id', 'numero da matricula', 'n matricula', 'no matricula', 'ra', 'codigo do aluno'] },
  { campo: 'nome', rotulo: 'Nome do aluno', obrigatorio: true, apelidos: ['nome', 'nome do aluno', 'nome completo', 'aluno', 'aluna', 'estudante', 'alunos'] },
  { campo: 'telefone', rotulo: 'Telefone do aluno', apelidos: ['telefone do aluno', 'celular do aluno', 'whatsapp do aluno', 'whatsapp', 'whats', 'celular', 'telefone', 'fone', 'contato', 'tel', 'cel'] },
  { campo: 'pendenciaLivro', rotulo: 'Falta por livro', apelidos: ['falta por livro', 'pendencia de livro', 'falta livro', 'livro pendente'] },
  { campo: 'nivel', rotulo: 'Livro ou nível', apelidos: ['book', 'nivel', 'nivel atual', 'livro', 'estagio', 'modulo', 'turma', 'stage'] },
  { campo: 'licao', rotulo: 'Lição', apelidos: ['licao', 'licao atual', 'lesson', 'unit', 'unidade', 'aula atual'] },
  { campo: 'trilha', rotulo: 'Curso (Adultos ou Kids)', apelidos: ['curso', 'trilha', 'programa', 'tipo de curso', 'categoria'] },
  /* "yes" é o nome da coluna na planilha da escola: situação e marcação da semana */
  { campo: 'situacao', rotulo: 'Situação e marcação da semana', apelidos: ['yes', 'situacao', 'status', 'ativo', 'situacao do aluno', 'situacao da matricula', 'status do aluno', 'marcacao', 'marcou'] },
  { campo: 'horarioFixo', rotulo: 'Horário fixo', apelidos: ['ei', 'horario fixo', 'horarios fixos', 'horario', 'horarios', 'dia e horario', 'dias e horarios'] },
  { campo: 'temFixo', rotulo: 'Tem horário fixo', apelidos: ['fixed', 'fixo', 'tem horario fixo'] },
  { campo: 'modalidade', rotulo: 'Modalidade', apelidos: ['modalidade', 'modalidade de aula'] },
  { campo: 'classificacao', rotulo: 'Classificação', apelidos: ['classificacao', 'saude', 'risco'] },
  { campo: 'app', rotulo: 'App', apelidos: ['app', 'aplicativo', 'acesso ao app'] },
  { campo: 'nexia', rotulo: 'Nex-IA', apelidos: ['nex ia', 'nexia'] },
  { campo: 'contratoFim', rotulo: 'Fim do contrato', apelidos: ['fim de contrato', 'fim do contrato', 'vencimento do contrato', 'termino do contrato'] },
  { campo: 'contratoAssinado', rotulo: 'Contrato assinado', apelidos: ['assinatura do contrato', 'contrato assinado'] },
  { campo: 'observacao', rotulo: 'Observação', apelidos: ['observacoes', 'observacao', 'obs'] },
];

export const NOME_DO_CAMPO = Object.fromEntries(CAMPOS.map((c) => [c.campo, c.rotulo])) as Record<Campo, string>;

/** Mapa salvo: o nome da coluna de cada campo (o nome sobrevive a coluna mudar de lugar). */
export type Mapa = Partial<Record<Campo, string | null>>;

export const normal = (t: unknown) => String(t ?? '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ').trim();

/* colunas que nunca são campo de aluno, mesmo contendo uma palavra parecida */
const NUNCA = /^(data|dt|valor|mensalidade|vencimento|desconto|parcela|dia de)\b|\brenovac/;

/** Reconhece as colunas pelo nome. Devolve o índice de cada campo, ou nada. */
export function reconheceColunas(cabecalho: string[]): Partial<Record<Campo, number>> {
  const cab = cabecalho.map(normal);
  const usadas = new Set<number>();
  const achado: Partial<Record<Campo, number>> = {};
  /* 1ª volta: nome exato; 2ª volta: a coluna contém o apelido como palavra inteira */
  for (const exato of [true, false]) {
    for (const c of CAMPOS) {
      if (achado[c.campo] !== undefined) continue;
      for (const apelido of c.apelidos) {
        if (!exato && apelido.length < 3) continue;   /* "ei" e "id" só pelo nome exato */
        const i = cab.findIndex((h, j) => !usadas.has(j) && h && !NUNCA.test(h)
          && (exato ? h === apelido : ` ${h} `.includes(` ${apelido} `)));
        if (i >= 0) { achado[c.campo] = i; usadas.add(i); break; }
      }
    }
  }
  return achado;
}

/** A linha do cabeçalho: entre as vinte de cima, a que tem mais colunas conhecidas (a
    planilha da escola tem o painel de números em cima da tabela). */
export function linhaDoCabecalho(linhas: unknown[][]): number {
  let melhor = -1;
  let pontos = 1;
  for (let i = 0; i < Math.min(20, linhas.length); i += 1) {
    const n = Object.keys(reconheceColunas((linhas[i] || []).map((c) => String(c ?? '')))).length;
    if (n > pontos) { melhor = i; pontos = n; }
  }
  if (melhor >= 0) return melhor;
  return Math.max(0, linhas.findIndex((l) => (l || []).some((c) => String(c ?? '').trim())));
}

/** O mapa final: o que a pessoa escolheu na tela vale; o resto, o reconhecido. */
export function resolveMapa(cabecalho: string[], escolhido: Mapa = {}): Partial<Record<Campo, number>> {
  const auto = reconheceColunas(cabecalho);
  const cab = cabecalho.map((h) => String(h ?? '').trim());
  const final: Partial<Record<Campo, number>> = {};
  for (const { campo } of CAMPOS) {
    if (campo in escolhido) {
      const nome = escolhido[campo];
      if (nome === null || nome === '') continue;           /* a pessoa disse: não tem */
      const i = cab.findIndex((h) => h === nome);
      if (i >= 0) { final[campo] = i; continue; }           /* coluna renomeada: volta ao automático */
    }
    if (auto[campo] !== undefined) final[campo] = auto[campo];
  }
  return final;
}

/* ---------------- os valores ---------------- */

/** Telefone como o sistema guarda (55 + DDD + número). Sem DDD, é de Chapecó (49).
    Com dois números na célula, vale o primeiro. */
export function telefoneDaPlanilha(bruto: unknown): string {
  const primeiro = String(bruto ?? '').split(/[\/,;|]| ou | e /i)[0];
  const d = primeiro.replace(/\D/g, '').replace(/^0+/, '');
  if (!d) return '';
  if (d.length === 8 || d.length === 9) return `5549${d}`;
  if (d.length === 10 || d.length === 11) return `55${d}`;
  if ((d.length === 12 || d.length === 13) && d.startsWith('55')) return d;
  return '';
}

export type SituacaoAluno = 'ativo' | 'trancado' | 'off' | 'obs' | 'inativo';
export const NOME_DA_SITUACAO: Record<SituacaoAluno, string> = {
  ativo: 'Ativo', trancado: 'Trancado', off: 'Off', obs: 'Obs', inativo: 'Inativo',
};

const MES = /\b(janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\b/;

/**
 * A célula da situação. Na planilha da escola ela diz duas coisas: "yes" é o aluno ativo
 * que marcou a semana seguinte; vazio é ativo que ainda não marcou; trancado, off, obs
 * e o mês de volta ("JANEIRO") são a situação. Em planilha comum, "Ativo", "Cancelado".
 * marcou: true (yes), false (vazio, só quando a coluna é a da marcação) ou null (não diz).
 */
export function lerSituacao(bruto: unknown, colunaDeMarcacao = false): { situacao: SituacaoAluno; marcou: boolean | null; reconhecida: boolean } {
  const t = normal(bruto);
  if (!t) return { situacao: 'ativo', marcou: colunaDeMarcacao ? false : null, reconhecida: true };
  if (/^(yes|y|sim|s|ok|marcou|marcad\w*|x)$/.test(t)) return { situacao: 'ativo', marcou: true, reconhecida: true };
  if (/\btranc/.test(t)) return { situacao: 'trancado', marcou: null, reconhecida: true };
  if (/^off\b|\bafastad|\bferias\b|\bvolta\b|\bretorna/.test(t) || MES.test(t)) return { situacao: 'off', marcou: null, reconhecida: true };
  if (/^obs\b|\bpendenc|\bchamar\b|\baguard/.test(t)) return { situacao: 'obs', marcou: null, reconhecida: true };
  /* a primeira palavra manda: "Ativo (não pagou)" é ativo, "Inativo" e "Não ativo" não */
  if (/^(inativ|nao ativ|desativ)/.test(t)) return { situacao: 'inativo', marcou: null, reconhecida: true };
  if (/^ativ/.test(t)) return { situacao: 'ativo', marcou: null, reconhecida: true };
  if (/\b(cancel\w*|desist\w*|conclu\w*|formad\w*|encerr\w*|finaliz\w*|evadid\w*|saiu|nao|n|false|0|ex aluno|exaluno)\b/.test(t)) return { situacao: 'inativo', marcou: null, reconhecida: true };
  if (/\b(matriculad\w*|cursando|andamento|true|1|regular)\b/.test(t)) return { situacao: 'ativo', marcou: null, reconhecida: true };
  return { situacao: 'ativo', marcou: null, reconhecida: false };
}

/** "L12", "Lição 12", "12" viram 12; fora de 1 a 20, nada. */
export function lerLicao(bruto: unknown): number | null {
  const m = /(\d{1,2})/.exec(String(bruto ?? ''));
  const n = m ? Number(m[1]) : NaN;
  return n >= 1 && n <= 20 ? n : null;
}

/** Caixa marcada, "sim", 1: verdadeiro. Vazio: não diz nada. */
export function lerSimNao(bruto: unknown): boolean | null {
  const t = normal(bruto);
  if (!t) return null;
  if (/^(true|verdadeiro|sim|s|1|x|ok|assinado|fixo|yes)$/.test(t)) return true;
  if (/^(false|falso|nao|n|0|no)$/.test(t)) return false;
  return null;
}

/** Data da planilha em AAAA-MM-DD. Planilha brasileira: dia antes do mês. */
export function lerData(bruto: unknown): string {
  const t = String(bruto ?? '').trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(t);
  if (!m) return '';
  const ano = m[3].length === 2 ? `20${m[3]}` : m[3];
  const dia = Number(m[1]); const mes = Number(m[2]);
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return '';
  return `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

export type Saude = 'evoluindo' | 'atencao' | 'critico';
export function lerClassificacao(bruto: unknown): Saude | null {
  const t = normal(bruto);
  if (/^evolu/.test(t)) return 'evoluindo';
  if (/^atenc/.test(t)) return 'atencao';
  if (/^critic/.test(t)) return 'critico';
  return null;
}

export type ModalidadeDoAluno = 'presencial' | 'online' | 'hibrido';
export function lerModalidade(bruto: unknown): ModalidadeDoAluno | null {
  const t = normal(bruto);
  if (!t) return null;
  if (/hibrid/.test(t) || (/presencia/.test(t) && /online|\bon\b/.test(t))) return 'hibrido';
  if (/online|\bon\b|remot/.test(t)) return 'online';
  if (/presencia/.test(t)) return 'presencial';
  return null;
}

/** O nome sem as marcas que a planilha pendura no fim: " - menor" (menor de idade) e
    " - ON" (online), em qualquer ordem ("FULANO - menor - ON"). */
export function limpaNome(bruto: unknown): { nome: string; menor: boolean; online: boolean } {
  let t = String(bruto ?? '').replace(/\s+/g, ' ').trim();
  let menor = false;
  let online = false;
  for (;;) {
    const m = /\s*[-–(]\s*(menor|on|online)\s*\)?\s*$/i.exec(t) || /\s+(menor)\s*$/i.exec(t);
    if (!m) break;
    if (/menor/i.test(m[1])) menor = true; else online = true;
    t = t.slice(0, m.index).trim();
  }
  return { nome: t, menor, online };
}

export type TipoDeCurso = 'turma' | 'particular' | 'clube';
export interface Livro {
  nivel: string;           // Starter, A1, A2, B1, B2, Junior 3, Clube
  tipo: TipoDeCurso;
  online: boolean;
  kids: boolean;           // Nexus Junior é a trilha Kids
  flex: boolean;
  conversacao: boolean;    // "B2 + conv": turma com conversação a mais
  professor: string;       // "PRIVATE NATHAN"
}

const NIVEIS: [RegExp, string][] = [
  [/\b(starter|beginner|begginer|beginer|iniciante)\b/, 'Starter'],
  [/\ba1\b/, 'A1'], [/\ba2\b/, 'A2'], [/\bb1\b/, 'B1'], [/\bb2\b/, 'B2'], [/\bc1\b/, 'C1'],
];
const PALAVRAS_DO_LIVRO = new Set(['private', 'particular', 'class', 'classe', 'aula', 'aulas', 'convo', 'conversation', 'conversacao', 'conv',
  'club', 'clube', 'on', 'online', 'flex', 'nexus', 'livro', 'junior', 'juniors', 'kids', 'teens', 'l', 'starter', 'beginner', 'begginer',
  'a1', 'a2', 'b1', 'b2', 'c1', 'e', 'de', 'com', 'presencial']);

/** O BOOK da planilha quebrado em partes: "PRIVATE NATHAN", "NEXUS JUNIOR LIVRO 3",
    "CONVERSATION B1 ON", "B2 + CONV", "BEGGINER". */
export function leLivro(bruto: unknown): Livro {
  const t = normal(bruto).replace(/\b(\d)\b/g, ' $1 ').replace(/\s+/g, ' ').trim();
  const nivelBase = NIVEIS.find(([r]) => r.test(t))?.[1] || '';
  const kids = /\bjunior|\bkids\b|\bteens?\b/.test(t);
  const numJunior = /\b(?:junior|juniors|kids)\b(?:\s+(?:livro|l))?\s*(\d)\b|\bl\s*(\d)\b|\blivro\s*(\d)\b/.exec(t);
  const particular = /\b(private|particular|privat|rivate)\b/.test(t);
  const conversa = /\b(convo|conversation|conversacao|conv|club|clube)\b/.test(t);
  const professor = particular
    ? (t.split(' ').find((p) => p.length >= 3 && !/\d/.test(p) && !PALAVRAS_DO_LIVRO.has(p)) || '')
    : '';
  const nivel = nivelBase
    || (kids ? `Junior${numJunior ? ` ${numJunior[1] || numJunior[2] || numJunior[3]}` : ''}` : '')
    || (conversa ? 'Clube' : '');
  return {
    nivel,
    tipo: particular ? 'particular' : conversa && !/\+\s*conv|\bconv\b/.test(String(bruto ?? '').toLowerCase()) ? 'clube' : 'turma',
    online: /\b(on|online)\b/.test(t),
    kids,
    flex: /\bflex\b/.test(t),
    conversacao: /\+\s*conv/i.test(String(bruto ?? '')),
    professor: professor ? professor[0].toUpperCase() + professor.slice(1) : '',
  };
}

const DIAS: Record<string, number> = {
  domingo: 0, domingos: 0, dom: 0, segunda: 1, segundas: 1, seg: 1, terca: 2, tercas: 2, ter: 2,
  quarta: 3, quartas: 3, qua: 3, quinta: 4, quintas: 4, qui: 4, sexta: 5, sextas: 5, sex: 5,
  sabado: 6, sabados: 6, sab: 6, sb: 6,
};

/** O horário fixo escrito à mão vira dia e hora: "quartas às 13h30", "seg 13h30 e sex 18h",
    "terças às 18h30 e às 19h30", "segunda e quarta 19h". Recado sem dia e hora fica de fora. */
export function leHorarioFixo(bruto: unknown): { dia: number; hora: string }[] {
  const t = normal(String(bruto ?? '').replace(/(\d{1,2}):(\d{2})/g, '$1h$2'))
    .replace(/([a-gi-z])(\d)/g, '$1 $2').replace(/(\d)(?=[a-gi-z])/g, '$1 ');
  const saida: { dia: number; hora: string }[] = [];
  let pendentes: number[] = [];
  let ultimos: number[] = [];
  for (const p of t.split(' ')) {
    if (p in DIAS) { pendentes.push(DIAS[p]); continue; }
    const m = /^(\d{1,2})h(\d{2})?$/.exec(p);
    if (!m) continue;
    const h = Number(m[1]);
    if (h < 6 || h > 22) continue;
    const hora = `${String(h).padStart(2, '0')}:${m[2] || '00'}`;
    const dias = pendentes.length ? pendentes : ultimos;
    for (const d of dias) if (!saida.some((x) => x.dia === d && x.hora === hora)) saida.push({ dia: d, hora });
    if (pendentes.length) { ultimos = pendentes; pendentes = []; }
  }
  return saida;
}

export const NOME_DO_DIA = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
export const horarioEmTexto = (hs: { dia: number; hora: string }[]) =>
  hs.map((h) => `${NOME_DO_DIA[h.dia]} ${h.hora.replace(':00', 'h').replace(':', 'h')}`).join(', ');

/* ---------------- a linha vira aluno ---------------- */

export interface AlunoDaPlanilha {
  chave: string;
  linha: number;               // a linha na planilha, contando do 1, como a pessoa vê
  nome: string;
  menor: boolean;
  telefone: string;
  responsavelNome: string;
  responsavelTelefone: string;
  email: string;
  documento: string;
  codigo: string;
  nivel: string;
  livroOriginal: string;
  tipoCurso: TipoDeCurso | null;
  professorDoLivro: string;
  licao: number | null;
  trilha: 'adultos' | 'kids';
  situacao: SituacaoAluno;
  ativo: boolean;
  marcouSemana: boolean | null;
  horarioFixoTexto: string;
  horariosFixos: { dia: number; hora: string }[];
  temFixo: boolean | null;
  modalidade: ModalidadeDoAluno | null;
  saude: Saude | null;
  appAtivo: boolean | null;
  nexiaAtivo: boolean | null;
  pendenciaLivro: boolean | null;
  contratoFim: string;
  contratoAssinado: boolean | null;
  observacao: string;
}

export interface Leitura {
  cabecalho: string[];
  linhaCabecalho: number;
  colunas: Partial<Record<Campo, number>>;
  colunaDeMarcacao: boolean;   // a coluna da situação também diz quem marcou a semana
  alunos: AlunoDaPlanilha[];
  problemas: { linha: number; motivo: string }[];
  situacoesDesconhecidas: string[];
}

const texto = (linha: unknown[], i: number | undefined) => (i === undefined ? '' : String(linha[i] ?? '').replace(/\s+/g, ' ').trim());

/** A chave que reencontra o aluno na próxima leitura: código, CPF, ou nome com o fim do telefone. */
export function chaveDe(a: Pick<AlunoDaPlanilha, 'codigo' | 'documento' | 'nome' | 'telefone'>) {
  if (a.codigo) return `c:${normal(a.codigo).replace(/ 0$/, '')}`;
  if (a.documento.length === 11) return `d:${a.documento}`;
  return `n:${normal(a.nome)}|${a.telefone.slice(-8)}`;
}

/* linha vazia de tabela: só caixas desmarcadas e zeros */
const soVazio = (l: unknown[]) => l.every((c) => /^(|false|falso|0|0 0)$/.test(normal(c)));

export function lePlanilha(linhas: unknown[][], escolhido: Mapa = {}): Leitura {
  const h = linhaDoCabecalho(linhas);
  const cabecalho = (linhas[h] || []).map((c) => String(c ?? '').trim());
  const col = resolveMapa(cabecalho, escolhido);
  const corpo = linhas.slice(h + 1).map((l) => l || []);
  /* a coluna da situação é a da marcação da semana quando boa parte diz "yes" */
  const valoresSit = col.situacao === undefined ? [] : corpo.map((l) => normal(l[col.situacao as number])).filter(Boolean);
  const colunaDeMarcacao = valoresSit.length > 0 && valoresSit.filter((v) => /^(yes|y|sim|s|ok|x)$/.test(v)).length >= valoresSit.length * 0.3;

  const alunos: AlunoDaPlanilha[] = [];
  const problemas: Leitura['problemas'] = [];
  const desconhecidas = new Set<string>();
  const vistas = new Map<string, number>();

  corpo.forEach((l, k) => {
    const numero = h + 2 + k;
    if (soVazio(l)) return;
    const { nome, menor, online: onlineNoNome } = limpaNome(texto(l, col.nome));
    if (!nome) {
      if (texto(l, col.codigo) || texto(l, col.situacao)) problemas.push({ linha: numero, motivo: 'sem nome do aluno' });
      return;
    }
    const telBruto = texto(l, col.telefone);
    const telefone = telefoneDaPlanilha(telBruto);
    if (telBruto && !telefone) problemas.push({ linha: numero, motivo: `${nome}: telefone que não entendi (${telBruto})` });
    const respBruto = texto(l, col.responsavelTelefone);
    const responsavelTelefone = telefoneDaPlanilha(respBruto);
    if (respBruto && !responsavelTelefone) problemas.push({ linha: numero, motivo: `${nome}: telefone do responsável que não entendi (${respBruto})` });
    const sitBruta = texto(l, col.situacao);
    const sit = col.situacao === undefined ? { situacao: 'ativo' as const, marcou: null, reconhecida: true } : lerSituacao(sitBruta, colunaDeMarcacao);
    if (!sit.reconhecida) desconhecidas.add(sitBruta);
    const livroBruto = texto(l, col.nivel);
    const livro = leLivro(livroBruto);
    const curso = texto(l, col.trilha);
    const horarioFixoTexto = texto(l, col.horarioFixo);
    const a: AlunoDaPlanilha = {
      chave: '', linha: numero, nome, menor, telefone,
      responsavelNome: texto(l, col.responsavelNome), responsavelTelefone,
      email: texto(l, col.email).toLowerCase(),
      documento: texto(l, col.documento).replace(/\D/g, ''),
      codigo: texto(l, col.codigo).replace(/\.0+$/, ''),
      nivel: livro.nivel || (livro.tipo === 'particular' ? 'Particular' : livroBruto),
      livroOriginal: livroBruto,
      tipoCurso: livroBruto ? livro.tipo : null,
      professorDoLivro: livro.professor,
      licao: lerLicao(texto(l, col.licao)),
      trilha: livro.kids || /\bkid|infantil|crianca|junior/.test(normal(curso)) ? 'kids' : 'adultos',
      situacao: sit.situacao,
      ativo: sit.situacao === 'ativo',
      marcouSemana: sit.situacao === 'ativo' ? sit.marcou : null,
      horarioFixoTexto,
      horariosFixos: leHorarioFixo(horarioFixoTexto),
      temFixo: lerSimNao(texto(l, col.temFixo)),
      modalidade: lerModalidade(texto(l, col.modalidade)) ?? (livro.online || onlineNoNome ? 'online' : null),
      saude: lerClassificacao(texto(l, col.classificacao)),
      appAtivo: lerSimNao(texto(l, col.app)),
      nexiaAtivo: lerSimNao(texto(l, col.nexia)),
      pendenciaLivro: lerSimNao(texto(l, col.pendenciaLivro)),
      contratoFim: lerData(texto(l, col.contratoFim)),
      contratoAssinado: lerSimNao(texto(l, col.contratoAssinado)),
      observacao: texto(l, col.observacao),
    };
    a.chave = chaveDe(a);
    const antes = vistas.get(a.chave);
    if (antes) { problemas.push({ linha: numero, motivo: `${nome} aparece de novo (código repetido, já está na linha ${antes}); fica a primeira` }); return; }
    vistas.set(a.chave, numero);
    alunos.push(a);
  });
  return { cabecalho, linhaCabecalho: h + 1, colunas: col, colunaDeMarcacao, alunos, problemas, situacoesDesconhecidas: [...desconhecidas].slice(0, 10) };
}

/** As contas que a planilha da escola faz no painel de cima, feitas certo (a planilha
    conta só até a linha 144 e desconta duas vezes). */
export function contas(alunos: Pick<AlunoDaPlanilha, 'situacao' | 'marcouSemana' | 'horariosFixos' | 'temFixo'>[]) {
  const ativos = alunos.filter((a) => a.situacao === 'ativo');
  return {
    total: alunos.length,
    ativos: ativos.length,
    marcaram: ativos.filter((a) => a.marcouSemana === true).length,
    naoMarcaram: ativos.filter((a) => a.marcouSemana === false).length,
    trancados: alunos.filter((a) => a.situacao === 'trancado').length,
    off: alunos.filter((a) => a.situacao === 'off').length,
    obs: alunos.filter((a) => a.situacao === 'obs').length,
    inativos: alunos.filter((a) => a.situacao === 'inativo').length,
    comFixo: ativos.filter((a) => a.temFixo === true || a.horariosFixos.length > 0).length,
  };
}

/* ---------------- o que muda no sistema ---------------- */

export interface AlunoDoSistema {
  id: string;
  nome: string;
  telefone?: string;
  responsavelNome?: string;
  responsavelTelefone?: string;
  email?: string;
  documento?: string;
  codigo?: string;
  nivel?: string;
  licao?: number;
  trilha?: 'adultos' | 'kids';
  ativo: boolean;
  situacao?: SituacaoAluno;
  observacao?: string;
  planilhaChave?: string;
  teste?: boolean;
  [campo: string]: unknown;
}

export type CamposDoAluno = Record<string, unknown> & { nome?: string; ativo?: boolean };

export interface Plano {
  novos: (CamposDoAluno & { nome: string })[];
  atualizados: { id: string; nome: string; campos: CamposDoAluno; mudou: string[] }[];
  iguais: number;
  foraDaPlanilha: { id: string; nome: string }[];
}

/** Os campos que a planilha manda: só das colunas que existem e só o que não está vazio. */
function camposDa(a: AlunoDaPlanilha, col: Partial<Record<Campo, number>>, colunaDeMarcacao: boolean): CamposDoAluno {
  const c: CamposDoAluno = { nome: a.nome };
  const poe = (k: string, v: unknown) => { if (v !== '' && v !== null && v !== undefined) c[k] = v; };
  poe('telefone', a.telefone);
  poe('responsavelNome', a.responsavelNome);
  poe('responsavelTelefone', a.responsavelTelefone);
  poe('email', a.email);
  poe('documento', a.documento);
  poe('codigo', a.codigo);
  poe('nivel', a.nivel);
  poe('livroOriginal', a.livroOriginal);
  poe('tipoCurso', a.tipoCurso);
  poe('professorDoLivro', a.professorDoLivro);
  poe('licao', a.licao);
  if (col.trilha !== undefined || col.nivel !== undefined) c.trilha = a.trilha;
  if (col.nome !== undefined) c.menor = a.menor;
  if (col.situacao !== undefined) { c.situacao = a.situacao; c.ativo = a.ativo; }
  if (colunaDeMarcacao) c.marcouSemana = a.marcouSemana;
  if (col.horarioFixo !== undefined) {
    poe('horarioFixoTexto', a.horarioFixoTexto);
    if (a.horarioFixoTexto) c.horariosFixos = a.horariosFixos;
  }
  poe('temFixo', a.temFixo);
  poe('modalidade', a.modalidade);
  poe('saude', a.saude);
  poe('appAtivo', a.appAtivo);
  poe('nexiaAtivo', a.nexiaAtivo);
  poe('pendenciaLivro', a.pendenciaLivro);
  poe('contratoFim', a.contratoFim);
  poe('contratoAssinado', a.contratoAssinado);
  poe('observacao', a.observacao);
  return c;
}

const primeiroNome = (n: string) => normal(n).split(' ')[0] || '';
const igual = (x: unknown, y: unknown) => JSON.stringify(x ?? '') === JSON.stringify(y ?? '');

/**
 * Compara a planilha com os alunos do sistema. Reencontra o aluno pela chave guardada,
 * pelo código, depois pelo telefone com o mesmo primeiro nome, depois pelo nome inteiro
 * (se só um aluno tem aquele nome). Aluno de teste fica de fora.
 */
export function planeja(leitura: Leitura, existentes: AlunoDoSistema[]): Plano {
  const reais = existentes.filter((e) => !e.teste);
  const livres = new Set(reais.map((e) => e.id));
  const plano: Plano = { novos: [], atualizados: [], iguais: 0, foraDaPlanilha: [] };
  const porNome = new Map<string, AlunoDoSistema[]>();
  for (const e of reais) porNome.set(normal(e.nome), [...(porNome.get(normal(e.nome)) || []), e]);

  for (const a of leitura.alunos) {
    const pega = (e?: AlunoDoSistema) => (e && livres.has(e.id) ? e : undefined);
    const igualNome = porNome.get(normal(a.nome)) || [];
    const achado = pega(reais.find((e) => e.planilhaChave === a.chave))
      || pega(a.codigo ? reais.find((e) => livres.has(e.id) && e.codigo && normal(e.codigo) === normal(a.codigo)) : undefined)
      || pega(a.telefone ? reais.find((e) => livres.has(e.id) && mesmoTelefone(e.telefone, a.telefone) && primeiroNome(e.nome) === primeiroNome(a.nome)) : undefined)
      || pega(igualNome.length === 1 ? igualNome[0] : undefined);
    const campos: CamposDoAluno = { ...camposDa(a, leitura.colunas, leitura.colunaDeMarcacao), planilhaChave: a.chave, linhaPlanilha: a.linha, origem: 'planilha' };
    if (!achado) {
      plano.novos.push({
        ...campos, nome: a.nome, ativo: (campos.ativo as boolean | undefined) ?? true, situacao: campos.situacao ?? 'ativo',
        trilha: campos.trilha ?? 'adultos', nivel: campos.nivel ?? '', licao: campos.licao ?? 0, telefone: campos.telefone ?? '',
      });
      continue;
    }
    livres.delete(achado.id);
    const mudou = Object.keys(campos)
      .filter((k) => k !== 'linhaPlanilha' && k !== 'origem' && k !== 'planilhaChave')
      .filter((k) => k === 'telefone' || k === 'responsavelTelefone'
        ? !mesmoTelefone(String(achado[k] || ''), String(campos[k] || ''))
        : !igual(achado[k], campos[k]));
    if (mudou.length || achado.planilhaChave !== a.chave) plano.atualizados.push({ id: achado.id, nome: a.nome, campos, mudou });
    else plano.iguais += 1;
  }
  plano.foraDaPlanilha = reais.filter((e) => livres.has(e.id) && e.planilhaChave).map((e) => ({ id: e.id, nome: e.nome }));
  return plano;
}

/* ---------------- conversas ---------------- */

/** Os alunos que o nome do contato no WhatsApp parece ser: todas as palavras do nome do
    contato (ao menos duas, a primeira igual) estão no nome do aluno. */
export function alunosPeloNome<A extends { id: string; nome: string }>(nomeDoContato: string, alunos: A[]): A[] {
  const palavras = normal(nomeDoContato).split(' ').filter((p) => p.length >= 2);
  if (palavras.length < 2) return [];
  return alunos.filter((a) => {
    const doAluno = normal(a.nome).split(' ');
    return doAluno[0] === palavras[0] && palavras.every((p) => doAluno.includes(p));
  });
}

/** Sugestões para ligar a conversa à mão: quem bate pelo nome, e depois quem tem o
    mesmo primeiro nome e mais uma palavra em comum. */
export function sugereAlunos<A extends { id: string; nome: string; ativo: boolean }>(nomeDoContato: string, alunos: A[], n = 3): A[] {
  const pelo = alunosPeloNome(nomeDoContato, alunos);
  const palavras = normal(nomeDoContato).split(' ').filter((p) => p.length >= 2);
  if (!palavras.length) return pelo.slice(0, n);
  const parecidos = alunos
    .filter((a) => !pelo.includes(a))
    .map((a) => {
      const doAluno = normal(a.nome).split(' ');
      const comuns = palavras.filter((p) => doAluno.includes(p)).length;
      return { a, nota: (doAluno[0] === palavras[0] ? 2 : 0) + comuns + (a.ativo ? 0.5 : 0) };
    })
    .filter((x) => x.nota >= 3)
    .sort((x, y) => y.nota - x.nota)
    .map((x) => x.a);
  return [...pelo, ...parecidos].slice(0, n);
}

/** As conversas ainda sem aluno que se ligam a um aluno: pelo telefone (do aluno ou do
    responsável) e, quando a planilha não tem telefone, pelo nome do contato no WhatsApp
    se só um aluno bate. */
export function vinculaConversas(
  conversas: { id: string; waId: string; nome?: string; alunoId?: string | null }[],
  alunos: { id: string; nome: string; telefone?: string; responsavelTelefone?: string; ativo: boolean }[],
): { conversaId: string; alunoId: string; como: 'telefone' | 'nome' }[] {
  const saida: { conversaId: string; alunoId: string; como: 'telefone' | 'nome' }[] = [];
  for (const c of conversas) {
    if (c.alunoId) continue;
    const pelofone = alunosDoContato(alunos, { waId: c.waId });
    if (pelofone[0]) { saida.push({ conversaId: c.id, alunoId: pelofone[0].id, como: 'telefone' }); continue; }
    const pelonome = alunosPeloNome(c.nome || '', alunos);
    if (pelonome.length === 1) saida.push({ conversaId: c.id, alunoId: pelonome[0].id, como: 'nome' });
  }
  return saida;
}

/** Ao ligar a conversa à mão, o telefone dela fica no aluno (se ele ainda não tem): no
    menor de idade e no Kids, como telefone do responsável. Assim a próxima conversa desse
    número já chega ligada. */
export function telefoneParaGuardar(
  a: { telefone?: string; responsavelTelefone?: string; menor?: boolean; trilha?: string },
  waId: string,
): { campo: 'telefone' | 'responsavelTelefone'; valor: string } | null {
  if (!waId || mesmoTelefone(a.telefone, waId) || mesmoTelefone(a.responsavelTelefone, waId)) return null;
  const doResponsavel = a.menor === true || a.trilha === 'kids';
  if (doResponsavel) return a.responsavelTelefone ? null : { campo: 'responsavelTelefone', valor: waId };
  return a.telefone ? null : { campo: 'telefone', valor: waId };
}

/** O id da planilha a partir do link que a pessoa cola (ou do próprio id). */
export function idDaPlanilha(link: string): string {
  const m = /\/spreadsheets\/d\/([a-zA-Z0-9_-]{20,})/.exec(link || '');
  if (m) return m[1];
  const t = (link || '').trim();
  return /^[a-zA-Z0-9_-]{20,}$/.test(t) ? t : '';
}
