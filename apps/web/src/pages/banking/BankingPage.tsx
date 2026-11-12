import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowDownLeft, ArrowUpRight, ArrowLeftRight, CalendarDays, ChevronLeft, ChevronRight, RefreshCw, WalletCards } from 'lucide-react';
import { fetchAPI, postAPI } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { isInternalBankTransfer, transactionCategory, transactionLabel } from './banking.format';

type Account = { id: string; name: string | null; currency: string; balance: number | null; availableBalance: number | null; calculated?: boolean };
type RecentTransaction = { id: string; date: string; amount: number; currency: string; description: string | null; merchantName: string | null; category: string | null; direction: string; account: { name: string | null; currency: string } };
type Overview = { configured: boolean; connected: boolean; status: string; lastSyncAt?: string | null; selectedMonth: string; firstMonth: string; accounts: Account[]; month: { byCurrency: Array<{ currency: string; income: number; expenses: number; net: number }>; byCategory: Array<{ category: string; currency: string; amount: number }> }; recent: RecentTransaction[] };

const money = (amount: number, currency: string) => amount.toLocaleString('es-ES', { style: 'currency', currency, maximumFractionDigits: 2 });
const monthPattern = /^\d{4}-(0[1-9]|1[0-2])$/;
const monthLabel = (month: string) => new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${month}-01T00:00:00Z`));
const shiftMonth = (month: string, offset: number) => {
    const [year, number] = month.split('-').map(Number);
    const date = new Date(Date.UTC(year, number - 1 + offset, 1));
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
};

export default function BankingPage() {
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const today = new Date();
    const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
    const requestedMonth = searchParams.get('month');
    const selectedMonth = requestedMonth && monthPattern.test(requestedMonth) && requestedMonth <= currentMonth ? requestedMonth : currentMonth;
    const [overview, setOverview] = useState<Overview | null>(null);
    const [loading, setLoading] = useState(true);
    const [syncing, setSyncing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const load = async () => {
        setLoading(true);
        try { setOverview(await fetchAPI<Overview>(`/bank-sync/overview?month=${selectedMonth}`)); setError(null); }
        catch (loadError) { console.error(loadError); setError('No se pudo cargar el mes seleccionado.'); }
        finally { setLoading(false); }
    };

    useEffect(() => {
        let active = true;
        const run = async () => {
            setLoading(true);
            try {
                const result = await fetchAPI<Overview>(`/bank-sync/overview?month=${selectedMonth}`);
                if (active) { setOverview(result); setError(null); }
            } catch (loadError) {
                console.error(loadError);
                if (active) setError('No se pudo cargar el mes seleccionado.');
            } finally { if (active) setLoading(false); }
        };
        void run();
        return () => { active = false; };
    }, [selectedMonth]);

    const changeMonth = (month: string) => {
        const next = new URLSearchParams(searchParams);
        if (month === currentMonth) next.delete('month');
        else next.set('month', month);
        setSearchParams(next);
    };

    const firstMonth = overview?.firstMonth && overview.firstMonth < currentMonth ? overview.firstMonth : currentMonth;
    const monthOptions: string[] = [];
    for (let month = currentMonth; month >= firstMonth; month = shiftMonth(month, -1)) monthOptions.push(month);
    const showingSelectedMonth = overview?.selectedMonth === selectedMonth;

    const sync = async () => {
        setSyncing(true);
        try { await postAPI('/bank-sync/sync', {}); await load(); }
        catch (error) { alert(error instanceof Error ? error.message : 'No se pudo sincronizar'); }
        finally { setSyncing(false); }
    };

    if (loading && !overview) return <div className="p-6 text-muted-foreground">Cargando cuentas...</div>;
    if (error && !overview) return <div className="space-y-4 p-6"><p role="alert" className="text-destructive">{error}</p><Button variant="outline" onClick={load}>Reintentar</Button></div>;
    if (!overview?.connected) return <div className="space-y-4 p-6"><h1 className="text-3xl font-bold tracking-tight">Banking</h1><Card><CardContent className="p-6"><p className="text-muted-foreground">Conecta Revolut desde Import Data para ver tus cuentas y gastos.</p><Button className="mt-4" onClick={() => navigate('/import')}>Ir a Import Data</Button></CardContent></Card></div>;

    return <div className="space-y-6 p-4 md:p-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
            <div><h1 className="text-3xl font-bold tracking-tight">Banking</h1><p className="text-muted-foreground">Control de tus cuentas y gastos bancarios.</p></div>
            <div className="flex gap-2"><Button variant="outline" onClick={sync} disabled={syncing}><RefreshCw className={syncing ? 'animate-spin' : ''} /> Sincronizar</Button><Button asChild><Link to="/banking/history">Ver historial <ChevronRight /></Link></Button></div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border bg-card/60 p-4 shadow-sm">
            <div className="flex items-center gap-3">
                <div className="rounded-lg bg-primary/10 p-2 text-primary"><CalendarDays className="h-5 w-5" /></div>
                <div><p className="text-sm font-semibold">Resumen mensual</p><p className="text-xs text-muted-foreground">Ingresos, gastos y movimientos de {monthLabel(selectedMonth)}</p></div>
            </div>
            <div className="flex items-center gap-2">
                <Button variant="outline" size="icon" aria-label="Mes anterior" title="Mes anterior" onClick={() => changeMonth(shiftMonth(selectedMonth, -1))} disabled={selectedMonth <= firstMonth || loading}><ChevronLeft className="h-4 w-4" /></Button>
                <Select value={selectedMonth} onValueChange={changeMonth} disabled={loading}>
                    <SelectTrigger className="w-[190px]" aria-label="Seleccionar mes"><SelectValue /></SelectTrigger>
                    <SelectContent>{monthOptions.map(month => <SelectItem key={month} value={month}>{monthLabel(month)}</SelectItem>)}</SelectContent>
                </Select>
                <Button variant="outline" size="icon" aria-label="Mes siguiente" title="Mes siguiente" onClick={() => changeMonth(shiftMonth(selectedMonth, 1))} disabled={selectedMonth >= currentMonth || loading}><ChevronRight className="h-4 w-4" /></Button>
            </div>
        </div>

        {error && <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error} <Button variant="link" className="h-auto p-0 text-destructive underline" onClick={load}>Reintentar</Button></div>}

        <div className="grid gap-4 md:grid-cols-3">
            {overview.accounts.map(account => {
                const card = <Card className="transition-opacity hover:opacity-80"><CardHeader className="pb-4"><CardDescription className="flex items-center gap-2"><WalletCards className="h-4 w-4" />{account.name || 'Cuenta bancaria'}{account.calculated && <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">Calculada</span>}</CardDescription><CardTitle>{account.balance === null ? '—' : money(account.balance, account.currency)}</CardTitle><p className="text-xs text-muted-foreground">Saldo actual</p></CardHeader></Card>;
                return <Link key={account.id} to={`/banking/history?accountId=${encodeURIComponent(account.id)}`} className="block">{card}</Link>;
            })}
        </div>

        {!showingSelectedMonth ? <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">{error ?? `Cargando ${monthLabel(selectedMonth)}...`}</div> : <div className="grid gap-4 md:grid-cols-3">{overview.month.byCurrency.length === 0 ? <Card className="md:col-span-3"><CardContent className="py-8 text-center text-sm text-muted-foreground">No hay ingresos ni gastos en {monthLabel(selectedMonth)}.</CardContent></Card> : overview.month.byCurrency.map(summary => <div className="contents" key={summary.currency}>
            <Card><CardHeader><CardDescription>Ingresos · {summary.currency}</CardDescription><CardTitle className="text-emerald-500">{money(summary.income, summary.currency)}</CardTitle></CardHeader></Card>
            <Card><CardHeader><CardDescription>Gastos · {summary.currency}</CardDescription><CardTitle className="text-rose-500">{money(summary.expenses, summary.currency)}</CardTitle></CardHeader></Card>
            <Card><CardHeader><CardDescription>Balance del mes · {summary.currency}</CardDescription><CardTitle className={summary.net >= 0 ? 'text-emerald-500' : 'text-rose-500'}>{money(summary.net, summary.currency)}</CardTitle></CardHeader></Card>
        </div>)}</div>}

        {showingSelectedMonth && <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
            <Card className="min-w-0"><CardHeader><CardTitle>Movimientos de {monthLabel(selectedMonth)}</CardTitle><CardDescription>Últimos 8 movimientos del mes. Los traspasos entre tus cuentas aparecen en gris y no cuentan como ingresos ni gastos.</CardDescription></CardHeader><CardContent className="space-y-1">
                {overview.recent.length === 0 ? <p className="py-6 text-sm text-muted-foreground">Todavía no hay movimientos.</p> : overview.recent.map(transaction => <div key={transaction.id} className="flex items-center justify-between gap-4 border-b py-3 last:border-0"><div className="flex min-w-0 items-center gap-3"><div className={`rounded-full p-2 ${isInternalBankTransfer(transaction.description) ? 'bg-muted text-muted-foreground' : transaction.amount >= 0 ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500'}`}>{isInternalBankTransfer(transaction.description) ? <ArrowLeftRight className="h-4 w-4" /> : transaction.amount >= 0 ? <ArrowDownLeft className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}</div><div className="min-w-0"><div className="truncate font-medium">{transactionLabel(transaction.merchantName, transaction.description)}</div><div className="text-xs text-muted-foreground">{transactionCategory(transaction.category, transaction.merchantName, transaction.description)} · {new Date(transaction.date).toLocaleDateString('es-ES')}</div></div></div><span className={`shrink-0 font-medium ${isInternalBankTransfer(transaction.description) ? 'text-muted-foreground' : transaction.amount >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>{transaction.amount >= 0 ? '+' : ''}{money(transaction.amount, transaction.currency)}</span></div>)}
            </CardContent></Card>
            <Card className="min-w-0"><CardHeader><CardTitle>Gastos por categoría</CardTitle><CardDescription>{monthLabel(selectedMonth)}</CardDescription></CardHeader><CardContent className="space-y-3">{overview.month.byCategory.length === 0 ? <p className="text-sm text-muted-foreground">Sin gastos categorizados.</p> : overview.month.byCategory.slice(0, 6).map(item => <div key={`${item.category}-${item.currency}`} className="flex items-center justify-between text-sm"><span>{transactionCategory(item.category, null, null)} <span className="text-xs text-muted-foreground">{item.currency}</span></span><span className="font-medium">{money(item.amount, item.currency)}</span></div>)}</CardContent></Card>
        </div>}
    </div>;
}
