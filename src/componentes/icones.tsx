/* Os desenhos de icone, num sprite so. Vieram da demonstracao aprovada.
   Use <Ic n="chat"/> onde precisar; o sprite entra uma vez na casca. */
export const NOMES_ICONE = ["agenda", "ajuste", "balao", "busca", "camera", "chat", "check", "doc", "emoji", "envia", "expandir", "filtro", "grade", "grafico", "info", "lista", "lua", "mais", "menu", "moeda", "nota", "pessoas", "play", "pontos", "quadro", "raio", "recolher", "relogio", "seta", "sol", "tag", "texto", "troca", "volta", "x"] as const;
export type NomeIcone = (typeof NOMES_ICONE)[number];

export function Ic({ n, c }: { n: NomeIcone | string; c?: string }) {
  return (
    <svg className={c ? `ic ${c}` : 'ic'} aria-hidden="true">
      <use href={`#i-${n}`} />
    </svg>
  );
}

export function SpriteDeIcones() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
  <symbol id="i-chat" viewBox="0 0 24 24"><path d="M4.5 5.5h15v11h-9l-4.5 3.5v-3.5h-1.5z"/></symbol>
  <symbol id="i-emoji" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M8.5 14c.8 1.4 2 2.1 3.5 2.1s2.7-.7 3.5-2.1M9.2 9.6v.6M14.8 9.6v.6"/></symbol>
  <symbol id="i-recolher" viewBox="0 0 24 24"><path d="M11.5 7 6.5 12l5 5M17.5 7l-5 5 5 5"/></symbol>
  <symbol id="i-expandir" viewBox="0 0 24 24"><path d="m12.5 7 5 5-5 5M6.5 7l5 5-5 5"/></symbol>
  <symbol id="i-relogio" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></symbol>
  <symbol id="i-busca" viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/></symbol>
  <symbol id="i-mais" viewBox="0 0 24 24"><path d="M12 5.5v13M5.5 12h13"/></symbol>
  <symbol id="i-menu" viewBox="0 0 24 24"><path d="M12 6h.01M12 12h.01M12 18h.01" strokeWidth="2.6"/></symbol>
  <symbol id="i-envia" viewBox="0 0 24 24"><path d="M4.5 12 19.5 5l-4 14.5-3.5-6z"/></symbol>
  <symbol id="i-volta" viewBox="0 0 24 24"><path d="M19 12H5m6-6-6 6 6 6"/></symbol>
  <symbol id="i-info" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5M12 7.6v.2"/></symbol>
  <symbol id="i-troca" viewBox="0 0 24 24"><path d="M4 8h13m-3.5-3.5L17 8l-3.5 3.5M20 16H7m3.5-3.5L7 16l3.5 3.5"/></symbol>
  <symbol id="i-check" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="m8 12.3 2.8 2.8L16 9.5"/></symbol>
  <symbol id="i-agenda" viewBox="0 0 24 24"><rect x="4" y="5.5" width="16" height="14.5" rx="2"/><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4"/></symbol>
  <symbol id="i-doc" viewBox="0 0 24 24"><path d="M7 3.5h7l4 4V20.5H7z"/><path d="M14 3.5v4h4M10 12.5h5M10 16h5"/></symbol>
  <symbol id="i-camera" viewBox="0 0 24 24"><path d="M4 8.5h3.5L9 6h6l1.5 2.5H20v11H4z"/><circle cx="12" cy="13.5" r="3.2"/></symbol>
  <symbol id="i-tag" viewBox="0 0 24 24"><path d="M4 4.5h7.5l8 8-7 7-8.5-8.5z"/><circle cx="8.2" cy="8.7" r="1.1"/></symbol>
  <symbol id="i-nota" viewBox="0 0 24 24"><path d="M5 19.5h3.5L19 9l-3.5-3.5L5 16z"/><path d="m13.5 7.5 3.5 3.5"/></symbol>
  <symbol id="i-seta" viewBox="0 0 24 24"><path d="m9 6 6 6-6 6"/></symbol>
  <symbol id="i-x" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></symbol>
  <symbol id="i-play" viewBox="0 0 54 54"><circle cx="27" cy="27" r="26" fill="rgba(0,0,0,.45)" stroke="none"/><path d="M22 17.5v19l15-9.5z" fill="#fff" stroke="none"/></symbol>
  <symbol id="i-quadro" viewBox="0 0 24 24"><rect x="4" y="4.5" width="6.5" height="15" rx="1.5"/><rect x="13.5" y="4.5" width="6.5" height="9.5" rx="1.5"/></symbol>
  <symbol id="i-grafico" viewBox="0 0 24 24"><path d="M4 20h16M7.5 16.5v-5M12 16.5V6M16.5 16.5V9.5"/></symbol>
  <symbol id="i-ajuste" viewBox="0 0 24 24"><path d="M4.5 7.5h8M17 7.5h2.5M4.5 16.5H7M11 16.5h8.5"/><circle cx="15" cy="7.5" r="2"/><circle cx="9" cy="16.5" r="2"/></symbol>
  <symbol id="i-lua" viewBox="0 0 24 24"><path d="M19.5 14.2A7.8 7.8 0 0 1 9.8 4.5a7.8 7.8 0 1 0 9.7 9.7z"/></symbol>
  <symbol id="i-sol" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3.8"/><path d="M12 3.5v2M12 18.5v2M3.5 12h2M18.5 12h2M6 6l1.4 1.4M16.6 16.6 18 18M6 18l1.4-1.4M16.6 7.4 18 6"/></symbol>
  <symbol id="i-pessoas" viewBox="0 0 24 24"><circle cx="9" cy="9" r="3.2"/><path d="M3.5 19c.6-3.2 2.8-5 5.500-5s4.900 1.800 5.500 5M15.500 6.200a3 3 0 0 1 0 5.600M17.500 14.600c1.600.800 2.600 2.300 3 4.400"/></symbol>
  <symbol id="i-moeda" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M14.800 9.400c-.500-.900-1.500-1.500-2.800-1.500-1.700 0-2.900.900-2.900 2.100 0 2.900 5.900 1.200 5.900 4.200 0 1.200-1.200 2.100-3 2.100-1.400 0-2.500-.600-3-1.600M12 6.200v1.700M12 16.300V18"/></symbol>
  <symbol id="i-raio" viewBox="0 0 24 24"><path d="M13 3.500 5.500 13.500H11l-1 7 7.500-10H12z"/></symbol>
  <symbol id="i-pontos" viewBox="0 0 24 24"><path d="M6 12h.010M12 12h.010M18 12h.010" strokeWidth="2.6"/></symbol>
  <symbol id="i-lista" viewBox="0 0 24 24"><path d="m4.500 7 1.800 1.800 3.200-3.300M4.500 15.500l1.800 1.800 3.200-3.300M13 7.500h7M13 16h7"/></symbol>
  <symbol id="i-texto" viewBox="0 0 24 24"><path d="M5 7h14M5 12h14M5 17h9"/></symbol>
  <symbol id="i-balao" viewBox="0 0 24 24"><path d="M12 4.500c4.400 0 8 3 8 6.800s-3.600 6.800-8 6.800c-.900 0-1.800-.100-2.600-.400L5 19.500l1.200-3.400C4.800 14.900 4 13.200 4 11.300c0-3.800 3.600-6.800 8-6.800z"/></symbol>
  <symbol id="i-filtro" viewBox="0 0 24 24"><path d="M4.500 6h15l-5.800 6.800v5.200l-3.400 1.500v-6.700z"/></symbol>
  <symbol id="i-grade" viewBox="0 0 24 24"><rect x="4.500" y="4.500" width="6" height="6" rx="1.200"/><rect x="13.500" y="4.500" width="6" height="6" rx="1.200"/><rect x="4.500" y="13.500" width="6" height="6" rx="1.200"/><rect x="13.500" y="13.500" width="6" height="6" rx="1.200"/></symbol>
    </svg>
  );
}
