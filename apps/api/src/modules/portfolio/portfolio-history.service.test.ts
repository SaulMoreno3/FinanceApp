import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateBuyAccounting, calculateDailyPerformance } from './portfolio-history.service';

test('keeps transferred tax basis separate from subscription cash flow', () => {
    const accounting = calculateBuyAccounting(2_419.54, 0, 1, 2_196.77);

    assert.equal(accounting.cashFlow, 2_419.54);
    assert.equal(accounting.costBasis, 2_196.77);
    assert.equal(calculateDailyPerformance(2_419.54, 0, accounting.cashFlow, 0), 0);
});

test('excludes net purchases and includes dividends in daily performance', () => {
    assert.equal(calculateDailyPerformance(1_120, 1_000, 100, 5), 25);
});
