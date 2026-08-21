/**
 * Leitura ao vivo das planilhas públicas do Google Sheets (export CSV).
 * Sem backend, sem cache, sem autenticação.
 */
import {
  COGS_ALL_LINES,
  COGS_META_ROW,
  COGS_SHEET_ID,
  COGS_SHEET_TAB,
  METAS_SHEET_ID,
  METAS_TAB_FLEET,
  METAS_TAB_OPS,
  MONTH_ALIASES,
  YEAR,
  csvUrl,
} from "./config";

/* -------------------------------------------------------------------------- */
/* CSV                                                                         */
/* -------------------------------------------------------------------------- */

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (ch !== "\r") {
      field += ch;
    }
  }
  row.push(field);
  rows.push(row);
  return rows;
}

async function fetchCsv(sheetId: string, tab: string): Promise<string[][]> {
  const res = await fetch(csvUrl(sheetId, tab), { cache: "no-store" });
  if (!res.ok) {
    throw new Error(
      `Não consegui ler a aba "${tab}" da planilha (HTTP ${res.status}). Confirme se o link está compartilhado publicamente.`,
    );
  }
  return parseCsv(await res.text());
}

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

/** Converte texto de célula em número (aceita R$, %, milhar/decimal pt-BR). */
export function toNumber(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  let s = raw.replace(/\s|R\$|\u00a0/g, "").trim();
  if (!s || s === "-" || s === "—") return null;
  const isPercent = s.includes("%");
  s = s.replace(/%/g, "");
  const negative = /^\(.*\)$/.test(s);
  s = s.replace(/[()]/g, "");
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  const n = Number(s);
  if (Number.isNaN(n)) return null;
  const value = isPercent ? n / 100 : n;
  return negative ? -value : value;
}

/* -------------------------------------------------------------------------- */
/* COGS                                                                        */
/* -------------------------------------------------------------------------- */

export type MonthCell = { budget: number | null; real: number | null };

export type CogsLine = {
  name: string;
  inScope: boolean;
  months: MonthCell[]; // 12 posições
  ytd: MonthCell; // coluna "2026" (taxa média do ano — NÃO é soma dos meses)
};

export type CogsData = {
  lines: CogsLine[];
  /** Meta total da área (linha "COGS OPS", coluna Budget). */
  meta: { months: (number | null)[]; ytd: number | null };
};

/**
 * Localiza a âncora "COGS./VHC" e mapeia as colunas de cada mês.
 * Cada mês ocupa 4 colunas: [Budget, Real, Delta%, DeltaR$].
 * A coluna do ano ("2026") fica no fim da linha.
 * Nunca usamos números de linha fixos: tudo é buscado por nome.
 */
function locateCogsLayout(rows: string[][]) {
  let anchor = -1;
  for (let r = 0; r < rows.length; r++) {
    if ((rows[r] ?? []).some((c) => norm(c) === "cogs./vhc")) {
      anchor = r;
      break;
    }
  }
  if (anchor === -1) {
    throw new Error('Não encontrei a linha âncora "COGS./VHC" na planilha de COGS.');
  }

  // Procura a linha de cabeçalho de meses (a própria âncora, a anterior ou a seguinte).
  const candidates = [anchor, anchor - 1, anchor + 1, anchor - 2].filter(
    (r) => r >= 0 && r < rows.length,
  );

  let monthStarts: number[] = [];
  let yearCol = -1;
  let headerRow = anchor;

  for (const r of candidates) {
    const row = rows[r] ?? [];
    const found: number[] = [];
    for (let m = 0; m < 12; m++) {
      const aliases = MONTH_ALIASES[m] ?? [];
      const idx = row.findIndex((cell, ci) => {
        if (ci <= 0 || found.some((f) => f >= ci)) return false;
        const v = norm(cell);
        return aliases.some((a) => v === a || v.startsWith(`${a}/`) || v.startsWith(`${a} `));
      });
      if (idx >= 0) found.push(idx);
    }
    if (found.length === 12) {
      monthStarts = found;
      headerRow = r;
      yearCol = row.findIndex((c) => norm(c) === String(YEAR));
      break;
    }
  }

  if (monthStarts.length !== 12) {
    // Fallback determinístico: 12 blocos de 4 colunas a partir da coluna 1.
    const row = rows[headerRow] ?? [];
    monthStarts = Array.from({ length: 12 }, (_, m) => 1 + m * 4);
    yearCol = row.findIndex((c) => norm(c) === String(YEAR));
  }
  if (yearCol < 0) {
    const lastStart = monthStarts[11] ?? 45;
    yearCol = lastStart + 4;
  }

  return { anchor, monthStarts, yearCol };
}

