# Alunos da planilha do Google

A escola mantém a lista de alunos numa planilha do Google e continua mantendo. O sistema
lê essa planilha, mostra o que vai mudar antes de mudar, importa e depois acompanha de
hora em hora. As conversas do WhatsApp se ligam aos alunos pelo telefone (do aluno ou do
responsável, com ou sem o 9 da frente), e é isso que acaba com o "Ainda não ligado a um
aluno" no painel do contato.

## Onde está cada coisa

| O quê | Arquivo |
|---|---|
| Regras (colunas pelo nome, telefone, situação, comparação, vínculo das conversas) | `src/lib/dominio/planilha.ts`, prova em `testes/planilha.ts` |
| Leitura do Google e gravação | `src/lib/planilha.ts` |
| Rota da tela | `/api/alunos/planilha` (GET situação; POST conferir, importar, automatico) |
| Relógio de hora em hora | `/api/cron/planilha` (`vercel.json`, minuto 41) |
| Tela | `/alunos` (menu Escola, Alunos) |

Rodar antes de mexer nas regras: `node --experimental-strip-types testes/planilha.ts`.

## Para ligar (uma vez, a gestão)

1. **Compartilhar a planilha com o sistema, como leitor.** Em Alunos, a tela mostra o
   e-mail da conta de serviço (é a mesma do Firebase, `...@nexus-chapeco.iam.gserviceaccount.com`).
   No Google Sheets: Compartilhar, colar o e-mail, Leitor.
2. **Ligar a API do Google Sheets no projeto do Firebase.** A tela tem o link para o Google
   Cloud; é tocar em Ativar. Leva alguns minutos para valer.
3. **Colar o link da planilha e tocar em Conferir planilha.** A tela mostra as abas, as
   colunas que reconheceu, quantos alunos entram, quantos mudam, quantas conversas vão
   se ligar e as primeiras linhas como vão entrar. Coluna errada se troca ali.
4. **Importar.** Com "Atualizar sozinha de hora em hora" marcado, o sistema acompanha a
   planilha. A recepção também pode tocar em Atualizar agora.

Nenhuma chave nova: a leitura usa a conta de serviço que já está na Vercel
(`FIREBASE_SERVICE_ACCOUNT`), ou `GOOGLE_SERVICE_ACCOUNT` se um dia existir uma só para isso.

## Como a planilha é lida

- A linha do cabeçalho é achada sozinha (pode ter título em cima da tabela).
- As colunas são reconhecidas pelo nome, sem acento e sem caixa: Nome/Aluno, Telefone/
  Celular/WhatsApp, Responsável, Telefone do responsável, E-mail, CPF, Matrícula/Código,
  Nível/Livro, Lição, Curso, Situação/Status, Observação. "Data de matrícula" não é a
  matrícula.
- Telefone sem DDD é de Chapecó (49). Com dois números na célula, vale o primeiro.
- Situação: vazio é ativo; cancelado, trancado, inativo, desistente, concluído e "não"
  são inativos. O que não reconhece fica ativo e aparece na conferência.
- Kids: quando o curso ou o nível falam em Kids.
- O aluno é reencontrado na próxima leitura pela matrícula (melhor), pelo CPF, ou pelo
  nome com o fim do telefone. Aluno que já existia no sistema é achado pelo telefone com
  o mesmo primeiro nome, ou pelo nome inteiro.

## O que a importação nunca faz

- Célula vazia não apaga o que o sistema já tem.
- Aluno que sumiu da planilha não é apagado nem desativado: aparece na conta, para a
  escola decidir.
- Sem coluna de situação, ninguém muda de ativo para inativo.
- Conversa já ligada a um aluno (à mão ou antes) não é trocada.
- Os dados de teste da agenda ficam de fora.
