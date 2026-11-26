/* A IA do atendimento, no servidor. Escreve o follow-up, a despedida e a saudação no
   jeito de falar da escola, responde como assistente do financeiro e contrato, e lê o
   contrato do aluno para o cadastro (dominio/contrato.ts faz as contas depois).

   O formato da resposta é garantido pela API (saída estruturada), entao o sistema
   nunca manda para o aluno um JSON quebrado ou um texto com instrução vazando. Quando
   a IA nao responde (sem chave, fora do ar, recusa), devolve null e quem chamou usa o
   texto de reserva das Configurações: o aluno nunca fica sem resposta. */
import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';
import type { BetaContentBlockParam } from '@anthropic-ai/sdk/resources/beta/messages/messages';
import { falhou } from '@/lib/saude';
import type { LidoDoContrato } from '@/lib/dominio/contrato';

const MODELO = 'claude-opus-5-5';

export const iaLigada = () => Boolean(process.env.ANTHROPIC_API_KEY);

let cliente: Anthropic | null = null;
const claude = () => {
  if (!cliente) cliente = new Anthropic({ timeout: 40_000, maxRetries: 1 });
  return cliente;
};

const LeituraSchema = z.object({
  situacao: z.enum(['pendente', 'resolvida', 'aluno_esperando']),
  pendencia: z.string(),
  mensagem: z.string(),
});
export type Leitura = z.infer<typeof LeituraSchema>;

const RespostaSchema = z.object({
  acao: z.enum(['responder', 'perguntar', 'passar']),
  mensagem: z.string(),
  resumo: z.string(),
});
export type RespostaDoAssistente = z.infer<typeof RespostaSchema>;

const ResumoSchema = z.object({
  resumo: z.string(),
  atencao: z.array(z.string()),
});
export type ResumoDaIa = z.infer<typeof ResumoSchema>;

const ContratoSchema = z.object({
  ehContrato: z.boolean(),
  nome: z.string(),
  cpf: z.string(),
  nascimento: z.string(),
  telefone: z.string(),
  email: z.string(),
  endereco: z.string(),
  responsavelNome: z.string(),
  responsavelTelefone: z.string(),
  modalidade: z.enum(['presencial', 'online', 'hibrido', '']),
  moduloInicial: z.string(),
  duracaoMeses: z.number().int(),
  dataContrato: z.string(),
  assinado: z.boolean(),
  observacao: z.string(),
});

type Turno = { role: 'user' | 'assistant'; content: string | BetaContentBlockParam[] };

/* A falha da IA vai para a saúde do sistema com o motivo em português. O aluno não
   percebe (sai o texto de reserva), mas a gestão precisa saber se é chave ou saldo. */
function motivoDaFalha(e: unknown) {
  if (e instanceof Anthropic.APIConnectionTimeoutError) return 'A IA demorou demais para responder.';
  if (e instanceof Anthropic.APIConnectionError) return 'Não consegui falar com a IA.';
  if (e instanceof Anthropic.APIError) {
    if (e.status === 401) return 'A chave da IA foi recusada (ANTHROPIC_API_KEY).';
    if (e.status === 403) return 'A chave da IA não tem permissão para este modelo.';
    if (e.status === 429) return 'A IA chegou no limite de uso da conta.';
    if (e.status === 529 || e.status === 503) return 'A IA está sobrecarregada agora.';
    if (e.status === 400 && /credit|balance/i.test(e.message)) return 'A conta da IA está sem saldo.';
    return `A IA recusou o pedido (${e.status ?? 'sem código'}).`;
  }
  return 'A IA falhou sem explicar.';
}

async function anota(e: unknown) {
  if (e instanceof Anthropic.APIError) console.error('[ia]', e.status, e.message);
  else console.error('[ia]', e);
  /* sem saldo ou chave recusada não passa sozinho: vira alerta grave para a gestão
     (foi assim em 21/11, e ninguém viu que a IA tinha parado) */
  const daConta = e instanceof Anthropic.APIError
    && (e.status === 401 || e.status === 403 || (e.status === 400 && /credit|balance/i.test(e.message)));
  await falhou(daConta ? 'iaConta' : 'ia', motivoDaFalha(e));
}

/* Mensagens curtas: esforço baixo responde rapido e basta para escrever duas frases.
   Se o modelo recusar por politica, a API tenta de novo num modelo de reserva na
   mesma chamada (fallbacks: 'default'); se ainda assim recusar, cai no texto fixo. */
