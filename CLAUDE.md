# Nexus Chapecó — Sistema da escola

Sistema próprio da **Nexus English Center, unidade Chapecó**. Atendimento no WhatsApp
oficial, quadros de trabalho, provas, marcação de aulas e relatórios, num lugar só.

Este arquivo é o contexto permanente do projeto. Leia antes de qualquer tarefa.

---

## 1. O negócio em uma tela

A escola vende curso de inglês presencial e online, em níveis (Starter, A1, A2, B1, B2)
e em trilha Kids. O aluno marca aula semana a semana, faz prova ao fim de cada módulo
e renova o contrato quando o curso acaba.

```
Lead → WhatsApp → Recepção → matrícula → aluno ativo
                                              ↓
          marcação semanal de aula → aula → prova → nota → renovação
```

**Os três gargalos que este sistema existe para resolver:**

1. O atendimento está espalhado: o aluno chama o vendedor, o financeiro ou a recepção
   em números diferentes, e ninguém enxerga a conversa inteira.
2. A marcação de aula vive numa planilha que só uma pessoa opera, e quem não agendou
   só aparece quando a semana já passou.
3. A prova é mandada e corrigida à mão, sem histórico ligado ao aluno.

Tudo o que for construído aqui deve atacar um dos três, ou não entra.

## 2. Vocabulário (usar exatamente estes termos no código e na UI)

| Termo | Significado |
|---|---|
| **Aluno** | Quem estuda. Tem contrato, nível, lição atual e responsável quando é menor. |
| **Responsável** | Quem responde pelo aluno Kids. Fala pelo WhatsApp no lugar dele. |
| **Trilha** | Adultos (Starter, A1, A2, B1, B2) ou Kids (Kids 1, 2, 3). |
| **Lição** | Posição do aluno dentro do nível, de 1 a 20. |
| **Marcação** | O ato de o aluno escolher o horário da aula da semana. |
| **Grade** | A semana inteira de horários com os alunos marcados. É a planilha de hoje. |
| **Reposição** | Aula extra para quem faltou. |
| **Prova** | Avaliação de fim de módulo. Tem envio, correção e nota. |
| **Setor** | Para onde a conversa vai: Recepção, Financeiro, Coordenação, Coordenação Kids. |
| **Coexistência** | O número roda no app do WhatsApp Business E na API oficial ao mesmo tempo. |

## 3. Regras de negócio que não podem ser quebradas

- **Toda conversa cai na Recepção.** A Recepção é o coração da escola e o atendimento
  padrão. Setor é roteamento, não hierarquia.
- **A IA nunca conduz venda nem fecha matrícula.** Ela faz triagem, resolve o
  financeiro repetitivo (2ª via, situação) e passa para gente. Quem vende é vendedor.
- **Natan cuida dos adultos, Karina cuida do Kids.** Conversa transferida para a
  coordenação avisa a pessoa no WhatsApp dela com link para responder pelo portal.
- **O aluno é a chave, não o telefone.** Um responsável pode falar por mais de um
  aluno, e um aluno pode trocar de telefone. Conversa aponta para aluno.
- **Nota de prova nunca é apagada.** Correção gera versão nova, com quem corrigiu e
  quando. O histórico do aluno é registro.
- **A grade da semana tem uma fonte só por vez.** Desde 21/11/2026 a fonte é a agenda do
  sistema (`agendamentos`); no dia da virada, o ELLO e a planilha deixam de ser usados
  para marcar aula. Não existe cópia paralela divergindo.
- **Todo valor monetário é inteiro em centavos.** Nunca `float`.
- **Mensagem para aluno fora da janela de 24 horas só sai por template aprovado.**

## 3.1 Decisões já tomadas (não reabrir sem motivo novo)

