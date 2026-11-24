/* A foto do contato entra pequena. Ela vive no proprio documento da conversa, entao
   precisa ser leve: um quadrado de 256px em JPEG da uns 20 KB, cabe folgado no limite
   de 1 MB do documento e aparece na lista sem segunda ida ao servidor. */
export const LADO_DA_FOTO = 256;

async function desenha(arquivo: File): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(arquivo);
  const lado = Math.min(bitmap.width, bitmap.height);
  const tela = document.createElement('canvas');
  tela.width = LADO_DA_FOTO; tela.height = LADO_DA_FOTO;
  const pincel = tela.getContext('2d');
  if (!pincel) throw new Error('sem canvas');
  /* corta pelo centro: foto de pessoa fica melhor pelo meio do que esticada */
  pincel.drawImage(
    bitmap,
    (bitmap.width - lado) / 2, (bitmap.height - lado) / 2, lado, lado,
    0, 0, LADO_DA_FOTO, LADO_DA_FOTO,
  );
  bitmap.close?.();
  return tela;
}

/** Reduz a foto escolhida e devolve ela pronta para guardar. */
export async function reduzFoto(arquivo: File): Promise<string> {
  if (!arquivo.type.startsWith('image/')) throw new Error('nao e imagem');
  const tela = await desenha(arquivo);
  return tela.toDataURL('image/jpeg', 0.72);
}

/** A foto do contrato vai para a IA ler: no máximo 2200px no lado maior, em JPEG, para
    ficar leve (a foto do celular passa fácil de 5 MB, que é o limite da leitura). Foto
    pequena vai como está. O que o navegador não abre (às vezes o HEIC do iPhone) falha
    com o erro "foto", e a tela pede outro formato. */
export async function reduzParaLer(arquivo: File, lado = 2200): Promise<File> {
  let bitmap: ImageBitmap;
  try { bitmap = await createImageBitmap(arquivo); } catch { throw new Error('foto'); }
  const escala = Math.min(1, lado / Math.max(bitmap.width, bitmap.height));
  if (escala === 1 && arquivo.size < 1_500_000 && /^image\/(jpeg|png|webp)$/.test(arquivo.type)) { bitmap.close?.(); return arquivo; }
  const tela = document.createElement('canvas');
  tela.width = Math.round(bitmap.width * escala); tela.height = Math.round(bitmap.height * escala);
  tela.getContext('2d')?.drawImage(bitmap, 0, 0, tela.width, tela.height);
  bitmap.close?.();
  const blob = await new Promise<Blob | null>((ok) => tela.toBlob(ok, 'image/jpeg', 0.85));
  if (!blob) throw new Error('foto');
  return new File([blob], arquivo.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' });
}
