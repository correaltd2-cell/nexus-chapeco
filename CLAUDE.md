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
- **A grade da semana tem uma fonte só por vez.** Enquanto a planilha do Google for a
  fonte, o sistema lê e escreve nela; não existe cópia paralela divergindo.
- **Todo valor monetário é inteiro em centavos.** Nunca `float`.
- **Mensagem para aluno fora da janela de 24 horas só sai por template aprovado.**

## 3.1 Decisões já tomadas (não reabrir sem motivo novo)

| Quando | Decisão |
|---|---|
| 17/11/2026 | ~~**O número é o da recepção que já existe, com coexistência.**~~ Substituída em 18/11, abaixo. A recepção segue atendendo pelo celular e o sistema enxerga tudo. Foi descartado número novo porque conta recém-criada não é elegível para coexistência, e porque número que entra direto na API nunca mais volta para o app. Detalhes e passo a passo em `docs/whatsapp-coexistencia.md`. |
| 17/11/2026 | **As provas são construídas aqui dentro**, exclusivas da unidade Chapecó. Não dependem do Nexus Hub nem de sistema de terceiro. |
| 17/11/2026 | **A grade de aulas continua no Google Sheets** enquanto a planilha for a fonte. O sistema lê e escreve nela; não existe cópia paralela. |
| 17/11/2026 | **Firebase e Vercel**, não Supabase. |
| 18/11/2026 | **WhatsApp só na Cloud API, sem coexistência, com o número novo +55 49 98896-5170.** Toda conversa passa pelo sistema, sem resposta por fora no celular, e o atendimento automático não disputa com o app do WhatsApp Business. O número 8897-1344 ("Nexus Comercial", ligado à plataforma da Firma Moderna) já estava na API sem coexistência. O código da conexão por coexistência ficou no branch `whatsapp-coexistencia`, fora do ar. O token vem de um usuário de sistema do portfólio da Nexus, nas variáveis da Vercel; o app é o Nexus 1. Passo a passo em `docs/whatsapp-cloud.md`. **Antes de divulgar o número:** aviso de mensagem nova no celular e envio de áudio, foto e documento pela tela de conversas. |
| 18/11/2026 | **A triagem por palavra abre a tarefa, nunca responde o contato.** (Quem responde é o atendimento automático, decisão abaixo.) Mensagem que chega com assunto claro abre um cartão no quadro do setor. Sinal fraco não abre nada, e só existe uma tarefa aberta por conversa. Quem responde e quem move continua sendo gente. |
| 18/11/2026 | **A foto do contato mora no próprio documento da conversa**, reduzida para 256px em JPEG. É leve o bastante para caber no limite de 1 MB e aparecer na lista sem segunda ida ao servidor. |
| 18/11/2026 | **A etiqueta de assunto é automática.** A triagem pendura o assunto na conversa toda vez que o sinal é forte (Cancelamento, Financeiro, Marcação, Matrícula, Prova, Reposição, Coordenação), e ela aparece colorida na linha da lista. Nunca tira etiqueta que gente pôs à mão. |
| 18/11/2026 | **O atendimento automático responde o contato** (decidido com a Nádia). Conversa nova recebe saudação com 3 botões (Minhas aulas, Financeiro/contrato, Outro assunto); aulas e outro assunto vão para a Recepção, financeiro e contrato para o assistente (botões ou IA). **A Coordenação nunca é botão:** só recebe por transferência de dentro do sistema, com aviso no celular pessoal por modelo aprovado. Quem some recebe follow-up aos 15 min e encerramento aos 30, **escritos pela IA lendo a conversa, no jeito de falar da escola**, nunca texto engessado; sem IA sai o texto de reserva. O relógio só corre quando a escola falou por último. Setor que não responde em 2 h devolve para a Recepção. Atendimento encerrado recomeça pela Recepção. Tudo editável em Configurações e **nasce desligado**. |
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
              ├── /api/conversas/*          encerrar e passar de setor (com aviso)
              ├── /api/automatico/testar    a IA escreve sem enviar, para testar
              ├── /api/saude                o servidor alcança o banco? (público, uma palavra)
              ├── /api/sheets/*             lê e escreve a grade no Google Sheets
              ├── /api/provas/*             envio e correção
              └── /api/cron/*               programadas, relógio do atendimento, réguas
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
| `professor` | a grade das aulas dele e as provas que corrige |

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
  mensagem que não entregou. Não dá para dizer "deu errado" com cinza.
- **Rail escuro com os nomes das seções** à esquerda, agrupadas (Atendimento, Escola,
  Gestão), e a interface clara ao lado. **Até 1440px o rail vira só ícones** (nome ao
  passar o mouse), porque a escola trabalha com a tela dividida (decidido em
  18/11/2026). O painel do contato se recolhe pelo "x" e volta pelo botão de dados no
  topo da conversa, e a escolha fica guardada no aparelho (`painel-recolhido.ts`);
  abaixo de 1180px ele vira gaveta; no celular o rail sai e entra a barra de abas
  embaixo. Classe de layout do inbox (`c-open`, `p-open`) sai do estado do React,
  nunca de `classList` na mão: o React reescreve o `className` e apaga.
- **Tipografia:** Bricolage Grotesque nos títulos e números grandes, com moderação;
  Instrument Sans no corpo; JetBrains Mono em todo dado numérico, sempre com
  `tabular-nums` (a classe `.num`). As três entram por `<link>` no documento, como no
  modelo da LPA, porque `next/font` busca a fonte no build e a rede daqui não alcança
  o Google. A pilha de reserva vive dentro do próprio token, então
  `font-family:var(--fonte-display)` sozinho já basta.
- **Tema claro, escuro ou automático.** O automático segue o aparelho; a escolha feita
  em Configurações vale por cima, pela classe `t-escuro` ou `t-claro` no `body`.
- Interface clara por padrão, porque o time usa isso oito horas por dia.
- A tela de atendimento tem o arranjo de um aplicativo de mensagens (lista, conversa,
  dados do contato) porque o time já sabe usar isso. O que ela **não** faz é imitar o
  WhatsApp: nada de bolha verde nem papel de parede bege.

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
6. Grade e marcação de aulas pelo Google Sheets
7. Relatórios e configurações

## 9. Segredos

Nunca commitar chave. Tudo em `.env.local` (ver `.env.example`) e nas variáveis da
Vercel. `FIREBASE_SERVICE_ACCOUNT`, `WHATSAPP_TOKEN`, `GOOGLE_SERVICE_ACCOUNT` e
`ANTHROPIC_API_KEY` só existem no servidor.