| Quando | Decisão |
|---|---|
| 17/11/2026 | ~~**O número é o da recepção que já existe, com coexistência.**~~ Substituída em 18/11, abaixo. A recepção segue atendendo pelo celular e o sistema enxerga tudo. Foi descartado número novo porque conta recém-criada não é elegível para coexistência, e porque número que entra direto na API nunca mais volta para o app. Detalhes e passo a passo em `docs/whatsapp-coexistencia.md`. |
| 17/11/2026 | **As provas são construídas aqui dentro**, exclusivas da unidade Chapecó. Não dependem do Nexus Hub nem de sistema de terceiro. |
| 17/11/2026 | ~~**A grade de aulas continua no Google Sheets** enquanto a planilha for a fonte.~~ Substituída em 21/11, abaixo. |
| 17/11/2026 | **Firebase e Vercel**, não Supabase. |
| 18/11/2026 | **WhatsApp só na Cloud API, sem coexistência, com o número novo +55 49 98896-5170.** Toda conversa passa pelo sistema, sem resposta por fora no celular, e o atendimento automático não disputa com o app do WhatsApp Business. O número 8897-1344 ("Nexus Comercial", ligado à plataforma da Firma Moderna) já estava na API sem coexistência. O código da conexão por coexistência ficou no branch `whatsapp-coexistencia`, fora do ar. O token vem de um usuário de sistema do portfólio da Nexus, nas variáveis da Vercel; o app é o Nexus 1. Passo a passo em `docs/whatsapp-cloud.md`. **Antes de divulgar o número:** aviso de mensagem nova no celular e envio de áudio, foto e documento pela tela de conversas. |
| 18/11/2026 | **A triagem por palavra abre a tarefa, nunca responde o contato.** (Quem responde é o atendimento automático, decisão abaixo.) Mensagem que chega com assunto claro abre um cartão no quadro do setor. Sinal fraco não abre nada, e só existe uma tarefa aberta por conversa. Quem responde e quem move continua sendo gente. |
| 18/11/2026 | **A foto do contato mora no próprio documento da conversa**, reduzida para 256px em JPEG. É leve o bastante para caber no limite de 1 MB e aparecer na lista sem segunda ida ao servidor. |
| 18/11/2026 | **A etiqueta de assunto é automática.** A triagem pendura o assunto na conversa toda vez que o sinal é forte (Cancelamento, Financeiro, Marcação, Matrícula, Prova, Reposição, Coordenação), e ela aparece colorida na linha da lista. Nunca tira etiqueta que gente pôs à mão. |
| 18/11/2026 | **O atendimento automático responde o contato** (decidido com a Nádia). Conversa nova recebe saudação com 3 botões (Minhas aulas, Financeiro/contrato, Outro assunto); aulas e outro assunto vão para a Recepção, financeiro e contrato para o assistente (botões ou IA). **A Coordenação nunca é botão:** só recebe por transferência de dentro do sistema, com aviso no celular pessoal por modelo aprovado. Quem some recebe follow-up aos 15 min e encerramento aos 30, **escritos pela IA lendo a conversa, no jeito de falar da escola**, nunca texto engessado; sem IA sai o texto de reserva. O relógio só corre quando a escola falou por último. Setor que não responde em 2 h devolve para a Recepção. Atendimento encerrado recomeça pela Recepção. Tudo editável em Configurações e **nasce desligado**. |
| 19/11/2026 | **Redesenho: cara de aplicativo, e a conversa com o jeito e as cores do WhatsApp** (pedido do cliente, com o app da Smiles como referência de estilo). Cantos bem redondos, cartões soltos sobre o fundo, botão e filtro em pílula, laranja forte onde se age; no celular, faixa laranja no alto da lista e barra de abas branca. Na conversa: bolha verde de quem envia e branca de quem chega, com a pontinha; papel de parede bege com **desenho próprio** de escola (nada copiado do WhatsApp, nem logo); visto azul; os botões da mensagem embaixo da bolha; emoji na caixa de escrever e botão redondo verde de enviar. Substitui o "não imita o WhatsApp" de 17/11: o time e os alunos já leem esse arranjo sem pensar. |
| 19/11/2026 | **Cada setor tem cor e ícone próprios, e o menu lateral é escolha de quem usa** (pedido do cliente: "não diz bem claro se está na Recepção ou na Coordenação" e "o menu ficou minimalista demais"). A etiqueta do setor tem cor cheia (Recepção laranja, Financeiro verde, Coordenação azul, Coordenação Kids roxo) e aparece na linha da lista, no topo da conversa e no painel; no celular a borda do cartão da conversa tem a cor do setor. O menu recolhido mostra ícone com nome curto embaixo, abre e recolhe por botão no próprio menu, e pode ser claro. |
| 19/11/2026 | **Logo própria em 3D e comemoração ao passar a conversa** (pedido do cliente: "uma coisa meio zoeira, mas rápida, que não atrapalhe a recepção"). A logo da Central de Atendimento é um balão laranja com o N em relevo, que brilha e tem um ponto verde "ao vivo" pulsando. Passar de setor mostra por menos de 2 s um cartão com o avatar de quem recebe ("Transferido para Natan!") e uma frase de zoeira; não pega clique e desliga em Configurações, Aparência. |
| 21/11/2026 | **Os modelos de mensagem nascem no sistema e vão sozinhos para a Meta** (pedido do cliente: "pode criar pra mim direto"). A biblioteca de 32 modelos (aulas, marcação, reposição, provas, financeiro, contrato, Kids para o responsável, chamar, urgente, retomar, aniversário, o aviso à coordenação e os dois lembretes da agenda) mora em `dominio/modelos.ts`; o relógio de hora em hora cria o que falta e anota a situação em `templates`. Apagado na Meta não volta sozinho. Texto aprovado não se edita: muda o nome. Na conversa só aparece o que a Meta aprovou, e o texto gravado vem do banco, não do navegador. |
| 21/11/2026 | **Foto, áudio, vídeo e documento nos dois sentidos, e aviso de mensagem nova** (o que faltava antes de divulgar o número). O que chega é baixado da Meta para o Storage, na pasta da conversa; o que sai sobe do navegador para o Storage e o servidor manda. Áudio gravado no Chrome (WebM) é reembalado em OGG no servidor, sem ffmpeg e sem recodificar. O aviso vai para quem é do setor da conversa e só quando ela está com gente: som e notificação com o sistema aberto, e push pelo Firebase Cloud Messaging com ele fechado (no iPhone, só instalado na tela de início). O push precisa da chave de Web Push do Firebase em `NEXT_PUBLIC_FIREBASE_VAPID_KEY`. Passo a passo: `docs/midia-e-avisos.md`. |
| 21/11/2026 | **A agenda de aulas mora no sistema** (pedido do cliente, com o ELLO como referência do que a escola usa hoje). Agendamento = uma aula num horário, um professor e vários alunos; status é da aula, presença, observação e notas são de cada aluno (subcoleção). Calendário com FullCalendar 7 (mês, semana, dia, 7h30 às 21h30), cor do professor no bloco, bolinha de status, selo do WhatsApp, alerta de presença. Bloqueio é tipo próprio, nunca aula falsa. Professor é a equipe (`perfis`, papel professor ou "dá aula"), não cadastro novo. Conflito avisa e só a administração passa por cima. Lembrete da véspera por modelo com Confirmar e Remarcar, resumo com IA no servidor, relatório com CSV e log de tudo. Professor só lança status e presença das aulas dele, também nas regras do Firestore. Passo a passo: `docs/agenda.md`. |
| 21/11/2026 | **A conversa e a agenda se falam** (pedido do cliente: "que fique um atalho no WhatsApp para já agendar um horário, para já confirmar, que fica tudo interligado"). O painel do contato mostra o aluno e as aulas dele, e um atalho na caixa de escrever confirma, remarca, agenda a próxima e avisa sem sair da conversa. O aviso nunca sai sozinho: vai para a caixa de escrever, ou abre o modelo aprovado preenchido com a janela fechada. Conversa nova se liga ao aluno pelo telefone dele ou do responsável, com ou sem o 9. No atendimento automático, **"Minhas aulas" passa a mostrar a próxima aula da agenda** com Confirmar presença, Remarcar e Falar com a recepção (refina a decisão de 18/11: sem aula marcada, ou no botão da recepção, segue para a Recepção); dia e hora vêm do banco, nunca da IA. Da agenda, cada aluno da aula abre a conversa dele, e "Ver na agenda" abre o calendário filtrado no aluno. Passo a passo: `docs/agenda.md`, seção Na conversa. |
| 21/11/2026 | **Os alunos vêm da planilha do Google que a escola já mantém** (pedido do cliente: "tem como puxar aquela planilha para dentro do sistema?"). A planilha continua sendo onde a escola mexe; o sistema lê com a conta de serviço do Firebase (a escola compartilha a planilha com ela como leitor e liga a API do Google Sheets), reconhece as colunas pelo nome com ajuste na tela, mostra o que vai mudar antes de importar e acompanha de hora em hora. As conversas sem aluno se ligam pelo telefone. Célula vazia não apaga nada e aluno que sumiu da planilha não é desativado sozinho. Tela Alunos (menu Escola) com ativos, inativos e CSV. Passo a passo: `docs/alunos-planilha.md`. |
| 21/11/2026 | **A mensagem da equipe sai assinada** (pedido do cliente): o nome de quem envia em negrito em cima do texto, no WhatsApp. Cada pessoa escolhe como o nome aparece (Configurações, Sua assinatura); a gestão liga e desliga (Atendimento) e nasce ligada. Vale para texto, legenda e mensagem programada; modelo aprovado sai sem assinatura. |
| 21/11/2026 | **Todo horário da agenda é clicável** (pedido do cliente). Clique ou toque no horário abre a aula nova, inclusive em cima de um bloqueio (a conferência de conflito avisa); o nome do bloqueio abre o bloqueio; no mês, o dia abre o dia. |
| 18/11/2026 | **O telefone do contato não se edita na tela.** Ele é a chave que casa a conversa com o que a Meta manda. Nome, foto e observação se editam; telefone novo é conversa nova. |

