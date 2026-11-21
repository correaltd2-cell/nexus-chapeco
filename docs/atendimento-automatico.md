# Atendimento automático

O que acontece quando alguém escreve para o número da escola, decidido com a Nádia em
18/11/2026. Tudo é editável em **Configurações, Atendimento automático**, e **nasce
desligado**: até alguém ligar a chave, o sistema funciona como antes.

## O fluxo

```
contato escreve, sem atendimento aberto
│
├─ a mensagem já diz o assunto (boleto, reposição, cancelamento...)
│    └─ vai direto para o lugar certo, sem perguntar de novo
│
└─ não diz
     └─ saudação escrita pela IA, com 3 botões
          ├─ Minhas aulas ......... a próxima aula, lida da agenda
          │                           ├─ Confirmar presença → aula confirmada, atendimento encerrado
          │                           ├─ Remarcar → pendência no quadro e conversa na Recepção
          │                           └─ Falar com a recepção, ou sem aula marcada → Recepção
          ├─ Financeiro/contrato .. assistente (botões ou IA)
          │                           └─ não resolveu ou pediu pessoa → Financeiro, com resumo
          └─ Outro assunto ........ Recepção
```

- **Minhas aulas** (21/11/2026) mostra dia, hora, professor e aula da próxima aula, e a
  seguinte, com o texto fixo: dia e hora vêm do banco, nunca da IA. O aluno é achado
  pela conversa ligada ou pelo telefone (dele ou do responsável, com ou sem o 9). Os
  botões são os mesmos do lembrete da véspera (docs/agenda.md). Em Configurações, o
  destino do botão pode voltar a ser "vai para a Recepção".
- **Passar a conversa avisa o contato** (21/11/2026): quando alguém da equipe passa a
  conversa para outro setor, sai uma mensagem curta: "Guilherme, tua conversa foi
  encaminhada para o Financeiro. Logo alguém te responde por aqui." Fora do horário,
  ela diz também quando a equipe volta. Só com a janela de 24 horas aberta. O texto se
  muda e o aviso se desliga em Configurações, Atendimento. (Foi testada uma figurinha
  no lugar do texto; o cliente preferiu a mensagem, mais profissional.)
- **A Coordenação nunca é botão.** Ela só recebe conversa quando alguém do time passa
  pelo painel do contato. Quem é do setor recebe o aviso no celular pessoal.
- **Relógio do follow-up**: só corre quando a escola falou por último. Aos 15 minutos sem
  resposta, a IA retoma o que ficou pendente, citando o assunto (no menu, os botões vão de
  novo); aos 30, avisa com educação que vai encerrar, dizendo do que se tratava, e encerra.
  Se quem espera é o aluno, nada se encerra: o tempo de aguardo fica vermelho para o time.
- **Assunto resolvido** (21/11/2026): sai "posso te ajudar em mais alguma coisa?" com os
  botões **Não, era só isso** e **Sim, outra coisa**. Não encerra na hora, com uma frase
  rápida; Sim volta para o menu; outro assunto escrito segue para o lugar certo; sem
  resposta, encerra aos 15 minutos, sem follow-up. Vale quando o contato agradece (a IA
  lê a conversa 2 minutos depois, se ninguém do time respondeu antes), quando a dúvida do
  financeiro é respondida (botões Era só isso, valeu, Outra dúvida e Falar com uma pessoa)
  e quando ele confirma a aula pelo Minhas aulas.
- **Setor que não respondeu** em 2 horas de atendimento devolve a conversa para a
  Recepção, com recado. Fora do horário não conta: passar para o Financeiro às 21h não
  devolve às 23h.
