import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { BRAND } from "@/lib/rmr/palette";
import { COLUMN_LABELS } from "@/lib/rmr/derive";

type Props = {
  real: (number | null)[];
  target: (number | null)[];
  labels?: readonly string[];
  format: (v: number | null) => string;
  height?: number;
};

/**
 * Barras de Real coloridas por status (verde dentro da meta, vermelho acima)
 * + linha tracejada de meta.
 */
export function StatusBarChart({
  real,
  target,
  labels = COLUMN_LABELS,
  format,
  height = 260,
}: Props) {
  const data = labels.map((label, i) => ({
    label,
    Real: real[i] ?? null,
    Meta: target[i] ?? null,
  }));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
        <CartesianGrid stroke={BRAND.border} vertical={false} />
        <XAxis dataKey="label" tick={{ fill: BRAND.gray, fontSize: 11 }} stroke={BRAND.border} />
        <YAxis
          tick={{ fill: BRAND.gray, fontSize: 11 }}
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
        <Bar dataKey="Real">
          {data.map((row, i) => {
            const t = row.Meta;
            const v = row.Real;
            const ok = v === null || t === null ? null : v <= t;
            return (
              <Cell
                key={i}
                fill={ok === null ? BRAND.gray : ok ? BRAND.green : BRAND.red}
              />
            );
          })}
        </Bar>
        <Line
          type="monotone"
          dataKey="Meta"
          stroke={BRAND.blue}
          strokeWidth={2}
          strokeDasharray="6 4"
          dot={false}
          connectNulls
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
