import yahooFinanceImport from 'yahoo-finance2';
import { prisma } from '../../common/db/prisma';
import { Currency, InstrumentType } from '../../generated/prisma/enums';

const yahooFinance = new (yahooFinanceImport as any)();
const EODHD_BASE_URL = 'https://eodhd.com/api/eod';
const ECB_USD_EUR_SERIES_URL = 'https://data-api.ecb.europa.eu/service/data/EXR/D.USD.EUR.SP00.A';

const YAHOO_SYMBOL_OVERRIDES: Record<string, string> = {
    ETH: 'ETH-USD',
    MEL: 'MEL.MC',
    VUAA: 'VUAA.DE',
};

type TradeIdentity = {
    symbol: string;
    isin: string | null;
    name: string | null;
    assetType: string | null;
    currency: Currency;
};

type PriceBarInput = {
    date: Date;
    open: number | null;
    high: number | null;
    low: number | null;
    close: number;
    adjustedClose: number | null;
    volume: number | null;
};

export type MarketSyncResult = {
    instruments: number;
    priceBars: number;
    fxRates: number;
    failures: Array<{ symbol: string; reason: string }>;
};

function asDateOnly(value: string | Date): Date {
    const date = typeof value === 'string' ? new Date(`${value}T00:00:00.000Z`) : value;
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function formatDate(date: Date): string {
    return date.toISOString().slice(0, 10);
}

function mapInstrumentType(assetType: string | null): InstrumentType {
    switch (assetType?.trim().toLowerCase()) {
        case 'stock': return InstrumentType.STOCK;
        case 'etf': return InstrumentType.ETF;
        case 'fund': return InstrumentType.FUND;
        case 'crypto': return InstrumentType.CRYPTO;
        case 'index': return InstrumentType.INDEX;
        case 'forex': return InstrumentType.FOREX;
        default: return InstrumentType.OTHER;
    }
}

function canonicalKey(trade: TradeIdentity): string {
    return trade.isin
        ? `isin:${trade.isin.toUpperCase()}`
        : `symbol:${trade.symbol.toUpperCase()}:${trade.currency}`;
}

function providerFor(trade: TradeIdentity): { provider: 'eodhd' | 'yahoo'; symbol: string } {
    if (mapInstrumentType(trade.assetType) === InstrumentType.FUND && trade.isin) {
        return { provider: 'eodhd', symbol: `${trade.isin.toUpperCase()}.EUFUND` };
    }
    return {
        provider: 'yahoo',
        symbol: YAHOO_SYMBOL_OVERRIDES[trade.symbol.toUpperCase()] ?? trade.symbol.toUpperCase(),
    };
}

function parseCsvRow(row: string): string[] {
    const values: string[] = [];
    let current = '';
    let quoted = false;
    for (let index = 0; index < row.length; index += 1) {
        const character = row[index];
        if (character === '"') {
            if (quoted && row[index + 1] === '"') {
                current += '"';
                index += 1;
            } else {
                quoted = !quoted;
            }
        } else if (character === ',' && !quoted) {
            values.push(current);
            current = '';
        } else {
            current += character;
        }
    }
    values.push(current);
    return values;
}

export class MarketDataService {
    async syncUserHistory(userId: string): Promise<MarketSyncResult> {
        const trades = await prisma.stockTrade.findMany({
            where: { userId },
            select: {
                symbol: true,
                isin: true,
                name: true,
                assetType: true,
                currency: true,
                date: true,
            },
            orderBy: { date: 'asc' },
        });

        if (trades.length === 0) {
            return { instruments: 0, priceBars: 0, fxRates: 0, failures: [] };
        }

        const startDate = asDateOnly(trades[0].date);
        startDate.setUTCDate(startDate.getUTCDate() - 7);
        const endDate = asDateOnly(new Date());
        const identities = [...new Map(trades.map((trade) => {
            const identity: TradeIdentity = trade;
            return [canonicalKey(identity), identity];
        })).values()];

        const result: MarketSyncResult = {
            instruments: 0,
            priceBars: 0,
            fxRates: 0,
            failures: [],
        };

        for (const identity of identities) {
            try {
                const provider = providerFor(identity);
                const instrument = await prisma.instrument.upsert({
                    where: { canonicalKey: canonicalKey(identity) },
                    create: {
                        canonicalKey: canonicalKey(identity),
                        isin: identity.isin?.toUpperCase() ?? null,
                        name: identity.name?.trim() || identity.symbol,
                        type: mapInstrumentType(identity.assetType),
                    },
                    update: {
                        name: identity.name?.trim() || identity.symbol,
                        type: mapInstrumentType(identity.assetType),
                    },
                });
                const listing = await prisma.marketListing.upsert({
                    where: {
                        provider_providerSymbol: {
                            provider: provider.provider,
                            providerSymbol: provider.symbol,
                        },
                    },
                    create: {
                        instrumentId: instrument.id,
                        ticker: identity.symbol,
                        currency: identity.currency,
                        provider: provider.provider,
                        providerSymbol: provider.symbol,
                        isPrimary: true,
                    },
                    update: {
                        instrumentId: instrument.id,
                        ticker: identity.symbol,
                        currency: identity.currency,
                    },
                });

                await prisma.stockTrade.updateMany({
                    where: identity.isin
                        ? { userId, isin: identity.isin }
                        : { userId, symbol: identity.symbol, isin: null },
                    data: { instrumentId: instrument.id, listingId: listing.id },
                });

                const bars = provider.provider === 'eodhd'
                    ? await this.fetchEodhdBars(provider.symbol, startDate, endDate)
                    : await this.fetchYahooBars(provider.symbol, startDate, endDate);

                if (bars.length === 0) {
                    throw new Error('The provider returned no historical prices');
                }

                const inserted = await prisma.marketPriceBar.createMany({
                    data: bars.map((bar) => ({
                        listingId: listing.id,
                        ...bar,
                        currency: identity.currency,
                        source: provider.provider,
                    })),
                    skipDuplicates: true,
                });
                result.instruments += 1;
                result.priceBars += inserted.count;
            } catch (error) {
                result.failures.push({
                    symbol: identity.symbol,
                    reason: error instanceof Error ? error.message : String(error),
                });
            }
        }

        result.fxRates = await this.syncEcbUsdEurRates(startDate, endDate);
        return result;
    }

    private async fetchYahooBars(symbol: string, startDate: Date, endDate: Date): Promise<PriceBarInput[]> {
        const exclusiveEndDate = new Date(endDate);
        exclusiveEndDate.setUTCDate(exclusiveEndDate.getUTCDate() + 1);
        const response = await yahooFinance.chart(symbol, {
            period1: startDate,
            period2: exclusiveEndDate,
            interval: '1d',
            events: 'div|split',
        });

        return (response.quotes as Array<{
            date: Date;
            open: number | null;
            high: number | null;
            low: number | null;
            close: number | null;
            adjclose?: number | null;
            volume: number | null;
        }>).flatMap((quote) => quote.close === null ? [] : [{
            date: asDateOnly(quote.date),
            open: quote.open,
            high: quote.high,
            low: quote.low,
            close: quote.close,
            adjustedClose: quote.adjclose ?? null,
            volume: quote.volume,
        }]);
    }

    private async fetchEodhdBars(symbol: string, startDate: Date, endDate: Date): Promise<PriceBarInput[]> {
        const apiKey = process.env.EODHD_API_KEY?.trim();
        if (!apiKey) throw new Error('EODHD_API_KEY is not configured');

        const url = new URL(`${EODHD_BASE_URL}/${encodeURIComponent(symbol)}`);
        url.searchParams.set('api_token', apiKey);
        url.searchParams.set('fmt', 'json');
        url.searchParams.set('period', 'd');
        url.searchParams.set('from', formatDate(startDate));
        url.searchParams.set('to', formatDate(endDate));
        url.searchParams.set('order', 'a');

        const response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
        if (!response.ok) throw new Error(`EODHD returned HTTP ${response.status}`);
        const payload = await response.json() as Array<{
            date?: string;
            open?: number;
            high?: number;
            low?: number;
            close?: number;
            adjusted_close?: number;
            volume?: number;
        }>;
        if (!Array.isArray(payload)) throw new Error('EODHD returned an invalid response');

        return payload.flatMap((bar) => {
            const close = Number(bar.close);
            if (!bar.date || !Number.isFinite(close) || close <= 0) return [];
            return [{
                date: asDateOnly(bar.date),
                open: Number.isFinite(Number(bar.open)) ? Number(bar.open) : null,
                high: Number.isFinite(Number(bar.high)) ? Number(bar.high) : null,
                low: Number.isFinite(Number(bar.low)) ? Number(bar.low) : null,
                close,
                adjustedClose: Number.isFinite(Number(bar.adjusted_close)) ? Number(bar.adjusted_close) : null,
                volume: Number.isFinite(Number(bar.volume)) ? Number(bar.volume) : null,
            }];
        });
    }

    private async syncEcbUsdEurRates(startDate: Date, endDate: Date): Promise<number> {
        const url = new URL(ECB_USD_EUR_SERIES_URL);
        url.searchParams.set('startPeriod', formatDate(startDate));
        url.searchParams.set('endPeriod', formatDate(endDate));
        url.searchParams.set('format', 'csvdata');
        const response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
        if (!response.ok) throw new Error(`ECB returned HTTP ${response.status}`);
        const rows = (await response.text()).trim().split(/\r?\n/);
        if (rows.length < 2) return 0;

        const header = parseCsvRow(rows[0]);
        const dateIndex = header.indexOf('TIME_PERIOD');
        const valueIndex = header.indexOf('OBS_VALUE');
        if (dateIndex < 0 || valueIndex < 0) throw new Error('ECB CSV columns are missing');

        const rates = rows.slice(1).flatMap((row) => {
            const columns = parseCsvRow(row);
            const usdPerEur = Number(columns[valueIndex]);
            if (!columns[dateIndex] || !Number.isFinite(usdPerEur) || usdPerEur <= 0) return [];
            return [{
                date: asDateOnly(columns[dateIndex]),
                baseCurrency: Currency.USD,
                quoteCurrency: Currency.EUR,
                rate: 1 / usdPerEur,
                source: 'ecb',
            }];
        });
        const inserted = await prisma.marketFxRate.createMany({ data: rates, skipDuplicates: true });
        return inserted.count;
    }
}

export const marketDataService = new MarketDataService();
