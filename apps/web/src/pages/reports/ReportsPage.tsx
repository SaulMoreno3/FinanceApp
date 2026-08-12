import { useCallback, useEffect, useMemo, useState } from "react";
import {
    Activity,
    ArrowDownRight,
    ArrowUpRight,
    Banknote,
    BriefcaseBusiness,
    CircleDollarSign,
    TrendingUp,
    Wallet,
} from "lucide-react";
import { fetchAPI } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import type { NetWorthSummary } from "@/components/net-worth/net-worth.types";
import type { PortfolioSummary } from "@/components/portfolio/portfolio.types";
import type { SalaryListResponse } from "@/components/salary/salary.types";
import {
    AssetAllocationChart,
    PortfolioExposureChart,
    SalaryTrendChart,
} from "@/components/reports/ReportCharts";
import { PortfolioPerformanceChart } from "@/components/reports/PortfolioPerformanceChart";

interface Transaction {
    id: string;
    date: string;
    currency: string;
    symbol?: string;
    name?: string | null;
    isin?: string | null;
    type: string;
    side?: string;
    value: number;
}

interface TransactionsResponse {
    data: Transaction[];
}

interface ReportData {
    netWorth: NetWorthSummary;
    portfolio: PortfolioSummary;
    salaries: SalaryListResponse;
    transactions: TransactionsResponse;
}

type ReportSection = keyof ReportData;
type MetricTone = "violet" | "blue" | "emerald" | "amber";

const emptyNetWorth: NetWorthSummary = {
    totalCurrentNetWorth: 0,
    countActive: 0,
    countSold: 0,
    breakdownByCategory: [],
    totalsByCurrency: {},
};

const emptyPortfolio: PortfolioSummary = {
    currency: "EUR",
    method: "FIFO",
    totalRealizedGain: null,
    totalCostBasis: null,
    conversionComplete: true,
    holdings: [],
};

const emptySalaries: SalaryListResponse = {
    data: [],
    meta: { total: 0, page: 1, limit: 100, totalPages: 0 },
};

const emptyTransactions: TransactionsResponse = { data: [] };

const numberFormatter = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 2 });

function formatCurrency(value: number | null | undefined, currency = "EUR") {
    return new Intl.NumberFormat("en-GB", {
        style: "currency",
        currency,
        maximumFractionDigits: 2,
    }).format(value ?? 0);
}

function formatDate(value: string) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    return new Intl.DateTimeFormat("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
    }).format(date);
}

function displayTransactionType(type: string, side?: string) {
    if (type === "InternalTransfer") return side === "Buy" ? "Transfer in" : "Transfer out";
    return side || type;
}

function transactionIsPositive(transaction: Transaction) {
    return transaction.side === "Sell" || transaction.type === "Dividend" || transaction.type === "Income";
}

const metricStyles: Record<MetricTone, { glow: string; icon: string; accent: string }> = {
    violet: {
        glow: "from-violet-500/20 via-violet-500/[0.04] to-transparent",
        icon: "border-violet-500/20 bg-violet-500/10 text-violet-400",
        accent: "bg-violet-500",
    },
    blue: {
        glow: "from-blue-500/20 via-blue-500/[0.04] to-transparent",
        icon: "border-blue-500/20 bg-blue-500/10 text-blue-400",
        accent: "bg-blue-500",
    },
    emerald: {
        glow: "from-emerald-500/20 via-emerald-500/[0.04] to-transparent",
        icon: "border-emerald-500/20 bg-emerald-500/10 text-emerald-400",
        accent: "bg-emerald-500",
    },
    amber: {
        glow: "from-amber-500/20 via-amber-500/[0.04] to-transparent",
        icon: "border-amber-500/20 bg-amber-500/10 text-amber-400",
        accent: "bg-amber-500",
    },
};

