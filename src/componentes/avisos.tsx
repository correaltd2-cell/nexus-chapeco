'use client';
/* O aviso de mensagem nova neste aparelho.
   - Com o sistema aberto (o computador da recepção): AvisoDeMensagem, montado na casca,
     olha as conversas e, quando o contato escreve, toca um som e mostra a notificação
     se a aba não estiver na frente. O navegador só deixa tocar som depois de um toque
     na página: o som é destravado no primeiro toque ou tecla (21/11/2026: antes era
     criado na hora da mensagem e quase sempre saía mudo).
   - Com o sistema fechado, quem toca é o celular: a notificação sai pedindo som e
     vibração, e o som é o de notificação do aparelho.
   - Com o sistema fechado (o celular): push pelo Firebase Cloud Messaging. O aparelho
     liga em Configurações, Avisos de mensagem nova; quem manda é o servidor
     (src/lib/avisos.ts) e quem mostra é public/aviso-sw.js. No iPhone, só com o sistema
     posto na tela de início.
   As regras (quem recebe, quando) moram em src/lib/dominio/avisos.ts. */
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { User } from 'firebase/auth';
import { assina, modoDemo } from '@/lib/dados/fonte';
import { appFirebase } from '@/lib/firebase/cliente';
import { useSessao } from '@/componentes/sessao';
import { somLigado, useAvisos, useSomDoAviso } from '@/componentes/preferencias';
import { avisa } from '@/componentes/aviso';
import { chegaramAgora, comGente, recebeAviso, textoDoAviso, type Aviso } from '@/lib/dominio/avisos';
import type { Conversa } from '@/lib/dominio/tipos';

const CHAVE_WEB_PUSH = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY || '';
/** O push com o sistema fechado precisa da chave de Web Push do Firebase na Vercel. */
export const pushPossivel = Boolean(CHAVE_WEB_PUSH) && !modoDemo;
const GUARDA_TOKEN = 'nexus-push-token';
const SW = '/aviso-sw.js';

/* ---------------- a conversa que está na tela (o inbox conta) ---------------- */
let conversaNaTela: string | null = null;
export const marcaConversaNaTela = (id: string | null) => { conversaNaTela = id; };

/* ---------------- o aparelho ---------------- */
const leToken = () => { try { return localStorage.getItem(GUARDA_TOKEN) || ''; } catch { return ''; } };
const guardaToken = (t: string) => {
  try { if (t) localStorage.setItem(GUARDA_TOKEN, t); else localStorage.removeItem(GUARDA_TOKEN); } catch { /* sem memória */ }
};

type Permissao = 'granted' | 'denied' | 'default' | 'sem';
const ouvintes = new Set<() => void>();
const avisaOuvintes = () => ouvintes.forEach((f) => f());
const lePermissao = (): Permissao => (typeof Notification === 'undefined' ? 'sem' : Notification.permission);
const ouve = (f: () => void) => { ouvintes.add(f); return () => { ouvintes.delete(f); }; };

/** Permissão de notificação e se este aparelho já tem push ligado. */
function useAparelho() {
  const permissao = useSyncExternalStore(ouve, lePermissao, () => 'sem' as Permissao);
  const temPush = useSyncExternalStore(ouve, () => Boolean(leToken()), () => false);
  const ehIphone = useSyncExternalStore(ouve, () => /iPhone|iPad|iPod/.test(navigator.userAgent), () => false);
  const instalado = useSyncExternalStore(ouve, () => window.matchMedia('(display-mode: standalone)').matches
    || Boolean((navigator as Navigator & { standalone?: boolean }).standalone), () => false);
  return { permissao, temPush, ehIphone, instalado };
}

function nomeDoAparelho(ua: string) {
  const sistema = /iPhone|iPad/.test(ua) ? 'iPhone' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : /Mac/.test(ua) ? 'Mac' : 'Computador';
  const navegador = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : '';
  return [sistema, navegador].filter(Boolean).join(', ');
}

async function chamaServidor(usuario: User, corpo: Record<string, unknown>) {
  const token = await usuario.getIdToken();
  const r = await fetch('/api/avisos', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify(corpo),
  });
  return (await r.json()) as { ok?: boolean; erro?: string; aparelhos?: number };
}

/** Pede a permissão e, se der, liga o push. Devolve o erro em português, ou vazio. */
async function ligaNesteAparelho(usuario: User | null): Promise<string> {
  if (typeof Notification === 'undefined' || !('serviceWorker' in navigator)) {
    return 'Este navegador não mostra avisos. No iPhone, ponha o sistema na tela de início e abra por lá.';
  }
  const permissao = await Notification.requestPermission();
  avisaOuvintes();
  if (permissao !== 'granted') {
    return 'O navegador bloqueou os avisos. Libere as notificações para este site nas configurações do navegador e tente de novo.';
  }
  const registro = await navigator.serviceWorker.register(SW);
  if (!pushPossivel || !usuario) return '';
  try {
    const { getMessaging, getToken, isSupported } = await import('firebase/messaging');
    if (!(await isSupported())) return '';
    const token = await getToken(getMessaging(appFirebase()), { vapidKey: CHAVE_WEB_PUSH, serviceWorkerRegistration: registro });
    if (!token) return 'O Firebase não entregou o endereço deste aparelho. Tente de novo.';
    const r = await chamaServidor(usuario, { acao: 'ligar', token, aparelho: nomeDoAparelho(navigator.userAgent) });
    if (!r.ok) return r.erro || 'Não consegui guardar este aparelho.';
    guardaToken(token);
    avisaOuvintes();
    return '';
  } catch {
    return 'Os avisos com o sistema aberto estão ligados, mas o push do celular não ligou. Tente de novo mais tarde.';
  }
}

