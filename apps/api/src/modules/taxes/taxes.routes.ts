import { Router } from 'express';
import { authenticateToken } from '../auth/auth.middleware';
import { createDiskUploader } from '../../common/utils/fileUpload';
import { taxesController } from './taxes.controller';

const router = Router();
router.use(authenticateToken);

const upload = createDiskUploader('taxes');

router.get('/', taxesController.list.bind(taxesController));
router.get('/summary', taxesController.summary.bind(taxesController));
router.post('/', upload.single('file'), taxesController.create.bind(taxesController));
router.get('/:id/file', taxesController.file.bind(taxesController));
router.delete('/:id', taxesController.delete.bind(taxesController));

export default router;
