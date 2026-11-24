/* A planilha de alunos dentro do sistema: as regras puras.
   A lista de alunos mora aqui e se edita como planilha, com as colunas da aba ATIVOS que
   a escola já conhece (COD, nome, yes, horário, BOOK...). Cada célula editada vira os
   mesmos campos que a importação grava: o BOOK escrito vira nível, tipo e professor; o
   horário escrito à mão vira dia e hora; a situação decide quem é ativo.
   Toda semana a recepção começa a marcação nova: o sistema guarda quem marcou e quem não
   marcou e limpa a coluna "Marcou" dos ativos, como a escola fazia apagando os "yes".
   Prova: node --experimental-strip-types testes/alunos.ts */
import {
  NOME_DA_SITUACAO, leHorarioFixo, leLivro, lerData, limpaNome, normal, telefoneDaPlanilha,
  type ModalidadeDoAluno, type Saude, type SituacaoAluno, type TipoDeCurso,
} from './planilha.ts';

/** O aluno como a planilha interna lê e grava (os campos de Aluno em tipos.ts). */
export interface AlunoDaGrade {
  id: string;
  nome: string;
  codigo?: string;
  menor?: boolean;
  ativo: boolean;
  situacao?: SituacaoAluno;
  marcouSemana?: boolean | null;
  horarioFixoTexto?: string;
  horariosFixos?: { dia: number; hora: string }[];
  temFixo?: boolean | null;
  livroOriginal?: string;
  nivel?: string;
  tipoCurso?: TipoDeCurso | null;
  professorDoLivro?: string;
  trilha?: 'adultos' | 'kids';
  modalidade?: ModalidadeDoAluno | null;
  saude?: Saude | null;
  appAtivo?: boolean | null;
  nexiaAtivo?: boolean | null;
  pendenciaLivro?: boolean | null;
  contratoFim?: string;
  contratoAssinado?: boolean | null;
  telefone?: string;
  responsavelNome?: string;
  responsavelTelefone?: string;
  email?: string;
  nascimento?: string;      // AAAA-MM-DD
  documento?: string;       // CPF só com os números
  observacao?: string;
  teste?: boolean;
}

export type ColunaDaGrade =
  | 'codigo' | 'nome' | 'menor' | 'marcouSemana' | 'situacao' | 'horarioFixoTexto' | 'livroOriginal' | 'modalidade' | 'saude'
  | 'appAtivo' | 'nexiaAtivo' | 'pendenciaLivro' | 'contratoFim' | 'contratoAssinado' | 'telefone' | 'responsavelNome'
  | 'responsavelTelefone' | 'email' | 'nascimento' | 'documento' | 'observacao';

export type TipoDaColuna = 'texto' | 'longo' | 'sim' | 'situacao' | 'modalidade' | 'saude' | 'data' | 'telefone' | 'email' | 'documento';

export interface DefinicaoDaColuna { k: ColunaDaGrade; rotulo: string; tipo: TipoDaColuna; largura: number; dica?: string }

/* Todas as colunas que a planilha sabe mostrar, com a largura de partida (cada pessoa
   arrasta a borda e a largura fica guardada no aparelho). O nome que a escola usa na aba
   ATIVOS vai entre parênteses na dica. */
