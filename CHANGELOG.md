# Changelog

Formato: data + o que mudou e por quê. Foco em decisões de arquitetura e fórmulas — não é um
substituto do histórico de commits do Git, é um resumo pensado pra quem for dar manutenção sem
querer ler o diff inteiro.

## 2026-08-26 (2) — Segunda via de hospedagem: Apps Script com login @turbi.com.br

- **Pedido**: migrar do GitHub Pages (público, sem login) pra hospedagem no próprio Google Apps
  Script, "pra ficar logado" — restringir o acesso ao painel a contas @turbi.com.br.
- **Decisão de arquitetura**: em vez de substituir o GitHub Pages, `doGet()` em `Code.gs` ganhou um
  branch novo — sem `?endpoint=` na URL, serve a própria página via
  `HtmlService.createHtmlOutputFromFile('index')`; com `?endpoint=`, continua exatamente a API JSON
  de sempre. O arquivo `index` colado dentro do projeto Apps Script é o MESMO `index.html` deste
  repo, sem edição nenhuma — a página usa a constante `APPS_SCRIPT_URL` de sempre pra buscar dado,
  então funciona igual não importa qual URL a serviu.
- **Duas implantações do mesmo script, acessos diferentes** (não dá pra ter os dois níveis de acesso
  numa implantação só): a implantação pública existente ("Qualquer pessoa") não muda — continua
  sendo a fonte de dados do GitHub Pages, que fica no ar sem alteração até o Lui validar a versão
  nova. Uma implantação NOVA ("Qualquer pessoa dentro de turbi.com.br") passa a servir a página
  logada — mesmo código, URL própria. Ver `README.md` pro passo a passo completo de configuração
  (precisa ser feito manualmente no editor do Apps Script, como sempre).
- **Por que a API continua pública mesmo na versão logada**: a página logada busca dado na MESMA
  implantação pública de sempre (não na implantação restrita) — evita qualquer incerteza sobre se
  um `fetch()` carrega a sessão do Google corretamente pra uma implantação com acesso restrito
  (ponto que já tinha gerado confusão numa migração anterior, ver entrada de 2026-08-21/22). Só o
  carregamento da página em si (navegação de topo, não fetch) passa pelo login real do Google.
- Sem mudança nenhuma nas fórmulas/cálculos — puramente uma segunda via de hospedagem/acesso.

## 2026-08-26 — APV → Visão Geral ganha evolução semanal (upgrade) + últimos 30 dias + Campinas

- **Pedido**: replicar em Claim/APV o mesmo tratamento de evolução temporal já entregue em
  Indisponibilidade → Visão Geral — versão simples (2 gráficos fixos, sem drill-down interativo),
  com quebra Geral/Campinas. Fora de escopo por decisão do Lui: as páginas de drill-down
  Damage/Wash/POD (Pareto + nuvem de palavras) não ganham dimensão temporal nesta rodada.
- **"Tendência semanal" trocou de `trendLineChart` pra `stackedChart` com meta** — a seção antiga só
  tinha Damage+Wash como linhas soltas, sem POD e sem comparação com meta. A nova usa o mesmo padrão
  que a aba RMR já usa pro gráfico mensal de Claim/APV (Wash+Damage+POD empilhados + linha de Meta
  APV Ops), só que por semana — ganho de brinde: POD e meta chegaram junto, não só a granularidade.
- **Nova seção "Últimos 30 dias corridos"** — mesmo componente, granularidade diária, janela fixa
  hoje-30..ontem, independente do filtro de período da página (mesma regra de Indisponibilidade).
- **Bloco Campinas** — a Visão Geral de Claim não tinha NENHUMA quebra geográfica até agora; virou
  a 1ª seção da página com essa quebra (só a evolução semanal/últimos 30 dias duplicam, o resto da
  página — categorias, modelo, idade, produto, nota, ranking de POD, nuvem "Other", priorização —
  continua só nacional, por escopo explícito).
