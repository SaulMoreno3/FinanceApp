import { Router } from 'express';
import { authenticateToken } from '../auth/auth.middleware';
import { debtsController } from './debts.controller';

const router = Router();
router.use(authenticateToken);
router.get('/', debtsController.list.bind(debtsController));
router.post('/', debtsController.create.bind(debtsController));
router.get('/:id', debtsController.get.bind(debtsController));
router.put('/:id', debtsController.update.bind(debtsController));
router.delete('/:id', debtsController.delete.bind(debtsController));

export default router;
