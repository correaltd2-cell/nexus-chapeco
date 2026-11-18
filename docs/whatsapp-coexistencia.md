# WhatsApp oficial com coexistência

Pesquisado em 17/11/2026, nas referências de implementação da Cloud API e na
documentação de parceiros da Meta (360dialog). **Confirme na própria Meta antes de
executar**, porque esta parte muda de regra com frequência.

## O que é coexistência

O mesmo número roda **no app do WhatsApp Business (celular) e na API oficial ao mesmo
tempo**. A recepção continua respondendo pelo celular quando quiser, e tudo aparece no
sistema. Sem coexistência, plugar a API **tira** o número do app comum.

## 🔴 O ponto que muda o seu plano

Você escolheu "número novo, só pro sistema" **com** coexistência. Esses dois não
combinam de imediato:

> "Businesses with newly created WhatsApp Business app accounts are not immediately
> eligible for API access." A elegibilidade depende de tempo de conta e de qualidade
> de mensagens, e as referências de implementação falam em **pelo menos 7 dias de uso
> real** no app do WhatsApp Business.

Ou seja: chip novo não conecta no mesmo dia. São dois caminhos:

| Caminho | Como é | Quando faz sentido |
|---|---|---|
| **A. Número novo direto na API** | Nasce na Cloud API, sem app no celular. Todo o atendimento acontece no sistema. Liga hoje. | Se a recepção vai atender **pelo sistema** de qualquer jeito. É o caminho mais rápido e sem pegadinha. |
| **B. Número novo com coexistência** | Chip novo → instala o WhatsApp Business no celular → usa de verdade por ~7 dias → só então conecta. | Se a recepção precisa do celular na mão (atender andando pela escola, mandar áudio rápido). |

**A diferença prática para a Nexus:** no caminho A, quem não está no computador não
atende. No B, a recepção responde pelo celular e o sistema enxerga tudo.

Dá para começar pelo A e migrar para o B depois? **Não no mesmo número.** Um número que
já está na API não volta para o app para fazer coexistência. Então a escolha é agora.

## Requisitos da coexistência

- App do WhatsApp Business **2.24.17 ou mais novo** no celular.
- Número **em uso no app**, com conta não recém-criada (ver acima).
- O número **não pode** já estar na API oficial.
- Quem conecta precisa ser **Tech Provider ou Solution Partner** com webhook
  configurado. A Firma Moderna já é Tech Provider pela plataforma dos outros clientes.
- Conexão pelo **Embedded Signup**, não pelo registro normal de número:
  `extras.featureType = whatsapp_business_app_onboarding`, `response_type = code`,
  `override_default_response_type = true`, `extras.sessionInfoVersion = "3"`.
- Dados da empresa preenchidos no portfólio (razão social, endereço, site, telefone).
- Confirmar no fim: `is_on_biz_app = true` e `platform_type = CLOUD_API`.

## O que o sistema recebe

Campos do webhook que precisam estar assinados (`src/app/api/whatsapp/webhook/route.ts`
já trata todos):

| Campo | Para quê |
|---|---|
| `messages` | mensagem do contato, e entregue/lido/falhou das nossas |
| `smb_message_echoes` | **o que a recepção mandou pelo celular** |
| `smb_app_state_sync` | a agenda de contatos do celular |
| `history` | até 180 dias de conversa antiga |
| `account_update` | provedor removido, conta desconectada |

**Cuidados com o histórico:** vem em lotes grandes, poucos minutos depois de conectar.
Se o webhook der timeout ou erro, **o pedaço se perde** e só volta refazendo a conexão.
A sincronização de contatos e histórico é **uma vez por conexão**, e precisa acontecer
dentro de 24 horas. Mídia só dos últimos 14 dias.

## O que se perde com coexistência

- **Sem selo de conta oficial** (Official Business Account). A alternativa é o Meta
  Verified, que é pago e é outra coisa.
- **Throughput menor**: 20 mensagens por segundo, contra 80 do normal. Para o tamanho
  da Nexus, não pesa.
- **Dispositivos conectados são desligados** na conexão. WhatsApp para Windows e
  WearOS não funcionam. Quem atende no computador passa a usar o sistema.
- **Listas de transmissão** são desativadas e as antigas ficam só de leitura. Disparo
  passa a ser por template aprovado, pelo sistema.
- Sem mensagens temporárias, visualização única e localização ao vivo.
- O app precisa ser aberto no celular **a cada 13 dias**, senão a conexão cai.
- Mensagem mandada pelo celular é de graça; mandada pela API é cobrada normalmente.

## Como conectar (o botão já existe no sistema)

