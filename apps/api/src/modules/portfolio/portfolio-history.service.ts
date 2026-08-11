import { Currency, TradeSide } from '../../generated/prisma/enums';
import { prisma } from '../../common/db/prisma';

const DAY_MS = 24 * 60 * 60 * 1000;
const EPSILON = 0.000001;

type Lot = { quantity: number; unitCost: number; estimated: boolean };
type PositionState = { quantity: number; lots: Lot[]; realizedGain: number };

function day(value: Date): Date {
    return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function dayKey(value: Date): string {
    return day(value).toISOString().slice(0, 10);
}

function enumerateDays(start: Date, end: Date): Date[] {
    const dates: Date[] = [];
    for (let timestamp = day(start).getTime(); timestamp <= day(end).getTime(); timestamp += DAY_MS) {
        dates.push(new Date(timestamp));
    }
    return dates;
}

function consumeLots(lots: Lot[], quantity: number): number {
    let remaining = quantity;
    let consumedCost = 0;
    while (remaining > EPSILON && lots.length > 0) {
        const lot = lots[0];
        const consumed = Math.min(remaining, lot.quantity);
        consumedCost += consumed * lot.unitCost;
        lot.quantity -= consumed;
        remaining -= consumed;
        if (lot.quantity <= EPSILON) lots.shift();
    }
    if (remaining > EPSILON) throw new Error(`Cannot consume ${quantity}; ${remaining} units are missing`);
    return consumedCost;
}

function positionCost(lots: Lot[]): number {
    return lots.reduce((total, lot) => total + lot.quantity * lot.unitCost, 0);
}

function isInternalTransfer(type: string): boolean {
    return type.trim().toLowerCase() === 'internaltransfer';
}

export type PortfolioHistoryRange = '1D' | '1W' | '1M' | 'YTD' | '1Y' | 'MAX';

export class PortfolioHistoryService {
    async rebuildUserSnapshots(userId: string): Promise<{ snapshots: number; positions: number }> {
        const [trades, dividends, fxRates] = await Promise.all([
            prisma.stockTrade.findMany({
                where: { userId, instrumentId: { not: null }, listingId: { not: null } },
                orderBy: [{ date: 'asc' }, { side: 'asc' }],
                include: { listing: { include: { prices: { orderBy: { date: 'asc' } } } } },
            }),
            prisma.cashTransfer.findMany({
                where: { userId, type: { equals: 'Dividend', mode: 'insensitive' } },
                orderBy: { date: 'asc' },
            }),
            prisma.marketFxRate.findMany({
                where: { baseCurrency: Currency.USD, quoteCurrency: Currency.EUR },
                orderBy: { date: 'asc' },
            }),
        ]);
        if (trades.length === 0) return { snapshots: 0, positions: 0 };

        const startDate = day(trades[0].date);
        const endDate = day(new Date());
        const fxByDate = new Map(fxRates.map((rate) => [dayKey(rate.date), Number(rate.rate)]));
        let latestFx = 1;
        const fxForDate = new Map<string, number>();
        for (const date of enumerateDays(startDate, endDate)) {
            latestFx = fxByDate.get(dayKey(date)) ?? latestFx;
            fxForDate.set(dayKey(date), latestFx);
        }

        const tradesByDate = new Map<string, typeof trades>();
        for (const trade of trades) {
            const key = dayKey(trade.date);
            tradesByDate.set(key, [...(tradesByDate.get(key) ?? []), trade]);
        }

        const dividendsByDate = new Map<string, number>();
        for (const dividend of dividends) {
            const key = dayKey(dividend.date);
            const marketFx = dividend.currency === Currency.EUR ? 1 : (fxForDate.get(key) ?? 1);
            const transactionFx = dividend.conversionRate ? Number(dividend.conversionRate) : marketFx;
            dividendsByDate.set(key, (dividendsByDate.get(key) ?? 0) + Number(dividend.value) * transactionFx);
        }

        const listings = new Map(trades.map((trade) => [trade.listingId!, trade.listing!]));
        const priceIndexes = new Map<string, number>();
        const latestPrices = new Map<string, { close: number; date: Date; currency: Currency }>();
        const positions = new Map<string, PositionState>();
        const snapshots: Array<{
            date: Date;
            marketValue: number;
            costBasis: number;
            realizedGain: number;
            unrealizedGain: number;
            dividends: number;
            fees: number;
            netContributions: number;
            dailyPnl: number;
            hasEstimates: boolean;
        }> = [];
        const positionRows: Array<{
            date: string;
            instrumentId: string;
            quantity: number;
            price: number;
            priceCurrency: Currency;
            fxRateToReporting: number;
            marketValue: number;
            costBasis: number;
            unrealizedGain: number;
            priceDate: Date;
            isEstimated: boolean;
        }> = [];

        let previousMarketValue = 0;
        let cumulativeRealizedGain = 0;
        for (const currentDate of enumerateDays(startDate, endDate)) {
            const key = dayKey(currentDate);
            const marketFx = fxForDate.get(key) ?? 1;

            for (const [listingId, listing] of listings) {
                const prices = listing.prices;
                let index = priceIndexes.get(listingId) ?? 0;
                while (index < prices.length && day(prices[index].date).getTime() <= currentDate.getTime()) {
                    latestPrices.set(listingId, {
                        close: Number(prices[index].close),
                        date: prices[index].date,
                        currency: prices[index].currency,
                    });
                    index += 1;
                }
                priceIndexes.set(listingId, index);
            }

            let netContributions = 0;
            let dayFees = 0;
            let dayHasEstimates = false;
            for (const trade of tradesByDate.get(key) ?? []) {
                const instrumentId = trade.instrumentId!;
                const state = positions.get(instrumentId) ?? { quantity: 0, lots: [], realizedGain: 0 };
                const nativeValue = Number(trade.price) * Number(trade.quantity);
                const nativeFees = Number(trade.fees) + Number(trade.commission);
                const explicitFx = trade.currency === Currency.EUR
                    ? 1
                    : trade.conversionRate ?? (trade.eurValue && Number(trade.value) > 0
                        ? Number(trade.eurValue) / Number(trade.value)
                        : null);
                const tradeFx = explicitFx ?? marketFx;
                const estimated = trade.currency === Currency.USD && explicitFx === null;
                dayHasEstimates ||= estimated;
                dayFees += nativeFees * tradeFx;

                if (trade.side === TradeSide.Buy) {
                    const cashFlow = (nativeValue + nativeFees) * tradeFx;
                    const totalCost = trade.costBasisOverride ?? cashFlow;
                    state.quantity += Number(trade.quantity);
                    state.lots.push({
                        quantity: Number(trade.quantity),
                        unitCost: totalCost / Number(trade.quantity),
                        estimated,
                    });
                    // A transferred tax basis belongs to the lot, but it is not
                    // the cash flow shown by the broker on the subscription day.
                    netContributions += cashFlow;
                } else {
                    const consumedCost = consumeLots(state.lots, Number(trade.quantity));
                    const proceeds = (nativeValue - nativeFees) * tradeFx;
                    state.quantity -= Number(trade.quantity);
                    const realized = isInternalTransfer(trade.type) ? 0 : proceeds - consumedCost;
                    state.realizedGain += realized;
                    cumulativeRealizedGain += realized;
                    netContributions -= proceeds;
                }
                positions.set(instrumentId, state);
            }

            let marketValue = 0;
            let costBasis = 0;
            for (const [instrumentId, state] of positions) {
                if (state.quantity <= EPSILON) continue;
                const trade = trades.find((candidate) => candidate.instrumentId === instrumentId)!;
                const price = latestPrices.get(trade.listingId!);
                if (!price) {
                    dayHasEstimates = true;
                    continue;
                }
                const fx = price.currency === Currency.EUR ? 1 : marketFx;
                const value = state.quantity * price.close * fx;
                const basis = positionCost(state.lots);
                const estimated = state.lots.some((lot) => lot.estimated);
                marketValue += value;
                costBasis += basis;
                dayHasEstimates ||= estimated;
                positionRows.push({
                    date: key,
                    instrumentId,
                    quantity: state.quantity,
                    price: price.close,
                    priceCurrency: price.currency,
                    fxRateToReporting: fx,
                    marketValue: value,
                    costBasis: basis,
                    unrealizedGain: value - basis,
                    priceDate: price.date,
                    isEstimated: estimated,
                });
            }

            const dayDividends = dividendsByDate.get(key) ?? 0;
            const dailyPnl = marketValue - previousMarketValue - netContributions + dayDividends;
            snapshots.push({
                date: currentDate,
                marketValue,
                costBasis,
                realizedGain: cumulativeRealizedGain,
                unrealizedGain: marketValue - costBasis,
                dividends: dayDividends,
                fees: dayFees,
                netContributions,
                dailyPnl,
                hasEstimates: dayHasEstimates,
            });
            previousMarketValue = marketValue;
        }

        let positionCount = 0;
        await prisma.$transaction(async (tx) => {
            await tx.portfolioDailySnapshot.deleteMany({ where: { userId, currency: Currency.EUR } });
            await tx.portfolioDailySnapshot.createMany({
                data: snapshots.map((snapshot) => ({ userId, currency: Currency.EUR, ...snapshot })),
            });
            const persisted = await tx.portfolioDailySnapshot.findMany({
                where: { userId, currency: Currency.EUR },
                select: { id: true, date: true },
            });
            const snapshotIds = new Map(persisted.map((snapshot) => [dayKey(snapshot.date), snapshot.id]));
            const batchSize = 1_000;
            for (let index = 0; index < positionRows.length; index += batchSize) {
                const batch = positionRows.slice(index, index + batchSize).map(({ date, ...position }) => ({
                    snapshotId: snapshotIds.get(date)!,
                    ...position,
                }));
                const inserted = await tx.portfolioPositionDailySnapshot.createMany({ data: batch });
                positionCount += inserted.count;
            }
        }, { timeout: 60_000 });

        return { snapshots: snapshots.length, positions: positionCount };
    }

    async getHistory(userId: string, range: PortfolioHistoryRange) {
        const latest = await prisma.portfolioDailySnapshot.findFirst({
            where: { userId, currency: Currency.EUR },
            orderBy: { date: 'desc' },
        });
        if (!latest) return null;

        const startDate = this.rangeStart(range, latest.date);
        const points = await prisma.portfolioDailySnapshot.findMany({
            where: { userId, currency: Currency.EUR, date: { gte: startDate } },
            orderBy: { date: 'asc' },
        });
        const first = points[0] ?? latest;
        let cumulativePnl = 0;
        const chartPoints = points.map((point, index) => {
            if (index > 0) cumulativePnl += Number(point.dailyPnl);
            return {
                date: dayKey(point.date),
                marketValue: Number(point.marketValue),
                performanceValue: Number(first.marketValue) + cumulativePnl,
                dailyPnl: Number(point.dailyPnl),
                hasEstimates: point.hasEstimates,
            };
        });
        const periodChange = cumulativePnl;
        const baselineValue = Number(first.marketValue);

        return {
            currency: Currency.EUR,
            range,
            currentValue: Number(latest.marketValue),
            baselineValue,
            periodChange,
            periodChangePercent: baselineValue > 0 ? (periodChange / baselineValue) * 100 : null,
            hasEstimates: points.some((point) => point.hasEstimates),
            coverageStart: dayKey((await prisma.portfolioDailySnapshot.findFirst({
                where: { userId, currency: Currency.EUR },
                orderBy: { date: 'asc' },
                select: { date: true },
            }))!.date),
            coverageEnd: dayKey(latest.date),
            points: chartPoints,
        };
    }

    private rangeStart(range: PortfolioHistoryRange, endDate: Date): Date {
        const start = day(endDate);
        switch (range) {
            case '1D': start.setUTCDate(start.getUTCDate() - 1); break;
            case '1W': start.setUTCDate(start.getUTCDate() - 7); break;
            case '1M': start.setUTCMonth(start.getUTCMonth() - 1); break;
            case 'YTD': start.setUTCMonth(0, 1); break;
            case '1Y': start.setUTCFullYear(start.getUTCFullYear() - 1); break;
            case 'MAX': start.setUTCFullYear(1970, 0, 1); break;
        }
        return start;
    }
}

export const portfolioHistoryService = new PortfolioHistoryService();
