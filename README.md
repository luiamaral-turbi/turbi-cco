# turbi-cco — Centro de Controle de Operações

Painel ao vivo de Operações da Turbi. Site estático, sem backend próprio, sem build — abrir
`index.html` já é o produto final. Tem um menu lateral recolhível com 2 páginas hoje:

- **RMR** — os 3 indicadores centrais da Reunião Mensal de Resultados: **COGS (OPEX)**,
  **Indisponibilidade OPS** e **Claim/APV** (reclamação pós-viagem).
- **Indisponibilidade → Visão Geral** — investigação aditiva sobre as mesmas 12 categorias já
  certificadas da aba RMR: por responsável (Fabio Carvalho / Lucas Lopes + Ricardo Marguliano —
  tabela pequena editável em `INDISP_CATEGORIA_RESPONSAVEL`, `apps-script/Code.gs`), por modelo e
  categoria de veículo, por idade da frota, por POD físico, e Pareto de sub-motivo
  (`vsd_status`/`vsd_substatus`, mesma view). Nunca chama nem altera `getIndisponibilidade()` —
  endpoint `?endpoint=indisponibilidade-overview`, separado, live.
- **APV → Visão Geral** — investigação cruzando Damage/Wash/POD: tendência semanal, idade do
  carro, dias desde lavagem, categoria/modelo de veículo, produto, impacto na nota, ranking de POD
  físico e quebra do bucket "Other". Endpoint `?endpoint=claim-overview`, live (recalcula por
  período).
- **APV → Damage / Wash / POD** — drill-down analítico dos 3 componentes de Claim/APV: Pareto de
  motivos em 2 níveis (grupo + tipo) e nuvem de palavras dos comentários, com filtro de período e
  cross-filter (clicar numa barra do Pareto filtra os outros gráficos da página). Mesmo padrão pros
  3, parametrizado por `component` (`apps-script/Code.gs`, `CLAIM_DETAIL_COMPONENTS`) e por
  `apvIds()` no `index.html`.
  Uma 4ª área, **"Report Open"** (avaliação na abertura do carro), está no roadmap mas pausada —
  ainda não tem fonte de dado definida.

## Arquitetura

```
                         ┌───────────────────────────┐
  Google Sheets  ───CSV──▶  index.html (navegador)   │◀── GitHub Pages (hospedagem)
  (COGS + Metas)          │  parse client-side        │
                         │                            │
  BigQuery       ───JSON──▶  Google Apps Script        │
  (via BigQuery           (Web App, apps-script/       │
   Advanced Service)       Code.gs — cópia de           │
                          referência neste repo)        │
                         └───────────────────────────┘
```

- **COGS e Metas**: lidos direto do navegador via export CSV público do Google Sheets
  (`gviz/tq?tqx=out:csv`), sem autenticação — parsing feito em `index.html` (funções `getCogsData()`
  e `getMetasData()`).
