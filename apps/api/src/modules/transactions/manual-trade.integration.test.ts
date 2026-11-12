import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { prisma } from '../../common/db/prisma';
import { TransactionsService } from './transactions.service';

test('manual trades persist EUR valuations and remain scoped to their owner', {
    skip: process.env.MANUAL_TRADE_INTEGRATION !== 'true',
}, async () => {
    assert.equal(process.env.DB_NAME, 'financeapp_expenses_test');
    assert.equal(process.env.DB_PORT, '55449');
    const user = await prisma.user.create({ data: {
        email: `manual-trade-${randomUUID()}@example.invalid`, passwordHash: 'unused',
    } });
    try {
        const service = new TransactionsService();
        const eur = await service.createTrade(user.id, {
            date: '2026-11-12', symbol: 'test', side: 'Buy', currency: 'EUR', quantity: 2, price: 12.5,
        });
        assert.equal(eur.symbol, 'TEST');
        assert.equal(eur.userId, user.id);
        assert.equal(eur.source, 'MANUAL');
        assert.equal(Number(eur.eurValue), 25);
        assert.equal(Number(eur.conversionRate), 1);
        const usd = await service.createTrade(user.id, {
            date: '2026-11-12', symbol: 'USDTEST', side: 'Buy', currency: 'USD',
            quantity: 2, price: 10, eurCost: 18,
        });
        assert.equal(Number(usd.eurValue), 18);
        assert.equal(Number(usd.conversionRate), 0.9);
        await assert.rejects(service.createTrade(user.id, {
            date: '2026-11-12', symbol: 'TEST', side: 'Buy', currency: 'EUR', quantity: -1, price: 10,
        }));
        assert.equal(await prisma.stockTrade.count({ where: { userId: user.id } }), 2);
    } finally {
        await prisma.user.delete({ where: { id: user.id } });
        await prisma.$disconnect();
    }
});
