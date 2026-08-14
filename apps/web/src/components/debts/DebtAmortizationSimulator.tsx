import { useMemo, useState } from 'react';
import { Calculator, Info } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { Debt, DebtScheduleRow } from '@/components/debts/debt.types';

type AmortizationMode = 'TERM' | 'PAYMENT';

type Simulation = {
    extraPayment: number;
    balanceAfterExtra: number;
    baselineInterest: number;
    simulatedInterest: number;
    interestSaved: number;
    baselineMonths: number;
    simulatedMonths: number;
    monthlyPayment: number;
    endDate: string | null;
};

const money = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'EUR' });
const date = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });

function formatDate(value: string | null) {
    return value ? date.format(new Date(`${value.slice(0, 10)}T00:00:00Z`)) : '—';
}

function annuityPayment(principal: number, monthlyRate: number, months: number) {
    if (months <= 0 || principal <= 0) return 0;
    if (monthlyRate === 0) return principal / months;
    return principal * monthlyRate / (1 - (1 + monthlyRate) ** -months);
}

function simulate(debt: Debt, schedule: DebtScheduleRow[], extraPayment: number, afterInstallment: number, mode: AmortizationMode): Simulation {
    const remaining = schedule.slice(afterInstallment);
    const balanceBeforeExtra = afterInstallment === 0 ? debt.originalPrincipal : schedule[afterInstallment - 1]?.balanceAfter ?? debt.currentBalance;
    const appliedExtra = Math.min(Math.max(extraPayment, 0), balanceBeforeExtra);
    let balance = Math.max(0, balanceBeforeExtra - appliedExtra);
    const monthlyRate = (debt.interestRate ?? 0) / 100 / 12;
    const baselineInterest = remaining.reduce((sum, row) => sum + row.interestAmount, 0);
    const baselineMonths = remaining.length;
    const fixedPayment = debt.monthlyPayment ?? remaining[0]?.paymentAmount ?? 0;
    const payment = mode === 'PAYMENT' ? annuityPayment(balance, monthlyRate, baselineMonths) : fixedPayment;
    let simulatedInterest = 0;
    let simulatedMonths = 0;

    while (balance > 0.005 && simulatedMonths < 1200) {
        const interest = balance * monthlyRate;
        const principal = Math.min(balance, Math.max(0, payment - interest));
        if (principal <= 0) break;
        balance -= principal;
        simulatedInterest += interest;
        simulatedMonths += 1;
    }

    let endDate: string | null = null;
    if (mode === 'PAYMENT') {
        endDate = remaining.at(-1)?.dueDate ?? null;
    } else if (simulatedMonths > 0) {
        endDate = remaining[Math.min(simulatedMonths, remaining.length) - 1]?.dueDate ?? null;
    }

    return {
        extraPayment: appliedExtra,
        balanceAfterExtra: balanceBeforeExtra - appliedExtra,
        baselineInterest,
        simulatedInterest,
        interestSaved: Math.max(0, baselineInterest - simulatedInterest),
        baselineMonths,
        simulatedMonths,
        monthlyPayment: payment,
        endDate,
    };
}

export function DebtAmortizationSimulator({ debt, schedule }: { debt: Debt; schedule: DebtScheduleRow[] }) {
    const [extraPayment, setExtraPayment] = useState(1000);
    const [afterInstallment, setAfterInstallment] = useState(debt.paidPayments);
    const [mode, setMode] = useState<AmortizationMode>('TERM');
    const result = useMemo(() => simulate(debt, schedule, extraPayment, afterInstallment, mode), [debt, schedule, extraPayment, afterInstallment, mode]);
    const monthDifference = Math.max(0, result.baselineMonths - result.simulatedMonths);

    return <Card className="border-primary/20 shadow-sm"><CardHeader><div className="flex items-start gap-3"><div className="rounded-xl bg-primary/10 p-3 text-primary"><Calculator className="h-5 w-5" /></div><div><CardTitle>Amortisation simulator</CardTitle><CardDescription>Explore an extra payment without changing the contractual schedule.</CardDescription></div></div></CardHeader><CardContent className="space-y-5"><div className="grid gap-4 md:grid-cols-3"><div className="space-y-2"><Label htmlFor="extra-payment">Extra payment</Label><Input id="extra-payment" type="number" min="0" max={debt.currentBalance} step="100" value={extraPayment} onChange={(event) => setExtraPayment(Math.max(0, Number(event.target.value) || 0))} /><p className="text-xs text-muted-foreground">Maximum {money.format(debt.currentBalance)}</p></div><div className="space-y-2"><Label htmlFor="after-installment">Apply after instalment</Label><select id="after-installment" className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={afterInstallment} onChange={(event) => setAfterInstallment(Number(event.target.value))}>{Array.from({ length: Math.min(schedule.length, 72) + 1 }, (_, index) => <option key={index} value={index}>{index === 0 ? 'Before the first payment' : `After payment ${index}`}</option>)}</select><p className="text-xs text-muted-foreground">Current recorded payments: {debt.paidPayments}</p></div><div className="space-y-2"><Label htmlFor="amortisation-mode">What should change?</Label><select id="amortisation-mode" className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={mode} onChange={(event) => setMode(event.target.value as AmortizationMode)}><option value="TERM">Keep payment, reduce term</option><option value="PAYMENT">Keep term, reduce payment</option></select><p className="text-xs text-muted-foreground">A hypothetical calculation using the contractual rate.</p></div></div><div className="grid gap-3 sm:grid-cols-3"><div className="rounded-lg bg-muted/40 p-4"><p className="text-xs text-muted-foreground">Interest saved</p><p className="mt-1 text-xl font-bold text-emerald-600 dark:text-emerald-400">{money.format(result.interestSaved)}</p></div><div className="rounded-lg bg-muted/40 p-4"><p className="text-xs text-muted-foreground">New monthly payment</p><p className="mt-1 text-xl font-bold">{money.format(result.monthlyPayment)}</p></div><div className="rounded-lg bg-muted/40 p-4"><p className="text-xs text-muted-foreground">Term reduction</p><p className="mt-1 text-xl font-bold">{mode === 'TERM' ? `${monthDifference} months` : '—'}</p></div></div><div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground"><span>Balance after extra payment: <strong className="text-foreground">{money.format(result.balanceAfterExtra)}</strong></span><span>Estimated end: <strong className="text-foreground">{formatDate(result.endDate)}</strong></span><span>Projected interest: <strong className="text-foreground">{money.format(result.simulatedInterest)}</strong></span></div><div className="flex gap-2 border-t pt-4 text-xs text-muted-foreground"><Info className="mt-0.5 h-4 w-4 shrink-0" /><span>Estimate only. It excludes early-repayment fees, insurance, tax effects and any lender-specific recalculation rules.</span></div></CardContent></Card>;
}
