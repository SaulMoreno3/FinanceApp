import { useCallback, useEffect, useMemo, useState } from "react";
import { Area, AreaChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertCircle, DatabaseZap, LoaderCircle, RefreshCw } from "lucide-react";
import { fetchAPI } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const ranges = ["1D", "1W", "1M", "YTD", "1Y", "MAX"] as const;
type HistoryRange = typeof ranges[number];

type HistoryPoint = {
    date: string;
    marketValue: number;
    performanceValue: number;
    dailyPnl: number;
    hasEstimates: boolean;
};

type PortfolioHistory = {
    currency: "EUR";
    range: HistoryRange;
    currentValue: number;
    baselineValue: number;
    periodChange: number;
    periodChangePercent: number | null;
    hasEstimates: boolean;
    coverageStart: string;
    coverageEnd: string;
    points: HistoryPoint[];
};

const currency = new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
});

const signedCurrency = new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "EUR",
    signDisplay: "always",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
});

function dateLabel(value: string, range: HistoryRange) {
    return new Intl.DateTimeFormat("en-GB", range === "1D"
        ? { hour: "2-digit", minute: "2-digit" }
        : range === "MAX" || range === "1Y"
            ? { month: "short", year: "2-digit" }
            : { day: "2-digit", month: "short" })
        .format(new Date(`${value}T12:00:00Z`));
}

function PerformanceTooltip({ active, payload }: {
    active?: boolean;
    payload?: Array<{ payload: HistoryPoint }>;
}) {
    const point = payload?.[0]?.payload;
    if (!active || !point) return null;
    return (
        <div className="min-w-44 rounded-xl border border-border/80 bg-popover/95 p-3 shadow-2xl backdrop-blur">
            <p className="text-xs text-muted-foreground">
                {new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(new Date(`${point.date}T12:00:00Z`))}
            </p>
            <p className="mt-1.5 text-sm font-semibold tabular-nums">{currency.format(point.performanceValue)}</p>
            <div className="mt-2 flex items-center justify-between gap-4 text-[11px] text-muted-foreground">
                <span>Market value</span>
                <span className="tabular-nums">{currency.format(point.marketValue)}</span>
            </div>
        </div>
    );
}