## 3.2 O que já está de pé no atendimento (18/11/2026)

- **Painel do contato**: foto, nome e observação do time editáveis, etiquetas, passar
  para qualquer setor (deixa recado na conversa), **tempo de aguardo** (vermelho depois
  de 30 minutos), tarefas ligadas à conversa e a fila de mensagens programadas.
- **Mensagem programada**: a equipe escreve agora e marca a hora. A fila é a coleção
  `agendadas`; quem envia é `/api/cron/agendadas`, chamada de dez em dez minutos pelo
  `vercel.json` com o `CRON_SECRET`. **A janela de 24 horas é conferida na hora de SAIR**,
  não na hora de programar: se ela fechou no caminho, a mensagem não vai calada, fica
  marcada com o motivo e o time decide se manda um modelo.
- **Triagem que abre tarefa**: `src/lib/dominio/triagem.ts` soma sinais por assunto
  (cancelamento pesa mais que matrícula, senão "cancelar minha matrícula" viraria lead
  novo) e `recebimento.ts` abre o cartão no quadro certo. Prova em `testes/triagem.ts`:
  `node --experimental-strip-types testes/triagem.ts`. **Rodar antes de mexer nos sinais.**
  `config/atendimento.abreTarefaNaTriagem = false` desliga sem deploy.