- **Indisponibilidade e Claim/APV**: consultados no BigQuery por um **Google Apps Script publicado
  como Web App** (`apps-script/Code.gs`), autorizado com a conta Google do responsável pelo painel —
  sem service account, sem credencial armazenada em lugar nenhum. O código-fonte aqui é só a cópia
  de referência; a implantação real é feita manualmente em [script.google.com](https://script.google.com).
- **Hospedagem — 2 URLs em paralelo (desde 2026-08-26)**:
  - **GitHub Pages** (pública, sem login): `index.html` direto da raiz da branch `main`
    (repositório público — Pages em repo privado exige GitHub Pro, ver `CHANGELOG.md`). Sem
    servidor, sem build — só `git push`.
  - **Google Apps Script, implantação restrita a @turbi.com.br** (com login): a MESMA
    `apps-script/Code.gs` também serve a página quando a URL do Web App é acessada sem
    `?endpoint=` (ver `doGet()`) — mas **não** via `HtmlService` direto com o HTML inteiro (isso
    corrompe o conteúdo, ver "Armadilha real #2" mais abaixo). `doGet()` devolve uma casca mínima
    que busca o conteúdo real via `fetch(?endpoint=page-content)`, uma chamada JSON comum — o
    conteúdo (`INDEX_HTML_CONTENT`, gerado a partir do `index.html` deste repo, sem edição) viaja
    pelo mesmo mecanismo `ContentService` que toda a API já usa. Isso é uma **implantação
    separada** do mesmo script, com acesso "Qualquer pessoa dentro de turbi.com.br" — a
    implantação pública original (usada pelas chamadas `?endpoint=...` e pelo GitHub Pages)
    continua existindo, sem mudar nada. Ver "Como reimplantar" abaixo.
- **Navegação**: menu lateral recolhível (`localStorage` guarda a preferência), roteamento por hash
  (`#rmr`, `#apv/damage`) — cada página busca seu próprio dado, só quando visitada pela primeira
  vez ou quando o botão **"🔄 Atualizar dados"** é clicado com ela ativa (o botão atualiza só a
  página aberta no momento, nunca as duas de uma vez).

Todas as fórmulas replicam exatamente o painel local original (FastAPI + BigQuery), que foi a versão
validada numericamente contra o dashboard oficial antes de qualquer migração. Ver
`apps-script/Code.gs` para os comentários com a origem de cada fórmula.

### Privacidade da nuvem de palavras (não-negociável)

O site tem uma versão pública sem login (GitHub Pages) ativa em paralelo à versão logada — a regra
abaixo vale pras duas, sem exceção. A nuvem de palavras (Damage/Wash/POD — comentários de clientes)
**nunca** recebe texto bruto no navegador — toda a tokenização, remoção de stopwords/acento, e o
corte de frequência mínima (`HAVING n >= 3`) acontecem dentro do SQL do endpoint `claim-detail`, em
`apps-script/Code.gs` (tokenização via `REGEXP_EXTRACT_ALL`, não `SPLIT` — ver `CHANGELOG.md` pro
bug que isso corrigiu). Qualquer componente novo (Report Open) deve seguir o mesmo padrão — nunca
mandar comentário bruto pro cliente.

## Rodar/testar localmente

Não há build. Basta abrir `index.html` num navegador (ou servir com qualquer servidor estático,
ex. `npx serve .`), desde que a constante `APPS_SCRIPT_URL` no topo do `<script>` esteja apontando
pra uma implantação válida do Apps Script.

## Como reimplantar o Apps Script (depois de editar `apps-script/Code.gs` ou `index.html`)

### Via `clasp` (2026-08-26 em diante — evita corrupção de copiar/colar)

Configurado uma vez (`apps-script/.clasp.json`, local, fora do git — contém o `scriptId`) — precisa
de `npm install` (instala `@google/clasp` em `node_modules/`, também fora do git) e, na rede
corporativa, da variável `NODE_EXTRA_CA_CERTS` apontando pro mesmo `corporate_ca.pem` usado pelo
gcloud (ver `CLAUDE.md` da raiz do workspace).

1. Editar `apps-script/Code.gs` e/ou `index.html` normalmente.
2. Gerar os artefatos que o projeto Apps Script realmente usa (todos fora do git — só existem como
   artefato de push, nunca editar direto neles):
   ```bash
   cp apps-script/Code.gs "apps-script/Código.gs"   # nome legado do arquivo de código lá, não vale renomear
   node -e "const fs=require('fs'); const html=fs.readFileSync('index.html','utf8'); fs.writeFileSync('apps-script/IndexHtml.gs', 'var INDEX_HTML_CONTENT = ' + JSON.stringify(html) + ';\n');"
   ```
   **Nunca** criar/usar um arquivo `.html` dentro do projeto Apps Script pra guardar a página — ver
   a "Armadilha real" mais abaixo, é a causa de uma investigação inteira de um bug de sintaxe que
   só existia em produção.
3. `clasp push --force` de dentro de `apps-script/` — sobe os arquivos (`appsscript.json`,
   `Código.gs`, `IndexHtml.gs`) pro "HEAD" do projeto (rascunho, ainda não visível pra quem acessa
   via URL de implantação).
4. **Redeploy nas 2 implantações, uma de cada vez** (`clasp deployments` lista os IDs):
   ```bash
   clasp deploy -i <ID_DA_IMPLANTACAO_PUBLICA> -d "descrição"
   clasp deploy -i <ID_DA_IMPLANTACAO_LOGADA> -d "descrição"
   ```
5. **Validar antes de confiar**: `curl` no `?endpoint=page-content` da implantação pública, dar
   `JSON.parse()` no resultado e comparar `.html` contra o `index.html` da raiz — têm que ser
   **idênticos**. Só o conteúdo sendo igual garante que o `HtmlService` não mutilou nada no meio do
   caminho (ver "Armadilha real" abaixo pro porquê disso importar).

### ⚠️ Armadilha real #2 — `HtmlService` corta linha no primeiro `//`, mesmo dentro de string

Nunca, em hipótese nenhuma, usar `HtmlService.createHtmlOutputFromFile(...)` ou
`HtmlService.createHtmlOutput(stringGrande)` pra servir o conteúdo real da página (`index.html`,
~114KB). Achado ao vivo, depois de uma investigação longa: esse mecanismo corta **qualquer linha
no primeiro `//` que encontrar**, mesmo quando o `//` é parte de uma URL dentro de uma string —
`` const url = `https://docs.google.com/...` `` virava `` const url = `https: `` (crase nunca
fechada), quebrando a sintaxe de tudo que vem depois até a próxima crase do arquivo. Isso NÃO É
sobre ler de arquivo especificamente — `createHtmlOutput()` com uma string direto tem o mesmo
problema. É por isso que a página é servida assim, desde 2026-08-26:
- `doGet()` sem `?endpoint=` devolve só uma casca HTML **minúscula e fixa** (sem nenhum `//`
  dentro), que faz `fetch(?endpoint=page-content)` e escreve o resultado com `document.write()`.
