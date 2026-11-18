# Colocar o sistema no ar

Ordem exata. Cada passo depende do anterior.

## 1. Projeto no Firebase

1. https://console.firebase.google.com → **Adicionar projeto** → nome `nexus-chapeco`.
   Pode desligar o Google Analytics.
2. **Build → Authentication → Começar → E-mail/senha → Ativar.** Só isso; não precisa
   de provedor social, porque quem cria login é a escola.
3. **Build → Firestore Database → Criar banco de dados → Modo de produção →**
   região `southamerica-east1` (São Paulo, mais perto de Chapecó).
4. **Build → Storage → Começar**, mesma região.
5. **Configurações do projeto (engrenagem) → Seus apps → Web (`</>`)**, apelido
   `nexus-chapeco`. Copie o bloco `firebaseConfig`: são as chaves `NEXT_PUBLIC_*`.
6. **Configurações do projeto → Contas de serviço → Gerar nova chave privada.**
   Baixa um `.json`. O conteúdo inteiro dele, numa linha só, é o
   `FIREBASE_SERVICE_ACCOUNT`. **Esse arquivo não entra no repositório.**

## 2. Rodar na sua máquina

```bash
git clone https://github.com/correaltd2-cell/nexus-chapeco
cd nexus-chapeco
npm install
cp .env.example .env.local   # preencha com o que você copiou acima
npm run dev
```

Abre em http://localhost:3000. Sem o `.env.local` preenchido, a tela de login avisa
que o Firebase ainda não está ligado, em vez de quebrar.

## 3. Publicar as regras de segurança

As regras são a trava de verdade do sistema. Sem elas, o banco fica aberto.

```bash
npm i -g firebase-tools
firebase login
firebase use --add            # escolha o projeto nexus-chapeco
firebase deploy --only firestore:rules,firestore:indexes,storage
```

## 4. Criar o primeiro login

Como ninguém pode se promover sozinho, o primeiro administrador entra à mão:

1. **Authentication → Users → Add user**, com o seu e-mail e uma senha.
2. Copie o **UID** que aparece na lista.
3. **Firestore → Iniciar coleção** `perfis`, com o ID do documento igual a esse UID:

```
nome: Guilherme
email: (o mesmo do login)
papel: admin
setores: ["recepcao","financeiro","coordenacao","kids"]
avisaNoWhats: false
ativo: true
criadoEm: 2026-11-17T21:00:00.000Z
```

Depois disso, dá para criar o resto da equipe pela tela de Configurações.

## 5. Vercel

1. https://vercel.com/new → importar o repositório `nexus-chapeco`.
2. Em **Environment Variables**, colar tudo que está no `.env.local`.
   As `NEXT_PUBLIC_*` em todos os ambientes; as de segredo também, mas elas nunca
   chegam ao navegador porque só são lidas em rotas de API.
3. Deploy. Anote o domínio, porque o webhook do WhatsApp aponta para ele.

## 6. WhatsApp

Segue em `docs/whatsapp-coexistencia.md`. Resumo do que precisa estar pronto antes:
portfólio da Nexus com CNPJ e endereço, forma de pagamento na conta do WhatsApp,
aplicativo no Meta, usuário de sistema com token que não expira, e o webhook
apontando para `https://<seu-dominio>/api/whatsapp/webhook`.

## O que já funciona e o que ainda não

| Pronto | Falta |
|---|---|
| Login, papéis e trava de rota | Tela de Configurações (equipe, atendimento, conexão) |
| Casca com tema claro, escuro e automático | Provas |
| Conversas ao vivo, com entregue, lido e falhou | Grade de aulas e a planilha do Google |
| Envio pela Cloud API | Relatórios |
| Webhook com coexistência (eco do celular, contatos, histórico) | Motor de triagem e IA do financeiro |
| Quadros completos, com arrastar, prazo, checklist, anexo e filtros | Ligar o cartão à conversa pela tela do atendimento |
