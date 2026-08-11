import { z } from 'zod';

const projectIdParams = z.object({ id: z.string().uuid() });
const entryParams = z.object({ id: z.string().uuid(), entryId: z.string().uuid() });

export const createProjectSchema = z.object({
    body: z.object({
        name: z.string().trim().min(1).max(120),
        description: z.string().trim().max(500).optional(),
        client: z.string().trim().max(120).optional(),
        budget: z.number().positive().max(999999999999.99).optional(),
        status: z.enum(['ACTIVE', 'COMPLETED', 'ARCHIVED']).default('ACTIVE'),
    }),
});

export const updateProjectSchema = z.object({
    params: projectIdParams,
    body: createProjectSchema.shape.body,
});

export const projectParamsSchema = z.object({ params: projectIdParams });

export const createProjectEntrySchema = z.object({
    params: projectIdParams,
    body: z.object({
        type: z.enum(['INCOME', 'EXPENSE']),
        amount: z.number().positive().max(999999999999.99),
        description: z.string().trim().min(1).max(200),
        category: z.string().trim().max(80).optional(),
        counterparty: z.string().trim().max(120).optional(),
        reference: z.string().trim().max(100).optional(),
        notes: z.string().trim().max(1000).optional(),
        paymentStatus: z.enum(['PENDING', 'PAID']).default('PAID'),
        date: z.iso.date(),
        dueDate: z.iso.date().optional(),
    }),
});

export const updateProjectEntrySchema = z.object({
    params: entryParams,
    body: createProjectEntrySchema.shape.body,
});

export const deleteProjectEntrySchema = z.object({ params: entryParams });

export type CreateProjectBody = z.infer<typeof createProjectSchema>['body'];
export type CreateProjectEntryBody = z.infer<typeof createProjectEntrySchema>['body'];
