import { z } from 'zod';

export const taxReturnSchema = z.object({
    taxYear: z.coerce.number().int().min(2000).max(2100),
    country: z.string().trim().min(1).max(80).default('Spain'),
    status: z.enum(['Draft', 'Filed', 'Amended']).default('Draft'),
    totalIncome: z.coerce.number().min(0).max(999999999).default(0),
    taxPaid: z.coerce.number().min(0).max(999999999).default(0),
    filingDate: z.string().date().optional(),
    notes: z.string().trim().max(5000).optional(),
});

export type TaxReturnInput = z.infer<typeof taxReturnSchema>;
