export interface BreakdownItem {
    sellDate: string;
    quantitySold: number;
    sellPrice: number;
    buyDate: string;
    buyPrice: number;
    gain: number;
}

export interface Holding {
    symbol: string;
    name?: string | null;
    isin?: string | null;
    currency: string;
    realizedGain: number;
    realizedGainEur?: number;
    remainingShares: number;
    totalCostBasis: number;
    totalCostBasisEur?: number;
    averageCost: number;
    conversionComplete?: boolean;
    breakdown?: BreakdownItem[];
}

export type PriceQuote = {
    price: number;
    currency: string;
    asOf: string | null;
    source: "yahoo" | "eodhd";
};

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
    currency: "EUR";
    status: "fresh" | "delayed" | "stale" | "partial" | "unavailable";
    asOf: string | null;
    ageDays: number | null;
    totalMarketValue: number | null;
    totalCostBasis: number | null;
    totalUnrealizedGain: number | null;
    totalUnrealizedGainPercent: number | null;
    missingSymbols: string[];
    sources: Array<"yahoo" | "eodhd">;
    positions: Record<string, ValuedPosition>;
};

export interface PortfolioSummary {
    currency: string;
    method: string;
    totalRealizedGain: number | null;
    totalCostBasis: number | null;
    conversionComplete: boolean;
    valuation: PortfolioValuation;
    holdings: Holding[];
}