async function pergunta<T>(turnos: Turno[], formato: ReturnType<typeof betaZodOutputFormat<z.ZodType<T>>>, espera?: number): Promise<T | null> {
  if (!iaLigada()) return null;
  try {
    const r = await claude().beta.messages.parse({
      model: MODELO,
      max_tokens: 4000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low', format: formato },
      messages: turnos,
    }, espera ? { timeout: espera } : undefined);
    if (r.stop_reason === 'refusal' || r.stop_reason === 'max_tokens') return null;
    return (r.parsed_output as T | null) ?? null;
  } catch (e) {
    await anota(e);
    return null;
  }
}

/** Escreve uma mensagem do atendimento (saudação, aviso, follow-up, despedida). */
export async function escreveMensagem(prompt: string): Promise<Leitura | null> {
  const r = await pergunta<Leitura>([{ role: 'user', content: prompt }], betaZodOutputFormat(LeituraSchema));
  if (!r) return null;
  return { ...r, mensagem: limpa(r.mensagem), pendencia: r.pendencia.trim() };
}

/** O assistente do financeiro e contrato responde a conversa. */
export async function respondeComoAssistente(turnos: Turno[]): Promise<RespostaDoAssistente | null> {
  const r = await pergunta<RespostaDoAssistente>(turnos, betaZodOutputFormat(RespostaSchema));
  if (!r) return null;
  const mensagem = limpa(r.mensagem);
  if (!mensagem) return null;
  return { ...r, mensagem, resumo: r.resumo.trim() };
}

/** O resumo do progresso de um aluno a partir das últimas aulas (agenda). */
export async function resumeProgresso(prompt: string): Promise<ResumoDaIa | null> {
  const r = await pergunta<ResumoDaIa>([{ role: 'user', content: prompt }], betaZodOutputFormat(ResumoSchema));
  if (!r) return null;
  const resumo = limpa(r.resumo);
  if (!resumo) return null;
  return { resumo, atencao: r.atencao.map(limpa).filter(Boolean).slice(0, 4) };
}

const LEITURA_DO_CONTRATO = `Você lê o contrato de prestação de serviços educacionais de um aluno da Nexus English Center (Chapecó) para preencher o cadastro dele no sistema da escola. O contrato vem anexo (PDF, foto ou o texto do Word).

Devolva só o que está escrito no contrato. Não invente, não complete e não corrija nada. Campo que o contrato não preencheu (em branco, com traço ou ainda com o marcador do modelo, como {{CPF_ALUNO}}) volta vazio, e número que não aparece volta 0.

- ehContrato: true se o arquivo é um contrato de curso de idiomas com um aluno; false se for outra coisa.
- nome: o nome completo do aluno, como está escrito. Se o contrato for assinado por um responsável em nome de um aluno menor e trouxer os dois nomes, aqui vai o do aluno.
- cpf, nascimento, telefone, email, endereco: os do aluno (o CONTRATANTE, quando ele é o próprio aluno). Endereço inteiro numa linha, com bairro, cidade e CEP se houver.
- responsavelNome e responsavelTelefone: só se o contrato nomear um responsável pelo aluno (pai, mãe, responsável legal). Se o responsável for o CONTRATANTE, o CPF, o telefone e o e-mail do contratante vão nos campos do aluno mesmo assim, e o telefone dele também em responsavelTelefone.
- nascimento e dataContrato no formato AAAA-MM-DD. dataContrato é a data em que o contrato foi feito (normalmente junto da cidade, no fim).
- modalidade: a que estiver marcada (presencial ou online; hibrido se as duas); vazio se nenhuma.
- moduloInicial: o módulo em que o aluno começa (Starter, A1, A2, B1, B1 PLUS ou o que estiver escrito).
- duracaoMeses: o período contratado, em meses.
- assinado: true se dá para ver a assinatura do contratante (ou assinatura eletrônica) no arquivo.
- observacao: só algo fora do comum que a recepção precise saber para o cadastro, numa frase curta; vazio na maioria das vezes. Nunca valores, parcelas ou forma de pagamento.`;

/** Lê o contrato do aluno (PDF, imagem ou texto do Word) para o cadastro. */
export async function leContrato(anexo: BetaContentBlockParam): Promise<LidoDoContrato | null> {
  return pergunta<LidoDoContrato>([
    { role: 'user', content: [anexo, { type: 'text', text: LEITURA_DO_CONTRATO }] },
  ], betaZodOutputFormat(ContratoSchema), 80_000);
}

/** O WhatsApp aceita até 4096 letras; a escola não usa travessão. */
function limpa(t: string) {
  return t.replace(/\s*—\s*/g, ', ').trim().slice(0, 1500);
}
