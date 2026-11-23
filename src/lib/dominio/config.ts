/* O que a escola muda sozinha, sem deploy. Mora em `config/atendimento`.
   So entra aqui o que ALGUMA tela ou rota realmente le: botao que nao faz nada é
   pior do que botao que nao existe. */
export interface ConfigDoAtendimento {
  /** A triagem abre a tarefa no quadro quando o assunto da mensagem é claro. */
  abreTarefaNaTriagem: boolean;
  /** Depois de quantos minutos o tempo de aguardo fica vermelho no painel. */
  minutosDeAguardo: number;
  /** A mensagem da equipe sai com o nome de quem enviou em negrito, em cima. */
  assinarMensagens: boolean;
  /** Ao passar a conversa para outro setor, o contato recebe uma mensagem curta. */
  avisaAoPassar: boolean;
  /** O texto dela: {primeiro_nome} e {setor} ("o Financeiro") são trocados na hora. */
  textoAoPassar: string;
  /** O botão do modo simulação aparece para a equipe (a gestão sempre vê). */
  simulacaoLiberada: boolean;
}

export const ATENDIMENTO_PADRAO: ConfigDoAtendimento = {
  abreTarefaNaTriagem: true,
  minutosDeAguardo: 30,
  assinarMensagens: true,
  avisaAoPassar: true,
  textoAoPassar: '{primeiro_nome}, tua conversa foi encaminhada para {setor}. Logo alguém te responde por aqui.',
  simulacaoLiberada: true,
};

/** Le o documento de configuracao sem quebrar quando ele ainda nao existe. */
export function leAtendimento(bruto?: Partial<ConfigDoAtendimento> | null): ConfigDoAtendimento {
  const minutos = Number(bruto?.minutosDeAguardo);
  return {
    abreTarefaNaTriagem: bruto?.abreTarefaNaTriagem !== false,
    minutosDeAguardo: Number.isFinite(minutos) && minutos > 0 ? Math.round(minutos) : ATENDIMENTO_PADRAO.minutosDeAguardo,
    assinarMensagens: bruto?.assinarMensagens !== false,
    avisaAoPassar: bruto?.avisaAoPassar !== false,
    textoAoPassar: typeof bruto?.textoAoPassar === 'string' && bruto.textoAoPassar.trim()
      ? bruto.textoAoPassar.trim().slice(0, 500) : ATENDIMENTO_PADRAO.textoAoPassar,
    simulacaoLiberada: bruto?.simulacaoLiberada !== false,
  };
}
