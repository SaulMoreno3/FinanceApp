export type ReconciliationDebt = {
    id: string;
    name: string;
    lender: string | null;
    assetName?: string | null;
    currency: string;
    paidPayments: number;
    schedule: ReconciliationSchedule[];
};

export type ReconciliationSchedule = {
    installment: number;
    dueDate: Date | string;
    paymentAmount: number | { toString(): string };
    principalAmount: number | { toString(): string };
    interestAmount: number | { toString(): string };
    balanceAfter: number | { toString(): string };
};

export type ReconciliationTransaction = {
    id: string;
    date: Date | string;
    amount: number | { toString(): string };
    currency: string;
    description: string | null;
    merchantName: string | null;
    status: string;
};

export type DebtPaymentMatch = {
    debtId: string;
    bankTransactionId: string;
    installment: number;
    paidAt: Date;
    amount: number;
    principalAmount: number;
    interestAmount: number;
    balanceAfter: number;
};

const DAY = 86_400_000;
const normalize = (value: string | null | undefined) => (value ?? '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ').trim();
const dateValue = (value: Date | string) => value instanceof Date ? value : new Date(value);

const genericTokens = new Set([
    'banco', 'bank', 'consumer', 'finance', 'financial', 'credito', 'credit',
    'prestamo', 'loan', 'pago', 'payment', 'cuota', 'car', 'coche', 'auto',
    'sa', 'sau', 'sl', 'slu', 'ltd', 'inc',
]);

function identityTokens(debt: ReconciliationDebt) {
    return [...new Set(normalize([debt.lender, debt.name, debt.assetName].filter(Boolean).join(' '))
        .split(' ').filter(token => token.length >= 4 && !genericTokens.has(token)))];
}

function identityScore(debt: ReconciliationDebt, transaction: ReconciliationTransaction) {
    const text = normalize([transaction.merchantName, transaction.description].filter(Boolean).join(' '));
    const lender = normalize(debt.lender);
    if (lender.length >= 5 && text.includes(lender)) return 100;
    const tokens = identityTokens(debt);
    return tokens.reduce((score, token) => score + (text.includes(token) ? 10 : 0), 0);
}

export function matchesDebtPayment(
    debt: ReconciliationDebt,
    schedule: ReconciliationSchedule,
    transaction: ReconciliationTransaction,
) {
    if (transaction.status.toLowerCase() !== 'booked' || transaction.currency !== debt.currency) return false;
    const amount = Number(transaction.amount);
    const expected = Number(schedule.paymentAmount);
    if (amount >= 0 || Math.abs(Math.abs(amount) - expected) > Math.max(.05, expected * .001)) return false;
    const distance = Math.abs(dateValue(transaction.date).getTime() - dateValue(schedule.dueDate).getTime()) / DAY;
    return distance <= 7 && identityScore(debt, transaction) >= 10;
}

export function findDebtPaymentMatches(
    debts: ReconciliationDebt[],
    transactions: ReconciliationTransaction[],
    alreadyMatchedTransactionIds = new Set<string>(),
    alreadyMatchedInstallments = new Set<string>(),
) {
    const used = new Set(alreadyMatchedTransactionIds);
    const matches: DebtPaymentMatch[] = [];
    const installments = debts.flatMap(debt => debt.schedule.map(schedule => ({ debt, schedule })))
        .sort((a, b) => dateValue(a.schedule.dueDate).getTime() - dateValue(b.schedule.dueDate).getTime()
            || a.schedule.installment - b.schedule.installment);

    for (const { debt, schedule } of installments) {
        if (alreadyMatchedInstallments.has(`${debt.id}:${schedule.installment}`)) continue;
        const candidates = transactions.filter(transaction => !used.has(transaction.id) && matchesDebtPayment(debt, schedule, transaction))
            .sort((a, b) => {
                const dateDistance = Math.abs(dateValue(a.date).getTime() - dateValue(schedule.dueDate).getTime())
                    - Math.abs(dateValue(b.date).getTime() - dateValue(schedule.dueDate).getTime());
                return dateDistance || identityScore(debt, b) - identityScore(debt, a) || a.id.localeCompare(b.id);
            });
        const transaction = candidates[0];
        if (!transaction) continue;
        used.add(transaction.id);
        matches.push({
            debtId: debt.id,
            bankTransactionId: transaction.id,
            installment: schedule.installment,
            paidAt: dateValue(transaction.date),
            amount: Math.abs(Number(transaction.amount)),
            principalAmount: Number(schedule.principalAmount),
            interestAmount: Number(schedule.interestAmount),
            balanceAfter: Number(schedule.balanceAfter),
        });
    }
    return matches;
}
