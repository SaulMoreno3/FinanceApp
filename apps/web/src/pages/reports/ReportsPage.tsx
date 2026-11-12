import { NetWorthSources } from "@/components/net-worth/NetWorthSources";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
    Activity,
    ArrowDownRight,
    ArrowUpRight,
    Banknote,
    BriefcaseBusiness,
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
import { holdingCostEur } from "@/components/reports/report-data";
import { BankBalanceHistory } from "@/components/reports/BankBalanceHistory";

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
    valuation: {
        currency: "EUR",
        status: "unavailable",
        asOf: null,
        ageDays: null,
        totalMarketValue: null,
        totalCostBasis: null,
        totalUnrealizedGain: null,
        totalUnrealizedGainPercent: null,
        missingSymbols: [],
        sources: [],
        positions: {},
    },
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

function MetricCard({ title, value, description, icon: Icon, valueClassName = "" }: {
    title: string; value: string; description: string; icon: typeof Wallet; valueClassName?: string;
}) {
    return <Card className="shadow-none">
        <CardContent className="p-5">
            <div className="flex items-center justify-between gap-3 text-muted-foreground">
                <p className="text-sm">{title}</p><Icon className="h-4 w-4" aria-hidden="true" />
            </div>
            <p className={`mt-3 break-words text-2xl font-semibold tracking-tight tabular-nums ${valueClassName}`}>{value}</p>
            <p className="mt-2 text-xs text-muted-foreground">{description}</p>
        </CardContent>
    </Card>;
}

async function loadReportSalaries(): Promise<SalaryListResponse> {
    const year = new Date().getFullYear();
    const query = `limit=100&from=${year}-01-01&to=${year}-12-31`;
    const first = await fetchAPI<SalaryListResponse>(`/salary?page=1&${query}`);
    const data = [...first.data];
    for (let page = 2; page <= first.meta.totalPages; page++) {
        const next = await fetchAPI<SalaryListResponse>(`/salary?page=${page}&${query}`);
        data.push(...next.data);
    }
    return { ...first, data: data.filter((salary) => !/employment contribution report/i.test(salary.notes ?? "")) };
}

