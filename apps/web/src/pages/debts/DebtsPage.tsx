import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowRight, CalendarClock, CarFront, CreditCard, Edit3, Landmark, Plus, ReceiptText, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { Debt, DebtFormData } from '@/components/debts/debt.types';
import { fetchAPI, postAPI } from '@/lib/api';

const money = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'EUR' });
const date = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });

const blankDebt: DebtFormData = {
    name: '', lender: '', assetName: '', originalPrincipal: 0, totalRepayable: null, currentBalance: 0,
    interestRate: null, apr: null, monthlyPayment: null, totalPayments: null, paidPayments: 0,
    startDate: null, maturityDate: null, nextPaymentDate: null, currency: 'EUR', status: 'ACTIVE', notes: '',
};

function formatDate(value: string | null) {
    return value ? date.format(new Date(`${value.slice(0, 10)}T00:00:00Z`)) : '—';
}

function Metric({ label, value, detail, icon: Icon }: { label: string; value: string; detail: string; icon: typeof CreditCard }) {
    return <Card className="border-border/60 shadow-sm"><CardContent className="flex items-start justify-between p-5"><div><p className="text-sm text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-bold tracking-tight">{value}</p><p className="mt-1 text-xs text-muted-foreground">{detail}</p></div><Icon className="h-5 w-5 text-muted-foreground" /></CardContent></Card>;
}

function DebtDialog({ open, onOpenChange, debt, onSubmit }: { open: boolean; onOpenChange: (open: boolean) => void; debt: Debt | null; onSubmit: (data: DebtFormData) => Promise<void> }) {
    const [form, setForm] = useState<DebtFormData>(blankDebt);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (!open) return;
        setForm(debt ? {
            name: debt.name, lender: debt.lender, assetName: debt.assetName, originalPrincipal: debt.originalPrincipal,
            totalRepayable: debt.totalRepayable, currentBalance: debt.currentBalance, interestRate: debt.interestRate,
            apr: debt.apr, monthlyPayment: debt.monthlyPayment, totalPayments: debt.totalPayments, paidPayments: debt.paidPayments,
            startDate: debt.startDate?.slice(0, 10) ?? null, maturityDate: debt.maturityDate?.slice(0, 10) ?? null,
            nextPaymentDate: debt.nextPaymentDate?.slice(0, 10) ?? null, currency: debt.currency, status: debt.status, notes: debt.notes,
        } : blankDebt);
    }, [open, debt]);

    const set = (key: keyof DebtFormData, value: string | number | null) => setForm((current) => ({ ...current, [key]: value }));
    const numberValue = (key: keyof DebtFormData, event: React.ChangeEvent<HTMLInputElement>) => set(key, event.target.value === '' ? null : Number(event.target.value));
    const save = async () => { setSaving(true); try { await onSubmit(form); onOpenChange(false); } finally { setSaving(false); } };

    return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>{debt ? 'Edit debt' : 'Add debt'}</DialogTitle><DialogDescription>Keep the balance and repayment terms up to date. Amounts are shown in euros.</DialogDescription></DialogHeader><div className="grid gap-4 py-2 sm:grid-cols-2">
        <div className="space-y-2 sm:col-span-2"><Label htmlFor="debt-name">Name</Label><Input id="debt-name" value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Car loan" /></div>
        <div className="space-y-2"><Label htmlFor="debt-lender">Lender</Label><Input id="debt-lender" value={form.lender ?? ''} onChange={(e) => set('lender', e.target.value)} /></div>
        <div className="space-y-2"><Label htmlFor="debt-asset">Asset</Label><Input id="debt-asset" value={form.assetName ?? ''} onChange={(e) => set('assetName', e.target.value)} /></div>
        <div className="space-y-2"><Label htmlFor="debt-original">Original principal</Label><Input id="debt-original" type="number" step="0.01" value={form.originalPrincipal || ''} onChange={(e) => set('originalPrincipal', Number(e.target.value))} /></div>
        <div className="space-y-2"><Label htmlFor="debt-balance">Current balance</Label><Input id="debt-balance" type="number" step="0.01" value={form.currentBalance || ''} onChange={(e) => set('currentBalance', Number(e.target.value))} /></div>
        <div className="space-y-2"><Label htmlFor="debt-payment">Monthly payment</Label><Input id="debt-payment" type="number" step="0.01" value={form.monthlyPayment ?? ''} onChange={(e) => numberValue('monthlyPayment', e)} /></div>
        <div className="space-y-2"><Label htmlFor="debt-paid">Payments made</Label><Input id="debt-paid" type="number" step="1" value={form.paidPayments} onChange={(e) => set('paidPayments', Number(e.target.value))} /></div>
        <div className="space-y-2"><Label htmlFor="debt-total-payments">Total payments</Label><Input id="debt-total-payments" type="number" step="1" value={form.totalPayments ?? ''} onChange={(e) => numberValue('totalPayments', e)} /></div>
        <div className="space-y-2"><Label htmlFor="debt-interest">Interest rate (TIN %)</Label><Input id="debt-interest" type="number" step="0.001" value={form.interestRate ?? ''} onChange={(e) => numberValue('interestRate', e)} /></div>
        <div className="space-y-2"><Label htmlFor="debt-apr">APR / TAE (%)</Label><Input id="debt-apr" type="number" step="0.001" value={form.apr ?? ''} onChange={(e) => numberValue('apr', e)} /></div>
        <div className="space-y-2"><Label htmlFor="debt-next">Next payment</Label><Input id="debt-next" type="date" value={form.nextPaymentDate ?? ''} onChange={(e) => set('nextPaymentDate', e.target.value || null)} /></div>
        <div className="space-y-2"><Label htmlFor="debt-maturity">Maturity date</Label><Input id="debt-maturity" type="date" value={form.maturityDate ?? ''} onChange={(e) => set('maturityDate', e.target.value || null)} /></div>
        <div className="space-y-2 sm:col-span-2"><Label htmlFor="debt-notes">Notes</Label><Input id="debt-notes" value={form.notes ?? ''} onChange={(e) => set('notes', e.target.value)} placeholder="Optional note about the balance source" /></div>
    </div><DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button onClick={() => void save()} disabled={saving || !form.name}>{saving ? 'Saving...' : 'Save debt'}</Button></DialogFooter></DialogContent></Dialog>;
}

