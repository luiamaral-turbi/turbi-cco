import { COLUMN_LABELS } from "@/lib/rmr/derive";
import { cn } from "@/lib/utils";

export type PlanRealRow = {
  name: string;
  /** 13 posições: 12 meses + YTD. */
  cells: { real: number | null; budget: number | null }[];
  emphasis?: boolean;
};

type Props = {
  rows: PlanRealRow[];
  format: (v: number | null) => string;
  ytdNote?: string;
};

/** Tabela "Previsto x Real": Real em destaque (verde/vermelho) e Budget menor embaixo. */
export function PlanRealTable({ rows, format, ytdNote }: Props) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[900px] border-collapse text-xs">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 border-b border-border bg-card px-3 py-2 text-left font-semibold text-foreground">
              Linha
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
          {rows.map((row) => (
            <tr key={row.name}>
              <td
                className={cn(
                  "sticky left-0 z-10 border-b border-border bg-card px-3 py-2 text-left text-foreground",
                  row.emphasis && "font-semibold",
                )}
              >
                {row.name}
              </td>
              {row.cells.map((cell, i) => {
                const ok =
                  cell.real === null || cell.budget === null ? null : cell.real <= cell.budget;
                return (
                  <td
                    key={i}
                    className="border-b border-border px-2 py-1.5 text-right tabular-nums"
                  >
                    <span
                      className={cn(
                        "block font-semibold",
                        ok === true && "text-success",
                        ok === false && "text-danger",
                        ok === null && "text-muted-foreground",
                      )}
                    >
                      {format(cell.real)}
                    </span>
                    <span className="block text-[10px] text-muted-foreground">
                      {format(cell.budget)}
                    </span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {ytdNote ? <p className="mt-2 text-[11px] text-muted-foreground">{ytdNote}</p> : null}
    </div>
  );
}
