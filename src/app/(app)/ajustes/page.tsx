import EmConstrucao from '@/componentes/em-construcao';
export const metadata = { title: 'Configurações | Nexus Chapecó' };
export default function Pagina() {
  return (
    <EmConstrucao icone="ajuste" titulo="Configurações"
      resumo="Onde a escola muda o sistema sem precisar de mim."
      itens={[
        'Equipe: criar login, escolher papel e setor, e tirar o acesso de quem saiu',
        'Atendimento: saudação, botões da triagem e horário da escola',
        'IA do financeiro: textos, botões e o que ela pode responder',
        'Etiquetas e respostas rápidas',
        'WhatsApp: conferir a conexão, trazer os modelos e mandar um teste',
        'Aparência: tema claro, escuro ou automático',
      ]} />
  );
}