const DEFINICOES: DefinicaoDaColuna[] = [
  { k: 'codigo', rotulo: 'Cód.', tipo: 'texto', largura: 64, dica: 'COD' },
  { k: 'nome', rotulo: 'Aluno', tipo: 'texto', largura: 250, dica: 'NOME: escreva " - menor" no fim se for menor de idade' },
  { k: 'menor', rotulo: 'Menor', tipo: 'sim', largura: 64, dica: 'quem fala no WhatsApp é o responsável' },
  { k: 'marcouSemana', rotulo: 'Marcou', tipo: 'sim', largura: 72, dica: 'yes: marcou a aula da semana seguinte' },
  { k: 'situacao', rotulo: 'Situação', tipo: 'situacao', largura: 116, dica: 'ativo, trancado, off ou obs' },
  { k: 'horarioFixoTexto', rotulo: 'Horário fixo', tipo: 'texto', largura: 180, dica: 'ei: como "quartas às 13h30"' },
  { k: 'livroOriginal', rotulo: 'Livro', tipo: 'texto', largura: 170, dica: 'BOOK: como "A2 PRIVATE NATHAN"' },
  { k: 'modalidade', rotulo: 'Modalidade', tipo: 'modalidade', largura: 120 },
  { k: 'saude', rotulo: 'Classificação', tipo: 'saude', largura: 124 },
  { k: 'appAtivo', rotulo: 'App', tipo: 'sim', largura: 60 },
  { k: 'nexiaAtivo', rotulo: 'Nex-IA', tipo: 'sim', largura: 70 },
  { k: 'pendenciaLivro', rotulo: 'Falta livro', tipo: 'sim', largura: 80 },
  { k: 'contratoFim', rotulo: 'Fim do contrato', tipo: 'data', largura: 120 },
  { k: 'contratoAssinado', rotulo: 'Contrato assinado', tipo: 'sim', largura: 82 },
  { k: 'telefone', rotulo: 'Telefone', tipo: 'telefone', largura: 150 },
  { k: 'email', rotulo: 'E-mail', tipo: 'email', largura: 210 },
  { k: 'nascimento', rotulo: 'Nascimento', tipo: 'data', largura: 112 },
  { k: 'documento', rotulo: 'CPF', tipo: 'documento', largura: 130 },
  { k: 'responsavelNome', rotulo: 'Responsável', tipo: 'texto', largura: 170 },
  { k: 'responsavelTelefone', rotulo: 'Tel. responsável', tipo: 'telefone', largura: 150 },
  { k: 'observacao', rotulo: 'Observação', tipo: 'longo', largura: 280, dica: 'OBSERVAÇÕES' },
];

export const COLUNA: Record<ColunaDaGrade, DefinicaoDaColuna> = Object.fromEntries(DEFINICOES.map((d) => [d.k, d])) as Record<ColunaDaGrade, DefinicaoDaColuna>;

/** A planilha de marcação (pedido do cliente, 24/11/2026): a observação ao lado do nome,
    o horário fixo no fim, o menor de idade no próprio nome, sem "falta livro" e sem os
    telefones, que moram no cadastro. As duas primeiras ficam presas na rolagem. */
export const COLUNAS_DA_MARCACAO: ColunaDaGrade[] = [
  'codigo', 'nome', 'observacao', 'marcouSemana', 'situacao', 'livroOriginal', 'modalidade', 'saude',
  'appAtivo', 'nexiaAtivo', 'contratoFim', 'contratoAssinado', 'horarioFixoTexto',
];

/** O cadastro: quem é o aluno e como falar com ele. */
export const COLUNAS_DO_CADASTRO: ColunaDaGrade[] = [
  'codigo', 'nome', 'situacao', 'telefone', 'email', 'responsavelNome', 'responsavelTelefone', 'nascimento', 'documento',
  'livroOriginal', 'modalidade', 'contratoFim', 'contratoAssinado', 'horarioFixoTexto', 'observacao',
];

export const NOME_DA_MODALIDADE: Record<ModalidadeDoAluno, string> = { presencial: 'Presencial', online: 'Online', hibrido: 'Híbrido' };
export const NOME_DA_SAUDE: Record<Saude, string> = { evoluindo: 'Evoluindo', atencao: 'Atenção', critico: 'Crítico' };
export const SITUACOES: SituacaoAluno[] = ['ativo', 'trancado', 'off', 'obs', 'inativo'];

/** A data de AAAA-MM-DD em dd/mm/aaaa: no fim do contrato o ano importa. */
export function dataCompleta(iso: string | undefined | null): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}

export const situacaoDoAluno = (a: Pick<AlunoDaGrade, 'situacao' | 'ativo'>): SituacaoAluno => a.situacao ?? (a.ativo ? 'ativo' : 'inativo');

