import { COLUMN_LABELS, type Series } from "@/lib/rmr/derive";
import { heatColor, heatTextColor, rampColor } from "@/lib/rmr/palette";
import { cn } from "@/lib/utils";

type Props = {
  categories: Series[];
  total: (number | null)[];
  target: (number | null)[];
  format: (v: number | null) => string;
};

/**
 * Mapa de calor com escala ÚNICA para a tabela inteira (inclui a coluna YTD):
 * 0% = branco, maior valor do período = vermelho de marca.
 * A linha "Cálculo BQ direto" fica fora do heatmap (verde/vermelho vs meta).
 */
export function HeatmapTable({ categories, total, target, format }: Props) {
  const max = Math.max(
    0,
    ...categories.flatMap((c) => c.values.filter((v): v is number => v !== null)),
  );

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[900px] border-collapse text-xs">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 border-b border-border bg-card px-3 py-2 text-left font-semibold text-foreground">
              Categoria
            </th>
            {COLUMN_LABELS.map((label) => (
              <th
                key={label}
                className={cn(
                  "border-b border-border px-2 py-2 text-right font-semibold text-muted-foreground",
                  label === "YTD" && "text-foreground",
                )}
              >
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {categories.map((cat, ci) => (
            <tr key={cat.name}>
              <td className="sticky left-0 z-10 border-b border-border bg-card px-3 py-2 text-left text-foreground">
                <span className="flex items-center gap-2">
                  <span
                    className="inline-block size-2.5 rounded-[2px]"
                    style={{ background: rampColor(ci) }}
                  />
                  {cat.name}
                </span>
              </td>
              {cat.values.map((v, i) => {
                const t = max > 0 && v !== null ? v / max : 0;
                return (
                  <td
                    key={i}
                    className="border-b border-border px-2 py-1.5 text-right tabular-nums"
                    style={{ background: heatColor(t), color: heatTextColor(t) }}
                  >
                    {format(v)}
                  </td>
                );
              })}
            </tr>
          ))}
          <tr>
            <td className="sticky left-0 z-10 border-t-2 border-border bg-card px-3 py-2 text-left font-semibold text-foreground">
              Cálculo BQ direto
            </td>
            {total.map((v, i) => {
              const t = target[i] ?? null;
              const ok = v === null || t === null ? null : v <= t;
              return (
                <td
                  key={i}
                  className={cn(
                    "border-t-2 border-border px-2 py-2 text-right font-semibold tabular-nums",
                    ok === true && "text-success",
                    ok === false && "text-danger",
                    ok === null && "text-muted-foreground",
                  )}
                >
                  {format(v)}
                </td>
              );
            })}
          </tr>
        </tbody>
      </table>
    </div>
  );
}
