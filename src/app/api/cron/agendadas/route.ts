/* As mensagens programadas saem por aqui. A Vercel chama de dez em dez minutos
   (ver vercel.json); fora da Vercel, qualquer agendador que mande o segredo serve.

   A janela de 24 horas é conferida NA HORA DE SAIR, nao na hora de programar: se
   ela fechou no meio do caminho, a mensagem nao vai em silencio. Ela fica marcada
   com o motivo, e o time ve isso no painel do contato e decide se manda um modelo. */
import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminBd } from '@/lib/firebase/admin';
import { mandaTexto, whatsConectado } from '@/lib/whatsapp/cloud';
import { janelaAberta } from '@/lib/dominio/formato';
import type { Conversa, MensagemAgendada } from '@/lib/dominio/tipos';

export const dynamic = 'force-dynamic';

function autorizado(req: Request) {
  const segredo = process.env.CRON_SECRET;
  if (!segredo) return false;
  return req.headers.get('authorization') === `Bearer ${segredo}`;
}

export async function GET(req: Request) {
  if (!autorizado(req)) {
    return NextResponse.json({ ok: false, erro: 'Sem autorização.' }, { status: 401 });
  }
  if (!(await whatsConectado())) {
    return NextResponse.json({ ok: false, erro: 'WhatsApp não conectado.' }, { status: 200 });
  }

  const bd = adminBd();
  const agora = new Date();
  const vencidas = await bd.collection('agendadas')
    .where('estado', '==', 'agendada')
    .where('quando', '<=', agora.toISOString())
    .orderBy('quando')
    .limit(50)
    .get();

  let enviadas = 0;
  let paradas = 0;

  for (const doc of vencidas.docs) {
    const a = { id: doc.id, ...doc.data() } as MensagemAgendada;
    const refConversa = bd.doc(`conversas/${a.conversaId}`);
    const snap = await refConversa.get();
    if (!snap.exists) {
      await doc.ref.update({ estado: 'falhou', motivo: 'A conversa não existe mais.' });
      paradas += 1;
      continue;
    }
    const conversa = snap.data() as Conversa;

    if (!janelaAberta(conversa, agora)) {
      await doc.ref.update({
        estado: 'falhou',
        motivo: 'A janela de 24 horas fechou antes da hora marcada. Para retomar, mande um modelo aprovado.',
      });
      paradas += 1;
      continue;
    }

    const resposta = await mandaTexto(conversa.waId, a.texto);
    const quando = new Date().toISOString();

    await bd.collection('mensagens').add({
      conversaId: a.conversaId,
      direcao: 'saida',
      autor: 'humano',
      autorNome: a.autorNome,
      texto: a.texto,
      waMessageId: resposta.waMessageId || null,
      falhouEm: resposta.ok ? null : quando,
      falhaMotivo: resposta.ok ? null : resposta.erro || null,
      criadaEm: quando,
    });

    if (resposta.ok) {
      await refConversa.update({
        ultimaEm: quando,
        ultimaPreviaTexto: a.texto,
        agenteAtivo: false,
        aguardandoDesde: FieldValue.delete(),
      });
      await doc.ref.update({ estado: 'enviada' });
      enviadas += 1;
    } else {
      await doc.ref.update({ estado: 'falhou', motivo: resposta.erro || 'A Meta recusou o envio.' });
      paradas += 1;
    }
  }

  return NextResponse.json({ ok: true, enviadas, paradas });
}
