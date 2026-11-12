import type { Movement } from './planning.calculations';
export type SalarySchedule = { day: number; weekendAdjustment: 'NONE'|'PREVIOUS'|'NEXT'; anchorMonth: string };
export interface SalaryEvidence { id: string; date: Date|null; netSalary: number|{toString():string}|null; company: string|null; notes: string|null }
const iso=(d:Date)=>d.toISOString().slice(0,10);
const normalize=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const companyKey=(s:string)=>normalize(s).replace(/^(payment from|transferencia de|nomina de|salary from)\s+/,'').replace(/[^a-z0-9]/g,'').replace(/(sau|slu|sl|sa)$/,'');
const monthIndex=(date:string)=>Number(date.slice(0,4))*12+Number(date.slice(5,7))-1;
const monthLabel=(index:number)=>`${Math.floor(index/12)}-${String(index%12+1).padStart(2,'0')}`;
export function salaryPaymentDate(schedule:SalarySchedule,index=0) {
 const target=monthIndex(schedule.anchorMonth)+index,year=Math.floor(target/12),month=target%12;
 const date=new Date(Date.UTC(year,month,Math.min(schedule.day,new Date(Date.UTC(year,month+1,0)).getUTCDate())));
 const week=date.getUTCDay();
 if(schedule.weekendAdjustment==='PREVIOUS'&&(week===0||week===6))date.setUTCDate(date.getUTCDate()-(week===0?2:1));
 if(schedule.weekendAdjustment==='NEXT'&&(week===0||week===6))date.setUTCDate(date.getUTCDate()+(week===0?1:2));
 return iso(date);
}
/** Payroll documents identify the employer; only booked bank credits establish payment dates. */
export function detectSalary(rows:(Movement&{kind:string;merchantKey:string})[],salaries:SalaryEvidence[],today:string) {
 const now=Date.parse(today),age=(date:string)=>(now-Date.parse(date))/86400000;
 const valid=salaries.filter(s=>s.date&&Number(s.netSalary)>0&&s.date.getTime()<now+86400000&&!/cotizaci|contribution report|unknown|desconoc/i.test(s.notes??'')).sort((a,b)=>b.date!.getTime()-a.date!.getTime());
 const current=valid.find(s=>s.company&&age(iso(s.date!))<=120);
 const bank=rows.filter(t=>t.kind==='INCOME'&&t.status.toLowerCase()==='booked'&&t.amount>0&&t.currency==='EUR'&&age(t.date)>=0&&age(t.date)<=370&&!/fondos monetarios|investment account|exchanged|to eur personal|bonus|extraordin|atrasos|arrears|finiquito/i.test([t.description,t.category].join(' ')));
 let credits:typeof bank=[],name=current?.company??'Nómina';
 if(current){const key=companyKey(current.company!);credits=bank.filter(t=>key.length>=4&&[t.merchantName,t.description].some(v=>v&&companyKey(v)===key));}
 else {
  const groups=new Map<string,typeof bank>();
  for(const t of bank.filter(t=>/\b(nomina|salary|payroll)\b/.test(normalize([t.description,t.category].join(' ')))))groups.set(t.merchantKey,[...(groups.get(t.merchantKey)??[]),t]);
  const candidates=[...groups.values()].filter(g=>g.length>=3&&age(g.at(-1)!.date)<=60);
  // Multiple employers require an explicit choice instead of mixing salaries.
  if(candidates.length===1){credits=candidates[0];name=credits.at(-1)!.merchantName||credits.at(-1)!.description||name;}
 }
 credits=[...credits].sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id));
 const recent=credits.slice(-12),latest=recent.at(-1);
 const evidence=recent.map(t=>({id:t.id,date:t.date,amount:t.amount}));
 const base={name,amount:latest?.amount??(current?Number(current.netSalary):0),currency:'EUR',source:'BANK_PAYMENTS' as const,evidence,confidence:'Baja',day:null as number|null,schedule:null as SalarySchedule|null,nextDate:null as string|null,range:null as {from:string;to:string}|null,merchantKey:latest?.merchantKey??null};
 if(!current&&!latest)return null;
 if(recent.length<3)return {...base,reason:'Faltan al menos tres cobros bancarios identificados. La fecha de una nómina no demuestra cuándo se cobró.'};
 if(age(latest!.date)>60)return {...base,reason:'El último cobro identificado tiene más de 60 días. No se supone que el empleo continúe.'};
 // A month with multiple credits can contain arrears or an extra payment: do not infer a normal salary from it.
 const fits=[];
 for(let day=1;day<=31;day++)for(const weekendAdjustment of ['NONE','PREVIOUS','NEXT'] as const){
  const matches=recent.map(t=>{
   const month=monthIndex(t.date);
   return [-1,0,1].map(offset=>{const nominal=month+offset,date=salaryPaymentDate({day,weekendAdjustment,anchorMonth:monthLabel(nominal)});return {nominal,error:(Date.parse(t.date)-Date.parse(date))/86400000};}).sort((a,b)=>Math.abs(a.error)-Math.abs(b.error))[0];
  });
  if(new Set(matches.map(m=>m.nominal)).size!==recent.length)continue;
  if(weekendAdjustment!=='NONE'){
   const supporting=matches.filter(m=>{const nominal=salaryPaymentDate({day,weekendAdjustment:'NONE',anchorMonth:monthLabel(m.nominal)}),weekday=new Date(nominal+'T00:00:00Z').getUTCDay();return (weekday===0||weekday===6)&&m.error===0;});
   if(supporting.length<2)continue;
  }
  const errors=matches.map(m=>Math.abs(m.error));
  const score=errors.reduce((a,b)=>a+b,0)/errors.length+(weekendAdjustment==='NONE'?0:.3);
  fits.push({day,weekendAdjustment,matches,score,maxError:Math.max(...errors)});
 }
 fits.sort((a,b)=>a.score-b.score||a.day-b.day);
 const fit=fits[0];
 if(!fit||fit.maxError>5||fit.matches.some((m,i)=>i>0&&m.nominal-fit.matches[i-1].nominal!==1))return {...base,reason:'Los cobros no forman una pauta mensual suficientemente regular; pueden incluir extras, retrasos o meses ausentes.'};
 const alreadyPaid=new Set(fit.matches.map(m=>m.nominal));
 let schedule:SalarySchedule|null=null,nextDate:string|null=null;
 for(let n=monthIndex(today)-1;n<=monthIndex(today)+3;n++){
  const proposed={day:fit.day,weekendAdjustment:fit.weekendAdjustment,anchorMonth:monthLabel(n)},date=salaryPaymentDate(proposed);
  if(date>today&&!alreadyPaid.has(n)){schedule=proposed;nextDate=date;break;}
 }
 if(!schedule||!nextDate)return {...base,reason:'No se pudo determinar el siguiente periodo de cobro.'};
 const offsets=fit.matches.map(m=>m.error),shift=(days:number)=>iso(new Date(Date.parse(nextDate!)+days*86400000));
 const confidence=recent.length>=6&&fit.maxError<=1?'Alta':fit.maxError<=2?'Media':'Baja';
 return {...base,day:fit.day,schedule,nextDate,confidence,range:{from:shift(Math.min(0,...offsets)),to:shift(Math.max(0,...offsets))},
  reason:`${recent.length} cobros bancarios del mismo pagador. Se usa el último importe cobrado; los anteriores pueden variar. No se ajustan festivos.`};
}
