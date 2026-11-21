'use client';
/* Firebase no navegador. So chaves publicas moram aqui; o que é segredo fica no servidor.
   As regras do Firestore sao a trava de verdade, nao esta configuracao. */
import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { getStorage, type FirebaseStorage } from 'firebase/storage';

const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

export const configurado = Boolean(config.apiKey && config.projectId);

let app: FirebaseApp | null = null;
function pegaApp(): FirebaseApp {
  if (!configurado) throw new Error('Firebase sem configuracao: preencha o .env.local');
  if (!app) app = getApps().length ? getApp() : initializeApp(config as Record<string, string>);
  return app;
}

export const auth = (): Auth => getAuth(pegaApp());
export const bd = (): Firestore => getFirestore(pegaApp());
export const arquivos = (): FirebaseStorage => getStorage(pegaApp());
/** Para quem carrega o Firebase Messaging só quando precisa (avisos.tsx). */
export const appFirebase = (): FirebaseApp => pegaApp();
