/* Vincular (POST) e desvincular (DELETE) o aluno da central ao aluno do portal. O
   vínculo só muda por aqui: as regras do Firestore não deixam o navegador gravar os
   campos portal*, e cada mudança fica em provas_portal_log com quem fez. */
import { desvincula, vincula } from '@/lib/provas-portal/fluxo';
import { dependencias } from '@/lib/provas-portal/servidor';
import { corpoDe, quebrou, quemDaRota, responde, semLogin, texto } from '@/lib/provas-portal/rota';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const quem = await quemDaRota(req);
  if (!quem) return semLogin();
  try {
    const c = await corpoDe(req);
    return responde(await vincula(dependencias(), { quem, alunoId: texto(c.alunoId), portalStudentId: texto(c.portalStudentId) }), 'aluno');
  } catch (e) { return quebrou('vínculo com o portal', e); }
}

export async function DELETE(req: Request) {
  const quem = await quemDaRota(req);
  if (!quem) return semLogin();
  try {
    const c = await corpoDe(req);
    return responde(await desvincula(dependencias(), { quem, alunoId: texto(c.alunoId) }));
  } catch (e) { return quebrou('desvínculo do portal', e); }
}