- **Bug de colisão de rótulo corrigido em `stackedChart`** — mesmo bug já corrigido em `lineBarChart`
  pra Indisponibilidade (barras/valores colados quando há 30+ pontos): a largura do SVG agora cresce
  com o número de barras (`Math.max(640, ...)`), com scroll horizontal no container. Gráficos
  existentes (COGS, RMR, ≤9 pontos) não mudam de tamanho.
- Backend: novo helper `claimRatesSeries_()` (mesma ideia do `indispBqDiretoSeries_` de
  Indisponibilidade) — query genérica de taxas por qualquer granularidade de data, usada tanto pra
  semanal quanto pra últimos 30 dias, sem duplicar SQL. `getClaimOverview()` e
  `claimOverviewBaseCte_()` ganharam parâmetro `city` opcional (reaproveitando o mesmo `LEFT JOIN`
  com `vw_frota_historico_contabil` que `getClaimApv()`/`getClaimDetail()` já usavam pra achar a
  cidade do POD). `getClaimApv()` (fórmula oficial certificada) não foi tocada.

## 2026-08-23 (3) — Indisponibilidade → Visão Geral: reconstrução 100% + tabelas da APV

- **Rejeitado e refeito do zero**: a 1ª versão da Visão Geral de Indisponibilidade (hero de
  "achado principal" + narrativa por seção + lista de priorização, no mesmo estilo do artifact
  "Raio-X do Claim") foi considerada amadora e sem valor agregado. Pedido explícito: reaproveitar
  os componentes já validados da aba RMR (hero cards, `lineBarChart` com meta, `stackedChart`,
  heatmap) em vez de um tratamento editorial — abandonada a narrativa automática **só nesta
  página** (a APV manteve o formato, que não foi criticado nesse ponto).
- **Causa raiz real encontrada nas tabelas da APV** (não só gosto): todas as `<table>` novas das
  duas páginas Visão Geral tinham esquecido a classe `dtbl`/`cogswide` de que o CSS do site inteiro
  depende — sem ela, o navegador renderiza com estilo cru padrão. Corrigido em todas as 6 tabelas
  da APV, com cor condicional (`cc-good`/`cc-bad`) vs. a taxa geral do período.
- **Indisponibilidade — estrutura nova**: hero cards (mês/semana mais recente, YTD do período,
  pior semana) → evolução semanal (`lineBarChart` + meta) → **últimos 30 dias corridos** (janela
  fixa hoje-30..ontem, independente do filtro de período da tela — pensado pra ver tendência
  recente) → por categoria (`stackedChart` + tabela com heatmap) → top modelos → por categoria de
  veículo → ranking de POD físico → Pareto de sub-motivo (mantido, nacional). Removidos: hero de
  achado narrativo, frases automáticas por seção, lista de priorização, seção "por responsável".
- **Quebra Geral/Campinas em TODAS as seções**, replicando o padrão `.campinas-block` que a aba
  RMR já usa — `getIndisponibilidadeOverview(startDate, endDate, city)` ganhou parâmetro `city`
  opcional (mesmo padrão de `getIndisponibilidade()`; a view já tem `podCity` como coluna direta,
  sem precisar de join). O front-end chama o endpoint 2x por carregamento (sem cidade + Campinas),
  em paralelo via `Promise.all`.
- Novo helper `metaParaData_()` no front-end: resolve, pra um rótulo diário ou semana ISO
  (`FORMAT_DATE('%G-W%V')`), o mês correspondente e repete a meta mensal nesse ponto mais granular
  — usa a mesma regra ISO-8601 do BigQuery (semana pertence ao mês da sua quinta-feira).
- `testeManual()` ganhou um recálculo independente do YTD nacional e de Campinas comparado contra
  `getIndisponibilidade()` — guardrail de novo validado antes de reimplantar, não só prometido.

## 2026-08-23 (2) — Indisponibilidade → Visão Geral (100% aditiva, guardrail testado)

- **Adicionado**: página **Indisponibilidade → Visão Geral** (menu lateral, agora antes de APV),
  novo endpoint `?endpoint=indisponibilidade-overview` no `Code.gs` — CTE, lista de categorias e
  SQL totalmente separados de `getIndisponibilidade()`, que **não foi tocado**.
