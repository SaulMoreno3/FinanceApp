import { z } from 'zod';

const money = z.number().finite().min(0).max(100_000_000).refine(v => Math.abs(v * 100 - Math.round(v * 100)) < .00001, 'Usa como máximo dos decimales.');
const date = z.iso.date().refine(v => v >= '1900-01-01' && v <= '2200-12-31', 'Fecha fuera de rango.');
const id = z.string().uuid();
export const rentPeriodSchema = z.object({
    id,
    startDate: date,
    endDate: date.nullable(),
    monthlyRent: money,
    dueDay: z.number().int().min(1).max(31).default(1),
    autoCollect: z.boolean().default(true),
    tenant: z.string().trim().max(120).default(''),
}).strict();
export const expenseSchema = z.object({
    id,
    description: z.string().trim().min(1).max(160),
    category: z.enum(['COMMUNITY', 'IBI', 'INSURANCE', 'MAINTENANCE', 'UTILITIES', 'MANAGEMENT', 'OTHER']),
    amount: money,
    date,
    endDate: date.nullable(),
    frequency: z.enum(['ONCE', 'MONTHLY', 'YEARLY']),
}).strict();
export const receiptSchema = z.object({
    periodId: id,
    month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
    amount: money,
    paidOn: date.nullable(),
}).strict();
export const propertySchema = z.object({
    name: z.string().trim().min(1).max(120),
    address: z.string().trim().max(250).default(''),
    acquisitionDate: date,
    purchasePrice: money,
    acquisitionTax: money.default(0),
    notaryFees: money.default(0),
    registryFees: money.default(0),
    agencyFees: money.default(0),
    renovationCost: money.default(0),
    otherCosts: money.default(0),
    currentValue: money.nullable().default(null),
    mortgage: z.object({
        principal: money.refine(v => v > 0, 'El préstamo debe ser mayor que cero.'),
        annualRate: z.number().finite().min(0).max(30),
        termMonths: z.number().int().min(1).max(600),
        firstPaymentDate: date,
        fees: money.default(0),
    }).strict().nullable().default(null),
    notes: z.string().trim().max(3000).default(''),
    rentPeriods: z.array(rentPeriodSchema).max(500).default([]),
    expenses: z.array(expenseSchema).max(2000).default([]),
    receipts: z.array(receiptSchema).max(10000).default([]),
}).strict().superRefine((p, ctx) => {
    const issue = (message: string, path: (string | number)[]) => ctx.addIssue({code:'custom',message,path});
    const total = p.purchasePrice + p.acquisitionTax + p.notaryFees + p.registryFees + p.agencyFees + p.renovationCost + p.otherCosts + (p.mortgage?.fees ?? 0);
    if (p.mortgage && p.mortgage.principal > total) issue('El préstamo no puede superar el coste total de adquisición.', ['mortgage','principal']);
    if (p.mortgage && p.mortgage.firstPaymentDate < p.acquisitionDate) issue('La primera cuota no puede ser anterior a la adquisición.', ['mortgage','firstPaymentDate']);
    const periods = [...p.rentPeriods].sort((a,b)=>a.startDate.localeCompare(b.startDate));
    const ids = new Set<string>();
    for (const [i, period] of periods.entries()) {
        if (ids.has(period.id)) issue('Los tramos deben tener identificadores únicos.', ['rentPeriods']);
        ids.add(period.id);
        if (period.startDate < p.acquisitionDate) issue('La renta no puede comenzar antes de la adquisición.', ['rentPeriods']);
        if (period.endDate && period.endDate < period.startDate) issue('El fin del alquiler debe ser posterior al inicio.', ['rentPeriods']);
        if (i > 0 && (periods[i-1].endDate === null || periods[i-1].endDate! >= period.startDate)) issue('Los periodos de alquiler no pueden solaparse.', ['rentPeriods']);
    }
    const expenseIds = new Set<string>();
    for (const expense of p.expenses) {
        if (expenseIds.has(expense.id)) issue('Gasto duplicado.', ['expenses']);
        expenseIds.add(expense.id);
        if (expense.date < p.acquisitionDate) issue('Los gastos de explotación deben ser posteriores a la adquisición; los de compra van en la ficha.', ['expenses']);
        if (expense.endDate && expense.endDate < expense.date) issue('El fin del gasto debe ser posterior al inicio.', ['expenses']);
    }
    const receiptIds = new Set<string>();
    for (const r of p.receipts) {
        const key = `${r.periodId}:${r.month}`;
        const period = periods.find(v=>v.id === r.periodId);
        if (receiptIds.has(key)) issue('Cobro duplicado para el mismo tramo y mes.', ['receipts']);
        receiptIds.add(key);
        if (!period || r.month < period.startDate.slice(0,7) || (period.endDate && r.month > period.endDate.slice(0,7))) issue('El cobro no pertenece a un mes de ese tramo de alquiler.', ['receipts']);
        if (r.amount > 0 && !r.paidOn) issue('Indica la fecha del cobro.', ['receipts']);
        if (r.paidOn && r.paidOn < p.acquisitionDate) issue('El cobro no puede ser anterior a la adquisición.', ['receipts']);
    }
});
export type PropertyInput = z.infer<typeof propertySchema>;
export type RentPeriod = PropertyInput['rentPeriods'][number];
export const createPropertySchema = z.object({property: propertySchema}).strict();
export const updatePropertySchema = z.object({property: propertySchema, version: z.number().int().positive()}).strict();
export const reportQuerySchema = z.object({year:z.coerce.number().int().min(1900).max(2200).default(new Date().getUTCFullYear())});
export const propertyIdSchema = id;
