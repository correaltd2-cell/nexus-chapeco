/* O aviso de mensagem nova: quem é chamado, quando, e o que aparece.
   Dois caminhos usam estas regras: o push no celular, que o servidor manda pelo
   Firebase quando a mensagem chega (src/lib/avisos.ts), e a notificação do computador
   com o sistema aberto (componentes/avisos.tsx).
   Prova: node --experimental-strip-types testes/avisos.ts */
import type { Conversa, Setor } from './tipos';

/** Recebe o aviso quem está ativo e é do setor da conversa (Configurações, Equipe). */
export const recebeAviso = (p: { ativo?: boolean; setores?: Setor[] }, setor: Setor) =>
  Boolean(p.ativo) && (p.setores || []).includes(setor);

/** A conversa está com gente? Enquanto a saudação, o assistente ou a próxima aula (o
    contato escolhendo Confirmar ou Remarcar) cuidam, ninguém é chamado: o aviso vem
    quando a conversa chega para uma pessoa. */
export const comGente = (c: Partial<Pick<Conversa, 'estado' | 'etapa'>>) =>
  c.estado !== 'ia' && c.estado !== 'encerrada' && c.etapa !== 'menu' && c.etapa !== 'assistente' && c.etapa !== 'aulas';

export interface Aviso { titulo: string; corpo: string; link: string; tag: string }

/** O que aparece na notificação. Uma por conversa: a nova troca a anterior. */
export function textoDoAviso(c: Pick<Conversa, 'id' | 'nome' | 'waId'>, previa: string): Aviso {
  const corpo = (previa || '').replace(/\s+/g, ' ').trim();
  return {
    titulo: c.nome || `+${c.waId}`,
    corpo: corpo.length > 140 ? `${corpo.slice(0, 139)}…` : corpo || 'Mensagem nova',
    link: `/conversas?conversa=${c.id}`,
    tag: `conversa-${c.id}`,
  };
}

/** As conversas que ganharam mensagem do contato desde a última olhada (o número de
    não lidas subiu). Na primeira olhada nada é novo: é só o retrato de agora. */
export function chegaramAgora(
  antes: ReadonlyMap<string, number> | null,
  agora: Pick<Conversa, 'id' | 'naoLidas'>[],
): string[] {
  if (!antes) return [];
  return agora.filter((c) => (c.naoLidas || 0) > (antes.get(c.id) ?? 0)).map((c) => c.id);
}

/** Erros do Firebase que dizem que o aparelho não recebe mais: o registro sai. */
export const aparelhoSumiu = (codigo?: string) =>
  codigo === 'messaging/registration-token-not-registered' || codigo === 'messaging/invalid-registration-token'
  || codigo === 'messaging/invalid-argument';