- **Guardrail validado ao vivo, não só prometido**: recalculei o "Cálculo BQ direto" de forma
  independente (somando por semana em vez de direto no período inteiro) e bateu exatamente igual
  ao valor da fórmula oficial (11,6% em ambos, mesmo range de datas) — prova de que a réplica da
  lógica total/categorias está correta antes de expor a página.
- **Achado de schema que resolveu uma pergunta em aberto**: `vsd_status`/`vsd_substatus`, na MESMA
  view já usada pela Indisponibilidade oficial, já dão a granularidade STATUS×SUBSTATUS que o
  projeto CCO usa separadamente (`ops_geral.tb_indicadores_regiao`) — não precisou reconciliar com
  outra fonte, nem pedir confirmação, o dado já estava disponível no mesmo grão de linha.
- `bu_responsavel` (campo que existe na view) foi checado e **não é** o mapeamento
  Fabio/Lucas-Ricardo — só separa frota RAC de Seminovos (99,5% do volume é RAC). Mantido o
  mapeamento manual por categoria, implementado como tabela pequena (`INDISP_CATEGORIA_RESPONSAVEL`,
  2 entradas) + 1 valor default — trocar responsável é editar 1-2 linhas.
- **Bug de amostra pequena corrigido antes de publicar**: o corte por segundos totais (30 dias)
  deixava passar modelos com 1-2 veículos presos em Sinistro o período inteiro (ex.: "Renegade",
  1 carro, 100% indisponível — ruído, não achado). Trocado por `COUNT(DISTINCT vehicleId) >= 5`,
  validado ao vivo (ranking de modelo ficou limpo, "New HB20" no topo com 533 veículos e 17,6%).
- Novo campo em cada categoria: **carros-dia perdidos** (`segCat/86400`) — converte segundos de
  indisponibilidade em algo que dá pra comparar direto com capacidade de frota, sem inventar uma
  taxa de R$/diária que não tínhamos à mão.
- Cross-check interessante: "New HB20" aparece no topo tanto do ranking de Damage (Claim/APV)
  quanto no de taxa de Indisponibilidade — duas análises independentes convergindo no mesmo modelo.

## 2026-08-23 — APV → Visão Geral: investigação viva cruzando Damage/Wash/POD

- **Adicionado**: página **APV → Visão Geral** (nova entrada de menu, antes de Damage/Wash/POD),
  novo endpoint `?endpoint=claim-overview` no `Code.gs` — 9 queries agregadas (grão de reserva
  distinta, mesmo da fórmula oficial): tendência semanal, idade do carro, dias desde a última
  lavagem, categoria/modelo de veículo, produto/tipo de reserva, impacto na nota de avaliação,
  ranking de POD físico (normalizado por volume), quebra de palavras do bucket "Other" de Damage, e
  a taxa de itens "Não classificado" na view inteira. Live de verdade — recalcula ao trocar o
  período ou clicar em "Atualizar dados", não é retrato estático.
- **Portado de uma análise ad-hoc já validada** (artifact "Raio-X do Claim", 2026-08-22) — mesma
  metodologia, mesmas queries, agora expostas como parte permanente do painel em vez de relatório
  pontual.
- **2 gráficos novos reutilizáveis**: `trendLineChart` (múltiplas séries sobrepostas, ex.
  Damage x Wash por semana) e `groupedBarChart` (barras lado a lado por categoria, ex. Damage x
  Wash por faixa de idade) — nenhuma lib nova, mesmo padrão SVG do resto do painel.

## 2026-08-22 (3) — Wash e POD no mesmo padrão de drill-down do Damage

- **Adicionado**: páginas **APV → Wash** e **APV → POD**, reaproveitando o endpoint
  `claim-detail` (`?component=wash`/`?component=pod`) — `CLAIM_DETAIL_COMPONENTS` no `Code.gs` já
  tinha sido desenhado extensível pra isso.
- **Refatorado**: as funções JS específicas de Damage (`loadApvDamage`, `renderApvDamage`, etc.)
  viraram genéricas parametrizadas por `component` (`loadApvComponent`, `renderApvComponent`,
  `apvIds()`) — evita triplicar a mesma lógica pros 3 componentes. Estado (`apvState`) agora é um
  objeto por componente, cada um com seu próprio filtro de grupo/cache, independentes entre si.
