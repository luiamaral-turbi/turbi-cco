import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { SectionCard, HeroCard } from "./HeroCard";
import { StackedChart } from "./StackedChart";
import { StatusBarChart } from "./StatusBarChart";
import { PlanRealTable, type PlanRealRow } from "./PlanRealTable";
import { ErrorBlock, LoadingBlock, NoticeBlock } from "./States";
import { fetchCogs, type CogsLine } from "@/lib/rmr/sheets";
import { isCogsConfigured, YEAR } from "@/lib/rmr/config";
import { fmtBRL, withinTarget } from "@/lib/rmr/format";
import type { Series } from "@/lib/rmr/derive";

const money = (v: number | null) => fmtBRL(v, 2);

function toSeries(lines: CogsLine[]): Series[] {
  return lines.map((l) => ({
    name: l.name,
    values: [...l.months.map((m) => m.real), l.ytd.real],
  }));
}

function toRows(lines: CogsLine[]): PlanRealRow[] {
  return lines.map((l) => ({
    name: l.name,
    cells: [...l.months, l.ytd],
  }));
}

function sumYtd(lines: CogsLine[]) {
  const vals = lines.map((l) => l.ytd.real).filter((v): v is number => v !== null);
  return vals.length === 0 ? null : vals.reduce((a, b) => a + b, 0);
}

export function SectionCogs({ refreshKey }: { refreshKey: number }) {
  const query = useQuery({
    queryKey: ["cogs", refreshKey],
    queryFn: fetchCogs,
    enabled: isCogsConfigured(),
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });

  const view = useMemo(() => {
    if (!query.data) return null;
    const inScope = query.data.lines.filter((l) => l.inScope);
    const outScope = query.data.lines.filter((l) => !l.inScope);
    const metaSeries = [...query.data.meta.months, query.data.meta.ytd];
    return { inScope, outScope, all: query.data.lines, metaSeries };
  }, [query.data]);

  if (!isCogsConfigured()) {
    return (
      <NoticeBlock
        title="COGS (OPEX) — planilha ainda não configurada"
        message="Defina VITE_COGS_SHEET_ID (e VITE_COGS_SHEET_TAB) com a planilha pública 'Acompanhamento COGS 2026'. A leitura é direta do CSV público, sem backend."
      />
    );
  }
  if (query.isLoading) return <LoadingBlock label="COGS (planilha)" />;
  if (query.error || !view)
    return (
      <ErrorBlock
        title="Não consegui carregar o COGS"
        message={(query.error as Error)?.message ?? "Erro desconhecido."}
      />
    );

  const totalInScope = sumYtd(view.inScope);
  const totalAll = sumYtd(view.all);
  const metaTotal = view.metaSeries[12] ?? null;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <HeroCard
          title={`Total 7 linhas — ${YEAR} (taxa média)`}
          value={money(totalInScope)}
          caption="Soma das 7 linhas sob responsabilidade da área, na coluna do ano (taxa média — não é soma dos 12 meses)."
        />
        <HeroCard
          title="Total COGS (9 linhas) x Meta Total da área"
          value={money(totalAll)}
          target={money(metaTotal)}
          status={withinTarget(totalAll, metaTotal)}
          caption="Meta vinda da linha 'COGS OPS' (coluna Budget) da própria planilha de COGS."
        />
      </div>

      <SectionCard
        title="9 linhas empilhadas x Meta Total"
        subtitle="Inclui as 2 linhas fora do escopo Ops. Coluna YTD no final."
      >
        <StackedChart series={toSeries(view.all)} target={view.metaSeries} format={money} />
      </SectionCard>

      <SectionCard title="7 linhas da área empilhadas x Meta" subtitle="Coluna YTD no final.">
        <StackedChart series={toSeries(view.inScope)} target={view.metaSeries} format={money} />
      </SectionCard>

      <SectionCard
        title="Detalhe por linha"
        subtitle="Barra = Real (verde dentro do budget do mês, vermelho acima). Linha tracejada = Budget."
      >
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {view.all.map((line) => (
            <div key={line.name} className="rounded-[10px] border border-border p-3">
              <p className="mb-2 text-xs font-semibold text-foreground">{line.name}</p>
              <StatusBarChart
                real={[...line.months.map((m) => m.real), line.ytd.real]}
                target={[...line.months.map((m) => m.budget), line.ytd.budget]}
                format={money}
                height={200}
              />
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Previsto x Real, por linha (escopo Ops)">
        <PlanRealTable
          rows={toRows(view.inScope)}
          format={money}
          ytdNote={`Coluna YTD = coluna "${YEAR}" da planilha: taxa média do ano, não a soma dos 12 meses.`}
        />
      </SectionCard>

      <SectionCard
        title="Linhas fora do escopo Ops"
        subtitle="Points of Location e Monitoring Services."
      >
        <PlanRealTable rows={toRows(view.outScope)} format={money} />
      </SectionCard>
    </div>
  );
}