- **Os filtros da lista**: situação fica à vista numa fileira só (Todas, Não lidas,
  Retornos, Encerradas) e setor e assunto moram no funil ao lado da busca, para poderem
  ser combinados com qualquer situação. A lista de assuntos do funil se monta do que
  existe nas conversas, não de uma lista fixa. O cabeçalho mostra quantas conversas o
  filtro deixou, que é a leitura do resultado.
- **O relógio da tela** é `useAgora()` (`src/componentes/relogio.ts`), fonte externa que
  anda a cada meio minuto. Ler a hora no corpo do componente não é permitido pelas regras
  novas do React, e no servidor ela é outra: antes da hidratação devolve zero, e quem usa
  trata como "ainda não sei a hora" em vez de mostrar 1970.
- **Atendimento automático**: as regras são puras em `src/lib/dominio/automatico.ts`
  (configuração, roteamento, relógio, textos para a IA) e provadas em
  `node --experimental-strip-types testes/automatico.ts`. **Rodar antes de mexer nas
  regras.** Quem fala com banco, Meta e IA é `src/lib/whatsapp/automatico.ts`; a IA mora
  em `src/lib/ia/claude.ts` (saída estruturada, esforço baixo, texto de reserva quando
  falha). A configuração é `config/automatico`, editada na seção de Configurações com
  área de teste que não envia nada. Histórico importado do celular nunca dispara nada.
  Passo a passo para ligar: `docs/atendimento-automatico.md`.

