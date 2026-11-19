/* O relógio do atendimento automático. A Vercel chama de minuto em minuto (vercel.json)
   com o CRON_SECRET: manda o 1º follow-up, encerra quem não respondeu, se despede de
   quem já resolveu e devolve para a Recepção a conversa que um setor não respondeu.
   Com a chave mestra desligada, não faz nada. */
import { NextResponse } from 'next/server';
import { adminBd, ehChamadaDeServico } from '@/lib/firebase/admin';
import { rodaRelogios } from '@/lib/whatsapp/automatico';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(req: Request) {
  if (!ehChamadaDeServico(req)) {
    return NextResponse.json({ ok: false, erro: 'Sem autorização.' }, { status: 401 });
  }
  try {
    const feito = await rodaRelogios(adminBd());
    return NextResponse.json({ ok: true, ...feito });
  } catch (e) {
    console.error('[cron atendimento]', e);
    return NextResponse.json({ ok: false, erro: 'O relógio falhou nesta rodada.' }, { status: 500 });
  }
}
