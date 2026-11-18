/* Quem manda mensagem pelo painel passa por aqui. A action grava, a Meta entrega.
   Qualquer pessoa ativa do time pode chamar: é o atendente respondendo. */
import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminBd, quemChamou } from '@/lib/firebase/admin';
import { mandaTemplate, mandaTexto } from '@/lib/whatsapp/cloud';
import type { Conversa } from '@/lib/dominio/tipos';

export async function POST(req: Request) {
  const quem = await quemChamou(req);
  if (!quem) return NextResponse.json({ ok: false, erro: 'Faça login de novo.' }, { status: 401 });

  const corpo = (await req.json()) as {
    conversaId?: string; texto?: string; template?: string; idioma?: string; variaveis?: string[];
  };
  if (!corpo.conversaId) return NextResponse.json({ ok: false, erro: 'Falta dizer qual conversa.' }, { status: 400 });

  const bd = adminBd();
  const ref = bd.doc(`conversas/${corpo.conversaId}`);
  const snap = await ref.get();
  if (!snap.exists) return NextResponse.json({ ok: false, erro: 'Conversa não encontrada.' }, { status: 404 });
  const conversa = snap.data() as Conversa;

  const resposta = corpo.template
    ? await mandaTemplate(conversa.waId, corpo.template, corpo.idioma || 'pt_BR', corpo.variaveis || [])
    : await mandaTexto(conversa.waId, (corpo.texto || '').trim());

  const agora = new Date().toISOString();
  const texto = corpo.texto?.trim() || `(modelo ${corpo.template})`;

  await bd.collection('mensagens').add({
    conversaId: corpo.conversaId,
    direcao: 'saida',
    autor: 'humano',
    autorNome: quem.nome,
    texto,
    template: corpo.template || null,
    waMessageId: resposta.waMessageId || null,
    falhouEm: resposta.ok ? null : agora,
    falhaMotivo: resposta.ok ? null : resposta.erro || null,
    criadaEm: agora,
  });

  /* a primeira resposta de gente desliga o Lumi: quem fala agora é o time */
  await ref.update({
    ultimaEm: agora,
    ultimaPreviaTexto: texto,
    agenteAtivo: false,
    estado: conversa.estado === 'encerrada' ? 'aberta' : conversa.estado,
    aguardandoDesde: FieldValue.delete(),
  });

  if (!resposta.ok) return NextResponse.json({ ok: false, erro: resposta.erro }, { status: 200 });
  return NextResponse.json({ ok: true, waMessageId: resposta.waMessageId });
}