- **Encerrar na mão**: o botão "Encerrar atendimento" no topo da conversa (dois toques).
  Sai um aviso claro de que o atendimento fechou, dizendo do que se tratou ("vou encerrar
  por aqui o atendimento sobre o boleto") e que é só chamar de novo.
- **Atendimento encerrado** recomeça pela Recepção, com o fluxo do começo.
- **Conversa parada** (ninguém encerrou) e o contato volta a escrever 12 horas depois:
  recomeça pelo menu, com recado para o time. Não quando ele está esperando resposta da
  gente, e não no meio do menu, do assistente ou das aulas. As horas se mudam em
  Configurações (0 desliga).
- **A IA escreve no jeito de falar da escola**, lendo a conversa. Se ela estiver fora do
  ar, sai o texto de reserva das Configurações. Ela nunca inventa horário, valor ou
  regra, nunca vende e nunca fecha matrícula.
- **Mensagem antiga** que vem do celular na coexistência nunca dispara nada.

## Horário de atendimento (21/11/2026)

Segunda a sexta, das 8h às 12h e das 13h30 às 21h30; sábado, das 9h às 12h; domingo
fechado. Vem assim e se muda em **Configurações, Atendimento automático, Horário de
atendimento** (um campo por dia: `08:00-12:00, 13:30-21:30`; vazio é fechado). Conta no
fuso de Chapecó, mesmo com o servidor em UTC.

Fora do horário **os botões funcionam igual** (Minhas aulas confirma presença de
madrugada, o assistente do financeiro responde o que está escrito), e a IA muda o que
diz:

- **Saudação**: avisa que a equipe está fora, diz quando volta ("amanhã às 8h", "hoje às
  13h30", "segunda às 8h") e pede para a pessoa escolher a opção e já explicar o que
  precisa, para agilizar.
- **Indo para a fila** (Outro assunto, Falar com a recepção, o assistente passando para
  gente): "anotado, já me conta o que precisa, que amanhã às 8h a equipe te responde".
- **Conversa que já está com a equipe**: quem escreve fora do horário recebe um aviso de
  quando a equipe volta, uma vez por fechamento, e só se ninguém da equipe falou com ele
  depois que fechou (quem fica até mais tarde respondendo não leva aviso por cima).
- **Remarcar** pelo botão da aula, de noite: "a recepção está fora do horário agora e
  amanhã às 8h te chama por aqui".
- **Sem repetir**: se a saudação já avisou que a equipe está fora, o resto do
  atendimento não repete o aviso nem o horário; o aviso de fila só confirma ("Combinado,
  Guilherme! Pode escrever aqui o que tu precisa sobre as aulas.").
- **Minhas aulas sem aula marcada** (contato que não é aluno, ou aluno sem aula na
  agenda): "não encontrei aula marcada na agenda para este número. Me conta aqui o que
  tu precisa sobre as aulas, que a equipe te responde segunda às 8h". Texto fixo, porque é
  dado do banco.
- Sem a IA, saem os textos de reserva de fora do horário, com `{volta}` trocado pela
  hora da volta.

Na área de teste, "Como se fosse fora do horário" mostra o que a IA escreveria hoje às
22h30. As regras são puras em `src/lib/dominio/horario.ts`, provadas em
`node --experimental-strip-types testes/horario.ts`.

## Se a IA parar

Sem saldo na conta da Anthropic (foi o que aconteceu em 21/11/2026) ou com a chave
recusada, o atendimento não para: sai o texto de reserva de cada momento. Os textos de
reserva usam `{primeiro_nome}`, `{volta}` (quando a equipe volta) e `{sobre}` (o assunto
que o contato escreveu por último, como " sobre o boleto"), para não sair frase sem
contexto. A gestão vê a faixa vermelha "A IA parou" no topo das telas. Para voltar: pôr
crédito em console.anthropic.com, em Plans & Billing.

Ligar a chave grava a configuração inteira com os textos daquele dia. Texto que ainda é
exatamente um padrão antigo segue o padrão novo sozinho; texto que a escola escreveu fica.

## Se os botões não aparecem

1. **A chave está ligada?** Configurações, Atendimento automático, Ligado.
2. **A conversa de teste está aberta com a equipe?** O menu só aparece em conversa
   nova, encerrada, ou parada há mais de 12 horas. Encerre a conversa no topo dela e
   mande um "oi" de novo.
3. **Índice do banco faltando** não para mais o atendimento: a leitura usa uma reserva
   sem índice (`src/lib/firebase/indice.ts`) e avisa nos registros da Vercel com
   `[indice]`. Mesmo assim, rode `firebase deploy --only firestore:indexes` para ficar
   rápido. Em 21/11/2026 foi um índice faltando que calou o menu.

## Para ligar, na ordem

1. **Firebase e WhatsApp funcionando.** Hoje o site ainda está na demonstração. Siga
   `docs/comecar.md` e `docs/whatsapp-coexistencia.md` antes.
2. **Variáveis na Vercel** (Settings, Environment Variables, Production):
   - `ANTHROPIC_API_KEY`: a chave da API do Claude, criada em console.anthropic.com, em
     API Keys. Só o servidor lê. Sem ela tudo funciona, com os textos de reserva.
   - `CRON_SECRET`: uma senha longa qualquer. A Vercel manda ela no cron; sem ela o
     relógio do follow-up e as mensagens programadas não rodam.
3. **Plano da Vercel.** O relógio roda de minuto em minuto (`vercel.json`). Isso precisa
   do plano Pro: no Hobby a Vercel recusa cron mais frequente que um por dia.
4. **Índices do Firestore.** `firebase deploy --only firestore:indexes`. Entraram dois
   que o código já usava: mensagens programadas (estado, quando) e tarefas da triagem
   (listaId, arquivado, ordem).
5. **Celular da recepção.** No WhatsApp Business, em Ferramentas comerciais, desligar a
   Mensagem de saudação e a Mensagem de ausência. Senão o aluno recebe duas saudações.
6. **Modelo do aviso aos coordenadores.** O sistema cria sozinho na Meta o
   `aviso_demanda_coordenacao`, junto com os outros modelos da escola
   (`docs/modelos-de-mensagem.md`). Espere ele aparecer como aprovado em Configurações,
   Modelos de mensagem. Depois, em Configurações, Equipe, toque em "Aviso no WhatsApp"
   no Natan e na Karina, preencha o celular e marque o aviso. Por último, marque "Mandar
   o aviso no celular pessoal" no atendimento automático.
7. **Escrever o conteúdo.** Em Configurações, o jeito de falar da Nexus (com mensagens
   reais da recepção) e as perguntas e respostas do financeiro e do contrato. As de
   trancamento e multa vêm vazias de propósito: o sistema não inventa regra da escola.
8. **Testar.** Na área "Testar a IA", escolha conversas de verdade e gere o follow-up, o
   encerramento e a saudação, e converse com o assistente como se fosse aluno. Nada é
   enviado. Ajuste o tom até ficar com a cara da escola.
9. **Ligar a chave.** Para desligar, é só desmarcar: vale na hora, sem deploy.

## Custos

- Saudação, assistente, follow-up e despedida saem dentro da janela de 24 horas, como
  resposta a quem escreveu.
- O aviso ao coordenador é modelo aprovado enviado a um número que não escreveu para a
  escola: a Meta cobra por envio.
- Cada mensagem escrita pela IA é uma chamada à API do Claude (modelo Claude Opus 5.5,
  esforço baixo), cobrada por uso na conta da Anthropic.

## Onde mora o quê

| O quê | Arquivo |
|---|---|
| Regras (puras, testadas) | `src/lib/dominio/automatico.ts`, prova em `testes/automatico.ts` |
| Horário de atendimento | `src/lib/dominio/horario.ts`, prova em `testes/horario.ts` |
| Consulta com reserva quando falta índice | `src/lib/firebase/indice.ts` |
| Fluxo com banco, Meta e IA | `src/lib/whatsapp/automatico.ts` |
| IA | `src/lib/ia/claude.ts` |
| Relógio (cron de minuto em minuto) | `src/app/api/cron/atendimento/route.ts` |
| Encerrar e passar de setor | `src/app/api/conversas/encerrar`, `src/app/api/conversas/transferir` |
| Testar sem enviar | `src/app/api/automatico/testar/route.ts` |
| Tela | `src/componentes/config-automatico.tsx` |
| Configuração salva | Firestore, `config/automatico` |
