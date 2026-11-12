import assert from 'node:assert/strict';
import test from 'node:test';
import { PortfolioService } from './portfolio.service';
import type { StockTrade } from './portfolio.types';

const trade = (overrides: Partial<StockTrade>): StockTrade => ({
    date: new Date('2025-01-01T00:00:00Z'),
    symbol: 'ACME',
    currency: 'EUR',
    quantity: 1,
    price: 10,
    side: 'Buy',
    fees: 0,
    commission: 0,
    ...overrides,
});

test('combines a position when buys and sells use different currencies', () => {
    const service = new PortfolioService();
    const results = service.calculatePortfolioSummary([
        trade({ currency: 'EUR' }),
        trade({ currency: 'USD', price: 20 }),
    ], 'FIFO', 'EUR', [{ date: new Date('2024-12-31T00:00:00Z'), rate: 0.9, currency: 'USD' }]);

    assert.equal(results.length, 1);
    assert.equal(results[0].symbol, 'ACME');
    assert.equal(results[0].remainingShares, 2);
});

test('processes buys before sells when timestamps are equal', () => {
    const service = new PortfolioService();
    const result = service.calculateFIFO([
        trade({ date: new Date('2025-01-02T00:00:00Z'), side: 'Sell' }),
        trade({ date: new Date('2025-01-02T00:00:00Z'), side: 'Buy' }),
    ]);

    assert.equal(result.remainingShares, 0);
});

test('marks EUR totals unavailable when no historical rate exists', () => {
    const service = new PortfolioService();
    const [result] = service.calculatePortfolioSummary([
        trade({ currency: 'USD' }),
    ], 'FIFO', 'EUR', [{ date: new Date('2025-02-01T00:00:00Z'), rate: 0.9, currency: 'USD' }]);

    assert.equal(result.conversionComplete, false);
    assert.equal(result.totalCostBasisEur, undefined);
});

test('uses the trade FX rate before a historical cash-transfer rate', () => {
    const service = new PortfolioService();
    const [result] = service.calculatePortfolioSummary([
        trade({ currency: 'USD', price: 10, conversionRate: 1.2 }),
        trade({ currency: 'USD', side: 'Sell', price: 11, conversionRate: 1.2, date: new Date('2025-01-02T00:00:00Z') }),
    ], 'FIFO', 'EUR', [{ date: new Date('2024-12-31T00:00:00Z'), rate: 0.8, currency: 'USD' }]);

    assert.ok(Math.abs((result.realizedGainEur ?? 0) - 1.2) < 0.000001);
});

test('does not realise a gain for an internal transfer', () => {
    const service = new PortfolioService();
    const result = service.calculateFIFO([
        trade({ quantity: 2, price: 10 }),
        trade({ date: new Date('2025-01-02T00:00:00Z'), side: 'Sell', quantity: 2, price: 15, type: ' internaltransfer ' }),
    ]);

    assert.equal(result.realizedGain, 0);
    assert.equal(result.remainingShares, 0);
});

test('rejects sales that exceed owned shares', () => {
    const service = new PortfolioService();
    assert.throws(() => service.calculateFIFO([
        trade({ quantity: 1 }),
        trade({ date: new Date('2025-01-02T00:00:00Z'), side: 'Sell', quantity: 2 }),
    ]), /only 1 available/);
});
