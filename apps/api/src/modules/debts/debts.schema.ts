import { z } from 'zod';

const debtIdParams = z.object({ id: z.string().uuid() });

const debtBody = z.object({
    name: z.string().trim().min(1).max(160),
    lender: z.string().trim().max(160).optional().nullable(),
    assetName: z.string().trim().max(160).optional().nullable(),
    originalPrincipal: z.number().nonnegative().max(999999999999.99),
    totalRepayable: z.number().nonnegative().max(999999999999.99).optional().nullable(),
    currentBalance: z.number().nonnegative().max(999999999999.99),
    interestRate: z.number().nonnegative().max(100).optional().nullable(),
    apr: z.number().nonnegative().max(100).optional().nullable(),
    monthlyPayment: z.number().positive().max(999999999999.99).optional().nullable(),
    totalPayments: z.number().int().positive().max(10000).optional().nullable(),
    paidPayments: z.number().int().nonnegative().max(10000).default(0),
    startDate: z.iso.date().optional().nullable(),
    maturityDate: z.iso.date().optional().nullable(),
    nextPaymentDate: z.iso.date().optional().nullable(),
    currency: z.enum(['EUR', 'USD']).default('EUR'),
    status: z.enum(['ACTIVE', 'PAID_OFF', 'ARCHIVED']).default('ACTIVE'),
    notes: z.string().trim().max(2000).optional().nullable(),
});

export const createDebtSchema = z.object({ body: debtBody });
export const updateDebtSchema = z.object({ params: debtIdParams, body: debtBody });
export const debtParamsSchema = z.object({ params: debtIdParams });
export type DebtBody = z.infer<typeof debtBody>;