export default function DebtsPage() {
    const [debts, setDebts] = useState<Debt[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editing, setEditing] = useState<Debt | null>(null);

    const load = useCallback(async () => { setLoading(true); try { const response = await fetchAPI<{ data: Debt[] }>('/debts'); setDebts(response.data); setError(''); } catch (loadError) { setError(loadError instanceof Error ? loadError.message : 'Debts could not be loaded'); } finally { setLoading(false); } }, []);
    useEffect(() => { void load(); }, [load]);

    const totals = useMemo(() => debts.reduce((acc, debt) => ({ balance: acc.balance + debt.currentBalance, paid: acc.paid + debt.paidAmount, monthly: acc.monthly + (debt.monthlyPayment ?? 0) }), { balance: 0, paid: 0, monthly: 0 }), [debts]);
    const save = async (data: DebtFormData) => { if (editing) await fetchAPI(`/debts/${editing.id}`, { method: 'PUT', body: JSON.stringify(data) }); else await postAPI('/debts', data); await load(); };

    return <div className="min-h-full bg-background p-4 md:p-8"><div className="mx-auto w-full max-w-7xl space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4"><div><div className="flex items-center gap-2"><CreditCard className="h-7 w-7 text-primary" /><h2 className="text-3xl font-bold tracking-tight">Debts</h2></div><p className="mt-1 text-muted-foreground">Track balances, repayment progress and upcoming payments.</p></div><Button onClick={() => { setEditing(null); setDialogOpen(true); }}><Plus className="mr-2 h-4 w-4" />Add debt</Button></div>
        {error && <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
        <div className="grid gap-4 md:grid-cols-3"><Metric label="Outstanding balance" value={money.format(totals.balance)} detail={`${debts.length} active ${debts.length === 1 ? 'debt' : 'debts'}`} icon={Landmark} /><Metric label="Principal paid" value={money.format(totals.paid)} detail="Based on the recorded balance" icon={ShieldCheck} /><Metric label="Monthly payments" value={money.format(totals.monthly)} detail="Scheduled recurring payments" icon={CalendarClock} /></div>
        {loading ? <Card className="border-dashed"><CardContent className="py-16 text-center text-muted-foreground">Loading debts...</CardContent></Card> : debts.length === 0 ? <Card className="border-dashed"><CardContent className="py-16 text-center"><CreditCard className="mx-auto mb-3 h-10 w-10 text-muted-foreground" /><p className="font-medium">No debts recorded</p><p className="mt-1 text-sm text-muted-foreground">Add a loan or other liability to start tracking it.</p></CardContent></Card> : <div className="grid gap-6 lg:grid-cols-2">{debts.map((debt) => <Card key={debt.id} className="overflow-hidden border-border/60 shadow-sm"><CardHeader className="flex flex-row items-start justify-between space-y-0"><div className="flex gap-3"><div className="rounded-xl bg-primary/10 p-3 text-primary"><CarFront className="h-6 w-6" /></div><div><CardTitle>{debt.name}</CardTitle><CardDescription className="mt-1">{debt.lender || 'Lender not specified'}{debt.assetName ? ` · ${debt.assetName}` : ''}</CardDescription></div></div><Button variant="ghost" size="icon" onClick={() => { setEditing(debt); setDialogOpen(true); }} aria-label={`Edit ${debt.name}`}><Edit3 className="h-4 w-4" /></Button></CardHeader><CardContent className="space-y-5"><div className="flex items-end justify-between gap-4"><div><p className="text-sm text-muted-foreground">Outstanding balance</p><p className="text-3xl font-bold tracking-tight">{money.format(debt.currentBalance)}</p></div><Badge variant={debt.status === 'ACTIVE' ? 'default' : 'secondary'}>{debt.status === 'ACTIVE' ? 'Active' : debt.status === 'PAID_OFF' ? 'Paid off' : 'Archived'}</Badge></div><div><div className="mb-2 flex justify-between text-sm"><span className="text-muted-foreground">Repayment progress</span><span className="font-semibold">{debt.progressPercent.toFixed(1)}%</span></div><div className="h-3 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${debt.progressPercent}%` }} /></div><div className="mt-2 flex justify-between text-xs text-muted-foreground"><span>{money.format(debt.paidAmount)} paid</span><span>of {money.format(debt.originalPrincipal)}</span></div></div><div className="grid grid-cols-2 gap-3 rounded-xl bg-muted/40 p-4 sm:grid-cols-4"><div><p className="text-xs text-muted-foreground">Monthly payment</p><p className="mt-1 font-semibold">{debt.monthlyPayment === null ? '—' : money.format(debt.monthlyPayment)}</p></div><div><p className="text-xs text-muted-foreground">Next payment</p><p className="mt-1 font-semibold">{formatDate(debt.nextPaymentDate)}</p></div><div><p className="text-xs text-muted-foreground">Interest / APR</p><p className="mt-1 font-semibold">{debt.interestRate === null ? '—' : `${debt.interestRate}% / ${debt.apr ?? '—'}%`}</p></div><div><p className="text-xs text-muted-foreground">Payments left</p><p className="mt-1 font-semibold">{debt.remainingPayments ?? '—'}</p></div></div><div className="grid gap-3 text-sm sm:grid-cols-3"><div><span className="text-muted-foreground">Started</span><p className="font-medium">{formatDate(debt.startDate)}</p></div><div><span className="text-muted-foreground">Maturity</span><p className="font-medium">{formatDate(debt.maturityDate)}</p></div><div><span className="text-muted-foreground">Total repayable</span><p className="font-medium">{debt.totalRepayable === null ? '—' : money.format(debt.totalRepayable)}</p></div></div><Link to={`/debts/${debt.id}`} className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2 text-sm font-medium transition-colors hover:bg-accent"><span>View full amortisation schedule</span><ArrowRight className="h-4 w-4" /></Link>{debt.notes && <div className="flex gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300"><ReceiptText className="mt-0.5 h-4 w-4 shrink-0" /><span>{debt.notes}</span></div>}</CardContent></Card>)}</div>}
        <DebtDialog open={dialogOpen} onOpenChange={setDialogOpen} debt={editing} onSubmit={save} />
    </div></div>;
}
