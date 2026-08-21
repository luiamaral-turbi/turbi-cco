# CCO - Cento de Controle de Operações

Quero criar um "Centro de Controle de Operações" da Turbi (locadora digital de veículos) — um app web multi-abas. A primeira aba se chama "RMR" (Reunião Mensal de Resultados) e mostra os 3 indicadores centrais da minha área. Abas futuras (ainda não vamos construir agora) serão estratificações/detalhamentos de cada tema.

Já validei tudo isso num protótipo local (Python/FastAPI) — quero que você reconstrua EXATAMENTE esse layout e essas fórmulas, não invente nada novo. Depois de criar o projeto, vou conectar ao GitHub pela sua própria integração.

## Estrutura visual (aba "RMR")

Header fixo: logo/marca "turbi", título "RMR - Painel ao vivo", e um botão "🔄 Atualizar dados" que recarrega os 3 indicadores.

Paleta: fundo off-white (#FFFFED), texto quase-preto (#1B1B1B), cinza médio (#525252), azul de marca (#231DB0), verde de "dentro da meta" (#17804A, fundo suave #E6F4EC), vermelho de "acima da meta" (#B91C1C, fundo suave #FBE9E9). Tipografia: Segoe UI / system-ui. Cards com cantos arredondados (10px), borda sutil (#E3E0CC).

**Cores categóricas (séries de gráfico com várias categorias)**: nunca usar cores variadas tipo arco-íris — usar uma rampa única cinza-azulada dessaturada (quase neutra), do escuro pro claro: `#232733, #2E3340, #3A4050, #474E60, #555D70, #646C80, #747C90, #8790A0, #9AA1B0, #AEB4C0, #C3C8D0, #D8DBE0`. Vermelho e verde ficam reservados só pra status (real vs meta), nunca pra identidade de categoria.

### Seção 1 — COGS (OPEX)

Fonte: planilha Google Sheets "Acompanhamento COGS 2026" (uma cópia própria via IMPORTRANGE compartilhada por link público — export CSV: `https://docs.google.com/spreadsheets/d/{id}/gviz/tq?tqx=out:csv&sheet={nome_da_aba}`, sem autenticação nenhuma, dá pra buscar direto do frontend).

- 2 hero cards: "Total 7 linhas — 2026 (taxa média)" e "Total COGS (9 linhas) x Meta Total da área".

- Gráfico empilhado com as 9 linhas (as 7 minhas: Cleaning, Damage, Vehicle Maintenance, Vehicle Supplies, Desmobilization, Logistical, Other COGS — + 2 fora do meu escopo: Points of Location, Monitoring Services) vs Meta Total, incluindo uma coluna extra "YTD" no final.

- Gráfico empilhado só das 7 minhas vs meta, também com coluna YTD.

- Grid com um gráfico individual por linha (das 9): barra = Real, colorida de verde se Real ≤ Budget daquele mês e vermelho se acima; linha tracejada = Budget (meta).

- Tabela "Previsto x Real, por linha": cada célula mostra o Real em destaque (verde/vermelho conforme vs budget) com o Budget menor embaixo. Coluna YTD = coluna "2026" da planilha (é uma taxa média do ano, não soma dos 12 meses — importante, não somar).

- Tabela separada "Linhas fora do escopo Ops" (Points of Location + Monitoring Services), mesmo formato.

- Mapeamento de células da planilha (buscar por nome, nunca por número de linha fixo — a estrutura pode mudar): procurar a linha cujo texto é "COGS./VHC" — a partir dali, achar as linhas por nome (Cleaning, Damage, etc.). Cada mês ocupa colunas [Budget, Real, Delta%, DeltaR$]; a coluna "2026" fica no final da linha.

### Seção 2 — Indisponibilidade OPS

Fonte: BigQuery, projeto `turbi-dc-ops`, tabela `ops_geral.vw_frota_historico_contabil`. Fórmula (já validada, bate exato com os números oficiais): `% categoria = SUM(segundos_no_status WHERE status_ajustado = categoria) / SUM(segundos_no_status total)`, por mês, SEM filtrar veículos de teste/excluídos.

12 categorias somam o KPI: Sinistro, Lavagem/Preparação, Prep. Desmobilização, Outros, Mudança de Pod, Revisão, Bateria baixa, Manut. Pneus, Sem Comunicação, Manut. IOT, Falha de Instalação, Operational.

- 3 hero cards: mês mais recente (BQ direto) x meta, YTD x meta anual, pior mês do período.

- Gráfico de barras (real, verde/vermelho vs meta) + linha tracejada de meta, incluindo coluna YTD no final.

- Gráfico empilhado por categoria + linha de meta total, com coluna YTD. Categorias ORDENADAS da maior pra menor (por valor YTD) — essa mesma ordem e cor tem que valer no gráfico, na legenda E na tabela abaixo (os três sempre batendo).

- Tabela em **mapa de calor**: escala ÚNICA pra tabela inteira (não por linha!) — 0% = branco/quase branco, o MAIOR valor de qualquer categoria/mês/YTD do período = vermelho de marca (#B91C1C, partindo de um tom bem claro #FBE9E9). Não escalar por categoria, senão uma categoria pequena (tipo 0,05%) fica parecendo tão grave quanto uma grande (tipo 6%). Coluna YTD entra na mesma escala. Linha final "Cálculo BQ direto" (o total) fica fora do mapa de calor — usa verde/vermelho simples vs meta.

- Visão idêntica espelhada, mas filtrada só pra frota de Campinas (`podCity = 'Campinas'`) — mesmos gráficos, mesmo heatmap, logo abaixo da visão nacional.

### Seção 3 — Claim/APV (reclamação pós-viagem)

Fonte: BigQuery, tabela `atendimento.vw_post_trip_review_por_item`. 3 componentes, fórmula = bookings distintos com reclamação naquela categoria / total de bookings avaliados no mês:

- **Wash**: `review_item_category = 'Limpeza e cheiro'`

- **Damage**: `review_item_category = 'Avarias no veículo'` EXCLUINDO `ReviewItemLabel = 'Cars'` (rótulo genérico que infla contagem sem ser reclamação real)

- **POD**: `review_item_category = 'Estacionamento'` EXCLUINDO `ReviewItemName = 'Vagas'` (mesmo problema)

- APV Soma = Wash + Damage + POD

Pra filtrar por Campinas: a tabela de reviews não tem cidade direto — precisa de JOIN por `podid` com `ops_geral.vw_frota_historico_contabil` pra pegar `podCity`.

- 2 hero cards: mês mais recente x meta, YTD x meta anual.

- Gráfico empilhado (Wash+Damage+POD) + linha de meta, com coluna YTD.

- Tabela colorida igual o padrão do COGS (real em destaque verde/vermelho vs meta, meta menor embaixo), uma linha por componente + linha "Soma".

- Mesma visão espelhada pra Campinas, logo abaixo.

### Metas (Indisponibilidade e Claim/APV)

Vêm de uma segunda planilha Google Sheets (mesmo mecanismo de CSV público), abas "Metas - Operações Execução" e "Metas - Fleet Management". Buscar por nome do indicador na coluna B, meta anual na coluna F, meta mensal (Jan-Dez) nas colunas K:V. Indisponibilidade e Wash ficam na aba "Operações Execução"; Damage e POD na aba "Fleet Management" (atenção: Damage aparece 2x nessa aba — usar só a versão cuja célula de meta anual tem "%", a outra está com formatação quebrada em R$). Meta de APV Total = soma das metas de Wash + Damage + POD.

Meta de COGS vem da própria planilha de COGS (linha "COGS OPS", coluna Budget) — não dessa segunda planilha.

## Arquitetura — importante

Não preciso armazenar nenhum dado — tudo já existe no BigQuery e nas planilhas, o app só lê ao vivo a cada carregamento/atualização (sem cache, sem histórico salvo).

- **COGS e Metas** (Google Sheets): busca direto do frontend via fetch no link CSV público, sem backend nenhum.

- **Indisponibilidade e Claim/APV** (BigQuery): NÃO dá pra consultar direto do navegador com segurança. Preciso de UMA Supabase Edge Function que guarda a credencial (service account do Google Cloud, projeto `turbi-dc-ops`) como secret e faz a consulta ao BigQuery, devolvendo o JSON já pronto pro frontend.

- **Restrição explícita: usar Supabase (projeto próprio), NÃO usar Lovable Cloud.** Não preciso do banco de dados do Supabase pra nada disso — só da Edge Function e do gerenciamento de secrets. Não crie tabelas nem estrutura de banco além do estritamente necessário pra rodar a function (se é que precisa de alguma).

- Ainda não tenho essa service account do GCP criada — vou resolver isso com quem administra o projeto `turbi-dc-ops` e colar a credencial no secret da Edge Function depois. Pode montar a function já esperando essa credencial via variável de ambiente/secret.

## Sobre as próximas abas (não construir agora, só ter em mente)

Cada aba futura vai ser uma estratificação de um dos 3 temas (ex.: Claim aberto por sub-item tipo "sujo por dentro/fora"; Indisponibilidade cruzada com regras de classificação STATUS×SUBSTATUS→Gestor de outro projeto interno meu — ainda preciso reconciliar isso com a fórmula desta aba RMR antes de construir essa aba específica). Não infira o conteúdo dessas abas — vou pedir uma de cada vez.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://turbi-cco.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/ca8a4d1c-a34a-4aca-b51d-400afba888cb).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
