import { Router } from 'express';
import { authenticateToken } from '../auth/auth.middleware';
import { bankSyncController } from './bank-sync.controller';

const router = Router();

// OAuth callback must remain public: the identity comes from the signed state.
router.get('/truelayer/callback', bankSyncController.callback.bind(bankSyncController));

router.use(authenticateToken);
router.get('/status', bankSyncController.status.bind(bankSyncController));
router.get('/truelayer/connect', bankSyncController.connect.bind(bankSyncController));
router.post('/sync', bankSyncController.sync.bind(bankSyncController));
router.delete('/connection', bankSyncController.disconnect.bind(bankSyncController));

export default router;
