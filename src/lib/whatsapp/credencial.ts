/* De onde vem o token do WhatsApp. Dois jeitos, nesta ordem:
   1. variáveis da Vercel (WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID,
      WHATSAPP_BUSINESS_ACCOUNT_ID), para quem ligou o número à mão;
   2. o que a conexão por coexistência (Embedded Signup) gravou em segredos/whatsapp.
   A coleção `segredos` não tem regra no Firestore, então cai no "nega tudo": só o
   servidor, com a chave de serviço, lê. O token nunca chega ao navegador. */
import 'server-only';
import { adminBd } from '@/lib/firebase/admin';

export interface Credencial {
  token: string;
  numeroId: string;
  wabaId: string;
  origem: 'ambiente' | 'coexistencia';
}

let guardada: { c: Credencial | null; em: number } | null = null;
const VALIDADE_MS = 60_000;

export async function credencial(): Promise<Credencial | null> {
  const { WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_BUSINESS_ACCOUNT_ID } = process.env;
  if (WHATSAPP_TOKEN && WHATSAPP_PHONE_NUMBER_ID) {
    return { token: WHATSAPP_TOKEN, numeroId: WHATSAPP_PHONE_NUMBER_ID, wabaId: WHATSAPP_BUSINESS_ACCOUNT_ID || '', origem: 'ambiente' };
  }
  if (guardada && Date.now() - guardada.em < VALIDADE_MS) return guardada.c;
  try {
    const d = (await adminBd().doc('segredos/whatsapp').get()).data() as
      { token?: string; numeroId?: string; wabaId?: string } | undefined;
    const c = d?.token && d.numeroId
      ? { token: d.token, numeroId: d.numeroId, wabaId: d.wabaId || '', origem: 'coexistencia' as const }
      : null;
    guardada = { c, em: Date.now() };
    return c;
  } catch {
    return null;
  }
}

/** Depois de conectar de novo, a próxima mensagem já usa o token novo. */
export function esqueceCredencial() {
  guardada = null;
}

export const whatsConectado = async () => Boolean(await credencial());
