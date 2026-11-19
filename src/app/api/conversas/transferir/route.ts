/* Passar a conversa para um setor. Mora no servidor porque a Coordenação e a
   Coordenação Kids recebem o aviso no celular pessoal, por modelo aprovado, e isso usa
   o token do WhatsApp. A Coordenação nunca recebe direto do aluno: só por aqui. */
import { NextResponse } from 'next/server';
import { adminBd, quemChamou } from '@/lib/firebase/admin';
import { transfere } from '@/lib/whatsapp/automatico';
import { SETORES, veSetor } from '@/lib/dominio/acessos';
import type { Conversa, Papel, Setor } from '@/lib/dominio/tipos';

export const dynamic = 'force-dynamic';

const erro = (texto: string, status = 400) => NextResponse.json({ ok: false, erro: texto }, { status });

export async function POST(req: Request) {
  const quem = await quemChamou(req);
  if (!quem) return erro('Faça login de novo.', 401);
  const corpo = (await req.json().catch(() => ({}))) as { conversaId?: string; setor?: Setor };
  if (!corpo.conversaId) return erro('Falta dizer qual conversa.');
  if (!corpo.setor || !SETORES.includes(corpo.setor)) return erro('Setor desconhecido.');

  const bd = adminBd();
  const ref = bd.doc(`conversas/${corpo.conversaId}`);
  const snap = await ref.get();
  if (!snap.exists) return erro('Conversa não encontrada.', 404);
  const conversa = { id: snap.id, ...snap.data() } as Conversa;
  if (!veSetor(quem.papel as Papel, quem.setores as Setor[], conversa.setor)) {
    return erro('Essa conversa é de um setor que você não atende.', 403);
  }
  if (conversa.setor === corpo.setor) return NextResponse.json({ ok: true, avisos: [] });

  const avisos = await transfere(bd, ref, conversa, corpo.setor, quem.nome || 'Alguém do time');
  return NextResponse.json({ ok: true, avisos });
}
