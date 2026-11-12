import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, RefreshCw } from "lucide-react";
import { fetchAPI } from "@/lib/api";
import type { PortfolioSummary } from "@/components/portfolio/portfolio.types";
import { PortfolioSummaryCards, PortfolioSummarySkeleton } from "@/components/portfolio/PortfolioSummaryCards";
import { ClosedPositionsTable, PortfolioTable } from "@/components/portfolio/PortfolioTable";
import { TableSkeleton } from "@/components/common/TableSkeleton";
import { PortfolioPerformanceChart } from "@/components/reports/PortfolioPerformanceChart";
import { Button } from "@/components/ui/button";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";

function ValuationStatus({ summary }: { summary: PortfolioSummary }) {
    const { valuation } = summary;
    const complete = valuation.status === "fresh";
    const date = valuation.asOf
        ? new Intl.DateTimeFormat("es-ES", { dateStyle: "medium" }).format(new Date(valuation.asOf))
        : "sin fecha disponible";
    const sources = valuation.sources.map((source) => source.toUpperCase()).join(" + ") || "sin fuente";
    const message = valuation.status === "partial"
        ? `Valoración incompleta: faltan ${valuation.missingSymbols.join(", ")}.`
        : valuation.status === "unavailable"
            ? "No se ha podido obtener ninguna cotización actual."
            : valuation.status === "stale"
                ? `Las cotizaciones tienen ${valuation.ageDays} días de antigüedad.`
                : valuation.status === "delayed"
                    ? `Las cotizaciones tienen ${valuation.ageDays} días de antigüedad.`
                    : "Todas las posiciones abiertas tienen cotización.";

    return (
        <div className={`flex items-start gap-3 border-l-2 px-3 py-2 text-sm ${complete ? "border-emerald-500" : "border-amber-500"}`}>
            {complete ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />}
            <div>
                <p className="font-medium">{message}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">Datos a {date} / fuentes: {sources}</p>
            </div>
        </div>
    );
}

export default function PortfolioPage() {
    const [summary, setSummary] = useState<PortfolioSummary | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [method, setMethod] = useState<string>("FIFO");

    const loadSummary = useCallback(async () => {
        setLoading(true);
        try {
            const data = await fetchAPI<PortfolioSummary>(`/portfolio/summary?method=${method}&_t=${Date.now()}`, { cache: "no-store" });
            setSummary(data);
            setError(null);
        } catch (loadError) {
            console.error(loadError);
            setError("No se ha podido cargar la cartera.");
        } finally {
            setLoading(false);
        }
    }, [method]);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch the selected accounting method from the API
        void loadSummary();
    }, [loadSummary]);

    const openHoldings = summary?.holdings.filter((holding) => holding.remainingShares > 0) ?? [];
    const closedPositions = summary?.holdings.filter((holding) => holding.remainingShares <= 0 && holding.realizedGain !== 0) ?? [];

    return (
        <div className="space-y-10 px-4 py-6 md:px-8 md:py-10">
            <header className="flex flex-col gap-5 border-b border-border pb-7 md:flex-row md:items-end md:justify-between">
                <div>
                    <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">Patrimonio</p>
                    <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] md:text-4xl">Inversiones</h1>
                    <p className="mt-2 max-w-xl text-sm text-muted-foreground">Valoración, rentabilidad y posiciones con una única base de cálculo en euros.</p>
                </div>
                <div className="flex items-end gap-2">
                    <label className="grid gap-1 text-xs text-muted-foreground">
                        Método fiscal
                        <Select value={method} onValueChange={setMethod}>
                            <SelectTrigger className="w-[190px] bg-transparent"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="FIFO">FIFO</SelectItem>
                                <SelectItem value="WeightedAverage">Precio medio ponderado</SelectItem>
                            </SelectContent>
                        </Select>
                    </label>
                    <Button variant="outline" size="icon" onClick={loadSummary} disabled={loading} aria-label="Actualizar valoración">
                        <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                    </Button>
                </div>
            </header>

            {error && <div className="border-l-2 border-rose-500 px-4 py-2 text-sm text-rose-600 dark:text-rose-400">{error}</div>}

            {loading && !summary ? (
                <div className="space-y-10"><PortfolioSummarySkeleton /><TableSkeleton columns={6} rows={5} /></div>
            ) : summary && (
                <>
                    <div className="space-y-4">
                        <PortfolioSummaryCards summary={summary} />
                        <ValuationStatus summary={summary} />
                    </div>

                    <PortfolioPerformanceChart />

                    <section>
                        <div className="mb-4 flex items-baseline justify-between border-b border-border pb-3">
                            <h2 className="text-xl font-semibold tracking-tight">Posiciones abiertas</h2>
                            <span className="text-xs text-muted-foreground">{openHoldings.length} activos</span>
                        </div>
                        {openHoldings.length > 0
                            ? <PortfolioTable holdings={openHoldings} valuation={summary.valuation} />
                            : <p className="py-6 text-sm text-muted-foreground">No hay posiciones abiertas.</p>}
                    </section>

                    <section>
                        <div className="mb-1 flex items-baseline justify-between border-b border-border pb-3">
                            <h2 className="text-xl font-semibold tracking-tight">Posiciones cerradas</h2>
                            <span className="text-xs text-muted-foreground">{closedPositions.length} activos</span>
                        </div>
                        {closedPositions.length > 0
                            ? <ClosedPositionsTable holdings={closedPositions} />
                            : <p className="py-6 text-sm text-muted-foreground">No hay posiciones cerradas.</p>}
                    </section>
                </>
            )}
        </div>
    );
}