async function desligaNesteAparelho(usuario: User | null) {
  const token = leToken();
  if (token && usuario) {
    try {
      await chamaServidor(usuario, { acao: 'desligar', token });
      const { deleteToken, getMessaging } = await import('firebase/messaging');
      await deleteToken(getMessaging(appFirebase()));
    } catch { /* o servidor tira sozinho quando o push voltar recusado */ }
  }
  guardaToken('');
  avisaOuvintes();
}

/* ---------------- som e notificação com o sistema aberto ---------------- */
let somCtx: AudioContext | null = null;
function contextoDeSom(): AudioContext | null {
  if (somCtx) return somCtx;
  const C = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!C) return null;
  somCtx = new C();
  return somCtx;
}

/** O navegador só toca som depois de um toque na página: no primeiro toque ou tecla, o
    som é ligado (com um instante de silêncio, que é o que o iPhone pede). */
function destravaSom() {
  try {
    const ctx = contextoDeSom();
    if (!ctx) return;
    if (ctx.state === 'suspended') void ctx.resume();
    const b = ctx.createBufferSource();
    b.buffer = ctx.createBuffer(1, 1, 22050);
    b.connect(ctx.destination);
    b.start(0);
  } catch { /* sem som, segue */ }
}

/** O som do aviso: três notas subindo, curtas e claras, para ouvir com a recepção cheia. */
export function plim() {
  try {
    const ctx = contextoDeSom();
    if (!ctx) return;
    if (ctx.state === 'suspended') void ctx.resume();
    const t = ctx.currentTime + 0.02;
    [784, 1047, 1319].forEach((freq, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      const ini = t + i * 0.12;
      o.type = 'triangle';
      o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, ini);
      g.gain.exponentialRampToValueAtTime(0.38, ini + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, ini + (i === 2 ? 0.55 : 0.28));
      o.connect(g).connect(ctx.destination);
      o.start(ini);
      o.stop(ini + 0.6);
    });
  } catch { /* sem som, segue */ }
}

async function mostra(a: Aviso) {
  try {
    const registro = await navigator.serviceWorker?.getRegistration(SW);
    /* som e vibração do aparelho também (silent false), além do plim da página */
    const opcoes = {
      body: a.corpo, tag: a.tag, icon: '/icones/icone-192.png', badge: '/icones/icone-192.png', data: { link: a.link },
      renotify: true, silent: false, vibrate: [200, 100, 200],
    };
    if (registro) { await registro.showNotification(a.titulo, opcoes as NotificationOptions); return; }
    const n = new Notification(a.titulo, opcoes as NotificationOptions);
    n.onclick = () => { window.focus(); window.location.href = a.link; n.close(); };
  } catch { /* o navegador recusou: a conversa já está na lista */ }
}

/** Montado uma vez na casca: avisa quando o contato escreve. */
export function AvisoDeMensagem() {
  const { perfil } = useSessao();
  const [preferencia] = useAvisos();
  const antes = useRef<Map<string, number> | null>(null);

  /* destrava o som no primeiro toque ou tecla em qualquer tela */
  useEffect(() => {
    if (!perfil || preferencia !== 'ligados') return;
    const eventos = ['pointerdown', 'keydown', 'touchend'] as const;
    eventos.forEach((e) => window.addEventListener(e, destravaSom, { passive: true }));
    return () => eventos.forEach((e) => window.removeEventListener(e, destravaSom));
  }, [perfil, preferencia]);

  useEffect(() => {
    if (!perfil || preferencia !== 'ligados') return;
    antes.current = null;
    return assina('conversas', (docs) => {
      const conversas = docs as unknown as Conversa[];
      const novas = chegaramAgora(antes.current, conversas);
      antes.current = new Map(conversas.map((c) => [c.id, c.naoLidas || 0]));
      for (const id of novas) {
        const c = conversas.find((x) => x.id === id);
        if (!c || !comGente(c) || !recebeAviso(perfil, c.setor)) continue;
        const naFrente = document.visibilityState === 'visible';
        if (naFrente && conversaNaTela === id) continue;      /* já está lendo */
        if (somLigado()) plim();
        /* aba escondida e sem push aqui: a notificação vem daqui; com push, vem do celular */
        if (!naFrente && !leToken() && lePermissao() === 'granted') void mostra(textoDoAviso(c, c.ultimaPreviaTexto));
      }
    });
  }, [perfil, preferencia]);

  return null;
}

