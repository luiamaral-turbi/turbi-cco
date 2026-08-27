# Changelog

Formato: data + o que mudou e por quê. Foco em decisões de arquitetura e fórmulas — não é um
substituto do histórico de commits do Git, é um resumo pensado pra quem for dar manutenção sem
querer ler o diff inteiro.

## 2026-08-27 — Migração completa pro Apps Script (login @turbi.com.br), com todos os aprendizados

- Depois do revert de 2026-08-26, replanejado com calma: migração de verdade, incorporando as
  causas raiz encontradas ontem. Decisão confirmada com o Lui: **só Apps Script hospeda tudo**
  (página + dados) atrás de login, **GitHub Pages será desativado** ao final (depois de validar
  100% no navegador — ainda não desativado nesta entrada, ver checklist pendente).
- **`doGet()` sem `?endpoint=`**: casca HTML mínima e fixa (zero `//`), via `HtmlService` — só
  chama `getPageContent_()` por `google.script.run` e escreve o resultado com `document.write()`.
  Nunca serve o HTML completo direto (é a causa raiz de ontem).
- **Todas as chamadas de dado do front-end trocaram de `fetch()` pra `google.script.run`** — não
  só a carga inicial da página. Achado importante desta rodada: uma vez que a própria página passa
  a ser servida pelo Apps Script (dentro do iframe sandbox), **qualquer** `fetch()` pra essa mesma
  implantação corre risco de CORS (não só o bootstrap) — por isso as 4 funções `fetchWebApp`,
  `fetchClaimDetail`, `fetchIndispOverview`, `fetchClaimOverview` em `index.html` agora usam um
  helper comum `callApi_()` que embrulha `google.script.run` numa Promise, preservando a mesma
  assinatura/retorno de sempre (nenhum outro código do arquivo mudou — só o transporte).
- **`apiCall_(endpoint, extra)`** em `Code.gs` — dispatch único reaproveitado tanto por
  `doGet(?endpoint=...)` (mantido só pra eu validar por `curl`, não mais usado em produção) quanto
  por `google.script.run` — elimina duplicação entre os dois caminhos de entrada.
- **Validado com rigor antes de tocar a implantação real**: testado via `/dev` (token OAuth do
  `clasp`) — `getPageContent_()`/`?endpoint=page-content` bate **exatamente** (`===`) com o
  `index.html` da raiz, sintaxe dos 2 blocos `<script>` limpa, e `apiCall_` respondendo dado real
  pra `indisponibilidade`.
- Implantado na implantação logada já existente (a original, não a criada por engano em
  2026-08-26). A implantação pública (GitHub Pages) **não foi tocada** nesta rodada — mantida como
  está até o teste manual completo no navegador ser confirmado.
- **Pendente, próximo passo obrigatório**: teste manual completo do Lui no navegador (todas as
  abas, filtros, botão de atualizar, cross-filter) — é a única forma de validar `google.script.run`
  de ponta a ponta (não dá pra testar por `curl`/API, só dentro de um navegador de verdade). Só
  depois disso: desativar GitHub Pages, consolidar/apagar as implantações extras, e atualizar o
  `README.md` com a arquitetura final de implantação única.

## 2026-08-26 (11) — Revertida a hospedagem logada: volta pra API pura, GitHub Pages intacto

- Depois de 6 rodadas de correção na mesma tentativa (entradas 3 a 10 abaixo — bug de comentário
  cortado, `google.script.run` vs `fetch()`, implantação duplicada por engano) e sem uma versão
  finalmente confirmada funcionando pelo Lui, decisão: **parar de tentar servir a página pelo Apps
  Script por agora** e voltar pro estado simples e comprovadamente estável — só a API.
- `doGet()` voltou a ser exatamente o que era antes de 2026-08-26: recebe `?endpoint=...`, devolve
  JSON via `ContentService`, sem nenhum branch de "servir página". Removidas as funções
  `getPageContent_()` e a dependência de `IndexHtml.gs`/`INDEX_HTML_CONTENT`.
