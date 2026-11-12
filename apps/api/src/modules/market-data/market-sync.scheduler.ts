import { prisma } from '../../common/db/prisma';
import { portfolioHistoryService } from '../portfolio/portfolio-history.service';
import { marketDataService } from './market-data.service';

const SIX_HOURS_MS = 6 * 60 * 60 * 1_000;

async function synchronizeTrackedPortfolios() {
    const owners = await prisma.stockTrade.findMany({
        where: { userId: { not: null } },
        distinct: ['userId'],
        select: { userId: true },
    });

    for (const owner of owners) {
        if (!owner.userId) continue;
        try {
            const market = await marketDataService.syncUserHistory(owner.userId);
            const snapshots = await portfolioHistoryService.rebuildUserSnapshots(owner.userId);
            console.log('[market-sync]', {
                userId: owner.userId,
                status: market.status,
                instruments: market.instruments,
                failures: market.failures.length,
                snapshots: snapshots.snapshots,
            });
        } catch (error) {
            console.error('[market-sync]', { userId: owner.userId, error });
        }
    }
}

export function scheduleMarketDataSync() {
    const run = () => void synchronizeTrackedPortfolios();
    setTimeout(run, 45_000);
    setInterval(run, SIX_HOURS_MS);
}
