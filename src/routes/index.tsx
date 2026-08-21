import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SectionCogs } from "@/components/rmr/SectionCogs";
import { SectionIndisponibilidade } from "@/components/rmr/SectionIndisponibilidade";
import { SectionClaim } from "@/components/rmr/SectionClaim";
import { BRAND } from "@/lib/rmr/palette";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <div className="min-h-screen" style={{ backgroundColor: BRAND.bg, color: BRAND.ink }}>
      <header
        className="sticky top-0 z-20 border-b"
        style={{ backgroundColor: BRAND.blue, borderColor: BRAND.border }}
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-3">
            <span
              className="rounded-md bg-white px-2 py-1 text-sm font-bold"
              style={{ color: BRAND.blue }}
            >
              turbi
            </span>
            <h1 className="text-base font-semibold text-white">Centro de Controle de Operações</h1>
          </div>
          <button
            type="button"
            onClick={() => setRefreshKey((k) => k + 1)}
            className="rounded-md bg-white/10 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-white/20"
          >
            🔄 Atualizar dados
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        <Tabs defaultValue="rmr">
          <TabsList>
            <TabsTrigger value="rmr">RMR</TabsTrigger>
          </TabsList>

          <TabsContent value="rmr" className="space-y-10">
            <div>
              <h2 className="mb-1 text-lg font-semibold">RMR - Painel ao vivo</h2>
              <p className="mb-4 text-sm" style={{ color: BRAND.gray }}>
                Reunião Mensal de Resultados — os 3 indicadores centrais da área.
              </p>
            </div>

            <section>
              <h2 className="mb-3 text-base font-bold">1. COGS (OPEX)</h2>
              <SectionCogs refreshKey={refreshKey} />
            </section>

            <section>
              <h2 className="mb-3 text-base font-bold">2. Indisponibilidade OPS</h2>
              <SectionIndisponibilidade refreshKey={refreshKey} />
            </section>

            <section>
              <h2 className="mb-3 text-base font-bold">3. Claim — APV (reclamação pós-viagem)</h2>
              <SectionClaim refreshKey={refreshKey} />
            </section>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
