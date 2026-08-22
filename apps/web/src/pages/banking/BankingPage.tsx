import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowDownLeft, ArrowUpRight, ChevronRight, RefreshCw, WalletCards } from 'lucide-react';
import { fetchAPI, postAPI } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { transactionCategory, transactionLabel } from './banking.format';

type Account = { id: string; name: string | null; currency: string; balance: number | null; availableBalance: number | null };
type RecentTransaction = { id: string; date: string; amount: number; currency: string; description: string | null; merchantName: string | null; category: string | null; direction: string; account: { name: string | null; currency: string } };
type Overview = { configured: boolean; connected: boolean; status: string; lastSyncAt?: string | null; accounts: Account[]; month: { byCurrency: Array<{ currency: string; income: number; expenses: number; net: number }>; byCategory: Array<{ category: string; currency: string; amount: number }> }; recent: RecentTransaction[] };

const money = (amount: number, currency: string) => amount.toLocaleString('es-ES', { style: 'currency', currency, maximumFractionDigits: 2 });

export default function BankingPage() {
    const navigate = useNavigate();
    const [overview, setOverview] = useState<Overview | null>(null);
    const [loading, setLoading] = useState(true);
    const [syncing, setSyncing] = useState(false);

    const load = async () => {
        setLoading(true);
        try { setOverview(await fetchAPI<Overview>('/bank-sync/overview')); }
        catch (error) { console.error(error); }
        finally { setLoading(false); }
    };

    useEffect(() => {
        const run = async () => {
            setLoading(true);
            try { setOverview(await fetchAPI<Overview>('/bank-sync/overview')); }
            catch (error) { console.error(error); }
            finally { setLoading(false); }
        };
        void run();
    }, []);

    const sync = async () => {
        setSyncing(true);
        try { await postAPI('/bank-sync/sync', {}); await load(); }
        catch (error) { alert(error instanceof Error ? error.message : 'No se pudo sincronizar'); }
        finally { setSyncing(false); }
    };

    if (loading) return <div className="p-6 text-muted-foreground">Cargando cuentas...</div>;
    if (!overview?.connected) return <div className="space-y-4 p-6"><h1 className="text-3xl font-bold tracking-tight">Banking</h1><Card><CardContent className="p-6"><p className="text-muted-foreground">Conecta Revolut desde Import Data para ver tus cuentas y gastos.</p><Button className="mt-4" onClick={() => navigate('/import')}>Ir a Import Data</Button></CardContent></Card></div>;

    return <div className="space-y-6 p-4 md:p-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
            <div><h1 className="text-3xl font-bold tracking-tight">Banking</h1><p className="text-muted-foreground">Control de tus cuentas y gastos bancarios.</p></div>
            <div className="flex gap-2"><Button variant="outline" onClick={sync} disabled={syncing}><RefreshCw className={syncing ? 'animate-spin' : ''} /> Sincronizar</Button><Button asChild><Link to="/banking/history">Ver historial <ChevronRight /></Link></Button></div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
            {overview.accounts.map(account => <Card key={account.id}><CardHeader className="pb-2"><CardDescription className="flex items-center gap-2"><WalletCards className="h-4 w-4" />{account.name || 'Cuenta bancaria'}</CardDescription><CardTitle>{account.balance === null ? '—' : money(account.balance, account.currency)}</CardTitle></CardHeader><CardContent className="text-xs text-muted-foreground">Disponible: {account.availableBalance === null ? '—' : money(account.availableBalance, account.currency)}</CardContent></Card>)}
        </div>

        <div className="grid gap-4 md:grid-cols-3">{overview.month.byCurrency.map(summary => <div className="contents" key={summary.currency}>
            <Card><CardHeader><CardDescription>Ingresos este mes · {summary.currency}</CardDescription><CardTitle className="text-emerald-500">{money(summary.income, summary.currency)}</CardTitle></CardHeader></Card>
            <Card><CardHeader><CardDescription>Gastos este mes · {summary.currency}</CardDescription><CardTitle className="text-rose-500">{money(summary.expenses, summary.currency)}</CardTitle></CardHeader></Card>
            <Card><CardHeader><CardDescription>Balance del mes · {summary.currency}</CardDescription><CardTitle className={summary.net >= 0 ? 'text-emerald-500' : 'text-rose-500'}>{money(summary.net, summary.currency)}</CardTitle></CardHeader></Card>
        </div>)}</div>

        <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
            <Card><CardHeader><CardTitle>Movimientos recientes</CardTitle><CardDescription>Últimos movimientos sincronizados</CardDescription></CardHeader><CardContent className="space-y-1">
                {overview.recent.length === 0 ? <p className="py-6 text-sm text-muted-foreground">Todavía no hay movimientos.</p> : overview.recent.map(transaction => <div key={transaction.id} className="flex items-center justify-between gap-4 border-b py-3 last:border-0"><div className="flex min-w-0 items-center gap-3"><div className={`rounded-full p-2 ${transaction.amount >= 0 ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500'}`}>{transaction.amount >= 0 ? <ArrowDownLeft className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}</div><div className="min-w-0"><div className="truncate font-medium">{transactionLabel(transaction.merchantName, transaction.description)}</div><div className="text-xs text-muted-foreground">{transactionCategory(transaction.category, transaction.merchantName, transaction.description)} · {new Date(transaction.date).toLocaleDateString('es-ES')}</div></div></div><span className={`shrink-0 font-medium ${transaction.amount >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>{transaction.amount >= 0 ? '+' : ''}{money(transaction.amount, transaction.currency)}</span></div>)}
            </CardContent></Card>
            <Card><CardHeader><CardTitle>Gastos por categoría</CardTitle><CardDescription>Mes actual</CardDescription></CardHeader><CardContent className="space-y-3">{overview.month.byCategory.length === 0 ? <p className="text-sm text-muted-foreground">Sin gastos categorizados.</p> : overview.month.byCategory.slice(0, 6).map(item => <div key={`${item.category}-${item.currency}`} className="flex items-center justify-between text-sm"><span>{transactionCategory(item.category, null, null)} <span className="text-xs text-muted-foreground">{item.currency}</span></span><span className="font-medium">{money(item.amount, item.currency)}</span></div>)}</CardContent></Card>
        </div>
    </div>;
}
