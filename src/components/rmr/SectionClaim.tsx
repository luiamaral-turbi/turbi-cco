import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { SectionCard, HeroCard } from "./HeroCard";
import { StackedChart } from "./StackedChart";
import { PlanRealTable, type PlanRealRow } from "./PlanRealTable";
import { ErrorBlock, LoadingBlock, NoticeBlock } from "./States";
import { fetchBigQuery, type ClaimRow } from "@/lib/rmr/bigquery";
import { fetchMetas, type Meta, type MetasData } from "@/lib/rmr/sheets";
import {
  CLAIM_COMPONENTS,
  isBqConfigured,
  isMetasConfigured,
  MONTHS_PT,
  YEAR,
} from "@/lib/rmr/config";
import { fmtPct, withinTarget } from "@/lib/rmr/format";
import {
  at,
  buildClaimView,
  latestMonthIndex,
  type ClaimView,
  type Series,
} from "@/lib/rmr/derive";

const pct = (v: number | null | undefined) => fmtPct(v, 2);

const META_BY_COMPONENT: Record<string, keyof MetasData> = {
  Wash: "wash",
  Damage: "damage",
  POD: "pod",
};

function toRows(components: Series[], metas: MetasData, soma: (number | null)[]): PlanRealRow[] {
  const rows: PlanRealRow[] = components.map((c) => {
    const metaKey = META_BY_COMPONENT[c.name];
    const meta: Meta = metaKey ? metas[metaKey] : { annual: null, months: Array(12).fill(null) };
    const metaSeries = [...meta.months, meta.annual];
    return {
      name: c.name,
      cells: c.values.map((v, i) => ({ real: v, budget: metaSeries[i] ?? null })),
    };
  });
  const totalSeries = [...metas.apvTotal.months, metas.apvTotal.annual];
  rows.push({
    name: "Soma",
    emphasis: true,
    cells: soma.map((v, i) => ({ real: v, budget: totalSeries[i] ?? null })),
  });
  return rows;
}

function ClaimBlock({ title, view, metas }: { title: string; view: ClaimView; metas: MetasData }) {
  const targetSeries = [...metas.apvTotal.months, metas.apvTotal.annual];
  const latestIdx = latestMonthIndex(view.soma);
  const latestReal = at(view.soma, latestIdx);
  const latestMeta = at(metas.apvTotal.months, latestIdx);
  const ytdReal = at(view.soma, 12);

  return (
    <div className="space-y-4">
      {title ? <h3 className="text-sm font-semibold text-foreground">{title}</h3> : null}
      <div className="grid gap-4 md:grid-cols-2">
        <HeroCard
          title={
            latestIdx >= 0
              ? `APV Soma — ${MONTHS_PT[latestIdx]}/${YEAR}`
              : "APV Soma — mês mais recente"
          }
          value={pct(latestReal)}
          target={pct(latestMeta)}
          status={withinTarget(latestReal, latestMeta)}
        />
        <HeroCard
          title="APV Soma — YTD"
          value={pct(ytdReal)}
          target={pct(metas.apvTotal.annual)}
          status={withinTarget(ytdReal, metas.apvTotal.annual)}
          caption="Meta anual de referência = Wash + Damage + POD (planilha de Metas)."
        />
      </div>

      <SectionCard title="Wash + Damage + POD" subtitle="Empilhado + meta APV Ops. Inclui YTD.">
        <StackedChart
          series={view.components}
          target={targetSeries}
          targetLabel="Meta APV Ops"
          format={pct}
        />
      </SectionCard>

      <SectionCard title="Previsto (meta) x Real, por componente">
        <PlanRealTable rows={toRows(view.components, metas, view.soma)} format={pct} />
      </SectionCard>
    </div>
  );
}

export function SectionClaim({ refreshKey }: { refreshKey: number }) {
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
      bqQuery.data
        ? buildClaimView(bqQuery.data.claim.nacional as ClaimRow[], CLAIM_COMPONENTS)
        : null,
    [bqQuery.data],
  );
  const campinas = useMemo(
    () =>
      bqQuery.data
        ? buildClaimView(bqQuery.data.claim.campinas as ClaimRow[], CLAIM_COMPONENTS)
        : null,
    [bqQuery.data],
  );

  if (!configured) {
    return (
      <NoticeBlock
        title="Claim/APV — BigQuery ainda não configurado"
        message="Define VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY e a Edge Function do BigQuery (com o secret da service account do GCP), e as variáveis da planilha de Metas (VITE_METAS_SHEET_ID)."
      />
    );
  }
  if (bqQuery.isLoading || metasQuery.isLoading)
    return <LoadingBlock label="Claim/APV (BigQuery)" />;
  if (bqQuery.error || metasQuery.error || !nacional || !campinas || !metasQuery.data)
    return (
      <ErrorBlock
        title="Não consegui carregar o Claim/APV"
        message={((bqQuery.error ?? metasQuery.error) as Error)?.message ?? "Erro desconhecido."}
      />
    );

  return (
    <div className="space-y-6">
      <ClaimBlock title="" view={nacional} metas={metasQuery.data} />
      <div className="border-t border-dashed border-border pt-6">
        <ClaimBlock title="Campinas (recorte geográfico)" view={campinas} metas={metasQuery.data} />
      </div>
    </div>
  );
}
