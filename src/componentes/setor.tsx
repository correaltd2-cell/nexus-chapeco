/* A etiqueta do setor: cor cheia e ícone, para bater o olho e saber onde a conversa
   está. É de propósito diferente da etiqueta de assunto, que é clarinha: setor diz
   quem atende, assunto diz do que se trata. */
import { Ic } from '@/componentes/icones';
import { NOME_SETOR } from '@/lib/dominio/acessos';
import type { Setor } from '@/lib/dominio/tipos';

const ICONE: Record<Setor, string> = {
  recepcao: 'balao', financeiro: 'moeda', coordenacao: 'pessoas', kids: 'sol',
};

export function SetorTag({ setor }: { setor: Setor }) {
  return (
    <span className={`setor st-${setor}`} title={`Setor: ${NOME_SETOR[setor]}`}>
      <Ic n={ICONE[setor]} />{NOME_SETOR[setor]}
    </span>
  );
}
