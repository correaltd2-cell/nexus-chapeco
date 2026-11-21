/* Os avisos no aparelho de quem está logado: ligar (guarda o endereço do push),
   desligar, e mandar um aviso de teste para conferir se chega. */
import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { adminBd, quemChamou } from '@/lib/firebase/admin';
import { mandaAviso } from '@/lib/avisos';

export const dynamic = 'force-dynamic';

const idDoAparelho = (token: string) => createHash('sha256').update(token).digest('hex').slice(0, 40);

export async function POST(req: Request) {
  const quem = await quemChamou(req);
  if (!quem) return NextResponse.json({ ok: false, erro: 'Faça login de novo.' }, { status: 401 });
  const { acao, token, aparelho } = (await req.json().catch(() => ({}))) as { acao?: string; token?: string; aparelho?: string };
  const bd = adminBd();

  if (acao === 'ligar' || acao === 'desligar') {
    if (!token || token.length > 4096) return NextResponse.json({ ok: false, erro: 'Falta o endereço do aparelho.' }, { status: 400 });
    const ref = bd.doc(`dispositivos/${idDoAparelho(token)}`);
    if (acao === 'desligar') {
      const atual = await ref.get();
      if (atual.exists && atual.data()?.uid === quem.uid) await ref.delete();
      return NextResponse.json({ ok: true });
    }
    await ref.set({ uid: quem.uid, token, aparelho: (aparelho || '').slice(0, 80), criadoEm: new Date().toISOString() });
    return NextResponse.json({ ok: true });
  }

  if (acao === 'testar') {
    try {
      const n = await mandaAviso(bd, [quem.uid], {
        titulo: 'Nexus Chapecó',
        corpo: 'Os avisos de mensagem nova estão funcionando neste aparelho.',
        link: '/ajustes#avisos',
        tag: 'teste',
      });
      if (!n) return NextResponse.json({ ok: false, erro: 'Nenhum aparelho seu está com os avisos ligados.' });
      return NextResponse.json({ ok: true, aparelhos: n });
    } catch {
      return NextResponse.json({ ok: false, erro: 'O Firebase não mandou o aviso. Confira se o Cloud Messaging está ativo no projeto.' });
    }
  }
  return NextResponse.json({ ok: false, erro: 'Ação desconhecida.' }, { status: 400 });
}
