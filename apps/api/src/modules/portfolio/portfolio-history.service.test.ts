import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateBuyAccounting, calculateDailyPerformance, calculateDailyReturn, canOverlayLiveValue } from './portfolio-history.service';

test('keeps transferred tax basis separate from subscription cash flow', () => {
    const accounting = calculateBuyAccounting(2_419.54, 0, 1, 2_196.77);

    assert.equal(accounting.cashFlow, 2_419.54);
    assert.equal(accounting.costBasis, 2_196.77);
    assert.equal(calculateDailyPerformance(2_419.54, 0, accounting.cashFlow, 0, 0), 0);
    assert.equal(calculateDailyReturn(2_419.54, 0, accounting.cashFlow, 0, 0), 0);
});

test('excludes net purchases and includes dividends in daily performance', () => {
    assert.equal(calculateDailyPerformance(1_120, 1_000, 100, 0, 5), 25);
});

test('neutralizes sales and internal transfer legs from daily returns', () => {
    assert.equal(calculateDailyReturn(0, 100, 0, 100, 0), 0);
    assert.equal(calculateDailyReturn(100, 0, 100, 0, 0), 0);
});

test('calculates daily TTWROR using capital exposed during the day', () => {
    const dailyReturn = calculateDailyReturn(1_120, 1_000, 100, 0, 5);
    assert.ok(Math.abs(dailyReturn - (25 / 1_100)) < 0.000001);
});

test('includes transaction fees as negative performance', () => {
    const accounting = calculateBuyAccounting(100, 1, 1, null);
    assert.equal(calculateDailyPerformance(100, 0, accounting.cashFlow, 0, 0), -1);
    assert.ok(Math.abs(calculateDailyReturn(100, 0, accounting.cashFlow, 0, 0) - (-1 / 101)) < 0.000001);
});

test('never attributes a live quote to an older historical date', () => {
    assert.equal(canOverlayLiveValue(new Date('2026-11-02T00:00:00Z'), new Date('2026-11-04T12:00:00Z')), false);
    assert.equal(canOverlayLiveValue(new Date('2026-11-04T00:00:00Z'), new Date('2026-11-04T23:59:59Z')), true);
});
