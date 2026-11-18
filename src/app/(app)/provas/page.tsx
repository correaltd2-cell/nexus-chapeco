import EmConstrucao from '@/componentes/em-construcao';
export const metadata = { title: 'Provas | Nexus Chapecó' };
export default function Pagina() {
  return (
    <EmConstrucao icone="doc" titulo="Provas"
      resumo="O banco de provas da escola, do envio até a nota, com tudo ligado à conversa do aluno."
      itens={[
        'Provas por trilha, nível e lição, com questões de múltipla escolha e abertas',
        'Enviar a prova pelo WhatsApp e acompanhar quem respondeu',
        'Correção com nota e comentário, guardando quem corrigiu e quando',
        'Histórico de notas do aluno, que nunca é apagado',
        'Atalho na conversa: enviar prova e ver a última nota sem sair do atendimento',
      ]} />
  );
}
