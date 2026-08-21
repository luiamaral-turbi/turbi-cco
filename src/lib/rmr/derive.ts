import { MONTHS_PT } from "./config";
import type { ClaimRow, IndispRow } from "./bigquery";

export const MONTH_KEYS = ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"];
export const YTD_KEY = "YTD";
export const COLUMN_LABELS = [...MONTHS_PT, "YTD"];

export type Series = { name: string; values: (number | null)[] };

function emptyValues() {
  return Array<number | null>(13).fill(null);
}

function columnIndex(mes: string) {
  if (mes === YTD_KEY) return 12;
  const idx = MONTH_KEYS.indexOf(mes.slice(-2));
  return idx;
}

/** Pivota linhas (mes x chave) em séries com 13 colunas (12 meses + YTD). */
function pivot(rows: { mes: string; pct: number }[], keyOf: (r: never) => string): Series[] {
  const map = new Map<string, (number | null)[]>();
  for (const row of rows) {
    const key = keyOf(row as never);
    const col = columnIndex(row.mes);
    if (col < 0) continue;
    const values = map.get(key) ?? emptyValues();
    values[col] = row.pct;
    map.set(key, values);
  }
  return [...map.entries()].map(([name, values]) => ({ name, values }));
}

const TOTAL_KEY = "__total__";

export type IndispView = {
  /** Categorias ordenadas da maior para a menor pelo valor YTD. */
  categories: Series[];
  /** Total calculado direto no BQ (linha "Cálculo BQ direto"). */
  total: (number | null)[];
};

export function buildIndispView(rows: IndispRow[]): IndispView {
  const series = pivot(rows, (r: IndispRow) => r.categoria);
  const total = series.find((s) => s.name === TOTAL_KEY)?.values ?? emptyValues();
  const categories = series
    .filter((s) => s.name !== TOTAL_KEY)
    .sort((a, b) => (b.values[12] ?? -1) - (a.values[12] ?? -1));
  return { categories, total };
}

export type ClaimView = { components: Series[]; soma: (number | null)[] };

export function buildClaimView(rows: ClaimRow[], order: readonly string[]): ClaimView {
  const series = pivot(rows, (r: ClaimRow) => r.componente);
  const components = order.map(
    (name) => series.find((s) => s.name === name) ?? { name, values: emptyValues() },
  );
  const soma = Array.from({ length: 13 }, (_, i) => {
    const vals = components.map((c) => c.values[i]).filter((v): v is number => v !== null);
    return vals.length === 0 ? null : vals.reduce((a, b) => a + b, 0);
  });
  return { components, soma };
}

/** Índice da coluna mais recente com dado (ignora YTD). */
export function latestMonthIndex(values: (number | null)[]) {
  for (let i = 11; i >= 0; i--) if (values[i] !== null) return i;
  return -1;
}

/** Mês com o maior valor (pior mês) — ignora YTD. */
export function worstMonthIndex(values: (number | null)[]) {
  let best = -1;
  for (let i = 0; i < 12; i++) {
    const v = values[i];
    if (v === null || v === undefined) continue;
    const current = values[best];
    if (best === -1 || (current !== null && current !== undefined && v > current)) best = i;
  }
  return best;
}

/** Acesso seguro a um índice de array de valores (undefined -> null). */
export function at(values: (number | null)[], index: number): number | null {
  return index >= 0 ? (values[index] ?? null) : null;
}

/** Soma dos valores de todas as séries por coluna. */
export function stackTotals(series: Series[]) {
  return Array.from({ length: 13 }, (_, i) => {
    const vals = series.map((s) => s.values[i]).filter((v): v is number => v !== null);
    return vals.length === 0 ? null : vals.reduce((a, b) => a + b, 0);
  });
}
