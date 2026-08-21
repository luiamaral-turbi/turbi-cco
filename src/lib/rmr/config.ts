/**
 * Configuração de fontes de dados do Centro de Controle de Operações.
 *
 * Nada é armazenado: tudo é lido ao vivo das planilhas públicas (CSV) e do
 * BigQuery (via Edge Function do Supabase próprio do usuário).
 */

const env = import.meta.env as Record<string, string | undefined>;

export const COGS_SHEET_ID = env['VITE_COGS_SHEET_ID'] ?? "";
export const COGS_SHEET_TAB = env['VITE_COGS_SHEET_TAB'] ?? "COGS";
export const METAS_SHEET_ID = env['VITE_METAS_SHEET_ID'] ?? "";
export const METAS_TAB_OPS = env['VITE_METAS_TAB_OPS'] ?? "Metas - Operações Execução";
export const METAS_TAB_FLEET = env['VITE_METAS_TAB_FLEET'] ?? "Metas - Fleet Management";

/** Supabase próprio (NÃO Lovable Cloud) — apenas Edge Function + secrets. */
export const SUPABASE_URL = env['VITE_SUPABASE_URL'] ?? "";
export const SUPABASE_ANON_KEY = env['VITE_SUPABASE_ANON_KEY'] ?? "";
export const BQ_FUNCTION_NAME = env['VITE_BQ_FUNCTION_NAME'] ?? "bigquery-rmr";

export const YEAR = Number(env['VITE_RMR_YEAR'] ?? "2026");

export function csvUrl(sheetId: string, tab: string) {
  return `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tab)}`;
}

export const isCogsConfigured = () => COGS_SHEET_ID.length > 0;
export const isMetasConfigured = () => METAS_SHEET_ID.length > 0;
export const isBqConfigured = () => SUPABASE_URL.length > 0 && SUPABASE_ANON_KEY.length > 0;

export const MONTHS_PT = [
  "Jan",
  "Fev",
  "Mar",
  "Abr",
  "Mai",
  "Jun",
  "Jul",
  "Ago",
  "Set",
  "Out",
  "Nov",
  "Dez",
] as const;

export const MONTH_ALIASES: string[][] = [
  ["jan", "january", "janeiro"],
  ["feb", "fev", "february", "fevereiro"],
  ["mar", "march", "março", "marco"],
  ["apr", "abr", "april", "abril"],
  ["may", "mai", "maio"],
  ["jun", "june", "junho"],
  ["jul", "july", "julho"],
  ["aug", "ago", "august", "agosto"],
  ["sep", "set", "sept", "september", "setembro"],
  ["oct", "out", "october", "outubro"],
  ["nov", "november", "novembro"],
  ["dec", "dez", "december", "dezembro"],
];

/** As 7 linhas de COGS sob responsabilidade da área. */
export const COGS_LINES_IN_SCOPE = [
  "Cleaning",
  "Damage",
  "Vehicle Maintenance",
  "Vehicle Supplies",
  "Desmobilization",
  "Logistical",
  "Other COGS",
] as const;

/** As 2 linhas fora do escopo Ops. */
export const COGS_LINES_OUT_SCOPE = ["Points of Location", "Monitoring Services"] as const;

export const COGS_ALL_LINES = [...COGS_LINES_IN_SCOPE, ...COGS_LINES_OUT_SCOPE];

/** Nome da linha da planilha de COGS que carrega a meta total da área. */
export const COGS_META_ROW = "COGS OPS";

/** As 12 categorias que somam o KPI de Indisponibilidade. */
export const INDISP_CATEGORIES = [
  "Sinistro",
  "Lavagem/Preparação",
  "Prep. Desmobilização",
  "Outros",
  "Mudança de Pod",
  "Revisão",
  "Bateria baixa",
  "Manut. Pneus",
  "Sem Comunicação",
  "Manut. IOT",
  "Falha de Instalação",
  "Operational",
] as const;

export const CLAIM_COMPONENTS = ["Wash", "Damage", "POD"] as const;
