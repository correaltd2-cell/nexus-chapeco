/* O botão "Enviar lembrete no WhatsApp" do modal da aula. Quem cuida da agenda pode. */
import { NextResponse } from 'next/server';
import { adminBd, quemChamou } from '@/lib/firebase/admin';
import { mandaLembrete } from '@/lib/agenda-servidor';
import { permissoesDe } from '@/lib/dominio/agenda';
import { descreveErro, falhou } from '@/lib/saude';
import type { Papel } from '@/lib/dominio/tipos';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const quem = await quemChamou(req);
  if (!quem) return NextResponse.json({ ok: false, erro: 'Faça login de novo.' }, { status: 401 });
  if (!permissoesDe(quem.papel as Papel).editarDados) {
    return NextResponse.json({ ok: false, erro: 'Só quem cuida da agenda manda lembrete.' }, { status: 403 });
  }
  const { agendamentoId } = (await req.json().catch(() => ({}))) as { agendamentoId?: string };
  if (!agendamentoId) return NextResponse.json({ ok: false, erro: 'Falta dizer qual aula.' }, { status: 400 });
  try {
    const r = await mandaLembrete(adminBd(), agendamentoId, { id: quem.uid, nome: quem.nome });
    return NextResponse.json(r);
  } catch (e) {
    await falhou('agenda', `Lembrete manual: ${descreveErro(e)}`);
    return NextResponse.json({ ok: false, erro: 'Não consegui mandar agora. Tente de novo.' }, { status: 500 });
  }
}
