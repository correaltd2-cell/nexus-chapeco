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

## Passo a passo quando a decisão estiver tomada

1. **Portfólio de Negócios da Nexus** no Gerenciador da Meta, com razão social, CNPJ e
   endereço preenchidos em Informações da empresa.
2. **Forma de pagamento na conta do WhatsApp.** Sem cartão, templates e disparos não
   saem (erro 131042). Aprendizado caro do projeto Luz por Assinatura.
3. **Aplicativo no Meta** (tipo Business) com o produto WhatsApp adicionado.
4. **Usuário de sistema** com controle total da conta do WhatsApp, e token que não
   expira.
5. **Webhook**: `https://<dominio>/api/whatsapp/webhook`, com o verify token do
   `.env`, assinando `messages`, `smb_message_echoes`, `smb_app_state_sync`,
   `history` e `account_update`.
6. **Embedded Signup** com os parâmetros de coexistência acima, ou o caminho normal se
   for o caminho A.
7. **Templates**: submeter por categoria certa. Utility para confirmação de aula,
   lembrete de prova e aviso de nota. Marketing para convite de renovação e campanha.
   Authentication só para código de acesso, se um dia existir.
8. **Teste**: mandar `hello_world`, depois uma mensagem de verdade, e conferir que o
   eco do celular chega no sistema.

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