- O conteúdo real (`INDEX_HTML_CONTENT`, de `IndexHtml.gs`) viaja como JSON comum via
  `ContentService` — o mesmo mecanismo que TODOS os outros endpoints já usam sem problema nenhum,
  em qualquer tamanho de payload.
- **Nunca** tentar "simplificar" isso voltando a servir `index.html` direto via `HtmlService` — já
  foi tentado de 3 formas diferentes (arquivo `.html`, string em `.gs`, base64) e todas quebram do
  mesmo jeito, porque o problema é como o Apps Script serve a RESPOSTA HTTP de um `HtmlOutput`, não
  como o conteúdo é armazenado.

### ⚠️ Armadilha real (já aconteceu, causou uma queda real do GitHub Pages)

O acesso ("quem pode acessar") de uma implantação Web App vem do campo `webapp.access` do
**mesmo** `appsscript.json` pra TODAS as implantações — ele não é por implantação, é do
snapshot de versão. Isso significa: **antes de rodar `clasp deploy -i <id>`, o `webapp.access` em
`apps-script/appsscript.json` precisa estar com o valor certo pra AQUELA implantação**, senão o
deploy sobrescreve o acesso dela com o que estiver no arquivo:
- Implantação pública (usada pelo GitHub Pages, `fetch()` sem login): `"access": "ANYONE_ANONYMOUS"`.
- Implantação logada (`@turbi.com.br`): `"access": "DOMAIN"`.

Fluxo seguro pra atualizar as duas: deixar `"ANYONE_ANONYMOUS"` → `push` → `deploy -i <pública>` →
trocar pra `"DOMAIN"` → `push` → `deploy -i <logada>`. Sempre conferir com `curl` (ou abrir a URL
pública direto) que a implantação pública continua respondendo JSON sem pedir login depois de
qualquer deploy.

### Via editor do Apps Script (manual, fallback só pro `Código.gs`)

1. Abrir o projeto em [script.google.com](https://script.google.com) (mesma conta Google usada na
   implantação atual).
2. Colar o conteúdo atualizado de `apps-script/Code.gs` no arquivo **`Código`** do editor
   (substituindo tudo), `Ctrl+S`. Copiar da visualização **"raw"** do GitHub
   (`raw.githubusercontent.com/luiamaral-turbi/turbi-cco/main/...`), nunca da visualização com
   realce de sintaxe — colar de lá já corrompeu um caractere de aspas invertidas (crase) uma vez.
3. **Pro conteúdo da página (`index.html`), NÃO existe fallback manual seguro** — colar o HTML
   direto num arquivo `.html` do projeto reproduz a "Armadilha real #2" abaixo (o `HtmlService`
   corta linha no primeiro `//`, mesmo sem nenhum erro de copiar/colar). É obrigatório rodar o
   comando `node` do passo 2 da seção acima pra gerar `apps-script/IndexHtml.gs`, e colar o
   CONTEÚDO DESSE ARQUIVO GERADO (uma única linha `var INDEX_HTML_CONTENT = "...";`) num arquivo
   **`.gs`** do projeto chamado `IndexHtml` — nunca um arquivo `.html`.
4. Rodar a função `testeManual` pelo menos uma vez e conferir o **Registro de execução** — os números
   devem bater com os já certificados antes de seguir. Isso inclui `getClaimDetail` (Damage): a soma
   de `count` de todos os grupos deve ser da mesma ordem de grandeza do `damage_n` de `getClaimApv()`
   (não igual — um conta itens, o outro reservas distintas), e nenhuma das palavras da nuvem deve
   parecer placa/telefone/nome.
5. `Implantar → Gerenciar implantações → editar (ícone de lápis) na implantação desejada → Nova
   versão → Implantar`. **Importante**: reimplantar sem criar uma "Nova versão" mantém o código
   antigo no ar. Repetir pra CADA implantação (pública e logada) — não são a mesma.
6. Conferir em **"Quem pode acessar"** de CADA implantação antes de sair — pública = "Qualquer
   pessoa"; logada = "Qualquer pessoa dentro de turbi.com.br". Editar uma implantação existente
   (em vez de criar nova versão) preserva o acesso configurado nela; só o `clasp deploy` tem o
   comportamento de sobrescrever com o manifesto (ver armadilha acima).

## Se algo quebrar — checklist

- **Página carrega mas fica em "Falha ao atualizar"**: abrir o Console do navegador (F12) — a
  mensagem de erro identifica qual das 6 fontes falhou (Indisponibilidade, Claim/APV, nacional ou
  Campinas, COGS, Metas).
