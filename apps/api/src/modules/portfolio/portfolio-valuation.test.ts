import assert from 'node:assert/strict';
import test from 'node:test';
import { calculatePortfolioValuation } from './portfolio-valuation';
import type { CalculationResult } from './portfolio.types';

const holdings: CalculationResult[] = [
    {
        symbol: 'FUND', currency: 'EUR', realizedGain: 0, remainingShares: 10,
        averageCost: 8, totalCostBasis: 80, totalCostBasisEur: 80, conversionComplete: true,
    },
    {
        symbol: 'STOCK', currency: 'USD', realizedGain: 0, remainingShares: 2,
        averageCost: 90, totalCostBasis: 180, totalCostBasisEur: 150, conversionComplete: true,
    },
];

test('uses one canonical EUR valuation for mixed-currency positions', () => {
    const result = calculatePortfolioValuation(holdings, {
        FUND: { price: 12, currency: 'EUR', asOf: '2026-11-02T00:00:00Z', source: 'eodhd' },
        STOCK: { price: 100, currency: 'USD', asOf: '2026-11-02T20:00:00Z', source: 'yahoo' },
        'USDEUR=X': { price: 0.85, currency: 'EUR', asOf: '2026-11-02T20:00:00Z', source: 'yahoo' },
    }, new Date('2026-11-03T12:00:00Z'));

    assert.equal(result.status, 'fresh');
    assert.equal(result.totalMarketValue, 290);
    assert.equal(result.totalCostBasis, 230);
    assert.equal(result.totalUnrealizedGain, 60);
    assert.equal(result.positions.STOCK.priceEur, 85);
    assert.deepEqual(result.sources, ['eodhd', 'yahoo']);
});

test('never publishes a deceptively incomplete total', () => {
    const result = calculatePortfolioValuation(holdings, {
        FUND: { price: 12, currency: 'EUR', asOf: '2026-11-02T00:00:00Z', source: 'eodhd' },
    }, new Date('2026-11-03T12:00:00Z'));

    assert.equal(result.status, 'partial');
    assert.equal(result.totalMarketValue, null);
    assert.deepEqual(result.missingSymbols, ['STOCK']);
});

test('marks old provider quotes as stale', () => {
    const result = calculatePortfolioValuation(holdings.slice(0, 1), {
        FUND: { price: 12, currency: 'EUR', asOf: '2026-10-01T00:00:00Z', source: 'eodhd' },
    }, new Date('2026-11-03T12:00:00Z'));

    assert.equal(result.status, 'stale');
    assert.equal(result.ageDays, 33);
});
