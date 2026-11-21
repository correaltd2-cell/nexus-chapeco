'use client';
/* Foto, áudio, vídeo e documento na conversa.
   MidiaNaBolha mostra o que chegou ou saiu: a foto, o player de áudio com velocidade,
   o vídeo e o cartão do documento. O arquivo mora no Storage (o caminho fica na
   mensagem, nunca o link assinado); na demonstração, em /public/demo.
   useGravador grava o áudio pelo microfone do navegador. As regras moram em
   src/lib/dominio/midia.ts. */
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { getDownloadURL, ref as refArquivo } from 'firebase/storage';
import { arquivos } from '@/lib/firebase/cliente';
import { Ic } from '@/componentes/icones';
import { duracao, formatoDeGravacao, rotuloDaMidia, tipoPeloMime } from '@/lib/dominio/midia';
import type { Mensagem } from '@/lib/dominio/tipos';

/* ---------------- o endereço do arquivo ---------------- */

const pedidos = new Map<string, Promise<string>>();

/** O link do arquivo. O do Storage é pedido uma vez por sessão e guardado. */
export function enderecoDaMidia(caminho: string): Promise<string> {
  if (caminho.startsWith('demo/')) return Promise.resolve(`/${caminho}`);
  if (caminho.startsWith('blob:')) return Promise.resolve(caminho);
  let p = pedidos.get(caminho);
  if (!p) {
    p = getDownloadURL(refArquivo(arquivos(), caminho));
    p.catch(() => pedidos.delete(caminho));
    pedidos.set(caminho, p);
  }
  return p;
}

function useEndereco(caminho?: string) {
  const [estado, setEstado] = useState<{ de: string; url: string | null; erro: boolean }>({ de: '', url: null, erro: false });
  useEffect(() => {
    if (!caminho) return;
    let vivo = true;
    enderecoDaMidia(caminho)
      .then((url) => { if (vivo) setEstado({ de: caminho, url, erro: false }); })
      .catch(() => { if (vivo) setEstado({ de: caminho, url: null, erro: true }); });
    return () => { vivo = false; };
  }, [caminho]);
  return estado.de === caminho ? estado : { url: null, erro: false };
}

/* ---------------- na bolha ---------------- */

const VELOCIDADES = [1, 1.5, 2];

function PlayerDeAudio({ url, saida }: { url: string; saida: boolean }) {
  const audio = useRef<HTMLAudioElement>(null);
  const [tocando, setTocando] = useState(false);
  const [posicao, setPosicao] = useState(0);
  const [total, setTotal] = useState(0);
  const [vel, setVel] = useState(0);

  function alterna() {
    const a = audio.current;
    if (!a) return;
    if (a.paused) void a.play(); else a.pause();
  }
  function trocaVelocidade() {
    const prox = (vel + 1) % VELOCIDADES.length;
    setVel(prox);
    if (audio.current) audio.current.playbackRate = VELOCIDADES[prox];
  }
  /* áudio gravado no navegador não traz a duração no arquivo: aparece a que já tocou */
  const conhecido = Number.isFinite(total) && total > 0;
  return (
    <span className={saida ? 'mid-aud saida' : 'mid-aud'}>
      <audio ref={audio} src={url} preload="metadata"
             onPlay={() => setTocando(true)} onPause={() => setTocando(false)}
             onEnded={() => { setTocando(false); setPosicao(0); }}
             onLoadedMetadata={(e) => setTotal(e.currentTarget.duration)}
             onDurationChange={(e) => setTotal(e.currentTarget.duration)}
             onTimeUpdate={(e) => setPosicao(e.currentTarget.currentTime)} />
      <button type="button" className="mid-play" onClick={alterna} aria-label={tocando ? 'Pausar áudio' : 'Ouvir áudio'}>
        <Ic n={tocando ? 'pausa' : 'toca'} />
      </button>
      <input type="range" className="mid-barra" min={0} max={conhecido ? total : Math.max(posicao, 1)} step={0.1}
             value={posicao} aria-label="Posição do áudio"
             style={{ '--feito': `${conhecido ? (posicao / total) * 100 : 0}%` } as CSSProperties}
             onChange={(e) => { if (audio.current) audio.current.currentTime = Number(e.target.value); }} />
      <span className="mid-tempo">{duracao(tocando || posicao ? posicao : conhecido ? total : 0)}</span>
      <button type="button" className="mid-vel" onClick={trocaVelocidade} aria-label="Velocidade do áudio">
        {VELOCIDADES[vel]}x
      </button>
    </span>
  );
}

