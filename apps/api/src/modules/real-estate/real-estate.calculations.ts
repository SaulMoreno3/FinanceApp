import type { PropertyInput, RentPeriod } from './real-estate.schema';

export const roundMoney = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;
const cents = (v: number) => Math.round(v * 100);
const iso = (d: Date) => d.toISOString().slice(0,10);
const parse = (v: string) => new Date(`${v}T00:00:00Z`);
const monthLastDay = (year: number, month: number) => new Date(Date.UTC(year,month+1,0)).getUTCDate();
const dayInMonth = (year:number, month:number, day:number) => iso(new Date(Date.UTC(year,month,Math.min(day,monthLastDay(year,month)))));
const later = (a:string,b:string) => a>b?a:b;
const earlier = (a:string,b:string) => a<b?a:b;
const sum = <T>(items:T[],fn:(v:T)=>number) => items.reduce((n,item)=>n+cents(fn(item)),0)/100;
const yieldPercent = (income:number, investment:number) => investment > 0 ? roundMoney(income / investment * 100) : null;

export function acquisitionCost(p: PropertyInput) {
    return sum([p.purchasePrice,p.acquisitionTax,p.notaryFees,p.registryFees,p.agencyFees,p.renovationCost,p.otherCosts,p.mortgage?.fees??0],v=>v);
}

/** A date-based rent increase splits the active period; prior months keep their terms. */
export function changeRent(periods: RentPeriod[], periodId:string, effectiveDate:string, mode:'AMOUNT'|'PERCENT', value:number, newId:string): RentPeriod[] {
    const period=periods.find(p=>p.id===periodId);
    if (!period || effectiveDate <= period.startDate || (period.endDate && effectiveDate>period.endDate)) throw new Error('La fecha debe estar dentro del tramo y ser posterior a su inicio.');
    if (!Number.isFinite(value) || (mode==='PERCENT' && value<=-100) || (mode==='AMOUNT' && value<0)) throw new Error('Importe de revisión inválido.');
    const amount=roundMoney(mode==='AMOUNT'?value:period.monthlyRent*(1+value/100));
    const end=parse(effectiveDate);end.setUTCDate(end.getUTCDate()-1);
    return [...periods.map(p=>p.id===periodId?{...p,endDate:iso(end)}:p),{...period,id:newId,startDate:effectiveDate,monthlyRent:amount}];
}

export function mortgageSchedule(p: PropertyInput) {
    const loan=p.mortgage;
    if (!loan) return [];
    const rate=loan.annualRate/1200;
    const principalCents=cents(loan.principal);
    const regularPayment=rate===0?Math.round(principalCents/loan.termMonths)
        :Math.round(principalCents*rate/(1-Math.pow(1+rate,-loan.termMonths)));
    let balance=principalCents;
    const first=parse(loan.firstPaymentDate);
    return Array.from({length:loan.termMonths},(_,index)=>{
        const interest=Math.round(balance*rate);
        const payment=index===loan.termMonths-1?balance+interest:Math.min(balance+interest,regularPayment);
        const principal=payment-interest;
        balance=Math.max(0,balance-principal);
        const month=first.getUTCMonth()+index;
        const date=dayInMonth(first.getUTCFullYear()+Math.floor(month/12),month%12,first.getUTCDate());
        return {date,payment:payment/100,interest:interest/100,principal:principal/100,balance:balance/100};
    });
}

function rentCharge(period:RentPeriod,year:number,month:number) {
    const start=dayInMonth(year,month,1),end=dayInMonth(year,month,31);
    const from=later(start,period.startDate),to=earlier(end,period.endDate??end);
    if (from>to) return null;
    const days=(parse(to).getTime()-parse(from).getTime())/86400000+1;
    // Difference of cumulative rounded cents preserves a full month's amount
    // when an unchanged rent is split by a mid-month revision.
    const firstDay=parse(from).getUTCDate()-1,lastDay=parse(to).getUTCDate();
    const monthlyCents=cents(period.monthlyRent),monthDays=monthLastDay(year,month);
    const amount=(Math.round(monthlyCents*lastDay/monthDays)-Math.round(monthlyCents*firstDay/monthDays))/100;
    return {periodId:period.id,month:start.slice(0,7),from,to,days,expected:amount,
        dueDate:later(from,earlier(to,dayInMonth(year,month,period.dueDay))),tenant:period.tenant,autoCollect:period.autoCollect};
}

function expenseOccurrences(p:PropertyInput,year:number) {
    return p.expenses.flatMap(expense=>{
        const start=parse(expense.date),rows:{id:string;date:string;description:string;category:string;amount:number}[]=[];
        for(let month=0;month<12;month++) {
            if(expense.frequency==='ONCE' && expense.date.slice(0,7)!==`${year}-${String(month+1).padStart(2,'0')}`) continue;
            if(expense.frequency==='YEARLY' && month!==start.getUTCMonth()) continue;
            const date=dayInMonth(year,month,start.getUTCDate());
            if(date<expense.date || (expense.endDate && date>expense.endDate)) continue;
            rows.push({id:`${expense.id}:${date}`,date,description:expense.description,category:expense.category,amount:expense.amount});
        }
        return rows;
    }).sort((a,b)=>a.date.localeCompare(b.date));
}

