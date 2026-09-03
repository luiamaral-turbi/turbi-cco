# turbi-cco — Centro de Controle de Operações

Painel ao vivo de Operações da Turbi. **Hospedado 100% pelo Google Apps Script, atrás de login
@turbi.com.br obrigatório** — sem GitHub Pages, sem backend próprio, sem build. Menu lateral
recolhível com 2 páginas hoje:

- **RMR** — os 3 indicadores centrais da Reunião Mensal de Resultados: **COGS (OPEX)**,
  **Indisponibilidade OPS** e **Claim/APV** (reclamação pós-viagem).
- **Indisponibilidade → Visão Geral** — investigação aditiva sobre as mesmas 12 categorias já
  certificadas da aba RMR: visão mensal (gráfico + tabela, igual à RMR), evolução semanal e últimos
  30 dias corridos (cada uma com tabela de categorias por período, coluna "Categoria" congelada ao
  rolar), por responsável (Fabio Carvalho / Lucas Lopes + Ricardo Marguliano — tabela pequena
  editável em `INDISP_CATEGORIA_RESPONSAVEL`, `apps-script/Code.gs`), por modelo e categoria de
  veículo, por idade da frota (histograma), e ranking de POD físico. Nunca chama nem altera
  `getIndisponibilidade()` — endpoint `indisponibilidade-overview`, separado, live.
- **APV → Visão Geral** — investigação cruzando Damage/Wash/POD: tendência semanal, idade do
  carro, dias desde lavagem, categoria/modelo de veículo, produto, impacto na nota, ranking de POD
  físico e quebra do bucket "Other". Endpoint `claim-overview`, live (recalcula por período).
- **APV → Damage / Wash / POD** — drill-down analítico dos 3 componentes de Claim/APV: Pareto de
  motivos em 2 níveis (grupo + tipo) e nuvem de palavras dos comentários, com filtro de período e
  cross-filter (clicar numa barra do Pareto filtra os outros gráficos da página). Mesmo padrão pros
  3, parametrizado por `component` (`apps-script/Code.gs`, `CLAIM_DETAIL_COMPONENTS`) e por
  `apvIds()` no `index.html`.
  Uma 4ª área, **"Report Open"** (avaliação na abertura do carro), está no roadmap mas pausada —
  ainda não tem fonte de dado definida.

## Arquitetura (migrada em 2026-08-27 — GitHub Pages desativado em 2026-09-03)

```
┌──────────────────────────────────────────────────────────────────┐
│  Google Apps Script — implantação única, login @turbi.com.br     │
│  obrigatório (webapp.access = DOMAIN)                             │
│                                                                    │
│  doGet(e) sem ?endpoint= → casca HTML mínima (HtmlService) que    │
│  chama getPageContent() via google.script.run e escreve o         │
│  resultado com document.write() — o HTML completo (index.html)    │
│  vive como string em IndexHtml.gs, NUNCA passado pro HtmlService  │
│  (ver "Por que não HtmlService direto" abaixo).                   │
│                                                                    │
│  Front-end (dentro da página já carregada) busca todo dado via    │
│  google.script.run → apiCall(endpoint, extra) → BigQuery.         │
│  Google Sheets (COGS/Metas) continua via fetch() direto do        │
│  navegador (docs.google.com, domínio externo — sem o problema     │
│  de CORS que afeta fetch() pra própria implantação).               │
└──────────────────────────────────────────────────────────────────┘
```

- **Indisponibilidade e Claim/APV**: consultados no BigQuery por `apps-script/Code.gs`, autorizado
  com a conta Google do responsável pelo painel — sem service account, sem credencial armazenada em
  lugar nenhum.
- **COGS e Metas**: lidos direto do navegador via export CSV público do Google Sheets
  (`gviz/tq?tqx=out:csv`), sem autenticação — parsing feito em `index.html` (`getCogsData()` e
  `getMetasData()`). Continua funcionando normalmente dentro do sandbox do Apps Script (domínio
  externo, não sofre do problema de CORS descrito abaixo).
- **Hospedagem**: só o Apps Script — **GitHub Pages foi desativado em 2026-09-03**
  (`gh api -X DELETE repos/luiamaral-turbi/turbi-cco/pages`). Não existe mais nenhuma cópia pública
  do painel — só quem tem login @turbi.com.br acessa.
- **Navegação**: menu lateral recolhível (`localStorage` guarda a preferência), roteamento por hash
  (`#rmr`, `#apv/damage`) — cada página busca seu próprio dado, só quando visitada pela primeira
  vez ou quando o botão **"🔄 Atualizar dados"** é clicado com ela ativa.

Todas as fórmulas replicam exatamente o painel local original (FastAPI + BigQuery), que foi a versão
validada numericamente contra o dashboard oficial antes de qualquer migração. Ver
`apps-script/Code.gs` para os comentários com a origem de cada fórmula.

### Por que não `HtmlService` direto pra servir a página (não repetir)

