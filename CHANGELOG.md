# Changelog

Formato: data + o que mudou e por quê. Foco em decisões de arquitetura e fórmulas — não é um
substituto do histórico de commits do Git, é um resumo pensado pra quem for dar manutenção sem
querer ler o diff inteiro.

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