- **Modelos de mensagem** (21/11/2026): a biblioteca é `src/lib/dominio/modelos.ts`,
  provada em `node --experimental-strip-types testes/modelos.ts` (**rodar antes de mexer
  em qualquer texto**: a prova confere as regras da Meta). Quem fala com a Meta é
  `src/lib/whatsapp/modelos.ts`, chamado por `/api/cron/modelos` de hora em hora e pelo
  botão "Conferir com a Meta" (`/api/whatsapp/modelos`). Na conversa, o botão de modelo
  fica ao lado do relógio e vira o principal quando a janela fecha. Passo a passo e os
  textos: `docs/modelos-de-mensagem.md`.

- **Mídia e avisos** (21/11/2026): regras em `src/lib/dominio/midia.ts` e
  `src/lib/dominio/ogg.ts`, provadas em `node --experimental-strip-types testes/midia.ts`
  (com uma gravação real do Chrome em `testes/amostras/`); a tela em
  `componentes/midia.tsx`. Quem recebe aviso e quando: `src/lib/dominio/avisos.ts`,
  provado em `testes/avisos.ts`; push em `src/lib/avisos.ts`, aparelhos em
  `dispositivos` (só o servidor grava, por `/api/avisos`), notificação em
  `public/aviso-sw.js`. O sistema é instalável (`app/manifest.ts`). Passo a passo:
  `docs/midia-e-avisos.md`.

- **Agenda** (21/11/2026): regras puras em `src/lib/dominio/agenda.ts`, provadas em
  `node --experimental-strip-types testes/agenda.ts` (**rodar antes de mexer em conflito,
  recorrência ou permissão**); semente fictícia em `dominio/agenda-exemplo.ts` (a mesma
  da demonstração e do botão de dados de teste); gravação em lote com log em
  `src/lib/dados/agenda.ts`; telas em `componentes/agenda/`; servidor (lembrete,
  resposta aos botões, resumo) em `src/lib/agenda-servidor.ts`. A resposta Confirmar ou
  Remarcar do lembrete é tratada em `recebimento.ts` antes da triagem e do atendimento
  automático. Passo a passo e a virada: `docs/agenda.md`.

- **Alunos da planilha** (21/11/2026): regras puras em `dominio/planilha.ts`, provadas em
  `node --experimental-strip-types testes/planilha.ts` (**rodar antes de mexer nas colunas,
  no telefone ou na situação**); leitura do Google em `src/lib/planilha.ts` (conta de
  serviço do Firebase, sem chave nova), rota `/api/alunos/planilha`, relógio
  `/api/cron/planilha`, tela `/alunos`. Passo a passo: `docs/alunos-planilha.md`.

- **Assinatura** (21/11/2026): regras em `dominio/assinatura.ts` (prova em
  `testes/assinatura.ts`), servidor em `whatsapp/assinatura.ts`, usada pela rota de envio
  e pela fila de programadas. O texto gravado na conversa fica sem a assinatura; o nome
  usado vai em `mensagens.assinadaComo`.

