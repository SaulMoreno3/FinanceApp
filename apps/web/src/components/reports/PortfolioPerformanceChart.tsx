import { useCallback, useEffect, useMemo, useState } from "react";
import { Area, AreaChart, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertTriangle, DatabaseZap, LoaderCircle, RefreshCw, X } from "lucide-react";
import { fetchAPI } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

const ranges = ["1D", "1W", "1M", "YTD", "1Y", "MAX"] as const;
type HistoryRange = typeof ranges[number];
type ChartMode = "AMOUNT" | "PERCENT";

type HistoryPoint = {
    date: string;
    marketValue: number;
    investedCapital: number;
    performanceAmount: number;
    performancePercent: number;
    hasEstimates: boolean;
};

type PortfolioHistory = {
    currency: "EUR";
    range: HistoryRange;
    currentValue: number;
    periodChange: number;
    periodChangePercent: number | null;
    returnMethod: "TTWROR";
    hasEstimates: boolean;
    coverageStart: string;
    coverageEnd: string;
    dataQuality: {
        status: "fresh" | "delayed" | "stale";
        ageDays: number;
        snapshotAsOf: string;
        oldestPriceAsOf: string | null;
    };
    points: HistoryPoint[];
};

type PointerEvent = { activeLabel?: string | number };

const euros = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 2 });
const signedEuros = (value: number) => `${value >= 0 ? "+" : ""}${euros.format(value)}`;
const signedPercent = (value: number | null) => value === null ? "-" : `${value >= 0 ? "+" : ""}${value.toFixed(2)} %`;

function dateLabel(value: string, range: HistoryRange) {
    return new Intl.DateTimeFormat("es-ES", range === "MAX" || range === "1Y"
        ? { month: "short", year: "2-digit" }
        : { day: "2-digit", month: "short" }).format(new Date(`${value}T12:00:00Z`));
}

function ChartTooltip({ active, payload, mode }: {
    active?: boolean;
    payload?: Array<{ payload: HistoryPoint }>;
    mode: ChartMode;
}) {
    const point = payload?.[0]?.payload;
    if (!active || !point) return null;
    return (
        <div className="min-w-52 border border-border bg-popover p-3 text-popover-foreground shadow-xl">
            <p className="text-xs text-muted-foreground">{new Intl.DateTimeFormat("es-ES", { dateStyle: "medium" }).format(new Date(`${point.date}T12:00:00Z`))}</p>
            <p className="mt-1 text-base font-semibold tabular-nums">{mode === "AMOUNT" ? signedEuros(point.performanceAmount) : signedPercent(point.performancePercent)}</p>
            <dl className="mt-3 grid grid-cols-2 gap-x-5 gap-y-1 text-xs">
                <dt className="text-muted-foreground">Valor</dt><dd className="text-right tabular-nums">{euros.format(point.marketValue)}</dd>
                <dt className="text-muted-foreground">Capital</dt><dd className="text-right tabular-nums">{euros.format(point.investedCapital)}</dd>
            </dl>
        </div>
    );
}

