/* A tarja preta que aparece embaixo quando algo acontece. Um lugar so, para a frase
   ser a mesma em todo o sistema. */
let relogio: ReturnType<typeof setTimeout> | undefined;

export function avisa(texto: string) {
  if (typeof document === 'undefined') return;
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = texto;
  el.classList.add('on');
  clearTimeout(relogio);
  relogio = setTimeout(() => el.classList.remove('on'), 2800);
}
