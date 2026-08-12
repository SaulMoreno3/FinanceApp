import fs from 'node:fs';
import { prisma } from '../../common/db/prisma';
import type { TaxReturnInput } from './taxes.schema';

export class TaxesService {
    private removeFile(filePath?: string | null) {
        if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }

    async list(userId: string) {
        return prisma.taxReturn.findMany({
            where: { userId },
            orderBy: [{ taxYear: 'desc' }, { updatedAt: 'desc' }],
        });
    }

    async summary(userId: string) {
        const [taxReturns, salaries, projects, trades] = await Promise.all([
            prisma.taxReturn.findMany({
                where: { userId },
                select: { taxYear: true, totalIncome: true, taxPaid: true, finalTaxResult: true },
            }),
            prisma.salaryRecord.findMany({
                where: { userId },
                select: {
                    date: true,
                    grossSalary: true,
                    notes: true,
                    breakdown: { select: { concept: true, amount: true, type: true } },
                },
            }),
            prisma.project.findMany({
                where: { userId },
                select: { entries: { select: { type: true, amount: true, date: true, paymentStatus: true } } },
            }),
            prisma.stockTrade.findMany({
                where: { userId },
                orderBy: { date: 'asc' },
                select: { date: true, symbol: true, quantity: true, price: true, side: true, fees: true, commission: true, eurValue: true, eurCost: true, type: true },
            }),
        ]);

        type OperationalYear = { totalIncome: number; taxPaid: number; employmentIncome: number; selfEmploymentIncome: number; savingsIncome: number; capitalGains: number; socialSecurity: number; workExpenses: number };
        const operationalByYear = new Map<number, OperationalYear>();
        const add = (year: number, income: number, taxPaid = 0, category: keyof Pick<OperationalYear, 'employmentIncome' | 'selfEmploymentIncome' | 'savingsIncome' | 'capitalGains'> = 'employmentIncome') => {
            const current = operationalByYear.get(year) ?? { totalIncome: 0, taxPaid: 0, employmentIncome: 0, selfEmploymentIncome: 0, savingsIncome: 0, capitalGains: 0, socialSecurity: 0, workExpenses: 0 };
            current.totalIncome += income;
            current.taxPaid += taxPaid;
            current[category] += income;
            operationalByYear.set(year, current);
        };

        for (const salary of salaries) {
            if (!salary.date) continue;
            if (/employment contribution report/i.test(salary.notes ?? '')) continue;
            const taxYear = salary.date.getUTCFullYear();
            const taxPaid = salary.breakdown
                .filter((item) => item.type === 'deduction' && /(irpf|income tax|tribut)/i.test(item.concept))
                .reduce((sum, item) => sum + Number(item.amount), 0);
            const gross = Number(salary.grossSalary ?? 0);
            const socialSecurity = salary.breakdown
                .filter((item) => item.type === 'deduction' && /(seguridad social|contingencias comunes|desempleo|formaci[oó]n|mei)/i.test(item.concept))
                .reduce((sum, item) => sum + Number(item.amount), 0);
            const workExpenses = salary.breakdown
                .filter((item) => item.type === 'deduction' && /(gasto|expense)/i.test(item.concept))
                .reduce((sum, item) => sum + Number(item.amount), 0);
            add(taxYear, gross, taxPaid, 'employmentIncome');
            const salaryYear = operationalByYear.get(taxYear)!;
            salaryYear.socialSecurity += socialSecurity;
            salaryYear.workExpenses += workExpenses;
        }

        for (const project of projects) {
            for (const entry of project.entries) {
                if (entry.paymentStatus !== 'PAID') continue;
                const amount = Number(entry.amount);
                if (entry.type === 'INCOME') add(entry.date.getUTCFullYear(), amount, 0, 'selfEmploymentIncome');
                else {
                    const current = operationalByYear.get(entry.date.getUTCFullYear());
                    if (current) current.selfEmploymentIncome -= amount;
                }
            }
        }

        const positions = new Map<string, Array<{ quantity: number; cost: number }>>();
        for (const trade of trades) {
            const year = trade.date.getUTCFullYear();
            const convertedValue = trade.eurValue ?? trade.eurCost;
            // Do not invent EUR gains for trades whose historical conversion is missing.
            if (convertedValue === null) continue;
            const priceValue = Number(convertedValue);
            const fees = Number(trade.fees) + Number(trade.commission);
            const lots = positions.get(trade.symbol) ?? [];
            if (trade.side === 'Buy') {
                lots.push({ quantity: Number(trade.quantity), cost: priceValue + fees });
            } else {
                let remaining = Number(trade.quantity);
                let cost = 0;
                while (remaining > 0 && lots.length > 0) {
                    const lot = lots[0];
                    const matched = Math.min(remaining, lot.quantity);
                    cost += lot.cost * (matched / lot.quantity);
                    lot.quantity -= matched;
                    remaining -= matched;
                    if (lot.quantity <= 0.000001) lots.shift();
                }
                if (remaining <= 0.000001 && trade.type !== 'InternalTransfer') add(year, priceValue - fees - cost, 0, 'capitalGains');
            }
            positions.set(trade.symbol, lots);
        }

        const declaredByYear = new Map<number, { totalIncome: number; taxPaid: number; finalTaxResult: number | null }>();
        for (const taxReturn of taxReturns) {
            const current = declaredByYear.get(taxReturn.taxYear) ?? { totalIncome: 0, taxPaid: 0, finalTaxResult: null };
            current.totalIncome += Number(taxReturn.totalIncome);
            current.taxPaid += Number(taxReturn.taxPaid);
            if (taxReturn.finalTaxResult !== null) current.finalTaxResult = Number(taxReturn.finalTaxResult);
            declaredByYear.set(taxReturn.taxYear, current);
        }

        const years = new Set([...operationalByYear.keys(), ...declaredByYear.keys()]);
        return [...years]
            .sort((left, right) => right - left)
            .map((taxYear) => {
                const declared = declaredByYear.get(taxYear);
                const hasDeclaredAmounts = Boolean(declared && (declared.totalIncome > 0 || declared.taxPaid > 0));
                const operational = operationalByYear.get(taxYear) ?? { totalIncome: 0, taxPaid: 0, employmentIncome: 0, selfEmploymentIncome: 0, savingsIncome: 0, capitalGains: 0, socialSecurity: 0, workExpenses: 0 };
                return { taxYear, ...operational, finalTaxResult: declared?.finalTaxResult ?? null, source: 'operational_records' };
            });
    }

