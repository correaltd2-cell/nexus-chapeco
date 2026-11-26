'use client';
/* Firebase no navegador. So chaves publicas moram aqui; o que é segredo fica no servidor.
   As regras do Firestore sao a trava de verdade, nao esta configuracao. */
import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, type Auth } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore, type Firestore } from 'firebase/firestore';
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

/* Só na máquina de quem testa: NEXT_PUBLIC_FIREBASE_EMULADOR=127.0.0.1 liga o login e o
   banco no emulador do Firebase. Na Vercel essa variável não existe. */
const emulador = process.env.NEXT_PUBLIC_FIREBASE_EMULADOR || '';
const noEmulador = { auth: false, bd: false };

export const auth = (): Auth => {
  const a = getAuth(pegaApp());
  if (emulador && !noEmulador.auth) { connectAuthEmulator(a, `http://${emulador}:9099`, { disableWarnings: true }); noEmulador.auth = true; }
  return a;
};
export const bd = (): Firestore => {
  const b = getFirestore(pegaApp());
  if (emulador && !noEmulador.bd) { connectFirestoreEmulator(b, emulador, 8080); noEmulador.bd = true; }
  return b;
};
export const arquivos = (): FirebaseStorage => getStorage(pegaApp());
/** Para quem carrega o Firebase Messaging só quando precisa (avisos.tsx). */
export const appFirebase = (): FirebaseApp => pegaApp();
