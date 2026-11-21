# Agenda de aulas

A agenda passa a morar no sistema (decisão de 21/11/2026). Agendamento é uma aula num
horário, com um professor e vários alunos dentro. O status é da aula; presença,
observação e notas são de cada aluno.

## Onde está cada coisa

| O quê | Arquivo |
|---|---|
| Regras puras (status, conflito, recorrência, "este e os próximos", permissões, indicadores, CSV, lembrete, resumo) | `src/lib/dominio/agenda.ts`, prova em `testes/agenda.ts` |
| Dados fictícios (3 professores, 15 alunos, 2 semanas, séries, bloqueios, log) | `src/lib/dominio/agenda-exemplo.ts` |
| Gravação pelo navegador (lote único com log) | `src/lib/dados/agenda.ts` |
| Calendário (FullCalendar 7), modal, filtros | `src/componentes/agenda/` |
| Lembrete, resposta aos botões, resumo com IA | `src/lib/agenda-servidor.ts` |
| Rotas | `/api/agenda/lembrete`, `/api/agenda/resumo`, `/api/agenda/teste`, `/api/cron/lembretes` |
| Telas | `/aulas` (calendário), `/aulas/relatorio`, `/aulas/log`, `/aulas/cadastros` |

Rodar antes de mexer nas regras: `node --experimental-strip-types testes/agenda.ts`.

## Dados (Firestore)

- `agendamentos/{id}`: `inicio`, `fim` (ISO), `status` (agendado, confirmado, realizado,
  cancelado, remarcado), `professorId`, `moduloId`, `aulaId`, `modalidade`,
  `recorrenciaId`, `lembreteEnviadoEm`, quem criou e alterou e quando. Também guarda
  `alunoIds` e um resumo `alunos` (id, nome, presença), para o calendário desenhar sem
  abrir a subcoleção de cada aula.
- `agendamentos/{id}/alunos/{alunoId}`: `nomeAluno`, `presenca`, `obs`, `notas` (fala,
  leitura, escuta, escrita, de 0 a 10) e a resposta ao lembrete.
- `recorrencias`, `bloqueios` (feriado, férias, reunião, indisponível; da escola inteira
  ou de um professor), `modulos`, `aulas` (com `moduloId`, `nivel`, `ordem`, `ativo`) e
  `logs_agenda` (antes e depois de cada ação; ninguém apaga).
- Professor não é cadastro novo: é a equipe (`perfis`). Quem tem o papel de professor
  dá aula; a gestão marca "dá aula" em quem mais der (coordenação, por exemplo) e
  escolhe a cor dos blocos em Agenda, Cadastros. Alunos são a coleção `alunos`.
- Datas em ISO, como o resto do sistema. Chapecó não tem horário de verão: as contas de
  dia ("amanhã", "a aula de quinta") usam o fuso fixo de -03:00.

## Regras

- Conflito ao salvar: mesmo professor ou mesmo aluno em horário sobreposto, ou horário
  dentro de bloqueio da escola ou do professor. Aviso claro; só a administração salva por
  cima. Numa série nova, dá para criar sem as datas com conflito.
- Fim depois do início. "Realizado" só com a presença de todos os alunos lançada.
- Cancelado e remarcado não contam como aula dada.
- A série gera todas as aulas na criação, com o mesmo `recorrenciaId`. "Este e os
  próximos" mexe só nas aulas da série com data igual ou depois; leva horário, professor,
  módulo, aula, modalidade e alunos. Status e presença ficam em cada aula.
- Toda ação grava em `logs_agenda`.

## Permissões (também no firestore.rules)

- Admin, gestão, recepção e coordenação: tudo.
- Professor: vê a agenda inteira; nas aulas dele, só muda o status e a presença,
  observação e notas dos alunos. Não cria, não exclui, não remarca, não troca aluno. As
  regras do Firestore recusam o resto, mesmo vindo de fora da tela.
- Relatório, log e cadastros: quem cuida da agenda. Dados de teste: só a administração.

## WhatsApp

- Todo dia às 18h07 de Chapecó (`vercel.json`), cada aula de amanhã com status
  "agendado" e sem lembrete recebe, para cada aluno, o modelo `lembrete_aula_agenda`
  (ou `lembrete_aula_kids`, para o responsável) com os botões **Confirmar** e
  **Remarcar**. O botão "Enviar lembrete no WhatsApp" do modal manda na hora.
- Os dois modelos estão na biblioteca e vão sozinhos para aprovação da Meta. Enquanto não
  forem aprovados, nada sai e a tela diz qual falta. Aluno sem telefone fica de fora, com
  o motivo.
- Confirmar: a aula vira "confirmado", o aluno aparece como "confirmou no WhatsApp" e
  recebe "Combinado, presença confirmada". Remarcar: abre a pendência no quadro da
  Recepção, passa a conversa para a Recepção (com aviso de mensagem nova) e responde que
  a recepção vai chamar. Nenhuma das duas dispara a saudação do atendimento automático.
- `lembreteEnviadoEm` acende o selo verde no bloco.

## Resumo com IA

O botão do modal lê as observações, presenças e notas das últimas 5 aulas de cada aluno
e pede à IA um resumo curto e os pontos de atenção (`/api/agenda/resumo`, no servidor).
Sem a `ANTHROPIC_API_KEY`, devolve o resumo pelas contas e pelas observações.

## Para ligar

1. Publicar as regras e os índices do Firestore:
   `firebase deploy --only firestore:rules,firestore:indexes`. Sem isso, o banco
   recusa tudo da agenda (coleções novas) e as consultas por aluno pedem índice.
2. Em Agenda, Cadastros (administração): **Criar o currículo de partida** (módulos e
   aulas L01 a L20 de cada nível, que a escola ajusta depois).
3. Na equipe, cada professor com o papel de professor ou marcado "dá aula", e a cor dele.
4. Para testar antes: **Carregar dados de teste**; **Limpar dados de teste** apaga só o
   que é de teste.
5. Esperar a aprovação dos dois modelos de lembrete em Configurações, Modelos de mensagem.

## A virada

A grade tem uma fonte só por vez. No dia em que a escola passar a marcar aula aqui, o
ELLO e a planilha deixam de ser usados para marcar; antes disso, a agenda do sistema é só
teste. Importar as aulas que já estão marcadas no ELLO é uma tarefa à parte.
