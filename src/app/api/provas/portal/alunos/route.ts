/* Procura alunos no portal para o vínculo (nome, e-mail ou código). Quem escolhe e
   confirma é a pessoa; nada é vinculado aqui. */
import { buscaNoPortal } from '@/lib/provas-portal/fluxo';
import { dependencias } from '@/lib/provas-portal/servidor';
import { quebrou, quemDaRota, responde, semLogin } from '@/lib/provas-portal/rota';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const quem = await quemDaRota(req);
  if (!quem) return semLogin();
  try {
    const busca = new URL(req.url).searchParams.get('busca') || '';
    return responde(await buscaNoPortal(dependencias(), { quem, busca }), 'alunos');
  } catch (e) { return quebrou('busca de alunos no portal', e); }
}
