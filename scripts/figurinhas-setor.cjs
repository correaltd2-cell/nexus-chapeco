/* eslint-disable @typescript-eslint/no-require-imports -- script de Node, roda fora do Next */
/* Gera as figurinhas de setor que o contato recebe no WhatsApp quando a conversa passa
   para um setor (public/figurinhas/setor-<setor>.webp). Figurinha do WhatsApp: WebP,
   512 x 512, fundo transparente, até 100 KB. As cores e os ícones são os do sistema
   (.st-* em globals.css e o sprite de componentes/icones.tsx).
   Rodar (precisa do Playwright e do sharp, que já vem com o Next):
     node scripts/figurinhas-setor.cjs [pasta com bricolage-grotesque-latin-600/800-normal.woff2]
   Sem a pasta, a fonte vem do Google Fonts. */
const { chromium } = require('playwright');
const sharp = require('sharp');
const fs = require('node:fs');
const path = require('node:path');

const SETORES = [
  { id: 'recepcao', artigo: 'a', nome: 'Recepção', cor: '#F6821F', txt: '#141414', tam: 78,
    icone: '<path d="M12 4.5c4.4 0 8 3 8 6.8s-3.6 6.8-8 6.8c-.9 0-1.8-.1-2.6-.4L5 19.5l1.2-3.4C4.8 14.9 4 13.2 4 11.3c0-3.8 3.6-6.8 8-6.8z"/>' },
  { id: 'financeiro', artigo: 'o', nome: 'Financeiro', cor: '#1E8A52', txt: '#fff', tam: 74,
    icone: '<circle cx="12" cy="12" r="8.5"/><path d="M14.8 9.4c-.5-.9-1.5-1.5-2.8-1.5-1.7 0-2.9.9-2.9 2.1 0 2.9 5.9 1.2 5.9 4.2 0 1.2-1.2 2.1-3 2.1-1.4 0-2.5-.6-3-1.6M12 6.2v1.7M12 16.3V18"/>' },
  { id: 'coordenacao', artigo: 'a', nome: 'Coordenação', cor: '#2E67B1', txt: '#fff', tam: 62,
    icone: '<circle cx="9" cy="9" r="3.2"/><path d="M3.5 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5M15.5 6.2a3 3 0 0 1 0 5.6M17.5 14.6c1.6.8 2.6 2.3 3 4.4"/>' },
  { id: 'kids', artigo: 'a', nome: 'Coordenação Kids', cor: '#7B4CC4', txt: '#fff', tam: 58,
    icone: '<circle cx="12" cy="12" r="3.8"/><path d="M12 3.5v2M12 18.5v2M3.5 12h2M18.5 12h2M6 6l1.4 1.4M16.6 16.6 18 18M6 18l1.4-1.4M16.6 7.4 18 6"/>' },
];

function fontes(pasta) {
  if (!pasta) return '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@600;800&display=block">';
  const f = (peso) => fs.readFileSync(path.join(pasta, `bricolage-grotesque-latin-${peso}-normal.woff2`)).toString('base64');
  return `<style>@font-face{font-family:"Bricolage Grotesque";font-weight:600;src:url(data:font/woff2;base64,${f(600)}) format("woff2")}
@font-face{font-family:"Bricolage Grotesque";font-weight:800;src:url(data:font/woff2;base64,${f(800)}) format("woff2")}</style>`;
}

const pagina = (s, cabeca) => `<!doctype html><html><head><meta charset="utf-8">${cabeca}<style>
html,body{margin:0;background:transparent}
.fig{width:512px;height:512px;display:grid;place-items:center}
.c{box-sizing:border-box;width:456px;height:456px;border-radius:88px;border:12px solid #fff;padding:24px 30px;
  background:linear-gradient(160deg,color-mix(in srgb,${s.cor} 72%,#fff) 0%,${s.cor} 42%,color-mix(in srgb,${s.cor} 80%,#000) 100%);
  box-shadow:0 8px 18px rgba(0,0,0,.30);color:${s.txt};font-family:"Bricolage Grotesque",Inter,sans-serif;
  display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:6px}
.ic{flex:none;width:112px;height:112px;border-radius:50%;background:#fff;display:grid;place-items:center;box-shadow:inset 0 -6px 0 rgba(0,0,0,.08);margin-bottom:12px}
.ic svg{width:68px;height:68px;stroke:${s.cor};fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.l1{font-weight:600;font-size:30px;line-height:1.1;opacity:.92;white-space:nowrap}
.nm{font-weight:800;font-size:${s.tam}px;line-height:1;letter-spacing:-.025em;max-width:380px}
.mc{font-weight:600;font-size:22px;opacity:.85;margin-top:12px;letter-spacing:.01em}
</style></head><body><div class="fig"><div class="c">
<div class="ic"><svg viewBox="0 0 24 24">${s.icone}</svg></div>
<div class="l1">Agora quem te atende é ${s.artigo}</div>
<div class="nm">${s.nome}</div>
<div class="mc">Nexus Chapecó</div>
</div></div></body></html>`;

(async () => {
  const destino = path.join(__dirname, '..', 'public', 'figurinhas');
  fs.mkdirSync(destino, { recursive: true });
  const cabeca = fontes(process.argv[2]);
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 512, height: 512 } });
  for (const s of SETORES) {
    await p.setContent(pagina(s, cabeca), { waitUntil: 'networkidle' });
    await p.evaluate(() => document.fonts.ready);
    const png = await p.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: 512, height: 512 } });
    const arquivo = path.join(destino, `setor-${s.id}.webp`);
    await sharp(png).resize(512, 512).webp({ quality: 85, alphaQuality: 90, effort: 6 }).toFile(arquivo);
    const kb = fs.statSync(arquivo).size / 1024;
    console.log(`${arquivo}: ${kb.toFixed(1)} KB${kb > 100 ? '  (passou de 100 KB: o WhatsApp recusa)' : ''}`);
  }
  await b.close();
})();
