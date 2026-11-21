/* De hora em hora (vercel.json): confere os modelos de mensagem com a Meta, manda para
   aprovação o que a biblioteca da escola tem e a Meta ainda não, e anota a situação de
   cada um. Assim um modelo aprovado ou recusado aparece sozinho em Configurações. */
import { NextResponse } from 'next/server';
import { adminBd, ehChamadaDeServico } from '@/lib/firebase/admin';
import { confereModelos } from '@/lib/whatsapp/modelos';
import { descreveErro, falhou } from '@/lib/saude';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  if (!ehChamadaDeServico(req)) {
    return NextResponse.json({ ok: false, erro: 'Sem autorização.' }, { status: 401 });
  }
  try {
    const resumo = await confereModelos(adminBd(), { criar: true });
    return NextResponse.json(resumo);
  } catch (e) {
    await falhou('modelos', descreveErro(e));
    return NextResponse.json({ ok: false, erro: 'A conferência dos modelos falhou nesta rodada.' }, { status: 500 });
  }
}
