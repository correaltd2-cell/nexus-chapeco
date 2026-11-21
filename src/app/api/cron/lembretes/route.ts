/* Todo dia às 18h de Chapecó (vercel.json): o lembrete de cada aula de amanhã ainda
   sem lembrete, para cada aluno, com os botões Confirmar e Remarcar. */
import { NextResponse } from 'next/server';
import { adminBd, ehChamadaDeServico } from '@/lib/firebase/admin';
import { lembretesDaVespera } from '@/lib/agenda-servidor';
import { descreveErro, falhou } from '@/lib/saude';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(req: Request) {
  if (!ehChamadaDeServico(req)) return NextResponse.json({ ok: false, erro: 'Sem autorização.' }, { status: 401 });
  try {
    return NextResponse.json({ ok: true, ...(await lembretesDaVespera(adminBd())) });
  } catch (e) {
    await falhou('agenda', `Lembretes da véspera: ${descreveErro(e)}`);
    return NextResponse.json({ ok: false, erro: 'Os lembretes falharam nesta rodada.' }, { status: 500 });
  }
}
