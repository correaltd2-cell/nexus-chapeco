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
              ├── /api/sheets/*             lê e escreve a grade no Google Sheets
              ├── /api/provas/*             envio e correção
              └── /api/cron/*               réguas, marcação da semana, cobrança
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

O desenho aprovado pelo cliente está em `docs/demonstracao.html` (a demonstração que
validou a interface) e os tokens em `src/app/globals.css`. **Abra a demonstração antes
de construir qualquer tela.**

- **Cara de aplicativo de mensagens, não de painel.** O time já sabe usar WhatsApp Web;
  a tela de atendimento imita esse arranjo de propósito.
- **Cinza neutro, fonte do sistema, uma cor só para o que pede atenção** (verde
  `#0C8443`). Laranja `#F6821F` é só a marca, no avatar da escola.
- **Tema claro, escuro ou automático**, escolhido em Configurações e guardado no
  aparelho. Os tokens trocam pelas classes `t-claro` e `t-escuro` no `body`.
- Gráficos: azul `#2a78d6` para volume e tempo, e só três cores quando há três partes
  de um todo. Nunca pintar barra por valor.
- Interface clara, porque o time usa isso oito horas por dia.

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
