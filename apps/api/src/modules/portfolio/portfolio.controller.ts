import { Request, Response } from 'express';
import { portfolioService } from './portfolio.service';
import { transactionsService } from '../transactions/transactions.service';
import { StockTrade } from './portfolio.types';
import { portfolioHistoryService, type PortfolioHistoryRange } from './portfolio-history.service';
import { marketDataService } from '../market-data/market-data.service';
import { prisma } from '../../common/db/prisma';
import { Currency } from '../../generated/prisma/enums';
import { priceService } from '../prices/price.service';
import { calculatePortfolioValuation } from './portfolio-valuation';
import { ZodError } from 'zod';

const HISTORY_RANGES = new Set<PortfolioHistoryRange>(['1D', '1W', '1M', 'YTD', '1Y', 'MAX']);

export class PortfolioController {
    async createTrade(req:any,res:Response) {
        try{return res.status(201).json(await transactionsService.createTrade(req.user!.id,req.body));}
        catch(error){if(error instanceof ZodError)return res.status(400).json({error:error.issues[0]?.message??'Invalid trade'});
            console.error('Error creating manual trade');return res.status(500).json({error:'Unable to create trade'});}
    }
    async getPortfolioHistory(req: any, res: Response) {
        try {
            const range = String(req.query.range ?? 'YTD').toUpperCase() as PortfolioHistoryRange;
            if (!HISTORY_RANGES.has(range)) {
                return res.status(400).json({ error: 'Unsupported history range' });
            }

            const history = await portfolioHistoryService.getHistory(req.user!.id, range);
            if (!history) {
                return res.status(404).json({ error: 'Portfolio history has not been generated yet' });
            }
            return res.json(history);
        } catch (error) {
            console.error('Error loading portfolio history:', error);
            return res.status(500).json({ error: 'Internal server error' });
        }
    }

    async syncPortfolioHistory(req: any, res: Response) {
        try {
            const marketData = await marketDataService.syncUserHistory(req.user!.id);
            const snapshots = await portfolioHistoryService.rebuildUserSnapshots(req.user!.id);
            return res.json({ ...marketData, ...snapshots });
        } catch (error) {
            console.error('Error synchronizing portfolio history:', error);
            return res.status(500).json({ error: 'Unable to synchronize portfolio history' });
        }
    }

    async getPortfolioAnalysis(req: any, reqRes: Response) {
        try {
            const { symbol } = req.params;
            const { method = 'FIFO' } = req.query;
            const userId = req.user!.id;

            if (!symbol) {
                return reqRes.status(400).json({ error: 'Symbol is required' });
            }
            if (method !== 'FIFO' && method !== 'WeightedAverage') {
                return reqRes.status(400).json({ error: 'Unsupported calculation method' });
            }

            // Fetch all trades for this symbol, regardless of currency
            const tradesResult = await transactionsService.getTransactions(userId, {
                symbol: symbol as string,
                limit: 10000,
                page: 1
            });

            // Map DB trades to StockTrade interface
            // The DB result has 'data' array.
            const trades: StockTrade[] = tradesResult.data.map((t: any) => ({
                date: new Date(t.date),
                symbol: t.symbol,
                isin: t.isin,
                name: t.name,
                assetType: t.assetType,
                currency: t.currency,
                quantity: t.quantity,
                price: t.price,
                value: t.value,
                side: t.side,
                type: t.type,
                eurValue: t.eurValue == null ? null : Number(t.eurValue),
                conversionRate: t.conversionRate == null ? null : Number(t.conversionRate),
                costBasisOverride: t.costBasisOverride,
                fees: t.fees,
                commission: t.commission
            }));

            let result;
            if (method === 'WeightedAverage') {
                result = portfolioService.calculateWeightedAverage(trades);
            } else {
                result = portfolioService.calculateFIFO(trades);
            }

            return reqRes.json(result);
        } catch (error) {
            console.error('Error calculating portfolio:', error);
            return reqRes.status(500).json({ error: 'Internal server error' });
        }
    }

    async getPortfolioSummary(req: any, reqRes: Response) {
        try {
            const { method = 'FIFO', currency = 'EUR' } = req.query; // Default to EUR for unified view
            const userId = req.user!.id;
            if (method !== 'FIFO' && method !== 'WeightedAverage') {
                return reqRes.status(400).json({ error: 'Unsupported calculation method' });
            }
            if (currency !== 'EUR' && currency !== 'USD') {
                return reqRes.status(400).json({ error: 'Unsupported target currency' });
            }

            // Fetch all trades (mixed currencies)
            const tradesResult = await transactionsService.getTransactions(userId, {
                // currency: currency as 'EUR' | 'USD', // Don't filter by currency if we want everything
                limit: 100000,
                page: 1
            });

            // Use the same ECB reference-rate series as portfolio history.
            // Cash-transfer rates describe a different operation and caused
            // realized P&L to disagree with the historical snapshots whenever
            // a trade did not include an explicit broker conversion.
            const exchangeRates = (await prisma.marketFxRate.findMany({
                where: { baseCurrency: Currency.USD, quoteCurrency: Currency.EUR },
                orderBy: { date: 'asc' },
                select: { date: true, rate: true },
            })).map((rate) => ({ date: rate.date, rate: Number(rate.rate), currency: 'USD' }));

            const trades: StockTrade[] = tradesResult.data.map((t: any) => ({
                date: new Date(t.date),
                symbol: t.symbol,
                isin: t.isin,
                name: t.name,
                assetType: t.assetType,
                currency: t.currency,
                quantity: t.quantity,
                price: t.price,
                value: t.value,
                side: t.side,
                type: t.type,
                eurValue: t.eurValue == null ? null : Number(t.eurValue),
                conversionRate: t.conversionRate == null ? null : Number(t.conversionRate),
                costBasisOverride: t.costBasisOverride,
                fees: t.fees,
                commission: t.commission
            }));

            const results = portfolioService.calculatePortfolioSummary(
                trades,
                method as 'FIFO' | 'WeightedAverage',
                currency as 'EUR' | 'USD',
                exchangeRates
            );

            // Aggregate totals
            // Aggregate totals using the EUR converted values
            const conversionComplete = results.every(item => item.conversionComplete !== false);
            const totalRealizedGain = conversionComplete
                ? results.reduce((sum, item) => sum + (item.realizedGainEur ?? 0), 0)
                : null;
            const totalCostBasis = conversionComplete
                ? results.reduce((sum, item) => sum + (item.totalCostBasisEur ?? 0), 0)
                : null;
            const openSymbols = results
                .filter((item) => item.remainingShares > 0)
                .map((item) => item.symbol);
            const quotes = await priceService.getPrices([...new Set([...openSymbols, 'USDEUR=X'])]);
            const valuation = calculatePortfolioValuation(results, quotes);

            return reqRes.json({
                currency,
                method,
                totalRealizedGain,
                totalCostBasis,
                conversionComplete,
                valuation,
                holdings: results
                    .filter(r => r.remainingShares > 0 || r.realizedGain !== 0)
                    .map(({ breakdown, ...rest }) => rest) // Exclude breakdown from summary to reduce payload size
            });

        } catch (error) {
            console.error('Error calculating portfolio summary:', error);
            return reqRes.status(500).json({ error: 'Internal server error' });
        }
    }
}

export const portfolioController = new PortfolioController();