A conexão é pelo **app Nexus 1**, que é Tech Provider: o webhook dele aponta direto para
o sistema, e a conta fica com a Nexus. (O app da Firma Moderna também funcionaria, mas
aí a Nexus dependeria do app que atende os outros clientes da agência.)

O número que a plataforma da Firma Moderna tem como "Nexus Comercial - Chapecó"
(+55 49 8897-1344) está na API **sem** coexistência: a Meta recusou a sincronização em
21/09/2026 dizendo que ele não é um número do app do WhatsApp Business. Se esse for o
número da recepção, ele não serve para coexistência enquanto estiver na API.

### 1. No app Nexus 1 (developers.facebook.com, Meus apps)

- **Configurações do app > Básico**: em Domínios do app, `nexus-chapeco.vercel.app`.
  Anote o **ID do app** e a **Chave secreta do app**.
- **WhatsApp > Configuração > Webhook**: URL de callback
  `https://nexus-chapeco.vercel.app/api/whatsapp/webhook`, token de verificação igual ao
  `WHATSAPP_VERIFY_TOKEN`. Assine os campos `messages`, `smb_message_echoes`,
  `smb_app_state_sync`, `history` e `account_update`.
- **Login do Facebook para Empresas > Configurações**: Login com o SDK do JavaScript
  ligado; em Domínios permitidos para o SDK do JavaScript,
  `https://nexus-chapeco.vercel.app`; em URIs de redirecionamento do OAuth válidos,
  `https://nexus-chapeco.vercel.app/`.
- **Login do Facebook para Empresas > Configurações > Criar configuração**: do tipo
  Cadastro incorporado do WhatsApp (Embedded Signup), com as permissões
  `whatsapp_business_management` e `whatsapp_business_messaging`. Anote o **ID da
  configuração**.

### 2. Na Vercel (Settings, Environment Variables, Production)

| Variável | Valor |
|---|---|
| `META_APP_ID` | ID do app Nexus 1 |
| `WHATSAPP_CONFIG_ID` | ID da configuração do Embedded Signup |
| `META_APP_SECRET` | chave secreta do app (marque como Sensitive) |
| `WHATSAPP_VERIFY_TOKEN` | uma senha longa inventada por vocês, a mesma do webhook (Sensitive) |

`WHATSAPP_TOKEN` e `WHATSAPP_PHONE_NUMBER_ID` **não** entram: o token vem da conexão e
fica em `segredos/whatsapp`, que só o servidor lê. Publique de novo depois de salvar.

### 3. No celular da recepção

WhatsApp Business atualizado (2.24.17 ou mais novo), com o número em uso, por perto. Em
Ferramentas comerciais, desligue a Mensagem de saudação e a de ausência (senão o aluno
recebe duas, quando o atendimento automático estiver ligado).

### 4. No sistema

Configurações > **WhatsApp da recepção, com coexistência** > Ver a conexão >
**Conectar o WhatsApp da recepção**. Na janela da Meta:

1. entre com o Facebook de quem administra o portfólio da Nexus;
2. escolha **conectar o app do WhatsApp Business que já existe**;
3. informe o número e confirme pelo código que aparece no celular;
4. aceite compartilhar o histórico de conversas.

Ao fechar, o sistema mostra cada passo: token, número (precisa dizer "no celular e no
sistema"), webhook da conta, agenda e histórico. Agenda e histórico chegam em alguns
minutos; o histórico entra com as conversas antigas **encerradas** e não abre tarefa nem
soma não lida. Se a agenda ou o histórico não vierem, o botão de pedir de novo aparece
até 24 horas depois de conectar. Depois disso, só reconectando.

### 5. Conferir

- Em **WhatsApp oficial > Conferir agora**: o número tem que dizer "também no app do
  celular (coexistência)".
- Mande "oi" de outro celular: tem que aparecer em Conversas.
- Responda **pelo celular da recepção**: a resposta tem que aparecer na conversa como
  "Recepção (celular)".
- Ponha uma **forma de pagamento** na conta do WhatsApp no Gerenciador, senão os modelos
  não saem (erro 131042).

## Templates que a escola vai precisar

| Nome | Categoria | Para quê |
|---|---|---|
| `marcacao_semana` | Utility | segunda de manhã, pedindo a marcação da aula |
| `cobranca_marcacao` | Utility | sexta, para quem não agendou |
| `confirmacao_aula` | Utility | véspera, confirmando dia e hora |
| `lembrete_prova` | Utility | prova liberada, com prazo |
| `resultado_prova` | Utility | nota lançada |
| `retomar_conversa` | Utility | reabrir conversa fora das 24 horas |
| `convite_renovacao` | Marketing | contrato chegando ao fim |
