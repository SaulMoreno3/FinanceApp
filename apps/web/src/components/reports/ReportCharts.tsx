import {
    Area,
    AreaChart,
    Bar,
    BarChart,
    CartesianGrid,
    Cell,
    Pie,
    PieChart,
    ReferenceLine,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from "recharts";
import { ArrowUpRight, CircleDollarSign, Layers3 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { CategoryBreakdown } from "@/components/net-worth/net-worth.types";
import type { Holding } from "@/components/portfolio/portfolio.types";
import type { SalaryRecord } from "@/components/salary/salary.types";

import { chartTextColor, chartGridColor, chartTooltipStyle, chartTooltipTextStyle, holdingCostEur } from "./report-data";
const COLORS = ["#5b8db8", "#70a89a", "#9c90bb", "#c39968", "#b77e87", "#7aa6b0", "#999ca6"];

const currency = new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
});

const compactCurrency = new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "EUR",
    notation: "compact",
    maximumFractionDigits: 1,
});

function formatCurrency(value: number | string | undefined) {
    return currency.format(Number(value ?? 0));
}

function EmptyChart({ message }: { message: string }) {
    return (
        <div className="flex h-[290px] flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border/70 bg-muted/20 text-center">
            <div className="rounded-full bg-muted p-3"><Layers3 className="h-5 w-5 text-muted-foreground" /></div>
            <p className="text-sm text-muted-foreground">{message}</p>
        </div>
    );
}

function ChartShell({
    title,
    description,
    icon: Icon,
    children,
    className = "",
}: {
    title: string;
    description: string;
    icon: typeof Layers3;
    children: React.ReactNode;
    className?: string;
}) {
    return (
        <Card className={`overflow-hidden border-border bg-card shadow-none ${className}`}>
            <CardHeader className="relative flex-row items-start justify-between space-y-0 pb-3">
                <div className="space-y-1.5">
                    <CardTitle className="text-base">{title}</CardTitle>
                    <CardDescription>{description}</CardDescription>
                </div>
                <div className="p-1 text-muted-foreground">
                    <Icon className="h-4 w-4" />
                </div>
            </CardHeader>
            <CardContent className="relative">{children}</CardContent>
        </Card>
    );
}

