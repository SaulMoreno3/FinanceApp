type Numeric = number | { toString(): string };
export interface CashIncome {
    id: string; date: Date; currency: string; type: string; value: Numeric;
    eurCost: Numeric | null; conversionRate: Numeric | null;
}
export interface IncomeFx { date: Date; rate: Numeric; baseCurrency: string; quoteCurrency: string; source?: string }
export function cashIncomeByYear(rows: CashIncome[], rates: IncomeFx[]) {
    const result = new Map<number, { dividends: number; interest: number; records: number; estimatedConversions: number; pendingByCurrency: Record<string, number> }>();
    const round = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
    const sorted = [...rates].sort((a,b)=>b.date.getTime()-a.date.getTime() || (a.source??'').localeCompare(b.source??''));
    for (const row of rows) {
        const type=row.type.trim().toLowerCase();
        if (!['dividend','interest'].includes(type)) continue;
        const year=row.date.getUTCFullYear();
        const current=result.get(year)??{dividends:0,interest:0,records:0,estimatedConversions:0,pendingByCurrency:{}};
        current.records++;
        const native=Number(row.value);
        let amount:number|null=row.currency==='EUR'?native:row.eurCost!==null?Number(row.eurCost):null;
        if(amount===null && row.conversionRate!==null && Number(row.conversionRate)>0)amount=native*Number(row.conversionRate);
        if(amount===null) {
            const date=new Date(`${row.date.toISOString().slice(0,10)}T00:00:00Z`).getTime();
            const fx=sorted.find(r=>r.baseCurrency===row.currency&&r.quoteCurrency==='EUR'&&r.date.getTime()<=date&&date-r.date.getTime()<=7*86400000&&Number(r.rate)>0);
            if(fx){amount=native*Number(fx.rate);current.estimatedConversions++;}
        }
        if(amount===null||!Number.isFinite(amount))current.pendingByCurrency[row.currency]=round((current.pendingByCurrency[row.currency]??0)+native);
        else {const key=type==='dividend'?'dividends':'interest';current[key]=round(current[key]+round(amount));}
        result.set(year,current);
    }
    return result;
}
