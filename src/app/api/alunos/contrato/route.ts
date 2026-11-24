/* Lê o contrato do aluno para o cadastro (pedido do cliente, 24/11/2026: "quero poder só
   subir o contrato e fazer o cadastro sozinho"). A tela já subiu o arquivo para a pasta
   do aluno no Storage; aqui o servidor baixa, entrega para a IA (PDF e foto como estão,
   Word como texto) e devolve o que ela leu. Quem transforma isso na ficha, com as contas,
   é dominio/contrato.ts, na tela. Nada é gravado aqui: o cadastro só acontece quando a
   recepção confere e toca em Cadastrar aluno. */
import { NextResponse } from 'next/server';
import type { BetaContentBlockParam } from '@anthropic-ai/sdk/resources/beta/messages/messages';
import { adminArquivos, quemChamou } from '@/lib/firebase/admin';
import { iaLigada, leContrato } from '@/lib/ia/claude';
import { caminhoValido, tipoDoContrato, TIPOS_DE_IMAGEM } from '@/lib/dominio/contrato';
import { textoDoDocx } from '@/lib/dominio/docx';
import { descreveErro, falhou } from '@/lib/saude';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const recusa = (erro: string, status = 200) => NextResponse.json({ ok: false, erro }, { status });
const PODE = ['admin', 'gestor', 'recepcao', 'coordenacao'];
const LIMITE = 20 * 1024 * 1024;
const LIMITE_DA_FOTO = 5 * 1024 * 1024;

export async function POST(req: Request) {
  const quem = await quemChamou(req);
  if (!quem) return recusa('Faça login de novo.', 401);
  if (!PODE.includes(quem.papel)) return recusa('Cadastrar aluno é da recepção, da coordenação e da gestão.', 403);
  const { caminho } = (await req.json().catch(() => ({}))) as { caminho?: string };
  if (!caminho || !caminhoValido(caminho)) return recusa('Arquivo do contrato inválido. Escolha o contrato de novo.', 400);
  if (!iaLigada()) return recusa('A leitura do contrato usa a IA, e a chave dela não está configurada na Vercel (ANTHROPIC_API_KEY). Preencha a ficha à mão por enquanto.');

  let anexo: BetaContentBlockParam;
  try {
    const arquivo = adminArquivos().bucket().file(caminho);
    const [meta] = await arquivo.getMetadata();
    const tamanho = Number(meta.size || 0);
    if (tamanho > LIMITE) return recusa('O contrato passa de 20 MB. Mande um PDF menor ou uma foto.');
    const mime = String(meta.contentType || '');
    const tipo = tipoDoContrato(caminho, mime);
    if (!tipo) return recusa('Esse tipo de arquivo não dá para ler. Use PDF, Word (.docx) ou foto (JPG ou PNG).');
    const [bytes] = await arquivo.download();
    if (tipo === 'pdf') {
      anexo = { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: bytes.toString('base64') } };
    } else if (tipo === 'docx') {
      const texto = textoDoDocx(new Uint8Array(bytes));
      if (!texto) return recusa('Não consegui abrir esse arquivo do Word. Salve como PDF e mande de novo.');
      anexo = { type: 'document', source: { type: 'text', media_type: 'text/plain', data: texto }, title: 'Contrato' };
    } else {
      if (tamanho > LIMITE_DA_FOTO) return recusa('A foto do contrato é grande demais. Tire de novo ou mande em PDF.');
      const media = (TIPOS_DE_IMAGEM as readonly string[]).includes(mime) ? mime as (typeof TIPOS_DE_IMAGEM)[number] : 'image/jpeg';
      anexo = { type: 'image', source: { type: 'base64', media_type: media, data: bytes.toString('base64') } };
    }
  } catch (e) {
    await falhou('alunos', `Não consegui abrir o contrato enviado: ${descreveErro(e)}`);
    return recusa('Não consegui abrir o arquivo do contrato. Tente mandar de novo.');
  }

  /* a falha da IA já vai para a saúde do sistema dentro de leContrato */
  const lido = await leContrato(anexo);
  if (!lido) return recusa('Não consegui ler o contrato agora. Tente de novo em instantes, ou preencha a ficha à mão.');
  if (!lido.ehContrato) return recusa('Esse arquivo não parece um contrato de aluno. Confira se escolheu o arquivo certo.');
  return NextResponse.json({ ok: true, lido });
}
