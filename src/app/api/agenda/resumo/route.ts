/* O botão "Resumo com IA" do modal da aula. Roda no servidor: a chave da IA nunca vai
   ao navegador. Sem a IA ligada, devolve o resumo pelas contas e observações. */
import { NextResponse } from 'next/server';
import { adminBd, quemChamou } from '@/lib/firebase/admin';
import { resumosDaAula } from '@/lib/agenda-servidor';
import { descreveErro, falhou } from '@/lib/saude';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function POST(req: Request) {
  const quem = await quemChamou(req);
  if (!quem) return NextResponse.json({ ok: false, erro: 'Faça login de novo.' }, { status: 401 });
  const { agendamentoId } = (await req.json().catch(() => ({}))) as { agendamentoId?: string };
  if (!agendamentoId) return NextResponse.json({ ok: false, erro: 'Falta dizer qual aula.' }, { status: 400 });
  try {
    const resumos = await resumosDaAula(adminBd(), agendamentoId);
    return NextResponse.json({ ok: true, resumos });
  } catch (e) {
    await falhou('agenda', `Resumo da aula: ${descreveErro(e)}`);
    return NextResponse.json({ ok: false, erro: 'O resumo não saiu agora. Tente de novo em um minuto.' }, { status: 500 });
  }
}