- **A agenda na conversa** (21/11/2026): `componentes/aulas-na-conversa.tsx` (painel do
  contato e atalho da caixa de escrever), com as regras puras em `dominio/agenda.ts`
  (próximas e últimas aulas, texto do aviso, modelo com a janela fechada, resposta do
  "Minhas aulas", sugestão da próxima aula) e por quem o número fala em
  `dominio/contato.ts`, provado em `node --experimental-strip-types testes/contato.ts`.
  O servidor acha a próxima aula de quem escreve em `agenda-servidor.ts`
  (`aulasDoContato`), e o destino `aulas` do menu mora em `whatsapp/automatico.ts`.

- **Saúde do sistema** (19/11/2026, depois de um dia com o servidor sem gravar e
  ninguém sabendo): o servidor anota em `config/saude` a última vez que cada parte
  andou (chamada da Meta, mensagem de contato, envio aceito, relógio, fila) e a última
  falha de cada uma (`src/lib/saude.ts`: `bate` e `falhou`). As regras do aviso são
  puras em `src/lib/dominio/saude.ts`, provadas em
  `node --experimental-strip-types testes/saude.ts`. A gestão vê uma faixa vermelha no
  topo de todas as telas quando algo grave parou, e a seção Saúde do sistema nas
  Configurações. A Meta calada se percebe pelo envio: todo envio aceito volta como
  "enviado" pelo webhook em segundos. A falha do próprio banco não se anota nele: a
  tela pergunta à rota pública `/api/saude`, que responde só uma palavra. Recusa do dia
  a dia (janela fechada, número sem WhatsApp) não vira alarme. **Toda rota nova que
  fala com a Meta, a IA ou o banco anota a falha com `falhou`, nunca só `console.error`.**

## 4. Arquitetura

```
Next.js (App Router) ──► Vercel
        │
        ├── Firebase Auth            (login da equipe, papéis por custom claim)
        ├── Cloud Firestore          (dados + tempo real no inbox e nos quadros)
        ├── Firebase Storage         (anexos, áudios, PDFs de prova)
        └── Rotas de API no Vercel   (tudo que usa segredo)
              ├── /api/whatsapp/webhook     recebe da Cloud API
              ├── /api/whatsapp/enviar      manda pela Cloud API
              ├── /api/whatsapp/conexao     confere e configura a conexão
              ├── /api/whatsapp/modelos     confere os modelos com a Meta e cria o que falta
              ├── /api/conversas/*          encerrar e passar de setor (com aviso)
              ├── /api/avisos               liga o push do aparelho e manda aviso de teste
              ├── /api/automatico/testar    a IA escreve sem enviar, para testar
              ├── /api/saude                o servidor alcança o banco? (público, uma palavra)
              ├── /api/agenda/*             lembrete, resumo com IA e dados de teste da agenda
              ├── /api/alunos/planilha      lê a planilha de alunos do Google, confere e importa
              ├── /api/provas/*             envio e correção
              └── /api/cron/*               programadas, relógio do atendimento, modelos, lembretes da agenda, planilha
```

**Tempo real:** as telas que mudam sozinhas (inbox, quadros, grade) usam `onSnapshot`
do Firestore direto do navegador, com as regras de segurança valendo. O servidor só
entra onde há segredo ou integração.

## 5. Papéis e acesso

| Papel | Vê |
|---|---|
| `admin` | tudo, inclusive configurações e equipe |
| `gestor` | tudo da operação |
| `recepcao` | todas as conversas, grade, provas, quadros |
| `coordenacao` | conversas do setor dele, provas e alunos da trilha dele |
| `professor` | a agenda inteira (lança status e presença só das aulas dele) e as provas que corrige |

O papel vive no **custom claim** do Firebase Auth e também em `perfis/{uid}`, porque as
regras do Firestore leem o claim e a interface lê o perfil. Quem está `ativo: false`
não passa nas regras. Ninguém muda o próprio papel pela interface.

## 6. Design

