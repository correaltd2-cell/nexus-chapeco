/* O relógio do atendimento automático. A Vercel chama de minuto em minuto (vercel.json)
   com o CRON_SECRET: manda o 1º follow-up, encerra quem não respondeu, se despede de
   quem já resolveu e devolve para a Recepção a conversa que um setor não respondeu.
   Com a chave mestra desligada, não faz nada, mas bate o ponto mesmo assim: é por
   essa batida que a gestão sabe que o relógio está vivo antes de ligar. */
import { NextResponse } from 'next/server';
import { adminBd, ehChamadaDeServico } from '@/lib/firebase/admin';
import { rodaRelogios } from '@/lib/whatsapp/automatico';
import { bate, descreveErro, falhou } from '@/lib/saude';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(req: Request) {
  if (!ehChamadaDeServico(req)) {
    return NextResponse.json({ ok: false, erro: 'Sem autorização.' }, { status: 401 });
  }
  await bate('relogioEm');
  try {
    const feito = await rodaRelogios(adminBd());
    return NextResponse.json({ ok: true, ...feito });
  } catch (e) {
    await falhou('relogio', descreveErro(e));
    return NextResponse.json({ ok: false, erro: 'O relógio falhou nesta rodada.' }, { status: 500 });
  }
}
