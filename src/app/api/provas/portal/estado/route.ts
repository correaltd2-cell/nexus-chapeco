/* A integração com o portal de provas está configurada? (só o sim ou não; nada das
   credenciais sai daqui) e o que esta pessoa pode fazer. */
import { NextResponse } from 'next/server';
import { portalConfigurado } from '@/lib/provas-portal/cliente';
import { quemDaRota, semLogin } from '@/lib/provas-portal/rota';
import { PODE_NO_PORTAL, podeNoPortal, type AcaoNoPortal } from '@/lib/dominio/provas-portal';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const quem = await quemDaRota(req);
  if (!quem) return semLogin();
  const pode = Object.fromEntries((Object.keys(PODE_NO_PORTAL) as AcaoNoPortal[]).map((a) => [a, podeNoPortal(quem.papel, a)]));
  return NextResponse.json({ ok: true, configurado: portalConfigurado(), pode });
}
