/* Tela que ainda nao existe. Diz o que vai ser e o que ja da para fazer, em vez de
   mostrar uma pagina quebrada ou um "em breve" vazio. */
import { Ic, type NomeIcone } from '@/componentes/icones';

export default function EmConstrucao(
  { icone, titulo, resumo, itens }: { icone: NomeIcone; titulo: string; resumo: string; itens: string[] },
) {
  return (
    <div className="constr">
      <div className="constr-c">
        <span className="constr-i" aria-hidden="true"><Ic n={icone} /></span>
        <h1>{titulo}</h1>
        <p>{resumo}</p>
        <p className="bt">O que vai ter aqui</p>
        <ul>{itens.map((i) => <li key={i}>{i}</li>)}</ul>
      </div>
    </div>
  );
}
