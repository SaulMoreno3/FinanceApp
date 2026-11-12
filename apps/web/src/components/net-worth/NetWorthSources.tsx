import type { NetWorthSummary } from './net-worth.types';
export function NetWorthSources({ summary }: { summary: NetWorthSummary }) {
    const sources = summary.sources;
    if (!sources) return null;
    const money = (n: number) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(n);
    const date = (d: string | null) => d ? new Date(d).toLocaleDateString('es-ES') : 'sin fecha disponible';
    return <div className="space-y-1 text-xs text-muted-foreground">
        <p>Bienes {money(sources.manualAssets)} · Bancos {money(sources.bankAccounts)} · Fondo flexible {money(sources.flexibleFunds)} · Cartera {money(sources.portfolio)} · Deudas −{money(summary.totalLiabilities ?? 0)}</p>
        <p>Bancos: {date(sources.bankUpdatedAt)}. Cartera: {date(sources.portfolioDate)}{sources.portfolioEstimated ? ' (estimada)' : ''}.</p>
        <p>Solo EUR. Incluye el fondo flexible conciliado; excluye los inmuebles de Real Estate. Evita registrar las cuentas, el fondo o la cartera también como bienes manuales.</p>
        {sources.missingBankBalances > 0 && <p>Hay {sources.missingBankBalances} cuentas sin saldo disponible.</p>}
        {!sources.portfolioDate && <p>No hay una valoración completa de cartera disponible.</p>}
    </div>;
}
