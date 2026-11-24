/* As provas do portal de alunos (nexusenglish.com.br), vistas da central: regras puras.
   Decidido em 24/11/2026: as questões, respostas, áudios, correção e o controle de tempo
   ficam no portal; a central só vincula o aluno, consulta as provas, pede a liberação e
   manda o link pelo WhatsApp que já existe. Nada de avaliação é copiado para o Firebase.
   O contrato com o portal é uma PROPOSTA (docs/integracao-provas-portal.md): a API do
   portal ainda não existe. Estes formatos são o que a central espera receber; o que vier
   diferente é recusado como resposta inválida, nunca adivinhado.
   Prova: node --experimental-strip-types testes/provas-portal.ts */
import { z } from 'zod';

/* ---------------- permissões ---------------- */

export type AcaoNoPortal = 'consultar' | 'vincular' | 'desvincular' | 'liberar' | 'reenviar';

/** Quem pode o quê. A recepção faz o dia a dia; desvincular é da gestão. A coordenação
    consulta e envia, mas só nas conversas do setor dela (o servidor confere). */
export const PODE_NO_PORTAL: Record<AcaoNoPortal, readonly string[]> = {
  consultar: ['admin', 'gestor', 'recepcao', 'coordenacao'],
  vincular: ['admin', 'gestor', 'recepcao'],
  desvincular: ['admin', 'gestor'],
  liberar: ['admin', 'gestor', 'recepcao', 'coordenacao'],
  reenviar: ['admin', 'gestor', 'recepcao', 'coordenacao'],
};

export const podeNoPortal = (papel: string | undefined | null, acao: AcaoNoPortal) =>
  Boolean(papel && PODE_NO_PORTAL[acao].includes(papel));

/* ---------------- o que o portal devolve (contrato v1, proposto) ---------------- */

export const ESTADOS_DA_PROVA = ['bloqueada', 'liberada', 'iniciada', 'concluida'] as const;
export type EstadoDaProva = (typeof ESTADOS_DA_PROVA)[number] | 'desconhecido';

export const NOME_DO_ESTADO: Record<EstadoDaProva, string> = {
  bloqueada: 'Bloqueada', liberada: 'Liberada', iniciada: 'Iniciada', concluida: 'Concluída', desconhecido: 'Estado desconhecido',
};

const data = z.string().min(10).nullable().optional();

const AlunoSchema = z.object({
  id: z.string().min(1).max(120),
  nome: z.string().min(1).max(200),
  email_mascarado: z.string().max(200).nullable().optional(),
  telefone_final: z.string().max(8).nullable().optional(),
  turma: z.string().max(120).nullable().optional(),
  nivel: z.string().max(60).nullable().optional(),
  ativo: z.boolean().optional(),
});

const LiberacaoSchema = z.object({
  id: z.string().min(1).max(160),
  liberada_em: data,
  expira_em: data,
  liberada_por: z.string().max(200).nullable().optional(),
});

const ProvaSchema = z.object({
  id: z.string().min(1).max(160),
  titulo: z.string().min(1).max(200),
  nivel: z.string().max(60).nullable().optional(),
  modulo: z.string().max(60).nullable().optional(),
  /* estado novo que a central ainda não conhece não quebra a lista: vira "desconhecido" */
  estado: z.string(),
  pode_liberar: z.boolean(),
  motivo_bloqueio: z.string().max(300).nullable().optional(),
  liberacao: LiberacaoSchema.nullable().optional(),
  iniciada_em: data,
  concluida_em: data,
  resultado: z.object({ situacao: z.string().max(60), nota: z.number().nullable().optional() }).nullable().optional(),
});

const ListaDeAlunosSchema = z.object({ alunos: z.array(AlunoSchema).max(50) });
const UmAlunoSchema = z.object({ aluno: AlunoSchema });
const ProvasSchema = z.object({ aluno_id: z.string(), atualizado_em: data, provas: z.array(ProvaSchema).max(200) });
const NovaLiberacaoSchema = z.object({
  liberacao: z.object({
    id: z.string().min(1).max(160), aluno_id: z.string(), prova_id: z.string(), estado: z.string(),
    liberada_em: data, expira_em: data, link: z.string().max(2000),
  }),
});
const LinkSchema = z.object({ link: z.string().max(2000), expira_em: data, estado: z.string().optional() });
const ErroSchema = z.object({ erro: z.object({ codigo: z.string().max(80), mensagem: z.string().max(500).optional() }) });

