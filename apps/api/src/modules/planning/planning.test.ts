import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { planSchema, recurringSchema } from './planning.schema';
import { classify, detectSubscriptions, expenseAnalysis, forecast, inferVariableMonthlySpend, ledgerFingerprint, nextDueDate, occurrence, merchantKey, type Movement } from './planning.calculations';
const empty=()=>planSchema.parse({});
const movement=(date:string,amount=-10,more:Partial<Movement>={}):Movement=>({id:randomUUID(),accountId:'one',date,amount,currency:'EUR',description:'Video service',merchantName:'Video service',category:'Entertainment',status:'booked',...more});
const regular=()=>['2026-06-05','2026-07-05','2026-08-05','2026-09-05'].map(d=>movement(d));
test('detects monthly regular payments with evidence and excludes pending and future charges',()=>{
 const p=empty(),rows=regular();rows.push(movement('2026-09-08',-999,{status:'pending'}),movement('2026-09-10',-999));
 const candidates=detectSubscriptions(classify(rows,p),p,'2026-09-09');assert.equal(candidates.length,1);assert.equal(candidates[0].cadence,'MONTHLY');assert.equal(candidates[0].count,4);assert.equal(candidates[0].nextDate,'2026-10-05');
});
test('does not call irregular purchases, stale subscriptions or ambiguous same-day charges subscriptions',()=>{
 const p=empty();
 for(const rows of [[movement('2026-08-02'),movement('2026-08-08'),movement('2026-09-01')],[...regular(),movement('2026-09-05')],regular().slice(0,3)])assert.equal(detectSubscriptions(classify(rows,p),p,'2026-12-01').length,0);
 assert.equal(detectSubscriptions(classify([movement('2026-07-05',-10),movement('2026-08-05',-100),movement('2026-09-05',-500)],p),p,'2026-09-09').length,0);
});
test('supports annual bills, price-change evidence, and per-user confirmation/dismissal',()=>{
 const p=empty(),annual=[movement('2025-09-01',-100),movement('2026-09-01',-100)];
 assert.equal(detectSubscriptions(classify(annual,p),p,'2026-09-09')[0].cadence,'YEARLY');
 const rows=regular();rows[3].amount=-12;const found=detectSubscriptions(classify(rows,p),p,'2026-09-09')[0];assert.equal(found.priceChange,2);
 p.dismissedMerchants=[found.merchantKey];assert.equal(detectSubscriptions(classify(rows,p),p,'2026-09-09').length,0);
 assert.equal(detectSubscriptions(classify(rows,empty()),empty(),'2026-09-09').length,1);
});
test('preserves ambiguous transfer candidates, pairs matching own-account transfers and respects manual overrides',()=>{
 const outgoing=movement('2026-09-01',-100,{category:'TRANSFER'}),incoming=movement('2026-09-02',100,{accountId:'two'}),p=empty();
 assert.deepEqual(classify([outgoing,incoming],p).map(t=>t.kind),['TRANSFER','TRANSFER']);
 assert.equal(classify([outgoing,incoming,{...incoming,id:randomUUID(),accountId:'three'}],p)[0].kind,'EXPENSE');
 p.transactionOverrides[outgoing.id]={kind:'EXPENSE',category:'Alquiler'};
 assert.equal(classify([outgoing,incoming],p)[0].displayCategory,'Alquiler');assert.equal(classify([outgoing,incoming],p)[0].kind,'EXPENSE');
});
test('EUR analysis keeps foreign currencies separate and excludes pending entries',()=>{
 const rows=[movement('2026-09-01',-10),movement('2026-09-02',-90,{currency:'USD'}),movement('2026-09-03',1000),movement('2026-09-04',-500,{status:'pending'})];
 const a=expenseAnalysis(classify(rows,empty()),'2026-09','2026-09-09');assert.equal(a.spent,10);assert.equal(a.income,1000);assert.equal(a.saved,990);assert.deepEqual(a.otherCurrencies,['USD']);
});
test('end-of-month and leap dates retain the recurrence anchor',()=>{
 assert.equal(occurrence('2026-01-31','MONTHLY',1),'2026-02-28');assert.equal(occurrence('2026-01-31','MONTHLY',2),'2026-03-31');assert.equal(occurrence('2024-02-29','YEARLY',1),'2025-02-28');
});
test('forecast uses confirmed schedules only, never spends the reserve twice, and respects end dates and currencies',()=>{
 const p=empty();p.reserve=100;p.recurring=[recurringSchema.parse({id:randomUUID(),name:'Fee',amount:10,kind:'SUBSCRIPTION',cadence:'MONTHLY',nextDate:'2026-01-31',endDate:'2026-02-28',active:true,merchantKey:null})];
 const f=forecast(500,p,'2026-01-30',[]);assert.equal(f.events.length,2);assert.equal(f.endBalance,480);assert.equal(f.days.at(-1)!.available,380);
 p.recurring[0].currency='USD';assert.equal(forecast(500,p,'2026-01-30',[]).endBalance,500);
});
test('infers a robust variable budget from three complete months and excludes debt ids and confirmed recurring charges',()=>{
 const p=empty();const recurring=recurringSchema.parse({id:randomUUID(),name:'Fee',amount:10,kind:'SUBSCRIPTION',cadence:'MONTHLY',nextDate:'2026-10-01',endDate:null,active:true,merchantKey:'EUR:video service'});p.recurring=[recurring];
 const rows=classify([
  movement('2026-06-05',-100,{description:'Groceries',merchantName:'Groceries'}),movement('2026-06-06',-10),
  movement('2026-07-05',-300,{description:'Groceries',merchantName:'Groceries'}),movement('2026-07-06',-10),
  movement('2026-08-05',-200,{description:'Groceries',merchantName:'Groceries'}),movement('2026-08-06',-10),
 ],p);const debtId=rows.find(row=>row.date==='2026-07-05')!.id;
 const result=inferVariableMonthlySpend(rows,p,'2026-09-09',new Set([debtId]));
 assert.equal(result.amount,100);assert.deepEqual(result.months.map(row=>row.amount),[100,0,200]);
});
test('close fingerprint is order independent, changes for corrected data but not unrelated reserve changes',()=>{
 const rows=regular(),p=empty(),original=ledgerFingerprint(rows,p,'2026-09');assert.equal(ledgerFingerprint([...rows].reverse(),p,'2026-09'),original);
 p.reserve=900;assert.equal(ledgerFingerprint(rows,p,'2026-09'),original);
 rows[3].amount=-20;assert.notEqual(ledgerFingerprint(rows,p,'2026-09'),original);
 const other=ledgerFingerprint(rows,p,'2026-09');p.transactionOverrides[rows[3].id]={kind:'TRANSFER',category:''};assert.notEqual(ledgerFingerprint(rows,p,'2026-09'),other);
});
test('rejects invalid amounts, dates and duplicate active merchants',()=>{
 assert.equal(planSchema.safeParse({reserve:-1}).success,false);assert.equal(planSchema.safeParse({reserve:.001}).success,false);
 const r={id:randomUUID(),name:'Test',amount:10,currency:'EUR',kind:'SUBSCRIPTION',cadence:'MONTHLY',nextDate:'2026-02-30',endDate:null,active:true,merchantKey:'EUR:test'};
 assert.equal(recurringSchema.safeParse(r).success,false);r.nextDate='2026-02-28';assert.equal(planSchema.safeParse({recurring:[r,{...r,id:randomUUID()}]}).success,false);
 assert.equal(merchantKey(movement('2026-09-01',-10,{merchantName:'Vídeo Service'})),'EUR:video service');
});

test('next renewal advances old anchors and does not announce ended or disabled subscriptions',()=>{
 const r=recurringSchema.parse({id:randomUUID(),name:'Fee',amount:10,kind:'SUBSCRIPTION',cadence:'MONTHLY',nextDate:'2025-01-31',endDate:null,active:true,merchantKey:null});
 assert.equal(nextDueDate(r,'2026-02-15'),'2026-02-28');assert.equal(nextDueDate({...r,active:false},'2026-02-15'),null);assert.equal(nextDueDate({...r,endDate:'2026-01-31'},'2026-02-15'),null);
});
