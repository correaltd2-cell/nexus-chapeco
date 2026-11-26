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
| Semana (visão padrão, hora cheia, todas as aulas), feita aqui | `src/componentes/agenda/semana.tsx` |
| Grade por professor, feita aqui | `src/componentes/agenda/grade.tsx` |
| Contas da Semana e da Grade (células da Semana, colunas, encaixe, altura das linhas, contador, nomes curtos, tinta do professor) | `src/lib/dominio/agenda-grade.ts`, prova em `testes/agenda-grade.ts` |
| Dia fechado (domingo) | `DIAS_FECHADOS` em `src/lib/dominio/agenda.ts` |
| Calendário (FullCalendar 7: Mês e Dia), modal, filtros | `src/componentes/agenda/` |
| Lembrete, resposta aos botões, próxima aula de quem escreve, resumo com IA | `src/lib/agenda-servidor.ts` |
| A agenda na conversa (painel e atalho) | `src/componentes/aulas-na-conversa.tsx` |
| Por quem o número fala (telefone com e sem o 9, responsável) | `src/lib/dominio/contato.ts`, prova em `testes/contato.ts` |
| Rotas | `/api/agenda/lembrete`, `/api/agenda/resumo`, `/api/agenda/teste`, `/api/cron/lembretes` |
| Telas | `/aulas` (Semana, Grade, Mês e Dia), `/aulas/relatorio`, `/aulas/log`; os cadastros (professores, módulos, aulas) moram em `/cadastros/professores` e `/cadastros/aulas` desde 24/11/2026 (`/aulas/cadastros` leva para lá) |

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

## A Semana e as visões (24/11/2026)

Com os dados do ELLO (1.993 aulas, 632 bloqueios, 14 professores) a semana do
calendário ficou ilegível: reunião de professor cobrindo o dia inteiro e 6 a 8 aulas
espremidas na mesma coluna. Primeiro veio a Grade por professor; no mesmo dia o cliente
pediu a **Semana como padrão**, em **hora cheia**, com **todas as aulas sempre à vista**
("quando tem mais de 3 aulas, fica aparecendo um +2. Não pode acontecer") e a tela menos
poluída. As regras de conflito, recorrência e permissão e o formato dos dados não mudaram:
isto é só tela.

**Semana** (padrão), feita aqui, sem o calendário
- Colunas = os dias abertos (segunda a sábado), com quantas aulas tem cada um; o nome do
  dia abre a Grade daquele dia. Setas andam uma semana; Hoje volta para a semana de hoje.
- Linhas = horas cheias, das 7h às 21h (aula fora disso abre a linha dela). A aula das
  18:30 fica na linha das 18h, com o horário escrito nela.
- **Cada célula lista todas as aulas que começam naquela hora, uma embaixo da outra**:
  bolinha de status, horário, aula curta ("A2 L11"), professor e quantos alunos. Os nomes
  dos alunos ficam no passar o mouse e no modal. **Nunca há "+N"**: a linha cresce o que
  precisar, e hora sem nada fica baixinha. No mesmo horário, a ordem é pelo professor.
- Cor do professor suave no fundo e cheia na borda; cancelada bem apagada.
- Bloqueio da escola pinta as células que cobre, com o nome na primeira. O do professor
  só aparece com a chave **Mostrar bloqueios** (desligada; fica no aparelho; mostra
  quantos há na semana), como item listrado pequeno na hora em que começa.
- Clique no espaço vazio da célula: aula nova naquele dia e hora (uma hora). Arrastar a
  aula para outra célula: outro dia e hora com os mesmos minutos, pela mesma
  conferência de conflito; aula de série pergunta "só esta ou esta e as próximas".
- Abre perto da hora pedida (o "Ver na agenda" da conversa) ou, na semana de hoje, uma
  hora antes de agora.
- No celular, os dias um embaixo do outro, só com as horas que têm aula.

**Grade** (um dia, uma coluna por professor)
- Setas de dia anterior e próximo, **Hoje** e os atalhos Seg a Sáb.
- Colunas = professores. **"A definir" sempre na primeira**, em laranja: é a fila das
  aulas sem professor (o professor com esse nome na equipe; aula de professor que não
  está na equipe também cai nela). Depois, quem tem mais aula no dia; empate pelo nome.
  A ordem é calculada ao abrir o dia e fica parada enquanto a pessoa está nele, para a
  coluna não pular quando alguém arrasta uma aula. O filtro de professor escolhe as colunas.
- Linhas de **hora cheia**, das 7h às 22h, com o cabeçalho e as horas presos ao rolar.
  Coluna com no mínimo 150px e rolagem de lado. A linha cresce para o cartão mostrar
  **todos os alunos** (até 8; acima disso, 7 e "+N alunos" no próprio cartão).
- Cartão: a cor do professor suave no fundo e cheia na borda de 4px, bolinha de status,
  nome da aula e um aluno por linha, quem faltou riscado. Clique abre o modal.
- Bloqueio do professor é faixa cinza listrada **só na coluna dele**; o da escola
  atravessa todas as colunas.
- Clique no horário vazio: aula nova com aquele professor, dia e hora. Arrastar: outro
  horário (de 15 em 15 minutos) e, em outra coluna, **outro professor**, pela mesma
  conferência de conflito.
- Celular: um professor por vez, pelo seletor ou deslizando para o lado.

**Mês**: cada dia mostra quantas aulas e quantos alunos tem, sem "+N" escondendo aula; o
dia abre a Grade daquele dia.

**Dia**: o calendário em hora cheia (7h às 22h), com os nomes dos alunos no bloco e o
bloqueio de professor só com a chave.

**Esconder canceladas** (fica no aparelho) vale para todas as visões. A legenda fica
recolhida no botão **Legenda**, para a agenda ter mais espaço.

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
- Professor (desde 26/11/2026): só a agenda, e nela **só as aulas dele**. A tela pede ao
  banco só as aulas com o `professorId` dele (sem índice composto: o período sai em
  memória), sem a ficha completa dos alunos (os nomes vêm da própria aula), e os filtros
  de professor e aluno somem. Nas aulas dele, só muda o status e a presença, observação e
  notas dos alunos. Não cria, não exclui, não remarca, não troca aluno. As regras do
  Firestore recusam o resto, mesmo vindo de fora da tela (prova no emulador:
  `npm run test:regras`).
- O professor ganha login em Configurações, Equipe, **na linha dele** ("Criar login"):
  o login nasce com o mesmo id do cadastro, então as aulas que vieram do ELLO continuam
  dele. Criar pelo "Criar login" do alto faria outra pessoa, com a agenda vazia.
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