export function propertyReport(p:PropertyInput,year:number,asOf:string=new Date().toISOString().slice(0,10)) {
    const yearEnd=`${year}-12-31`,yearStart=`${year}-01-01`,cutoff=earlier(asOf,yearEnd);
    const cost=acquisitionCost(p),capital=roundMoney(cost-(p.mortgage?.principal??0));
    const receipts=new Map(p.receipts.map(r=>[`${r.periodId}:${r.month}`,r]));
    // Include charges from any year whose explicit receipt falls in the report year.
    const receiptPeriods=new Map(p.rentPeriods.map(r=>[r.id,r]));
    const charges=p.rentPeriods.flatMap(period=>Array.from({length:12},(_,month)=>rentCharge(period,year,month)).filter(v=>v!==null))
        .map(charge=>{
            const override=receipts.get(`${charge.periodId}:${charge.month}`);
            const paidOn=override?override.paidOn:charge.autoCollect?charge.dueDate:null;
            const amount=override?override.amount:charge.autoCollect?charge.expected:0;
            const received=paidOn && paidOn<=asOf ? amount:0;
            return {...charge,paidOn,received,source:override?'MANUAL':'AUTOMATIC',
                status:received>=charge.expected && (charge.expected>0 || Boolean(paidOn && paidOn<=asOf))?'PAID':received>0?'PARTIAL':charge.dueDate>asOf?'PLANNED':'PENDING'};
        }).sort((a,b)=>a.dueDate.localeCompare(b.dueDate)||a.periodId.localeCompare(b.periodId));
    const expectedRent=sum(charges,c=>c.expected);
    let cashRent=sum(charges,c=>c.paidOn && c.paidOn>=yearStart && c.paidOn<=cutoff?c.received:0);
    for(const receipt of p.receipts) {
        if(!receipt.paidOn || receipt.paidOn<yearStart || receipt.paidOn>cutoff || receipt.month.startsWith(`${year}-`)) continue;
        const period=receiptPeriods.get(receipt.periodId);
        if(period) cashRent=roundMoney(cashRent+receipt.amount);
    }
    const expenses=expenseOccurrences(p,year);
    const loan=mortgageSchedule(p),payments=loan.filter(v=>v.date>=yearStart&&v.date<=yearEnd);
    const projectedExpenses=sum(expenses,e=>e.amount),paidExpenses=sum(expenses.filter(e=>e.date<=cutoff),e=>e.amount);
    const debtService=sum(payments,v=>v.payment),cashDebtService=sum(payments.filter(v=>v.date<=cutoff),v=>v.payment);
    const operatingProfit=roundMoney(expectedRent-projectedExpenses),cashOperatingProfit=roundMoney(cashRent-paidExpenses);
    const netCashFlow=roundMoney(operatingProfit-debtService),cashFlowToDate=roundMoney(cashOperatingProfit-cashDebtService);
    const paidLoan=loan.filter(v=>v.date<=cutoff);
    const balance=p.mortgage?(paidLoan.at(-1)?.balance??p.mortgage.principal):0;
    return {
        year,asOf:cutoff,acquisitionCost:cost,ownCapital:capital,
        downPayment:roundMoney(Math.max(0,p.purchasePrice-(p.mortgage?.principal??0))),
        expectedRent,receivedRent:cashRent,operatingExpenses:projectedExpenses,expensesToDate:paidExpenses,
        operatingProfit,netCashFlow,cashFlowToDate,
        mortgagePayment:loan[0]?.payment??0,mortgageBalance:balance,
        debtService,interest:sum(payments,v=>v.interest),principalRepaid:sum(payments,v=>v.principal),
        grossYield:yieldPercent(expectedRent,p.purchasePrice),netYield:yieldPercent(operatingProfit,cost),
        cashOnCash:yieldPercent(netCashFlow,capital),yieldOnValue:yieldPercent(operatingProfit,p.currentValue??0),
        equity:p.currentValue===null?null:roundMoney(p.currentValue-balance),
        months: Array.from({length:12},(_,index)=>{
            const month=`${year}-${String(index+1).padStart(2,'0')}`;
            const rent=sum(charges.filter(c=>c.month===month),c=>c.expected);
            const costs=sum(expenses.filter(e=>e.date.startsWith(month)),e=>e.amount);
            const mortgage=sum(payments.filter(v=>v.date.startsWith(month)),v=>v.payment);
            return {month,rent,expenses:costs,mortgage,cashFlow:roundMoney(rent-costs-mortgage)};
        }),
        charges,expenses,payments,
    };
}
