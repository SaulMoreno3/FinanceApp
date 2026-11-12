import type { Holding } from "@/components/portfolio/portfolio.types";

/** Aggregations must use EUR, never relabel a native USD cost as EUR. */
export function holdingCostEur(holding: Holding): number | null {
    if (holding.conversionComplete === false) return null;
    const value = holding.totalCostBasisEur ?? (holding.currency === "EUR" ? holding.totalCostBasis : null);
    return value !== null && Number.isFinite(value) ? value : null;
}
export const chartTextColor = "var(--muted-foreground)";
export const chartGridColor = "var(--border)";
export const chartTooltipStyle = {
    backgroundColor: "var(--popover)",
    border: "1px solid var(--border)",
    borderRadius: "8px",
    color: "var(--popover-foreground)",
};
export const chartTooltipTextStyle = { color: "var(--popover-foreground)" };
