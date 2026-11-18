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
          ├─ Minhas aulas ......... Recepção (gente)
          ├─ Financeiro/contrato .. assistente (botões ou IA)
          │                           └─ não resolveu ou pediu pessoa → Financeiro, com resumo
          └─ Outro assunto ........ Recepção
```

- **A Coordenação nunca é botão.** Ela só recebe conversa quando alguém do time passa
  pelo painel do contato. Quem é do setor recebe o aviso no celular pessoal.
- **Relógio do follow-up**: só corre quando a escola falou por último. Aos 15 minutos sem
  resposta, a IA retoma o que ficou pendente; aos 30, se despede e encerra. Se quem
  espera é o aluno, nada se encerra: o tempo de aguardo fica vermelho para o time.
- **Conversa resolvida** ("valeu, obrigada!"): a IA confirma lendo a conversa, manda uma
  despedida curta e encerra.
- **Setor que não respondeu** em 2 horas devolve a conversa para a Recepção, com recado.
- **Encerrar na mão**: o botão "Encerrar atendimento" no topo da conversa (dois toques).
- **Atendimento encerrado** recomeça pela Recepção, com o fluxo do começo.
- **A IA escreve no jeito de falar da escola**, lendo a conversa. Se ela estiver fora do
  ar, sai o texto de reserva das Configurações. Ela nunca inventa horário, valor ou
  regra, nunca vende e nunca fecha matrícula.
- **Mensagem antiga** que vem do celular na coexistência nunca dispara nada.

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
6. **Modelo do aviso aos coordenadores.** No Gerenciador do WhatsApp, Modelos, Criar:
   - categoria **Utilidade**, nome `aviso_demanda_coordenacao`, idioma **Português (BR)**
   - corpo: `Oi, {{1}}! Chegou uma conversa para a {{2}} no sistema da Nexus: {{3}}. Responda pelo sistema.`
     (exemplo: `Karina`, `Coordenação Kids`, `Cláudia Bortoli`)
   - botão **Visitar site**, URL **dinâmica**:
     `https://nexus-chapeco.vercel.app/conversas?conversa={{1}}`
   - espere a aprovação da Meta. Depois, em Configurações, Equipe, toque em
     "Aviso no WhatsApp" no Natan e na Karina, preencha o celular e marque o aviso. Por
     último, marque "Mandar o aviso no celular pessoal" no atendimento automático.
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
| Fluxo com banco, Meta e IA | `src/lib/whatsapp/automatico.ts` |
| IA | `src/lib/ia/claude.ts` |
| Relógio (cron de minuto em minuto) | `src/app/api/cron/atendimento/route.ts` |
| Encerrar e passar de setor | `src/app/api/conversas/encerrar`, `src/app/api/conversas/transferir` |
| Testar sem enviar | `src/app/api/automatico/testar/route.ts` |
| Tela | `src/componentes/config-automatico.tsx` |
| Configuração salva | Firestore, `config/automatico` |
