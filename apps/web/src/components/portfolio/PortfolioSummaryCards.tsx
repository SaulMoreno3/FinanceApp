import { Skeleton } from "@/components/ui/skeleton";
import type { PortfolioSummary } from "@/components/portfolio/portfolio.types";

const euros = new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
});

function signedEuros(value: number) {
    return `${value >= 0 ? "+" : ""}${euros.format(value)}`;
}

function Metric({ label, value, detail, tone = "neutral" }: {
    label: string;
    value: string;
    detail: string;
    tone?: "positive" | "negative" | "neutral";
}) {
    const toneClass = tone === "positive"
        ? "text-emerald-600 dark:text-emerald-400"
        : tone === "negative"
            ? "text-rose-600 dark:text-rose-400"
            : "text-foreground";

    return (
        <div className="min-w-0 border-t border-border py-4 md:border-l md:border-t-0 md:px-6 md:first:border-l-0 md:first:pl-0">
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
            <p className={`mt-2 truncate text-2xl font-semibold tracking-[-0.03em] tabular-nums ${toneClass}`}>{value}</p>
            <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
        </div>
    );
}

export function PortfolioSummaryCards({ summary }: { summary: PortfolioSummary }) {
    const valuation = summary.valuation;
    const realized = summary.totalRealizedGain;
    const unrealized = valuation.totalUnrealizedGain;

    return (
        <section aria-label="Resumen de la cartera" className="grid border-b border-t border-border md:grid-cols-4">
            <Metric
                label="Valor actual"
                value={valuation.totalMarketValue === null ? "Incompleto" : euros.format(valuation.totalMarketValue)}
                detail={valuation.totalMarketValue === null ? "Faltan cotizaciones" : `${Object.keys(valuation.positions).length} posiciones valoradas`}
            />
            <Metric
                label="Capital invertido"
                value={valuation.totalCostBasis === null ? "Incompleto" : euros.format(valuation.totalCostBasis)}
                detail="Coste vivo convertido a EUR"
            />
            <Metric
                label="Resultado no realizado"
                value={unrealized === null ? "Incompleto" : signedEuros(unrealized)}
                detail={valuation.totalUnrealizedGainPercent === null ? "Sin base comparable" : `${valuation.totalUnrealizedGainPercent >= 0 ? "+" : ""}${valuation.totalUnrealizedGainPercent.toFixed(2)} % sobre coste`}
                tone={unrealized === null ? "neutral" : unrealized >= 0 ? "positive" : "negative"}
            />
            <Metric
                label="Resultado realizado"
                value={realized === null ? "Incompleto" : signedEuros(realized)}
                detail="Beneficio histórico de ventas"
                tone={realized === null ? "neutral" : realized >= 0 ? "positive" : "negative"}
            />
        </section>
    );
}

export function PortfolioSummarySkeleton() {
    return (
        <div className="grid border-b border-t border-border py-4 md:grid-cols-4 md:py-0">
            {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="space-y-3 py-4 md:border-l md:px-6 md:first:border-l-0 md:first:pl-0">
                    <Skeleton className="h-3 w-28" />
                    <Skeleton className="h-8 w-36" />
                    <Skeleton className="h-3 w-32" />
                </div>
            ))}
        </div>
    );
}
