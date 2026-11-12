import { Router } from 'express';
import { portfolioController } from './portfolio.controller';
import { authenticateToken } from '../auth/auth.middleware';

const router = Router();

router.use(authenticateToken);
router.post('/trade',portfolioController.createTrade.bind(portfolioController));

router.get('/summary', portfolioController.getPortfolioSummary.bind(portfolioController));
router.get('/history', portfolioController.getPortfolioHistory.bind(portfolioController));
router.post('/history/sync', portfolioController.syncPortfolioHistory.bind(portfolioController));
router.get('/analysis/:symbol', portfolioController.getPortfolioAnalysis.bind(portfolioController));

export default router;
