import EmConstrucao from '@/componentes/em-construcao';
export const metadata = { title: 'Relatórios | Nexus Chapecó' };
export default function Pagina() {
  return (
    <EmConstrucao icone="grafico" titulo="Relatórios"
      resumo="Os números do atendimento e da escola, do jeito que já foram desenhados na demonstração."
      itens={[
        'Conversas por dia e horário de pico',
        'Tempo até a primeira resposta, por setor, contra a meta',
        'Motivos de contato e quanto a IA do financeiro resolve sozinha',
        'Marcações feitas e quem ficou sem agendar',
        'Provas enviadas, corrigidas e média por turma',
      ]} />
  );
}