export function PortfolioPerformanceChart() {
    const [range, setRange] = useState<HistoryRange>("YTD");
    const [mode, setMode] = useState<ChartMode>("PERCENT");
    const [history, setHistory] = useState<PortfolioHistory | null>(null);
    const [loading, setLoading] = useState(true);
    const [syncing, setSyncing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [selection, setSelection] = useState<{ start: string; end: string } | null>(null);
    const [dragStart, setDragStart] = useState<string | null>(null);

    const loadHistory = useCallback(async (selectedRange: HistoryRange) => {
        setLoading(true);
        setError(null);
        try {
            setHistory(await fetchAPI<PortfolioHistory>(`/portfolio/history?range=${selectedRange}`, { cache: "no-store" }));
        } catch (loadError) {
            setError(loadError instanceof Error ? loadError.message : "El histórico no está disponible.");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch remote history when the selected range changes
        void loadHistory(range);
    }, [loadHistory, range]);

    const synchronize = async () => {
        setSyncing(true);
        setError(null);
        try {
            await fetchAPI("/portfolio/history/sync", { method: "POST" });
            await loadHistory(range);
        } catch (syncError) {
            setError(syncError instanceof Error ? syncError.message : "No se han podido actualizar los datos de mercado.");
        } finally {
            setSyncing(false);
        }
    };

    const points = useMemo(() => history?.points.map((point) => ({
        ...point,
        chartValue: mode === "AMOUNT" ? point.performanceAmount : point.performancePercent,
    })) ?? [], [history, mode]);
    const values = points.map((point) => point.chartValue);
    const minimum = Math.min(0, ...values);
    const maximum = Math.max(0, ...values);
    const padding = Math.max((maximum - minimum) * 0.12, 0.5);
    const positive = (mode === "AMOUNT" ? history?.periodChange : history?.periodChangePercent) as number | null | undefined;
    const lineColor = (positive ?? 0) >= 0 ? "#10b981" : "#f43f5e";
    const selected = useMemo(() => {
        if (!selection) return null;
        const startIndex = points.findIndex((point) => point.date === selection.start);
        const endIndex = points.findIndex((point) => point.date === selection.end);
        if (startIndex < 0 || endIndex < 0 || startIndex === endIndex) return null;
        const first = points[Math.min(startIndex, endIndex)];
        const last = points[Math.max(startIndex, endIndex)];
        return { first, last, difference: last.chartValue - first.chartValue };
    }, [points, selection]);
    const activeDate = (event: unknown) => {
        const label = (event as PointerEvent | undefined)?.activeLabel;
        return typeof label === "string" ? label : null;
    };

    return (
        <section className="border-y border-border py-6" aria-label="Rendimiento histórico">
            <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
                <div>
                    <div className="flex flex-wrap items-center gap-2">
                        <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">Rendimiento</p>
                        {history?.hasEstimates && <span className="border border-amber-500/30 px-1.5 py-0.5 text-[10px] text-amber-600 dark:text-amber-400">Cambio histórico estimado</span>}
                    </div>
                    {loading && !history ? <Skeleton className="mt-3 h-11 w-48" /> : history && (
                        <>
                            <p className="mt-2 text-4xl font-semibold tracking-[-0.05em] tabular-nums">{mode === "AMOUNT" ? signedEuros(history.periodChange) : signedPercent(history.periodChangePercent)}</p>
                            <p className="mt-2 text-sm text-muted-foreground">
                                {mode === "AMOUNT" ? `TTWR ${signedPercent(history.periodChangePercent)}` : `Resultado ${signedEuros(history.periodChange)}`}
                                <span className="mx-2">/</span>Cierre del periodo {euros.format(history.currentValue)}
                            </p>
                        </>
                    )}
                </div>

                <div className="flex flex-wrap items-center gap-1">
                    <div className="mr-2 flex border border-border p-0.5">
                        <button type="button" onClick={() => setMode("AMOUNT")} className={`px-2.5 py-1.5 text-xs ${mode === "AMOUNT" ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"}`}>Resultado</button>
                        <button type="button" onClick={() => setMode("PERCENT")} className={`px-2.5 py-1.5 text-xs ${mode === "PERCENT" ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"}`}>Rentabilidad</button>
                    </div>
                    {ranges.map((item) => (
                        <button key={item} type="button" onClick={() => { setSelection(null); setRange(item); }} disabled={loading} className={`px-2.5 py-2 text-xs font-medium ${range === item ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"}`}>{item === "MAX" ? "Todo" : item}</button>
                    ))}
                    <Button variant="ghost" size="icon" onClick={synchronize} disabled={syncing} aria-label="Sincronizar histórico">
                        {syncing ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                    </Button>
                </div>
            </div>

            {history && history.dataQuality.status !== "fresh" && (
                <div className="mt-5 flex items-start gap-2 border-l-2 border-amber-500 px-3 py-1.5 text-xs">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
                    <span>Histórico {history.dataQuality.status === "stale" ? "desactualizado" : "con retraso"}: el último snapshot tiene {history.dataQuality.ageDays} días. La gráfica no finge datos posteriores.</span>
                </div>
            )}

            {error ? (
                <div className="mt-6 flex min-h-72 flex-col items-center justify-center border border-dashed border-border text-center">
                    <AlertTriangle className="h-5 w-5 text-rose-500" /><p className="mt-3 text-sm font-medium">No se puede mostrar el histórico</p><p className="mt-1 max-w-md text-xs text-muted-foreground">{error}</p>
                    <Button className="mt-4" size="sm" variant="outline" onClick={() => loadHistory(range)}>Reintentar</Button>
                </div>
            ) : loading && !history ? (
                <Skeleton className="mt-6 h-[340px] w-full" />
            ) : history?.points.length ? (
                <div className="relative mt-5 h-[330px] w-full cursor-crosshair select-none md:h-[390px]">
                    {selected && (
                        <div className="absolute left-1/2 top-2 z-10 flex -translate-x-1/2 items-center gap-4 border border-border bg-popover px-3 py-2 text-xs shadow-lg">
                            <span className="text-muted-foreground">Cambio seleccionado</span>
                            <strong className="tabular-nums">{mode === "AMOUNT" ? signedEuros(selected.difference) : `${selected.difference >= 0 ? "+" : ""}${selected.difference.toFixed(2)} pp`}</strong>
                            <button type="button" onClick={() => setSelection(null)} aria-label="Borrar selección"><X className="h-3.5 w-3.5" /></button>
                        </div>
                    )}
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={points} margin={{ top: 28, right: 4, left: 4, bottom: 8 }}
                            onMouseDown={(event) => setDragStart(activeDate(event))}
                            onMouseMove={(event) => { const end = activeDate(event); if (dragStart && end) setSelection({ start: dragStart, end }); }}
                            onMouseUp={() => setDragStart(null)} onMouseLeave={() => setDragStart(null)}>
                            <defs><linearGradient id="portfolioFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={lineColor} stopOpacity={0.16} /><stop offset="90%" stopColor={lineColor} stopOpacity={0} /></linearGradient></defs>
                            <XAxis dataKey="date" axisLine={false} tickLine={false} minTickGap={48} tick={{ fill: "currentColor", fontSize: 10 }} tickFormatter={(value) => dateLabel(value, range)} />
                            <YAxis hide domain={[minimum - padding, maximum + padding]} />
                            <ReferenceLine y={0} stroke="currentColor" strokeDasharray="2 5" strokeOpacity={0.25} />
                            {selected && <ReferenceArea x1={selected.first.date} x2={selected.last.date} fill={lineColor} fillOpacity={0.07} stroke="none" />}
                            <Tooltip content={<ChartTooltip mode={mode} />} cursor={{ stroke: "currentColor", strokeDasharray: "3 5", strokeOpacity: 0.3 }} />
                            <Area type="monotone" dataKey="chartValue" stroke={lineColor} strokeWidth={2.25} fill="url(#portfolioFill)" dot={false} activeDot={{ r: 3.5, fill: lineColor, strokeWidth: 0 }} isAnimationActive={false} />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            ) : (
                <div className="mt-6 flex min-h-72 flex-col items-center justify-center border border-dashed border-border text-center"><DatabaseZap className="h-5 w-5 text-muted-foreground" /><p className="mt-3 text-sm text-muted-foreground">No hay precios históricos en este periodo.</p></div>
            )}

            {history && (
                <div className="mt-3 flex flex-wrap justify-between gap-2 border-t border-border pt-3 text-[11px] text-muted-foreground">
                    <span>TTWR neutraliza aportaciones y retiradas para medir solo el rendimiento.</span>
                    <span>{history.coverageStart} - {history.coverageEnd}</span>
                </div>
            )}
        </section>
    );
}
