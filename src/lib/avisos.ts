/* O push de mensagem nova no celular da equipe, pelo Firebase Cloud Messaging.
   Cada aparelho que ligou os avisos fica em `dispositivos` (quem é e o endereço do
   push), gravado pela rota /api/avisos. Quando o contato escreve e a conversa está com
   gente, avisa quem é do setor dela. As regras moram em src/lib/dominio/avisos.ts.
   Aviso é extra: se falhar, a mensagem já está gravada e aparece na lista. */
import 'server-only';
import type { Firestore } from 'firebase-admin/firestore';
import { adminMensageiro } from '@/lib/firebase/admin';
import { aparelhoSumiu, comGente, recebeAviso, textoDoAviso, type Aviso } from '@/lib/dominio/avisos';
import type { Conversa, Perfil } from '@/lib/dominio/tipos';

export interface Dispositivo { uid: string; token: string; aparelho?: string; criadoEm: string }

/** Os aparelhos destas pessoas (o Firestore aceita 30 por consulta). */
async function aparelhosDe(bd: Firestore, uids: string[]) {
  const docs = [];
  for (let i = 0; i < uids.length; i += 30) {
    const r = await bd.collection('dispositivos').where('uid', 'in', uids.slice(i, i + 30)).get();
    docs.push(...r.docs);
  }
  return docs;
}

/** Manda o aviso e tira os aparelhos que não recebem mais. Devolve quantos receberam. */
export async function mandaAviso(bd: Firestore, uids: string[], aviso: Aviso) {
  if (!uids.length) return 0;
  const docs = await aparelhosDe(bd, uids);
  if (!docs.length) return 0;
  const r = await adminMensageiro().sendEachForMulticast({
    tokens: docs.map((d) => (d.data() as Dispositivo).token),
    data: { ...aviso },
    webpush: { headers: { Urgency: 'high', TTL: '3600' } },
  });
  await Promise.all(r.responses.map((x, i) =>
    (!x.success && aparelhoSumiu(x.error?.code) ? docs[i].ref.delete() : null)));
  return r.successCount;
}

/** O contato escreveu: avisa quem é do setor, se a conversa já está com gente. */
export async function avisaEquipe(bd: Firestore, conversaId: string) {
  try {
    const snap = await bd.doc(`conversas/${conversaId}`).get();
    const c = { ...(snap.data() as Conversa), id: snap.id };
    if (!snap.exists || !comGente(c)) return;
    const perfis = await bd.collection('perfis').where('ativo', '==', true).get();
    const uids = perfis.docs.filter((d) => recebeAviso(d.data() as Perfil, c.setor)).map((d) => d.id);
    await mandaAviso(bd, uids, textoDoAviso(c, c.ultimaPreviaTexto));
  } catch (e) {
    console.error('[avisos]', conversaId, e instanceof Error ? e.message : e);
  }
}
