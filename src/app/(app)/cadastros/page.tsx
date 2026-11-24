import Cadastros from '@/componentes/cadastros';
export const metadata = { title: 'Cadastros | Nexus Chapecó' };
/* ?novo=1 chega do botão Cadastrar aluno da planilha de marcação e já abre a ficha */
export default async function Pagina({ searchParams }: { searchParams: Promise<{ novo?: string }> }) {
  const { novo } = await searchParams;
  return <Cadastros parte="alunos" abrirFicha={novo === '1'} />;
}