export interface AlunoNoPortal {
  id: string; nome: string; emailMascarado: string; telefoneFinal: string; turma: string; nivel: string; ativo: boolean;
}
export interface ProvaNoPortal {
  id: string; titulo: string; nivel: string; modulo: string; estado: EstadoDaProva; estadoOriginal: string;
  podeLiberar: boolean; motivoBloqueio: string;
  liberacao: { id: string; liberadaEm: string; expiraEm: string; liberadaPor: string } | null;
  iniciadaEm: string; concluidaEm: string;
  resultado: { situacao: string; nota: number | null } | null;
}
export interface LiberacaoConfirmada { id: string; alunoId: string; provaId: string; estado: string; liberadaEm: string; expiraEm: string; link: string }

const aluno = (a: z.infer<typeof AlunoSchema>): AlunoNoPortal => ({
  id: a.id, nome: a.nome, emailMascarado: a.email_mascarado || '', telefoneFinal: a.telefone_final || '',
  turma: a.turma || '', nivel: a.nivel || '', ativo: a.ativo !== false,
});

const estadoDe = (e: string): EstadoDaProva => ((ESTADOS_DA_PROVA as readonly string[]).includes(e) ? e as EstadoDaProva : 'desconhecido');

/* Cada leitor devolve o dado já no formato da central, ou null se o portal mandou algo
   fora do contrato (a central não adivinha). */
export function leListaDeAlunos(json: unknown): AlunoNoPortal[] | null {
  const r = ListaDeAlunosSchema.safeParse(json);
  return r.success ? r.data.alunos.map(aluno) : null;
}
export function leAluno(json: unknown): AlunoNoPortal | null {
  const r = UmAlunoSchema.safeParse(json);
  return r.success ? aluno(r.data.aluno) : null;
}
export function leProvas(json: unknown): { alunoId: string; atualizadoEm: string; provas: ProvaNoPortal[] } | null {
  const r = ProvasSchema.safeParse(json);
  if (!r.success) return null;
  return {
    alunoId: r.data.aluno_id,
    atualizadoEm: r.data.atualizado_em || '',
    provas: r.data.provas.map((p) => ({
      id: p.id, titulo: p.titulo, nivel: p.nivel || '', modulo: p.modulo || '', estado: estadoDe(p.estado), estadoOriginal: p.estado,
      podeLiberar: p.pode_liberar && estadoDe(p.estado) === 'bloqueada', motivoBloqueio: p.motivo_bloqueio || '',
      liberacao: p.liberacao ? { id: p.liberacao.id, liberadaEm: p.liberacao.liberada_em || '', expiraEm: p.liberacao.expira_em || '', liberadaPor: p.liberacao.liberada_por || '' } : null,
      iniciadaEm: p.iniciada_em || '', concluidaEm: p.concluida_em || '',
      resultado: p.resultado ? { situacao: p.resultado.situacao, nota: p.resultado.nota ?? null } : null,
    })),
  };
}
export function leLiberacao(json: unknown): LiberacaoConfirmada | null {
  const r = NovaLiberacaoSchema.safeParse(json);
  if (!r.success) return null;
  const l = r.data.liberacao;
  return { id: l.id, alunoId: l.aluno_id, provaId: l.prova_id, estado: l.estado, liberadaEm: l.liberada_em || '', expiraEm: l.expira_em || '', link: l.link };
}
export function leLink(json: unknown): { link: string; expiraEm: string } | null {
  const r = LinkSchema.safeParse(json);
  return r.success ? { link: r.data.link, expiraEm: r.data.expira_em || '' } : null;
}
export function leErro(json: unknown): { codigo: string; mensagem: string } | null {
  const r = ErroSchema.safeParse(json);
  return r.success ? { codigo: r.data.erro.codigo, mensagem: r.data.erro.mensagem || '' } : null;
}

/* ---------------- erros do portal, na língua da recepção ---------------- */

/** Erros que dizem com certeza que a liberação NÃO aconteceu (dá para destravar). */
export const RECUSAS_DEFINITIVAS = [
  'aluno_nao_encontrado', 'prova_nao_encontrada', 'prova_nao_pertence_ao_aluno', 'prova_nao_liberavel',
  'idempotencia_conflito', 'nao_autenticado', 'assinatura_invalida', 'proibido', 'requisicao_invalida',
] as const;
/** A prova já não está bloqueada: a central não libera de novo nem substitui. */
export const JA_NAO_BLOQUEADA = ['prova_ja_liberada', 'prova_em_andamento', 'prova_concluida'] as const;

