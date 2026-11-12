import { Currency } from '../../generated/prisma/enums';
import { prisma } from '../../common/db/prisma';
import type { GetTransactionsQuery } from './transactions.schema';
import { randomUUID } from 'node:crypto';
import { manualTradeSchema } from './manual-trade.schema';

export class TransactionsService {
    async createTrade(userId:string,input:unknown) {
        const trade=manualTradeSchema.parse(input);
        const value=trade.quantity*trade.price;
        const rate=trade.currency==='EUR'?1:trade.conversionRate??(trade.eurCost===undefined?null:trade.eurCost/value);
        const eurValue=trade.currency==='EUR'?value:trade.eurCost??(rate===null?null:value*rate);
        return prisma.stockTrade.create({data:{id:randomUUID(),userId,date:trade.date,symbol:trade.symbol,
            assetType:trade.assetType,currency:trade.currency,side:trade.side,type:'Trade - Market',
            quantity:trade.quantity,price:trade.price,value,fees:trade.fees,commission:trade.commission,
            conversionRate:rate,eurCost:eurValue,eurValue,source:'MANUAL',updatedAt:new Date()}});
    }
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

    private async inferTradeConversionsFromNearestCashRate(_userId: string) {
        // Deliberately do not infer a trade's FX from the nearest cash
        // movement. A cash conversion can settle several days later, and the
        // nearest movement may belong to another asset or another sale. The
        // importer/manual conversion stores the exact trade rate; unresolved
        // trades remain pending instead of silently corrupting realised gains.
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
