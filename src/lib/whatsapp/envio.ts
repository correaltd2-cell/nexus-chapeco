/* O que todo envio da equipe grava depois de a Meta responder: a mensagem na conversa e
   a conversa atualizada. Mora aqui para a rota de envio do painel e o envio de prova do
   portal gravarem igual (e a prova aparecer na conversa como qualquer mensagem). */
import 'server-only';
import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { camposDaFalaDaEscola } from '@/lib/whatsapp/automatico';
import type { RespostaEnvio } from '@/lib/whatsapp/cloud';
import type { Conversa } from '@/lib/dominio/tipos';

export async function gravaSaidaDaEquipe(bd: Firestore, conversaId: string, conversa: Conversa, p: {
  autorNome: string;
  texto: string;
  previa: string;
  resposta: RespostaEnvio;
  modelo?: { nome: string; respostas: string[] } | null;
  assinadaComo?: string;
  anexo?: Record<string, string>;
  extras?: Record<string, unknown>;
}): Promise<string> {
  const agora = new Date().toISOString();
  const modelo = p.modelo || null;
  const msg = await bd.collection('mensagens').add({
    conversaId,
    direcao: 'saida',
    autor: 'humano',
    autorNome: p.autorNome,
    texto: p.texto,
    ...(p.anexo || {}),
    template: modelo?.nome || null,
    ...(p.assinadaComo ? { assinadaComo: p.assinadaComo } : {}),
    ...(modelo?.respostas.length ? { botoes: modelo.respostas } : {}),
    ...(p.extras || {}),
    waMessageId: p.resposta.waMessageId || null,
    falhouEm: p.resposta.ok ? null : agora,
    falhaMotivo: p.resposta.ok ? null : p.resposta.erro || null,
    criadaEm: agora,
  });

  /* a primeira resposta de gente desliga o atendimento automático: quem fala agora é o
     time. A etapa vira "gente", senão o "Confirmo" de um modelo cairia no menu da
     saudação. Texto e arquivo ligam o relógio do follow-up; modelo não: é aviso, e o
     contato responde quando puder */
  await bd.doc(`conversas/${conversaId}`).update({
    ultimaEm: agora,
    ultimaPreviaTexto: p.previa,
    agenteAtivo: false,
    etapa: 'gente',
    tentativasMenu: FieldValue.delete(),
    estado: conversa.estado === 'encerrada' || conversa.estado === 'ia' ? 'aberta' : conversa.estado,
    aguardandoDesde: FieldValue.delete(),
    ...(p.resposta.ok ? camposDaFalaDaEscola(agora, !modelo) : {}),
  });
  return msg.id;
}