const MOTIVO: Record<string, string> = {
  aluno_nao_encontrado: 'O portal não encontrou este aluno. Confira o vínculo do aluno com o portal.',
  prova_nao_encontrada: 'O portal não encontrou esta prova. Toque em Atualizar para ver a lista de novo.',
  prova_nao_pertence_ao_aluno: 'Esta prova não é deste aluno no portal. Confira o vínculo.',
  prova_nao_liberavel: 'O portal não deixa liberar esta prova agora.',
  prova_ja_liberada: 'A prova já estava liberada no portal. Nada foi liberado de novo: use Reenviar mensagem se o aluno precisa do link.',
  prova_em_andamento: 'O aluno já começou esta prova. A central não reinicia nem substitui uma tentativa em andamento.',
  prova_concluida: 'Esta prova já foi concluída.',
  prova_nao_liberada: 'A prova ainda não está liberada no portal, então não há link para mandar.',
  idempotencia_conflito: 'O portal recusou: esta chave de liberação já foi usada para outro pedido. Feche e abra a prova de novo.',
  nao_autenticado: 'O portal recusou a chave da central. Confira PORTAL_API_TOKEN na Vercel.',
  assinatura_invalida: 'O portal recusou a assinatura da central. Confira PORTAL_API_SEGREDO na Vercel.',
  proibido: 'O portal não deixa a central fazer isso.',
  limite: 'O portal pediu para esperar um pouco. Tente de novo em instantes.',
  indisponivel: 'O portal não respondeu. Tente de novo em instantes.',
  requisicao_invalida: 'O portal não entendeu o pedido da central.',
};

export const motivoDoPortal = (codigo: string, mensagem = '') =>
  MOTIVO[codigo] || (mensagem ? `O portal recusou: ${mensagem}` : `O portal recusou (${codigo}).`);

/* ---------------- o link e a mensagem ---------------- */

/** O link só sai se for https e do portal da escola (ou do mesmo endereço da API). */
export function linkValido(link: string, hostsExtras: string[] = []): boolean {
  let u: URL;
  try { u = new URL(link); } catch { return false; }
  if (u.protocol !== 'https:' || u.username || u.password) return false;
  const host = u.hostname.toLowerCase();
  return host === 'nexusenglish.com.br' || host.endsWith('.nexusenglish.com.br') || hostsExtras.map((h) => h.toLowerCase()).includes(host);
}

const primeiro = (nome: string) => (nome || '').trim().split(/\s+/)[0] || '';

/** O texto da mensagem com o link (dentro da janela de 24 horas). Para o responsável,
    fala do aluno pelo nome. */
export function mensagemDaProva(p: { nomeDoContato: string; nomeDoAluno: string; ehResponsavel: boolean; titulo: string; link: string }): string {
  const oi = primeiro(p.nomeDoContato) ? `Oi, ${primeiro(p.nomeDoContato)}!` : 'Oi!';
  return p.ehResponsavel
    ? `${oi} A prova ${p.titulo} do(a) ${primeiro(p.nomeDoAluno)} já está liberada no portal do aluno. É só entrar com o login dele(a) por este link:\n${p.link}`
    : `${oi} A sua prova ${p.titulo} já está liberada no portal do aluno. É só entrar com o seu login por este link:\n${p.link}`;
}

/** O modelo aprovado que leva o link quando a janela de 24 horas fechou (ainda não
    criado: o endereço do link depende do portal; ver a documentação). */
export const MODELO_DA_PROVA = 'prova_liberada';
export const BASE_DO_LINK_NO_MODELO = 'https://nexusenglish.com.br/';

/** Como a mensagem sai: texto com a janela aberta; com ela fechada, só pelo modelo
    aprovado; sem modelo, não sai (e por isso não se libera antes de ter por onde mandar). */
export function canalDoEnvio(p: { temConversa: boolean; janelaAberta: boolean; modeloAprovado: boolean }):
  { canal: 'texto' | 'modelo' } | { erro: string } {
  if (!p.temConversa) return { erro: 'Este aluno ainda não tem conversa no WhatsApp com a escola. Abra a conversa antes de liberar.' };
  if (p.janelaAberta) return { canal: 'texto' };
  if (p.modeloAprovado) return { canal: 'modelo' };
  return { erro: 'A janela de 24 horas desta conversa está fechada e o modelo prova_liberada ainda não foi aprovado pela Meta. Peça para o contato mandar uma mensagem, ou aguarde o modelo.' };
}

/** O fim do link que vai no botão do modelo (o modelo tem a base fixa). */
export function sufixoDoLink(link: string): string | null {
  return link.startsWith(BASE_DO_LINK_NO_MODELO) ? link.slice(BASE_DO_LINK_NO_MODELO.length) : null;
}

/* ---------------- o registro da operação na central ---------------- */

export type EstadoDaLiberacao =
  | 'pedida'              // a central pediu e ainda não sabe a resposta
  | 'confirmada'          // o portal liberou e devolveu o link
  | 'sem_confirmacao'     // o portal não respondeu a tempo: pode ou não ter liberado
  | 'recusada'            // o portal disse que não liberou
  | 'ja_estava_liberada'  // a prova já não estava bloqueada: nada novo foi liberado
  | 'externa';            // a prova foi liberada direto no portal; a central só manda o link

