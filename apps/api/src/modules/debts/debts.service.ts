import pool from '../../common/db/client';
import type { DebtBody } from './debts.schema';
import { findDebtPaymentMatches, type ReconciliationDebt, type ReconciliationTransaction } from './debt-reconciliation';

const debtColumns = `
    id, name, lender, "assetName", "originalPrincipal", "totalRepayable",
    "currentBalance", "interestRate", apr, "monthlyPayment", "totalPayments",
    "paidPayments", "startDate", "maturityDate", "nextPaymentDate", currency,
    status, notes, "createdAt", "updatedAt"
`;
const debtPaymentColumns = `,
    (SELECT COUNT(*)::int FROM debt_payments p WHERE p."debtId" = debts.id) AS "detectedPayments",
    (SELECT MAX(p."paidAt") FROM debt_payments p WHERE p."debtId" = debts.id) AS "lastDetectedPaymentAt"
`;

function serialize(row: any) {
    if (!row) return row;
    const numericFields = [
        'originalPrincipal', 'totalRepayable', 'currentBalance', 'interestRate',
        'apr', 'monthlyPayment',
    ];
    const result = { ...row };
    for (const field of ['startDate', 'maturityDate', 'nextPaymentDate']) {
        const value = row[field];
        if (value instanceof Date) {
            const year = value.getFullYear();
            const month = String(value.getMonth() + 1).padStart(2, '0');
            const day = String(value.getDate()).padStart(2, '0');
            result[field] = `${year}-${month}-${day}`;
        } else if (value) {
            result[field] = String(value).slice(0, 10);
        }
    }
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
    result.detectedPayments = Number(row.detectedPayments ?? 0);
    result.lastDetectedPaymentAt = row.lastDetectedPaymentAt instanceof Date
        ? row.lastDetectedPaymentAt.toISOString()
        : row.lastDetectedPaymentAt ?? null;
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
            `SELECT ${debtColumns} ${debtPaymentColumns} FROM debts WHERE "userId" = $1 ORDER BY status ASC, "nextPaymentDate" ASC NULLS LAST, name ASC`,
            [userId],
        );
        return result.rows.map(serialize);
    }

    async get(userId: string, id: string) {
        const result = await pool.query(
            `SELECT ${debtColumns} ${debtPaymentColumns} FROM debts WHERE id = $1 AND "userId" = $2`,
            [id, userId],
        );
        return serialize(result.rows[0]);
    }

    async getSchedule(userId: string, id: string) {
        const result = await pool.query(
            `SELECT s.id, s.installment, s."dueDate", s."paymentAmount", s."principalAmount",
                    s."interestAmount", s."balanceAfter"
             FROM debt_schedule s
             INNER JOIN debts d ON d.id = s."debtId"
             WHERE s."debtId" = $1 AND d."userId" = $2
             ORDER BY s.installment ASC`,
            [id, userId],
        );
        return result.rows.map((row) => ({
            ...row,
            dueDate: row.dueDate instanceof Date
                ? `${row.dueDate.getFullYear()}-${String(row.dueDate.getMonth() + 1).padStart(2, '0')}-${String(row.dueDate.getDate()).padStart(2, '0')}`
                : String(row.dueDate).slice(0, 10),
            paymentAmount: Number(row.paymentAmount),
            principalAmount: Number(row.principalAmount),
            interestAmount: Number(row.interestAmount),
            balanceAfter: Number(row.balanceAfter),
        }));
    }

    async getPayments(userId: string, id: string) {
        const result = await pool.query(
            `SELECT p.id, p.installment, p."paidAt", p.amount, p."principalAmount", p."interestAmount",
                    p."detectedAt", t.description, t."merchantName", t.id AS "bankTransactionId"
             FROM debt_payments p
             INNER JOIN debts d ON d.id = p."debtId"
             INNER JOIN bank_transactions t ON t.id = p."bankTransactionId"
             WHERE p."debtId" = $1 AND d."userId" = $2
             ORDER BY p.installment DESC`,
            [id, userId],
        );
        return result.rows.map(row => ({
            ...row,
            paidAt: row.paidAt.toISOString(),
            detectedAt: row.detectedAt.toISOString(),
            amount: Number(row.amount),
            principalAmount: Number(row.principalAmount),
            interestAmount: Number(row.interestAmount),
        }));
    }

    async reconcileUser(userId: string) {
        const [debtRows, scheduleRows, transactionRows, paymentRows] = await Promise.all([
            pool.query(`SELECT id, name, lender, "assetName", currency, "paidPayments"
                        FROM debts WHERE "userId" = $1 AND status = 'ACTIVE'`, [userId]),
            pool.query(`SELECT s."debtId", s.installment, s."dueDate", s."paymentAmount", s."principalAmount",
                               s."interestAmount", s."balanceAfter"
                        FROM debt_schedule s INNER JOIN debts d ON d.id = s."debtId"
                        WHERE d."userId" = $1 AND d.status = 'ACTIVE' ORDER BY s.installment`, [userId]),
            pool.query(`SELECT id, date, amount, currency, description, "merchantName", status
                        FROM bank_transactions WHERE "userId" = $1 AND amount < 0`, [userId]),
            pool.query(`SELECT p."debtId", p."bankTransactionId", p.installment
                        FROM debt_payments p INNER JOIN debts d ON d.id = p."debtId"
                        WHERE d."userId" = $1`, [userId]),
        ]);
        const schedules = new Map<string, any[]>();
        for (const row of scheduleRows.rows) schedules.set(row.debtId, [...(schedules.get(row.debtId) ?? []), row]);
        const debts: ReconciliationDebt[] = debtRows.rows.map(row => ({
            ...row, paidPayments: Number(row.paidPayments), schedule: schedules.get(row.id) ?? [],
        }));
        const transactions = transactionRows.rows as ReconciliationTransaction[];
        const matchedTransactions = new Set<string>(paymentRows.rows.map(row => row.bankTransactionId));
        const matchedInstallments = new Set<string>(paymentRows.rows.map(row => `${row.debtId}:${row.installment}`));
        const matches = findDebtPaymentMatches(debts, transactions, matchedTransactions, matchedInstallments);

        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            for (const match of matches) {
                await client.query(
                    `INSERT INTO debt_payments ("debtId", "bankTransactionId", installment, "paidAt", amount, "principalAmount", "interestAmount")
                     VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING`,
                    [match.debtId, match.bankTransactionId, match.installment, match.paidAt, match.amount, match.principalAmount, match.interestAmount],
                );
            }
            for (const debt of debts) {
                const recorded = await client.query(
                    `SELECT COALESCE(MAX(installment), 0)::int AS installment FROM debt_payments WHERE "debtId" = $1`,
                    [debt.id],
                );
                const paidPayments = Math.max(debt.paidPayments, Number(recorded.rows[0].installment));
                if (paidPayments <= debt.paidPayments) continue;
                const paid = debt.schedule.find(row => row.installment === paidPayments);
                const next = debt.schedule.find(row => row.installment > paidPayments);
                await client.query(
                    `UPDATE debts SET "paidPayments" = $1, "currentBalance" = $2, "nextPaymentDate" = $3,
                         status = $4, "updatedAt" = NOW() WHERE id = $5 AND "userId" = $6`,
                    [paidPayments, paid ? Number(paid.balanceAfter) : 0, next?.dueDate ?? null, next ? 'ACTIVE' : 'PAID_OFF', debt.id, userId],
                );
            }
            await client.query('COMMIT');
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
        return { detected: matches.length, debtsUpdated: new Set(matches.map(match => match.debtId)).size };
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
