import { useCallback, useEffect, useState } from "react";
import { Area, AreaChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fetchAPI } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

import { chartTextColor, chartGridColor, chartTooltipStyle, chartTooltipTextStyle } from "./report-data";

type Account = { id: string; name: string; currency: string; currentBalance: number };
type Point = { period: string; balances: Record<string, number | null>; total: number };
type BalanceHistory = { accounts: Account[]; monthly: Point[]; yearly: Point[]; global: number };

const colors = ["#5b8db8", "#70a89a", "#9c90bb", "#c39968"];

function periodLabel(period: string, yearly: boolean) {
    if (yearly) return period;
    const [year, month] = period.split("-");
    return new Intl.DateTimeFormat("es-ES", { month: "short", year: "2-digit" }).format(new Date(Number(year), Number(month) - 1, 1));
}

export function BankBalanceHistory() {
    const [data, setData] = useState<BalanceHistory | null>(null);
    const [yearly, setYearly] = useState(false);
    const [selectedCurrency, setSelectedCurrency] = useState("EUR");
    const [error, setError] = useState(false);
    const load = useCallback(async () => {
        setError(false);
        try { setData(await fetchAPI<BalanceHistory>("/bank-sync/balance-history")); }
        catch { setError(true); }
    }, []);
    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- initial remote data synchronization
        void load();
    }, [load]);
    const currencies = [...new Set(data?.accounts.map(account => account.currency) ?? [])];
    const currency = currencies.includes(selectedCurrency) ? selectedCurrency : currencies[0] ?? "EUR";
    const accounts = data?.accounts.filter(account => account.currency === currency) ?? [];
    const money = new Intl.NumberFormat("es-ES", { style: "currency", currency, maximumFractionDigits: 2 });
    const points = (yearly ? data?.yearly ?? [] : data?.monthly ?? []).map(point => ({
        ...point,
        total: accounts.reduce((sum, account) => sum + (point.balances[account.id] ?? 0), 0),
    }));
    const currentTotal = accounts.reduce((sum, account) => sum + account.currentBalance, 0);
    const chartData = points.map((point) => ({ period: periodLabel(point.period, yearly), total: point.total, ...point.balances }));

    if (error) return <Card><CardContent className="space-y-3 py-8 text-center"><p role="alert" className="text-sm text-muted-foreground">No se pudo cargar el balance de cuentas.</p><Button variant="outline" size="sm" onClick={load}>Reintentar</Button></CardContent></Card>;
    if (!data) return <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">Cargando evolución bancaria...</CardContent></Card>;
    return <Card className="overflow-hidden border-border bg-card shadow-none">
        <CardHeader className="flex flex-col sm:flex-row items-start justify-between gap-4 border-b border-border/60 bg-muted/[0.12]">
            <div><CardTitle className="text-base">Balance de cuentas</CardTitle><CardDescription className="mt-1">Evolución mensual y anual de tus cuentas bancarias</CardDescription></div>
            <div className="flex flex-wrap items-center gap-1">{currencies.length > 1 && <select aria-label="Divisa del balance" className="h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground" value={currency} onChange={event => setSelectedCurrency(event.target.value)}>{currencies.map(value => <option key={value} value={value}>{value}</option>)}</select>}<Button size="sm" variant={!yearly ? "secondary" : "ghost"} aria-pressed={!yearly} onClick={() => setYearly(false)}>Mensual</Button><Button size="sm" variant={yearly ? "secondary" : "ghost"} aria-pressed={yearly} onClick={() => setYearly(true)}>Anual</Button></div>
        </CardHeader>
        <CardContent className="space-y-6 p-5">
            {points.length === 0 ? <p className="py-10 text-center text-sm text-muted-foreground">No hay historial de saldos para este periodo.</p> : <div className="h-[330px] w-full"><ResponsiveContainer width="100%" height="100%"><AreaChart data={chartData} margin={{ top: 10, right: 8, left: 0, bottom: 4 }}><defs>{accounts.map((account, index) => <linearGradient key={account.id} id={`bankBalance-${index}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={colors[index % colors.length]} stopOpacity={0.22} /><stop offset="100%" stopColor={colors[index % colors.length]} stopOpacity={0.02} /></linearGradient>)}</defs><CartesianGrid vertical={false} stroke={chartGridColor} strokeDasharray="3 5" /><XAxis dataKey="period" tick={{ fill: chartTextColor, fontSize: 10 }} axisLine={false} tickLine={false} minTickGap={22} /><YAxis tick={{ fill: chartTextColor, fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(value) => money.format(Number(value))} width={74} /><Tooltip contentStyle={chartTooltipStyle} labelStyle={chartTooltipTextStyle} itemStyle={chartTooltipTextStyle} formatter={(value) => money.format(Number(value))} /><Legend formatter={(value) => <span style={{ color: "var(--foreground)" }}>{value}</span>} />{accounts.map((account, index) => <Area key={account.id} type="monotone" dataKey={account.id} name={account.name} stroke={colors[index % colors.length]} fill={`url(#bankBalance-${index})`} connectNulls={false} />)}</AreaChart></ResponsiveContainer></div>}
            <div className="flex items-center justify-between rounded-xl border border-border/60 bg-muted/20 px-4 py-3"><span className="text-sm text-muted-foreground">Saldo actual · {currency}</span><span className="text-xl font-bold text-foreground">{money.format(currentTotal)}</span></div>
            <details><summary className="cursor-pointer text-sm font-medium">Ver saldos por periodo</summary><div className="mt-4 overflow-x-auto"><table className="w-full min-w-[620px] text-sm"><thead><tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground"><th className="px-3 py-2">Periodo</th>{accounts.map((account) => <th key={account.id} className="px-3 py-2 text-right">{account.name}</th>)}<th className="px-3 py-2 text-right">Total</th></tr></thead><tbody>{points.slice(-12).map((point) => <tr key={point.period} className="border-b border-border/50 last:border-0"><td className="px-3 py-2 font-medium">{periodLabel(point.period, yearly)}</td>{accounts.map((account) => <td key={account.id} className="px-3 py-2 text-right tabular-nums">{point.balances[account.id] == null ? "—" : money.format(point.balances[account.id] ?? 0)}</td>)}<td className="px-3 py-2 text-right font-semibold tabular-nums">{money.format(point.total)}</td></tr>)}</tbody></table></div></details>
        </CardContent>
    </Card>;
}
