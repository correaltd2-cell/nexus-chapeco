/* Onde o servidor anota que funcionou e que falhou: o documento config/saude.
   Quem lê é a gestão, pela faixa no topo do sistema e pela seção Saúde do sistema
   nas Configurações. As regras do aviso moram em src/lib/dominio/saude.ts.

   Anotar nunca derruba quem chamou. Se o próprio banco estiver fora, sobra o
   registro da Vercel, e a conferência do servidor (/api/saude) avisa a gestão.
   As batidas são gravadas no máximo uma vez por minuto por instância, para um
   dia movimentado não virar milhares de escritas no mesmo documento. */
import 'server-only';
import { FieldValue } from 'firebase-admin/firestore';
import { adminBd } from '@/lib/firebase/admin';
import { explicaErroDoServidor, type Batida, type OndeFalha } from '@/lib/dominio/saude';

const BATIDA_MS = 60_000;
const FALHA_MS = 15_000;

const ultimaEscrita = new Map<string, number>();
const naoAnotadas = new Map<OndeFalha, number>();

function chegouAVez(chave: string, intervalo: number) {
  const agora = Date.now();
  if (agora - (ultimaEscrita.get(chave) || 0) < intervalo) return false;
  ultimaEscrita.set(chave, agora);
  return true;
}

/** Anota que estas partes funcionaram agora. */
export async function bate(...campos: Batida[]) {
  const devidos = campos.filter((c) => chegouAVez(c, BATIDA_MS));
  if (!devidos.length) return;
  const agora = new Date().toISOString();
  try {
    await adminBd().doc('config/saude').set(Object.fromEntries(devidos.map((c) => [c, agora])), { merge: true });
  } catch (e) {
    console.error('[saude] não consegui anotar a batida:', descreveErro(e));
  }
}

/** Anota uma falha. Falhas em rajada entram juntas na próxima escrita. */
export async function falhou(onde: OndeFalha, motivo: string) {
  console.error(`[${onde}]`, motivo);
  naoAnotadas.set(onde, (naoAnotadas.get(onde) || 0) + 1);
  if (!chegouAVez(`falha:${onde}`, FALHA_MS)) return;
  const vezes = naoAnotadas.get(onde) || 1;
  naoAnotadas.delete(onde);
  try {
    await adminBd().doc('config/saude').set({
      falhas: { [onde]: { motivo: motivo.slice(0, 300), em: new Date().toISOString(), vezes: FieldValue.increment(vezes) } },
    }, { merge: true });
  } catch (e) {
    console.error('[saude] não consegui anotar a falha:', descreveErro(e));
  }
}

export const descreveErro = (e: unknown) =>
  explicaErroDoServidor(e instanceof Error ? e.message : String(e));
