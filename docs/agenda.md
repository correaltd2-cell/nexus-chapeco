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
| Grade por professor (visão padrão), feita aqui | `src/componentes/agenda/grade.tsx` |
| Contas da Grade e da Semana enxuta (colunas, encaixe, altura das linhas, "+N", contador, nomes curtos, tinta do professor) | `src/lib/dominio/agenda-grade.ts`, prova em `testes/agenda-grade.ts` |
| Dia fechado (domingo) | `DIAS_FECHADOS` em `src/lib/dominio/agenda.ts` |
| Calendário (FullCalendar 7: Semana, Mês e Dia), modal, filtros | `src/componentes/agenda/` |
| Lembrete, resposta aos botões, próxima aula de quem escreve, resumo com IA | `src/lib/agenda-servidor.ts` |
| A agenda na conversa (painel e atalho) | `src/componentes/aulas-na-conversa.tsx` |
| Por quem o número fala (telefone com e sem o 9, responsável) | `src/lib/dominio/contato.ts`, prova em `testes/contato.ts` |
| Rotas | `/api/agenda/lembrete`, `/api/agenda/resumo`, `/api/agenda/teste`, `/api/cron/lembretes` |
| Telas | `/aulas` (Grade, Semana, Mês e Dia), `/aulas/relatorio`, `/aulas/log`; os cadastros (professores, módulos, aulas) moram em `/cadastros/professores` e `/cadastros/aulas` desde 24/11/2026 (`/aulas/cadastros` leva para lá) |

Rodar antes de mexer nas regras: `node --experimental-strip-types testes/agenda.ts`.
Rodar antes de mexer na Grade ou na Semana: `node --experimental-strip-types testes/agenda-grade.ts`.

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
  escolhe a cor dos blocos em Cadastros, Professores. Alunos são a coleção `alunos`.
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

## A Grade e as visões (24/11/2026)

Com os dados do ELLO (1.993 aulas, 632 bloqueios, 14 professores) a semana do
calendário ficou ilegível: reunião de professor cobrindo o dia inteiro e 6 a 8 aulas
espremidas na mesma coluna. A agenda passou a abrir na **Grade**, que é como a recepção
trabalha ("quem está livre às 18h30?"). As regras de conflito, recorrência e permissão e
o formato dos dados não mudaram: isto é só tela.

**Grade** (padrão, também no celular)
- Um dia por vez: setas de dia anterior e próximo, **Hoje** e os atalhos Seg a Sáb.
- Colunas = professores. **"A definir" sempre na primeira**, em laranja: é a fila das
  aulas sem professor (o professor com esse nome na equipe; aula de professor que não
  está na equipe também cai nela). Depois, quem tem mais aula no dia; empate pelo nome.
  A ordem é calculada ao abrir o dia e fica parada enquanto a pessoa está nele, para a
  coluna não pular quando alguém arrasta uma aula. O filtro de professor escolhe as colunas.
- Linhas de 30 em 30 minutos, das 7h30 às 21h30, com o cabeçalho e as horas presos ao
  rolar. Coluna com no mínimo 150px e rolagem de lado: nada se espreme. A linha cresce
  para o cartão mostrar **todos os alunos** (até 8; acima disso, 7 e "+N"); o crescimento
  vale para a linha inteira, como numa planilha.
- Cartão: a cor do professor suave no fundo e cheia na borda de 4px, bolinha de status,
  nome da aula e um aluno por linha (primeiro e último nome), quem faltou riscado.
  Cancelada bem apagada. Clique abre o modal.
- Bloqueio do professor é faixa cinza listrada **só na coluna dele**, com o motivo curto
  ("Reunião", "Não abrir: Pilates"); o nome abre o bloqueio. Bloqueio da escola atravessa
  todas as colunas.
- Clique no horário vazio: aula nova com aquele professor, dia e hora (uma hora).
- Arrastar: outro horário (de 15 em 15 minutos) e, em outra coluna, **outro professor**,
  pela mesma conferência de conflito (incluindo o bloqueio do professor novo); aula de
  série pergunta "só esta ou esta e as próximas". A coluna "A definir" que não existe na
  equipe não recebe aula.
- Celular: um professor por vez, pelo seletor ou deslizando para o lado.

**Semana** (e Mês e Dia)
- Bloco enxuto: hora, nome curto da aula ("A2 L11") e quantos alunos. Os nomes ficam no
  cartão de passar o mouse e no modal (no Dia, que é largo, os nomes aparecem). Em coluna
  estreita, a hora sai (a régua mostra) e os alunos viram o número com o desenho de pessoas.
- **Acima de 4 aulas no mesmo horário, aparecem 3 e um "+N"**, que abre a Grade naquele
  dia e hora. Com 4, aparecem as 4.
- Bloqueio de professor deixou de ser fundo da coluna inteira: só aparece com a chave
  **Mostrar bloqueios** (desligada; a escolha fica no aparelho; a chave mostra quantos
  bloqueios há no período), como bloco pequeno listrado. O da escola continua como faixa.
- **Esconder canceladas** (também fica no aparelho) vale para todas as visões.
- O nome do dia (Semana e Mês) e o dia no Mês abrem a Grade daquele dia.

