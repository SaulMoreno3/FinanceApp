import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import type { Holding, PortfolioValuation } from "@/components/portfolio/portfolio.types";
import { Link } from "react-router-dom";

const euros = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 2 });
const nativeMoney = (value: number, currency: string) => new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency,
    maximumFractionDigits: 4,
}).format(value);

function Result({ value, percent }: { value: number | null; percent?: number | null }) {
    if (value === null) return <span className="text-muted-foreground">No disponible</span>;
    return (
        <span className={value >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}>
            {value >= 0 ? "+" : ""}{euros.format(value)}
            {percent !== undefined && percent !== null && (
                <span className="ml-1.5 text-xs font-normal opacity-80">{percent >= 0 ? "+" : ""}{percent.toFixed(2)} %</span>
            )}
        </span>
    );
}

export function PortfolioTable({ holdings, valuation }: { holdings: Holding[]; valuation: PortfolioValuation }) {
    return (
        <div className="overflow-x-auto">
            <Table className="min-w-[820px]">
                <TableHeader>
                    <TableRow className="hover:bg-transparent">
                        <TableHead>Activo</TableHead>
                        <TableHead className="text-right">Unidades</TableHead>
                        <TableHead className="text-right">Último precio</TableHead>
                        <TableHead className="text-right">Valor en EUR</TableHead>
                        <TableHead className="text-right">Coste en EUR</TableHead>
                        <TableHead className="text-right">Resultado</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {holdings.map((holding) => {
                        const position = valuation.positions[holding.symbol];
                        const quoteDate = position?.quote.asOf
                            ? new Intl.DateTimeFormat("es-ES", { dateStyle: "medium" }).format(new Date(position.quote.asOf))
                            : null;
                        return (
                            <TableRow key={holding.symbol}>
                                <TableCell className="py-4">
                                    <Link to={`/portfolio/${holding.symbol}`} className="font-medium underline-offset-4 hover:underline">
                                        {holding.name || holding.symbol}
                                    </Link>
                                    <div className="mt-0.5 text-xs text-muted-foreground">
                                        {holding.symbol}{holding.isin ? ` / ISIN ${holding.isin}` : ""}
                                    </div>
                                </TableCell>
                                <TableCell className="text-right tabular-nums">{holding.remainingShares.toLocaleString("es-ES", { maximumFractionDigits: 6 })}</TableCell>
                                <TableCell className="text-right tabular-nums">
                                    {position ? nativeMoney(position.quote.price, position.quote.currency) : <span className="text-muted-foreground">Sin cotización</span>}
                                    {position && <div className="mt-0.5 text-[11px] text-muted-foreground">{position.quote.source.toUpperCase()} / {quoteDate ?? "sin fecha"}</div>}
                                </TableCell>
                                <TableCell className="text-right font-medium tabular-nums">{position ? euros.format(position.marketValueEur) : "-"}</TableCell>
                                <TableCell className="text-right text-muted-foreground tabular-nums">{position?.costBasisEur == null ? "-" : euros.format(position.costBasisEur)}</TableCell>
                                <TableCell className="text-right font-medium tabular-nums"><Result value={position?.unrealizedGainEur ?? null} percent={position?.unrealizedGainPercent} /></TableCell>
                            </TableRow>
                        );
                    })}
                </TableBody>
            </Table>
        </div>
    );
}

export function ClosedPositionsTable({ holdings }: { holdings: Holding[] }) {
    return (
        <div className="divide-y divide-border">
            {holdings.map((holding) => {
                const gain = holding.realizedGainEur ?? (holding.currency === "EUR" ? holding.realizedGain : null);
                return (
                    <div key={holding.symbol} className="flex items-center justify-between gap-4 py-4">
                        <div className="min-w-0">
                            <Link to={`/portfolio/${holding.symbol}`} className="font-medium underline-offset-4 hover:underline">{holding.name || holding.symbol}</Link>
                            <div className="mt-0.5 text-xs text-muted-foreground">{holding.symbol}{holding.isin ? ` / ISIN ${holding.isin}` : ""}</div>
                        </div>
                        <div className="shrink-0 text-right font-medium tabular-nums"><Result value={gain} /></div>
                    </div>
                );
            })}
        </div>
    );
}
