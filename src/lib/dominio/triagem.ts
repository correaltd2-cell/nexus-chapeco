/* O que a conversa quer, lido do texto. Serve para duas coisas: mandar a conversa
   para o setor certo e ABRIR A TAREFA no quadro sem ninguem digitar.

   A regra é somar sinais, nao casar palavra solta: "fatura" sozinho é fraco,
   "segunda via da fatura" é forte. So abre tarefa com sinal forte; na duvida nao
   abre nada, porque quadro cheio de cartao errado ninguem olha. A IA nunca vende
   nem fecha matricula: ela abre a tarefa e chama gente. */
import type { Cartao, Lista, Quadro, Setor } from './tipos';

export type Assunto =
  | 'matricula' | 'cancelamento' | 'financeiro'
  | 'reposicao' | 'marcacao' | 'prova' | 'pedagogico';

interface Regra {
  setor: Setor;
  rotulo: string;        // o nome do assunto na tela e no titulo da tarefa
  etiqueta?: string;     // etiqueta do cartao, das que a escola ja usa
  quadro: string;        // quadro preferido, pelo nome
  lista?: string;        // lista preferida dentro dele
  peso?: number;         // quanto vale um sinal forte deste assunto
  fortes: string[];
  fracos: string[];
}

/* As palavras vao sem acento e em caixa baixa: o texto é comparado do mesmo jeito. */
export const REGRAS: Record<Assunto, Regra> = {
  cancelamento: {
    setor: 'recepcao', rotulo: 'Cancelamento', etiqueta: 'Cancelamento',
    quadro: 'Cancelamentos', lista: 'Pediu cancelamento',
    /* "cancelar minha matricula" é cancelamento, nao matricula: aqui o sinal pesa
       mais, porque tratar um pedido de cancelamento como lead novo custa o aluno */
    peso: 3,
    fortes: ['cancelar', 'cancelamento', 'trancar', 'trancamento', 'desistir',
      'rescisao', 'sair da escola', 'parar o curso', 'parar as aulas', 'encerrar o contrato'],
    fracos: ['nao vou continuar', 'nao quero mais', 'pensando em parar'],
  },
  financeiro: {
    setor: 'financeiro', rotulo: 'Financeiro', etiqueta: 'Financeiro',
    quadro: 'Recepcao',
    fortes: ['boleto', 'segunda via', '2a via', 'mensalidade', 'vencimento',
      'parcelar', 'negociar', 'em atraso', 'esta atrasada', 'pix', 'nota fiscal'],
    fracos: ['fatura', 'pagamento', 'pagar', 'cobranca', 'desconto'],
  },
  reposicao: {
    setor: 'recepcao', rotulo: 'Reposição', etiqueta: 'Reposição',
    quadro: 'Recepcao',
    fortes: ['reposicao', 'repor a aula', 'repor a minha aula', 'faltei', 'perdi a aula',
      'nao consegui ir', 'nao vou conseguir ir'],
    fracos: ['falta', 'faltar'],
  },
  marcacao: {
    setor: 'recepcao', rotulo: 'Marcação de aula',
    quadro: 'Recepcao',
    fortes: ['marcar a aula', 'marcar aula', 'marcar minha aula', 'agendar a aula',
      'agendar aula', 'remarcar', 'trocar o horario', 'mudar o horario', 'outro horario'],
    fracos: ['horario', 'agenda', 'marcacao'],
  },
  matricula: {
    setor: 'recepcao', rotulo: 'Matrícula', etiqueta: 'Matrícula',
    quadro: 'Recepcao',
    fortes: ['matricula', 'matricular', 'quero estudar', 'quero aprender',
      'fazer o curso', 'comecar o curso', 'me inscrever', 'inscricao', 'quanto custa',
      'valor do curso', 'quero fazer ingles'],
    fracos: ['preco', 'valores', 'curso', 'turma', 'aula experimental'],
  },
  prova: {
    setor: 'coordenacao', rotulo: 'Prova',
    quadro: 'Coordenacao', lista: 'Demandas',
    fortes: ['prova', 'avaliacao', 'minha nota', 'a nota', 'resultado da prova',
      'refazer a prova', 'segunda chamada'],
    fracos: ['nota', 'modulo', 'correcao'],
  },
  pedagogico: {
    setor: 'coordenacao', rotulo: 'Coordenação',
    quadro: 'Coordenacao', lista: 'Demandas',
    fortes: ['falar com a coordenacao', 'coordenador', 'coordenadora', 'reclamacao',
      'nao estou aprendendo', 'trocar de professor', 'mudar de nivel', 'pular de nivel'],
    fracos: ['professor', 'professora', 'nivel', 'licao'],
  },
};

