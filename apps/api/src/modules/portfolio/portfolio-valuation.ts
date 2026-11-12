import type { PriceQuote } from '../prices/price.service';
import type { CalculationResult } from './portfolio.types';

export type ValuationStatus = 'fresh' | 'delayed' | 'stale' | 'partial' | 'unavailable';

export type ValuedPosition = {
    symbol: string;
    quote: PriceQuote;
    priceEur: number;
    marketValueEur: number;
    costBasisEur: number | null;
    unrealizedGainEur: number | null;
    unrealizedGainPercent: number | null;
};

export type PortfolioValuation = {
    currency: 'EUR';
    status: ValuationStatus;
    asOf: string | null;
    ageDays: number | null;
    totalMarketValue: number | null;
    totalCostBasis: number | null;
    totalUnrealizedGain: number | null;
    totalUnrealizedGainPercent: number | null;
    missingSymbols: string[];
    sources: Array<'yahoo' | 'eodhd'>;
    positions: Record<string, ValuedPosition>;
};

const DAY_MS = 24 * 60 * 60 * 1_000;

function quoteDate(value: string | null): Date | null {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
}

function ageInCalendarDays(value: Date, now: Date): number {
    const start = Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate());
    const end = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    return Math.max(0, Math.floor((end - start) / DAY_MS));
}

export function calculatePortfolioValuation(
    holdings: CalculationResult[],
    quotes: Record<string, PriceQuote>,
    now = new Date(),
): PortfolioValuation {
    const openHoldings = holdings.filter((holding) => holding.remainingShares > 0.000001);
    const usdEur = quotes['USDEUR=X'];
    const missingSymbols: string[] = [];
    const positions: Record<string, ValuedPosition> = {};
    const sourceSet = new Set<'yahoo' | 'eodhd'>();
    const dates: Date[] = [];
    let totalMarketValue = 0;
    let totalCostBasis = 0;
    let costBasisComplete = true;

    for (const holding of openHoldings) {
        const quote = quotes[holding.symbol];
        if (!quote || quote.price <= 0 || (quote.currency === 'USD' && (!usdEur || usdEur.price <= 0))) {
            missingSymbols.push(holding.symbol);
            continue;
        }

        const priceEur = quote.currency === 'USD' ? quote.price * usdEur.price : quote.price;
        const marketValueEur = priceEur * holding.remainingShares;
        const costBasisEur = holding.conversionComplete === false || holding.totalCostBasisEur == null
            ? null
            : holding.totalCostBasisEur;
        const unrealizedGainEur = costBasisEur === null ? null : marketValueEur - costBasisEur;
        const unrealizedGainPercent = costBasisEur && unrealizedGainEur !== null
            ? (unrealizedGainEur / costBasisEur) * 100
            : null;

        positions[holding.symbol] = {
            symbol: holding.symbol,
            quote,
            priceEur,
            marketValueEur,
            costBasisEur,
            unrealizedGainEur,
            unrealizedGainPercent,
        };
        totalMarketValue += marketValueEur;
        if (costBasisEur === null) {
            costBasisComplete = false;
        } else {
            totalCostBasis += costBasisEur;
        }
        sourceSet.add(quote.source);
        const date = quoteDate(quote.asOf);
        if (date) dates.push(date);
    }

    if (openHoldings.some((holding) => quotes[holding.symbol]?.currency === 'USD') && usdEur) {
        sourceSet.add(usdEur.source);
        const fxDate = quoteDate(usdEur.asOf);
        if (fxDate) dates.push(fxDate);
    }

    const oldestDate = dates.length > 0
        ? new Date(Math.min(...dates.map((date) => date.getTime())))
        : null;
    const ageDays = oldestDate ? ageInCalendarDays(oldestDate, now) : null;
    const complete = missingSymbols.length === 0 && Object.keys(positions).length === openHoldings.length;
    const resolvedAny = Object.keys(positions).length > 0;
    const status: ValuationStatus = !resolvedAny
        ? 'unavailable'
        : !complete
            ? 'partial'
            : ageDays !== null && ageDays > 7
                ? 'stale'
                : ageDays !== null && ageDays > 3
                    ? 'delayed'
                    : 'fresh';
    const publishedMarketValue = complete ? totalMarketValue : null;
    const publishedCostBasis = costBasisComplete ? totalCostBasis : null;
    const totalUnrealizedGain = publishedMarketValue !== null && publishedCostBasis !== null
        ? publishedMarketValue - publishedCostBasis
        : null;

    return {
        currency: 'EUR',
        status,
        asOf: oldestDate?.toISOString() ?? null,
        ageDays,
        totalMarketValue: publishedMarketValue,
        totalCostBasis: publishedCostBasis,
        totalUnrealizedGain,
        totalUnrealizedGainPercent: publishedCostBasis && totalUnrealizedGain !== null
            ? (totalUnrealizedGain / publishedCostBasis) * 100
            : null,
        missingSymbols,
        sources: [...sourceSet].sort(),
        positions,
    };
}
