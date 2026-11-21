/* A assinatura de quem envia, no servidor: liga e desliga em config/atendimento
   (assinarMensagens, nasce ligada) e o nome vem do perfil de quem mandou. */
import 'server-only';
import type { Firestore } from 'firebase-admin/firestore';
import { leAtendimento } from '@/lib/dominio/config';
import { nomeDaAssinatura } from '@/lib/dominio/assinatura';

/** O nome que assina a mensagem desta pessoa, ou vazio quando a escola desligou. */
export async function assinaturaDe(bd: Firestore, uid: string | undefined): Promise<string> {
  if (!uid) return '';
  const [cfg, perfil] = await Promise.all([bd.doc('config/atendimento').get(), bd.doc(`perfis/${uid}`).get()]);
  if (!leAtendimento(cfg.data() as Parameters<typeof leAtendimento>[0]).assinarMensagens) return '';
  const p = perfil.data() as { nome?: string; assinatura?: string } | undefined;
  return p ? nomeDaAssinatura(p) : '';
}
