import { Currency } from '../../generated/prisma/enums';
import { prisma } from '../../common/db/prisma';
import type { GetTransactionsQuery } from './transactions.schema';

export class TransactionsService {
    async getTransactions(userId: string, filters: GetTransactionsQuery) {
        const { page, limit, from, to, currency, symbol, type } = filters;
        const where = {
            userId,
            ...(from || to ? {
                date: {
                    ...(from ? { gte: new Date(from) } : {}),
                    ...(to ? { lte: new Date(to) } : {}),
                },
            } : {}),
            ...(currency ? { currency: currency as Currency } : {}),
            ...(symbol ? { symbol } : {}),
            ...(type ? { type } : {}),
        };

        const [transactions, totalCount] = await Promise.all([
            prisma.stockTrade.findMany({
                where,
                orderBy: { date: 'desc' },
                take: limit,
                skip: (page - 1) * limit,
            }),
            prisma.stockTrade.count({ where }),
        ]);

        return {
            data: transactions.map(transaction => ({
                ...transaction,
                quantity: Number(transaction.quantity),
                price: Number(transaction.price),
                value: Number(transaction.value),
                fees: Number(transaction.fees),
                commission: Number(transaction.commission),
            })),
            meta: {
                total: totalCount,
                page,
                limit,
                totalPages: Math.ceil(totalCount / limit),
            },
        };
    }

    async getExchangeRates(userId: string) {
        // Exchange rates might be shared or user specific? 
        // Assuming we look at user's own transfer history for inferred rates
        const transfers = await prisma.cashTransfer.findMany({
            where: { userId, conversionRate: { not: null } },
            select: { date: true, conversionRate: true, currency: true },
            orderBy: { date: 'asc' },
        });
        return transfers.map(transfer => ({
            date: transfer.date,
            rate: Number(transfer.conversionRate),
            currency: transfer.currency,
        }));
    }

    async findPendingConversions(userId: string) {
        await this.inferCashTransferConversions(userId);
        await this.inferTradeConversionsFromNearestCashRate(userId);

        const [transfers, trades] = await Promise.all([
            prisma.cashTransfer.findMany({
                where: {
                    userId,
                    type: { in: ['Cash top-up', 'Cash withdrawal', 'Deposit', 'Withdrawal'] },
                    currency: { not: Currency.EUR },
                    conversionRate: null,
                    skippedConversion: false,
                },
                select: { id: true, date: true, currency: true, type: true, value: true },
                orderBy: { date: 'desc' },
            }),
            prisma.stockTrade.findMany({
                where: { userId, currency: { not: Currency.EUR }, conversionRate: null },
                select: { id: true, date: true, currency: true, type: true, value: true, symbol: true, name: true, isin: true },
                orderBy: { date: 'desc' },
            }),
        ]);

        return [
            ...transfers.map(transfer => ({ ...transfer, entity: 'cash' as const, value: Number(transfer.value) })),
            ...trades.map(trade => ({ ...trade, entity: 'trade' as const, value: Number(trade.value) })),
        ].sort((left, right) => right.date.getTime() - left.date.getTime());
    }

