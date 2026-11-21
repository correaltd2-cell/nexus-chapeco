/* A planilha de alunos do Google dentro do sistema: as regras puras.
   A escola mantém a lista de alunos numa planilha e continua mantendo; o sistema lê,
   reconhece as colunas pelo nome (a pessoa ajusta na tela se errar), compara com os
   alunos que já existem e diz o que vai mudar antes de mudar. Depois liga as conversas
   aos alunos pelo telefone, que é o que faltava para o "aluno não vinculado".
   Regras de propósito:
   - célula vazia nunca apaga o que o sistema já tem (planilha com buraco não desfaz cadastro);
   - aluno que sumiu da planilha não é apagado nem desativado: aparece na conta, para a escola ver;
   - sem coluna de situação, todo mundo da planilha é ativo; com ela, vazio também é ativo.
   Prova: node --experimental-strip-types testes/planilha.ts */
import { alunosDoContato, mesmoTelefone } from './contato.ts';

export type Campo =
  | 'nome' | 'telefone' | 'responsavelNome' | 'responsavelTelefone' | 'email' | 'documento'
  | 'codigo' | 'nivel' | 'licao' | 'trilha' | 'situacao' | 'observacao';

/** Os campos na ordem em que são reconhecidos: o mais específico primeiro, para
    "Telefone do responsável" não virar o telefone do aluno. */
export const CAMPOS: { campo: Campo; rotulo: string; obrigatorio?: boolean; apelidos: string[] }[] = [
  { campo: 'responsavelTelefone', rotulo: 'Telefone do responsável', apelidos: ['telefone do responsavel', 'celular do responsavel', 'whatsapp do responsavel', 'fone do responsavel', 'telefone responsavel', 'celular responsavel', 'whatsapp responsavel', 'contato do responsavel', 'telefone da mae', 'telefone do pai', 'celular da mae', 'celular do pai', 'tel responsavel', 'tel do responsavel', 'cel responsavel', 'cel do responsavel', 'fone responsavel'] },
  { campo: 'responsavelNome', rotulo: 'Nome do responsável', apelidos: ['nome do responsavel', 'responsavel', 'responsavel financeiro', 'nome da mae', 'nome do pai', 'mae', 'pai'] },
  { campo: 'email', rotulo: 'E-mail', apelidos: ['e mail', 'email', 'e mail do aluno', 'email do aluno'] },
  { campo: 'documento', rotulo: 'CPF', apelidos: ['cpf', 'cpf do aluno', 'documento'] },
  { campo: 'codigo', rotulo: 'Código ou matrícula', apelidos: ['matricula', 'codigo', 'cod', 'id', 'numero da matricula', 'n matricula', 'no matricula', 'ra', 'codigo do aluno'] },
  { campo: 'nome', rotulo: 'Nome do aluno', obrigatorio: true, apelidos: ['nome do aluno', 'nome completo', 'aluno', 'aluna', 'nome', 'estudante', 'alunos'] },
  { campo: 'telefone', rotulo: 'Telefone do aluno', apelidos: ['telefone do aluno', 'celular do aluno', 'whatsapp do aluno', 'whatsapp', 'whats', 'celular', 'telefone', 'fone', 'contato', 'tel', 'cel'] },
  { campo: 'nivel', rotulo: 'Nível', apelidos: ['nivel', 'nivel atual', 'livro', 'estagio', 'book', 'modulo', 'turma', 'stage'] },
  { campo: 'licao', rotulo: 'Lição', apelidos: ['licao', 'licao atual', 'lesson', 'unit', 'unidade', 'aula atual'] },
  { campo: 'trilha', rotulo: 'Curso (Adultos ou Kids)', apelidos: ['curso', 'trilha', 'programa', 'tipo de curso', 'categoria'] },
  { campo: 'situacao', rotulo: 'Situação (ativo ou não)', apelidos: ['situacao', 'status', 'ativo', 'situacao do aluno', 'situacao da matricula', 'status do aluno'] },
  { campo: 'observacao', rotulo: 'Observação', apelidos: ['observacao', 'observacoes', 'obs'] },
];