**O sistema visual é o mesmo da Luz por Assinatura, com a paleta da Nexus** (decidido
em 17/11/2026). A fonte da verdade são os tokens no topo de `src/app/globals.css`; a
referência de origem é `docs/design-tokens.css` e `docs/modelo-visual.html` daquele
projeto. `docs/demonstracao.html` guarda a demonstração que validou o ARRANJO das
telas com o cliente, não as cores: aquelas foram substituídas.

- **Paleta: preto, laranja, branco e cinza.** O escuro (`--ink` `#141414`) é do rail.
  O laranja (`--solar` `#F6821F`) é a marca E o único acento forte: nada mais compete
  com ele. O resto é branco, cinza e as escalas de texto.
- **A única cor fora da paleta é o vermelho** (`--alert`), e só para prazo estourado e
  mensagem que não entregou. Não dá para dizer "deu errado" com cinza. **Dentro da
  conversa** valem as cores do WhatsApp (tokens `--balao-*`, `--wa-*`, `--visto`):
  verde da bolha e do enviar, bege do fundo, azul do visto. Fora da conversa, não.
  **Setor tem cor própria** (`.st-recepcao`, `.st-financeiro`, `.st-coordenacao`,
  `.st-kids`): etiqueta de cor cheia com ícone (`SetorTag` em `componentes/setor.tsx`),
  de propósito diferente da etiqueta de assunto, que é clarinha. Setor diz quem
  atende; assunto diz do que se trata.
- **Forma de aplicativo** (19/11/2026): cartão com canto de 18px e sombra leve em vez
  de borda, campo com 12px, botão, filtro e etiqueta em pílula, título de tela grande
  em Bricolage 800. No computador o inbox são três cartões soltos sobre o fundo; no
  celular o alto da lista é a faixa laranja (`--solar-hero`, escura o bastante para o
  branco ler em cima) e a barra de abas é branca, com a aba atual em laranja.
- **Marca** (19/11/2026): logo própria em 3D (`componentes/logo.tsx`): balão laranja com
  o N em relevo, borda de espessura, brilho de vidro, uma faixa de luz a cada 6 s e o
  ponto verde "ao vivo" pulsando, que é a outra exceção à paleta. A mesma logo parada é
  o ícone da aba (`app/icon.svg`). Aparece no menu, na entrada e na tela vazia da
  conversa, onde flutua. Profundidade com moderação: brilho de cima e sombra colorida
  no botão principal, na aba atual, no enviar e na etiqueta de setor.
- **Comemoração ao passar a conversa** (`componentes/festa.tsx`): cartão que salta em
  3D com o avatar de quem recebe, aviãozinho e confete, por menos de 2 s, sem pegar
  clique (`pointer-events:none`). As frases e quem recebe ficam em `dominio/festa.ts`,
  provadas em `node --experimental-strip-types testes/festa.ts`. Pessoa vai pelo nome
  sem artigo ("para Natan"), setor com artigo ("para o Financeiro"). Desliga por
  aparelho em Configurações, Aparência; quem pede menos movimento vê o cartão parado.
- **Rail escuro com os nomes das seções** à esquerda, agrupadas (Atendimento, Escola,
  Gestão), e a interface clara ao lado. **Até 1440px o rail recolhe sozinho**, com o
  ícone e o nome curto embaixo, porque a escola trabalha com a tela dividida (decidido
  em 18/11/2026). **Quem usa escolhe** (19/11/2026): botão "Recolher menu" / "Abrir
  menu" no próprio rail, e em Configurações, Aparência, automático, aberto ou
  recolhido, e escuro ou claro. A escolha fica no aparelho (`preferencias.ts`) e vira
  classe na casca (`menu-aberto`, `menu-recolhido`, `menu-claro`). O painel do contato se recolhe pelo "x" e volta pelo botão de dados no
  topo da conversa, e a escolha fica guardada no aparelho (`painel-recolhido.ts`);
  abaixo de 1180px ele vira gaveta; no celular o rail sai e entra a barra de abas
  embaixo. Classe de layout do inbox (`c-open`, `p-open`) sai do estado do React,
  nunca de `classList` na mão: o React reescreve o `className` e apaga.
