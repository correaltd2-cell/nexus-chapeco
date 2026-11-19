/* Firebase no servidor (rotas de API e cron). Usa a chave de servico, que nunca
   chega ao navegador. Importar este arquivo de um componente de cliente quebra o build
   de proposito. */
import 'server-only';
import { cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

let app: App | null = null;

function pegaApp(): App {
  if (app) return app;
  const existente = getApps();
  if (existente.length) { app = existente[0]; return app; }
  const bruto = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!bruto) throw new Error('FIREBASE_SERVICE_ACCOUNT nao esta no ambiente');
  const conta = JSON.parse(bruto) as { project_id: string; client_email: string; private_key: string };
  app = initializeApp({
    credential: cert({
      projectId: conta.project_id,
      clientEmail: conta.client_email,
      privateKey: conta.private_key.replace(/\\n/g, '\n'),
    }),
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  });
  return app;
}

export const adminAuth = () => getAuth(pegaApp());
export const adminBd = () => getFirestore(pegaApp());
export const adminArquivos = () => getStorage(pegaApp());

/** Confere o token que veio do navegador e devolve o uid e o papel. */
export async function quemChamou(req: Request) {
  const cab = req.headers.get('authorization') || '';
  const token = cab.startsWith('Bearer ') ? cab.slice(7) : '';
  if (!token) return null;
  try {
    const d = await adminAuth().verifyIdToken(token);
    const perfil = await adminBd().doc(`perfis/${d.uid}`).get();
    if (!perfil.exists) return null;
    const dados = perfil.data() as { papel?: string; ativo?: boolean; nome?: string; setores?: string[] };
    if (!dados.ativo) return null;
    return { uid: d.uid, papel: dados.papel || 'recepcao', nome: dados.nome || '', setores: dados.setores || [] };
  } catch (e) {
    // Sem isto o login recusado vira so "faca login de novo" e ninguem sabe o porque.
    // Registra o codigo e a mensagem do erro, nunca o token.
    const err = e as { code?: string; message?: string };
    console.error('quemChamou recusou:', err.code || '', (err.message || '').slice(0, 300));
    return null;
  }
}

/** A chave de servico chamando de fora (cron da Vercel). */
export function ehChamadaDeServico(req: Request) {
  const chave = process.env.CRON_SECRET;
  if (!chave) return false;
  const cab = req.headers.get('authorization') || '';
  return cab === `Bearer ${chave}`;
}
