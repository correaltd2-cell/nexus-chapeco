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
  /** Ao passar a conversa para um setor, o contato recebe a figurinha do setor. */
  figurinhaAoPassar: boolean;
}

export const ATENDIMENTO_PADRAO: ConfigDoAtendimento = {
  abreTarefaNaTriagem: true,
  minutosDeAguardo: 30,
  assinarMensagens: true,
  figurinhaAoPassar: true,
};

/** Le o documento de configuracao sem quebrar quando ele ainda nao existe. */
export function leAtendimento(bruto?: Partial<ConfigDoAtendimento> | null): ConfigDoAtendimento {
  const minutos = Number(bruto?.minutosDeAguardo);
  return {
    abreTarefaNaTriagem: bruto?.abreTarefaNaTriagem !== false,
    minutosDeAguardo: Number.isFinite(minutos) && minutos > 0 ? Math.round(minutos) : ATENDIMENTO_PADRAO.minutosDeAguardo,
    assinarMensagens: bruto?.assinarMensagens !== false,
    figurinhaAoPassar: bruto?.figurinhaAoPassar !== false,
  };
}
