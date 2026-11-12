import { Currency, TradeSide } from '../../generated/prisma/enums';
import { prisma } from '../../common/db/prisma';
import { priceService } from '../prices/price.service';

const DAY_MS = 24 * 60 * 60 * 1000;
const EPSILON = 0.000001;

function calendarAgeInDays(value: Date, reference = new Date()): number {
    return Math.max(0, Math.floor((day(reference).getTime() - day(value).getTime()) / DAY_MS));
}

type Lot = { quantity: number; unitCost: number; estimated: boolean };
type PositionState = { quantity: number; lots: Lot[]; realizedGain: number };

function day(value: Date): Date {
    return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function dayKey(value: Date): string {
    return day(value).toISOString().slice(0, 10);
}

export function canOverlayLiveValue(snapshotDate: Date, now = new Date()): boolean {
    return dayKey(snapshotDate) === dayKey(now);
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

export function calculateBuyAccounting(
    nativeValue: number,
    nativeFees: number,
    fxRate: number,
    costBasisOverride: number | null,
): { cashFlow: number; costBasis: number } {
    const cashFlow = (nativeValue + nativeFees) * fxRate;
    return {
        cashFlow,
        costBasis: costBasisOverride ?? cashFlow,
    };
}

export function calculateDailyPerformance(
    marketValue: number,
    previousMarketValue: number,
    cashInflows: number,
    cashOutflows: number,
    dividends: number,
): number {
    return marketValue - previousMarketValue - cashInflows + cashOutflows + dividends;
}

/**
 * True time-weighted daily return. Securities bought during the day are
 * treated as beginning-of-period inflows and securities sold are treated as
 * end-of-period outflows. This prevents trading and internal transfers from
 * being reported as investment performance while still including dividends,
 * fees and price movements.
 */
export function calculateDailyReturn(
    marketValue: number,
    previousMarketValue: number,
    cashInflows: number,
    cashOutflows: number,
    dividends: number,
): number {
    const capitalAtRisk = previousMarketValue + cashInflows;
    if (capitalAtRisk <= EPSILON) return 0;

    return ((marketValue + cashOutflows + dividends) / capitalAtRisk) - 1;
}

export type PortfolioHistoryRange = '1D' | '1W' | '1M' | 'YTD' | '1Y' | 'MAX';

export class PortfolioHistoryService {
    async needsSynchronization(userId: string): Promise<boolean> {
        const latest = await prisma.portfolioDailySnapshot.findFirst({
            where: { userId, currency: Currency.EUR },
            orderBy: { date: 'desc' },
            select: { date: true },
        });

        return !latest || dayKey(latest.date) < dayKey(new Date());
    }

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
        // Historical charts must stop at the last day on which every open
        // position can actually be valued. Extending an old close through
        // today creates a convincing but fictitious flat line.
        const openQuantities = new Map<string, number>();
        for (const trade of trades) {
            const direction = trade.side === TradeSide.Buy ? 1 : -1;
            openQuantities.set(
                trade.instrumentId!,
                (openQuantities.get(trade.instrumentId!) ?? 0) + (direction * Number(trade.quantity)),
            );
        }
        const openTrades = trades.filter((trade) => (openQuantities.get(trade.instrumentId!) ?? 0) > EPSILON);
        const latestRequiredDates = [...new Map(openTrades.map((trade) => [trade.listingId!, trade])).values()]
            .flatMap((trade) => {
                const latestPrice = trade.listing!.prices.at(-1);
                return latestPrice ? [latestPrice.date] : [];
            });
        if (openTrades.some((trade) => trade.currency === Currency.USD)) {
            const latestFx = fxRates.at(-1);
            if (latestFx) latestRequiredDates.push(latestFx.date);
        }
        const today = day(new Date());
        const endDate = latestRequiredDates.length > 0
            ? new Date(Math.min(today.getTime(), ...latestRequiredDates.map((date) => day(date).getTime())))
            : today;
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
            cashInflows: number;
            cashOutflows: number;
            netContributions: number;
            dailyPnl: number;
            dailyReturn: number;
            hasEstimates: boolean;
            marketValueAvailable: boolean;
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

            let cashInflows = 0;
            let cashOutflows = 0;
            let dayFees = 0;
            let dayHasEstimates = false;
            let marketValueAvailable = true;
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
                    const accounting = calculateBuyAccounting(
                        nativeValue,
                        nativeFees,
                        tradeFx,
                        trade.costBasisOverride,
                    );
                    state.quantity += Number(trade.quantity);
                    state.lots.push({
                        quantity: Number(trade.quantity),
                        unitCost: accounting.costBasis / Number(trade.quantity),
                        estimated,
                    });
                    // Transfers between tracked portfolios are cash-flow
                    // neutral for performance, but still need to be included
                    // in the contribution adjustment so a moved position
                    // does not look like a gain or loss.
                    cashInflows += accounting.cashFlow;
                } else {
                    const consumedCost = consumeLots(state.lots, Number(trade.quantity));
                    const proceeds = (nativeValue - nativeFees) * tradeFx;
                    state.quantity -= Number(trade.quantity);
                    const realized = isInternalTransfer(trade.type) ? 0 : proceeds - consumedCost;
                    state.realizedGain += realized;
                    cumulativeRealizedGain += realized;
                    cashOutflows += proceeds;
                }
                positions.set(instrumentId, state);
            }

            let marketValue = 0;
            let costBasis = 0;
            for (const [instrumentId, state] of positions) {
                if (state.quantity <= EPSILON) continue;
                const trade = trades.find((candidate) => candidate.instrumentId === instrumentId)!;
                const price = latestPrices.get(trade.listingId!);
                // A zero quote is an invalid/missing valuation, not a real
                // zero market value. Mark the day unavailable so the history
                // endpoint omits it and the chart bridges the gap.
                if (!price || price.close <= EPSILON) {
                    marketValueAvailable = false;
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
            const dailyPnl = calculateDailyPerformance(
                marketValue,
                previousMarketValue,
                cashInflows,
                cashOutflows,
                dayDividends,
            );
            const dailyReturn = calculateDailyReturn(
                marketValue,
                previousMarketValue,
                cashInflows,
                cashOutflows,
                dayDividends,
            );
            snapshots.push({
                date: currentDate,
                marketValue,
                costBasis,
                realizedGain: cumulativeRealizedGain,
                unrealizedGain: marketValue - costBasis,
                dividends: dayDividends,
                fees: dayFees,
                cashInflows,
                cashOutflows,
                netContributions: cashInflows - cashOutflows,
                dailyPnl,
                dailyReturn,
                hasEstimates: dayHasEstimates,
                marketValueAvailable,
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
            include: { positions: { select: { priceDate: true } } },
        });
        if (!latest) return null;

        const startDate = this.rangeStart(range, latest.date);
        const points = await prisma.portfolioDailySnapshot.findMany({
            where: { userId, currency: Currency.EUR, date: { gte: startDate } },
            orderBy: { date: 'asc' },
        });
        // Early snapshots can legitimately be zero while the first market
        // price is still unavailable. They must not become the performance
        // baseline, otherwise Max shows a fake jump from 0 EUR.
        const firstPositiveIndex = points.findIndex((point) => point.marketValueAvailable && Number(point.marketValue) > 0);
        const lastUnavailableIndex = points.reduce(
            (lastIndex, point, index) => point.marketValueAvailable ? lastIndex : index,
            -1,
        );
        const firstValuedIndex = Math.max(firstPositiveIndex, lastUnavailableIndex + 1);
        const valuedPoints = firstValuedIndex >= 0
            ? points.slice(firstValuedIndex).filter((point) => point.marketValueAvailable)
            : [];
        const first = valuedPoints[0] ?? latest;
        let cumulativePnl = 0;
        let cumulativeReturnFactor = 1;
        let previousPointIndex = firstValuedIndex;
        const chartPoints = valuedPoints.map((point, index) => {
            const pointIndex = points.indexOf(point);
            if (index > 0 && pointIndex === previousPointIndex + 1) {
                cumulativePnl += Number(point.dailyPnl);
                cumulativeReturnFactor *= 1 + Number(point.dailyReturn);
            } else if (index > 0) {
                // A missing-price interval is a valuation gap, not a loss.
                // Keep the performance already earned and skip the first
                // daily change after prices resume because its baseline is
                // incomplete.
            }
            previousPointIndex = pointIndex;
            return {
                date: dayKey(point.date),
                marketValue: Number(point.marketValue),
                investedCapital: Number(point.costBasis),
                performanceAmount: cumulativePnl,
                performancePercent: (cumulativeReturnFactor - 1) * 100,
                dailyPnl: Number(point.dailyPnl),
                dailyReturn: Number(point.dailyReturn),
                hasEstimates: point.hasEstimates,
            };
        });
        const baselineValue = Number(first.marketValue);
        let currentValue = Number(latest.marketValue);
        let marketValueChange = currentValue - baselineValue;
        let periodChange = cumulativePnl;
        let periodReturnFactor = cumulativeReturnFactor;

        // The stored snapshot is based on daily bars. Replace only today's
        // point with live quotes when the provider has them, so the current
        // value never presents yesterday's close as today's valuation.
        const liveValue = await this.getLiveMarketValue(userId, latest.id);
        if (liveValue !== null && chartPoints.length > 1 && canOverlayLiveValue(latest.date)) {
            const lastPoint = chartPoints[chartPoints.length - 1];
            const previousPoint = chartPoints[chartPoints.length - 2];
            const previousMarketValue = previousPoint.marketValue;
            const currentDailyPnl = calculateDailyPerformance(
                liveValue,
                previousMarketValue,
                Number(latest.cashInflows),
                Number(latest.cashOutflows),
                Number(latest.dividends),
            );
            const currentDailyReturn = calculateDailyReturn(
                liveValue,
                previousMarketValue,
                Number(latest.cashInflows),
                Number(latest.cashOutflows),
                Number(latest.dividends),
            );
            const dailyPnlAdjustment = currentDailyPnl - lastPoint.dailyPnl;
            const previousReturnFactor = 1 + (previousPoint.performancePercent / 100);

            currentValue = liveValue;
            periodChange += dailyPnlAdjustment;
            periodReturnFactor = previousReturnFactor * (1 + currentDailyReturn);
            marketValueChange = currentValue - baselineValue;
            lastPoint.marketValue = liveValue;
            lastPoint.performanceAmount += dailyPnlAdjustment;
            lastPoint.performancePercent = (periodReturnFactor - 1) * 100;
            lastPoint.dailyPnl = currentDailyPnl;
            lastPoint.dailyReturn = currentDailyReturn;
        }

        const oldestPositionPrice = latest.positions.length > 0
            ? new Date(Math.min(...latest.positions.map((position) => position.priceDate.getTime())))
            : latest.date;
        const snapshotAgeDays = calendarAgeInDays(latest.date);
        const priceAgeDays = calendarAgeInDays(oldestPositionPrice);
        const historyAgeDays = Math.max(snapshotAgeDays, priceAgeDays);
        const historyStatus = historyAgeDays > 7 ? 'stale' : historyAgeDays > 3 ? 'delayed' : 'fresh';

        return {
            currency: Currency.EUR,
            range,
            currentValue,
            baselineValue,
            periodChange,
            marketValueChange,
            periodChangePercent: (periodReturnFactor - 1) * 100,
            returnMethod: 'TTWROR',
            hasEstimates: valuedPoints.some((point) => point.hasEstimates),
            coverageStart: dayKey(first.date),
            coverageEnd: dayKey(latest.date),
            dataQuality: {
                status: historyStatus,
                ageDays: historyAgeDays,
                snapshotAsOf: dayKey(latest.date),
                oldestPriceAsOf: dayKey(oldestPositionPrice),
            },
            points: chartPoints,
        };
    }

    private async getLiveMarketValue(userId: string, snapshotId: string): Promise<number | null> {
        const positions = await prisma.portfolioPositionDailySnapshot.findMany({
            where: { snapshotId },
            include: { instrument: { include: { listings: true } } },
        });
        if (positions.length === 0) return null;

        const listingByPosition = positions.map((position) => {
            const listing = position.instrument.listings.find((candidate) => candidate.isPrimary)
                ?? position.instrument.listings[0];
            if (!listing) return null;
            const quoteSymbol = listing.provider === 'eodhd' && position.instrument.isin
                ? position.instrument.isin
                : listing.providerSymbol;
            return { position, listing, quoteSymbol };
        }).filter((value): value is NonNullable<typeof value> => value !== null);
        if (listingByPosition.length === 0) return null;

        const quoteSymbols = [...new Set(listingByPosition.map((value) => value.quoteSymbol))];
        const requiresUsdEur = listingByPosition.some(({ listing }) => listing.currency === Currency.USD);
        const quotes = await priceService.getPrices(requiresUsdEur ? [...quoteSymbols, 'USDEUR=X'] : quoteSymbols);
        const usdToEur = quotes['USDEUR=X']?.price;
        let total = 0;
        let resolved = 0;

        for (const { position, listing, quoteSymbol } of listingByPosition) {
            const quote = quotes[quoteSymbol];
            if (!quote || quote.price <= EPSILON) continue;
            if (listing.currency === Currency.USD && !usdToEur) continue;
            const fx = listing.currency === Currency.EUR ? 1 : usdToEur!;
            total += Number(position.quantity) * quote.price * fx;
            resolved += 1;
        }

        return resolved === listingByPosition.length ? total : null;
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