- **As 3 implantações do projeto** (pública + as 2 "logadas" criadas durante a tentativa, uma delas
  por engano) foram todas reimplantadas com esse código revertido — nenhuma delas serve mais
  página nenhuma, todas respondem só `{"detail":"endpoint inválido..."}` se acessadas sem
  `?endpoint=`. Evita deixar qualquer URL com o bug antigo no ar.
- **Confirmado**: a implantação pública (única que o GitHub Pages depende) segue respondendo JSON
  normalmente em todos os endpoints, validado por `curl` depois do revert.
- A tentativa de hospedagem com login @turbi.com.br fica pausada — todo o histórico da
  investigação (causas raiz reais encontradas: `HtmlService` corta linha no `//`, e depois
  `google.script.run` era necessário no lugar de `fetch()` por causa de CORS entre formatos de
  URL) continua registrado nas entradas abaixo, pra não perder o aprendizado numa eventual
  retomada — mas nenhuma dessas soluções está ativa no código agora.

## 2026-08-26 (10) — Fix real da casca: `google.script.run` em vez de `fetch()`

- O fix anterior (`ScriptApp.getService().getUrl()`) ainda dava `Failed to fetch`. Causa: o
  `getUrl()` devolve a URL no formato `/a/turbi.com.br/macros/s/ID/exec` — que FUNCIONA se acessado
  direto (confirmado por `curl`) — mas o navegador carrega a página pela URL real no formato
  `/a/macros/turbi.com.br/s/ID/exec` (ordem dos segmentos trocada). Como os dois formatos "parecem"
  origens diferentes pro navegador, o `fetch()» de um pro outro é bloqueado por CORS.
- **Correção definitiva**: trocado `fetch()` por **`google.script.run`** — a API nativa do Apps
  Script pra chamar função de servidor a partir de uma página `HtmlService`, injetada
  automaticamente em qualquer página assim, sem precisar montar URL nenhuma (não sofre desse tipo
  de problema por design). Nova função de servidor `getPageContent_()` devolve
  `INDEX_HTML_CONTENT` direto; `?endpoint=page-content` continua existindo em paralelo só pra
  validação via `curl` fora do navegador.
- **Descoberta lateral**: existiam **4 implantações** do mesmo script (esperava 2) — uma extra foi
  criada sem querer ao clicar em "Nova implantação" em vez de editar a existente. Reimplantado nas
  3 relevantes (pública + as 2 logadas) pra eliminar a inconsistência de qual URL tinha qual código.

## 2026-08-26 (9) — Fix da casca: `location.href` não é a URL real dentro do iframe do Apps Script

- A casca mínima (entrada 8) carregava mas o `fetch(?endpoint=page-content)` voltava
  `Unexpected token '<', "<!doctype "... is not valid JSON` — o `fetch()` estava batendo numa
  página HTML (não no JSON esperado). Causa: dentro do iframe que o `HtmlService` usa pra servir a
  página, `location.href` não é a URL real do Web App (`.../exec`) — é uma URL interna
  `*.googleusercontent.com`. Montar o fetch a partir de `location.href.split("?")[0]` batia num
  lugar errado.
- **Correção**: a URL correta agora vem do servidor via `ScriptApp.getService().getUrl()` (sempre
  aponta pra implantação que está de fato respondendo a requisição atual), embutida como literal
  na casca HTML em vez de calculada no navegador.

## 2026-08-26 (8) — Causa raiz REAL encontrada e corrigida: HtmlService corta linha no primeiro `//`

