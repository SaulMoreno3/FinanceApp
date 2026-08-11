import fs from 'node:fs';
import path from 'node:path';
import type { Response } from 'express';
import { taxesService } from './taxes.service';
import { taxReturnSchema } from './taxes.schema';

export class TaxesController {
    async list(req: any, res: Response) {
        try {
            res.json({ data: await taxesService.list(req.user!.id) });
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    }

    async create(req: any, res: Response) {
        try {
            const validation = taxReturnSchema.safeParse({
                ...req.body,
                filingDate: req.body.filingDate || undefined,
                notes: req.body.notes || undefined,
            });
            if (!validation.success) {
                if (req.file?.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
                return res.status(400).json({ error: 'Invalid tax return details', details: validation.error.format() });
            }

            const result = await taxesService.create(req.user!.id, validation.data, req.file);
            res.status(201).json(result);
        } catch (error) {
            if (req.file?.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
            console.error(error);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    }

    async file(req: any, res: Response) {
        try {
            const file = await taxesService.getFile(req.user!.id, req.params.id);
            if (!file?.fileStorageKey || !fs.existsSync(file.fileStorageKey)) {
                return res.status(404).json({ error: 'Tax document not found' });
            }

            res.setHeader('Content-Type', file.fileMimeType || 'application/octet-stream');
            res.setHeader('Content-Disposition', 'inline');
            res.setHeader('Cache-Control', 'private, no-store');
            return res.sendFile(path.resolve(file.fileStorageKey));
        } catch (error) {
            console.error(error);
            return res.status(500).json({ error: 'Internal Server Error' });
        }
    }

    async delete(req: any, res: Response) {
        try {
            if (!await taxesService.delete(req.user!.id, req.params.id)) {
                return res.status(404).json({ error: 'Tax return not found' });
            }
            res.status(204).send();
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    }
}

export const taxesController = new TaxesController();
