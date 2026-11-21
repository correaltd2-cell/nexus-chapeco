/* A marcação da semana na planilha de alunos do sistema. GET: as últimas semanas
   (quantos marcaram e quem não marcou). POST: começa a semana nova, guardando a que
   acabou e desmarcando a coluna Marcou dos ativos, tudo de uma vez. Fica no servidor
   porque o histórico (coleção semanas) só o servidor grava e lê. */
import { NextResponse } from 'next/server';
import type { WriteBatch } from 'firebase-admin/firestore';
import { adminBd, quemChamou } from '@/lib/firebase/admin';
import { fechaSemana, idDaSemana, type AlunoDaGrade, type RegistroDaSemana } from '@/lib/dominio/alunos';
import { descreveErro, falhou } from '@/lib/saude';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const recusa = (erro: string, status = 200) => NextResponse.json({ ok: false, erro }, { status });
const PODE = ['admin', 'gestor', 'recepcao'];

export async function GET(req: Request) {
  const quem = await quemChamou(req);
  if (!quem) return recusa('Faça login de novo.', 401);
  try {
    const s = await adminBd().collection('semanas').orderBy('quando', 'desc').limit(12).get();
    return NextResponse.json({ ok: true, semanas: s.docs.map((d) => ({ id: d.id, ...(d.data() as RegistroDaSemana) })) });
  } catch (e) {
    await falhou('alunos', descreveErro(e));
    return recusa('Não consegui ler as semanas agora.');
  }
}

export async function POST(req: Request) {
  const quem = await quemChamou(req);
  if (!quem) return recusa('Faça login de novo.', 401);
  if (!PODE.includes(quem.papel)) return recusa('Começar a semana nova é da recepção e da gestão.', 403);
  const bd = adminBd();
  try {
    const s = await bd.collection('alunos').get();
    const alunos = s.docs.map((d) => ({ ...(d.data() as AlunoDaGrade), id: d.id }));
    const quando = new Date().toISOString();
    const { registro, limpar } = fechaSemana(alunos, quando, quem.nome || 'Equipe');
    /* o registro vai no primeiro lote: se algo falhar no meio, a semana está guardada */
    const ops = [
      (l: WriteBatch) => l.set(bd.doc(`semanas/${idDaSemana(quando)}`), registro),
      ...limpar.map((id) => (l: WriteBatch) => l.update(bd.doc(`alunos/${id}`), { marcouSemana: false, atualizadoEm: quando })),
    ];
    for (let i = 0; i < ops.length; i += 450) {
      const lote = bd.batch();
      ops.slice(i, i + 450).forEach((op) => op(lote));
      await lote.commit();
    }
    return NextResponse.json({ ok: true, registro, limpos: limpar.length });
  } catch (e) {
    await falhou('alunos', descreveErro(e));
    return recusa('Não consegui começar a semana nova agora. Tente de novo em instantes.');
  }
}
