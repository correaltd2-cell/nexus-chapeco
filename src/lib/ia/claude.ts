/* A IA do atendimento, no servidor. Escreve o follow-up, a despedida e a saudação no
   jeito de falar da escola, e responde como assistente do financeiro e contrato.

   O formato da resposta é garantido pela API (saída estruturada), entao o sistema
   nunca manda para o aluno um JSON quebrado ou um texto com instrução vazando. Quando
   a IA nao responde (sem chave, fora do ar, recusa), devolve null e quem chamou usa o
   texto de reserva das Configurações: o aluno nunca fica sem resposta. */
import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';
import { falhou } from '@/lib/saude';

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
  acao: z.enum(['responder', 'passar']),
  mensagem: z.string(),
  resumo: z.string(),
});
export type RespostaDoAssistente = z.infer<typeof RespostaSchema>;

const ResumoSchema = z.object({
  resumo: z.string(),
  atencao: z.array(z.string()),
});
export type ResumoDaIa = z.infer<typeof ResumoSchema>;

type Turno = { role: 'user' | 'assistant'; content: string };

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
  await falhou('ia', motivoDaFalha(e));
}

/* Mensagens curtas: esforço baixo responde rapido e basta para escrever duas frases.
   Se o modelo recusar por politica, a API tenta de novo num modelo de reserva na
   mesma chamada (fallbacks: 'default'); se ainda assim recusar, cai no texto fixo. */
async function pergunta<T>(turnos: Turno[], formato: ReturnType<typeof betaZodOutputFormat<z.ZodType<T>>>): Promise<T | null> {
  if (!iaLigada()) return null;
  try {
    const r = await claude().beta.messages.parse({
      model: MODELO,
      max_tokens: 4000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low', format: formato },
      messages: turnos,
    });
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

/** O WhatsApp aceita até 4096 letras; a escola não usa travessão. */
function limpa(t: string) {
  return t.replace(/\s*—\s*/g, ', ').trim().slice(0, 1500);
}