export function PortfolioPerformanceChart() {
    const [range, setRange] = useState<HistoryRange>("YTD");
    const [history, setHistory] = useState<PortfolioHistory | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSyncing, setIsSyncing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const loadHistory = useCallback(async (selectedRange: HistoryRange) => {
        setIsLoading(true);
        setError(null);
        try {
            setHistory(await fetchAPI<PortfolioHistory>(`/portfolio/history?range=${selectedRange}`));
        } catch (loadError) {
            setError(loadError instanceof Error ? loadError.message : "Portfolio history is unavailable");
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- load remote history when the selected range changes
        void loadHistory(range);
    }, [loadHistory, range]);

    const synchronize = async () => {
        setIsSyncing(true);
        setError(null);
        try {
            await fetchAPI("/portfolio/history/sync", { method: "POST" });
            await loadHistory(range);
        } catch (syncError) {
            setError(syncError instanceof Error ? syncError.message : "Market data could not be synchronized");
        } finally {
            setIsSyncing(false);
        }
    };

    const positive = (history?.periodChange ?? 0) >= 0;
    const lineColor = positive ? "#4ade80" : "#fb7185";
    const domain = useMemo<[number, number] | undefined>(() => {
        if (!history?.points.length) return undefined;
        const values = history.points.map((point) => point.performanceValue);
        const minimum = Math.min(...values, history.baselineValue);
        const maximum = Math.max(...values, history.baselineValue);
        const padding = Math.max((maximum - minimum) * 0.16, Math.max(maximum, 1) * 0.008);
        return [minimum - padding, maximum + padding];
    }, [history]);

    return (
        <Card className="relative overflow-hidden border-border/70 bg-[#202121] text-white shadow-2xl shadow-black/10 dark:bg-[#1d1e1e]">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_14%_0%,rgba(74,222,128,0.08),transparent_34%)]" />
            <CardContent className="relative p-0">
                <div className="flex flex-col gap-5 px-5 pb-2 pt-5 md:flex-row md:items-start md:justify-between md:px-7 md:pt-7">
                    <div>
                        <div className="flex items-center gap-2">
                            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-400">Portfolio performance</p>
                            {history?.hasEstimates && (
                                <Badge variant="outline" className="h-5 border-amber-400/20 bg-amber-400/10 px-1.5 text-[9px] uppercase tracking-wider text-amber-300">
                                    Estimated FX
                                </Badge>
                            )}
                        </div>
                        {isLoading && !history ? (
                            <div className="mt-3 space-y-2"><Skeleton className="h-10 w-48 bg-zinc-700" /><Skeleton className="h-5 w-36 bg-zinc-800" /></div>
                        ) : history ? (
                            <>
                                <p className="mt-2 text-4xl font-light tracking-[-0.04em] tabular-nums md:text-5xl">
                                    {currency.format(history.currentValue)}
                                </p>
                                <div className={`mt-2 flex items-center gap-2 text-sm font-semibold tabular-nums ${positive ? "text-green-400" : "text-rose-400"}`}>
                                    <span>{positive ? "↗" : "↘"} {history.periodChangePercent === null ? "—" : `${Math.abs(history.periodChangePercent).toFixed(2)}%`}</span>
                                    <span>({signedCurrency.format(history.periodChange)})</span>
                                </div>
                            </>
                        ) : null}
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                        {ranges.map((item) => (
                            <button
                                key={item}
                                type="button"
                                onClick={() => setRange(item)}
                                disabled={isLoading}
                                className={`rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${range === item ? "bg-zinc-600 text-white shadow-inner" : "text-zinc-400 hover:bg-white/[0.06] hover:text-zinc-200"}`}
                            >
                                {item === "MAX" ? "Max" : item}
                            </button>
                        ))}
                        <Button
                            size="sm"
                            variant="ghost"
                            className="ml-1 h-8 text-zinc-400 hover:bg-white/[0.06] hover:text-white"
                            onClick={synchronize}
                            disabled={isSyncing}
                            title="Synchronize market history"
                        >
                            {isSyncing ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                        </Button>
                    </div>
                </div>

                {error ? (
                    <div className="mx-5 my-8 flex min-h-64 flex-col items-center justify-center rounded-2xl border border-rose-400/15 bg-rose-400/[0.05] px-6 text-center md:mx-7">
                        <AlertCircle className="h-6 w-6 text-rose-400" />
                        <p className="mt-3 text-sm font-medium">Historical performance unavailable</p>
                        <p className="mt-1 max-w-md text-xs text-zinc-400">{error}</p>
                        <Button size="sm" variant="outline" className="mt-4 border-zinc-700 bg-zinc-900/50 text-white" onClick={() => loadHistory(range)}>Retry</Button>
                    </div>
                ) : isLoading && !history ? (
                    <div className="px-5 pb-6 md:px-7"><Skeleton className="h-[320px] w-full bg-zinc-800" /></div>
                ) : history?.points.length ? (
                    <div className="h-[330px] w-full md:h-[390px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={history.points} margin={{ top: 30, right: 0, left: 0, bottom: 10 }}>
                                <defs>
                                    <linearGradient id="portfolioPerformanceFill" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor={lineColor} stopOpacity={0.13} />
                                        <stop offset="78%" stopColor={lineColor} stopOpacity={0.015} />
                                    </linearGradient>
                                </defs>
                                <XAxis
                                    dataKey="date"
                                    axisLine={false}
                                    tickLine={false}
                                    minTickGap={48}
                                    tick={{ fill: "#71717a", fontSize: 10 }}
                                    tickFormatter={(value) => dateLabel(value, range)}
                                    padding={{ left: 4, right: 4 }}
                                />
                                <YAxis hide domain={domain} />
                                <ReferenceLine y={history.baselineValue} stroke="#a1a1aa" strokeDasharray="2 5" strokeOpacity={0.48} />
                                <Tooltip content={<PerformanceTooltip />} cursor={{ stroke: "#a1a1aa", strokeDasharray: "3 5", strokeOpacity: 0.4 }} />
                                <Area
                                    type="monotone"
                                    dataKey="performanceValue"
                                    stroke={lineColor}
                                    strokeWidth={2.5}
                                    fill="url(#portfolioPerformanceFill)"
                                    dot={false}
                                    activeDot={{ r: 4, fill: lineColor, stroke: "#202121", strokeWidth: 2 }}
                                    isAnimationActive
                                    animationDuration={450}
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                ) : (
                    <div className="mx-5 my-8 flex min-h-64 flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-700 text-center md:mx-7">
                        <DatabaseZap className="h-6 w-6 text-zinc-500" />
                        <p className="mt-3 text-sm text-zinc-300">No historical prices in this range</p>
                    </div>
                )}

                {history && (
                    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.06] px-5 py-3 text-[10px] text-zinc-500 md:px-7">
                        <span>Market closes · Cash flows excluded from performance</span>
                        <span>{history.coverageStart} — {history.coverageEnd}</span>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
