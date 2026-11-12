import { cashIncomeByYear, type CashIncome, type IncomeFx } from './cash-income';
type Numeric = number | { toString(): string };
interface Salary {
    date: Date | null; grossSalary: Numeric | null; notes: string | null;
    breakdown: { concept: string; amount: Numeric; type: string }[];
}
interface Project { entries: { type: string; amount: Numeric; date: Date; paymentStatus: string }[] }
export interface TaxTrade {
    id: string; date: Date; symbol: string; isin?: string | null; quantity: Numeric; price: Numeric;
    value: Numeric; currency: string; side: string; fees: Numeric; commission: Numeric;
    eurValue: Numeric | null; eurCost: Numeric | null; conversionRate?: number | null;
    costBasisOverride?: number | null; type: string;
}
interface TaxReturn {
    taxYear: number; totalIncome: Numeric; taxPaid: Numeric; finalTaxResult: Numeric | null;
    country: string; status: string; updatedAt: Date;
}

export function buildAnnualTaxSummary({ taxReturns, salaries, projects, trades, cashIncomes = [], incomeFx = [] }: {
    taxReturns: TaxReturn[]; salaries: Salary[]; projects: Project[]; trades: TaxTrade[]; cashIncomes?: CashIncome[]; incomeFx?: IncomeFx[];
}) {
        type OperationalYear = { totalIncome: number; taxPaid: number; employmentIncome: number; selfEmploymentIncome: number; savingsIncome: number; capitalGains: number; socialSecurity: number; workExpenses: number; issues: string[] };
        const operationalByYear = new Map<number, OperationalYear>();
        const add = (year: number, income: number, taxPaid = 0, category: keyof Pick<OperationalYear, 'employmentIncome' | 'selfEmploymentIncome' | 'savingsIncome' | 'capitalGains'> = 'employmentIncome') => {
            const current = operationalByYear.get(year) ?? { totalIncome: 0, taxPaid: 0, employmentIncome: 0, selfEmploymentIncome: 0, savingsIncome: 0, capitalGains: 0, socialSecurity: 0, workExpenses: 0, issues: [] };
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
            const flexibleCompensation = salary.breakdown
                .filter((item) => item.type === 'payment' && /retribuci[oó]n flexible|beneficio en especie/i.test(item.concept))
                .reduce((sum, item) => sum + Number(item.amount), 0);
            // Teaching invoices/imports were historically stored in the salary
            // table, but they are self-employment income for tax purposes.
            // Keep them in the same source table while classifying them by the
            // explicit breakdown concept instead of treating them as payroll.
            const isSelfEmployment = salary.breakdown.some((item) =>
                item.type === 'payment' && /horas lectivas|actividad econ[oó]mica|freelance|factura/i.test(item.concept)
            );
            const socialSecurity = salary.breakdown
                .filter((item) => item.type === 'deduction' && /(seguridad social|contingencias comunes|desempleo|formaci[oó]n|mei)/i.test(item.concept))
                .reduce((sum, item) => sum + Number(item.amount), 0);
            const workExpenses = salary.breakdown
                .filter((item) => item.type === 'deduction' && /(gasto|expense)/i.test(item.concept))
                .reduce((sum, item) => sum + Number(item.amount), 0);
            // Exemption cannot be inferred solely from a payslip label.
            const taxableGross = gross;
            add(taxYear, taxableGross, taxPaid, isSelfEmployment ? 'selfEmploymentIncome' : 'employmentIncome');
            const salaryYear = operationalByYear.get(taxYear)!;
            if (flexibleCompensation > 0) salaryYear.issues.push('Verify the exempt portion of flexible or in-kind compensation.');
            if (salary.grossSalary === null) salaryYear.issues.push('A salary is missing its gross amount.');
            if (isSelfEmployment) salaryYear.issues.push('Confirm income classified as self-employment from payslip descriptions.');
            if (workExpenses > 0) salaryYear.issues.push('Verify that imported work expenses are fiscally deductible.');
            if (!isSelfEmployment) {
                salaryYear.socialSecurity += socialSecurity;
                salaryYear.workExpenses += workExpenses;
            }
        }

        for (const project of projects) {
            for (const entry of project.entries) {
                if (entry.paymentStatus !== 'PAID') continue;
                const amount = Number(entry.amount);
                if (entry.type === 'INCOME') add(entry.date.getUTCFullYear(), amount, 0, 'selfEmploymentIncome');
                else if (entry.type === 'EXPENSE') add(entry.date.getUTCFullYear(), -amount, 0, 'selfEmploymentIncome');
                operationalByYear.get(entry.date.getUTCFullYear())?.issues.push('Project totals use paid entries: verify tax timing, deductible expenses and withheld tax.');
            }
        }

        const cashYears = cashIncomeByYear(cashIncomes, incomeFx);
        for (const [year, cash] of cashYears) {
            add(year, cash.dividends + cash.interest, 0, 'savingsIncome');
            const annual=operationalByYear.get(year)!;
            annual.issues.push('Dividend/interest amounts are imported receipts: verify gross income and withholding against the broker statement.');
            if(cash.estimatedConversions)annual.issues.push('Some dividends/interest use historical reference FX; verify the actual EUR settlement.');
            if(Object.keys(cash.pendingByCurrency).length)annual.issues.push('Some dividends/interest are pending EUR conversion; see their original currency amounts.');
        }

        const positions = new Map<string, Array<{ quantity: number; unitCost: number | null }>>();
        const orderedTrades = [...trades].sort((a, b) => a.date.getTime() - b.date.getTime()
            || (a.side === b.side ? a.id.localeCompare(b.id) : a.side === 'Buy' ? -1 : 1));
        const uncertainPositions = new Set<string>();
        for (const trade of orderedTrades) {
            const year = trade.date.getUTCFullYear();
            add(year, 0, 0, 'capitalGains');
            const annual = operationalByYear.get(year)!;
            const key = trade.isin?.trim() || trade.symbol;
            const kind = trade.type.trim().toLowerCase();
            if (kind === 'internaltransfer') {
                uncertainPositions.add(key);
                annual.issues.push('Internal transfers require verification of original acquisition lots.');
                continue;
            }
            if (trade.side !== 'Buy' && trade.side !== 'Sell') {
                annual.issues.push('An investment movement has an unsupported transaction side.');
                continue;
            }
            const quantity = Number(trade.quantity);
            const nativeValue = Math.abs(Number(trade.value));
            const converted = trade.eurValue ?? trade.eurCost;
            const rate = trade.currency === 'EUR' ? 1 : trade.conversionRate
                ?? (converted !== null && nativeValue > 0 ? Number(converted) / nativeValue : null);
            const validRate = rate !== null && Number.isFinite(rate) && rate > 0;
            const amount = trade.currency === 'EUR' ? nativeValue
                : converted !== null ? Number(converted) : validRate ? nativeValue * rate! : null;
            const fees = Number(trade.fees) + Number(trade.commission);
            const eurFees = fees === 0 ? 0 : validRate ? fees * rate! : null;
            if (!Number.isFinite(quantity) || quantity <= 0) {
                uncertainPositions.add(key);
                annual.issues.push('An investment movement has an invalid quantity.');
                continue;
            }
            const complete = amount !== null && Number.isFinite(amount) && amount >= 0 && eurFees !== null && Number.isFinite(eurFees);
            const lots = positions.get(key) ?? [];
            if (trade.side === 'Buy') {
                // Keep unknown-cost lots in FIFO, so later sales cannot silently skip them.
                const override = trade.costBasisOverride;
                const cost = override != null && validRate ? override * rate!
                    : complete ? amount! + eurFees! : null;
                lots.push({ quantity, unitCost: cost === null ? null : cost / quantity });
            } else {
                let remaining = quantity;
                let cost = 0;
                let knownCost = !uncertainPositions.has(key);
                while (remaining > 1e-8 && lots.length > 0) {
                    const lot = lots[0];
                    const matched = Math.min(remaining, lot.quantity);
                    if (lot.unitCost === null) knownCost = false;
                    else cost += lot.unitCost * matched;
                    lot.quantity -= matched;
                    remaining -= matched;
                    if (lot.quantity <= 1e-8) lots.shift();
                }
                if (remaining > 1e-8 || !knownCost || !complete) {
                    annual.issues.push('Capital gains are incomplete: missing FIFO lots, transfer history or EUR conversion.');
                } else add(year, amount! - eurFees! - cost, 0, 'capitalGains');
            }
            positions.set(key, lots);
        }

        const declaredByYear = new Map<number, { totalIncome: number; taxPaid: number; finalTaxResult: number | null }>();
        // One authoritative filed version per year; drafts must never override it.
        for (const taxReturn of [...taxReturns].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())) {
            if (!['Filed', 'Amended'].includes(taxReturn.status)) continue;
            if (!['spain', 'españa', 'espana', 'es'].includes(taxReturn.country.trim().toLowerCase())) continue;
            if (declaredByYear.has(taxReturn.taxYear)) continue;
            declaredByYear.set(taxReturn.taxYear, {
                totalIncome: Number(taxReturn.totalIncome), taxPaid: Number(taxReturn.taxPaid),
                finalTaxResult: taxReturn.finalTaxResult === null ? null : Number(taxReturn.finalTaxResult),
            });
        }

        const years = new Set([...operationalByYear.keys(), ...declaredByYear.keys()]);
        return [...years]
            .sort((left, right) => right - left)
            .map((taxYear) => {
                const declared = declaredByYear.get(taxYear);
                const operational = operationalByYear.get(taxYear) ?? { totalIncome: 0, taxPaid: 0, employmentIncome: 0, selfEmploymentIncome: 0, savingsIncome: 0, capitalGains: 0, socialSecurity: 0, workExpenses: 0, issues: [] };
                // A filed return is the authoritative source for the annual
                // headline figures. Keep the operational breakdown available
                // for diagnostics, but do not replace the declared totals
                // with an incomplete reconstruction from imported records.
                return {
                    taxYear,
                    ...operational,
                    cashIncome: cashYears.get(taxYear) ?? { dividends:0, interest:0, records:0, estimatedConversions:0, pendingByCurrency:{} },
                    issues: [...new Set(operational.issues)],
                    operationalTaxPaid: operational.taxPaid,
                    totalIncome: declared?.totalIncome ?? operational.totalIncome,
                    taxPaid: declared?.taxPaid ?? operational.taxPaid,
                    finalTaxResult: declared?.finalTaxResult ?? null,
                    source: declared ? 'tax_return' : 'operational_records',
                };
            });
}
