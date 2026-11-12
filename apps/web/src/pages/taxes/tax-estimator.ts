export interface TaxEstimatorInput {
    taxYear: number;
    employmentGross: number;
    selfEmploymentProfit: number;
    savingsIncome: number;
    capitalGains: number;
    socialSecurity: number;
    /** Additional qualifying work expenses, excluding the automatic €2,000. */
    workExpenses: number;
    /** Verified reductions of the general base, not tax credits. */
    personalDeductions: number;
    withholdings: number;
    advancePayments: number;
    /** All work income is confirmed as effective employment, not pensions/unemployment. */
    employmentCreditConfirmed?: boolean;
}

export interface TaxEstimatorResult {
    generalBase: number;
    savingsBase: number;
    generalTax: number;
    savingsTax: number;
    estimatedTax: number;
    amountPaid: number;
    result: number;
    employmentReduction: number;
    unappliedSavingsLoss: number;
    employmentCredit: number;
    taxBeforeCredits: number;
    stateGeneralTax: number;
    regionalGeneralTax: number;
}

// Verified for 2025 only. Sources and excluded cases: docs/reports-tax-review.md.
// State and Aragón scales have different thresholds and must be applied separately.
export const SUPPORTED_TAX_YEARS = [2025] as const;
export const STATE_BANDS: ReadonlyArray<readonly [number, number]> = [
    [12_450, .095], [20_200, .12], [35_200, .15], [60_000, .185],
    [300_000, .225], [Infinity, .245],
];
export const ARAGON_BANDS: ReadonlyArray<readonly [number, number]> = [
    [13_072.50, .095], [21_210, .12], [36_960, .15], [52_500, .185],
    [60_000, .205], [80_000, .23], [90_000, .24], [130_000, .25], [Infinity, .255],
];
export const SAVINGS_BANDS: ReadonlyArray<readonly [number, number]> = [
    [6_000, .19], [50_000, .21], [200_000, .23], [300_000, .27], [Infinity, .30],
];
export const PERSONAL_MINIMUM = 5_550;
const round = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

function progressiveTax(base: number, bands: ReadonlyArray<readonly [number, number]>) {
    let previousLimit = 0;
    let tax = 0;
    for (const [limit, rate] of bands) {
        tax += Math.max(0, Math.min(base, limit) - previousLimit) * rate;
        if (base <= limit) break;
        previousLimit = limit;
    }
    return tax;
}

export function estimateAragonIrpf(input: TaxEstimatorInput): TaxEstimatorResult {
    if (!SUPPORTED_TAX_YEARS.some(year => year === input.taxYear)) throw new RangeError('Tax rules are only verified for Aragón 2025.');
    if (Object.entries(input).some(([key, value]) => key !== 'employmentCreditConfirmed' && !Number.isFinite(value))) throw new RangeError('Tax inputs must be finite numbers.');
    for (const field of ['employmentGross', 'socialSecurity', 'workExpenses', 'personalDeductions', 'withholdings', 'advancePayments'] as const) {
        if (input[field] < 0) throw new RangeError(`${field} cannot be negative.`);
    }
    if (input.employmentCreditConfirmed !== undefined && typeof input.employmentCreditConfirmed !== 'boolean') throw new RangeError('Employment confirmation must be a boolean.');
    const employmentNetBeforeAllowance = input.employmentGross - input.socialSecurity - input.workExpenses;
    const employmentNet = employmentNetBeforeAllowance - Math.min(2_000, Math.max(0, employmentNetBeforeAllowance));
    // Article 20 uses net work income BEFORE the €2,000 allowance.
    const otherIncome = input.selfEmploymentProfit + input.savingsIncome + input.capitalGains;
    let employmentReduction = 0;
    if (input.employmentGross > 0 && otherIncome <= 6_500 && employmentNetBeforeAllowance < 19_747.50) {
        employmentReduction = employmentNetBeforeAllowance <= 14_852 ? 7_302
            : employmentNetBeforeAllowance <= 17_673.52 ? 7_302 - 1.75 * (employmentNetBeforeAllowance - 14_852)
            : 2_364.34 - 1.14 * (employmentNetBeforeAllowance - 17_673.52);
        employmentReduction = Math.min(Math.max(0, employmentNet), Math.max(0, employmentReduction));
    }
    const generalBase = Math.max(0, employmentNet - employmentReduction + input.selfEmploymentProfit - input.personalDeductions);
    // Losses in one savings category offset at most 25% of the positive other category.
    const positiveSavings = Math.max(0, input.savingsIncome) + Math.max(0, input.capitalGains);
    const negativeSavings = -Math.min(0, input.savingsIncome) - Math.min(0, input.capitalGains);
    const offset = Math.min(negativeSavings, positiveSavings * .25);
    const savingsBase = positiveSavings - offset;
    const generalMinimum = Math.min(generalBase, PERSONAL_MINIMUM);
    const savingsMinimum = Math.min(savingsBase, PERSONAL_MINIMUM - generalMinimum);
    const stateGeneralTax = round(progressiveTax(generalBase, STATE_BANDS) - progressiveTax(generalMinimum, STATE_BANDS));
    const regionalGeneralTax = round(progressiveTax(generalBase, ARAGON_BANDS) - progressiveTax(generalMinimum, ARAGON_BANDS));
    const generalTax = round(stateGeneralTax + regionalGeneralTax);
    // State and regional savings liabilities are separate amounts rounded to cents.
    const savingsTax = 2 * round((progressiveTax(savingsBase, SAVINGS_BANDS) - progressiveTax(savingsMinimum, SAVINGS_BANDS)) / 2);
    const taxBeforeCredits = round(generalTax + savingsTax);
    // DA 61: never infer effective employment from an imported salary record.
    // General-base reductions need attribution by income source; excluded from this credit scenario.
    let employmentCredit = 0;
    if (input.employmentCreditConfirmed && input.employmentGross > 0 && input.employmentGross < 18_276
        && otherIncome <= 6_500 && input.personalDeductions === 0) {
        const nominalCredit = Math.max(0, 340 - .2 * Math.max(0, input.employmentGross - 16_576));
        const workShare = generalBase > 0 ? Math.min(1, Math.max(0, employmentNet - employmentReduction) / generalBase) : 0;
        employmentCredit = round(Math.min(nominalCredit, generalTax * workShare));
    }
    const estimatedTax = round(taxBeforeCredits - employmentCredit);
    const amountPaid = round(input.withholdings + input.advancePayments);
    return {
        employmentCredit, taxBeforeCredits, stateGeneralTax, regionalGeneralTax,
        generalBase: round(generalBase), savingsBase: round(savingsBase),
        generalTax: round(generalTax), savingsTax, estimatedTax, amountPaid,
        result: round(estimatedTax - amountPaid), employmentReduction: round(employmentReduction),
        unappliedSavingsLoss: round(negativeSavings - offset),
    };
}
