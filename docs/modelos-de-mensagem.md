# Modelos de mensagem

Modelo aprovado pela Meta é o único jeito de falar com quem não escreve para a escola há
mais de 24 horas, e o jeito de mandar aviso com botão (confirmar aula, pedir a 2ª via).

## Como funciona

- **A fonte é a biblioteca** em `src/lib/dominio/modelos.ts`. As regras da Meta (variável
  nunca no começo nem no fim, nunca grudada em outra, botão até 25 letras, exemplos) são
  conferidas ali e provadas em `node --experimental-strip-types testes/modelos.ts`.
  **Rodar antes de mexer em qualquer texto.**
- **O sistema manda sozinho para a Meta** o que a biblioteca tem e a conta não:
  `/api/cron/modelos`, de hora em hora (`vercel.json`), e o botão "Conferir com a Meta"
  em Configurações, Modelos de mensagem. A situação de cada um (aprovado, em análise,
  recusado e por quê, categoria que a Meta deu) fica na coleção `templates`.
- **Modelo apagado na Meta não volta sozinho.** A Meta nem deixa repetir o nome por um
  mês. Em Configurações dá para mandar de novo, um por um.
- **Pedido recusado na hora** (texto fora da regra, nome em uso) tenta de novo no dia
  seguinte, não a cada hora, e aparece na Saúde do sistema como aviso (não é alarme).
- **Mudar um texto que já foi aprovado** não muda nada na Meta: o sistema só cria o que
  falta. Para trocar o texto, crie um nome novo na biblioteca (por exemplo
  `confirmacao_aula_v2`) e deixe o antigo apagado na Meta.
- **Na conversa**, o botão de modelo fica ao lado do relógio, e vira o botão principal
  quando a janela de 24 horas fechou. O primeiro nome já vem preenchido; a prévia mostra
  o texto como o aluno vai ler. Quem envia é `/api/whatsapp/enviar`, que lê o texto do
  banco (não do navegador) e só aceita modelo aprovado.
- Modelo criado à mão no Gerenciador do WhatsApp também aparece, se estiver em português
  e aprovado, com campos genéricos ("campo 1").

## Custo

Utilidade (aula, prova, financeiro) custa menos que marketing (convite, aniversário).
Se a Meta discordar da categoria, ela troca sozinha e a tela avisa. Precisa de forma de
pagamento na conta do WhatsApp, senão nenhum modelo sai (erro 131042).

## O que precisa estar ligado

- `WHATSAPP_TOKEN` com a permissão de gerenciar a conta (`whatsapp_business_management`),
  além da de mandar mensagem. O usuário de sistema da Nexus com controle total já tem.
- `WHATSAPP_BUSINESS_ACCOUNT_ID` da conta do número novo (+55 49 98896-5170).
- `CRON_SECRET`, como nos outros relógios.

## A biblioteca (32 modelos)

Entre colchetes, o que a pessoa preenche na hora de enviar. Os dois lembretes da agenda
saem sozinhos na véspera (docs/agenda.md) e não aparecem na escolha da conversa.

### Aulas

**Marcação da semana** (`marcacao_aula_semana`, Utilidade)  
Quem ainda não marcou a aula da semana.

> Oi, [primeiro nome]! A grade de aulas da semana que começa em [início da semana] já está aberta e a sua aula ainda não foi marcada. Quer escolher o seu horário agora?
>
> Botões: Quero marcar · Já marquei

**Lembrete de marcação** (`marcacao_aula_lembrete`, Utilidade)  
A semana está passando e o aluno não marcou.

> Oi, [primeiro nome]! A semana está passando e a sua aula ainda não foi marcada. Responda aqui com o melhor dia e horário para você que a gente encaixa na grade.
>
> Botões: Quero marcar

**Confirmação de aula** (`confirmacao_aula`, Utilidade)  
Um dia antes da aula, para confirmar presença.

> Oi, [primeiro nome]! Passando para confirmar a sua aula de [dia], às [horário]. Podemos contar com você?
>
> Botões: Confirmo · Preciso remarcar

**Lembrete de aula hoje** (`lembrete_aula_hoje`, Utilidade)  
No dia da aula, algumas horas antes.

> Oi, [primeiro nome]! Hoje tem aula às [horário]. Se não puder vir, avise por aqui para a gente liberar o horário para outro aluno.
>
> Botões: Estarei lá · Não vou conseguir

**Aula cancelada** (`aula_cancelada`, Utilidade)  
A escola precisou cancelar a aula marcada.

> Oi, [primeiro nome]! A sua aula de [dia], às [horário], foi cancelada. Pedimos desculpas pelo transtorno. Responda esta mensagem para escolher um novo horário.
>
> Botões: Escolher horário

