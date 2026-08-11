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
