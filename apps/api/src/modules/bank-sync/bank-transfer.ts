/** Movements between a bank account and its flexible fund are transfers, not income/spending. */
export const isFlexibleFundsTransfer = (description: string | null | undefined) =>
    /fondos monetarios flexibles|savings vault topup|cuenta flexible/i.test(description ?? '');

/** Movements to tracked brokers and investment wallets are asset allocation, not consumption. */
export const isInvestmentTransfer = (description: string | null | undefined) =>
    /\b(?:to|from)\s+(?:my\s*investor banco|investment account|robo portfolio)\b|revolut x/i.test(description ?? '');

/** Revolut uses these labels for movements between the main balance and its own EUR pockets. */
export const isOwnAccountLabelTransfer = (description: string | null | undefined) =>
    /^(?:to|from) eur(?: personal| pro)?$/i.test((description ?? '').trim());

export const isNonSpendingTransfer = (description: string | null | undefined) =>
    isFlexibleFundsTransfer(description) || isInvestmentTransfer(description) || isOwnAccountLabelTransfer(description);

export const FLEXIBLE_FUNDS_OPENING_BALANCE = 27293.03;
