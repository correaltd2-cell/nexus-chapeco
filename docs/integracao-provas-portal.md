# Integração das provas: central de atendimento ↔ portal de alunos

**Para:** quem desenvolve o portal de alunos (https://nexusenglish.com.br)
**De:** central de atendimento da Nexus Chapecó (Next.js na Vercel, Firebase)
**Situação:** proposta de contrato, versão 1. **A API do portal ainda não existe.** A central
já está pronta do lado dela, com as ações desligadas até esta API ser implementada,
configurada e validada.

---

## 1. O que a integração faz (e o que não faz)

A recepção da escola atende os alunos pelo WhatsApp oficial, dentro da central. A integração
permite, sem sair da conversa ou do cadastro do aluno:

1. **Vincular** o aluno da central ao aluno do portal (uma pessoa da equipe escolhe e confirma).
2. **Consultar** as provas do aluno e o estado de cada uma: bloqueada, liberada, iniciada, concluída.
3. **Liberar** uma prova, com proteção contra liberação em duplicidade.
4. **Obter o link** da prova liberada, para a central mandar pelo WhatsApp (e reenviar).

**Fica tudo no portal:** questões, respostas, áudios, correção, nota, controle de tempo e o
login do aluno. A central não copia nada disso, não guarda respostas e não faz a prova. Ela
só pede ao portal e mostra o que o portal responde.

**Dados mínimos:** a central só precisa do que está neste documento. Nenhum endpoint deve
devolver questões, respostas, áudios ou dados pessoais além dos listados aqui.

## 2. O fluxo, do ponto de vista da central

```
Recepção abre a aba Provas do aluno
  │
  ├─ (sem vínculo) busca no portal ──► GET /alunos?busca=...
  │     escolhe e confirma "é a mesma pessoa" ──► GET /alunos/{aluno_id}  (confere que existe)
  │     a central grava portalStudentId no aluno e registra quem vinculou
  │
  ├─ consulta ──► GET /alunos/{aluno_id}/provas
  │
  ├─ "Liberar e enviar" (prova bloqueada com pode_liberar = true)
  │     1. a tela mostra aluno, prova e destino, e a pessoa confirma
  │     2. POST /alunos/{aluno_id}/provas/{prova_id}/liberacoes   (Idempotency-Key)
  │     3. espera a confirmação com o link
  │     4. manda o link pelo WhatsApp oficial
  │     5. registra a liberação e o envio separados, com quem fez
  │
  └─ "Reenviar mensagem" (prova liberada ou iniciada)
        GET /alunos/{aluno_id}/provas/{prova_id}/link  ──► manda de novo (nunca libera outra vez)
```

A central chama o portal **somente pelo servidor** (rotas da Vercel). O navegador da equipe
nunca vê o token, o segredo nem a URL da API.

## 3. Autenticação entre servidores

Todo pedido da central vai por **HTTPS** e leva estes cabeçalhos:

| Cabeçalho | Exemplo | Para quê |
|---|---|---|
| `Authorization` | `Bearer <PORTAL_API_TOKEN>` | identifica a central (token longo, aleatório, só para esta integração) |
| `X-Central-Momento` | `1795543200` | hora do pedido, em segundos Unix (UTC) |
| `X-Central-Assinatura` | `v1=ad37e9bf...` | HMAC-SHA256 do pedido (abaixo) |
| `X-Request-Id` | `6f1c2f0e-...` | id único do pedido, para os registros dos dois lados |
| `X-Central-Operador-Id` | `uid_recepcao_ana` | quem da equipe fez a ação (para a auditoria do portal) |
| `X-Central-Operador-Nome` | `Ana%20(Recep%C3%A7%C3%A3o)` | o nome, codificado como URL (UTF-8) |
| `Idempotency-Key` | `3f2b8c1e-9a4d-4e6f-8b2a-1c3d5e7f9a0b` | só no POST de liberação (seção 6) |
| `Content-Type` | `application/json` | só quando há corpo |

### 3.1 A assinatura

```
texto assinado = "<X-Central-Momento>.<MÉTODO>.<caminho com a busca>.<sha256 hex do corpo>"
X-Central-Assinatura = "v1=" + hex( HMAC-SHA256( PORTAL_API_SEGREDO, texto assinado ) )
```

- `MÉTODO` em maiúsculas (`GET`, `POST`).
- `caminho com a busca` é o caminho da URL **como foi pedido**, com a query string, sem
  domínio. Ex.: `/api/central/v1/alunos?busca=ana&limite=10`.
- Sem corpo (GET), o hash é o do texto vazio:
  `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`.
- O corpo é assinado exatamente como chegou (os bytes recebidos), antes de interpretar o JSON.

**O portal deve:**
1. recusar se o token não bater (`401 nao_autenticado`);
2. recusar se `X-Central-Momento` estiver a mais de **300 segundos** do relógio do portal
   (`401 assinatura_invalida`);
3. recalcular a assinatura e comparar em **tempo constante** (`401 assinatura_invalida`);
4. de preferência, recusar um `X-Request-Id` já visto nos últimos 10 minutos.

**Vetores para conferir a implementação** (segredo de exemplo, **não é chave real**):

| | Valor |
|---|---|
| segredo | `segredo-de-exemplo-nao-usar` |
| GET, momento `1795543200`, caminho `/api/central/v1/alunos/stu_8f2k1/provas`, sem corpo | `v1=ad37e9bfda6248e1af03d59488974ec96943b6572e308f4933451877abedc1e4` |
| POST, momento `1795543260`, caminho `/api/central/v1/alunos/stu_8f2k1/provas/prv_a2_m4/liberacoes`, corpo `{"operador":{"id":"uid_recepcao_ana","nome":"Ana (Recepção)"},"origem":"central-chapeco"}` | `v1=c6427bb099e73e765d719d68c73cc4d5acf44d352286518fe3807d0446afe4f2` |

Texto assinado do GET acima:
`1795543200.GET./api/central/v1/alunos/stu_8f2k1/provas.e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`

Verificação em pseudocódigo:

```
esperado = "v1=" + hex(hmac_sha256(SEGREDO, momento + "." + metodo + "." + caminho_com_busca + "." + sha256_hex(corpo_bruto)))
se abs(agora_unix - momento) > 300: recusa 401 assinatura_invalida
se não compara_tempo_constante(esperado, cabecalho_assinatura): recusa 401 assinatura_invalida
```

### 3.2 As chaves

- O portal gera o token e o segredo e entrega à escola por canal seguro (não por e-mail aberto
  nem pelo WhatsApp). A escola coloca nas variáveis da Vercel; **nunca vão para o código**.
- Troca de chave: o portal aceita a chave antiga e a nova ao mesmo tempo por um período curto.
- Opcional: o portal pode limitar a origem às saídas da Vercel, mas a autenticação acima é
  obrigatória de qualquer jeito.

## 4. Convenções

- **Base:** proposta `https://nexusenglish.com.br/api/central/v1` (o portal pode escolher
  outra, desde que em HTTPS; a central só precisa da URL base).
- **JSON** em UTF-8, nomes em `snake_case`.
- **Datas** em ISO 8601 com fuso: `2026-11-24T14:58:00-03:00`. Ausente é `null`.
- **Ids** são texto opaco (até 120 caracteres no aluno, 160 na prova e na liberação), estáveis:
  o id de um aluno nunca muda nem é reaproveitado.
- **Erro** sempre neste formato, com o status HTTP certo:

  ```json
  { "erro": { "codigo": "prova_em_andamento", "mensagem": "O aluno já iniciou esta prova." } }
  ```

- **Redirecionamentos:** a central não segue redirecionamento (resposta 3xx é tratada como erro).
- **Tempo de resposta:** a central espera até 10 s nas consultas e 20 s na liberação.
- **Limite de uso:** se precisar, responda `429` com `Retry-After`; a central não repete
  sozinha, a pessoa tenta de novo.

## 5. Endpoints

### 5.1 Procurar aluno, para o vínculo

`GET /alunos?busca={texto}&limite={1..20}`

- `busca`: pelo menos 3 caracteres. Procura em nome, e-mail e código/matrícula do portal.
- `limite`: padrão 10, máximo 20.
- Só alunos da **unidade Chapecó**.

`200`
```json
{
  "alunos": [
    {
      "id": "stu_8f2k1",
      "nome": "Ana Paula Exemplo",
      "email_mascarado": "an***@exemplo.com",
      "telefone_final": "3456",
      "turma": "A2 Noite",
      "nivel": "A2",
      "ativo": true
    }
  ]
}
```

- `email_mascarado` e `telefone_final` (últimos 4 dígitos) servem para a pessoa da equipe
  **confirmar que é a mesma pessoa**. Não mande o e-mail nem o telefone completos.
- Nenhum resultado: `200` com `"alunos": []`.
- `400 requisicao_invalida` se `busca` tiver menos de 3 caracteres.

### 5.2 Um aluno

`GET /alunos/{aluno_id}`

`200`: `{ "aluno": { ...mesmos campos de 5.1... } }`
`404 aluno_nao_encontrado`

A central chama isto antes de gravar o vínculo, para confirmar que o id escolhido existe.

### 5.3 Provas do aluno e andamento

`GET /alunos/{aluno_id}/provas`

`200`
```json
{
  "aluno_id": "stu_8f2k1",
  "atualizado_em": "2026-11-24T14:58:00-03:00",
  "provas": [
    {
      "id": "prv_a2_m3",
      "titulo": "A2 Módulo 3",
      "nivel": "A2",
      "modulo": "3",
      "estado": "liberada",
      "pode_liberar": false,
      "motivo_bloqueio": null,
      "liberacao": {
        "id": "lib_91c0",
        "liberada_em": "2026-11-24T10:00:00-03:00",
        "expira_em": null,
        "liberada_por": "central:uid_recepcao_ana"
      },
      "iniciada_em": null,
      "concluida_em": null,
      "resultado": null
    },
    {
      "id": "prv_a2_m4",
      "titulo": "A2 Módulo 4",
      "nivel": "A2",
      "modulo": "4",
      "estado": "bloqueada",
      "pode_liberar": true,
      "motivo_bloqueio": null,
      "liberacao": null,
      "iniciada_em": null,
      "concluida_em": null,
      "resultado": null
    },
    {
      "id": "prv_a2_m1",
      "titulo": "A2 Módulo 1",
      "nivel": "A2",
      "modulo": "1",
      "estado": "concluida",
      "pode_liberar": false,
      "motivo_bloqueio": null,
      "liberacao": { "id": "lib_77aa", "liberada_em": "2026-10-02T13:00:00-03:00", "expira_em": null, "liberada_por": "portal:coordenacao" },
      "iniciada_em": "2026-10-02T14:00:00-03:00",
      "concluida_em": "2026-10-02T14:50:00-03:00",
      "resultado": { "situacao": "corrigida", "nota": 8.5 }
    }
  ]
}
```

- `aluno_id` **tem que ser o mesmo do caminho**: se vier outro, a central não mostra nada.
- `pode_liberar`: o portal decide se a prova pode ser liberada agora (pré-requisitos, módulo
  atual etc.). Quando `false` e `estado = bloqueada`, mande o porquê em `motivo_bloqueio`
  (texto curto para a recepção ler).
- `resultado`: opcional. `situacao` livre (ex.: `aguardando_correcao`, `corrigida`); `nota`
  número ou `null`. Nada de respostas ou comentários de correção.
- `404 aluno_nao_encontrado`.

### 5.4 Liberar uma prova (com proteção contra duplicidade)

`POST /alunos/{aluno_id}/provas/{prova_id}/liberacoes`
Cabeçalho obrigatório: `Idempotency-Key: <UUID>`

Corpo:
```json
{ "operador": { "id": "uid_recepcao_ana", "nome": "Ana (Recepção)" }, "origem": "central-chapeco" }
```

`201` (liberou agora)
```json
{
  "liberacao": {
    "id": "lib_a41f",
    "aluno_id": "stu_8f2k1",
    "prova_id": "prv_a2_m4",
    "estado": "liberada",
    "liberada_em": "2026-11-24T15:01:00-03:00",
    "expira_em": null,
    "link": "https://nexusenglish.com.br/aluno/provas/prv_a2_m4"
  }
}
```

- `aluno_id` e `prova_id` na resposta **têm que ser os do caminho**. Se vierem outros, a central
  não manda nada e trata a liberação como sem confirmação.
- `link`: ver a seção 7.

Erros:

| Status | `codigo` | Quando | O que a central faz |
|---|---|---|---|
| 404 | `aluno_nao_encontrado` | aluno não existe | recusa certa: destrava |
| 404 | `prova_nao_encontrada` | prova não existe | recusa certa: destrava |
| 422 | `prova_nao_pertence_ao_aluno` | a prova é de outro aluno | recusa certa: destrava |
| 422 | `prova_nao_liberavel` | `pode_liberar` é falso | recusa certa: destrava |
| 409 | `prova_ja_liberada` | já liberada por outro pedido (outra chave) | não manda nada; oferece "Reenviar mensagem" |
| 409 | `prova_em_andamento` | o aluno já iniciou | não manda nada; **não reinicia nem substitui** |
| 409 | `prova_concluida` | já concluída | não manda nada |
| 422 | `idempotencia_conflito` | a mesma chave já foi usada para outro aluno ou outra prova | recusa certa: destrava |
| 409 | `idempotencia_em_processamento` | o mesmo pedido (mesma chave) ainda está sendo processado | fica sem confirmação; a pessoa confere de novo com a mesma chave |
| 401 | `nao_autenticado` / `assinatura_invalida` | token ou assinatura | recusa certa; alerta na saúde do sistema |
| 403 | `proibido` | a central não pode fazer isso | recusa certa |
| 429 | `limite` | muitos pedidos | fica sem confirmação; a pessoa confere de novo depois, com a mesma chave |
| 5xx | qualquer | erro do portal | **sem confirmação**: pode ter liberado ou não |

Os 409 de prova (`prova_ja_liberada`, `prova_em_andamento`, `prova_concluida`) podem trazer
`"liberacao": {...}` ao lado de `erro`, com a liberação atual. Isso ajuda, mas não é obrigatório.

### 5.5 Link da prova liberada (para enviar ou reenviar)

`GET /alunos/{aluno_id}/provas/{prova_id}/link`

`200`
```json
{ "link": "https://nexusenglish.com.br/aluno/provas/prv_a2_m4", "expira_em": null, "estado": "liberada" }
```

- Vale para prova `liberada` ou `iniciada` (o aluno pode precisar do link para continuar).
- `409 prova_nao_liberada` se ainda está bloqueada; `409 prova_concluida` se já terminou.
- Este endpoint **nunca** libera nem reinicia nada; só lê.

## 6. Idempotência (o mais importante)

A central gera **um UUID por confirmação** de "Liberar e enviar" e manda em `Idempotency-Key`.
O mesmo clique repetido, a rede repetindo o pedido ou a pessoa tocando em "Conferir de novo"
mandam **a mesma chave**. O portal deve:

1. **Mesma chave, mesmo aluno e mesma prova:** não libera de novo. Devolve a **mesma
   resposta** da primeira vez (`200`, com o mesmo `liberacao.id` e o mesmo `link`). Pode mandar
   o cabeçalho `Idempotent-Replayed: true`.
2. **Mesma chave, outro aluno ou outra prova:** `422 idempotencia_conflito`, sem liberar nada.
3. **Dois pedidos com a mesma chave ao mesmo tempo:** só um faz o trabalho; o outro espera o
   resultado ou recebe `409 idempotencia_em_processamento`.
4. **Chave nova para prova que já não está bloqueada:** `409 prova_ja_liberada` (ou
   `prova_em_andamento`, `prova_concluida`). Nunca crie uma segunda liberação nem reinicie uma
   tentativa em andamento.
5. Guardar as chaves por **pelo menos 7 dias**.

Do lado da central, além disso:
- só uma liberação por prova de cada aluno pode estar em curso (trava no Firestore);
- quando o portal não responde (tempo esgotado, 5xx, resposta fora do contrato), a liberação
  fica **sem confirmação**, a trava fica, **nenhuma mensagem sai**, e só a pessoa pode
  "Conferir de novo", que repete o pedido com **a mesma chave**;
- "Reenviar mensagem" só lê o link (5.5); nunca chama o POST de liberação.

## 7. O link de acesso

- **HTTPS** e no domínio `nexusenglish.com.br` (ou subdomínio dele). A central recusa mandar
  link de outro domínio, com usuário e senha na URL, ou fora de HTTPS.
- O aluno entra **com o próprio login** do portal. O link **não deve** levar sessão, senha ou
  token que dê acesso sem login, porque ele fica no histórico do WhatsApp.
- De preferência, **estável**: o mesmo link para a mesma prova liberada (o reenvio manda o
  mesmo endereço). Se expirar, informe `expira_em`.
- **Para o WhatsApp fora da janela de 24 horas:** a Meta só deixa mandar modelo aprovado, e o
  botão de link do modelo tem a **base fixa**. A central vai pedir à Meta o modelo
  `prova_liberada` com o botão `https://nexusenglish.com.br/{{1}}`, onde `{{1}}` é o resto do
  link. Por isso o link deve **começar com `https://nexusenglish.com.br/`**. Se o portal usar
  outro endereço, avise antes: o modelo é criado uma vez e não se edita depois de aprovado.

## 8. Estados da prova

| `estado` | Significado | Na central |
|---|---|---|
| `bloqueada` | ainda não liberada | "Liberar e enviar" se `pode_liberar` |
| `liberada` | o aluno já pode fazer | "Reenviar mensagem" |
| `iniciada` | o aluno começou | "Reenviar mensagem" (só o link; nada reinicia) |
| `concluida` | terminou | só leitura, com `resultado` se houver |

```
bloqueada ──(POST liberacoes)──► liberada ──(aluno abre)──► iniciada ──(aluno entrega)──► concluida
```

Estado que a central não conhece aparece como "Estado desconhecido", sem ações. Se o portal
precisar de outros (ex.: `expirada`, `cancelada`), combine antes para a central tratar.

## 9. Segurança e privacidade

- Só o necessário: nada de respostas, áudios, questões ou dados pessoais completos.
- Alunos da unidade Chapecó apenas.
- Registrar no portal cada liberação com `X-Central-Operador-Id`, `X-Central-Operador-Nome`,
  `X-Request-Id` e a `Idempotency-Key`. A central registra o mesmo do lado dela.
- Os pedidos da central **não** trocam senha, não criam aluno e não alteram notas.
- LGPD: a central guarda do portal só o id do aluno, o nome (para mostrar) e o que foi
  liberado e enviado.

## 10. O que a central já tem pronto (para referência do portal)

- **Variáveis** (na Vercel; nada no código): `PORTAL_API_URL` (a base, HTTPS),
  `PORTAL_API_TOKEN`, `PORTAL_API_SEGREDO`. Sem as três, a aba Provas mostra "ligação com o
  portal ainda não configurada" e nenhuma ação funciona.
- **Onde:** aba Provas no painel da conversa do WhatsApp e no cadastro do aluno (coluna Provas).
- **Vínculo:** campo `portalStudentId` no aluno da central, gravado só pelo servidor depois que
  uma pessoa autorizada escolhe e confirma o aluno (nunca automático por nome ou telefone).
- **Permissões:** vincular (recepção e gestão), desvincular (gestão), consultar, liberar e
  reenviar (recepção, gestão e coordenação, esta só nas conversas do setor dela).
- **Mensagem:** dentro da janela de 24 horas, texto com o link, assinado com o nome de quem
  manda. Fora da janela, só pelo modelo `prova_liberada` aprovado (ainda não criado, ver 7).
- **Entrega:** a central diferencia "aceita pelo WhatsApp" (a Meta recebeu) de "entregue" e
  "lida" (eventos do webhook da Meta), e mostra "não saiu" com o motivo quando falha.

## 11. Testes de aceite (o portal deve passar antes de ligar)

1. Assinatura: os dois vetores da seção 3.1 conferem; assinatura errada e momento de 10 min
   atrás são recusados com `401`.
2. Busca com 2 letras: `400`. Busca sem resultado: `200` com lista vazia.
3. `GET /alunos/{id}/provas` devolve `aluno_id` igual ao do caminho.
4. POST com chave nova numa prova bloqueada: `201` com link; repetido com a mesma chave: `200`,
   mesmo `liberacao.id`, nenhuma liberação nova no banco do portal.
5. Dois POST simultâneos com a mesma chave: uma liberação só.
6. POST com chave nova numa prova já liberada: `409 prova_ja_liberada`; numa iniciada:
   `409 prova_em_andamento` (a tentativa do aluno continua intacta).
7. Mesma chave para outra prova: `422 idempotencia_conflito`.
8. `GET .../link` de prova bloqueada: `409 prova_nao_liberada`.
9. Nenhum endpoint devolve questões, respostas, áudios, e-mail ou telefone completos.

Depois disso, a central faz a validação de ponta a ponta com um aluno de teste combinado com a
escola, antes de usar com alunos de verdade.

## 12. Para depois (opcional)

Um **aviso do portal para a central** quando a prova muda de estado (iniciada, concluída,
corrigida), assinado do mesmo jeito, deixaria a aba atualizada sem a pessoa tocar em
"Atualizar". Não é necessário para a primeira versão.
