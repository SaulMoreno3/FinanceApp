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
        const [taxReturns, salaries] = await Promise.all([
            prisma.taxReturn.findMany({
                where: { userId },
                select: { taxYear: true, totalIncome: true, taxPaid: true, finalTaxResult: true },
            }),
            prisma.salaryRecord.findMany({
                where: { userId },
                select: {
                    date: true,
                    grossSalary: true,
                    breakdown: { select: { concept: true, amount: true, type: true } },
                },
            }),
        ]);

        const salaryByYear = new Map<number, { totalIncome: number; taxPaid: number }>();
        for (const salary of salaries) {
            if (!salary.date) continue;
            const taxYear = salary.date.getFullYear();
            const current = salaryByYear.get(taxYear) ?? { totalIncome: 0, taxPaid: 0 };
            current.totalIncome += Number(salary.grossSalary ?? 0);
            current.taxPaid += salary.breakdown
                .filter((item) => item.type === 'deduction' && /(irpf|income tax|tribut)/i.test(item.concept))
                .reduce((sum, item) => sum + Number(item.amount), 0);
            salaryByYear.set(taxYear, current);
        }

        const declaredByYear = new Map<number, { totalIncome: number; taxPaid: number; finalTaxResult: number | null }>();
        for (const taxReturn of taxReturns) {
            const current = declaredByYear.get(taxReturn.taxYear) ?? { totalIncome: 0, taxPaid: 0, finalTaxResult: null };
            current.totalIncome += Number(taxReturn.totalIncome);
            current.taxPaid += Number(taxReturn.taxPaid);
            if (taxReturn.finalTaxResult !== null) current.finalTaxResult = Number(taxReturn.finalTaxResult);
            declaredByYear.set(taxReturn.taxYear, current);
        }

        const years = new Set([...salaryByYear.keys(), ...declaredByYear.keys()]);
        return [...years]
            .sort((left, right) => right - left)
            .map((taxYear) => {
                const declared = declaredByYear.get(taxYear);
                const hasDeclaredAmounts = Boolean(declared && (declared.totalIncome > 0 || declared.taxPaid > 0));
                const values = hasDeclaredAmounts ? declared! : { ...(salaryByYear.get(taxYear) ?? { totalIncome: 0, taxPaid: 0 }), finalTaxResult: null };
                return { taxYear, ...values, source: hasDeclaredAmounts ? 'tax_return' : 'salary_records' };
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
