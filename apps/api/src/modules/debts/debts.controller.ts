import type { Response } from 'express';
import { debtsService } from './debts.service';
import { createDebtSchema, debtParamsSchema, updateDebtSchema } from './debts.schema';

export class DebtsController {
    async list(req: any, res: Response) {
        res.json({ data: await debtsService.list(req.user!.id) });
    }

    async get(req: any, res: Response) {
        const validation = debtParamsSchema.safeParse({ params: req.params });
        if (!validation.success) return res.status(400).json({ error: 'Invalid debt id' });
        const debt = await debtsService.get(req.user!.id, validation.data.params.id);
        if (!debt) return res.status(404).json({ error: 'Debt not found' });
        res.json(debt);
    }

    async create(req: any, res: Response) {
        const body = { ...req.body, ...Object.fromEntries(
            ['originalPrincipal', 'totalRepayable', 'currentBalance', 'interestRate', 'apr', 'monthlyPayment', 'totalPayments', 'paidPayments']
                .filter((key) => req.body[key] !== undefined && req.body[key] !== null)
                .map((key) => [key, Number(req.body[key])]),
        ) };
        const validation = createDebtSchema.safeParse({ body });
        if (!validation.success) return res.status(400).json({ error: 'Invalid debt', details: validation.error.format() });
        res.status(201).json(await debtsService.create(req.user!.id, validation.data.body));
    }

    async update(req: any, res: Response) {
        const body = { ...req.body, ...Object.fromEntries(
            ['originalPrincipal', 'totalRepayable', 'currentBalance', 'interestRate', 'apr', 'monthlyPayment', 'totalPayments', 'paidPayments']
                .filter((key) => req.body[key] !== undefined && req.body[key] !== null)
                .map((key) => [key, Number(req.body[key])]),
        ) };
        const validation = updateDebtSchema.safeParse({ params: req.params, body });
        if (!validation.success) return res.status(400).json({ error: 'Invalid debt', details: validation.error.format() });
        const debt = await debtsService.update(req.user!.id, validation.data.params.id, validation.data.body);
        if (!debt) return res.status(404).json({ error: 'Debt not found' });
        res.json(debt);
    }

    async delete(req: any, res: Response) {
        const validation = debtParamsSchema.safeParse({ params: req.params });
        if (!validation.success) return res.status(400).json({ error: 'Invalid debt id' });
        if (!await debtsService.delete(req.user!.id, validation.data.params.id)) return res.status(404).json({ error: 'Debt not found' });
        res.status(204).send();
    }
}

export const debtsController = new DebtsController();
