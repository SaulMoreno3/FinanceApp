import yahooFinanceImport from 'yahoo-finance2';

// Force instantiation due to environment mismatch
const yahooFinance = new (yahooFinanceImport as any)();

interface PriceCache {
    [symbol: string]: {
        price: number;
        currency: string;
        asOf: string | null;
        source: 'yahoo' | 'eodhd';
        timestamp: number;
    }
}

export type PriceQuote = {
    price: number;
    currency: string;
    asOf: string | null;
    source: 'yahoo' | 'eodhd';
};

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes cache
const EODHD_BASE_URL = 'https://eodhd.com/api/eod';
const EODHD_FUND_EXCHANGE = 'EUFUND';

const FUND_ISINS = new Set([
    'IE000ZYRH0Q7',
    'IE0031786696',
    'IE00B42W4L06',
    'IE00BYX5NX33',
    'LU0625737910',
]);

export class PriceService {
    private cache: PriceCache = {};

    private readonly SYMBOL_MAP: Record<string, string> = {
        ETH: 'ETH-USD',
        // Mapped based on user's specific funds (ISIN Verified)
        'EMERGING MARKETS STOCK EUR ACC': '0P00012I6A.F', // Vanguard Emerging Markets Stock Index Fund EUR Acc (IE0031786696)
        'MSCI WORLD INDEX P ACC EUR': 'IE00BYX5NX33.SG',  // Fidelity MSCI World Index Fund P-Acc-EUR (IE00BYX5NX33)
    };

    async getPrices(symbols: string[]): Promise<Record<string, PriceQuote>> {
        const results: Record<string, PriceQuote> = {};
        const symbolsToFetch: string[] = [];
        const now = Date.now();

        // Check cache & Prepare fetch list
        for (const symbol of symbols) {
            const ticker = this.SYMBOL_MAP[symbol] || symbol;

            const cached = this.cache[ticker]; // Cache by Ticker to avoid dupe fetching
            if (cached && (now - cached.timestamp < CACHE_TTL_MS)) {
                results[symbol] = {
                    price: cached.price,
                    currency: cached.currency,
                    asOf: cached.asOf,
                    source: cached.source,
                };
            } else {
                // European mutual funds are resolved by ISIN through EODHD.
                // Sending them in the Yahoo batch can make an otherwise valid
                // stock batch fail as a whole.
                if (FUND_ISINS.has(symbol)) continue;
                // If not in cache, add to fetch list
                if (!symbolsToFetch.includes(ticker)) {
                    symbolsToFetch.push(ticker);
                }
            }
        }

        // Re-loop to handle the cache hit case correctly?
        // Above loop handles cache hits.
        // `symbolsToFetch` now has Tickers (e.g. 'IWDA.AS').

        // Fetch from Yahoo
        if (symbolsToFetch.length > 0) try {
            // yahoo-finance2 'quote' can accept an array but it's often safer to do individual or small batches if they vary widely
            // However, 'quote' supports array.
            // @ts-ignore - type definitions might be mismatched for instantiated client
            const quotes = await yahooFinance.quote(symbolsToFetch, {
                fields: ['symbol', 'regularMarketPrice', 'currency', 'regularMarketTime'],
            });

            // Should return array if multiple symbols, but check
            const quotesArray = Array.isArray(quotes) ? quotes : [quotes];

            for (const quote of quotesArray) {
                if (quote.regularMarketPrice !== undefined && quote.currency) {
                    const data = {
                        price: quote.regularMarketPrice,
                        currency: quote.currency,
                        asOf: this.quoteTimestamp(quote.regularMarketTime),
                        source: 'yahoo' as const,
                    };

                    // Update cache for the TICKER
                    this.cache[quote.symbol] = {
                        ...data,
                        timestamp: now
                    };

                    // Map back to ALL original symbols that requested this ticker
                    for (const originalSymbol of symbols) {
                        const targetTicker = this.SYMBOL_MAP[originalSymbol] || originalSymbol;
                        if (targetTicker === quote.symbol) {
                            results[originalSymbol] = data;
                        }
                    }
                }
            }
        } catch (error) {
            console.error('Error fetching prices from Yahoo:', error);
            // Return partial results
        }

        await this.fetchFundPricesFromEodhd(symbols, results, now);

        return results;
    }

    private async fetchFundPricesFromEodhd(
        symbols: string[],
        results: Record<string, PriceQuote>,
        now: number,
    ): Promise<void> {
        const eodhdApiKey = process.env.EODHD_API_KEY?.trim();
        if (!eodhdApiKey) return;

        const missingFunds = [...new Set(symbols)].filter((symbol) =>
            FUND_ISINS.has(symbol) && !results[symbol],
        );

        await Promise.all(missingFunds.map(async (isin) => {
            try {
                // EODHD resolves the ISIN through its EUFUND exchange namespace.
                // The search endpoint returns this exchange for all supported funds.
                const url = new URL(`${EODHD_BASE_URL}/${isin}.${EODHD_FUND_EXCHANGE}`);
                url.searchParams.set('api_token', eodhdApiKey);
                url.searchParams.set('fmt', 'json');
                url.searchParams.set('period', 'd');
                url.searchParams.set('order', 'd');
                url.searchParams.set('limit', '1');

                const response = await fetch(url, { signal: AbortSignal.timeout(8_000) });
                if (!response.ok) {
                    console.error(`EODHD returned ${response.status} for fund ${isin}`);
                    return;
                }

                const payload = await response.json() as unknown;
                const latest = Array.isArray(payload) ? payload[0] : payload;
                const price = Number((latest as { adjusted_close?: number; close?: number } | null)?.adjusted_close
                    ?? (latest as { close?: number } | null)?.close);
                if (!Number.isFinite(price) || price <= 0) return;

                const currency = (latest as { currency?: string } | null)?.currency || 'EUR';
                const rawDate = (latest as { date?: string } | null)?.date;
                const data: PriceQuote = {
                    price,
                    currency,
                    asOf: rawDate ? `${rawDate}T00:00:00.000Z` : null,
                    source: 'eodhd',
                };
                this.cache[isin] = { ...data, timestamp: now };
                results[isin] = data;
            } catch (error) {
                console.error(`Error fetching fund ${isin} from EODHD:`, error);
            }
        }));
    }

    private quoteTimestamp(value: unknown): string | null {
        if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
        if (typeof value === 'number' && Number.isFinite(value)) {
            const milliseconds = value > 10_000_000_000 ? value : value * 1_000;
            return new Date(milliseconds).toISOString();
        }
        if (typeof value === 'string') {
            const parsed = new Date(value);
            if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
        }
        return null;
    }

    async search(query: string) {
        try {
            // @ts-ignore
            const results = await yahooFinance.search(query);
            return results.quotes.map((q: any) => ({
                symbol: q.symbol,
                shortname: q.shortname || q.longname,
                exchange: q.exchange,
                score: q.score
            }));
        } catch (error) {
            console.error('Error searching Yahoo:', error);
            return [];
        }
    }
}

export const priceService = new PriceService();