    private async inferCashTransferConversions(userId: string) {
        const transfers = await prisma.cashTransfer.findMany({
            where: {
                userId,
                type: { in: ['Cash top-up', 'Cash withdrawal'] },
                currency: { not: Currency.EUR },
                conversionRate: null,
                skippedConversion: false,
            },
            select: { id: true, date: true, type: true, value: true },
            orderBy: { date: 'asc' },
        });

        const groups: typeof transfers[] = [];
        for (const transfer of transfers) {
            const previousGroup = groups.at(-1);
            const previous = previousGroup?.at(-1);
            if (previousGroup && previous && previous.type === transfer.type && transfer.date.getTime() - previous.date.getTime() <= 15 * 60 * 1000) {
                previousGroup.push(transfer);
            } else {
                groups.push([transfer]);
            }
        }

        const usedBankTransactionIds = new Set<string>();
        for (const group of groups) {
            const from = new Date(group[0].date.getTime() - 15 * 60 * 1000);
            const to = new Date(group.at(-1)!.date.getTime() + 15 * 60 * 1000);
            const transferAmount = group.reduce((sum, transfer) => sum + Math.abs(Number(transfer.value)), 0);
            const expectedBankSign = group[0].type === 'Cash top-up' ? 'out' : 'in';
            const candidates = await prisma.bankTransaction.findMany({
                where: {
                    userId,
                    currency: Currency.EUR,
                    date: { gte: from, lte: to },
                    amount: expectedBankSign === 'out' ? { lt: 0 } : { gt: 0 },
                    id: { notIn: [...usedBankTransactionIds] },
                    OR: [
                        { description: { contains: 'investment', mode: 'insensitive' } },
                        { merchantName: { contains: 'investment', mode: 'insensitive' } },
                    ],
                },
                select: { id: true, date: true, amount: true },
                orderBy: { date: 'asc' },
            });
            if (!candidates.length) continue;

            const bankAmount = candidates.reduce((sum, candidate) => sum + Math.abs(Number(candidate.amount)), 0);
            if (!Number.isFinite(bankAmount) || !Number.isFinite(transferAmount) || transferAmount === 0) continue;
            const conversionRate = bankAmount / transferAmount;
            await prisma.$transaction(group.map(transfer => prisma.cashTransfer.update({
                where: { id: transfer.id },
                data: { eurCost: Math.abs(Number(transfer.value)) * conversionRate, conversionRate },
            })));
            candidates.forEach(candidate => usedBankTransactionIds.add(candidate.id));
        }
    }

    private async inferTradeConversionsFromNearestCashRate(userId: string) {
        const [rates, trades] = await Promise.all([
            prisma.cashTransfer.findMany({
                where: {
                    userId,
                    currency: { not: Currency.EUR },
                    type: { in: ['Cash top-up', 'Cash withdrawal'] },
                    conversionRate: { not: null },
                    skippedConversion: false,
                },
                select: { date: true, currency: true, conversionRate: true },
                orderBy: { date: 'asc' },
            }),
            prisma.stockTrade.findMany({
                where: { userId, currency: { not: Currency.EUR }, conversionRate: null },
                select: { id: true, date: true, currency: true, value: true },
                orderBy: { date: 'asc' },
            }),
        ]);

        for (const trade of trades) {
            const candidates = rates
                .filter(rate => rate.currency === trade.currency && rate.conversionRate)
                .map(rate => ({
                    rate: Number(rate.conversionRate),
                    distance: Math.abs(rate.date.getTime() - trade.date.getTime()),
                }))
                .sort((left, right) => left.distance - right.distance);
            const nearest = candidates[0];
            if (!nearest || nearest.distance > 90 * 24 * 60 * 60 * 1000) continue;
            const eurValue = Math.abs(Number(trade.value)) * nearest.rate;
            await prisma.stockTrade.update({
                where: { id: trade.id },
                data: { eurCost: eurValue, eurValue, conversionRate: nearest.rate },
            });
        }
    }

    async updateTransactionConversion(userId: string, id: string, eurCost: number) {
        const cashTransfer = await prisma.cashTransfer.findFirst({
            where: { id, userId },
            select: { value: true },
        });
        const stockTrade = cashTransfer ? null : await prisma.stockTrade.findFirst({
            where: { id, userId },
            select: { value: true },
        });
        const transaction = cashTransfer ?? stockTrade;
        if (!transaction) {
            throw new Error('Transaction not found');
        }

        const rate = eurCost / Math.abs(Number(transaction.value));
        if (cashTransfer) {
            await prisma.cashTransfer.update({ where: { id }, data: { eurCost, conversionRate: rate } });
        } else {
            await prisma.stockTrade.update({ where: { id }, data: { eurCost, eurValue: eurCost, conversionRate: rate } });
        }

        return { id, eurCost, conversionRate: rate };
    }
}

export const transactionsService = new TransactionsService();