**Contador** no topo: "X aulas · Y alunos" do dia (Grade e Dia) ou do período (Semana e
Mês), com os filtros. Y conta alunos diferentes.

**Cores**: o texto em cima da cor do professor sai sempre do `textoSobre()`. O fundo do
cartão é a cor misturada com o fundo do tema (16% no claro, 22% no escuro), então cor
neon (#8cff00, #faa0eb) não cansa a vista; a prova confere contraste de 4,5:1 nos dois
temas.

**Domingo fora** (`DIAS_FECHADOS = [0]`): Semana e Mês de segunda a sábado (6 colunas mais
largas); as setas da Grade e do Dia pulam de sábado para segunda e voltam; Hoje num domingo
e qualquer link que caia num domingo (o "Ver na agenda" da conversa, por exemplo) abrem a
segunda seguinte. Para a escola abrir no domingo, é mudar a constante.

**Atenção:** a recorrência não lê `DIAS_FECHADOS`. "Todo dia" ainda gera aula no domingo e
"Toda semana" deixa marcar o D. Não foi mexido porque a recorrência ficou fora deste
pedido; uma aula criada assim existe no banco mas não aparece na agenda.

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

## Na conversa (a agenda e o WhatsApp se falam)

O aluno é a chave. A conversa aponta para ele (`conversas.alunoId`); no Kids, o número do
responsável aponta para os filhos. Conversa nova já chega ligada quando o número bate
com o telefone do aluno ou do responsável, com ou sem o 9 da frente
(`dominio/contato.ts`, prova em `testes/contato.ts`). Sem ligação, a equipe liga à mão
no painel do contato, e troca quando precisar.

- **Painel do contato, "Aluno e aulas"**: nível e lição, as próximas 3 aulas e as 2
  últimas (com a presença), irmãos lado a lado quando quem escreve é o responsável.
- **Atalho na caixa de escrever** (o calendário ao lado do relógio, e "Aulas" quando a
  janela fechou): o mesmo, enxuto. Acende em laranja quando a triagem marcou a conversa
  como Marcação ou Reposição.
- **Confirmar**: a aula agendada vira confirmada, o aluno fica como quem confirmou, vai
  para o log da agenda e deixa recado na conversa.
- **Remarcar** e **Agendar aula**: abrem o modal da agenda. A aula nova já vem com o
  aluno, o professor, o módulo e a modalidade da última aula, o mesmo dia e hora na
  primeira semana livre e a aula seguinte do currículo. Conflito, bloqueio e permissão
  valem como na agenda.
- **O aviso nunca sai sozinho**: depois de confirmar, agendar ou remarcar, o texto
  ("Pronto, Renan! Tua aula ficou marcada para quinta, 26/11, às 19h, com Helena.") vai
  para a caixa de escrever e quem envia é gente. Com a janela de 24 horas fechada, abre
  o modelo aprovado já preenchido: `aula_marcada`, `aula_remarcada` ou
  `confirmacao_aula`. **Avisar** faz o mesmo com a próxima aula.
- **Ver na agenda** abre o calendário filtrado no aluno, na semana e na hora da próxima
  aula (`/aulas?aluno=ID&data=AAAA-MM-DD&hora=HH:MM`).
- **Da agenda para a conversa**: no modal da aula, o balão verde ao lado de cada aluno
  abre a conversa dele (para quem vê as conversas de todos os setores).
- **"Minhas aulas" no atendimento automático**: o contato toca no botão e recebe a
  próxima aula com Confirmar presença, Remarcar e Falar com a recepção
  (docs/atendimento-automatico.md). Enquanto ele escolhe, ninguém do time é chamado.

## Resumo com IA

O botão do modal lê as observações, presenças e notas das últimas 5 aulas de cada aluno
e pede à IA um resumo curto e os pontos de atenção (`/api/agenda/resumo`, no servidor).
Sem a `ANTHROPIC_API_KEY`, devolve o resumo pelas contas e pelas observações.

## Para ligar

1. Publicar as regras e os índices do Firestore:
   `firebase deploy --only firestore:rules,firestore:indexes`. Sem isso, o banco
   recusa tudo da agenda (coleções novas) e as consultas por aluno pedem índice.
2. Em Cadastros, Módulos e aulas (administração): **Criar o currículo de partida** (módulos e
   aulas L01 a L20 de cada nível, que a escola ajusta depois).
3. Na equipe, cada professor com o papel de professor ou marcado "dá aula", e a cor dele.
   Nos alunos, o telefone (e o do responsável, no Kids): é por ele que a conversa acha o
   aluno sozinha.
4. Para testar antes: **Carregar dados de teste**; **Limpar dados de teste** apaga só o
   que é de teste.
5. Esperar a aprovação dos dois modelos de lembrete e do `aula_marcada` em Configurações,
   Modelos de mensagem.
6. Para o "Minhas aulas" responder com a próxima aula: ligar o atendimento automático e
   deixar o botão com "mostra a próxima aula" (já vem assim).

## A virada

A grade tem uma fonte só por vez. No dia em que a escola passar a marcar aula aqui, o
ELLO e a planilha deixam de ser usados para marcar; antes disso, a agenda do sistema é só
teste. Importar as aulas que já estão marcadas no ELLO é uma tarefa à parte.
