import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { SectionCard, HeroCard } from "./HeroCard";
import { StackedChart } from "./StackedChart";
import { StatusBarChart } from "./StatusBarChart";
import { HeatmapTable } from "./HeatmapTable";
import { ErrorBlock, LoadingBlock, NoticeBlock } from "./States";
import { fetchBigQuery, type IndispRow } from "@/lib/rmr/bigquery";
import { fetchMetas, type Meta } from "@/lib/rmr/sheets";
import { isBqConfigured, isMetasConfigured, MONTHS_PT, YEAR } from "@/lib/rmr/config";
import { fmtPct, withinTarget } from "@/lib/rmr/format";
import {
  at,
  buildIndispView,
  latestMonthIndex,
  worstMonthIndex,
  type IndispView,
} from "@/lib/rmr/derive";

const pct = (v: number | null | undefined) => fmtPct(v, 2);

function IndispBlock({ title, view, meta }: { title: string; view: IndispView; meta: Meta }) {
  const targetSeries = [...meta.months, meta.annual];
  const latestIdx = latestMonthIndex(view.total);
  const worstIdx = worstMonthIndex(view.total);
  const latestReal = at(view.total, latestIdx);
  const latestMeta = at(meta.months, latestIdx);
  const ytdReal = at(view.total, 12);
  const worstReal = at(view.total, worstIdx);

  return (
    <div className="space-y-4">
      {title ? <h3 className="text-sm font-semibold text-foreground">{title}</h3> : null}
      <div className="grid gap-4 md:grid-cols-3">
        <HeroCard
          title={
            latestIdx >= 0 ? `${MONTHS_PT[latestIdx]}/${YEAR} (BQ direto)` : "Mês mais recente"
          }
          value={pct(latestReal)}
          target={pct(latestMeta)}
          status={withinTarget(latestReal, latestMeta)}
        />
        <HeroCard
          title={`YTD (${MONTHS_PT[0]}–${latestIdx >= 0 ? MONTHS_PT[latestIdx] : MONTHS_PT[11]})`}
          value={pct(ytdReal)}
          target={pct(meta.annual)}
          status={withinTarget(ytdReal, meta.annual)}
          caption="Meta anual de referência (planilha de Metas)."
        />
        <HeroCard
          title="Pior mês do período"
          value={pct(worstReal)}
          caption={worstIdx >= 0 ? `${MONTHS_PT[worstIdx]}/${YEAR}` : ""}
        />
      </div>

      <SectionCard
        title="Real (Cálculo BQ direto) x meta"
        subtitle="Barra verde = dentro da meta, vermelha = acima. Inclui YTD."
      >
        <StatusBarChart real={view.total} target={targetSeries} format={pct} />
      </SectionCard>

      <SectionCard
        title="Por categoria"
        subtitle="Categorias ordenadas da maior para a menor (YTD). Inclui YTD."
      >
        <StackedChart series={view.categories} target={targetSeries} format={pct} />
      </SectionCard>

      <SectionCard
        title="Mapa de calor por categoria"
        subtitle="Escala única para a tabela inteira (0% = branco, maior valor do período = vermelho de marca), incluindo a coluna YTD."
      >
        <HeatmapTable
          categories={view.categories}
          total={view.total}
          target={targetSeries}
          format={pct}
        />
      </SectionCard>
    </div>
  );
}

export function SectionIndisponibilidade({ refreshKey }: { refreshKey: number }) {
  const configured = isBqConfigured() && isMetasConfigured();

  const bqQuery = useQuery({
    queryKey: ["bigquery", refreshKey],
    queryFn: () => fetchBigQuery(YEAR),
    enabled: configured,
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });
  const metasQuery = useQuery({
    queryKey: ["metas", refreshKey],
    queryFn: fetchMetas,
    enabled: configured,
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });

  const nacional = useMemo(
    () =>
      bqQuery.data ? buildIndispView(bqQuery.data.indisponibilidade.nacional as IndispRow[]) : null,
    [bqQuery.data],
  );
  const campinas = useMemo(
    () =>
      bqQuery.data ? buildIndispView(bqQuery.data.indisponibilidade.campinas as IndispRow[]) : null,
    [bqQuery.data],
  );

  if (!configured) {
    return (
      <NoticeBlock
        title="Indisponibilidade OPS — BigQuery ainda não configurado"
        message="Defina VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY e a Edge Function do BigQuery (com o secret da service account do GCP), e as variáveis da planilha de Metas (VITE_METAS_SHEET_ID)."
      />
    );
  }
  if (bqQuery.isLoading || metasQuery.isLoading)
    return <LoadingBlock label="Indisponibilidade (BigQuery)" />;
  if (bqQuery.error || metasQuery.error || !nacional || !campinas || !metasQuery.data)
    return (
      <ErrorBlock
        title="Não consegui carregar a Indisponibilidade"
        message={((bqQuery.error ?? metasQuery.error) as Error)?.message ?? "Erro desconhecido."}
      />
    );

  return (
    <div className="space-y-6">
      <IndispBlock title="" view={nacional} meta={metasQuery.data.indisponibilidade} />
      <div className="border-t border-dashed border-border pt-6">
        <IndispBlock
          title="Campinas (recorte geográfico)"
          view={campinas}
          meta={metasQuery.data.indisponibilidade}
        />
      </div>
    </div>
  );
}