**Aula marcada** (`aula_marcada`, Utilidade)  
A aula foi marcada na agenda pela conversa e a janela de 24 horas já fechou.

> Oi, [primeiro nome]! A sua aula ficou marcada para [dia], às [horário]. Se precisar mudar, é só responder por aqui.
>
> Botões: Combinado · Preciso remarcar

**Aula remarcada** (`aula_remarcada`, Utilidade)  
A aula mudou de dia ou de horário.

> Oi, [primeiro nome]! A sua aula foi remarcada para [dia], às [horário]. Se esse horário não for bom para você, é só responder por aqui.
>
> Botões: Combinado · Não posso

**Falta e reposição** (`falta_reposicao`, Utilidade)  
O aluno faltou e pode marcar a reposição.

> Oi, [primeiro nome]! Sentimos a sua falta na aula de [dia]. Para você não perder o conteúdo, que tal marcar uma reposição? Responda aqui com o melhor horário.
>
> Botões: Quero repor · Vejo depois

**Reposição marcada** (`reposicao_marcada`, Utilidade)  
A reposição ficou marcada.

> Oi, [primeiro nome]! A sua reposição está marcada para [dia], às [horário]. Te esperamos na Nexus!
>
> Botões: Confirmo · Preciso remarcar

**Dia sem aula** (`aviso_sem_aula`, Utilidade)  
Feriado, recesso ou escola fechada.

> Oi, [primeiro nome]! Por causa de [motivo], não teremos aula em [dia]. As aulas seguem normalmente depois disso. Qualquer dúvida, é só responder por aqui.

**Lembrete da agenda** (`lembrete_aula_agenda`, Utilidade)  
Sai sozinho na véspera da aula marcada na agenda. Os botões mudam a aula na agenda.

> Oi, [primeiro nome]! Passando para lembrar da sua aula de amanhã, [dia], às [horário] ([aula]). Podemos contar com você? Toque em um dos botões abaixo.
>
> Botões: Confirmar · Remarcar

### Provas

**Prova marcada** (`prova_agendada`, Utilidade)  
A prova de fim de módulo ficou marcada.

> Oi, [primeiro nome]! A sua prova de fim de módulo está marcada para [dia], às [horário]. Revise as últimas lições e, se tiver alguma dúvida, é só responder por aqui. Boa prova!
>
> Botões: Confirmo · Preciso remarcar

**Prova pendente** (`prova_pendente`, Utilidade)  
O aluno terminou o módulo e ainda não fez a prova.

> Oi, [primeiro nome]! A sua prova de fim de módulo do [nível] ainda está pendente. Responda aqui para combinarmos o melhor dia para fazer.
>
> Botões: Quero marcar

**Resultado da prova** (`prova_resultado`, Utilidade)  
A prova foi corrigida.

> Oi, [primeiro nome]! O resultado da sua prova do [módulo] saiu: a sua nota foi [nota]. Se quiser conversar sobre a correção, é só responder por aqui.
>
> Botões: Ver a correção

**Passou de nível** (`prova_aprovacao`, Utilidade)  
O aluno passou na prova e sobe de nível.

> Parabéns, [primeiro nome]! Você passou na prova do [nível de agora] e segue agora para o [próximo nível]. Estamos muito felizes com a sua evolução!

### Financeiro

**Lembrete de vencimento** (`financeiro_vencimento`, Utilidade)  
Alguns dias antes de a parcela vencer.

> Oi, [primeiro nome]! Passando para lembrar que a parcela de [valor] vence em [vencimento]. Se precisar da segunda via, é só tocar no botão abaixo.
>
> Botões: Quero a 2ª via · Já paguei

**Parcela em aberto** (`financeiro_em_aberto`, Utilidade)  
A parcela venceu e não consta o pagamento.

> Oi, [primeiro nome]! Consta em aberto a parcela de [valor], que venceu em [vencimento]. Se já pagou, pode desconsiderar esta mensagem. Se precisar de ajuda, o nosso financeiro está por aqui.
>
> Botões: Quero a 2ª via · Já paguei · Falar com o financeiro

**Pagamento recebido** (`financeiro_pagamento_recebido`, Utilidade)  
O pagamento caiu.

> Oi, [primeiro nome]! Recebemos o pagamento de [valor], referente a [referente a]. Muito obrigado pela confiança e bons estudos!

**Assunto do financeiro** (`financeiro_conversar`, Utilidade)  
O financeiro precisa falar com o aluno sobre um assunto dele.

> Oi, [primeiro nome]! Aqui é do financeiro da Nexus English Center Chapecó. Precisamos falar com você sobre [assunto]. Pode responder por aqui quando tiver um minutinho?
>
> Botões: Pode falar

