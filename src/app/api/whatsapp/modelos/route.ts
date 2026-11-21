/* O botão "Conferir com a Meta" das Configurações, e o "Mandar de novo" de um modelo
   recusado ou apagado. Só a gestão: criar modelo mexe na conta do WhatsApp da escola. */
import { NextResponse } from 'next/server';
import { adminBd, quemChamou } from '@/lib/firebase/admin';
import { confereModelos } from '@/lib/whatsapp/modelos';
import { modeloDaBiblioteca } from '@/lib/dominio/modelos';
import { descreveErro, falhou } from '@/lib/saude';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const quem = await quemChamou(req);
  if (!quem) return NextResponse.json({ ok: false, erro: 'Faça login de novo.' }, { status: 401 });
  if (quem.papel !== 'admin' && quem.papel !== 'gestor') {
    return NextResponse.json({ ok: false, erro: 'Só a administração mexe nos modelos.' }, { status: 403 });
  }
  const { acao, nome } = (await req.json().catch(() => ({}))) as { acao?: string; nome?: string };
  if (acao === 'mandar' && !(nome && modeloDaBiblioteca(nome))) {
    return NextResponse.json({ ok: false, erro: 'Esse modelo não está na biblioteca da escola.' }, { status: 400 });
  }
  try {
    const resumo = await confereModelos(adminBd(), { criar: true, forcar: acao === 'mandar' && nome ? [nome] : [] });
    return NextResponse.json(resumo);
  } catch (e) {
    const erro = descreveErro(e);
    await falhou('modelos', erro);
    return NextResponse.json({ ok: false, erro: 'Não consegui conferir agora. Tente de novo em um minuto.' }, { status: 500 });
  }
}
