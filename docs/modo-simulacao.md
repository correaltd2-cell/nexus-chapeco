# Modo simulação

Para mostrar à equipe como o sistema funciona, sem tocar no banco da escola nem no
WhatsApp (pedido do cliente, 23/11/2026).

## Como usar

1. **Configurações, Modo simulação, Entrar no modo simulação.**
2. O sistema recarrega com a faixa laranja "Modo simulação" no topo e abre conversas,
   quadros, alunos, agenda e relatórios fictícios (os mesmos da demonstração).
3. Dá para fazer tudo: transferir de setor (com a comemoração e a mensagem que o aluno
   receberia), encerrar atendimento, mandar mensagem, mexer nos quadros, na agenda e na
   planilha de alunos, abrir os relatórios.
4. **Sair da simulação**, na faixa do topo (ou em Configurações): o sistema volta aos
   dados de verdade.

## O que garante que nada vaza

- Vale só no aparelho em que se entrou: é uma marca no navegador (`nexus-simulacao`).
- Com a marca, a camada de dados (`src/lib/dados/fonte.ts`) usa a base em memória da
  demonstração (`modoDemo`), e a sessão não tem usuário do Firebase: nenhuma tela
  consegue chamar o servidor, o banco ou a Meta. O nome de quem entrou aparece como o
  de quem usa, com o perfil de administrador da demonstração, para ver tudo.
- Nada é gravado no banco, então não sobra nada para apagar. O que se muda some ao
  recarregar a página.
- Mensagem de verdade que chegar enquanto alguém está na simulação continua no banco e
  aparece quando sair; o aviso no celular (push) chega normalmente.

## Para esconder

Configurações, Modo simulação, **Mostrar o modo simulação para a equipe**: desligado, o
botão de entrar some para todo mundo (a gestão continua vendo a chave). Quem estiver
dentro sai pela faixa do topo.

## Onde mora

`src/lib/dados/simulacao.ts` (entrar e sair), `src/lib/dados/fonte.ts` (`modoSimulacao`),
`src/componentes/sessao.tsx` (perfil da simulação), a faixa em `src/app/(app)/layout.tsx`
e a seção em `src/componentes/configuracoes.tsx`. A chave da gestão é
`config/atendimento.simulacaoLiberada`. Os dados fictícios são os da demonstração:
`src/lib/dados/exemplo.ts` e `src/lib/dominio/agenda-exemplo.ts`.
