/* Reenviar a mensagem de uma prova já liberada: pede só o link ao portal (nunca outra
   liberação) e manda de novo. A chave do clique evita mandar duas vezes. */
import { reenvia } from '@/lib/provas-portal/fluxo';
import { dependencias } from '@/lib/provas-portal/servidor';
import { corpoDe, quebrou, quemDaRota, responde, semLogin, texto } from '@/lib/provas-portal/rota';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: Request) {
  const quem = await quemDaRota(req);
  if (!quem) return semLogin();
  try {
    const c = await corpoDe(req);
    return responde(await reenvia(dependencias(), {
      quem, alunoId: texto(c.alunoId), provaId: texto(c.provaId), conversaId: texto(c.conversaId), chaveDoEnvio: texto(c.chave),
    }), 'operacao');
  } catch (e) { return quebrou('reenvio de prova', e); }
}
