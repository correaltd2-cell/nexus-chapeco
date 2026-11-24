/* Liberar e enviar: pede a liberação ao portal com a chave do clique (idempotência),
   espera a confirmação com o link e manda pelo WhatsApp. "retomar" repete o pedido com a
   MESMA chave quando o portal não confirmou. Ver src/lib/provas-portal/fluxo.ts. */
import { liberaEEnvia } from '@/lib/provas-portal/fluxo';
import { dependencias } from '@/lib/provas-portal/servidor';
import { corpoDe, quebrou, quemDaRota, responde, semLogin, texto } from '@/lib/provas-portal/rota';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: Request) {
  const quem = await quemDaRota(req);
  if (!quem) return semLogin();
  try {
    const c = await corpoDe(req);
    return responde(await liberaEEnvia(dependencias(), {
      quem, alunoId: texto(c.alunoId), provaId: texto(c.provaId), conversaId: texto(c.conversaId), chave: texto(c.chave), retomar: c.retomar === true,
    }), 'operacao');
  } catch (e) { return quebrou('liberação de prova', e); }
}
