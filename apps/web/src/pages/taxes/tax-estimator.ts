export interface TaxEstimatorInput {
    employmentGross: number;
    selfEmploymentProfit: number;
    savingsIncome: number;
    capitalGains: number;
    socialSecurity: number;
    workExpenses: number;
    personalDeductions: number;
    withholdings: number;
    advancePayments: number;
}

export interface TaxEstimatorResult {
    generalBase: number;
    savingsBase: number;
    generalTax: number;
    savingsTax: number;
    estimatedTax: number;
    amountPaid: number;
    result: number;
}

// Simplified combined Aragón bands for an indicative estimate only. They do not
// include every personal, regional, family, disability, housing or other deduction.
const GENERAL_BANDS: ReadonlyArray<readonly [number, number]> = [
    [12_450, 0.19],
    [20_200, 0.24],
    [35_200, 0.30],
    [60_000, 0.37],
    [300_000, 0.45],
    [Number.POSITIVE_INFINITY, 0.47],
];

const SAVINGS_BANDS: ReadonlyArray<readonly [number, number]> = [
    [6_000, 0.19],
    [50_000, 0.21],
    [200_000, 0.23],
    [300_000, 0.27],
    [Number.POSITIVE_INFINITY, 0.30],
];

const PERSONAL_MINIMUM = 5_550;

function progressiveTax(base: number, bands: ReadonlyArray<readonly [number, number]>) {
    let remaining = Math.max(0, base);
    let previousLimit = 0;
    let tax = 0;

    for (const [limit, rate] of bands) {
        const taxableInBand = Math.min(remaining, limit - previousLimit);
        tax += taxableInBand * rate;
        remaining -= taxableInBand;
        previousLimit = limit;
        if (remaining <= 0) break;
    }

    return tax;
}

export function estimateAragonIrpf(input: TaxEstimatorInput): TaxEstimatorResult {
    const generalIncome = input.employmentGross - input.socialSecurity - input.workExpenses
        + input.selfEmploymentProfit - input.personalDeductions;
    const generalBase = Math.max(0, generalIncome - PERSONAL_MINIMUM);
    const savingsBase = Math.max(0, input.savingsIncome + input.capitalGains);
    const generalTax = progressiveTax(generalBase, GENERAL_BANDS);
    const savingsTax = progressiveTax(savingsBase, SAVINGS_BANDS);
    const estimatedTax = generalTax + savingsTax;
    const amountPaid = Math.max(0, input.withholdings) + Math.max(0, input.advancePayments);

    return {
        generalBase,
        savingsBase,
        generalTax,
        savingsTax,
        estimatedTax,
        amountPaid,
        result: estimatedTax - amountPaid,
    };
}