export function AssetAllocationChart({ categories }: { categories: CategoryBreakdown[] }) {
    const chartData = categories
        .filter((category) => category.currency === "EUR" && category.totalValue > 0)
        .sort((left, right) => right.totalValue - left.totalValue)
        .map((category) => ({
            name: category.category,
            value: category.totalValue,
            count: category.count,
        }));
    const total = chartData.reduce((sum, category) => sum + category.value, 0);

    return (
        <ChartShell title="Asset allocation" description="Positive asset valuations in EUR · excludes liabilities and other currencies" icon={Layers3}>
            {chartData.length === 0 ? <EmptyChart message="No net worth data" /> : (
                <div className="grid min-h-[300px] items-center gap-4 sm:grid-cols-[minmax(220px,0.9fr)_1.1fr]">
                    <div className="relative mx-auto h-[250px] w-full max-w-[280px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={chartData}
                                    dataKey="value"
                                    nameKey="name"
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={74}
                                    outerRadius={108}
                                    cornerRadius={8}
                                    paddingAngle={4}
                                    stroke="transparent"
                                >
                                    {chartData.map((entry, index) => (
                                        <Cell key={entry.name} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Pie>
                                <Tooltip formatter={(value) => formatCurrency(Number(value))} contentStyle={chartTooltipStyle} labelStyle={chartTooltipTextStyle} itemStyle={chartTooltipTextStyle} />
                            </PieChart>
                        </ResponsiveContainer>
                        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                            <span className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground">Total</span>
                            <span className="mt-1 text-2xl font-bold tracking-tight">{compactCurrency.format(total)}</span>
                            <span className="mt-1 text-xs text-muted-foreground">{chartData.reduce((sum, item) => sum + item.count, 0)} assets</span>
                        </div>
                    </div>
                    <div className="space-y-2.5">
                        {chartData.map((item, index) => {
                            const percentage = total > 0 ? (item.value / total) * 100 : 0;
                            return (
                                <div key={item.name} className="group flex items-center gap-3 rounded-xl border border-transparent px-3 py-2 transition-colors hover:border-border/70 hover:bg-muted/30">
                                    <span className="h-2.5 w-2.5 shrink-0 rounded-full " style={{ backgroundColor: COLORS[index % COLORS.length], color: COLORS[index % COLORS.length] }} />
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center justify-between gap-3 text-sm">
                                            <span className="truncate font-medium">{item.name}</span>
                                            <span className="font-semibold tabular-nums">{percentage.toFixed(1)}%</span>
                                        </div>
                                        <div className="mt-0.5 flex items-center justify-between text-xs text-muted-foreground">
                                            <span>{item.count} asset{item.count === 1 ? "" : "s"}</span>
                                            <span>{formatCurrency(item.value)}</span>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </ChartShell>
    );
}

export function PortfolioExposureChart({ holdings }: { holdings: Holding[] }) {
    const openHoldings = holdings
        .filter((holding) => holding.remainingShares > 0)
        .sort((left, right) => (holdingCostEur(right) ?? 0) - (holdingCostEur(left) ?? 0));
    const total = openHoldings.reduce((sum, holding) => sum + (holdingCostEur(holding) ?? 0), 0);
    const chartData = openHoldings.slice(0, 8).map((holding) => {
        const label = holding.name || holding.symbol;
        return {
            symbol: label.length > 18 ? `${label.slice(0, 18)}…` : label,
            cost: holdingCostEur(holding),
            weight: total > 0 ? ((holdingCostEur(holding) ?? 0) / total) * 100 : 0,
        };
    });

    return (
        <ChartShell title="Portfolio exposure" description="Largest open positions by cost basis" icon={ArrowUpRight}>
            {openHoldings.some((holding) => holdingCostEur(holding) === null) ? <EmptyChart message="Historical EUR conversions are missing. Exposure is unavailable." /> : chartData.length === 0 ? <EmptyChart message="No open positions" /> : (
                <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={chartData} layout="vertical" margin={{ top: 4, right: 20, left: 12, bottom: 4 }}>
                        <CartesianGrid stroke={chartGridColor} strokeDasharray="4 8" horizontal={false} />
                        <XAxis type="number" tick={{ fill: chartTextColor, fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(value) => compactCurrency.format(value)} />
                        <YAxis type="category" dataKey="symbol" width={126} tick={{ fill: chartTextColor, fontSize: 11 }} axisLine={false} tickLine={false} />
                        <Tooltip
                            formatter={(value, name) => name === "Cost basis" ? formatCurrency(Number(value)) : `${Number(value).toFixed(1)}%`}
                            contentStyle={chartTooltipStyle} labelStyle={chartTooltipTextStyle} itemStyle={chartTooltipTextStyle}
                            cursor={{ fill: "var(--muted)" }}
                        />
                        <Bar dataKey="cost" name="Cost basis" fill="#5b8db8" radius={[0, 3, 3, 0]} barSize={17} />
                    </BarChart>
                </ResponsiveContainer>
            )}
        </ChartShell>
    );
}

export function SalaryTrendChart({ salaries }: { salaries: SalaryRecord[] }) {
    const monthly = new Map<string, { month: string; gross: number; net: number }>();
    const currentYear = new Date().getFullYear();

    for (const salary of salaries) {
        const date = new Date(salary.date);
        if (Number.isNaN(date.getTime()) || date.getUTCFullYear() !== currentYear) continue;
        const key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
        const current = monthly.get(key) ?? {
            month: date.toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" }),
            gross: 0,
            net: 0,
        };
        current.gross += Number(salary.grossSalary ?? 0);
        current.net += Number(salary.netSalary ?? 0);
        monthly.set(key, current);
    }

    const chartData = [...monthly.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([, value]) => value);
    const averageNet = chartData.length > 0
        ? chartData.reduce((sum, item) => sum + item.net, 0) / chartData.length
        : 0;
    const totalGross = chartData.reduce((sum, item) => sum + item.gross, 0);
    const totalNet = chartData.reduce((sum, item) => sum + item.net, 0);

    return (
        <ChartShell title="Monthly income" description={`Gross and net monthly income · ${currentYear}`} icon={CircleDollarSign} className="lg:col-span-2">
            {chartData.length === 0 ? <EmptyChart message="No salaries for the current year" /> : (
                <>
                    <div className="mb-5 flex flex-wrap gap-8">
                        <div className="px-1 py-2">
                            <p className="text-xs text-muted-foreground">Gross YTD</p>
                            <p className="mt-1 text-lg font-bold">{formatCurrency(totalGross)}</p>
                        </div>
                        <div className="px-1 py-2">
                            <p className="text-xs text-muted-foreground">Net YTD</p>
                            <p className="mt-1 text-lg font-bold">{formatCurrency(totalNet)}</p>
                        </div>
                        <div className="px-1 py-2">
                            <p className="text-xs text-muted-foreground">Average net</p>
                            <p className="mt-1 text-lg font-bold">{formatCurrency(averageNet)}</p>
                        </div>
                    </div>
                    <ResponsiveContainer width="100%" height={310}>
                        <AreaChart data={chartData} margin={{ top: 12, right: 8, left: 8, bottom: 2 }}>
                            <defs>
                                <linearGradient id="grossSalary" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="#5b8db8" stopOpacity={0.12} />
                                    <stop offset="100%" stopColor="#5b8db8" stopOpacity={0} />
                                </linearGradient>
                                <linearGradient id="netSalary" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="#70a89a" stopOpacity={0.12} />
                                    <stop offset="100%" stopColor="#70a89a" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid stroke={chartGridColor} strokeDasharray="4 8" vertical={false} />
                            <XAxis dataKey="month" tick={{ fill: chartTextColor, fontSize: 11 }} axisLine={false} tickLine={false} />
                            <YAxis tick={{ fill: chartTextColor, fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(value) => compactCurrency.format(value)} />
                            <Tooltip formatter={(value) => formatCurrency(Number(value))} contentStyle={chartTooltipStyle} labelStyle={chartTooltipTextStyle} itemStyle={chartTooltipTextStyle} cursor={{ stroke: "var(--primary)", strokeOpacity: 0.3 }} />
                            <ReferenceLine y={averageNet} stroke="#70a89a" strokeDasharray="5 5" strokeOpacity={0.45} />
                            <Area type="monotone" dataKey="gross" name="Gross" stroke="#5b8db8" fill="url(#grossSalary)" strokeWidth={2.5} activeDot={{ r: 5, strokeWidth: 0 }} />
                            <Area type="monotone" dataKey="net" name="Net" stroke="#70a89a" fill="url(#netSalary)" strokeWidth={2.5} activeDot={{ r: 5, strokeWidth: 0 }} />
                        </AreaChart>
                    </ResponsiveContainer>
                    <div className="mt-1 flex items-center justify-end gap-5 text-xs text-muted-foreground">
                        <span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-[#5b8db8]" />Gross</span>
                        <span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-[#70a89a]" />Net</span>
                        <span className="flex items-center gap-2"><span className="h-px w-4 border-t border-dashed border-emerald-500/70" />Net average</span>
                    </div>
                </>
            )}
        </ChartShell>
    );
}