- **Tipografia:** Bricolage Grotesque nos títulos e números grandes, com moderação;
  Instrument Sans no corpo; JetBrains Mono em todo dado numérico, sempre com
  `tabular-nums` (a classe `.num`). A exceção é a hora na bolha e na linha da lista,
  em Instrument Sans com `tabular-nums`, como no WhatsApp. As três entram por `<link>` no documento, como no
  modelo da LPA, porque `next/font` busca a fonte no build e a rede daqui não alcança
  o Google. A pilha de reserva vive dentro do próprio token, então
  `font-family:var(--fonte-display)` sozinho já basta.
- **Agenda** (21/11/2026): o bloco tem a cor do professor (escolhida em Agenda,
  Cadastros) e a bolinha de status nas cores que o cliente pediu (azul agendado, verde
  confirmado, preto realizado, cinza cancelado, roxo remarcado); bloqueio é faixa cinza
  listrada. No gráfico de notas, as quatro habilidades usam os quatro primeiros tons da
  paleta de visualização, conferidos para daltonismo nos dois temas. São exceções à
  paleta só dentro da agenda e do relatório, como as cores do WhatsApp na conversa.
- **Tema claro, escuro ou automático.** O automático segue o aparelho; a escolha feita
  em Configurações vale por cima, pela classe `t-escuro` ou `t-claro` no `body`.
- Interface clara por padrão, porque o time usa isso oito horas por dia.
- A tela de atendimento tem o arranjo e o visual do WhatsApp (lista, conversa com
  bolhas verdes e brancas sobre o fundo bege, dados do contato) porque o time e os
  alunos já sabem ler isso. O papel de parede é desenho nosso (`--wall-desenho`), e o
  emoji é uma grade fixa dos de toda hora, sem biblioteca (no celular o botão sai: o
  teclado já tem). Botão que ainda não faz nada não entra antes de funcionar; o clipe e
  o microfone entraram em 21/11/2026, quando passaram a mandar de verdade.

### Escrita da interface
Português brasileiro, tom direto, frase em caixa baixa. O botão diz o que acontece:
"Enviar prova", não "Confirmar". A ação mantém o mesmo nome do começo ao fim do fluxo.
Erro explica o que houve e como resolver. Tela vazia é convite para agir.
Não usar travessão.

## 7. Convenções de código

- TypeScript estrito. Nada de `any`.
- Nomes de coleção e campo em **português**, no singular do conceito (`alunos`,
  `conversas`, `mensagens`, `cartoes`, `provas`, `marcacoes`).
- Server Components por padrão; `'use client'` só onde há interação real.
- Lógica de negócio em `src/lib`, nunca dentro de componente.
- Toda escrita que precisa de segredo passa por rota de API com o Admin SDK. A chave
  de serviço nunca chega ao navegador.
- Regras do Firestore são a trava de verdade; esconder o item do menu não é acesso
  negado.

## 8. Ordem de construção

1. **Casca, login e papéis** ← comece aqui
2. Conversas (inbox) + motor de triagem
3. WhatsApp oficial com coexistência
4. Quadros
5. Provas
6. Agenda de aulas no sistema (no lugar da planilha, desde 21/11/2026)
7. Relatórios e configurações

## 9. Segredos

Nunca commitar chave. Tudo em `.env.local` (ver `.env.example`) e nas variáveis da
Vercel. `FIREBASE_SERVICE_ACCOUNT`, `WHATSAPP_TOKEN`, `GOOGLE_SERVICE_ACCOUNT` e
`ANTHROPIC_API_KEY` só existem no servidor. A planilha de alunos usa a conta do
`FIREBASE_SERVICE_ACCOUNT`; `GOOGLE_SERVICE_ACCOUNT` é opcional.
