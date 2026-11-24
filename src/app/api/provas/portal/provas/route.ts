/* As provas do aluno no portal, com o estado de agora (bloqueada, liberada, iniciada,
   concluída). O id do portal vem do aluno na central, nunca do navegador. */
import { provasDoAluno } from '@/lib/provas-portal/fluxo';
import { dependencias } from '@/lib/provas-portal/servidor';
import { quebrou, quemDaRota, responde, semLogin } from '@/lib/provas-portal/rota';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const quem = await quemDaRota(req);
  if (!quem) return semLogin();
  try {
    const alunoId = new URL(req.url).searchParams.get('alunoId') || '';
    return responde(await provasDoAluno(dependencias(), { quem, alunoId }), 'lista');
  } catch (e) { return quebrou('consulta de provas no portal', e); }
}
