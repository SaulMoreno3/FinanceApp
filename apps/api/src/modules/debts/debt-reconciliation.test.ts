import assert from 'node:assert/strict';
import test from 'node:test';
import { findDebtPaymentMatches, matchesDebtPayment, type ReconciliationDebt, type ReconciliationTransaction } from './debt-reconciliation';

const debt: ReconciliationDebt = {
    id: 'debt', name: 'Cupra Leon car loan', lender: 'Sabadell Consumer Finance', assetName: 'SEAT Leon Cupra',
    currency: 'EUR', paidPayments: 12,
    schedule: [
        { installment: 14, dueDate: '2026-10-01', paymentAmount: 364.25, principalAmount: 223.34, interestAmount: 140.91, balanceAfter: 16702.88 },
        { installment: 15, dueDate: '2026-11-01', paymentAmount: 364.25, principalAmount: 225.20, interestAmount: 139.05, balanceAfter: 16477.68 },
    ],
};
const movement = (id: string, date: string, amount = -364.25, description = 'Sabadell Consumer Finance S.a.u.'): ReconciliationTransaction => ({
    id, date, amount, currency: 'EUR', description, merchantName: null, status: 'booked',
});

test('matches lender, amount and due-date tolerance and advances distinct instalments once', () => {
    const matches = findDebtPaymentMatches([debt], [movement('oct', '2026-10-01'), movement('nov', '2026-11-02')]);
    assert.deepEqual(matches.map(match => [match.installment, match.bankTransactionId, match.balanceAfter]), [
        [14, 'oct', 16702.88], [15, 'nov', 16477.68],
    ]);
    assert.equal(findDebtPaymentMatches([debt], [movement('nov', '2026-11-02')], new Set(['nov'])).length, 0);
});

test('rejects unrelated, positive, pending, wrong amount and distant transactions', () => {
    const schedule = debt.schedule[1];
    assert.equal(matchesDebtPayment(debt, schedule, movement('other', '2026-11-01', -364.25, 'Rent')), false);
    assert.equal(matchesDebtPayment(debt, schedule, movement('credit', '2026-11-01', 364.25)), false);
    assert.equal(matchesDebtPayment(debt, schedule, { ...movement('pending', '2026-11-01'), status: 'pending' }), false);
    assert.equal(matchesDebtPayment(debt, schedule, movement('amount', '2026-11-01', -365.25)), false);
    assert.equal(matchesDebtPayment(debt, schedule, movement('late', '2026-11-10')), false);
});

test('does not use one bank transaction for two debts or duplicate an instalment', () => {
    const other = { ...debt, id: 'other' };
    const matches = findDebtPaymentMatches([debt, other], [movement('single', '2026-11-01')]);
    assert.equal(matches.length, 1);
    assert.equal(findDebtPaymentMatches([debt], [movement('single', '2026-11-01')], new Set(), new Set(['debt:15'])).length, 0);
});