function MetricCard({
    title,
    value,
    description,
    icon: Icon,
    tone,
    valueClassName = "",
}: {
    title: string;
    value: string;
    description: string;
    icon: typeof Wallet;
    tone: MetricTone;
    valueClassName?: string;
}) {
    const styles = metricStyles[tone];
    return (
        <Card className="group relative overflow-hidden border-border/70 bg-card/80 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-border hover:shadow-xl hover:shadow-black/10">
            <div className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${styles.glow} opacity-70 transition-opacity group-hover:opacity-100`} />
            <div className={`absolute inset-x-0 top-0 h-0.5 ${styles.accent}`} />
            <CardContent className="relative p-5">
                <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">{title}</p>
                        <p className={`mt-3 truncate text-2xl font-bold tracking-tight xl:text-[1.7rem] ${valueClassName}`}>{value}</p>
                        <p className="mt-2 text-xs text-muted-foreground">{description}</p>
                    </div>
                    <div className={`shrink-0 rounded-xl border p-2.5 ${styles.icon}`}>
                        <Icon className="h-4 w-4" />
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}

function LoadingState() {
    return (
        <div className="space-y-6">
            <Skeleton className="h-52 w-full rounded-3xl" />
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                {[1, 2, 3, 4].map((item) => <Skeleton key={item} className="h-36 rounded-xl" />)}
            </div>
            <div className="grid gap-6 lg:grid-cols-2">
                {[1, 2].map((item) => <Skeleton key={item} className="h-[390px] rounded-xl" />)}
            </div>
        </div>
    );
}

export default function ReportsPage() {
    const [data, setData] = useState<ReportData | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [sectionErrors, setSectionErrors] = useState<Partial<Record<ReportSection, string>>>({});

    const loadReports = useCallback(async () => {
        setIsLoading(true);
        const requests = {
            netWorth: fetchAPI<NetWorthSummary>("/networth/summary"),
            portfolio: fetchAPI<PortfolioSummary>("/portfolio/summary?method=FIFO"),
            salaries: fetchAPI<SalaryListResponse>("/salary?page=1&limit=100"),
            transactions: fetchAPI<TransactionsResponse>("/transactions?page=1&limit=8"),
        } satisfies Record<ReportSection, Promise<unknown>>;

        const entries = await Promise.all(
            Object.entries(requests).map(async ([section, request]) => {
                try {
                    return [section, { status: "fulfilled", value: await request }] as const;
                } catch (loadError) {
                    console.error(`Failed to load reports section: ${section}`, loadError);
                    return [section, {
                        status: "rejected",
                        reason: loadError instanceof Error ? loadError.message : "Unknown error",
                    }] as const;
                }
            }),
        );

        const results = Object.fromEntries(entries) as Record<ReportSection,
            | { status: "fulfilled"; value: unknown }
            | { status: "rejected"; reason: string }
        >;
        const nextSectionErrors = Object.fromEntries(
            Object.entries(results)
                .filter(([, result]) => result.status === "rejected")
                .map(([section, result]) => [section, result.status === "rejected" ? result.reason : ""]),
        ) as Partial<Record<ReportSection, string>>;

        setData({
            netWorth: results.netWorth.status === "fulfilled" ? results.netWorth.value as NetWorthSummary : emptyNetWorth,
            portfolio: results.portfolio.status === "fulfilled" ? results.portfolio.value as PortfolioSummary : emptyPortfolio,
            salaries: results.salaries.status === "fulfilled" ? results.salaries.value as SalaryListResponse : emptySalaries,
            transactions: results.transactions.status === "fulfilled" ? results.transactions.value as TransactionsResponse : emptyTransactions,
        });
        setSectionErrors(nextSectionErrors);
        setError(Object.keys(nextSectionErrors).length === 4 ? "Reports could not be loaded." : null);
        setIsLoading(false);
    }, []);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- initial remote data synchronization
        loadReports();
    }, [loadReports]);

    const salaryMetrics = useMemo(() => {
        const currentYear = new Date().getFullYear();
        const currentYearSalaries = data?.salaries.data.filter((salary) => {
            return salary.date && new Date(salary.date).getFullYear() === currentYear;
        }) ?? [];
        const gross = currentYearSalaries.reduce((total, salary) => total + Number(salary.grossSalary ?? 0), 0);
        const net = currentYearSalaries.reduce((total, salary) => total + Number(salary.netSalary ?? 0), 0);

        return {
            gross,
            net,
            takeHomeRate: gross > 0 ? (net / gross) * 100 : 0,
            count: currentYearSalaries.length,
            latest: data?.salaries.data[0] ?? null,
        };
    }, [data]);

    const holdings = useMemo(() => {
        return [...(data?.portfolio.holdings ?? [])]
            .filter((holding) => holding.remainingShares > 0)
            .sort((left, right) => right.totalCostBasis - left.totalCostBasis);
    }, [data]);

    if (isLoading && !data) {
        return <div className="p-5 md:p-8"><LoadingState /></div>;
    }

    if (error || !data) {
        return (
            <div className="flex min-h-[520px] flex-col items-center justify-center gap-4 p-8 text-center">
                <div className="rounded-2xl border border-destructive/20 bg-destructive/10 p-4"><Activity className="h-7 w-7 text-destructive" /></div>
                <div>
                    <h2 className="text-lg font-semibold">Reports unavailable</h2>
                    <p className="mt-1 text-sm text-muted-foreground">{error ?? "There is not enough data yet."}</p>
                </div>
                <Button variant="outline" onClick={loadReports}>Retry</Button>
            </div>
        );
    }

    return (
        <div className="relative min-h-full overflow-hidden">
            <div className="pointer-events-none absolute -right-40 -top-36 h-96 w-96 rounded-full bg-violet-500/[0.07] blur-3xl" />
            <div className="pointer-events-none absolute -left-32 top-[36rem] h-80 w-80 rounded-full bg-blue-500/[0.05] blur-3xl" />

            <div className="relative space-y-6 p-5 md:p-8">
                {Object.keys(sectionErrors).length > 0 && (
                    <div className="flex items-center gap-3 rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
                        <Activity className="h-4 w-4 shrink-0" />
                        Some sections could not be refreshed. Available data is still shown below.
                    </div>
                )}

                <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <MetricCard
                        title="Net worth"
                        value={formatCurrency(data.netWorth.totalCurrentNetWorth)}
                        description={`${data.netWorth.countActive} active assets`}
                        icon={Wallet}
                        tone="violet"
                    />
                    <MetricCard
                        title="Invested capital"
                        value={data.portfolio.totalCostBasis === null ? "Not available" : formatCurrency(data.portfolio.totalCostBasis)}
                        description={`${holdings.length} open positions`}
                        icon={BriefcaseBusiness}
                        tone="blue"
                    />
                    <MetricCard
                        title="Realized profit"
                        value={data.portfolio.totalRealizedGain === null ? "Not available" : formatCurrency(data.portfolio.totalRealizedGain)}
                        description="Accumulated from closed trades"
                        icon={TrendingUp}
                        tone="emerald"
                        valueClassName={(data.portfolio.totalRealizedGain ?? 0) >= 0 ? "text-emerald-500" : "text-rose-500"}
                    />
                    <MetricCard
                        title="Gross income YTD"
                        value={formatCurrency(salaryMetrics.gross)}
                        description={`${salaryMetrics.count} income records in ${new Date().getFullYear()}`}
                        icon={Banknote}
                        tone="amber"
                    />
                </section>

                <section>
                    <PortfolioPerformanceChart />
                </section>

                <section className="grid gap-6 xl:grid-cols-2">
                    <AssetAllocationChart categories={data.netWorth.breakdownByCategory} />
                    <PortfolioExposureChart holdings={data.portfolio.holdings} />
                </section>

                <section>
                    <SalaryTrendChart salaries={data.salaries.data} />
                </section>

                <section className="grid gap-6 xl:grid-cols-[1.55fr_0.75fr]">
                    <Card className="overflow-hidden border-border/70 bg-card/80 shadow-sm">
                        <CardHeader className="border-b border-border/60 bg-muted/[0.12]">
                            <div className="flex items-start justify-between gap-4">
                                <div>
                                    <CardTitle className="text-base">Open positions</CardTitle>
                                    <CardDescription className="mt-1.5">Cost basis and portfolio concentration</CardDescription>
                                </div>
                                <Badge variant="secondary" className="font-mono">{holdings.length} active</Badge>
                            </div>
                        </CardHeader>
                        <CardContent className="overflow-x-auto p-0">
                            {holdings.length === 0 ? (
                                <p className="py-14 text-center text-sm text-muted-foreground">There are no open positions yet.</p>
                            ) : (
                                <Table>
                                    <TableHeader>
                                        <TableRow className="border-border/60 hover:bg-transparent">
                                            <TableHead className="pl-6">Asset</TableHead>
                                            <TableHead className="text-right">Units</TableHead>
                                            <TableHead className="text-right">Cost basis</TableHead>
                                            <TableHead className="w-44 pr-6">Portfolio weight</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {holdings.slice(0, 10).map((holding, index) => {
                                            const portfolioCostBasis = data.portfolio.totalCostBasis;
                                            const weight = portfolioCostBasis !== null && portfolioCostBasis > 0
                                                ? (holding.totalCostBasis / portfolioCostBasis) * 100
                                                : 0;
                                            return (
                                                <TableRow key={`${holding.symbol}-${holding.currency}`} className="border-border/50 transition-colors hover:bg-muted/25">
                                                    <TableCell className="pl-6">
                                                        <div className="flex items-center gap-3">
                                                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border/70 bg-gradient-to-br from-primary/15 to-primary/[0.03] text-xs font-bold text-primary">
                                                                {(holding.symbol || holding.name || "?").slice(0, 2).toUpperCase()}
                                                            </div>
                                                            <div className="min-w-0">
                                                                <div className="max-w-[260px] truncate font-medium">{holding.name || holding.symbol}</div>
                                                                <div className="mt-0.5 text-xs text-muted-foreground">
                                                                    {holding.symbol}{holding.isin ? ` · ${holding.isin}` : ""} · {holding.currency}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="text-right tabular-nums">{numberFormatter.format(holding.remainingShares)}</TableCell>
                                                    <TableCell className="text-right font-medium tabular-nums">{formatCurrency(holding.totalCostBasis)}</TableCell>
                                                    <TableCell className="pr-6">
                                                        <div className="flex items-center gap-3">
                                                            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                                                                <div
                                                                    className="h-full rounded-full bg-gradient-to-r from-violet-500 to-blue-500"
                                                                    style={{ width: `${Math.min(weight, 100)}%`, opacity: Math.max(0.45, 1 - index * 0.06) }}
                                                                />
                                                            </div>
                                                            <span className="w-11 text-right text-xs font-semibold tabular-nums">{weight.toFixed(1)}%</span>
                                                        </div>
                                                    </TableCell>
                                                </TableRow>
                                            );
                                        })}
                                    </TableBody>
                                </Table>
                            )}
                        </CardContent>
                    </Card>

                    <Card className="relative overflow-hidden border-border/70 bg-card/80 shadow-sm">
                        <div className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-emerald-500/[0.08] to-transparent" />
                        <CardHeader className="relative">
                            <div className="flex items-center justify-between">
                                <div>
                                    <CardTitle className="text-base">Income snapshot</CardTitle>
                                    <CardDescription className="mt-1.5">Current year take-home view</CardDescription>
                                </div>
                                <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-2.5 text-emerald-400">
                                    <CircleDollarSign className="h-4 w-4" />
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="relative space-y-6">
                            <div>
                                <div className="flex items-end justify-between gap-4">
                                    <div>
                                        <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">Take-home rate</p>
                                        <p className="mt-2 text-4xl font-bold tracking-tight text-emerald-500">{salaryMetrics.takeHomeRate.toFixed(1)}%</p>
                                    </div>
                                    <p className="pb-1 text-xs text-muted-foreground">Net / gross</p>
                                </div>
                                <div className="mt-4 h-2 overflow-hidden rounded-full bg-muted">
                                    <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-cyan-400" style={{ width: `${Math.min(salaryMetrics.takeHomeRate, 100)}%` }} />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div className="rounded-xl border border-border/70 bg-muted/20 p-3.5">
                                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Gross</p>
                                    <p className="mt-1.5 font-bold tabular-nums">{formatCurrency(salaryMetrics.gross)}</p>
                                </div>
                                <div className="rounded-xl border border-emerald-500/15 bg-emerald-500/[0.07] p-3.5">
                                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-500">Net</p>
                                    <p className="mt-1.5 font-bold tabular-nums">{formatCurrency(salaryMetrics.net)}</p>
                                </div>
                            </div>

                            <div className="border-t border-border/60 pt-5">
                                <p className="text-xs text-muted-foreground">Latest income</p>
                                <div className="mt-2 flex items-center justify-between gap-3">
                                    <div className="min-w-0">
                                        <p className="truncate text-sm font-medium">{salaryMetrics.latest?.company || "No income recorded"}</p>
                                        <p className="mt-0.5 text-xs text-muted-foreground">{salaryMetrics.latest ? formatDate(salaryMetrics.latest.date) : "—"}</p>
                                    </div>
                                    <p className="shrink-0 font-bold tabular-nums">
                                        {salaryMetrics.latest ? formatCurrency(Number(salaryMetrics.latest.netSalary ?? 0)) : "—"}
                                    </p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </section>

                <section>
                    <Card className="overflow-hidden border-border/70 bg-card/80 shadow-sm">
                        <CardHeader className="border-b border-border/60 bg-muted/[0.12]">
                            <div className="flex items-start justify-between gap-4">
                                <div>
                                    <CardTitle className="text-base">Recent activity</CardTitle>
                                    <CardDescription className="mt-1.5">Latest portfolio movements</CardDescription>
                                </div>
                                <Activity className="h-4 w-4 text-muted-foreground" />
                            </div>
                        </CardHeader>
                        <CardContent className="p-0">
                            {data.transactions.data.length === 0 ? (
                                <p className="py-14 text-center text-sm text-muted-foreground">No recent transactions.</p>
                            ) : (
                                <div className="divide-y divide-border/50">
                                    {data.transactions.data.map((transaction) => {
                                        const isPositive = transactionIsPositive(transaction);
                                        return (
                                            <div key={transaction.id} className="grid gap-3 px-5 py-4 transition-colors hover:bg-muted/20 sm:grid-cols-[auto_1fr_auto_auto] sm:items-center md:px-6">
                                                <div className={`flex h-9 w-9 items-center justify-center rounded-xl border ${isPositive ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-500" : "border-rose-500/20 bg-rose-500/10 text-rose-500"}`}>
                                                    {isPositive ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="truncate text-sm font-medium">{transaction.name || transaction.symbol || transaction.type}</p>
                                                    <p className="mt-0.5 text-xs text-muted-foreground">
                                                        {formatDate(transaction.date)}
                                                        {transaction.symbol ? ` · ${transaction.symbol}` : ""}
                                                        {transaction.isin ? ` · ${transaction.isin}` : ""}
                                                    </p>
                                                </div>
                                                <Badge variant="secondary" className="w-fit font-normal">{displayTransactionType(transaction.type, transaction.side)}</Badge>
                                                <p className={`text-right text-sm font-semibold tabular-nums ${isPositive ? "text-emerald-500" : "text-foreground"}`}>
                                                    {isPositive ? "+" : ""}{formatCurrency(transaction.value, transaction.currency)}
                                                </p>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </section>
            </div>
        </div>
    );
}
