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

type Turno = { role: 'user' | 'assistant'; content: string };

function anota(e: unknown) {
  if (e instanceof Anthropic.APIError) console.error('[ia]', e.status, e.message);
  else console.error('[ia]', e);
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
    anota(e);
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

/** O WhatsApp aceita até 4096 letras; a escola não usa travessão. */
function limpa(t: string) {
  return t.replace(/\s*—\s*/g, ', ').trim().slice(0, 1500);
}
