# A planilha de alunos

A lista de alunos mora no sistema e se edita como planilha, na tela Alunos (menu Escola),
com as colunas que a escola já conhece da aba ATIVOS: COD, nome, yes, horário fixo,
BOOK, modalidade, classificação, App, Nex-IA, falta de livro, fim do contrato e
observação, mais telefone e responsável. A carga inicial vem do arquivo que a escola já
tem (Excel ou CSV). A ligação com a planilha do Google ficou pronta e guardada para
depois (decidido em 21/11/2026: "quero deixar planilha pra depois, quero criar uma
interna dentro do sistema puxando os dados que já tem").

As conversas do WhatsApp se ligam aos alunos pelo telefone (do aluno ou do responsável,
com ou sem o 9 da frente) e, sem telefone, pelo nome do contato quando só um aluno bate.
É isso que acaba com o "Ainda não ligado a um aluno" no painel do contato.

## Onde está cada coisa

| O quê | Arquivo |
|---|---|
| Ler Excel (.xlsx) e CSV no navegador | `src/lib/dominio/xlsx.ts`, prova em `testes/xlsx.ts` |
| Colunas pelo nome, telefone, situação, comparação, vínculo das conversas, conferência | `src/lib/dominio/planilha.ts`, prova em `testes/planilha.ts` |
| O que cada célula grava, aluno novo, a semana da marcação | `src/lib/dominio/alunos.ts`, prova em `testes/alunos.ts` |
| Tela | `/alunos`: `componentes/alunos.tsx` (página e lista), `alunos-grade.tsx` (a planilha), `alunos-importar.tsx` (arquivo e Google), `alunos-semana.tsx` (marcação da semana) |
| Começar a semana nova e o histórico | `/api/alunos/semana` (GET as 12 últimas, POST começa), coleção `semanas` (só o servidor lê e grava) |
| Planilha do Google (para depois) | `src/lib/planilha.ts`, `/api/alunos/planilha`, relógio `/api/cron/planilha` |

Rodar antes de mexer: `node --experimental-strip-types testes/xlsx.ts`, `testes/planilha.ts`
e `testes/alunos.ts`.

## Começar: trazer o arquivo da escola

1. **Baixar a planilha em Excel.** No Google Sheets: Arquivo, Fazer download, Microsoft
   Excel (.xlsx). CSV também serve (o do Excel em português, com ponto e vírgula, e o
   de vírgula). O .xls antigo não: salve como .xlsx.
2. **Em Alunos, Trazer de um arquivo, Escolher arquivo.** O arquivo é lido no próprio
   navegador e não vai para lugar nenhum. A aba ATIVOS vem escolhida; outra aba se troca
   na lista.
3. **Conferir.** A tela mostra o que a planilha diz (ativos, quem marcou, trancados, off,
   obs, com horário fixo), o que vai acontecer (quantos entram, quantos mudam e o quê,
   quantas conversas se ligam), as linhas com problema e as primeiras linhas como vão
   entrar. Coluna reconhecida errada se troca em "Colunas reconhecidas", e a conferência
   se refaz na hora.
4. **Importar.** Tudo vai num lote só. Importar o mesmo arquivo de novo não duplica
   ninguém: o aluno é reencontrado pelo código (e, sem código, pelo telefone ou pelo nome).

Quem traz arquivo: administração, gestão e recepção. Coordenação edita a planilha, mas
não importa (não enxerga as conversas de todos os setores para ligar).

## A planilha no sistema

- **Editar:** clique na célula (ou Enter, ou comece a digitar, como no Excel). Enter grava
  e desce; Tab grava e vai para a do lado; Esc desiste; as setas andam entre as células.
  Na observação, Shift+Enter quebra a linha. Caixa (Menor, Marcou, App, Nex-IA, Falta
  livro, Contrato assinado) e lista (Situação, Modalidade, Classificação) gravam na hora.
  Com a lista em foco, digitar não troca o valor (um "t" trancaria o aluno sem querer).
- **O que cada célula grava** (`camposEditados`): o BOOK escrito vira nível, tipo,
  professor e curso (Junior vai para Kids; "ON" deixa online se não havia modalidade);
  o horário escrito vira dia e hora (passe o mouse para ver o que o sistema leu; o que
  ele não entende fica sublinhado); a situação decide quem é ativo, e quem sai de ativo
  perde a marcação; " - menor" no fim do nome marca menor de idade; telefone e data
  aceitam qualquer jeito de escrever e recusam o que não entendem.
- **Na planilha interna, apagar é apagar.** Célula vazia grava vazio (diferente da
  importação, onde célula vazia não mexe em nada).
- **Código repetido não passa:** a tela diz de quem é o código.
- **Novo aluno:** botão no topo; nasce ativo, sem marcação, e a linha dele ganha o foco no
  código. Ninguém é apagado: aluno que saiu vira inativo na Situação.
- O ícone verde ao lado do nome abre a conversa do aluno. A visão Lista continua com o
  detalhe de cada aluno; o CSV baixa o que o filtro mostra.
- Grava como o resto do sistema, com as regras do Firestore valendo: escrevem em
  `alunos` administração, gestão, recepção e coordenação.

## A semana da marcação

A coluna Marcou é o "yes" da planilha: o aluno ativo já marcou a aula da semana seguinte.
O bloco "Marcação da próxima semana" mostra quantos marcaram e leva a quem não marcou
(o gargalo 2). **Começar a semana nova** guarda a semana que acabou no histórico (quantos
marcaram e o nome de quem não marcou) e desmarca a coluna Marcou de todos os ativos, como
a escola fazia apagando os "yes". Avisa se a última virada foi há menos de 48 horas. É da
recepção e da gestão; no sistema publicado quem grava é `/api/alunos/semana`.

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

## A planilha de marcação da escola (aba ATIVOS)

Feito em cima de "01 - MARCAÇÃO DE AULA - CHAPECO", aba ATIVOS, conferido com o arquivo
de 21/11/2026 (266 alunos únicos, 228 ativos, 203 marcaram a semana seguinte, 25 não
marcaram, 22 trancados, 13 off, 3 obs). O painel de números em cima da planilha erra
(conta só até a linha 144 e desconta duas vezes); a tela Alunos refaz as contas certas.

| Coluna | Vira no sistema |
|---|---|
| COD | `codigo`, a chave do aluno (580 e 844 aparecem duas vezes: fica a primeira linha e a conferência avisa) |
| NOME | `nome`, sem o " - menor" e o " - ON" do fim; `menor` quando tem " - menor" |
| yes | duas coisas: `situacao` (trancado; off, inclusive o mês de volta, "JANEIRO"; obs, inclusive "ñ chamar"; o resto ativo) e `marcouSemana` (yes = marcou a semana seguinte, vazio = ativo que não marcou) |
| ei | `horarioFixoTexto` como está, e `horariosFixos` em dia e hora quando dá para ler ("quartas às 13h30", "seg 13h30 e sex 18h") |
| BOOK | `nivel` (Starter, A1 a B2, Junior 1 a 3, Clube, Particular), `tipoCurso` (turma, particular, clube), `professorDoLivro` ("PRIVATE NATHAN") e `livroOriginal`; Junior vai para a trilha Kids |
| MODALIDADE | `modalidade` (presencial, online, híbrido) |
| FIXED | `temFixo` |
| CLASSIFICAÇÃO | `saude` (evoluindo, atenção, crítico) |
| APP, NEX-IA | `appAtivo`, `nexiaAtivo` |
| FALTA POR LIVRO | `pendenciaLivro` |
| FIM DE CONTRATO, ASSINATURA DO CONTRATO | `contratoFim`, `contratoAssinado` |
| OBSERVAÇÕES | `observacao` |

**A aba ATIVOS não tem telefone.** Por isso a conversa se liga ao aluno de três jeitos:
pelo telefone quando o cadastro tem; pelo nome do contato no WhatsApp quando todas as
palavras dele estão no nome de um aluno só ("Cintia Pinheiro" e "CINTIA LUIZA PINHEIRO");
e à mão, no painel do contato, onde o sistema sugere quem parece ser. Ligar à mão guarda
o número no aluno (no menor de idade e no Kids, como telefone do responsável), e a
próxima conversa desse número já chega ligada. A planilha sem telefone nunca apaga esse
número.

**Ainda não entra** (estão no levantamento da planilha, para depois): AULAS PARTICULARES
(saldo de pacotes, renovações nos comentários), B2 CONTROLE e B2 FINALIZADOS (as 40 aulas
do B2 por aluno), o histórico semanal de "não marcaram" de 2026, a aba JUNIOR (sem código,
casada por nome) e erechim (são contatos, não alunos).

## O que a importação nunca faz

- Importar o mesmo arquivo (ou a mesma planilha) de novo não duplica ninguém.
- Célula vazia não apaga o que o sistema já tem.
- Aluno que sumiu da planilha não é apagado nem desativado: aparece na conta, para a
  escola decidir.
- Sem coluna de situação, ninguém muda de ativo para inativo.
- Conversa já ligada a um aluno (à mão ou antes) não é trocada.
- Os dados de teste da agenda ficam de fora.

## A planilha do Google (para depois)

Fica recolhida no fim da tela Alunos. Está pronta: quando a escola quiser, segue os passos
abaixo. Atenção: com "Atualizar sozinha de hora em hora", o que mudar na planilha do Google
passa por cima do que foi editado no sistema; por isso nasce desligado.

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
