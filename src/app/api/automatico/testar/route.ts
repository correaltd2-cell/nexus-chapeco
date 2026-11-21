/* Testar antes de ligar. A gestão escolhe uma conversa de verdade e vê o que a IA
   mandaria (follow-up, encerramento, saudação), ou conversa com o assistente como se
   fosse aluno. Usa a configuração que está na tela, mesmo antes de salvar.
   NADA é enviado para ninguém: esta rota só lê e devolve o texto. */
import { NextResponse } from 'next/server';
import { adminBd, quemChamou } from '@/lib/firebase/admin';
import { escreveMensagem, iaLigada, respondeComoAssistente } from '@/lib/ia/claude';
import { contextoDe, linhasDoAtendimento } from '@/lib/whatsapp/automatico';
import {
  leAutomatico, promptMensagem, reservaDo, situacaoDoHorario, turnosDoAssistente,
  type ConfigAutomatico, type Linha, type Momento,
} from '@/lib/dominio/automatico';
import type { Conversa } from '@/lib/dominio/tipos';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MOMENTOS: Momento[] = ['saudacao', 'encaminha', 'followup', 'encerramento', 'despedida', 'fora'];

/** "Como se fosse fora do horário": a mesma conversa, hoje às 22h30 em Chapecó. */
function hojeDeNoite() {
  const dia = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
  return new Date(`${dia}T22:30:00-03:00`);
}
const erro = (texto: string, status = 400) => NextResponse.json({ ok: false, erro: texto }, { status });

export async function POST(req: Request) {
  const quem = await quemChamou(req);
  if (!quem) return erro('Faça login de novo.', 401);
  if (quem.papel !== 'admin' && quem.papel !== 'gestor') return erro('Quem testa a IA é a gestão.', 403);
  if (!iaLigada()) {
    return erro('A IA ainda não está ligada: falta a ANTHROPIC_API_KEY nas variáveis da Vercel. Até lá, sai o texto de reserva.', 200);
  }

  const corpo = (await req.json().catch(() => ({}))) as {
    config?: Partial<ConfigAutomatico>; tipo?: 'mensagem' | 'assistente';
    momento?: Momento; conversaId?: string; nome?: string; linhas?: Linha[]; foraDoHorario?: boolean;
  };
  const cfg = leAutomatico(corpo.config);
  const horario = situacaoDoHorario(cfg, corpo.foraDoHorario ? hojeDeNoite() : new Date());

  if (corpo.tipo === 'assistente') {
    const linhas = (Array.isArray(corpo.linhas) ? corpo.linhas : [])
      .filter((l) => l && (l.de === 'aluno' || l.de === 'escola') && typeof l.texto === 'string' && l.texto.trim())
      .slice(-20)
      .map((l) => ({ de: l.de, texto: l.texto.slice(0, 1000) }));
    if (!linhas.length || linhas[linhas.length - 1].de !== 'aluno') return erro('Escreva a mensagem do aluno.');
    const resposta = await respondeComoAssistente(
      turnosDoAssistente(cfg, { nome: corpo.nome || 'Aluno de teste', ehAluno: true, linhas, horario }));
    if (!resposta) return erro('A IA não respondeu agora. Tente de novo daqui a pouco.', 200);
    return NextResponse.json({ ok: true, resposta });
  }

  const momento = corpo.momento && MOMENTOS.includes(corpo.momento) ? corpo.momento : 'followup';
  if (!corpo.conversaId) return erro('Escolha uma conversa para testar.');
  const bd = adminBd();
  const snap = await bd.doc(`conversas/${corpo.conversaId}`).get();
  if (!snap.exists) return erro('Conversa não encontrada.', 404);
  const conversa = snap.data() as Conversa;
  const ctx = contextoDe(conversa, await linhasDoAtendimento(bd, snap.id), horario);
  const leitura = await escreveMensagem(promptMensagem(cfg, momento, ctx));
  if (!leitura) return erro('A IA não respondeu agora. Tente de novo daqui a pouco.', 200);
  return NextResponse.json({ ok: true, leitura, reserva: reservaDo(momento, cfg, conversa.nome || '', horario) });
}
