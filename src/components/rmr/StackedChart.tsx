import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { BRAND, rampColor } from "@/lib/rmr/palette";
import { COLUMN_LABELS, type Series } from "@/lib/rmr/derive";

type Props = {
  series: Series[];
  target?: (number | null)[];
  targetLabel?: string;
  format: (v: number | null) => string;
  height?: number;
};

/** Gráfico empilhado por categoria + linha tracejada de meta, com coluna YTD. */
export function StackedChart({
  series,
  target,
  targetLabel = "Meta",
  format,
  height = 320,
}: Props) {
  const data = COLUMN_LABELS.map((label, i) => {
    const row: Record<string, string | number | null> = { label };
    for (const s of series) row[s.name] = s.values[i] ?? null;
    if (target) row[targetLabel] = target[i] ?? null;
    return row;
  });

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
        <CartesianGrid stroke={BRAND.border} vertical={false} />
        <XAxis dataKey="label" tick={{ fill: BRAND.gray, fontSize: 12 }} stroke={BRAND.border} />
        <YAxis
          tick={{ fill: BRAND.gray, fontSize: 12 }}
          stroke={BRAND.border}
          tickFormatter={(v: number) => format(v)}
          width={70}
        />
        <Tooltip
          formatter={(v: number | string) => format(typeof v === "number" ? v : null)}
          contentStyle={{
            background: BRAND.card,
            border: `1px solid ${BRAND.border}`,
            borderRadius: 10,
            fontSize: 12,
          }}
        />
        <Legend wrapperStyle={{ fontSize: 11, color: BRAND.gray }} />
        {series.map((s, i) => (
          <Bar key={s.name} dataKey={s.name} stackId="a" fill={rampColor(i)} />
        ))}
        {target ? (
          <Line
            type="monotone"
            dataKey={targetLabel}
            stroke={BRAND.blue}
            strokeWidth={2}
            strokeDasharray="6 4"
            dot={false}
            connectNulls
          />
        ) : null}
      </ComposedChart>
    </ResponsiveContainer>
  );
}
