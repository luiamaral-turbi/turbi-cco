# Changelog

Formato: data + o que mudou e por quê. Foco em decisões de arquitetura e fórmulas — não é um
substituto do histórico de commits do Git, é um resumo pensado pra quem for dar manutenção sem
querer ler o diff inteiro.

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
