import type { Movement } from '../planning/planning.calculations';
import { isCardRepayment, money, normalizeMerchant } from './expenses.calculations';

export type UncategorizedFilters = {currency:string;account?:string;month?:string;search?:string;page?:number;limit?:number};

// Input is the same reconciled, owner-scoped classification used by the expense overview.
export function uncategorizedPage<T extends Movement & {kind:string;displayCategory:string;accountName:string}>(
 rows:T[], filters:UncategorizedFilters, today:string, extraCategories:string[] = [],
) {
 const expenses=rows.filter(t=>t.kind==='EXPENSE' && t.currency===filters.currency && t.date<=today
  && !isCardRepayment(t.description??''));
 const pending=expenses.filter(t=>t.displayCategory==='Sin categoría');
 const search=normalizeMerchant(filters.search??'');
 const selected=pending.filter(t=>(!filters.account||t.accountId===filters.account)
  && (!filters.month||t.date.startsWith(filters.month))
  && (!search||normalizeMerchant(`${t.merchantName??''} ${t.description??''}`).includes(search)))
  .sort((a,b)=>b.date.localeCompare(a.date)||a.id.localeCompare(b.id));
 const limit=Math.min(100,Math.max(1,filters.limit??50));
 const page=Math.min(Math.max(0,filters.page??0),Math.max(0,Math.ceil(selected.length/limit)-1));
 return {
  currency:filters.currency,total:pending.length,filteredTotal:selected.length,page,limit,
  netAmount:money(-selected.reduce((n,t)=>n+t.amount,0))||0,
  accounts:[...new Map(expenses.map(t=>[t.accountId,{id:t.accountId,name:t.accountName}])).values()]
   .sort((a,b)=>a.name.localeCompare(b.name,'es')),
  months:[...new Set(expenses.map(t=>t.date.slice(0,7)))].sort().reverse(),
  categories:[...new Set([...rows.filter(t=>t.kind==='EXPENSE').map(t=>t.displayCategory),...extraCategories])]
   .filter(c=>c && c!=='Sin categoría' && c.length<=80).sort((a,b)=>a.localeCompare(b,'es')),
  transactions:selected.slice(page*limit,(page+1)*limit).map(t=>({...t,sameMerchantCount:pending.filter(p=>normalizeMerchant(p.merchantName||p.description||'')===normalizeMerchant(t.merchantName||t.description||'')).length})),
 };
}