export const NOME_DO_CAMPO = Object.fromEntries(CAMPOS.map((c) => [c.campo, c.rotulo])) as Record<Campo, string>;

/** Mapa salvo: o nome da coluna de cada campo (o nome sobrevive a coluna mudar de lugar). */
export type Mapa = Partial<Record<Campo, string | null>>;

export const normal = (t: unknown) => String(t ?? '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ').trim();

/* colunas que nunca são campo de aluno, mesmo contendo uma palavra parecida */
const NUNCA = /^(data|dt|valor|mensalidade|vencimento|desconto|parcela|dia de)\b/;

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
        const i = cab.findIndex((h, j) => !usadas.has(j) && h && !NUNCA.test(h)
          && (exato ? h === apelido : ` ${h} `.includes(` ${apelido} `)));
        if (i >= 0) { achado[c.campo] = i; usadas.add(i); break; }
      }
    }
  }
  return achado;
}

/** A linha do cabeçalho: a primeira, entre as cinco de cima, com duas ou mais colunas
    conhecidas (há planilha com título em cima da tabela). */
export function linhaDoCabecalho(linhas: string[][]): number {
  for (let i = 0; i < Math.min(5, linhas.length); i += 1) {
    if (Object.keys(reconheceColunas(linhas[i] || [])).length >= 2) return i;
  }
  return Math.max(0, linhas.findIndex((l) => l.some((c) => String(c ?? '').trim())));
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

const INATIVO = /\b(inativ\w*|cancel\w*|tranc\w*|desist\w*|conclu\w*|formad\w*|encerr\w*|finaliz\w*|evadid\w*|saiu|parad\w*|pausad\w*|nao|n|false|0|ex aluno|exaluno)\b/;
const ATIVO = /\b(ativ\w*|sim|s|matriculad\w*|cursando|andamento|true|1|ok|regular)\b/;

/** A situação diz se o aluno está ativo. Vazio é ativo; o que não reconhece também, com aviso. */
export function lerSituacao(bruto: unknown): { ativo: boolean; reconhecida: boolean } {
  const t = normal(bruto);
  if (!t) return { ativo: true, reconhecida: true };
  /* a primeira palavra manda: "Ativo (não pagou)" é ativo, "Inativo" e "Não ativo" não */
  if (/^(inativ|nao ativ|desativ)/.test(t)) return { ativo: false, reconhecida: true };
  if (/^ativ/.test(t)) return { ativo: true, reconhecida: true };
  if (INATIVO.test(t)) return { ativo: false, reconhecida: true };
  if (ATIVO.test(t)) return { ativo: true, reconhecida: true };
  return { ativo: true, reconhecida: false };
}

/** "L12", "Lição 12", "12" viram 12; fora de 1 a 20, nada. */
export function lerLicao(bruto: unknown): number | null {
  const m = /(\d{1,2})/.exec(String(bruto ?? ''));
  const n = m ? Number(m[1]) : NaN;
  return n >= 1 && n <= 20 ? n : null;
}

/* ---------------- a linha vira aluno ---------------- */

export interface AlunoDaPlanilha {
  chave: string;
  linha: number;               // a linha na planilha, contando do 1, como a pessoa vê
  nome: string;
  telefone: string;
  responsavelNome: string;
  responsavelTelefone: string;
  email: string;
  documento: string;
  codigo: string;
  nivel: string;
  licao: number | null;
  trilha: 'adultos' | 'kids';
  ativo: boolean;
  observacao: string;
}

export interface Leitura {
  cabecalho: string[];
  linhaCabecalho: number;
  colunas: Partial<Record<Campo, number>>;
  alunos: AlunoDaPlanilha[];
  problemas: { linha: number; motivo: string }[];
  situacoesDesconhecidas: string[];
}

const texto = (linha: string[], i: number | undefined) => (i === undefined ? '' : String(linha[i] ?? '').replace(/\s+/g, ' ').trim());

/** A chave que reencontra o aluno na próxima leitura: código, CPF, ou nome com o fim do telefone. */
export function chaveDe(a: Pick<AlunoDaPlanilha, 'codigo' | 'documento' | 'nome' | 'telefone'>) {
  if (a.codigo) return `c:${normal(a.codigo)}`;
  if (a.documento.length === 11) return `d:${a.documento}`;
  return `n:${normal(a.nome)}|${a.telefone.slice(-8)}`;
}

export function lePlanilha(linhas: string[][], escolhido: Mapa = {}): Leitura {
  const h = linhaDoCabecalho(linhas);
  const cabecalho = (linhas[h] || []).map((c) => String(c ?? '').trim());
  const col = resolveMapa(cabecalho, escolhido);
  const alunos: AlunoDaPlanilha[] = [];
  const problemas: Leitura['problemas'] = [];
  const desconhecidas = new Set<string>();
  const vistas = new Map<string, number>();

  for (let i = h + 1; i < linhas.length; i += 1) {
    const l = (linhas[i] || []).map((c) => String(c ?? ''));
    if (!l.some((c) => c.trim())) continue;
    const numero = i + 1;
    const nome = texto(l, col.nome);
    if (!nome) { problemas.push({ linha: numero, motivo: 'sem nome do aluno' }); continue; }
    const telBruto = texto(l, col.telefone);
    const telefone = telefoneDaPlanilha(telBruto);
    if (telBruto && !telefone) problemas.push({ linha: numero, motivo: `${nome}: telefone que não entendi (${telBruto})` });
    const respBruto = texto(l, col.responsavelTelefone);
    const responsavelTelefone = telefoneDaPlanilha(respBruto);
    if (respBruto && !responsavelTelefone) problemas.push({ linha: numero, motivo: `${nome}: telefone do responsável que não entendi (${respBruto})` });
    const sit = lerSituacao(texto(l, col.situacao));
    if (!sit.reconhecida) desconhecidas.add(texto(l, col.situacao));
    const nivel = texto(l, col.nivel);
    const curso = texto(l, col.trilha);
    const a: AlunoDaPlanilha = {
      chave: '', linha: numero, nome, telefone,
      responsavelNome: texto(l, col.responsavelNome), responsavelTelefone,
      email: texto(l, col.email).toLowerCase(),
      documento: texto(l, col.documento).replace(/\D/g, ''),
      codigo: texto(l, col.codigo),
      nivel,
      licao: lerLicao(texto(l, col.licao)),
      trilha: /\bkid|infantil|crianca/.test(normal(`${curso} ${nivel}`)) ? 'kids' : 'adultos',
      ativo: sit.ativo,
      observacao: texto(l, col.observacao),
    };
    a.chave = chaveDe(a);
    const antes = vistas.get(a.chave);
    if (antes) { problemas.push({ linha: numero, motivo: `${nome} aparece de novo (já está na linha ${antes}); fica a primeira` }); continue; }
    vistas.set(a.chave, numero);
    alunos.push(a);
  }
  return { cabecalho, linhaCabecalho: h + 1, colunas: col, alunos, problemas, situacoesDesconhecidas: [...desconhecidas].slice(0, 10) };
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
  nivel?: string;
  licao?: number;
  trilha?: 'adultos' | 'kids';
  ativo: boolean;
  observacao?: string;
  planilhaChave?: string;
  teste?: boolean;
}

export type CamposDoAluno = Partial<Omit<AlunoDoSistema, 'id' | 'teste'>> & { linhaPlanilha?: number; origem?: 'planilha' };

export interface Plano {
  novos: (CamposDoAluno & { nome: string })[];
  atualizados: { id: string; nome: string; campos: CamposDoAluno; mudou: string[] }[];
  iguais: number;
  foraDaPlanilha: { id: string; nome: string }[];
}

/** Os campos que a planilha manda, só das colunas que existem e só o que não está vazio. */
function camposDa(a: AlunoDaPlanilha, col: Partial<Record<Campo, number>>): CamposDoAluno {
  const c: CamposDoAluno = { nome: a.nome };
  if (a.telefone) c.telefone = a.telefone;
  if (a.responsavelNome) c.responsavelNome = a.responsavelNome;
  if (a.responsavelTelefone) c.responsavelTelefone = a.responsavelTelefone;
  if (a.email) c.email = a.email;
  if (a.documento) c.documento = a.documento;
  if (a.nivel) c.nivel = a.nivel;
  if (a.licao !== null) c.licao = a.licao;
  if (col.trilha !== undefined || col.nivel !== undefined) c.trilha = a.trilha;
  if (col.situacao !== undefined) c.ativo = a.ativo;
  if (a.observacao) c.observacao = a.observacao;
  return c;
}

const primeiroNome = (n: string) => normal(n).split(' ')[0] || '';

/**
 * Compara a planilha com os alunos do sistema. Reencontra o aluno pela chave guardada,
 * depois pelo telefone com o mesmo primeiro nome, depois pelo nome inteiro (se só um
 * aluno tem aquele nome). Aluno de teste fica de fora.
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
      || pega(a.telefone ? reais.find((e) => livres.has(e.id) && mesmoTelefone(e.telefone, a.telefone) && primeiroNome(e.nome) === primeiroNome(a.nome)) : undefined)
      || pega(igualNome.length === 1 ? igualNome[0] : undefined);
    const campos = { ...camposDa(a, leitura.colunas), planilhaChave: a.chave, linhaPlanilha: a.linha, origem: 'planilha' as const };
    if (!achado) {
      plano.novos.push({ ...campos, nome: a.nome, ativo: campos.ativo ?? true, trilha: campos.trilha || 'adultos', nivel: campos.nivel || '', licao: campos.licao || 1, telefone: campos.telefone || '' });
      continue;
    }
    livres.delete(achado.id);
    const mudou = (Object.keys(campos) as (keyof CamposDoAluno)[])
      .filter((k) => k !== 'linhaPlanilha' && k !== 'origem' && k !== 'planilhaChave')
      .filter((k) => k === 'telefone' || k === 'responsavelTelefone'
        ? !mesmoTelefone(String(achado[k as keyof AlunoDoSistema] || ''), String(campos[k] || ''))
        : (achado[k as keyof AlunoDoSistema] ?? '') !== (campos[k] ?? ''));
    if (mudou.length || achado.planilhaChave !== a.chave) plano.atualizados.push({ id: achado.id, nome: a.nome, campos, mudou });
    else plano.iguais += 1;
  }
  plano.foraDaPlanilha = reais.filter((e) => livres.has(e.id) && e.planilhaChave).map((e) => ({ id: e.id, nome: e.nome }));
  return plano;
}

/** As conversas ainda sem aluno que o telefone liga a um aluno ativo. */
export function vinculaConversas(
  conversas: { id: string; waId: string; alunoId?: string | null }[],
  alunos: { id: string; telefone?: string; responsavelTelefone?: string; ativo: boolean }[],
): { conversaId: string; alunoId: string }[] {
  const saida: { conversaId: string; alunoId: string }[] = [];
  for (const c of conversas) {
    if (c.alunoId) continue;
    const achados = alunosDoContato(alunos, { waId: c.waId });
    if (achados[0]) saida.push({ conversaId: c.id, alunoId: achados[0].id });
  }
  return saida;
}

/** O id da planilha a partir do link que a pessoa cola (ou do próprio id). */
export function idDaPlanilha(link: string): string {
  const m = /\/spreadsheets\/d\/([a-zA-Z0-9_-]{20,})/.exec(link || '');
  if (m) return m[1];
  const t = (link || '').trim();
  return /^[a-zA-Z0-9_-]{20,}$/.test(t) ? t : '';
}