/* ---------------- a seção nas Configurações ---------------- */
export function AvisosNoAparelho({ gestao }: { gestao: boolean }) {
  const { usuario, perfil } = useSessao();
  const [preferencia, setPreferencia] = useAvisos();
  const [som, setSom] = useSomDoAviso();
  const { permissao, temPush, ehIphone, instalado } = useAparelho();
  const [indo, setIndo] = useState(false);
  const [erro, setErro] = useState('');

  const ligado = preferencia === 'ligados' && permissao === 'granted';
  const setores = perfil?.setores || [];

  async function liga() {
    setIndo(true); setErro('');
    const e = await ligaNesteAparelho(usuario);
    setIndo(false);
    setPreferencia('ligados');
    if (e) setErro(e); else avisa('Avisos ligados neste aparelho');
  }
  async function desliga() {
    setIndo(true); setErro('');
    await desligaNesteAparelho(usuario);
    setPreferencia('desligados');
    setIndo(false);
    avisa('Avisos desligados neste aparelho');
  }
  async function testa() {
    if (!usuario) return;
    setIndo(true); setErro('');
    try {
      const r = await chamaServidor(usuario, { acao: 'testar' });
      if (!r.ok) setErro(r.erro || 'O aviso de teste não saiu.');
      else avisa('Aviso de teste enviado. Ele chega em alguns segundos.');
    } catch {
      setErro('Não consegui falar com o servidor.');
    } finally { setIndo(false); }
  }

  const situacao = permissao === 'sem'
    ? 'Este navegador não mostra avisos.'
    : permissao === 'denied'
      ? 'O navegador bloqueou os avisos deste site. Libere as notificações nas configurações do navegador.'
      : !ligado
        ? 'Desligados neste aparelho.'
        : temPush
          ? 'Ligados: chegam mesmo com o sistema fechado.'
          : 'Ligados com o sistema aberto: som e notificação quando a aba não estiver na frente.';

  return (
    <section className="bl" id="avisos">
      <p className="bt">Avisos de mensagem nova</p>
      <p className="vz">
        Quando o contato escreve, recebe o aviso quem é do setor da conversa
        {setores.length ? '' : ' (você ainda não tem setor: peça em Configurações, Equipe)'}.
        Enquanto a saudação ou o assistente cuidam da conversa, ninguém é chamado.
      </p>
      <div className="lin">
        <span className={`pt ${ligado ? 'ok' : permissao === 'denied' ? 'erro' : 'aviso'}`} aria-hidden="true" />
        <span className="co">
          <b>Neste aparelho</b>
          <small>{situacao}</small>
          {ehIphone && !instalado && (
            <small className="cons">
              No iPhone, o aviso com o sistema fechado só chega com o Nexus na tela de início: toque em
              Compartilhar, depois em Adicionar à Tela de Início, abra o Nexus por lá e ligue os avisos.
            </small>
          )}
          {gestao && !pushPossivel && !modoDemo && (
            <small className="cons">
              Para o aviso chegar com o sistema fechado, falta a chave de Web Push do Firebase na Vercel
              (NEXT_PUBLIC_FIREBASE_VAPID_KEY). Sem ela, o aviso só aparece com o sistema aberto.
            </small>
          )}
        </span>
      </div>
      {erro && <p className="erro" style={{ padding: '0 18px 10px' }}>{erro}</p>}
      <div className="frm">
        <div className="acoes" style={{ justifyContent: 'flex-start', flexWrap: 'wrap' }}>
          {ligado
            ? <button className="btn" disabled={indo} onClick={() => void desliga()}>Desligar neste aparelho</button>
            : <button className="btn p" disabled={indo || permissao === 'sem'} onClick={() => void liga()}>Ligar avisos neste aparelho</button>}
          {ligado && temPush && (
            <button className="btn" disabled={indo} onClick={() => void testa()}>Mandar um aviso de teste</button>
          )}
        </div>
        {ligado && (
          <>
            <label className="lig">
              <input type="checkbox" checked={som === 'ligado'} onChange={(e) => setSom(e.target.checked ? 'ligado' : 'desligado')} />
              <span>
                <b>Tocar som quando chega mensagem</b>
                Com o sistema aberto, toca um aviso sonoro de três notas, mesmo com a tela em outra
                aba. Com o sistema fechado, quem toca é o celular, com o som de notificação dele.
              </span>
            </label>
            {som === 'ligado' && (
              <div className="acoes" style={{ justifyContent: 'flex-start' }}>
                <button className="btn" onClick={() => { destravaSom(); plim(); }}>Testar som</button>
              </div>
            )}
            <p className="obs">
              {ehIphone
                ? 'No iPhone, o som com o sistema fechado se liga em Ajustes, Notificações, Nexus: Sons ligado. Com o modo silencioso, o iPhone só vibra.'
                : 'No Android, o som com o sistema fechado é o das notificações do Nexus (ou do Chrome): segure a notificação, toque em Configurações e confira o Som.'}
            </p>
          </>
        )}
      </div>
    </section>
  );
}
