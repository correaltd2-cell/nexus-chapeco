/* O que as rotas das provas do portal dividem: quem chamou (com papel e setores, que o
   fluxo confere) e a resposta no mesmo formato para a tela. */
import 'server-only';
import { NextResponse } from 'next/server';
import { quemChamou } from '@/lib/firebase/admin';
import { descreveErro, falhou } from '@/lib/saude';
import type { QuemComSetores, Resultado } from './fluxo';

export async function quemDaRota(req: Request): Promise<QuemComSetores | null> {
  const q = await quemChamou(req);
  return q ? { uid: q.uid, nome: q.nome || 'Equipe', papel: q.papel, setores: q.setores || [] } : null;
}

export const semLogin = () => NextResponse.json({ ok: false, codigo: 'sem_login', erro: 'Faça login de novo.' }, { status: 401 });

export function responde<T>(r: Resultado<T>, nome = 'dados') {
  if (r.ok) return NextResponse.json({ ok: true, [nome]: r.dados });
  return NextResponse.json({ ok: false, codigo: r.codigo, erro: r.erro, ...(r.operacao ? { operacao: r.operacao } : {}) }, { status: r.status });
}

/** Erro que ninguém esperava: vai para a saúde do sistema e a tela recebe um aviso claro. */
export async function quebrou(onde: string, e: unknown) {
  await falhou('portal', `${onde}: ${descreveErro(e)}`);
  return NextResponse.json({ ok: false, codigo: 'erro_interno', erro: 'Algo deu errado na central. Nada foi mandado; tente de novo e, se repetir, avise a gestão.' }, { status: 500 });
}

export async function corpoDe(req: Request): Promise<Record<string, unknown>> {
  try { return ((await req.json()) || {}) as Record<string, unknown>; } catch { return {}; }
}
export const texto = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
