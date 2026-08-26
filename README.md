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
    `apps-script/Code.gs` também serve a página inteira via `HtmlService` quando a URL do Web App
    é acessada sem `?endpoint=` (ver `doGet()`) — o arquivo `index.html` colado dentro do projeto
    Apps Script é byte-a-byte o mesmo arquivo deste repo, sem nenhuma edição (a página usa a mesma
    constante `APPS_SCRIPT_URL` de sempre pra buscar dado, então funciona igual esteja ela
    hospedada em qualquer um dos dois lugares). Isso é uma **implantação separada** do mesmo
    script, com acesso "Qualquer pessoa dentro de turbi.com.br" — a implantação pública original
    (usada pelas chamadas `?endpoint=...`) continua existindo, sem mudar nada, pra não quebrar o
    GitHub Pages enquanto a versão logada é validada. Ver "Como reimplantar" abaixo.
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

## Como reimplantar o Apps Script (depois de editar `apps-script/Code.gs`)

1. Abrir o projeto em [script.google.com](https://script.google.com) (mesma conta Google usada na
   implantação atual).
2. Colar o conteúdo atualizado de `apps-script/Code.gs` no editor (substituindo tudo), `Ctrl+S`.
3. Se o projeto ainda não tiver o arquivo HTML da página (1ª vez configurando a versão logada):
   Arquivo → Novo → HTML, nomear exatamente `index`, colar o conteúdo de `index.html` da raiz deste
   repo sem nenhuma edição, `Ctrl+S`.
4. Rodar a função `testeManual` pelo menos uma vez e conferir o **Registro de execução** — os números
   devem bater com os já certificados antes de seguir. Isso inclui `getClaimDetail` (Damage): a soma
   de `count` de todos os grupos deve ser da mesma ordem de grandeza do `damage_n` de `getClaimApv()`
   (não igual — um conta itens, o outro reservas distintas), e nenhuma das palavras da nuvem deve
   parecer placa/telefone/nome.
5. `Implantar → Gerenciar implantações → editar (ícone de lápis) na implantação PÚBLICA existente →
   Nova versão → Implantar`. **Importante**: reimplantar sem criar uma "Nova versão" mantém o
   código antigo no ar — sempre escolher "Nova versão". Isso atualiza tanto a API pública (usada
   pelo GitHub Pages) quanto a versão logada (se ela já existir), já que as duas rodam o mesmo
   código — só muda o `index.html` colado dentro do projeto, que precisa ser atualizado manualmente
   também sempre que o `index.html` da raiz do repo mudar (passo 3).
6. A URL do Web App (campo `APPS_SCRIPT_URL` em `index.html`) só muda se uma implantação **nova**
   (não uma versão da mesma implantação) for criada. Reimplantar a mesma implantação preserva a URL.
7. Conferir em **"Quem pode acessar"** que a implantação PÚBLICA continua **"Qualquer pessoa"** — se
   vier como "Qualquer pessoa dentro de turbi.com.br", o `fetch()` do GitHub Pages (site
   público, sem sessão Google) recebe página de login do Google em vez de JSON (já aconteceu uma
   vez nesta migração).
8. **Criar/gerenciar a implantação logada (@turbi.com.br)** — separada da pública, feita só uma vez
   (depois só precisa de "Nova versão" igual ao passo 5, na implantação certa):
   `Implantar → Nova implantação → tipo "App da Web" → Executar como "Eu" → Acesso "Qualquer pessoa
   dentro de turbi.com.br"`. A URL gerada é a nova URL "logada" pra usar no lugar do GitHub Pages —
   ela serve a página (`index.html` colado no projeto) quando visitada sem parâmetro, mas os dados
   continuam vindo da implantação pública de sempre (mesma `APPS_SCRIPT_URL` fixa no arquivo).

## Se algo quebrar — checklist

- **Página carrega mas fica em "Falha ao atualizar"**: abrir o Console do navegador (F12) — a
  mensagem de erro identifica qual das 6 fontes falhou (Indisponibilidade, Claim/APV, nacional ou
  Campinas, COGS, Metas).
- **Erro mencionando `APPS_SCRIPT_URL`**: a URL do Web App mudou (nova implantação) ou expirou —
  pegar a URL atual em `script.google.com → Implantar → Gerenciar implantações` e atualizar a
  constante no topo do `<script>` em `index.html`.
- **Indisponibilidade/Claim retornam página de login do Google em vez de JSON**: a implantação caiu
  pra acesso restrito ao domínio — ver passo 6 acima.
- **COGS/Metas com erro "planilha não encontrada" ou "linha não encontrada"**: a planilha de origem
  (`103v2gA7a24QAT73yXbyTnSdWxZjAsh4bZOMzkdHEghg`) mudou de estrutura — os nomes de aba, o marcador
  `"COGS./VHC"` ou os rótulos de meta em `index.html` precisam ser conferidos contra a planilha atual.
- **Números batendo errado**: nunca ajustar arredondamento/fórmula direto no `index.html` ou no
  `Code.gs` sem revalidar contra os números já certificados — ver `CHANGELOG.md` e a nota "Glossário
  e Fórmulas" no Obsidian (`Notas Obsidian/RMR OPS/`) para o histórico de validação.
- **URL logada (@turbi.com.br) pede login em loop, ou mostra página em branco/erro do Apps Script**:
  confirmar que o arquivo `index` dentro do projeto Apps Script está com o conteúdo atualizado
  (passo 3 acima) e que o acesso da implantação está mesmo "Qualquer pessoa dentro de
  turbi.com.br" (não "Somente eu"). Se aparecer um aviso de que o app não foi verificado pelo
  Google, é esperado pra Web Apps internas — "Acessar [Avançado] → Acessar [projeto] (não seguro)".

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