`HtmlService.createHtmlOutputFromFile()` e `HtmlService.createHtmlOutput(string)` corrompem HTML
grande/complexo servido como resposta de Web App — cortam qualquer linha no primeiro `//` que
encontram, mesmo dentro de uma string/URL (`https://...` virava `https:`). Bug real do próprio
mecanismo de resposta HTTP do `HtmlService`, não do jeito de ler/guardar o conteúdo — ver
`CHANGELOG.md` (entradas de 2026-08-26) pro histórico completo da investigação. Solução: o HTML
inteiro vive como string pura em `IndexHtml.gs` (arquivo `.gs`, nunca `.html` do projeto — gerado
automaticamente a partir do `index.html` da raiz a cada `clasp push`), e a casca do `doGet()` é
pequena o bastante pra nunca esbarrar nesse bug.

### Por que `google.script.run` em vez de `fetch()` pras chamadas de dado (não repetir)

Uma vez que a própria página passa a ser servida pelo Apps Script (dentro do iframe sandbox que o
`HtmlService` usa), `fetch()` de dentro dela pra qualquer URL dessa mesma implantação pode ser
bloqueado por CORS — `ScriptApp.getService().getUrl()` devolve um formato de URL diferente do que o
navegador usa pra carregar a página, e o navegador trata como origens diferentes. `google.script.run`
não depende de montar nenhuma URL — não sofre disso. Ver `CHANGELOG.md` 2026-08-26/27 pro histórico.

### Funções chamadas por `google.script.run` não podem terminar em `_`

O Apps Script trata funções terminadas em `_` como privadas e as esconde do `google.script.run` do
lado cliente (erro real visto em produção: `"apiCall_ is not a function"`). `apiCall` e
`getPageContent` (as duas únicas chamadas pelo front-end) não têm `_` de propósito — todas as
outras funções internas do `Code.gs` mantêm o `_` normalmente.

### Privacidade da nuvem de palavras (não-negociável)

A nuvem de palavras (Damage/Wash/POD — comentários de clientes) **nunca** recebe texto bruto no
navegador — toda a tokenização, remoção de stopwords/acento, e o corte de frequência mínima
(`HAVING n >= 3`) acontecem dentro do SQL do endpoint `claim-detail`, em `apps-script/Code.gs`
(tokenização via `REGEXP_EXTRACT_ALL`, não `SPLIT` — ver `CHANGELOG.md` pro bug que isso corrigiu).
Qualquer componente novo (Report Open) deve seguir o mesmo padrão — nunca mandar comentário bruto
pro cliente. Isso vale mesmo o painel agora exigindo login: continua sendo boa prática de LGPD, não
só uma exigência de site público.

## Rodar/testar localmente

**Não dá pra abrir `index.html` direto no navegador local** — o front-end depende de
`google.script.run`, que só existe quando a página é servida pelo próprio Apps Script (não é
injetado num arquivo aberto localmente nem servido por qualquer outro host). Pra testar mudanças
sem tocar a implantação real em produção, usar o canal `/dev` do projeto (ver seção abaixo).

## Como reimplantar o Apps Script (depois de editar `apps-script/Code.gs` ou `index.html`)

Só existe **uma implantação relevante**: a logada (`AKfycbzERhfFI7swj5UwzwsSi208LAiV8522FyY6ZYsXvaSghRyZiRzqeXOYCz-lobKrPDLBSQ`,
`webapp.access = DOMAIN`, `executeAs = USER_DEPLOYING`).

### Via `clasp` (evita corrupção de copiar/colar)

Configurado uma vez (`apps-script/.clasp.json`, local, fora do git — contém o `scriptId`) — precisa
de `npm install` (instala `@google/clasp` em `node_modules/`, também fora do git) e, na rede
corporativa, da variável `NODE_EXTRA_CA_CERTS` apontando pro mesmo `corporate_ca.pem` usado pelo
gcloud (ver `CLAUDE.md` da raiz do workspace).

1. Editar `apps-script/Code.gs` e/ou `index.html` normalmente.
2. Gerar as duas cópias que o `clasp push` realmente sobe (nenhuma delas é editada à mão — sempre
   geradas de novo a partir da fonte de verdade):
   ```bash
   cp apps-script/Code.gs "apps-script/Código.gs"   # nome legado do arquivo lá, não vale renomear
   node -e "
     const fs = require('fs');
     const html = fs.readFileSync('index.html', 'utf8');
     fs.writeFileSync('apps-script/IndexHtml.gs', 'var INDEX_HTML_CONTENT = ' + JSON.stringify(html) + ';\n');
   "
   ```
3. `clasp push --force` de dentro de `apps-script/` — sobe `appsscript.json` + `Código.gs` +
   `IndexHtml.gs` pro "HEAD" do projeto.
