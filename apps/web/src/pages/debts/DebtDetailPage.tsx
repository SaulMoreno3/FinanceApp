import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, CalendarDays, CarFront, CheckCircle2, CircleDollarSign, Clock3, CreditCard } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { Debt, DebtPayment, DebtScheduleRow } from '@/components/debts/debt.types';
import { DebtAmortizationSimulator } from '@/components/debts/DebtAmortizationSimulator';
import { fetchAPI } from '@/lib/api';

const money = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'EUR' });
const date = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });

function formatDate(value: string) { return date.format(new Date(`${value.slice(0, 10)}T00:00:00Z`)); }

export default function DebtDetailPage() {
    const { id } = useParams();
    const [debt, setDebt] = useState<Debt | null>(null);
    const [schedule, setSchedule] = useState<DebtScheduleRow[]>([]);
    const [payments, setPayments] = useState<DebtPayment[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const load = useCallback(async () => {
        if (!id) return;
        setLoading(true);
        try {
            const [debtResponse, scheduleResponse, paymentsResponse] = await Promise.all([
                fetchAPI<Debt>(`/debts/${id}`),
                fetchAPI<{ data: DebtScheduleRow[] }>(`/debts/${id}/schedule`),
                fetchAPI<{ data: DebtPayment[] }>(`/debts/${id}/payments`),
            ]);
            setDebt(debtResponse); setSchedule(scheduleResponse.data); setPayments(paymentsResponse.data); setError('');
        } catch (loadError) { setError(loadError instanceof Error ? loadError.message : 'The amortisation schedule could not be loaded'); }
        finally { setLoading(false); }
    }, [id]);
    useEffect(() => { void load(); }, [load]);

    if (loading) return <div className="p-6 text-muted-foreground">Loading amortisation schedule...</div>;
    if (error || !debt) return <div className="space-y-4 p-6"><Link to="/debts" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" />Back to debts</Link><div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">{error || 'Debt not found'}</div></div>;

    const detectedByInstallment = new Map(payments.map((payment) => [payment.installment, payment]));
    return <div className="min-h-full bg-background p-4 md:p-8"><div className="mx-auto w-full max-w-7xl space-y-6"><Link to="/debts" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" />Back to debts</Link><div className="flex flex-wrap items-start justify-between gap-4"><div className="flex items-start gap-3"><div className="rounded-xl bg-primary/10 p-3 text-primary"><CarFront className="h-7 w-7" /></div><div><h2 className="text-3xl font-bold tracking-tight">{debt.name}</h2><p className="mt-1 text-muted-foreground">{debt.lender || 'Lender not specified'}{debt.assetName ? ` · ${debt.assetName}` : ''}</p><p className="mt-2 text-xs text-emerald-600 dark:text-emerald-400">{payments.length} bank {payments.length === 1 ? 'payment' : 'payments'} matched automatically</p></div></div><Badge>{debt.status === 'ACTIVE' ? 'Active' : debt.status === 'PAID_OFF' ? 'Paid off' : 'Archived'}</Badge></div><div className="grid gap-4 md:grid-cols-4"><Card><CardContent className="p-4"><div className="flex items-center gap-2 text-sm text-muted-foreground"><CreditCard className="h-4 w-4" />Original principal</div><p className="mt-2 text-xl font-bold">{money.format(debt.originalPrincipal)}</p></CardContent></Card><Card><CardContent className="p-4"><div className="flex items-center gap-2 text-sm text-muted-foreground"><CircleDollarSign className="h-4 w-4" />Monthly payment</div><p className="mt-2 text-xl font-bold">{debt.monthlyPayment === null ? '—' : money.format(debt.monthlyPayment)}</p></CardContent></Card><Card><CardContent className="p-4"><div className="flex items-center gap-2 text-sm text-muted-foreground"><Clock3 className="h-4 w-4" />Remaining balance</div><p className="mt-2 text-xl font-bold">{money.format(debt.currentBalance)}</p></CardContent></Card><Card><CardContent className="p-4"><div className="flex items-center gap-2 text-sm text-muted-foreground"><CalendarDays className="h-4 w-4" />Maturity</div><p className="mt-2 text-xl font-bold">{formatDate(debt.maturityDate || '')}</p></CardContent></Card></div><DebtAmortizationSimulator debt={debt} schedule={schedule} /><Card className="overflow-hidden"><CardHeader><CardTitle>Full amortisation schedule</CardTitle><CardDescription>Contractual schedule. Bank payments are matched automatically by lender, amount and date.</CardDescription></CardHeader><CardContent className="p-0"><div className="max-h-[70vh] overflow-auto"><table className="w-full min-w-[760px] text-sm"><thead className="sticky top-0 z-10 bg-card"><tr className="border-b text-left text-muted-foreground"><th className="px-5 py-3 font-medium">#</th><th className="px-5 py-3 font-medium">Due date</th><th className="px-5 py-3 text-right font-medium">Payment</th><th className="px-5 py-3 text-right font-medium">Principal</th><th className="px-5 py-3 text-right font-medium">Interest</th><th className="px-5 py-3 text-right font-medium">Balance after</th><th className="px-5 py-3 text-right font-medium">Status</th></tr></thead><tbody>{schedule.map((row) => { const paid = row.installment <= debt.paidPayments; const detected = detectedByInstallment.get(row.installment); return <tr key={row.id} className="border-b last:border-0 hover:bg-muted/30"><td className="px-5 py-3 font-medium">{row.installment}</td><td className="px-5 py-3">{formatDate(row.dueDate)}</td><td className="px-5 py-3 text-right">{money.format(row.paymentAmount)}</td><td className="px-5 py-3 text-right text-emerald-600 dark:text-emerald-400">{money.format(row.principalAmount)}</td><td className="px-5 py-3 text-right text-amber-600 dark:text-amber-400">{money.format(row.interestAmount)}</td><td className="px-5 py-3 text-right font-medium">{money.format(row.balanceAfter)}</td><td className="px-5 py-3 text-right">{detected ? <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400" title={detected.description ?? undefined}><CheckCircle2 className="h-3.5 w-3.5" />Bank matched</span> : paid ? <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400"><CheckCircle2 className="h-3.5 w-3.5" />Paid</span> : <span className="text-xs text-muted-foreground">Scheduled</span>}</td></tr>; })}</tbody><tfoot className="sticky bottom-0 bg-muted/90 font-semibold"><tr><td className="px-5 py-3" colSpan={2}>Total</td><td className="px-5 py-3 text-right">{money.format(schedule.reduce((sum, row) => sum + row.paymentAmount, 0))}</td><td className="px-5 py-3 text-right">{money.format(schedule.reduce((sum, row) => sum + row.principalAmount, 0))}</td><td className="px-5 py-3 text-right">{money.format(schedule.reduce((sum, row) => sum + row.interestAmount, 0))}</td><td className="px-5 py-3 text-right">—</td><td /></tr></tfoot></table></div></CardContent></Card></div></div>;
}
