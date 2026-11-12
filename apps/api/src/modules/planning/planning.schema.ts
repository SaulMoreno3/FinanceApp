import { salaryPaymentDate } from './salary-detection';
import { z } from 'zod';
const money = z.number().finite().min(0).max(100_000_000).refine(v => Math.abs(v * 100 - Math.round(v * 100)) < .00001, 'Usa dos decimales como máximo.');
export const monthSchema = z.string().regex(/^(20\d{2})-(0[1-9]|1[0-2])$/);
const date = z.iso.date().refine(v => v >= '2000-01-01' && v <= '2099-12-31');
export const recurringSchema = z.object({
 id: z.string().uuid(), name: z.string().trim().min(1).max(120), amount: money.refine(v => v > 0),
 currency: z.string().regex(/^[A-Z]{3}$/).default('EUR'),
 kind: z.enum(['SUBSCRIPTION', 'EXPENSE', 'INCOME']), cadence: z.enum(['WEEKLY','MONTHLY','QUARTERLY','YEARLY']),
 nextDate: date, endDate: date.nullable(), active: z.boolean(), merchantKey: z.string().max(300).nullable(),
 notes: z.string().max(500).default(''),
 salarySchedule: z.object({day:z.number().int().min(1).max(31),weekendAdjustment:z.enum(['NONE','PREVIOUS','NEXT']),anchorMonth:monthSchema}).strict().nullable().optional(),
}).strict().refine(v => !v.endDate || v.endDate >= v.nextDate, 'El fin debe ser posterior al inicio.').refine(v=>!v.salarySchedule||(v.kind==='INCOME'&&v.cadence==='MONTHLY'),'La pauta salarial requiere un ingreso mensual.').refine(v=>!v.salarySchedule||salaryPaymentDate(v.salarySchedule)===v.nextDate,'La primera fecha debe coincidir con la pauta salarial.');
export const planSchema = z.object({
 reserve: money.default(0), variableMonthly: money.default(0),
 includeDebts: z.boolean().default(true), includeProperties: z.boolean().default(true),
 recurring: z.array(recurringSchema).max(500).default([]),
 dismissedMerchants: z.array(z.string().max(300)).max(1000).default([]),
 transactionOverrides: z.record(z.string().uuid(), z.object({kind:z.enum(['AUTO','TRANSFER','INCOME','EXPENSE']),category:z.string().trim().max(80)}).strict()).refine(v=>Object.keys(v).length<=5000).default({}),
 acknowledgedIssues: z.array(z.string().max(400)).max(5000).default([]),
}).strict().superRefine((v,ctx)=>{
 if(new Set(v.recurring.map(r=>r.id)).size!==v.recurring.length)ctx.addIssue({code:'custom',message:'Identificadores repetidos.'});
 const keys=v.recurring.filter(r=>r.active&&r.merchantKey).map(r=>r.merchantKey);
 if(new Set(keys).size!==keys.length)ctx.addIssue({code:'custom',message:'Ese comercio ya tiene una recurrencia activa.'});
});
export const saveSchema = z.object({version:z.number().int().min(0),plan:planSchema}).strict();
export type Plan = z.infer<typeof planSchema>;
export type Recurring = z.infer<typeof recurringSchema>;
