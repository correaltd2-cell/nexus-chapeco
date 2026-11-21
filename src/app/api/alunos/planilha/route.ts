/* A planilha de alunos do Google. GET: como está ligada e com quem compartilhar.
   POST conferir: lê e compara, sem gravar (a tela mostra antes). POST importar: grava
   e liga as conversas pelo telefone. Trocar a planilha, a aba, as colunas ou o
   automático é da gestão; atualizar com o que já está salvo, também da recepção. */
import { NextResponse } from 'next/server';
import { adminBd, quemChamou } from '@/lib/firebase/admin';
import { confere, emailDaConta, ErroDaPlanilha, importa, projetoDaConta, type ConfigDaPlanilha } from '@/lib/planilha';
import { idDaPlanilha, type Mapa } from '@/lib/dominio/planilha';
import { descreveErro, falhou } from '@/lib/saude';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const recusa = (erro: string, status = 200) => NextResponse.json({ ok: false, erro }, { status });
const GESTAO = ['admin', 'gestor'];
const ATUALIZA = ['admin', 'gestor', 'recepcao'];

interface Corpo { acao?: 'conferir' | 'importar' | 'automatico'; link?: string; aba?: string; mapa?: Mapa; automatico?: boolean }

async function salva(bd: ReturnType<typeof adminBd>) {
  return ((await bd.doc('config/planilha').get()).data() || null) as ConfigDaPlanilha | null;
}

export async function GET(req: Request) {
  const quem = await quemChamou(req);
  if (!quem) return recusa('Faça login de novo.', 401);
  return NextResponse.json({ ok: true, email: emailDaConta(), projeto: projetoDaConta(), config: await salva(adminBd()) });
}

export async function POST(req: Request) {
  const quem = await quemChamou(req);
  if (!quem) return recusa('Faça login de novo.', 401);
  if (!ATUALIZA.includes(quem.papel)) return recusa('A planilha de alunos é da recepção e da gestão.', 403);
  const corpo = (await req.json()) as Corpo;
  const bd = adminBd();
  const atual = await salva(bd);
  /* só liga ou desliga o "atualizar sozinho", sem ler a planilha agora */
  if (corpo.acao === 'automatico') {
    if (!GESTAO.includes(quem.papel)) return recusa('Ligar a atualização automática é da gestão.', 403);
    if (!atual?.planilhaId) return recusa('Importe a planilha uma vez antes de ligar a atualização automática.');
    await bd.doc('config/planilha').set({ automatico: corpo.automatico === true }, { merge: true });
    return NextResponse.json({ ok: true });
  }
  const mexeNaConfig = corpo.link !== undefined || corpo.aba !== undefined || corpo.mapa !== undefined || corpo.automatico !== undefined;
  if (mexeNaConfig && !GESTAO.includes(quem.papel)) return recusa('Trocar a planilha ou as colunas é da gestão. Use Atualizar agora.', 403);

  const planilhaId = corpo.link !== undefined ? idDaPlanilha(corpo.link) : atual?.planilhaId || '';
  if (!planilhaId) return recusa('Cole o link da planilha do Google (o endereço que aparece no navegador).');
  const cfg: ConfigDaPlanilha = {
    planilhaId,
    aba: corpo.aba ?? (atual?.planilhaId === planilhaId ? atual?.aba || '' : ''),
    mapa: corpo.mapa ?? (atual?.planilhaId === planilhaId ? atual?.mapa || {} : {}),
    automatico: corpo.automatico ?? atual?.automatico ?? false,
  };

  try {
    if (corpo.acao === 'importar') {
      const resumo = await importa(bd, cfg, quem.nome || 'Equipe');
      return NextResponse.json({ ok: true, resumo });
    }
    const { conferencia } = await confere(bd, cfg);
    return NextResponse.json({ ok: true, planilhaId, conferencia });
  } catch (e) {
    if (e instanceof ErroDaPlanilha) return recusa(e.message);
    await falhou('planilha', descreveErro(e));
    return recusa('Não consegui ler a planilha agora. Tente de novo em instantes.');
  }
}