export type EstadoDoEnvio = 'enviando' | 'aceito' | 'falhou';

export interface Quem { uid: string; nome: string; papel: string }

export interface EnvioDaProva {
  chave: string;               // a chave do clique: o mesmo clique repetido não manda duas vezes
  estado: EstadoDoEnvio;
  canal?: 'texto' | 'modelo';
  waMessageId?: string | null;
  mensagemId?: string | null;
  erro?: string | null;
  por: Quem;
  em: string;
}

export interface OperacaoDaProva {
  id: string;                  // a chave de idempotência da liberação
  alunoId: string;
  alunoNome: string;
  portalStudentId: string;
  provaId: string;
  provaTitulo: string;
  conversaId: string;
  liberacao: {
    estado: EstadoDaLiberacao;
    pedidaEm: string;
    pedidaPor: Quem;
    respondidaEm?: string | null;
    portalLiberacaoId?: string | null;
    expiraEm?: string | null;
    codigo?: string | null;
    erro?: string | null;
  };
  envios: EnvioDaProva[];
  criadoEm: string;
  atualizadoEm: string;
}

/** A chave que o navegador manda para cada pedido: um UUID. Outra coisa é recusada. */
export const chaveValida = (c: unknown): c is string =>
  typeof c === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(c);

/** A trava de uma prova de um aluno: uma liberação por vez. */
export const idDaTrava = (alunoId: string, provaId: string) =>
  `${alunoId}__${provaId}`.replace(/[^\w-]/g, '_').slice(0, 300);

/** Liberação "pedida" há mais que isto, sem resposta, pode ser retomada à mão (com a
    MESMA chave, que o portal reconhece e não libera de novo). */
export const RETOMAR_PEDIDA_APOS_MS = 2 * 60_000;

/** A operação segura a trava? Enquanto o resultado não é certo, sim. */
export const seguraATrava = (estado: EstadoDaLiberacao) => estado === 'pedida' || estado === 'sem_confirmacao';

/** Dá para retomar a liberação com a mesma chave (sem criar outra)? */
export function podeRetomar(op: Pick<OperacaoDaProva, 'liberacao'>, agora: number): boolean {
  if (op.liberacao.estado === 'sem_confirmacao') return true;
  return op.liberacao.estado === 'pedida' && agora - Date.parse(op.liberacao.pedidaEm) > RETOMAR_PEDIDA_APOS_MS;
}

/** O que a mensagem já fez, pelos eventos do WhatsApp que a central recebe: aceita pela
    Meta (tem id), entregue no aparelho, lida, ou falhou depois de aceita. */
export type SituacaoDaMensagem = 'enviando' | 'aceita' | 'entregue' | 'lida' | 'falhou';
export function situacaoDaMensagem(
  envio: Pick<EnvioDaProva, 'estado' | 'waMessageId'>,
  mensagem?: { entregueEm?: string | null; lidoEm?: string | null; falhouEm?: string | null } | null,
): SituacaoDaMensagem {
  if (envio.estado === 'falhou' || mensagem?.falhouEm) return 'falhou';
  if (envio.estado === 'enviando') return 'enviando';
  if (mensagem?.lidoEm) return 'lida';
  if (mensagem?.entregueEm) return 'entregue';
  return 'aceita';
}
export const NOME_DA_SITUACAO_DA_MENSAGEM: Record<SituacaoDaMensagem, string> = {
  enviando: 'Enviando', aceita: 'Aceita pelo WhatsApp (ainda sem confirmação de entrega)', entregue: 'Entregue no celular', lida: 'Lida', falhou: 'Não saiu',
};

/** O que a tela oferece para uma prova, juntando o portal e a última operação da central. */
export function acoesDaProva(prova: Pick<ProvaNoPortal, 'estado' | 'podeLiberar'>, op?: Pick<OperacaoDaProva, 'liberacao' | 'envios'> | null):
  { liberar: boolean; retomar: boolean; reenviar: boolean; motivo: string } {
  const emCurso = op && seguraATrava(op.liberacao.estado);
  if (emCurso) {
    return { liberar: false, retomar: op.liberacao.estado === 'sem_confirmacao', reenviar: false, motivo: op.liberacao.estado === 'pedida' ? 'Liberação em andamento.' : 'O portal não confirmou a liberação.' };
  }
  const enviando = op?.envios.some((e) => e.estado === 'enviando');
  return {
    liberar: prova.podeLiberar && prova.estado === 'bloqueada',
    retomar: false,
    reenviar: !enviando && (prova.estado === 'liberada' || prova.estado === 'iniciada'),
    motivo: prova.estado === 'concluida' ? 'Prova concluída.' : '',
  };
}
