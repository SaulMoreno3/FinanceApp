import { isNonSpendingTransfer } from '../bank-sync/bank-transfer';
import { salaryPaymentDate } from './salary-detection';
import { createHash } from 'node:crypto';
import type { Plan, Recurring } from './planning.schema';
export interface Movement {id:string;accountId:string;date:string;amount:number;currency:string;description:string|null;merchantName:string|null;category:string|null;status:string;expenseKind?:'EXPENSE'|'TRANSFER'}
export const round = (n:number) => Math.round((n+Number.EPSILON)*100)/100;
export const iso = (d:Date) => d.toISOString().slice(0,10);
export const plusDays = (day:string,n:number) => iso(new Date(Date.parse(day+'T00:00:00Z')+n*86400000));
export const merchantKey = (t:Movement) => `${t.currency}:${(t.merchantName || t.description || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\b\d{4}[-/]\d{2}[-/]\d{2}\b/g,'').replace(/\b\d{5,}\b/g,'').replace(/[^a-z0-9]+/g,' ').trim().slice(0,280)}`;
const median = (a:number[]) => {const s=[...a].sort((a,b)=>a-b);return s.length%2?s[(s.length-1)/2]:(s[s.length/2-1]+s[s.length/2])/2;};
export const cadenceDays = {WEEKLY:7,MONTHLY:30.4375,QUARTERLY:91.3125,YEARLY:365.25};
export function occurrence(anchor:string,cadence:Recurring['cadence'],index:number) {
 if(cadence==='WEEKLY')return plusDays(anchor,index*7);
 const d=new Date(anchor+'T00:00:00Z');const months={MONTHLY:1,QUARTERLY:3,YEARLY:12}[cadence]*index;
 const target=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+months,1));
 target.setUTCDate(Math.min(d.getUTCDate(),new Date(Date.UTC(target.getUTCFullYear(),target.getUTCMonth()+1,0)).getUTCDate()));return iso(target);
}
export const recurringDate=(r:Recurring,n:number)=>r.salarySchedule?salaryPaymentDate(r.salarySchedule,n):occurrence(r.nextDate,r.cadence,n);
export function nextDueDate(r:Recurring,today:string) {
 if(!r.active)return null;
 for(let n=0;n<6000;n++){const date=recurringDate(r,n);if(r.endDate&&date>r.endDate)return null;if(date>today)return date;}
 return null;
}
export function classify<T extends Movement>(rows:T[],plan:Plan) {
 const booked=rows.filter(t=>t.status.toLowerCase()==='booked');
 const inferred=new Set<string>();
 // Pair only explicit transfer-like records across owned accounts. Ambiguous pairs stay visible.
 const transferText=(t:Movement)=>/transfer|traspaso|fondos monetarios|top.?up|cash withdrawal|withdrawal|retirada|cash deposit/i.test([t.category,t.description].join(' '));
 for(const row of booked.filter(t=>t.amount<0&&transferText(t))){
  const matches=booked.filter(t=>t.amount>0&&t.accountId!==row.accountId&&t.currency===row.currency&&Math.abs(t.amount+row.amount)<.005&&Math.abs(Date.parse(t.date)-Date.parse(row.date))<=2*86400000&&!inferred.has(t.id));
  if(matches.length===1){inferred.add(row.id);inferred.add(matches[0].id);}
 }
 return booked.map(t=>{
  const override=plan.transactionOverrides[t.id];
  const autoTransfer=inferred.has(t.id)||isNonSpendingTransfer(t.description)||/internal.transfer|own.account/i.test([t.category,t.description].join(' '));
  const kind=t.expenseKind??(override?.kind&&override.kind!=='AUTO'?override.kind:autoTransfer?'TRANSFER':t.amount<0?'EXPENSE':'INCOME');
  return {...t,kind,merchantKey:merchantKey(t),displayCategory:override?.category||t.category||'Sin categoría'};
 });
}
export function detectSubscriptions(rows:ReturnType<typeof classify>,plan:Plan,today:string) {
 const groups=new Map<string,typeof rows>();
 for(const t of rows.filter(t=>t.kind==='EXPENSE'&&t.amount<0&&t.date<=today)){
  if(t.merchantKey.length<6||/transfer|traspaso|withdrawal|retirada|fondos monetarios/i.test([t.description,t.category].join(' ')))continue;
  groups.set(t.merchantKey,[...(groups.get(t.merchantKey)??[]),t]);
 }
 return [...groups.entries()].flatMap(([key,items])=>{
  if(plan.dismissedMerchants.includes(key)||plan.recurring.some(r=>r.merchantKey===key&&r.active))return [];
  const sorted=[...items].sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id));
  // Several charges on the same day are ambiguous, not a recurring subscription.
  if(new Set(sorted.map(t=>t.date)).size!==sorted.length||sorted.length<2)return [];
  const gaps=sorted.slice(1).map((t,i)=>(Date.parse(t.date)-Date.parse(sorted[i].date))/86400000);
  const gap=median(gaps);
  const cadence=(Object.keys(cadenceDays) as Recurring['cadence'][]).find(c=>Math.abs(gap-cadenceDays[c])<=({WEEKLY:1,MONTHLY:5,QUARTERLY:10,YEARLY:20}[c]));
  if(!cadence||sorted.length<(cadence==='YEARLY'?2:3))return [];
  const tolerance={WEEKLY:1,MONTHLY:5,QUARTERLY:10,YEARLY:20}[cadence];
  if(gaps.some(g=>Math.abs(g-cadenceDays[cadence])>tolerance))return [];
  const amounts=sorted.map(t=>Math.abs(t.amount)),typical=median(amounts),latest=sorted.at(-1)!;
  const stable=amounts.filter(a=>Math.abs(a-typical)<=Math.max(.5,typical*.15)).length/amounts.length>=.75;
  if(!stable)return [];
  let nextDate=occurrence(latest.date,cadence,1);
  if(Date.parse(today)-Date.parse(latest.date)>cadenceDays[cadence]*1.7*86400000)return [];
  if(nextDate<=today)nextDate=occurrence(latest.date,cadence,2);
  return [{merchantKey:key,name:latest.merchantName||latest.description||'Cobro recurrente',currency:latest.currency,amount:round(Math.abs(latest.amount)),cadence,nextDate,
   count:sorted.length,confidence:sorted.length>=4?'Alta':'Media',lastDate:latest.date,previousAmount:round(amounts.at(-2)!),priceChange:round(amounts.at(-1)!-amounts.at(-2)!),evidence:sorted.slice(-6).map(t=>({id:t.id,date:t.date,amount:round(Math.abs(t.amount))}))}];
 }).sort((a,b)=>b.amount*365/cadenceDays[b.cadence]-a.amount*365/cadenceDays[a.cadence]);
}
export function expenseAnalysis(rows:ReturnType<typeof classify>,month:string,today:string) {
 const selected=rows.filter(t=>t.date.startsWith(month)&&t.date<=today);
 const euros=selected.filter(t=>t.currency==='EUR');
 const expenses=euros.filter(t=>t.kind==='EXPENSE');
 const income=round(euros.filter(t=>t.kind==='INCOME').reduce((n,t)=>n+t.amount,0));
 const spent=round(expenses.reduce((n,t)=>n-t.amount,0));
 const group=(key:(t:typeof expenses[number])=>string)=>{
  const out:Record<string,number>=Object.create(null);for(const t of expenses)out[key(t)]=(out[key(t)]??0)-t.amount;
  return Object.entries(out).map(([name,amount])=>({name,amount:round(amount)})).sort((a,b)=>b.amount-a.amount);
 };
 const history=Array.from({length:6},(_,i)=>{
  const d=new Date(month+'-01T00:00:00Z');d.setUTCMonth(d.getUTCMonth()-5+i);const m=iso(d).slice(0,7);
  return {month:m,amount:round(rows.filter(t=>t.currency==='EUR'&&t.kind==='EXPENSE'&&t.date.startsWith(m)&&t.date<=today).reduce((n,t)=>n-t.amount,0))};
 });
 const prior=new Date(month+'-01T00:00:00Z');prior.setUTCMonth(prior.getUTCMonth()-1);const previousMonth=iso(prior).slice(0,7);
 const day=month===today.slice(0,7)?Number(today.slice(8)):31;
 const previous=round(rows.filter(t=>t.currency==='EUR'&&t.kind==='EXPENSE'&&t.date.startsWith(previousMonth)&&Number(t.date.slice(8))<=day).reduce((n,t)=>n-t.amount,0));
 const duplicates=selected.filter((t,i)=>selected.slice(0,i).some(p=>p.accountId===t.accountId&&p.date===t.date&&p.amount===t.amount&&p.currency===t.currency&&p.merchantKey===t.merchantKey));
 return {month,income,spent,saved:round(income-spent),savingRate:income>0?round((income-spent)/income*100):null,previous,change:previous>0?round((spent/previous-1)*100):null,categories:group(t=>t.displayCategory),merchants:group(t=>t.merchantName||t.description||'Sin comercio').slice(0,12),history,
  otherCurrencies:[...new Set(selected.filter(t=>t.currency!=='EUR').map(t=>t.currency))],transfers:euros.filter(t=>t.kind==='TRANSFER').length,duplicates:duplicates.map(t=>t.id),
  transactions:[...selected].sort((a,b)=>b.date.localeCompare(a.date))};
}
export function inferVariableMonthlySpend(rows:ReturnType<typeof classify>,plan:Plan,today:string,excludedIds=new Set<string>()) {
 const anchor=new Date(today+'T00:00:00Z'),months:string[]=[];
 for(let offset=3;offset>=1;offset--){const d=new Date(Date.UTC(anchor.getUTCFullYear(),anchor.getUTCMonth()-offset,1));months.push(iso(d).slice(0,7));}
 const recurringKeys=new Set(plan.recurring.filter(r=>r.active&&r.kind!=='INCOME'&&r.currency==='EUR'&&r.merchantKey).map(r=>r.merchantKey));
 const totals=months.map(month=>round(rows.filter(t=>t.kind==='EXPENSE'&&t.currency==='EUR'&&t.date.startsWith(month)&&!excludedIds.has(t.id)&&!recurringKeys.has(t.merchantKey)).reduce((sum,t)=>sum-t.amount,0)));
 return {amount:round(median(totals)),months:months.map((month,index)=>({month,amount:totals[index]}))};
}
export interface ForecastEvent {date:string;name:string;amount:number;source:string}
export function forecast(balance:number,plan:Plan,today:string,extra:ForecastEvent[]) {
 const end=plusDays(today,90),events=extra.filter(e=>e.date>today&&e.date<=end);
 for(const r of plan.recurring.filter(r=>r.active&&r.currency==='EUR')){
  for(let n=0;n<6000;n++) {const date=recurringDate(r,n);if(date>end||(r.endDate&&date>r.endDate))break;if(date>today)events.push({date,name:r.name,amount:r.kind==='INCOME'?r.amount:-r.amount,source:r.kind});}
 }
 let running=balance;const days=[];
 for(let i=1;i<=90;i++){
  const date=plusDays(today,i),d=new Date(date+'T00:00:00Z'),daysInMonth=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate();
  const dailyVariable=(Math.round(plan.variableMonthly*100*d.getUTCDate()/daysInMonth)-Math.round(plan.variableMonthly*100*(d.getUTCDate()-1)/daysInMonth))/100;
  running=round(running+events.filter(e=>e.date===date).reduce((n,e)=>n+e.amount,0)-dailyVariable);
  days.push({date,balance:running,available:round(running-plan.reserve)});
 }
 return {days,events:events.sort((a,b)=>a.date.localeCompare(b.date)),minimum:Math.min(balance,...days.map(d=>d.balance)),endBalance:running,firstBelowReserve:days.find(d=>d.available<0)?.date??null};
}
export function ledgerFingerprint(rows:Movement[],plan:Plan,month:string) {
 const selected=rows.filter(t=>t.date.startsWith(month)).sort((a,b)=>a.id.localeCompare(b.id));
 return createHash('sha256').update(JSON.stringify(selected.map(t=>({...t,override:plan.transactionOverrides[t.id]??null})))).digest('hex');
}
