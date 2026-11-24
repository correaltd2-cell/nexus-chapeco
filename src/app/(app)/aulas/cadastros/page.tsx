import { redirect } from 'next/navigation';
/* Os cadastros da agenda moram na tela Cadastros desde 24/11/2026; o endereço antigo leva para lá. */
export default function Pagina() { redirect('/cadastros/professores'); }
