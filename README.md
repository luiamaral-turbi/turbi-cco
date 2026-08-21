# turbi-cco — Centro de Controle de Operações

Painel ao vivo dos 3 indicadores centrais da RMR (Reunião Mensal de Resultados) de Operações da Turbi:
**COGS (OPEX)**, **Indisponibilidade OPS** e **Claim/APV** (reclamação pós-viagem). Site estático,
sem backend próprio, sem build — abrir `index.html` já é o produto final.

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
- **Hospedagem**: GitHub Pages, servindo `index.html` direto da raiz da branch `main`. Sem servidor,
  sem build, sem deploy — só `git push`.
- Botão **"🔄 Atualizar dados"** refaz as 6 consultas (2× BigQuery via Apps Script, 2× CSV de Sheets)
  em tempo real, no navegador de quem estiver com a página aberta.

Todas as fórmulas replicam exatamente o painel local original (FastAPI + BigQuery), que foi a versão
validada numericamente contra o dashboard oficial antes de qualquer migração. Ver
`apps-script/Code.gs` para os comentários com a origem de cada fórmula.

## Rodar/testar localmente

Não há build. Basta abrir `index.html` num navegador (ou servir com qualquer servidor estático,
ex. `npx serve .`), desde que a constante `APPS_SCRIPT_URL` no topo do `<script>` esteja apontando
pra uma implantação válida do Apps Script.

## Como reimplantar o Apps Script (depois de editar `apps-script/Code.gs`)

1. Abrir o projeto em [script.google.com](https://script.google.com) (mesma conta Google usada na
   implantação atual).
2. Colar o conteúdo atualizado de `apps-script/Code.gs` no editor (substituindo tudo), `Ctrl+S`.
3. Rodar a função `testeManual` pelo menos uma vez e conferir o **Registro de execução** — os números
   devem bater com os já certificados antes de seguir.
4. `Implantar → Gerenciar implantações → editar (ícone de lápis) → Nova versão → Implantar`.
   **Importante**: reimplantar sem criar uma "Nova versão" mantém o código antigo no ar — sempre
   escolher "Nova versão".
5. A URL do Web App (campo `APPS_SCRIPT_URL` em `index.html`) só muda se uma implantação **nova**
   (não uma versão da mesma implantação) for criada. Reimplantar a mesma implantação preserva a URL.
6. Conferir em **"Quem pode acessar"** que continua **"Qualquer pessoa"** — se vier como "Qualquer
   pessoa dentro de turbi.com.br", o site vai pedir login do Google em vez de mostrar os dados
   (já aconteceu uma vez nesta migração).

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

## Limitações conhecidas (herdadas do painel original, não mudou nesta migração)

- COGS tem `meses` fixo em 7 (Jan–Jul) — precisa ser estendido manualmente no código conforme o ano
  avança (`COGS_MONTH_STARTS`/`COGS_MESES` em `index.html`).
- Mês corrente sempre aparece parcial (a consulta ao BigQuery vai até "ontem").
- Estratificação de Claim (abrir Wash/Damage/POD em sub-itens) está fora de escopo desta rodada.
- Layout pensado para desktop — adaptação mobile-first ainda não foi feita.

## Documentação relacionada

- `apps-script/Code.gs` — código do Web App, com o SQL e os comentários de origem de cada fórmula.
- `CHANGELOG.md` — histórico de mudanças de arquitetura e fórmulas.
- `Notas Obsidian/RMR OPS/` (fora deste repo) — base de conhecimento completa: decisões de
  arquitetura, glossário/fórmulas validadas, e a nota "Runbook" com o mesmo checklist operacional
  acima em formato mais informal.
