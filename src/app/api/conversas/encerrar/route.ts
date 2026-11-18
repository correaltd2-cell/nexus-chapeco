/* Quem está atendendo encerra o atendimento na hora, sem esperar o relógio. Com a chave
   do atendimento automático ligada e a despedida marcada, sai antes uma despedida curta
   escrita pela IA. A conversa volta para a Recepção, e a próxima mensagem do contato
   começa o fluxo de novo. */
import { NextResponse } from 'next/server';
import { adminBd, quemChamou } from '@/lib/firebase/admin';
import { encerraNaMao } from '@/lib/whatsapp/automatico';
import { veSetor } from '@/lib/dominio/acessos';
import type { Conversa, Papel, Setor } from '@/lib/dominio/tipos';

export const dynamic = 'force-dynamic';

const erro = (texto: string, status = 400) => NextResponse.json({ ok: false, erro: texto }, { status });

export async function POST(req: Request) {
  const quem = await quemChamou(req);
  if (!quem) return erro('Faça login de novo.', 401);
  const corpo = (await req.json().catch(() => ({}))) as { conversaId?: string };
  if (!corpo.conversaId) return erro('Falta dizer qual conversa.');

  const bd = adminBd();
  const ref = bd.doc(`conversas/${corpo.conversaId}`);
  const snap = await ref.get();
  if (!snap.exists) return erro('Conversa não encontrada.', 404);
  const conversa = { id: snap.id, ...snap.data() } as Conversa;
  if (!veSetor(quem.papel as Papel, quem.setores as Setor[], conversa.setor)) {
    return erro('Essa conversa é de um setor que você não atende.', 403);
  }
  if (conversa.estado === 'encerrada') return NextResponse.json({ ok: true, jaEstava: true });

  await encerraNaMao(bd, ref, conversa, quem.nome || 'Alguém do time');
  return NextResponse.json({ ok: true });
}