export function MidiaNaBolha({ m }: { m: Mensagem }) {
  const tipo = tipoPeloMime(m.midiaMime);
  const rotulo = rotuloDaMidia(m.midiaMime, m.midiaNome);
  const { url, erro } = useEndereco(m.midiaLink ? undefined : m.midiaPath);
  const saida = m.direcao === 'saida';

  /* figurinha do setor: arquivo fixo do sistema, sem balão */
  if (m.figurinha && m.midiaLink) {
    // eslint-disable-next-line @next/next/no-img-element -- arquivo fixo de public/, pequeno
    return <img className="mid-fig" src={m.midiaLink} alt={m.midiaNome || 'Figurinha'} width={150} height={150} />;
  }

  if (m.midiaFalhou || erro) {
    return (
      <span className="mid-aviso">
        {saida ? `${rotulo} não abriu aqui.` : `${rotulo} não chegou ao sistema. Peça para o contato mandar de novo.`}
      </span>
    );
  }
  if (!m.midiaPath) {
    if (tipo === 'document') return <span className="mid-doc"><Ic n="doc" /><span><b>{rotulo}</b></span></span>;
    return <span className="mid-aviso">{rotulo} chegando...</span>;
  }
  if (!url) return <span className={`mid-espera ${tipo}`} aria-label={`Carregando ${rotulo.toLowerCase()}`} />;

  if (tipo === 'image') {
    return (
      <a className="mid-img" href={url} target="_blank" rel="noopener noreferrer" title="Abrir a foto">
        {/* eslint-disable-next-line @next/next/no-img-element -- link assinado do Storage, fora do otimizador */}
        <img src={url} alt="Foto" loading="lazy" />
      </a>
    );
  }
  if (tipo === 'video') return <video className="mid-vid" src={url} controls preload="metadata" />;
  if (tipo === 'audio') return <PlayerDeAudio url={url} saida={saida} />;
  return (
    <a className="mid-doc" href={url} target="_blank" rel="noopener noreferrer">
      <Ic n="doc" />
      <span><b>{rotulo}</b><small>Abrir documento</small></span>
    </a>
  );
}

/* ---------------- o anexo antes de sair ---------------- */

export function PreviaDoAnexo({ arquivo, aoTirar, subindo }: { arquivo: File; aoTirar: () => void; subindo: boolean }) {
  const tipo = tipoPeloMime(arquivo.type);
  const url = useMemo(() => (tipo === 'image' ? URL.createObjectURL(arquivo) : ''), [arquivo, tipo]);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  const kb = arquivo.size / 1024;
  return (
    <div className="anx" aria-label="Arquivo para enviar">
      {url
        /* eslint-disable-next-line @next/next/no-img-element -- prévia local do arquivo escolhido */
        ? <img src={url} alt="" />
        : <span className="anx-ic"><Ic n={tipo === 'audio' ? 'mic' : 'doc'} /></span>}
      <span className="anx-tx">
        <b>{arquivo.name}</b>
        <small>{subindo ? 'Enviando...' : kb >= 1024 ? `${(kb / 1024).toFixed(1).replace('.', ',')} MB` : `${Math.max(1, Math.round(kb))} KB`}</small>
      </span>
      <button type="button" className="ib" onClick={aoTirar} disabled={subindo} title="Tirar o arquivo" aria-label="Tirar o arquivo">
        <Ic n="x" />
      </button>
    </div>
  );
}

/* ---------------- gravar áudio ---------------- */

/** Grava pelo microfone. Ao terminar, entrega o arquivo pronto para enviar. */
export function useGravador(aoTerminar: (arquivo: File) => void, aoErro: (motivo: string) => void) {
  const [desde, setDesde] = useState<number | null>(null);
  const gravador = useRef<MediaRecorder | null>(null);
  const cancelado = useRef(false);
  const terminar = useRef(aoTerminar);
  useEffect(() => { terminar.current = aoTerminar; }, [aoTerminar]);

  async function comeca() {
    if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      aoErro('Este navegador não grava áudio. Use o Chrome, o Edge ou o Safari atualizados.');
      return;
    }
    let microfone: MediaStream;
    try {
      microfone = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      aoErro('O navegador não deixou usar o microfone. Libere o microfone para este site e tente de novo.');
      return;
    }
    const formato = formatoDeGravacao((f) => MediaRecorder.isTypeSupported(f));
    const r = new MediaRecorder(microfone, formato ? { mimeType: formato } : undefined);
    const partes: Blob[] = [];
    cancelado.current = false;
    r.ondataavailable = (e) => { if (e.data.size) partes.push(e.data); };
    r.onstop = () => {
      microfone.getTracks().forEach((t) => t.stop());
      setDesde(null);
      if (cancelado.current || !partes.length) return;
      const mime = r.mimeType || formato || 'audio/webm';
      const ext = mime.includes('ogg') ? 'ogg' : mime.includes('mp4') ? 'm4a' : 'webm';
      terminar.current(new File(partes, `audio.${ext}`, { type: mime }));
    };
    r.start(250);
    gravador.current = r;
    setDesde(Date.now());
  }

  const para = useCallback((cancelar: boolean) => {
    cancelado.current = cancelar;
    if (gravador.current?.state === 'recording') gravador.current.stop();
    gravador.current = null;
  }, []);
  const termina = useCallback(() => para(false), [para]);
  const cancela = useCallback(() => para(true), [para]);

  /* saiu da tela gravando: desliga o microfone sem mandar nada */
  useEffect(() => () => {
    cancelado.current = true;
    if (gravador.current?.state === 'recording') gravador.current.stop();
  }, []);

  return { gravandoDesde: desde, comeca, termina, cancela };
}

/** O tempo da gravação, que anda sozinho. */
export function Cronometro({ desde }: { desde: number }) {
  const [segundos, setSegundos] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setSegundos(Math.floor((Date.now() - desde) / 1000)), 250);
    return () => clearInterval(t);
  }, [desde]);
  return <span className="num">{duracao(segundos)}</span>;
}