- **Erro mencionando `APPS_SCRIPT_URL`**: a URL do Web App mudou (nova implantação) ou expirou —
  pegar a URL atual em `script.google.com → Implantar → Gerenciar implantações` e atualizar a
  constante no topo do `<script>` em `index.html`.
- **Indisponibilidade/Claim retornam página de login do Google em vez de JSON (GitHub Pages
  quebrado)**: a implantação PÚBLICA caiu pra acesso restrito — normalmente porque um
  `clasp deploy -i <id>` foi rodado com `appsscript.json` no estado errado (ver "Armadilha real"
  acima). Corrigir: `webapp.access` → `"ANYONE_ANONYMOUS"` → `clasp push` → `clasp deploy -i
  <ID_DA_IMPLANTACAO_PUBLICA>` → confirmar com `curl` que volta JSON sem redirecionar pra
  `accounts.google.com`.
- **COGS/Metas com erro "planilha não encontrada" ou "linha não encontrada"**: a planilha de origem
  (`103v2gA7a24QAT73yXbyTnSdWxZjAsh4bZOMzkdHEghg`) mudou de estrutura — os nomes de aba, o marcador
  `"COGS./VHC"` ou os rótulos de meta em `index.html` precisam ser conferidos contra a planilha atual.
- **Números batendo errado**: nunca ajustar arredondamento/fórmula direto no `index.html` ou no
  `Code.gs` sem revalidar contra os números já certificados — ver `CHANGELOG.md` e a nota "Glossário
  e Fórmulas" no Obsidian (`Notas Obsidian/RMR OPS/`) para o histórico de validação.
- **URL logada (@turbi.com.br) pede login em loop, ou mostra página em branco/erro do Apps Script**:
  confirmar que o acesso da implantação está mesmo "Qualquer pessoa dentro de turbi.com.br" (não
  "Somente eu"). Se aparecer um aviso de que o app não foi verificado pelo Google, é esperado pra
  Web Apps internas — "Acessar [Avançado] → Acessar [projeto] (não seguro)".
- **`SyntaxError: Unexpected identifier` no console, em qualquer palavra, mudando de lugar a cada
  deploy**: é a "Armadilha real #2" abaixo — algo no fluxo voltou a servir `index.html` via
  `HtmlService` direto (arquivo `.html` do projeto, ou `createHtmlOutput()` com o HTML inteiro).
  Conferir `apps-script/Código.gs` — o `doGet()` sem `?endpoint=` tem que devolver só a casca
  minúscula, nunca o HTML completo; o conteúdo completo só pode ser servido via
  `?endpoint=page-content` (JSON/`ContentService`).

## Limitações conhecidas (herdadas do painel original, não mudou nesta migração)

- COGS tem `meses` fixo em 7 (Jan–Jul) — precisa ser estendido manualmente no código conforme o ano
  avança (`COGS_MONTH_STARTS`/`COGS_MESES` em `index.html`).
- Mês corrente sempre aparece parcial (a consulta ao BigQuery vai até "ontem").
- Estratificação de Claim: **Damage, Wash e POD** implementados (Pareto + nuvem de palavras). Wash
  tem só 1 grupo de nível 1 na taxonomia oficial ("Limpeza e cheiro") — o Pareto de nível 1 dele
  sempre mostra uma barra só, o de nível 2 (tipo) é o que importa.
- Pendente (próxima rodada, não esta): ranking de PODs (locais físicos, campo `PodName`) com mais
  reclamações no total, e quebra do bucket genérico "Other" de Damage (~30% dos itens) usando os
  comentários específicos desse grupo.
- "Report Open" (avaliação na abertura do carro) está no menu como item desabilitado — sem fonte de
  dado localizada ainda no BigQuery (ver `RMR OPS - Arquitetura e Decisões Técnicas.md` no Obsidian).
- Layout pensado para desktop — o menu lateral vira drawer no mobile, mas o resto do
  mobile-first (tamanhos de gráfico, tabelas) ainda não foi feito.
- `total_count` do drill-down de Damage conta **itens** reportados, não reservas distintas — uma
  mesma reserva com 2 itens de Damage conta 2x. Não confundir com o `%` de Damage do RMR (que conta
  reservas distintas via `COUNT(DISTINCT bookingId)`).

## Documentação relacionada

- `apps-script/Code.gs` — código do Web App, com o SQL e os comentários de origem de cada fórmula.
- `CHANGELOG.md` — histórico de mudanças de arquitetura e fórmulas.
- `Notas Obsidian/RMR OPS/` (fora deste repo) — base de conhecimento completa: decisões de
  arquitetura, glossário/fórmulas validadas, e a nota "Runbook" com o mesmo checklist operacional
  acima em formato mais informal.