- **Cuidado ao copiar o padrão**: POD exclui pelo rótulo genérico **`ReviewItemName = 'Vagas'`**,
  não `ReviewItemLabel` como Damage (`'Cars'`) — são campos diferentes na fórmula oficial já
  validada em `getClaimApv()`, não é engano. Adicionado `ReviewItemName` na CTE base do
  drill-down (`claimDetailScopedCte_`) pra viabilizar esse filtro. Wash não tem exclusão nenhuma.
- **Achado**: Wash tem só 1 valor de `ReviewSectionGroupName` ("Limpeza e cheiro") — o Pareto de
  nível 1 dele sempre mostra 1 barra. Documentado na UI como esperado, não bug.
- **Corrigido**: bug de tokenização da nuvem de palavras — `SPLIT(texto, ' ')` não quebrava em
  quebra de linha real dentro de comentários multi-linha, produzindo tokens quebrados (ex.:
  `"\n\no"`) que apareciam na nuvem de palavras. Trocado por `REGEXP_EXTRACT_ALL(texto,
  r'[a-z0-9]+')`, que extrai palavras diretamente e ignora qualquer tipo de separador. Achado e
  corrigido antes de qualquer publicação, validado via `testeManual` com resultado limpo.
- **Corrigido**: rótulos do Pareto de nível 2 se sobrepondo quando há muitas categorias (Damage
  tem ~24 tipos de avaria). `paretoChart` agora escala a largura do SVG com o número de barras,
  rotaciona rótulos -40° e fica num container com scroll horizontal (`.tbl-wrap`). Também ganhou a
  linha de referência 80% clássica do Pareto.
- **Fora desta rodada** (decisão explícita, próxima prioridade): ranking de PODs físicos
  (`PodName`) com mais reclamações no total, e quebra do bucket "Other" de Damage (~30% dos itens,
  taxonomia rasa) usando os comentários específicos desse grupo.

## 2026-08-22 — Menu lateral + drill-down analítico de APV/Damage

- **Adicionado**: navegação por menu lateral recolhível (persistido em `localStorage`), roteamento
  por hash (`#rmr`, `#apv/damage`) — cada página busca seu próprio dado sob demanda, o botão
  "🔄 Atualizar dados" passou a atualizar só a página ativa (antes atualizava tudo de uma vez).
- **Adicionado**: página **APV → Damage**, novo endpoint `apps-script/Code.gs`
  (`?endpoint=claim-detail&component=damage`) com Pareto de 2 níveis (grupo/tipo de avaria via
  `ReviewSectionGroupName`/`ReviewItemLabel`) e nuvem de palavras dos comentários
  (`PostTripReviewComment`), com filtro de período e cross-filter 100% client-side (clicar numa
  barra do Pareto de nível 1 filtra nível 2 e a nuvem, sem nova chamada de rede).
- **Requisito de privacidade aplicado desde o início** (LGPD, site público sem login): a nuvem de
  palavras nunca recebe texto bruto — toda tokenização/anonimização roda em SQL dentro do
  `Code.gs` (stopwords PT, tamanho mínimo de palavra, frequência mínima `HAVING n >= 3`, exclusão
  de tokens com formato de placa/número puro).
- **Achado documentado**: `total_count` do drill-down conta itens reportados (uma reserva pode ter
  2+ itens no mesmo grupo), diferente do `%` de Damage do RMR (que conta reservas distintas) — os
  dois números não batem 1:1 por design, não é bug. Ver nota na UI e no `README.md`.
- **Pausado**: "Report Open" (avaliação na abertura do carro) — sem fonte de dado localizada no
  BigQuery ainda; item desabilitado no menu, sem lógica por trás.
- **Fora desta rodada**: Wash e POD no mesmo padrão de drill-down (endpoint já preparado pra
  receber, `CLAIM_DETAIL_COMPONENTS` em `Code.gs`).

## 2026-08-21 — Migração de Lovable/Supabase para Google Apps Script + GitHub Pages

