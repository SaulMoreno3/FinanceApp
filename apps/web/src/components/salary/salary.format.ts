const euroFormatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
});

export function formatEuro(value: number | null | undefined) {
    const amount = Number(value ?? 0);
    return euroFormatter.format(Number.isFinite(amount) ? amount : 0);
}