- A tentativa de base64 (entrada 7) também falhou com o mesmo sintoma. Comparando **byte a byte**
  o conteúdo servido (`?endpoint=page-content`, JSON puro) contra o `index.html` original, achei a
  causa raiz de verdade: `HtmlService` (tanto `createHtmlOutputFromFile('index')` quanto
  `createHtmlOutput(string)`) corta **qualquer linha no primeiro `//` que encontrar**, mesmo
  quando o `//` faz parte de uma URL dentro de uma string/template literal — a linha
  `` const url = `https://docs.google.com/...`; `` virava literalmente
  `` const url = `https: `` (crase nunca fechada), o que faz o parser JS engolir tudo até a
  PRÓXIMA crase do arquivo como se fosse texto — daí "Sheets", depois "Linha", depois "Meta"
  quebrarem em sequência: cada correção mudava o tamanho do arquivo e por consequência qual
  crase seguinte virava o ponto de re-sincronização errado. O bug é do `HtmlService` como
  mecanismo de resposta HTTP (não é sobre ler de arquivo — `createHtmlOutput(string)` tem o mesmo
  problema), então não tinha correção possível editando o conteúdo, só contornando o mecanismo.
- **Correção definitiva**: `doGet()` sem `?endpoint=` agora devolve só uma casca HTML minúscula
  (algumas linhas fixas, sem nenhum `//`, hardcoded em `Code.gs`) que faz
  `fetch(?endpoint=page-content)` e escreve o resultado com `document.write()`. O conteúdo real da
  página **nunca mais passa por `HtmlService`** — vem de `INDEX_HTML_CONTENT`, uma string pura
  definida em `IndexHtml.gs` (gerado automaticamente no `clasp push` a partir do `index.html` da
  raiz), servida via `ContentService`/JSON — o mesmo mecanismo comprovadamente confiável usado por
  todos os outros endpoints desde sempre.
- **Validado com rigor antes de tocar produção**: `JSON.parse()` do conteúdo devolvido comparado
  **igual (`===`)** ao `index.html` original, mais checagem de sintaxe dos 2 blocos `<script>` via
  `new Function()` — sem nenhuma diferença, sem nenhum erro. Testado primeiro no endpoint `/dev`
  (autenticado com token do `clasp`, sem tocar nas implantações reais), só depois implantado nas
  duas produções com a checagem de acesso de sempre.
- Arquivo `index` (HTML) antigo do projeto Apps Script fica órfão (não é mais referenciado nem
  deletado automaticamente) — pode ser removido manualmente no editor, sem efeito no funcionamento.

## 2026-08-26 (7) — Fix definitivo: servir a página via base64 (contorna a corrupção de vez)

- A varredura de aspas duplas (entrada 6) não resolveu — o mesmo tipo de erro reapareceu numa
  TERCEIRA palavra diferente ("Meta", numa linha sem nenhuma aspa dupla), provando que o padrão
  não era "aspas dentro de crase" e sim algo dependente de posição/tamanho no pipeline de
  renderização do `HtmlService` (cada correção mudava o tamanho do arquivo o suficiente pra
  empurrar o ponto de corrupção pra outro lugar).
- **Solução estrutural**, sem precisar entender a causa exata do lado do Google:
  `doGet()` agora, sem `?endpoint=`, lê o conteúdo de `index` via `getContent()`, converte pra
  **base64** (`Utilities.base64Encode(..., Utilities.Charset.UTF_8)`) e devolve um wrapper HTML
  mínimo que faz `atob()` + `TextDecoder('utf-8')` + `document.write()` no navegador pra
  reconstruir a página real. Base64 usa só `[A-Za-z0-9+/=]` — um alfabeto que não permite esse
  tipo de corrupção acontecer, então contorna o bug em vez de caçar cada ocorrência.
- **Validado antes de tocar em produção**: testado pelo endpoint `/dev` do projeto (autenticado via
  token OAuth do `clasp`, sem passar pelas implantações reais), decodificado o base64 manualmente e
  confirmado que reproduz o arquivo original perfeito, sem nenhuma corrupção, do início ao fim.
- Reimplantado nas duas implantações (pública e logada) com a checagem de acesso de sempre.

## 2026-08-26 (6) — Varredura completa: zero aspas duplas dentro de crase no arquivo inteiro

- Depois de corrigir "Sheets" (entrada 3) e ver o mesmo tipo de erro reaparecer em outro ponto
  ("Linha", entrada 5) mesmo com o `clasp push` transmitindo bytes exatos, ficou claro que o padrão
  "crase com aspas duplas literais dentro do texto estático" era mesmo o gatilho — só que existia em
  **78 lugares** do arquivo (a maioria em atributos HTML gerados dentro dos gráficos SVG, ex.
  `` `<rect x="..." class="chart-svg">` ``), não só nos 2 que geraram erro visível até agora
  (provavelmente porque só alguns caem numa posição/combinação específica que o pipeline de
  renderização do `HtmlService` do Apps Script realmente quebra — não cheguei a confirmar a causa
  exata do lado do Google, mas eliminar TODOS os casos resolve independente do mecanismo).