const igual = (x: unknown, y: unknown) => JSON.stringify(x ?? null) === JSON.stringify(y ?? null);
const texto = (v: string | boolean) => String(v).replace(/\s+/g, ' ').trim();

export type Edicao = { campos: Record<string, unknown> } | { erro: string };

/**
 * O que gravar quando alguém muda uma célula. Devolve só o que mudou de fato (vazio se
 * nada mudou) ou o erro para mostrar na hora. Célula apagada grava null: na planilha
 * interna, apagar é apagar (diferente da importação, onde célula vazia não apaga nada).
 */
export function camposEditados(coluna: ColunaDaGrade, valor: string | boolean, aluno: AlunoDaGrade, todos: AlunoDaGrade[] = []): Edicao {
  const c: Record<string, unknown> = {};
  const t = typeof valor === 'string' ? texto(valor) : '';
  const sim = valor === true || (typeof valor === 'string' && /^(true|sim|1)$/i.test(valor));

  switch (coluna) {
    case 'nome': {
      /* o " - menor" no fim do nome é a marca, como na planilha: escrever põe, apagar tira */
      const { nome, menor, online } = limpaNome(valor);
      if (!nome) return { erro: 'O aluno precisa de nome.' };
      c.nome = nome;
      if (menor !== Boolean(aluno.menor)) c.menor = menor;
      if (online) c.modalidade = 'online';
      break;
    }
    case 'codigo': {
      const cod = t.replace(/\.0+$/, '');
      const dono = cod ? todos.find((o) => o.id !== aluno.id && !o.teste && o.codigo && normal(o.codigo) === normal(cod)) : undefined;
      if (dono) return { erro: `O código ${cod} já é de ${dono.nome}.` };
      c.codigo = cod || null;
      break;
    }
    case 'situacao': {
      const s = SITUACOES.find((x) => x === valor || normal(NOME_DA_SITUACAO[x]) === normal(valor));
      if (!s) return { erro: 'Situação que não conheço.' };
      c.situacao = s;
      c.ativo = s === 'ativo';
      c.marcouSemana = s === 'ativo' ? (aluno.marcouSemana ?? false) : null;
      break;
    }
    case 'marcouSemana':
      if (situacaoDoAluno(aluno) !== 'ativo') return { erro: 'Só aluno ativo marca a aula da semana. Mude a situação primeiro.' };
      c.marcouSemana = sim;
      break;
    case 'horarioFixoTexto': {
      const lista = leHorarioFixo(t);
      c.horarioFixoTexto = t || null;
      c.horariosFixos = lista;
      c.temFixo = lista.length > 0 || (Boolean(t) && aluno.temFixo === true);
      break;
    }
    case 'livroOriginal': {
      const livro = leLivro(t);
      c.livroOriginal = t || null;
      c.nivel = t ? livro.nivel || (livro.tipo === 'particular' ? 'Particular' : t) : '';
      c.tipoCurso = t ? livro.tipo : null;
      c.professorDoLivro = livro.professor || null;
      c.trilha = livro.kids ? 'kids' : 'adultos';
      if (livro.online && !aluno.modalidade) c.modalidade = 'online';
      break;
    }
    case 'modalidade': {
      if (t && !(t in NOME_DA_MODALIDADE)) return { erro: 'Modalidade que não conheço.' };
      c.modalidade = t || null;
      break;
    }
    case 'saude': {
      if (t && !(t in NOME_DA_SAUDE)) return { erro: 'Classificação que não conheço.' };
      c.saude = t || null;
      break;
    }
    case 'contratoFim': {
      const d = lerData(t);
      if (t && !d) return { erro: 'Data que não entendi. Use dia, mês e ano, como 30/06/2027.' };
      c.contratoFim = d || null;
      break;
    }
    case 'nascimento': {
      /* ano com dois números: 90 é 1990, 08 é 2008 */
      const curto = /^(\d{1,2}\/\d{1,2}\/)(\d{2})$/.exec(t);
      const d = lerData(curto ? `${curto[1]}${Number(curto[2]) > 30 ? '19' : '20'}${curto[2]}` : t);
      if (t && !d) return { erro: 'Data que não entendi. Use dia, mês e ano, como 14/03/2010.' };
      c.nascimento = d || null;
      break;
    }
    case 'email': {
      const e = t.toLowerCase();
      if (e && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return { erro: 'E-mail que não entendi. Confira se tem @ e o domínio, como nome@gmail.com.' };
      c.email = e || null;
      break;
    }
    case 'documento': {
      const n = t.replace(/\D/g, '');
      if (t && n.length !== 11) return { erro: 'O CPF tem 11 números, como 123.456.789-01.' };
      c.documento = n || null;
      break;
    }
    case 'telefone':
    case 'responsavelTelefone': {
      const f = telefoneDaPlanilha(t);
      if (t && !f) return { erro: 'Telefone que não entendi. Use DDD e número, como 49 99912-3456.' };
      c[coluna] = f || (coluna === 'telefone' ? '' : null);
      break;
    }
    case 'responsavelNome':
      c.responsavelNome = t || null;
      break;
    case 'observacao':
      c.observacao = typeof valor === 'string' ? valor.replace(/[ \t]+/g, ' ').trim() || null : null;
      break;
    case 'menor':
    case 'appAtivo':
    case 'nexiaAtivo':
    case 'pendenciaLivro':
    case 'contratoAssinado':
      c[coluna] = sim;
      break;
  }
  const mudou: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(c)) {
    const atual = (aluno as unknown as Record<string, unknown>)[k];
    /* nulo e campo que não existe são a mesma coisa; texto vazio no telefone também */
    if (!igual(atual === '' ? null : atual, v === '' ? null : v)) mudou[k] = v;
  }
  return { campos: mudou };
}

