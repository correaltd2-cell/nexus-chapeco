import { Suspense } from 'react';
import Inbox from '@/componentes/inbox';
export const metadata = { title: 'Conversas | Nexus Chapecó' };
/* o inbox lê ?conversa= do endereço; a leitura precisa de Suspense em volta */
export default function Conversas() {
  return <Suspense fallback={<div className="carregando" role="status">Carregando...</div>}><Inbox /></Suspense>;
}
