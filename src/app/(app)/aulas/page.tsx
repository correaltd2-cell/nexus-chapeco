import EmConstrucao from '@/componentes/em-construcao';
export const metadata = { title: 'Aulas | Nexus Chapecó' };
export default function Pagina() {
  return (
    <EmConstrucao icone="agenda" titulo="Aulas"
      resumo="A grade da semana, ligada na planilha do Google que a escola já usa."
      itens={[
        'A grade da semana como ela é hoje, com os horários e quem está marcado',
        'Disparo na segunda pedindo a marcação, para todos os alunos ativos',
        'Na sexta, a lista de quem não agendou, para retomar a conversa',
        'Sugestão dos horários que ainda têm vaga, na hora de responder',
        'Confirmação de aula na véspera',
      ]} />
  );
}
