# Foto, áudio e documento, e o aviso de mensagem nova

O que faltava antes de divulgar o número (decisão de 18/11/2026).

## Foto, áudio, vídeo e documento

**O que chega.** O webhook grava a mensagem na hora, já com o tipo (foto, áudio...), e
depois baixa o arquivo da Meta para o Storage do Firebase, na pasta da conversa
(`conversas/{id}/...`). A bolha mostra a foto, o player de áudio (com velocidade 1x,
1,5x e 2x), o vídeo ou o cartão do documento. Se o arquivo não vier, a bolha diz e a
Saúde do sistema mostra um aviso (não é alarme).

**O que sai.** O clipe na caixa de escrever anexa foto, PDF, Word, Excel, vídeo ou
áudio, com legenda. O microfone (aparece quando a caixa está vazia) grava o áudio pelo
navegador; a lixeira apaga e a seta manda. O navegador sobe o arquivo para o Storage e
o servidor (`/api/whatsapp/enviar`) manda para a Meta.

- O que o WhatsApp aceita: foto JPG ou PNG até 5 MB (maior vai como documento), vídeo
  MP4 até 16 MB, áudio até 16 MB, documento até 20 MB (o limite do nosso Storage). O
  resto é recusado na hora, com o motivo.
- O Chrome grava em WebM e a Meta só aceita o mesmo som dentro de OGG. O servidor troca
  a embalagem sem recodificar (`src/lib/dominio/ogg.ts`), em milissegundos. Safari grava
  em MP4 e Firefox em OGG, que já saem direto.
- Regras em `src/lib/dominio/midia.ts`, provadas em
  `node --experimental-strip-types testes/midia.ts` (com uma gravação real do Chrome em
  `testes/amostras/`).

**Precisa:** o Storage do Firebase ativo no projeto (Firebase, Storage) e as regras de
`storage.rules` publicadas (`firebase deploy --only storage`). Se o Storage ainda não
estiver ativo, o Firebase pode pedir o plano Blaze para criar o bucket.

## Aviso de mensagem nova

**Quem recebe:** quem está ativo e é do setor da conversa (Configurações, Equipe).
Enquanto a saudação ou o assistente do financeiro cuidam da conversa, ninguém é
chamado: o aviso vem quando a conversa chega para uma pessoa.

**Com o sistema aberto** (o computador da recepção): som de "plim" quando o contato
escreve, e notificação do sistema quando a aba não estiver na frente. Quem está lendo a
própria conversa não ouve nada.

**Com o sistema fechado** (o celular): push pelo Firebase Cloud Messaging. O servidor
manda quando a mensagem chega (`src/lib/avisos.ts`), e `public/aviso-sw.js` mostra; o
toque abre a conversa. Cada aparelho liga em Configurações, Avisos de mensagem nova, e
fica em `dispositivos` (gravado pelo servidor, em `/api/avisos`). Aparelho que deixa de
receber sai sozinho. Tem botão de aviso de teste.

### Para ligar o push (uma vez)

1. No Firebase: Configurações do projeto, Cloud Messaging, Configuração da Web,
   Certificados de push da Web, **Gerar par de chaves**. Copie a chave que aparece (ela
   é pública, não é segredo).
2. Na Vercel: variável `NEXT_PUBLIC_FIREBASE_VAPID_KEY` com essa chave, em Production,
   e publique de novo.
3. Cada pessoa, no próprio celular: Configurações, Avisos de mensagem nova, **Ligar
   avisos neste aparelho**, e depois **Mandar um aviso de teste**.
4. **iPhone:** o aviso com o sistema fechado só chega com o Nexus na tela de início
   (iOS 16.4 ou mais novo). No Safari: Compartilhar, Adicionar à Tela de Início; abra o
   Nexus pelo ícone e ligue os avisos por lá. Android e computador funcionam direto no
   navegador.

Sem a chave, tudo funciona com o sistema aberto; a tela avisa a gestão do que falta.

Regras em `src/lib/dominio/avisos.ts`, provadas em
`node --experimental-strip-types testes/avisos.ts`.