    async create(userId: string, data: TaxReturnInput, file?: Express.Multer.File) {
        try {
            return await prisma.taxReturn.create({
                data: {
                    userId,
                    taxYear: data.taxYear,
                    country: data.country,
                    status: data.status,
                    totalIncome: data.totalIncome,
                    taxPaid: data.taxPaid,
                    filingDate: data.filingDate ? new Date(`${data.filingDate}T00:00:00.000Z`) : undefined,
                    notes: data.notes || undefined,
                    fileName: file?.originalname,
                    fileStorageKey: file?.path,
                    fileMimeType: file?.mimetype,
                },
            });
        } catch (error) {
            this.removeFile(file?.path);
            throw error;
        }
    }

    async get(userId: string, id: string) {
        return prisma.taxReturn.findFirst({ where: { id, userId } });
    }

    async getFile(userId: string, id: string) {
        return prisma.taxReturn.findFirst({
            where: { id, userId },
            select: { fileName: true, fileStorageKey: true, fileMimeType: true },
        });
    }

    async delete(userId: string, id: string) {
        const record = await prisma.taxReturn.findFirst({ where: { id, userId } });
        if (!record) return false;
        await prisma.taxReturn.delete({ where: { id: record.id } });
        this.removeFile(record.fileStorageKey);
        return true;
    }
}

export const taxesService = new TaxesService();