/** O CPF escrito como se lê: 123.456.789-01. */
export const cpfLegivel = (n: string | undefined | null) => {
  const d = String(n || '').replace(/\D/g, '');
  return d.length === 11 ? `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}` : String(n || '');
};

/** O texto de uma célula para editar (o que a pessoa vê e muda). */
export function valorDaCelula(coluna: ColunaDaGrade, a: AlunoDaGrade): string {
  const v = (a as unknown as Record<string, unknown>)[coluna];
  if (coluna === 'situacao') return situacaoDoAluno(a);
  if (coluna === 'nome') return `${a.nome}${a.menor ? ' - menor' : ''}`;
  if (coluna === 'documento') return cpfLegivel(a.documento);
  if (v === null || v === undefined) return '';
  return String(v);
}

/** Um aluno novo, criado na planilha interna. */
export function novoAluno(nomeDigitado: string, agora: string): Edicao {
  const { nome, menor, online } = limpaNome(nomeDigitado);
  if (!nome) return { erro: 'Escreva o nome do aluno.' };
  return {
    campos: {
      nome, menor, telefone: '', trilha: 'adultos', nivel: '', licao: 0,
      ativo: true, situacao: 'ativo', marcouSemana: false,
      ...(online ? { modalidade: 'online' } : {}),
      origem: 'sistema', criadoEm: agora, atualizadoEm: agora,
    },
  };
}

/** O que a ficha de cadastro manda: o texto de cada campo, e as caixas marcadas. */
export type FichaDoAluno = Partial<Record<ColunaDaGrade, string | boolean>>;

/**
 * O aluno cadastrado pela ficha da tela Cadastros: nasce ativo, sem marcar a semana, e
 * cada campo passa pela mesma regra da célula da planilha (código repetido não passa,
 * telefone e datas se leem igual). Erro diz em qual campo foi.
 */