function SectionUnavailable({ label }: { label: string }) {
    return <p role="status" className="rounded-lg border border-border p-6 text-sm text-muted-foreground">{label} is unavailable. Use Refresh to try again.</p>;
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
            salaries: loadReportSalaries(),
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
            return salary.date && new Date(salary.date).getUTCFullYear() === currentYear;
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
            .sort((left, right) => (holdingCostEur(right) ?? 0) - (holdingCostEur(left) ?? 0));
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
        <div className="min-h-full text-foreground">
            <div className="space-y-6 p-4 md:p-8">
                <div className="flex items-center justify-between gap-4">
                    <div><h2 className="text-xl font-semibold">Reports</h2><p className="mt-1 text-sm text-muted-foreground">Your finances at a glance · {new Date().getFullYear()}</p></div>
                    <Button variant="outline" size="sm" disabled={isLoading} onClick={loadReports}>{isLoading ? "Refreshing…" : "Refresh"}</Button>
                </div>
                {Object.keys(sectionErrors).length > 0 && (
                    <div className="flex items-center gap-3 rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
                        <Activity className="h-4 w-4 shrink-0" />
                        Some sections could not be refreshed. Available data is still shown below.
                    </div>
                )}

                <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <MetricCard
                        title="Net worth"
                        value={sectionErrors.netWorth ? "Unavailable" : formatCurrency(data.netWorth.totalCurrentNetWorth)}
                        description={sectionErrors.netWorth ? "Could not load assets" : `${data.netWorth.countActive} manual assets · banks + portfolio − debts`}
                        icon={Wallet}
                    />
                    <MetricCard
                        title="Invested capital"
                        value={sectionErrors.portfolio || data.portfolio.totalCostBasis === null ? "Not available" : formatCurrency(data.portfolio.totalCostBasis)}
                        description={sectionErrors.portfolio ? "Could not load portfolio" : `${holdings.length} open positions`}
                        icon={BriefcaseBusiness}
                    />
                    <MetricCard
                        title="Realized profit"
                        value={sectionErrors.portfolio || data.portfolio.totalRealizedGain === null ? "Not available" : formatCurrency(data.portfolio.totalRealizedGain)}
                        description="Accumulated from closed trades"
                        icon={TrendingUp}
                        valueClassName={(data.portfolio.totalRealizedGain ?? 0) >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-rose-700 dark:text-rose-400"}
                    />
                    <MetricCard
                        title="Gross income YTD"
                        value={sectionErrors.salaries ? "Unavailable" : formatCurrency(salaryMetrics.gross)}
                        description={sectionErrors.salaries ? "Could not load income" : `${salaryMetrics.count} income records in ${new Date().getFullYear()}`}
                        icon={Banknote}
                    />
                </section>

                {!sectionErrors.netWorth && <NetWorthSources summary={data.netWorth} />}
                <section className="grid gap-6 xl:grid-cols-2">
                    {sectionErrors.netWorth ? <SectionUnavailable label="Asset allocation" /> : <AssetAllocationChart categories={data.netWorth.breakdownByCategory} />}
                    {sectionErrors.portfolio ? <SectionUnavailable label="Portfolio exposure" /> : <PortfolioExposureChart holdings={data.portfolio.holdings} />}
                </section>

                <section><BankBalanceHistory /></section>

                <section>
                    {sectionErrors.salaries ? <SectionUnavailable label="Income" /> : <SalaryTrendChart salaries={data.salaries.data} />}
                </section>

                <details className="space-y-4">
                    <summary className="cursor-pointer text-sm font-medium">Open positions · view details</summary>
                    <Card className="overflow-hidden border-border bg-card shadow-none">
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
                            {sectionErrors.portfolio ? <SectionUnavailable label="Open positions" /> : holdings.length === 0 ? (
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
                                        {holdings.map((holding) => {
                                            const portfolioCostBasis = data.portfolio.totalCostBasis;
                                            const costEur = holdingCostEur(holding);
                                            const weight = costEur !== null && portfolioCostBasis !== null && portfolioCostBasis > 0
                                                ? (costEur / portfolioCostBasis) * 100
                                                : null;
                                            return (
                                                <TableRow key={`${holding.symbol}-${holding.currency}`} className="border-border/50 transition-colors hover:bg-muted/25">
                                                    <TableCell className="pl-6">
                                                        <div className="flex items-center gap-3">
                                                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border/70 bg-muted text-xs font-bold text-primary">
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
                                                    <TableCell className="text-right font-medium tabular-nums">{costEur === null ? "Unavailable" : formatCurrency(costEur)}</TableCell>
                                                    <TableCell className="pr-6">
                                                        <div className="flex items-center gap-3">
                                                            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                                                                <div
                                                                    className="h-full rounded-full bg-primary/70"
                                                                    style={{ width: `${Math.min(weight ?? 0, 100)}%` }}
                                                                />
                                                            </div>
                                                            <span className="w-11 text-right text-xs font-semibold tabular-nums">{weight === null ? "—" : `${weight.toFixed(1)}%`}</span>
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


                </details>

                <section>
                    <Card className="overflow-hidden border-border bg-card shadow-none">
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
                            {sectionErrors.transactions ? <SectionUnavailable label="Recent activity" /> : data.transactions.data.length === 0 ? (
                                <p className="py-14 text-center text-sm text-muted-foreground">No recent transactions.</p>
                            ) : (
                                <div className="divide-y divide-border/50">
                                    {data.transactions.data.map((transaction) => {
                                        const isPositive = transactionIsPositive(transaction);
                                        return (
                                            <div key={transaction.id} className="grid gap-3 px-5 py-4 transition-colors hover:bg-muted/20 sm:grid-cols-[auto_1fr_auto_auto] sm:items-center md:px-6">
                                                <div className={`flex h-9 w-9 items-center justify-center rounded-xl border ${isPositive ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : "border-rose-500/20 bg-rose-500/10 text-rose-700 dark:text-rose-400"}`}>
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
                                                <p className={`text-right text-sm font-semibold tabular-nums ${isPositive ? "text-emerald-700 dark:text-emerald-400" : "text-foreground"}`}>
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