- **Removido**: todo o app React/TanStack Start gerado pelo Lovable, a integração com Supabase
  Edge Functions e a dependência de uma service account do GCP. O motivo: criar a service account
  exigia permissão de IAM (`iam.serviceAccounts.create`) que a conta usada no projeto `turbi-dc-ops`
  não tem — bloqueio confirmado, não contornável.
- **Adicionado**: `apps-script/Code.gs` — Google Apps Script publicado como Web App, consultando o
  BigQuery via **BigQuery Advanced Service**, autorizado com a conta Google do responsável (sem
  service account). Replica exatamente o SQL de `indisponibilidade.py` e `claim_apv.py` do painel
  local original.
- **Adicionado**: parsing de COGS/Metas movido para dentro de `index.html` (client-side, JS puro),
  substituindo as rotas `/api/cogs` e `/api/metas` do backend FastAPI que deixou de existir. Réplica
  exata de `cogs.py`/`metas.py`.
- **Validado**: números do Apps Script e do parsing client-side comparados byte a byte contra o
  painel local (mesmo range de datas, 2026-01-01 a 2026-08-20) — bateram exato em COGS, Metas e
  Claim/APV. Indisponibilidade bateu exato nas 12 categorias e no YTD; a linha `bq_direto` (soma
  mensal) teve uma diferença de até 0,01pp na primeira versão do `Code.gs` por causa da ordem de
  arredondamento (somar categorias já arredondadas em vez de somar os segundos brutos e arredondar
  uma vez só) — corrigido e revalidado, batendo exato.
- **Achado durante a implantação**: a primeira publicação do Web App saiu com acesso "Qualquer
  pessoa dentro de turbi.com.br" (URL no formato `.../a/macros/turbi.com.br/s/.../exec`), que exige
  login do Google e por isso não funciona a partir de uma página estática pública. Corrigido
  mudando o acesso da implantação para "Qualquer pessoa" (URL sem o prefixo de domínio).
- **Hospedagem**: GitHub Pages servindo `index.html` direto da raiz da branch `main`, substituindo
  a necessidade de qualquer servidor (local, Cloudflare Tunnel ou Lovable) rodando continuamente.
- **Repositório tornado público**: GitHub Pages em repositório privado exige plano pago (GitHub
  Pro/Team). Optamos por tornar `luiamaral-turbi/turbi-cco` público em vez de pagar o upgrade —
  expõe o SQL e nomes de tabelas do BigQuery, mas nenhuma credencial (a URL do Web App e o ID da
  planilha já eram públicos por natureza).
- **Confirmado em produção (2026-08-22)**: teste visual completo no link público — COGS,
  Indisponibilidade e Claim/APV carregando dados reais (nacional e Campinas), botão "Atualizar
  dados" funcionando.

## 2026-08-22 — Paleta em tons de azul da marca + gráfico "COGS Geral"

- **Paleta categórica trocada de cinza-azulado para azul da marca**: as 12 categorias de
  Indisponibilidade (`apps-script/Code.gs`), as 9 linhas de COGS (`COGS_COLORS` em `index.html`) e
  os 3 componentes de Claim/APV (Wash/Damage/POD) passaram a usar uma rampa única baseada no azul
  da marca Turbi (`#231DB0`, escuro→claro) em vez da rampa cinza-azulada dessaturada anterior. 3ª
  versão da paleta categórica deste painel — pedido explícito do Lui pra reforçar a identidade
  visual da marca. **Importante**: como a cor de cada categoria de Indisponibilidade vem do
  `Code.gs` (campo `color` no JSON), essa mudança só aparece no site depois de reimplantar o Apps
  Script (ver `README.md`/Runbook) — a de COGS/Claim é só client-side, aparece assim que o
  `index.html` for publicado.
- **Novo gráfico "COGS Geral (9 linhas) — Real x Meta"**: barra por mês (+ YTD) comparando o total
  das 9 linhas de COGS ("COGS OPS") contra a meta da área, com a mesma convenção de cor usada em
  Indisponibilidade (verde = dentro da meta, vermelho = acima). Fica logo abaixo dos hero cards,
  antes do gráfico empilhado de composição.
