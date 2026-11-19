# WhatsApp na Cloud API (sem coexistência)

Decidido em 18/11/2026: o número **+55 49 98896-5170** entra direto na Cloud API, sem
o app do WhatsApp Business no celular. Toda conversa passa pelo sistema. O app da Meta
é o **Nexus 1**, do portfólio da Nexus.

## Antes de começar

- O número **não pode ter WhatsApp ativo** (nem o comum, nem o Business). Se tiver,
  apague a conta no aplicativo (Configurações, Conta, Apagar conta) antes de adicionar.
- O chip precisa receber SMS ou ligação para o código de confirmação.
- Escolha um **PIN de 6 dígitos** (verificação em duas etapas). Guarde: ele é pedido de
  novo se o número for registrado outra vez.

## Na Meta

1. **Gerenciador do WhatsApp**, portfólio da Nexus: na conta do WhatsApp da Nexus,
   Números de telefone, Adicionar número. Nome de exibição (passa por aprovação da
   Meta), categoria Educação, confirmação por SMS. Anote o **ID do número** e o **ID da
   conta do WhatsApp**.
2. **Forma de pagamento** na conta do WhatsApp. Sem ela os modelos não saem (erro 131042).
3. **Usuário do sistema** (Configurações do negócio, Usuários do sistema): papel Admin,
   com o app Nexus 1 e a conta do WhatsApp atribuídos em controle total. Gerar token
   para o app Nexus 1, expiração **Nunca**, permissões `whatsapp_business_messaging` e
   `whatsapp_business_management`. O token aparece uma vez.
4. **App Nexus 1, WhatsApp, Configuração, Webhook**: URL
   `https://nexus-chapeco.vercel.app/api/whatsapp/webhook`, token de verificação igual
   ao `WHATSAPP_VERIFY_TOKEN`, campos `messages` e `account_update`. A Meta testa o
   endereço na hora: as variáveis da Vercel precisam estar publicadas antes.
5. **Registrar o número na Cloud API** (Graph API Explorer, app Nexus 1, com o token do
   usuário do sistema): `POST /<ID do número>/register` com
   `{"messaging_product":"whatsapp","pin":"<os 6 dígitos>"}`. Responde `success: true`.

## Na Vercel (Production)

| Variável | Valor |
|---|---|
| `WHATSAPP_TOKEN` | token do usuário do sistema (Sensitive) |
| `WHATSAPP_PHONE_NUMBER_ID` | ID do número |
| `WHATSAPP_BUSINESS_ACCOUNT_ID` | ID da conta do WhatsApp |
| `WHATSAPP_VERIFY_TOKEN` | senha longa inventada por vocês (Sensitive) |
| `META_APP_SECRET` | chave secreta do app Nexus 1 (Sensitive) |

Publique de novo depois de salvar.

## No sistema

Configurações, **WhatsApp oficial**, Conferir agora:
- as cinco chaves no ambiente;
- o número com hospedagem `CLOUD_API`;
- se aparecer que nenhum aplicativo recebe as mensagens, toque em **Assinar agora**;
- **Mandar um teste** (modelo `hello_world`) para um celular da equipe.

Depois, mande "oi" de outro celular para o número: tem que aparecer em Conversas.

## Antes de divulgar o número para os alunos

- Aviso de mensagem nova no celular de quem atende (hoje o sistema não avisa).
- Mandar áudio, foto e documento pela tela de conversas (hoje só texto).
