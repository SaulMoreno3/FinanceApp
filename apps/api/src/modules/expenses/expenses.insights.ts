import { money } from './expenses.calculations';
export type AnalysedExpense={date:string;amount:number;kind:string;displayCategory:string;funding?:string;provisional?:boolean;source?:string;id:string};
const monthOffset=(month:string,offset:number)=>{const d=new Date(month+'-01T12:00:00Z');d.setUTCMonth(d.getUTCMonth()+offset);return d.toISOString().slice(0,7);};
const total=(rows:AnalysedExpense[])=>money(-rows.filter(r=>r.kind==='EXPENSE').reduce((n,r)=>n+r.amount,0))||0;
export function spendingInsights(rows:AnalysedExpense[],month:string,today:string,budgets:{category:string;amount:number}[]) {
 const selected=rows.filter(r=>r.date.startsWith(month)&&r.date<=today&&r.kind==='EXPENSE');
 const previousMonth=monthOffset(month,-1),elapsed=month===today.slice(0,7)?Number(today.slice(8)):31;
 const previous=rows.filter(r=>r.kind==='EXPENSE'&&r.date.startsWith(previousMonth)&&Number(r.date.slice(8))<=elapsed);
 const spent=total(selected),previousSpent=total(previous);
 const categories=[...new Set([...selected.map(r=>r.displayCategory),...budgets.map(b=>b.category)])].map(category=>{
  const own=selected.filter(r=>r.displayCategory===category),prior=previous.filter(r=>r.displayCategory===category);
  const evidence=Array.from({length:3},(_,i)=>monthOffset(month,-i-1)).map(m=>({month:m,spent:total(rows.filter(r=>r.kind==='EXPENSE'&&r.date.startsWith(m)&&r.displayCategory===category))}));
  const present=evidence.filter(e=>rows.some(r=>r.kind==='EXPENSE'&&r.date.startsWith(e.month)));
  const values=present.map(e=>Math.max(0,e.spent)).sort((a,b)=>a-b);
  const median=values.length?values.length%2?values[(values.length-1)/2]:(values[values.length/2-1]+values[values.length/2])/2:0;
  const budget=budgets.find(b=>b.category===category)?.amount??null;
  return {category,spent:total(own),personalSpent:total(own.filter(r=>r.funding!=='FLEXIBLE')),flexibleSpent:total(own.filter(r=>r.funding==='FLEXIBLE')),previousSpent:total(prior),budget,remaining:budget===null?null:money(budget-total(own)),suggestedBudget:present.length>=2&&median>0?Math.ceil(median/5)*5:null,evidenceMonths:present.length};
 }).sort((a,b)=>b.spent-a.spent);
 return {spent,personalSpent:total(selected.filter(r=>r.funding!=='FLEXIBLE')),flexibleSpent:total(selected.filter(r=>r.funding==='FLEXIBLE')),unallocatedSpent:total(selected.filter(r=>r.funding==='UNASSIGNED')),categories,
  comparison:{previousMonth,previousSpent,difference:money(spent-previousSpent),percent:previousSpent>0?money((spent-previousSpent)/previousSpent*100):null,sameElapsedDays:month===today.slice(0,7),throughDay:elapsed},
  categorization:{total:selected.length,categorized:selected.filter(r=>r.displayCategory!=='Sin categoría').length,uncategorized:selected.filter(r=>r.displayCategory==='Sin categoría').length,uncategorizedAmount:total(selected.filter(r=>r.displayCategory==='Sin categoría'))},
 };
}

export function availableMoney(input:{bank:number;monetaryFunds:number;credit:number;unreflectedDebits:number;unassigned:number;committed:number;reserve:number;unknownBalances:number;staleAccounts:number}) {
 const liquid=money(input.bank+input.monetaryFunds),beforeCommitments=money(liquid-input.credit-input.unreflectedDebits-input.unassigned);
 return {...input,liquid,beforeCommitments,available:money(beforeCommitments-input.committed-input.reserve),estimated:input.unknownBalances>0||input.staleAccounts>0||input.unassigned>0};
}
