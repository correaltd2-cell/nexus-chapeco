/* O cadastro do aluno pelo contrato (pedido do cliente, 24/11/2026: "quero poder só subir
   o contrato e fazer o cadastro sozinho"). A IA lê o contrato no servidor e devolve o
   que achou (LidoDoContrato); aqui isso vira a ficha de cadastro, com as contas feitas
   por regra e não pela IA: o fim do contrato é a data do contrato mais a duração, o
   menor de idade sai da data de nascimento, telefone e CPF passam pela mesma leitura
   da planilha. O que não veio fica vazio e a tela diz o que faltou.
   Prova: node --experimental-strip-types testes/contrato.ts */
import type { FichaDoAluno } from './alunos.ts';
import { lerData, telefoneDaPlanilha } from './planilha.ts';

/** O que a IA devolve do contrato. Campo que o contrato não preencheu vem vazio (ou 0). */
export interface LidoDoContrato {
  ehContrato: boolean;
  nome: string;
  cpf: string;
  nascimento: string;          // AAAA-MM-DD
  telefone: string;
  email: string;
  endereco: string;
  responsavelNome: string;
  responsavelTelefone: string;
  modalidade: 'presencial' | 'online' | 'hibrido' | '';
  moduloInicial: string;       // Starter, A1, A2, B1, B1 PLUS
  duracaoMeses: number;
  dataContrato: string;        // AAAA-MM-DD, a data no fim do contrato
  assinado: boolean;
  observacao: string;
}

export type TipoDeContrato = 'pdf' | 'docx' | 'imagem';
export const TIPOS_DE_IMAGEM = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;

/** Que arquivo é esse, pelo tipo que o navegador deu e pela extensão. */
export function tipoDoContrato(nome: string, mime: string): TipoDeContrato | null {
  const n = nome.toLowerCase();
  if (mime === 'application/pdf' || n.endsWith('.pdf')) return 'pdf';
  if (mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || n.endsWith('.docx')) return 'docx';
  if ((TIPOS_DE_IMAGEM as readonly string[]).includes(mime) || /\.(jpe?g|png|webp|gif)$/.test(n)) return 'imagem';
  return null;
}

/** Onde o contrato fica guardado: na pasta do aluno, com a data no nome. */
export function caminhoDoContrato(alunoId: string, nomeDoArquivo: string, agora: string): string {
  const ext = (/\.([a-z0-9]{2,5})$/i.exec(nomeDoArquivo)?.[1] || 'pdf').toLowerCase();
  return `alunos/${alunoId}/contrato-${agora.slice(0, 16).replace(/[-:T]/g, '')}.${ext}`;
}

/** O caminho que a rota aceita ler (nada fora da pasta de contratos dos alunos). */
export const caminhoValido = (c: string) => /^alunos\/[A-Za-z0-9_-]{6,64}\/contrato-\d{12}\.(pdf|docx|jpe?g|png|webp|gif)$/.test(c);

/** A data somada de meses; no dia que não existe, o último do mês (31/01 + 1 = 28/02). */
export function somaMeses(iso: string, meses: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m || !(meses > 0)) return '';
  const total = Number(m[1]) * 12 + (Number(m[2]) - 1) + Math.round(meses);
  const ano = Math.floor(total / 12);
  const mes = total % 12;
  const ultimo = new Date(Date.UTC(ano, mes + 1, 0)).getUTCDate();
  const dia = Math.min(Number(m[3]), ultimo);
  return `${ano}-${String(mes + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

/** Anos completos entre o nascimento e a data (AAAA-MM-DD). */
export function idade(nascimento: string, em: string): number | null {
  const a = /^(\d{4})-(\d{2})-(\d{2})$/.exec(nascimento);
  const b = /^(\d{4})-(\d{2})-(\d{2})$/.exec(em);
  if (!a || !b) return null;
  let anos = Number(b[1]) - Number(a[1]);
  if (`${b[2]}${b[3]}` < `${a[2]}${a[3]}`) anos -= 1;
  return anos >= 0 && anos < 130 ? anos : null;
}

const limpo = (t: string) => (t || '').replace(/\s+/g, ' ').trim();
/* a IA às vezes devolve o marcador do modelo de contrato que ninguém preencheu */
const preenchido = (t: string) => (/\{\{|\}\}|_{3,}/.test(t) ? '' : limpo(t));

/**
 * A ficha de cadastro a partir do que a IA leu. Devolve os campos para a tela, o que
 * faltou (para a recepção completar) e avisos do que a regra recusou.
 */
export function fichaDoContrato(l: LidoDoContrato, agora: string): { ficha: FichaDoAluno; faltou: string[]; avisos: string[] } {
  const avisos: string[] = [];
  const hoje = agora.slice(0, 10);
  const nascimento = lerData(preenchido(l.nascimento));
  const dataContrato = lerData(preenchido(l.dataContrato)) || hoje;
  const anos = nascimento ? idade(nascimento, dataContrato) : null;
  const menor = anos !== null && anos < 18;

  const fone = (t: string, rotulo: string) => {
    const bruto = preenchido(t);
    const f = telefoneDaPlanilha(bruto);
    if (bruto && !f) avisos.push(`${rotulo} do contrato não parece telefone ("${bruto}").`);
    return f;
  };
  const cpf = preenchido(l.cpf).replace(/\D/g, '');
  if (cpf && cpf.length !== 11) avisos.push(`O CPF do contrato não tem 11 números ("${preenchido(l.cpf)}").`);
  const email = preenchido(l.email).toLowerCase();
  const fim = somaMeses(dataContrato, l.duracaoMeses);

  const ficha: FichaDoAluno = {
    nome: preenchido(l.nome),
    menor,
    codigo: '',
    nascimento,
    documento: cpf.length === 11 ? cpf : '',
    telefone: fone(l.telefone, 'O telefone'),
    email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '',
    endereco: preenchido(l.endereco),
    responsavelNome: preenchido(l.responsavelNome),
    responsavelTelefone: fone(l.responsavelTelefone, 'O telefone do responsável'),
    livroOriginal: preenchido(l.moduloInicial).toUpperCase(),
    modalidade: l.modalidade || '',
    contratoFim: fim,
    contratoAssinado: l.assinado === true,
    horarioFixoTexto: '',
    observacao: preenchido(l.observacao),
  };
  if (menor && !ficha.responsavelNome) avisos.push(`Pela data de nascimento, o aluno tem ${anos} anos: confira o responsável.`);

  const faltou = [
    ['nome', 'nome'], ['documento', 'CPF'], ['nascimento', 'nascimento'], ['modalidade', 'modalidade'],
    ['livroOriginal', 'módulo'], ['contratoFim', 'fim do contrato'],
  ].filter(([k]) => !ficha[k as keyof FichaDoAluno]).map(([, r]) => r);
  if (!ficha.telefone && !ficha.responsavelTelefone) faltou.push('telefone');
  return { ficha, faltou, avisos };
}

/** O contrato fictício da demonstração (nada aqui é aluno de verdade). */
export const CONTRATO_DE_EXEMPLO: LidoDoContrato = {
  ehContrato: true, nome: 'Helena Ficticia Rossi', cpf: '529.982.247-25', nascimento: '2011-08-14',
  telefone: '', email: 'familia.rossi@exemplo.com', endereco: 'Rua das Palmeiras, 120, Centro, Chapecó, CEP 89801-000',
  responsavelNome: 'Paulo Ficticio Rossi', responsavelTelefone: '(49) 99812-3344', modalidade: 'presencial',
  moduloInicial: 'A1', duracaoMeses: 12, dataContrato: '2026-11-24', assinado: true, observacao: '',
};