- Trocado `="valor"` por `='valor'` em todos os atributos HTML dentro de template literals (233
  trocas automáticas + 4 casos manuais que precisavam de atenção: `Código.gs`→`index.html` linha
  796 "Linha" virou concatenação simples; o `data-pareto-group` do cross-filter do Pareto (que fazia
  `replace(/"/g,'&quot;')` pra escapar aspas em rótulos) virou `replace(/'/g,'&#39;')`, consistente
  com o novo delimitador de aspas simples; o cabeçalho "YTD (\"2026\")" da tabela de COGS virou
  "YTD (2026)"; e a frase com aspas em "Não classificado" no texto de APV Visão Geral virou
  `&quot;Não classificado&quot;` via entidade HTML em vez de aspas literais no JS).
- **Confirmado**: zero ocorrências restantes de crase+aspas-duplas no arquivo inteiro (checado por
  script, não só visualmente). Nenhuma mudança de comportamento — só o caractere de aspas usado nos
  atributos HTML gerados, que é visualmente idêntico e funciona igual em qualquer navegador.

## 2026-08-26 (5) — Bug "Sheets" reapareceu mesmo via `clasp push` (sem copiar/colar manual)

- O `SyntaxError: Unexpected identifier 'Sheets'` (ver entrada (3) abaixo) voltou a acontecer
  mesmo depois de eliminar completamente a cópia manual — o `clasp push` transmite bytes exatos
  (confirmado com `clasp pull` + diff, idêntico byte a byte) e mesmo assim o navegador reportava
  o mesmo erro ao carregar a versão logada. Isso descarta copiar/colar como causa e aponta pra algo
  no próprio pipeline de renderização do `HtmlService` do Apps Script (que serve a página dentro de
  um wrapper/iframe do Google, não HTML puro — ver entrada (4)).
- Único ponto do arquivo com esse padrão exato: `` `Sheets CSV "${sheetName}": HTTP ${res.status}`
  `` em `fetchSheetRows()` — um template literal (crase) com aspas duplas LITERAIS dentro. Troquei
  por concatenação simples (`'Sheets CSV ' + sheetName + ...`), sem crase nem aspas aninhadas.
  Não cheguei a confirmar a causa exata do lado do Google (não é algo que dá pra depurar por fora),
  mas o sintoma sumiu depois dessa troca.
- **Lição prática**: evitar template literals que misturam crase com aspas duplas literais dentro
  do texto (não da interpolação) neste projeto — preferir aspas simples dentro de crases, ou
  concatenação, quando o texto natural do erro/label tiver aspas.

## 2026-08-26 (4) — `onclick`/`onchange` inline não funcionam na versão logada (Apps Script)

- **Sintoma, depois de já ter corrigido o bug de sintaxe da entrada anterior**: nenhum erro de
  sintaxe no console, mas `Uncaught ReferenceError: atualizarPaginaAtiva is not defined at
  HTMLButtonElement.onclick` ao clicar em "Atualizar dados" — só na versão logada (Apps Script),
  nunca no GitHub Pages. Confirmei via `curl` na implantação pública (que roda o mesmo código, sem
  precisar de login pra testar) que o conteúdo servido está completo e correto — `initRouter()`
  chega inteiro até o fim do arquivo, não é truncamento.
- **Causa raiz**: `HtmlService` do Apps Script serve a página dentro de um iframe sandbox do
  Google (confirmado via `curl` — a resposta do `doGet()` sem `?endpoint=` é uma página de
  bootstrap do próprio Google que monta um iframe com nosso conteúdo, não o HTML puro). Nesse
  ambiente, atributos inline `onclick="..."`/`onchange="..."` no HTML não resolvem a função no
  escopo esperado (o `<script>` roda e define as funções normalmente — por isso o resto do site
  funciona —, mas o atributo inline nativo do DOM não enxerga esse escopo). Atributo inline nunca
  deu problema no GitHub Pages porque ali o HTML é servido puro, sem esse wrapper.
