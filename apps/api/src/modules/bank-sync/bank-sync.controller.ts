import type { Request, Response } from 'express';
import { trueLayerService } from './truelayer.service';

const frontendUrl = () => (process.env.WEB_APP_URL ?? 'https://finance.saulmoreno.es').replace(/\/$/, '');

export class BankSyncController {
    async connect(req: any, res: Response) {
        try {
            res.json({ url: await trueLayerService.createConnectionUrl(req.user!.id) });
        } catch (error: any) {
            res.status(error.statusCode ?? 500).json({ error: error.message ?? 'No se pudo iniciar la conexión bancaria' });
        }
    }

    async callback(req: Request, res: Response) {
        try {
            const { code, state, error, error_description: errorDescription } = req.query as Record<string, string | undefined>;
            if (error) throw Object.assign(new Error(errorDescription ?? error), { statusCode: 400 });
            if (!code || !state) throw Object.assign(new Error('Respuesta de autorización incompleta'), { statusCode: 400 });
            await trueLayerService.completeConnection(code, state);
            res.redirect(`${frontendUrl()}/import?truelayer=connected`);
        } catch (error: any) {
            const message = encodeURIComponent(error.message ?? 'No se pudo completar la conexión');
            res.redirect(`${frontendUrl()}/import?truelayer=error&message=${message}`);
        }
    }

    async status(req: any, res: Response) {
        res.json(await trueLayerService.getStatus(req.user!.id));
    }

    async sync(req: any, res: Response) {
        try {
            res.json({ data: await trueLayerService.syncForUser(req.user!.id) });
        } catch (error: any) {
            res.status(error.statusCode ?? 500).json({ error: error.message ?? 'No se pudo sincronizar la cuenta' });
        }
    }

    async disconnect(req: any, res: Response) {
        await trueLayerService.disconnect(req.user!.id);
        res.status(204).send();
    }
}

export const bankSyncController = new BankSyncController();
