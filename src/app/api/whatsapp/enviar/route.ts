/* Quem manda mensagem pelo painel passa por aqui. A action grava, a Meta entrega.
   Qualquer pessoa ativa do time pode chamar: é o atendente respondendo.
   Três jeitos de sair: texto livre, modelo aprovado, ou arquivo (foto, áudio, vídeo,
   documento) que o navegador já subiu para o Storage, na pasta da conversa. */
import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminArquivos, adminBd, quemChamou } from '@/lib/firebase/admin';
import { mandaMidia, mandaTemplate, mandaTexto, sobeMidia, type RespostaEnvio } from '@/lib/whatsapp/cloud';
import { camposDaFalaDaEscola } from '@/lib/whatsapp/automatico';
import { leModelo } from '@/lib/whatsapp/modelos';
import { limpaValor, preenche, quantasVariaveis } from '@/lib/dominio/modelos';
import { caminhoEhDaConversa, comoEnviar, nomeSeguro, previaDaMidia } from '@/lib/dominio/midia';
import { webmParaOgg } from '@/lib/dominio/ogg';
import type { Conversa } from '@/lib/dominio/tipos';

export const dynamic = 'force-dynamic';

interface Corpo {
  conversaId?: string;
  texto?: string;                                         // o texto, ou a legenda do arquivo
  modelo?: string; valores?: string[];                    // modelo aprovado (id em `templates`)
  midia?: { caminho?: string; nome?: string; mime?: string }; // arquivo já no Storage
}

const recusa = (erro: string, status = 200) => NextResponse.json({ ok: false, erro }, { status });

export async function POST(req: Request) {
  const quem = await quemChamou(req);
  if (!quem) return recusa('Faça login de novo.', 401);

  const corpo = (await req.json()) as Corpo;
  if (!corpo.conversaId) return recusa('Falta dizer qual conversa.', 400);

  const bd = adminBd();
  const ref = bd.doc(`conversas/${corpo.conversaId}`);
  const snap = await ref.get();
  if (!snap.exists) return recusa('Conversa não encontrada.', 404);
  const conversa = snap.data() as Conversa;
  const legenda = (corpo.texto || '').trim();

  /* o modelo vem do banco, não do navegador: o texto gravado é o que a Meta aprovou */
  const modelo = corpo.modelo ? await leModelo(bd, corpo.modelo) : null;
  if (corpo.modelo && (!modelo || modelo.estado !== 'aprovado')) {
    return recusa('Esse modelo não está aprovado pela Meta. Confira em Configurações, Modelos de mensagem.');
  }
  const valores = (corpo.valores || []).map(limpaValor);
  if (modelo && (valores.length !== quantasVariaveis(modelo.corpo) || valores.some((v) => !v))) {
    return recusa('Preencha todos os campos do modelo antes de enviar.');
  }
  if (!modelo && !corpo.midia && !legenda) return recusa('Escreva a mensagem antes de enviar.', 400);

  let resposta: RespostaEnvio;
  let texto: string;
  let previa: string;
  let anexo: Record<string, string> = {};

  if (modelo) {
    resposta = await mandaTemplate(conversa.waId, modelo.nome, modelo.idioma, valores);
    texto = preenche(modelo.corpo, valores);
    previa = texto;
  } else if (corpo.midia) {
    const caminho = corpo.midia.caminho || '';
    if (!caminhoEhDaConversa(caminho, corpo.conversaId)) return recusa('Esse arquivo não é desta conversa.', 400);
    const arquivo = adminArquivos().bucket().file(caminho);
    const [existe] = await arquivo.exists();
    if (!existe) return recusa('O arquivo não terminou de subir. Tente de novo.');
    const [[bytes], [info]] = await Promise.all([arquivo.download(), arquivo.getMetadata()]);
    const nome = corpo.midia.nome || caminho.split('/').pop() || 'arquivo';
    const como = comoEnviar(String(info.contentType || corpo.midia.mime || ''), bytes.length);
    if ('erro' in como) return recusa(como.erro);

    /* o áudio gravado no Chrome sai em WebM; a Meta só aceita o mesmo som dentro de OGG */
    let paraMeta: Uint8Array = bytes;
    let mimeMeta = como.mime;
    let nomeMeta = nomeSeguro(nome);
    if (como.mime === 'audio/webm') {
      const ogg = webmParaOgg(bytes);
      if (!ogg) return recusa('Não consegui preparar esse áudio para o WhatsApp. Grave de novo.');
      paraMeta = ogg; mimeMeta = 'audio/ogg'; nomeMeta = 'audio.ogg';
    }
    const subiu = await sobeMidia(paraMeta, mimeMeta, nomeMeta);
    resposta = subiu.ok
      ? await mandaMidia(conversa.waId, como.tipo, subiu.id, { legenda, nome })
      : { ok: false, erro: subiu.erro };
    texto = como.tipo === 'audio' ? '' : legenda;
    previa = previaDaMidia(como.mime, nome, texto);
    anexo = { midiaPath: caminho, midiaMime: como.mime, ...(como.tipo === 'document' ? { midiaNome: nome } : {}) };
  } else {
    resposta = await mandaTexto(conversa.waId, legenda);
    texto = legenda;
    previa = texto;
  }

  const agora = new Date().toISOString();
  await bd.collection('mensagens').add({
    conversaId: corpo.conversaId,
    direcao: 'saida',
    autor: 'humano',
    autorNome: quem.nome,
    texto,
    ...anexo,
    template: modelo?.nome || null,
    ...(modelo?.respostas.length ? { botoes: modelo.respostas } : {}),
    waMessageId: resposta.waMessageId || null,
    falhouEm: resposta.ok ? null : agora,
    falhaMotivo: resposta.ok ? null : resposta.erro || null,
    criadaEm: agora,
  });

  /* a primeira resposta de gente desliga o atendimento automático: quem fala agora é o
     time. A etapa vira "gente", senão o "Confirmo" de um modelo cairia no menu da
     saudação. Texto e arquivo ligam o relógio do follow-up; modelo não: é aviso, e o
     contato responde quando puder */
  await ref.update({
    ultimaEm: agora,
    ultimaPreviaTexto: previa,
    agenteAtivo: false,
    etapa: 'gente',
    tentativasMenu: FieldValue.delete(),
    estado: conversa.estado === 'encerrada' || conversa.estado === 'ia' ? 'aberta' : conversa.estado,
    aguardandoDesde: FieldValue.delete(),
    ...(resposta.ok ? camposDaFalaDaEscola(agora, !modelo) : {}),
  });

  if (!resposta.ok) return recusa(resposta.erro || 'A Meta recusou o envio.');
  return NextResponse.json({ ok: true, waMessageId: resposta.waMessageId });
}