- **Correção**: removidos TODOS os 15 usos de `onclick="..."`/`onchange="..."` inline no HTML —
  trocados por `addEventListener` registrado em bloco no fim do `<script>`, mesmo padrão que já
  era usado (com sucesso, inclusive na versão logada) pros botões do menu lateral (colapsar sidebar,
  abrir/fechar drawer mobile). Afeta: botão "Atualizar dados", os 8 seletores de período (RMR
  Indisponibilidade/APV Visão Geral/Damage/Wash/POD), o seletor de categoria do Pareto de
  sub-motivo, e os 3 botões "Limpar filtro de grupo" do drill-down de Claim.
- **Lição pra qualquer HTML novo neste projeto**: nunca usar `onclick=`/`onchange=` inline daqui
  pra frente — sempre `id` + `addEventListener`, já que o site agora roda em dois ambientes
  (GitHub Pages puro e Apps Script HtmlService) e só o segundo tem essa restrição.

## 2026-08-26 (3) — Bug de copiar/colar na versão logada + migração pra deploy via `clasp`

- **Sintoma**: versão logada (@turbi.com.br) abria em branco, botão "Atualizar dados" não reagia a
  nada. Console mostrava `Uncaught SyntaxError: Unexpected identifier 'Sheets'` — um erro de
  sintaxe em qualquer lugar do `<script>` trava o carregamento do arquivo inteiro (por isso a página
  ficava vazia e até `atualizarPaginaAtiva` aparecia como "not defined": o script nunca terminou de
  rodar).
- **Causa raiz**: colar o `index.html` no editor do Apps Script a partir da visualização com realce
  de sintaxe do GitHub corrompeu um caractere de aspas invertidas (crase) perto da palavra "Sheets"
  (`` `Sheets CSV "${sheetName}"...` ``, em `fetchSheetRows()`). Corrigido copiando da visualização
  **raw** do GitHub em vez da visualização normal.
- **Migração pro `@google/clasp`** (CLI oficial do Apps Script) pra eliminar essa classe de bug de
  vez — instalado local (`npm install`, fora do git), autenticado com `lui.amaral@turbi.com.br`
  (precisou de duas coisas específicas desta rede: `NODE_EXTRA_CA_CERTS` apontando pro
  `corporate_ca.pem`, mesma exigência do gcloud; e habilitar a API do Apps Script em
  `script.google.com/home/usersettings`, configuração de conta pessoal, não de projeto GCP).
  Descoberta: o arquivo de código dentro do projeto real se chama **`Código`** (com acento), não
  `Code` — mantido `apps-script/Code.gs` como nome canônico no repo (não vale a pena renomear
  22+ referências em docs/changelog só por estética); o push copia pra `Código.gs` como artefato
  gerado, fora do git (ver `.gitignore`).
- **Regressão causada por mim durante essa migração, corrigida na hora**: `clasp deploy -i <id>`
  aplica o `webapp.access` do `appsscript.json` NA IMPLANTAÇÃO ESPECIFICADA, sobrescrevendo o que
  ela já tinha configurado — como o manifesto puxado do projeto estava com `"access": "DOMAIN"`
  (config da implantação logada, criada por último), reimplantar a implantação PÚBLICA com esse
  mesmo manifesto derrubou o acesso "Qualquer pessoa" dela por ~5 minutos, quebrando o GitHub Pages
  pra qualquer visitante (confirmado com `curl`: a API pública passou a devolver a página de login
  do Google em vez de JSON). Corrigido trocando `webapp.access` pra `"ANYONE_ANONYMOUS"`, push, e
  `clasp deploy` de novo só na implantação pública — revalidado com `curl` que voltou a responder
  JSON puro, sem redirecionar pra login. **Lição registrada no README**: o acesso não é por
  implantação, é um campo do manifesto aplicado no momento do deploy — sempre conferir/ajustar
  `appsscript.json` antes de rodar `clasp deploy -i <id>` numa implantação específica.

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
