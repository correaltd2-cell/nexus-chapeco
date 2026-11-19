/* O servidor alcança o banco?
   É a única falha que não consegue se anotar em config/saude, porque é o próprio
   banco que está fora de alcance (foi o caso de 19/11/2026). A tela da gestão
   pergunta aqui de tempos em tempos.

   Não pede login de propósito: o login também passa pelo banco, e com ele fora a
   resposta seria sempre "faça login de novo". Por isso responde só uma palavra,
   sem detalhe nenhum, e guarda a resposta por 30 segundos. */
import { NextResponse } from 'next/server';
import { adminBd } from '@/lib/firebase/admin';
import { classificaErroDoBanco, type EstadoServidor } from '@/lib/dominio/saude';

export const dynamic = 'force-dynamic';

let guardada: { em: number; servidor: EstadoServidor } | null = null;

export async function GET() {
  if (!guardada || Date.now() - guardada.em > 30_000) {
    let servidor: EstadoServidor = 'ok';
    try {
      await adminBd().doc('config/saude').get();
    } catch (e) {
      const mensagem = e instanceof Error ? e.message : String(e);
      console.error('[saude] o servidor não alcançou o banco:', mensagem.slice(0, 300));
      servidor = classificaErroDoBanco(mensagem);
    }
    guardada = { em: Date.now(), servidor };
  }
  return NextResponse.json({ servidor: guardada.servidor }, { headers: { 'cache-control': 'no-store' } });
}
