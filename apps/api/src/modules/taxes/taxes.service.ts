import fs from 'node:fs';
import { prisma } from '../../common/db/prisma';
import { buildAnnualTaxSummary } from './tax-summary';
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
        const [taxReturns, salaries, projects, trades, cashIncomes, incomeFx] = await Promise.all([
            prisma.taxReturn.findMany({
                where: { userId },
                select: { taxYear: true, totalIncome: true, taxPaid: true, finalTaxResult: true, country: true, status: true, updatedAt: true },
                orderBy: { updatedAt: 'desc' },
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
                orderBy: [{ date: 'asc' }, { id: 'asc' }],
                select: { id: true, date: true, symbol: true, isin: true, quantity: true, price: true, value: true, currency: true, side: true, fees: true, commission: true, eurValue: true, eurCost: true, conversionRate: true, costBasisOverride: true, type: true },
            }),
            prisma.cashTransfer.findMany({
                where: { userId, OR: [{ type: { equals: 'Dividend', mode: 'insensitive' } }, { type: { equals: 'Interest', mode: 'insensitive' } }] },
                select: { id:true, date:true, currency:true, type:true, value:true, eurCost:true, conversionRate:true },
                orderBy: [{date:'asc'}, {id:'asc'}],
            }),
            prisma.marketFxRate.findMany({ where:{quoteCurrency:'EUR'}, orderBy:[{date:'asc'},{source:'asc'}], select:{date:true,rate:true,baseCurrency:true,quoteCurrency:true,source:true} }),
        ]);

        return buildAnnualTaxSummary({ taxReturns, salaries, projects, trades, cashIncomes, incomeFx });
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
                    finalTaxResult: data.finalTaxResult,
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
