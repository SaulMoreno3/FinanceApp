import pool from '../../common/db/client';
import type { DebtBody } from './debts.schema';

const debtColumns = `
    id, name, lender, "assetName", "originalPrincipal", "totalRepayable",
    "currentBalance", "interestRate", apr, "monthlyPayment", "totalPayments",
    "paidPayments", "startDate", "maturityDate", "nextPaymentDate", currency,
    status, notes, "createdAt", "updatedAt"
`;

function serialize(row: any) {
    if (!row) return row;
    const numericFields = [
        'originalPrincipal', 'totalRepayable', 'currentBalance', 'interestRate',
        'apr', 'monthlyPayment',
    ];
    const result = { ...row };
    for (const field of numericFields) {
        result[field] = row[field] === null || row[field] === undefined ? null : Number(row[field]);
    }
    result.paidAmount = Math.max(0, result.originalPrincipal - result.currentBalance);
    result.progressPercent = result.originalPrincipal > 0
        ? Math.min(100, Math.max(0, (result.paidAmount / result.originalPrincipal) * 100))
        : 0;
    result.remainingPayments = result.totalPayments === null || result.totalPayments === undefined
        ? null
        : Math.max(0, result.totalPayments - result.paidPayments);
    return result;
}

const valuesFor = (data: DebtBody, userId: string) => [
    data.name, data.lender ?? null, data.assetName ?? null, data.originalPrincipal,
    data.totalRepayable ?? null, data.currentBalance, data.interestRate ?? null,
    data.apr ?? null, data.monthlyPayment ?? null, data.totalPayments ?? null,
    data.paidPayments, data.startDate ?? null, data.maturityDate ?? null,
    data.nextPaymentDate ?? null, data.currency, data.status, data.notes ?? null, userId,
];

export class DebtsService {
    async list(userId: string) {
        const result = await pool.query(
            `SELECT ${debtColumns} FROM debts WHERE "userId" = $1 ORDER BY status ASC, "nextPaymentDate" ASC NULLS LAST, name ASC`,
            [userId],
        );
        return result.rows.map(serialize);
    }

    async get(userId: string, id: string) {
        const result = await pool.query(
            `SELECT ${debtColumns} FROM debts WHERE id = $1 AND "userId" = $2`,
            [id, userId],
        );
        return serialize(result.rows[0]);
    }

    async create(userId: string, data: DebtBody) {
        const result = await pool.query(
            `INSERT INTO debts (
                name, lender, "assetName", "originalPrincipal", "totalRepayable",
                "currentBalance", "interestRate", apr, "monthlyPayment", "totalPayments",
                "paidPayments", "startDate", "maturityDate", "nextPaymentDate", currency,
                status, notes, "userId"
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
            RETURNING ${debtColumns}`,
            valuesFor(data, userId),
        );
        return serialize(result.rows[0]);
    }

    async update(userId: string, id: string, data: DebtBody) {
        const result = await pool.query(
            `UPDATE debts SET
                name = $1, lender = $2, "assetName" = $3, "originalPrincipal" = $4,
                "totalRepayable" = $5, "currentBalance" = $6, "interestRate" = $7,
                apr = $8, "monthlyPayment" = $9, "totalPayments" = $10, "paidPayments" = $11,
                "startDate" = $12, "maturityDate" = $13, "nextPaymentDate" = $14,
                currency = $15, status = $16, notes = $17, "updatedAt" = NOW()
            WHERE id = $18 AND "userId" = $19
            RETURNING ${debtColumns}`,
            [...valuesFor(data, userId).slice(0, 17), id, userId],
        );
        return serialize(result.rows[0]);
    }

    async delete(userId: string, id: string) {
        const result = await pool.query(
            'DELETE FROM debts WHERE id = $1 AND "userId" = $2 RETURNING id',
            [id, userId],
        );
        return result.rowCount === 1;
    }
}

export const debtsService = new DebtsService();