### Contrato

**Boas-vindas** (`matricula_boas_vindas`, Utilidade)  
Logo depois da matrícula.

> Oi, [primeiro nome]! Boas-vindas à Nexus English Center Chapecó! A sua matrícula no [nível] está confirmada e a primeira aula é em [dia da primeira aula]. Salve este número: é por aqui que você fala com a escola.

**Fim do contrato** (`contrato_terminando`, Utilidade)  
O contrato está perto do fim.

> Oi, [primeiro nome]! O seu contrato com a Nexus termina em [data do fim]. Se quiser saber como continuar os estudos no próximo nível, é só responder por aqui.
>
> Botões: Quero saber · Agora não

### Kids

**Lembrete da agenda (Kids)** (`lembrete_aula_kids`, Utilidade)  
Sai sozinho para o responsável na véspera da aula Kids marcada na agenda.

> Oi, [nome do responsável]! Passando para lembrar da aula de [nome do aluno] amanhã, [dia], às [horário]. Podemos contar com a presença? Toque em um dos botões abaixo.
>
> Botões: Confirmar · Remarcar

**Kids: confirmação de aula** (`kids_confirmacao_aula`, Utilidade)  
Para o responsável, um dia antes da aula.

> Oi, [nome do responsável]! Passando para confirmar a aula de [nome do aluno] em [dia e horário]. Podemos contar com a presença?
>
> Botões: Confirmo · Preciso remarcar

**Kids: falta na aula** (`kids_falta`, Utilidade)  
Para o responsável, quando o aluno faltou.

> Oi, [nome do responsável]! Sentimos falta de [nome do aluno] na aula de [dia]. Está tudo bem? Responda aqui para combinarmos uma reposição.
>
> Botões: Quero repor · Vejo depois

**Kids: resultado da prova** (`kids_resultado_prova`, Utilidade)  
Para o responsável, com a nota da prova.

> Oi, [nome do responsável]! O resultado da prova de [nome do aluno] saiu: a nota foi [nota]. Se quiser conversar sobre o desempenho, é só responder por aqui.
>
> Botões: Quero conversar

**Kids: recado da coordenação** (`kids_recado_coordenacao`, Utilidade)  
A Coordenação Kids quer falar com o responsável.

> Oi, [nome do responsável]! Aqui é da Coordenação Kids da Nexus. Queremos conversar com você sobre [assunto]. Pode responder por aqui quando tiver um minutinho?
>
> Botões: Pode falar

### Contato

**Chamar para conversar** (`chamada_aluno`, Utilidade)  
Para abrir a conversa com quem não escreve há mais de 24 horas.

> Oi, [primeiro nome]! Aqui é da Nexus English Center Chapecó. A nossa equipe precisa falar com você. Pode responder esta mensagem quando tiver um minutinho?
>
> Botões: Pode falar

**Assunto urgente** (`assunto_urgente`, Utilidade)  
Quando a escola precisa de resposta logo.

> Oi, [primeiro nome]! Aqui é da Nexus English Center Chapecó. Precisamos falar com você com urgência sobre [assunto]. Por favor, responda esta mensagem assim que puder.
>
> Botões: Pode falar agora · Mais tarde

**Retomar o atendimento** (`retomada_atendimento`, Utilidade)  
A conversa ficou pela metade e a janela fechou.

> Oi, [primeiro nome]! A nossa conversa sobre [assunto] ficou pela metade e queremos te ajudar a resolver. Pode responder por aqui quando puder?
>
> Botões: Vamos continuar

**Retomar contato** (`retomada_contato`, Marketing)  
Ex-aluno ou interessado que sumiu. Quem conversa depois é o vendedor.

> Oi, [primeiro nome]! Aqui é da Nexus English Center Chapecó. Faz um tempo que a gente não conversa e queremos saber como está o seu inglês. Temos turmas e horários novos. Quer conhecer?
>
> Botões: Quero conhecer · Agora não

**Feliz aniversário** (`feliz_aniversario`, Marketing)  
No aniversário do aluno.

> Feliz aniversário, [primeiro nome]! Toda a equipe da Nexus English Center Chapecó deseja um ano incrível para você. Happy birthday! 🎉

### Equipe

**Aviso à coordenação** (`aviso_demanda_coordenacao`, Utilidade)  
Sai sozinho para o Natan, a Karina ou o Financeiro quando a conversa passa para o setor deles (no Financeiro, o [setor] vai como "equipe do Financeiro").

> Oi, [nome de quem recebe]! Chegou uma conversa para a [setor] no sistema da Nexus: [contato]. Responda pelo sistema.
>
> Botões: Abrir conversa (link)

