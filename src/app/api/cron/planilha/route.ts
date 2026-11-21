/* De hora em hora (vercel.json): se a escola ligou "atualizar sozinho", lê a planilha
   de alunos e aplica, como o Atualizar agora da tela. */
import { NextResponse } from 'next/server';
import { adminBd, ehChamadaDeServico } from '@/lib/firebase/admin';
import { ErroDaPlanilha, importa, type ConfigDaPlanilha } from '@/lib/planilha';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function GET(req: Request) {
  if (!ehChamadaDeServico(req)) return NextResponse.json({ ok: false, erro: 'Sem autorização.' }, { status: 401 });
  const bd = adminBd();
  const cfg = (await bd.doc('config/planilha').get()).data() as ConfigDaPlanilha | undefined;
  if (!cfg?.planilhaId || !cfg.automatico) return NextResponse.json({ ok: true, feito: 'desligado' });
  try {
    const resumo = await importa(bd, { planilhaId: cfg.planilhaId, aba: cfg.aba, mapa: cfg.mapa || {}, automatico: true }, 'atualização automática');
    return NextResponse.json({ ok: true, resumo });
  } catch (e) {
    /* o motivo já ficou em config/planilha.erro para a tela; falha inesperada já foi para a saúde */
    return NextResponse.json({ ok: false, erro: e instanceof ErroDaPlanilha ? e.message : 'falhou' });
  }
}
