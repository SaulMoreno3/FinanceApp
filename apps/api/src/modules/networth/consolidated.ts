export interface BankBalance { currency: string; balance: string | number | null; balanceUpdatedAt: Date | null }
export interface PortfolioValue { marketValue: string | number; date: Date; hasEstimates: boolean }
export function consolidatedValues(manual: Record<string, number>, banks: BankBalance[], portfolio: PortfolioValue | undefined, liabilities: number, flexibleFunds=0) {
    const totalsByCurrency = { ...manual };
    let bankTotal = 0;
    for (const bank of banks) {
        if (bank.balance === null) continue;
        const value = Number(bank.balance);
        totalsByCurrency[bank.currency] = (totalsByCurrency[bank.currency] ?? 0) + value;
        if (bank.currency === 'EUR') bankTotal += value;
    }
    const portfolioTotal = portfolio ? Number(portfolio.marketValue) : 0;
    totalsByCurrency.EUR = (totalsByCurrency.EUR ?? 0) + portfolioTotal;
    totalsByCurrency.EUR += flexibleFunds;
    const round = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
    const dates = banks.filter(b => b.currency === 'EUR' && b.balance !== null).map(b => b.balanceUpdatedAt);
    return {
        totalAssets: round(totalsByCurrency.EUR),
        totalCurrentNetWorth: round(totalsByCurrency.EUR - liabilities),
        totalsByCurrency: Object.fromEntries(Object.entries(totalsByCurrency).map(([c,v]) => [c,round(v)])),
        sources: {
            manualAssets: round(manual.EUR ?? 0), bankAccounts: round(bankTotal), flexibleFunds: round(flexibleFunds), portfolio: round(portfolioTotal),
            bankUpdatedAt: dates.length && dates.every(d => d !== null) ? new Date(Math.min(...dates.map(d => d!.getTime()))).toISOString() : null,
            portfolioDate: portfolio?.date.toISOString().slice(0,10) ?? null,
            portfolioEstimated: portfolio?.hasEstimates ?? false,
            missingBankBalances: banks.filter(b => b.balance === null).length,
        },
    };
}