4. **Validar pelo canal `/dev` antes de tocar a implantação real** — dá pra chamar qualquer endpoint
   sem passar pelo login/navegador, usando o token OAuth que o `clasp` já guarda:
   ```bash
   TOKEN=$(node -e "console.log(JSON.parse(require('fs').readFileSync(process.env.USERPROFILE + '/.clasprc.json','utf8')).tokens.default.access_token)")
   curl -H "Authorization: Bearer $TOKEN" "https://script.google.com/macros/s/AKfycbwG2zTqTZNgXwAraq4RkocUPgm_zl3nvNRMuvHPnwrz/dev?endpoint=page-content"
   ```
   Comparar o `html` devolvido (`JSON.parse(...).html`) com o `index.html` local via `===` — não só
   inspeção visual, é a única forma de garantir que não sobrou nenhuma diferença.
5. `clasp deploy -i AKfycbzERhfFI7swj5UwzwsSi208LAiV8522FyY6ZYsXvaSghRyZiRzqeXOYCz-lobKrPDLBSQ -d
   "descrição"` — só depois do passo 4 confirmado.
6. Testar no navegador de verdade (login @turbi.com.br): `google.script.run` não dá pra validar só
   por `curl`/`/dev` — qualquer mudança de UI/interação precisa de confirmação visual real.

### ⚠️ Armadilha real — acesso ("quem pode acessar") é do manifesto, não da implantação

O campo `webapp.access` do `appsscript.json` é aplicado na implantação que `clasp deploy -i <id>`
tocar, sobrescrevendo o que ela já tinha — **não é uma config fixa por implantação**. Sempre
conferir que está `"DOMAIN"` antes de rodar `clasp deploy -i <id>` na implantação logada.

### Implantações órfãs (limpeza pendente, não fazer sem confirmar antes)

Existem hoje **3 implantações além da logada em uso**, todas herdadas da migração:

- `AKfycbzS-a8q7WFtFB3KKithEPafj_pYKO8Oa4sjm41zneTLyfrHfKRwukBcsqWDGlJe7GdYHw` — era a implantação
  **pública** (`ANYONE_ANONYMOUS`) que o GitHub Pages usava. Com o GitHub Pages desativado
  (2026-09-03), **nada mais usa essa implantação — mas ela continua no ar, pública, servindo dado
  de BigQuery sem login pra quem tiver a URL**. Isso é uma exposição real que só some quando essa
  implantação for apagada ou trocada pra `DOMAIN`. Pendente de confirmação antes de mexer (deploy
  já causou 2 quedas de produção acidentais nesta migração — sempre conferir `webapp.access` antes).
- `AKfycbzVWrp_hLUAHUp3dOwM37Wq9PKrTt0dNwtBRTeC22vOqMMtza91JNK4HmAF_DY0EeQuew` — implantação extra
  criada por engano durante a tentativa de hospedagem logada (2026-08-26). Nunca usada por nada.
- `AKfycbwG2zTqTZNgXwAraq4RkocUPgm_zl3nvNRMuvHPnwrz @HEAD` — canal de teste (`/dev`), não é uma
  implantação de verdade, não precisa de limpeza.

## Se algo quebrar — checklist

- **Página fica em branco ou dá erro de sintaxe no console logo ao abrir**: histórico de bugs reais
  do `HtmlService` — ver `CHANGELOG.md` (2026-08-26) antes de investigar do zero.
- **"Falha ao atualizar: Cannot read properties of undefined"**: BigQuery já mostrou devolver 0
  linhas por um instante (cold start do job) — as 4 chamadas de dado já fazem 1 retentativa
  automática nesse caso (ver `withEmptyRetry_` em `index.html`); se persistir depois de clicar
  "Atualizar dados" de novo, aí sim é um problema de dado de verdade.
- **`google.script.run.<algo> is not a function`**: a função do lado servidor termina em `_` —
  Apps Script esconde funções assim do `google.script.run`. Renomear sem o `_` (ver seção acima).
- **COGS/Metas com erro "planilha não encontrada" ou "linha não encontrada"**: a planilha de origem
  (`103v2gA7a24QAT73yXbyTnSdWxZjAsh4bZOMzkdHEghg`) mudou de estrutura — os nomes de aba, o marcador
  `"COGS./VHC"` ou os rótulos de meta em `index.html` precisam ser conferidos contra a planilha atual.
- **Números batendo errado**: nunca ajustar arredondamento/fórmula direto no `index.html` ou no
  `Code.gs` sem revalidar contra os números já certificados — ver `CHANGELOG.md` e a nota "Glossário
  e Fórmulas" no Obsidian (`Notas Obsidian/RMR OPS/`) para o histórico de validação.

## Limitações conhecidas

- COGS tem `meses` fixo em 7 (Jan–Jul) — precisa ser estendido manualmente no código conforme o ano
  avança (`COGS_MONTH_STARTS`/`COGS_MESES` em `index.html`).
- Mês corrente sempre aparece parcial (a consulta ao BigQuery vai até "ontem").
- Estratificação de Claim: **Damage, Wash e POD** implementados (Pareto + nuvem de palavras). Wash
  tem só 1 grupo de nível 1 na taxonomia oficial ("Limpeza e cheiro") — o Pareto de nível 1 dele
  sempre mostra uma barra só, o de nível 2 (tipo) é o que importa.
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