export function cadastroDoAluno(ficha: FichaDoAluno, todos: AlunoDaGrade[], agora: string): Edicao {
  const base = novoAluno(String(ficha.nome ?? ''), agora);
  if ('erro' in base) return base;
  const campos: Record<string, unknown> = { ...base.campos };
  if (ficha.menor === true) campos.menor = true;
  let aluno = { id: '', ...campos } as unknown as AlunoDaGrade;
  for (const [k, v] of Object.entries(ficha) as [ColunaDaGrade, string | boolean][]) {
    if (k === 'nome' || k === 'menor' || v === '' || v === false || v === undefined) continue;
    const e = camposEditados(k, v, aluno, todos);
    if ('erro' in e) return { erro: `${COLUNA[k]?.rotulo || k}: ${e.erro}` };
    Object.assign(campos, e.campos);
    aluno = { ...aluno, ...e.campos } as AlunoDaGrade;
  }
  return { campos };
}

/** Uma aula da agenda vista pelo aluno que sai dela. */
export interface AulaComAlunos { id: string; inicio: string; alunoIds?: string[]; alunos?: { id: string }[] }

/**
 * Apagar aluno de vez (pedido do cliente, 24/11/2026): as aulas que já passaram ficam
 * como estão, porque são o histórico (presença e notas); das próximas o aluno sai, e a
 * aula que fica sem ninguém (a particular dele) sai da agenda. Devolve só as aulas que
 * mudam, com a lista nova de alunos.
 */
export function aulasSemOsAlunos<T extends AulaComAlunos>(ids: string[], aulas: T[], agora: string): { aula: T; alunoIds: string[]; alunos: NonNullable<T['alunos']>; vazia: boolean }[] {
  const fora = new Set(ids);
  const ja = Date.parse(agora);
  return aulas
    .filter((a) => Date.parse(a.inicio) > ja && (a.alunoIds || []).some((id) => fora.has(id)))
    .map((a) => ({
      aula: a,
      alunoIds: (a.alunoIds || []).filter((id) => !fora.has(id)),
      alunos: (a.alunos || []).filter((x) => !fora.has(x.id)) as NonNullable<T['alunos']>,
    }))
    .map((x) => ({ ...x, vazia: x.alunoIds.length === 0 }));
}

/* ---------------- a semana da marcação ---------------- */

export interface RegistroDaSemana {
  quando: string;            // quando a marcação nova começou (ISO)
  quem: string;
  ativos: number;
  marcaram: number;
  naoMarcaram: number;
  /** quem não marcou, para a recepção chamar e para o histórico */
  quemNaoMarcou: { id: string; nome: string; codigo: string }[];
}

/**
 * Fecha a semana e começa a próxima: guarda as contas e quem não marcou, e devolve os
 * alunos ativos que ficam com "Marcou" desmarcado. Quem não é ativo não entra.
 */
export function fechaSemana(alunos: AlunoDaGrade[], quando: string, quem: string): { registro: RegistroDaSemana; limpar: string[] } {
  const ativos = alunos.filter((a) => !a.teste && situacaoDoAluno(a) === 'ativo');
  const marcaram = ativos.filter((a) => a.marcouSemana === true);
  const nao = ativos.filter((a) => a.marcouSemana !== true)
    .map((a) => ({ id: a.id, nome: a.nome, codigo: a.codigo || '' }))
    .sort((x, y) => x.nome.localeCompare(y.nome, 'pt-BR'));
  return {
    registro: { quando, quem, ativos: ativos.length, marcaram: marcaram.length, naoMarcaram: nao.length, quemNaoMarcou: nao },
    limpar: ativos.filter((a) => a.marcouSemana !== false).map((a) => a.id),
  };
}

/** O id do registro da semana: a data e a hora em que começou, que ordena sozinho. */
export const idDaSemana = (quando: string) => quando.slice(0, 16).replace(/[-:T]/g, '');

/** Quantas horas faz desde a última virada (para avisar quem toca duas vezes). */
export function horasDesde(quando: string | undefined, agora: string): number | null {
  if (!quando) return null;
  return (Date.parse(agora) - Date.parse(quando)) / 3_600_000;
}
