/**
 * Cliente da Edge Function (Supabase próprio) que consulta o BigQuery.
 * O navegador nunca vê a credencial: ela vive como secret da function.
 */
import { BQ_FUNCTION_NAME, SUPABASE_ANON_KEY, SUPABASE_URL, isBqConfigured } from "./config";

export type IndispRow = { mes: string; categoria: string; pct: number };
export type ClaimRow = { mes: string; componente: string; pct: number };

export type BqPayload = {
  indisponibilidade: { nacional: IndispRow[]; campinas: IndispRow[] };
  claim: { nacional: ClaimRow[]; campinas: ClaimRow[] };
};

export class BqNotConfiguredError extends Error {
  constructor() {
    super(
      "BigQuery ainda não está configurado: falta a URL do projeto Supabase, a anon key e/ou o secret da service account do GCP.",
    );
    this.name = "BqNotConfiguredError";
  }
}

export async function fetchBigQuery(year: number): Promise<BqPayload> {
  if (!isBqConfigured()) throw new BqNotConfiguredError();

  const res = await fetch(`${SUPABASE_URL}/functions/v1/${BQ_FUNCTION_NAME}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      apikey: SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ year }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Falha ao consultar o BigQuery [${res.status}]: ${body}`);
  }
  return (await res.json()) as BqPayload;
}
