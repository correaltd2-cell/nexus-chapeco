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
