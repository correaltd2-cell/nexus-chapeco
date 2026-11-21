import { Suspense } from 'react';
import Agenda from '@/componentes/agenda/agenda';
export const metadata = { title: 'Agenda | Nexus Chapecó' };
/* a agenda lê ?aluno= e ?data= do endereço (o link da conversa); a leitura precisa de Suspense em volta */
export default function Pagina() {
  return <Suspense fallback={<div className="carregando" role="status">Carregando...</div>}><Agenda /></Suspense>;
}