function findRowByName(rows: string[][], from: number, name: string) {
  const target = norm(name);
  for (let r = from; r < rows.length; r++) {
    const cells = rows[r] ?? [];
    for (let c = 0; c < Math.min(cells.length, 4); c++) {
      if (norm(cells[c] ?? "") === target) return r;
    }
  }
  return -1;
}

function readLine(
  rows: string[][],
  rowIndex: number,
  monthStarts: number[],
  yearCol: number,
): { months: MonthCell[]; ytd: MonthCell } {
  const cells = rows[rowIndex] ?? [];
  const months: MonthCell[] = monthStarts.map((start) => ({
    budget: toNumber(cells[start]),
    real: toNumber(cells[start + 1]),
  }));
  return {
    months,
    ytd: { budget: toNumber(cells[yearCol]), real: toNumber(cells[yearCol + 1]) },
  };
}

export async function fetchCogs(): Promise<CogsData> {
  const rows = await fetchCsv(COGS_SHEET_ID, COGS_SHEET_TAB);
  const { anchor, monthStarts, yearCol } = locateCogsLayout(rows);

  const lines: CogsLine[] = [];
  for (const name of COGS_ALL_LINES) {
    const r = findRowByName(rows, anchor, name);
    if (r === -1) continue;
    const { months, ytd } = readLine(rows, r, monthStarts, yearCol);
    lines.push({
      name,
      inScope: !(["Points of Location", "Monitoring Services"] as string[]).includes(name),
      months,
      ytd,
    });
  }

  const metaRow = findRowByName(rows, anchor, COGS_META_ROW);
  const meta =
    metaRow === -1
      ? { months: Array<number | null>(12).fill(null), ytd: null }
      : (() => {
          const { months, ytd } = readLine(rows, metaRow, monthStarts, yearCol);
          return { months: months.map((m) => m.budget), ytd: ytd.budget };
        })();

  if (lines.length === 0) {
    throw new Error("Encontrei a âncora, mas nenhuma das 9 linhas de COGS pelo nome.");
  }

  return { lines, meta };
}

/* -------------------------------------------------------------------------- */
/* Metas (2ª planilha)                                                         */
/* -------------------------------------------------------------------------- */

export type Meta = { annual: number | null; months: (number | null)[] };

export type MetasData = {
  indisponibilidade: Meta;
  wash: Meta;
  damage: Meta;
  pod: Meta;
  apvTotal: Meta;
};

const EMPTY_META: Meta = { annual: null, months: Array<number | null>(12).fill(null) };

const COL_B = 1;
const COL_F = 5;
const COL_K = 10; // K:V = 12 meses

function readMetaRow(row: string[]): Meta {
  return {
    annual: toNumber(row[COL_F]),
    months: Array.from({ length: 12 }, (_, i) => toNumber(row[COL_K + i])),
  };
}

function findMeta(rows: string[][], indicator: string, requirePercent = false): Meta {
  const target = norm(indicator);
  const matches = rows.filter((r) => norm(r[COL_B] ?? "") === target);
  if (matches.length === 0) return EMPTY_META;
  // Damage aparece 2x na aba Fleet: só vale a versão cuja meta anual tem "%".
  const chosen = requirePercent
    ? (matches.find((r) => (r[COL_F] ?? "").includes("%")) ?? matches[0])
    : matches[0];
  return chosen ? readMetaRow(chosen) : EMPTY_META;
}

function sumMetas(list: Meta[]): Meta {
  const sumOrNull = (vals: (number | null)[]) => {
    const valid = vals.filter((v): v is number => v !== null);
    return valid.length === 0 ? null : valid.reduce((a, b) => a + b, 0);
  };
  return {
    annual: sumOrNull(list.map((m) => m.annual)),
    months: Array.from({ length: 12 }, (_, i) => sumOrNull(list.map((m) => m.months[i] ?? null))),
  };
}

export async function fetchMetas(): Promise<MetasData> {
  const [ops, fleet] = await Promise.all([
    fetchCsv(METAS_SHEET_ID, METAS_TAB_OPS),
    fetchCsv(METAS_SHEET_ID, METAS_TAB_FLEET),
  ]);

  const indisponibilidade = findMeta(ops, "Indisponibilidade");
  const wash = findMeta(ops, "Wash");
  const damage = findMeta(fleet, "Damage", true);
  const pod = findMeta(fleet, "POD");

  return {
    indisponibilidade,
    wash,
    damage,
    pod,
    apvTotal: sumMetas([wash, damage, pod]),
  };
}
