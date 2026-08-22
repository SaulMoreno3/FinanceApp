import { Router } from "express";
import transactionsRouter from './transactions/transactions.routes';
import portfolioRouter from './portfolio/portfolio.routes';
import importRouter from './import/import.routes';
import netWorthRouter from './networth/networth.routes';
import salaryRouter from './salary/salary.routes';
import salaryPasswordRouter from './salary-password/salary-password.routes';
import pricesRouter from './prices/price.routes';
import projectsRouter from './projects/projects.routes';
import taxesRouter from './taxes/taxes.routes';
import debtsRouter from './debts/debts.routes';
import bankSyncRouter from './bank-sync/bank-sync.routes';

import authRouter from './auth/auth.routes';

const router = Router();

router.use("/auth", authRouter);
router.use("/transactions", transactionsRouter);
router.use("/portfolio", portfolioRouter);
router.use("/import", importRouter);
router.use("/networth", netWorthRouter);
router.use("/salary", salaryRouter);
router.use("/salary-passwords", salaryPasswordRouter);
router.use("/prices", pricesRouter);
router.use("/projects", projectsRouter);
router.use("/taxes", taxesRouter);
router.use("/debts", debtsRouter);
router.use("/bank-sync", bankSyncRouter);

export default router;
