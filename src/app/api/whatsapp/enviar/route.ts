/* Quem manda mensagem pelo painel passa por aqui. A action grava, a Meta entrega.
   Qualquer pessoa ativa do time pode chamar: é o atendente respondendo. */
import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminBd, quemChamou } from '@/lib/firebase/admin';
import { mandaTemplate, mandaTexto } from '@/lib/whatsapp/cloud';
import { camposDaFalaDaEscola } from '@/lib/whatsapp/automatico';
import { leModelo } from '@/lib/whatsapp/modelos';
import { limpaValor, preenche, quantasVariaveis } from '@/lib/dominio/modelos';
import type { Conversa } from '@/lib/dominio/tipos';

export async function POST(req: Request) {
  const quem = await quemChamou(req);
  if (!quem) return NextResponse.json({ ok: false, erro: 'Faça login de novo.' }, { status: 401 });

  /* texto livre, ou um modelo aprovado (o id em `templates`) com os valores dos campos */
  const corpo = (await req.json()) as { conversaId?: string; texto?: string; modelo?: string; valores?: string[] };
  if (!corpo.conversaId) return NextResponse.json({ ok: false, erro: 'Falta dizer qual conversa.' }, { status: 400 });

  const bd = adminBd();
  const ref = bd.doc(`conversas/${corpo.conversaId}`);
  const snap = await ref.get();
  if (!snap.exists) return NextResponse.json({ ok: false, erro: 'Conversa não encontrada.' }, { status: 404 });
  const conversa = snap.data() as Conversa;

  /* o modelo vem do banco, não do navegador: o texto gravado é o que a Meta aprovou */
  const modelo = corpo.modelo ? await leModelo(bd, corpo.modelo) : null;
  if (corpo.modelo && (!modelo || modelo.estado !== 'aprovado')) {
    return NextResponse.json({ ok: false, erro: 'Esse modelo não está aprovado pela Meta. Confira em Configurações, Modelos de mensagem.' });
  }
  const valores = (corpo.valores || []).map(limpaValor);
  if (modelo && (valores.length !== quantasVariaveis(modelo.corpo) || valores.some((v) => !v))) {
    return NextResponse.json({ ok: false, erro: 'Preencha todos os campos do modelo antes de enviar.' });
  }
  if (!modelo && !(corpo.texto || '').trim()) {
    return NextResponse.json({ ok: false, erro: 'Escreva a mensagem antes de enviar.' }, { status: 400 });
  }

  const resposta = modelo
    ? await mandaTemplate(conversa.waId, modelo.nome, modelo.idioma, valores)
    : await mandaTexto(conversa.waId, (corpo.texto || '').trim());

  const agora = new Date().toISOString();
  const texto = modelo ? preenche(modelo.corpo, valores) : (corpo.texto || '').trim();

  await bd.collection('mensagens').add({
    conversaId: corpo.conversaId,
    direcao: 'saida',
    autor: 'humano',
    autorNome: quem.nome,
    texto,
    template: modelo?.nome || null,
    ...(modelo?.respostas.length ? { botoes: modelo.respostas } : {}),
    waMessageId: resposta.waMessageId || null,
    falhouEm: resposta.ok ? null : agora,
    falhaMotivo: resposta.ok ? null : resposta.erro || null,
    criadaEm: agora,
  });

  /* a primeira resposta de gente desliga o atendimento automático: quem fala agora é o
     time. A etapa vira "gente", senão o "Confirmo" de um modelo cairia no menu da
     saudação. Texto liga o relógio do follow-up; modelo não: é aviso, e o contato
     responde quando puder */
  await ref.update({
    ultimaEm: agora,
    ultimaPreviaTexto: texto,
    agenteAtivo: false,
    etapa: 'gente',
    tentativasMenu: FieldValue.delete(),
    estado: conversa.estado === 'encerrada' || conversa.estado === 'ia' ? 'aberta' : conversa.estado,
    aguardandoDesde: FieldValue.delete(),
    ...(resposta.ok ? camposDaFalaDaEscola(agora, !modelo) : {}),
  });

  if (!resposta.ok) return NextResponse.json({ ok: false, erro: resposta.erro }, { status: 200 });
  return NextResponse.json({ ok: true, waMessageId: resposta.waMessageId });
}
