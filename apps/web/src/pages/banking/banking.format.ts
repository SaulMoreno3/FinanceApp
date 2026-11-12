export const isInternalBankTransfer = (description: string | null | undefined) =>
    /fondos monetarios flexibles|savings vault topup|cuenta flexible/i.test(description ?? '');

const text = (...values: Array<string | null | undefined>) => values.filter(Boolean).join(' ').toLocaleLowerCase('es-ES');

export function transactionLabel(merchantName: string | null, description: string | null) {
    return merchantName || description || 'Movimiento';
}

export function transactionCategory(category: string | null, merchantName: string | null, description: string | null) {
    if (isInternalBankTransfer(description)) return 'Traspaso entre mis cuentas';
    const haystack = text(merchantName, description);
    const code = category?.toUpperCase();

    if (code === 'CREDIT' || code === 'CASH') return 'Ingresos';
    if (code === 'TRANSFER') return 'Transferencias';
    if (code === 'ATM') return 'Efectivo';
    if (code === 'DIRECT_DEBIT') return 'Domiciliados';
    if (code === 'BILL_PAYMENT') return 'Pagos de facturas';
    if (/mcdonald|burger|restaurant|restaurante|bar |cafe |cafeter|deliveroo|just eat|ubereats|glovo|carrefour express/.test(haystack)) return 'Restaurantes';
    if (/albert heijn|jumbo|tesco|lidl|aldi|mercadona|carrefour|supermarket|supermercado/.test(haystack)) return 'Supermercado';
    if (/flixbus|uber|bolt|renfe|metro|bus |train|tren|taxi|aeropuerto|airport/.test(haystack)) return 'Transporte';
    if (/amazon|paypal|ebay|aliexpress|etsy|zalando/.test(haystack)) return 'Compras online';
    if (/netflix|spotify|disney|prime video|apple\.com|google\*/.test(haystack)) return 'Suscripciones';
    if (code === 'PURCHASE') return 'Compras';
    return category || 'Sin categoría';
}