/* Quem fala pelo aluno Kids vai para a Coordenacao Kids, nao para a de adultos. */
const SINAIS_KIDS = ['meu filho', 'minha filha', 'kids', 'crianca', 'o guri', 'a guria'];

export const semAcento = (t: string) =>
  t.normalize('NFD').replace(/\p{Mn}/gu, '').toLowerCase();

/** Casa palavra inteira, para "falta" nao casar dentro de "faltando". */
function tem(texto: string, termo: string) {
  const alvo = termo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^a-z0-9])${alvo}(s)?([^a-z0-9]|$)`, 'i').test(texto);
}

export interface Leitura {
  assunto: Assunto | null;
  setor: Setor | null;
  forca: number;
  placar: Partial<Record<Assunto, number>>;
}

/** O que o contato quer, pelo que ele escreveu. */
export function leAssunto(bruto: string): Leitura {
  const t = ` ${semAcento(bruto)} `;
  const placar: Partial<Record<Assunto, number>> = {};
  for (const [nome, r] of Object.entries(REGRAS) as [Assunto, Regra][]) {
    let n = 0;
    for (const f of r.fortes) if (tem(t, f)) n += r.peso ?? 2;
    for (const f of r.fracos) if (tem(t, f)) n += 1;
    if (n) placar[nome] = n;
  }
  const ordenado = (Object.entries(placar) as [Assunto, number][])
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const melhor = ordenado[0];
  /* empate entre dois assuntos nao decide nada: quem le é gente */
  if (!melhor || melhor[1] < 2 || (ordenado[1] && ordenado[1][1] === melhor[1])) {
    return { assunto: null, setor: null, forca: melhor ? melhor[1] : 0, placar };
  }
  const regra = REGRAS[melhor[0]];
  const kids = SINAIS_KIDS.some((k) => tem(t, k));
  const setor: Setor = kids && regra.setor === 'coordenacao' ? 'kids' : regra.setor;
  return { assunto: melhor[0], setor, forca: melhor[1], placar };
}

const casaNome = (a: string, b: string) => semAcento(a).trim() === semAcento(b).trim();

/** Em que quadro e em que lista a tarefa deste assunto nasce. */
export function destinoDaTarefa(assunto: Assunto, quadros: Quadro[], listas: Lista[]) {
  const regra = REGRAS[assunto];
  const abertos = quadros.filter((q) => !q.arquivado).sort((a, b) => a.ordem - b.ordem);
  const quadro = abertos.find((q) => casaNome(q.nome, regra.quadro)) || abertos[0];
  if (!quadro) return null;
  const doQuadro = listas.filter((l) => l.quadroId === quadro.id && !l.arquivada)
    .sort((a, b) => a.ordem - b.ordem);
  const lista = (regra.lista && doQuadro.find((l) => casaNome(l.nome, regra.lista as string)))
    || doQuadro[0];
  if (!lista) return null;
  return { quadroId: quadro.id, quadroNome: quadro.nome, listaId: lista.id, listaNome: lista.nome };
}

export interface TarefaNova {
  quadroId: string; quadroNome: string; listaId: string; listaNome: string;
  titulo: string; descricao: string; etiquetas: string[];
}

/** A tarefa que o assunto abre. Devolve nada quando nao da para dizer o assunto. */
export function tarefaDoAssunto(
  leitura: Leitura, contato: string, texto: string, quadros: Quadro[], listas: Lista[],
): TarefaNova | null {
  if (!leitura.assunto) return null;
  const destino = destinoDaTarefa(leitura.assunto, quadros, listas);
  if (!destino) return null;
  const regra = REGRAS[leitura.assunto];
  const dito = texto.trim().replace(/\s+/g, ' ').slice(0, 220);
  return {
    ...destino,
    titulo: `${regra.rotulo}: ${contato}`,
    descricao: dito ? `O contato escreveu: "${dito}"` : '',
    etiquetas: regra.etiqueta ? [regra.etiqueta] : [],
  };
}

/** O cartao aberto que já cuida desta conversa, para a triagem não abrir outro. */
export const tarefaDaConversa = (cartoes: Cartao[], conversaId: string) =>
  cartoes.find((c) => c.conversaId === conversaId && !c.arquivado);
