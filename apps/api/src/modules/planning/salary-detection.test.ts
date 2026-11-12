import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { detectSalary, salaryPaymentDate, type SalaryEvidence } from './salary-detection';
import { classify, forecast, nextDueDate } from './planning.calculations';
import { planSchema, recurringSchema } from './planning.schema';
const employer='Example Data SL';
const payroll=(date='2026-08-31',company=employer):SalaryEvidence=>({id:randomUUID(),date:new Date(date),company,netSalary:1900,notes:null});
const movements=(dates:string[],name='Payment from Example Data S.l.')=>classify(dates.map(date=>({id:randomUUID(),accountId:'test',date,amount:1900,currency:'EUR',description:name,merchantName:null,category:'CREDIT',status:'booked'})),planSchema.parse({}));
test('uses actual payments instead of month-end payslip dates, identifies the current employer and returns an uncertainty window',()=>{
 const rows=movements(['2026-06-30','2026-07-28','2026-08-26']);
 const s=detectSalary([...rows,...movements(['2026-06-16','2026-07-16','2026-08-16'],'Payment from Previous Employer')],[payroll(),payroll('2026-04-30','Previous Employer')],'2026-09-09')!;
 assert.equal(s.day,28);assert.equal(s.nextDate,'2026-09-28');assert.equal(s.confidence,'Media');assert.equal(s.evidence.length,3);assert.deepEqual(s.range,{from:'2026-09-26',to:'2026-09-30'});assert.equal(s.schedule!.weekendAdjustment,'NONE');
});
test('does not infer from contribution reports, own transfers, pending credits or future credits',()=>{
 const rows=movements(['2026-06-28','2026-07-28','2026-08-28']);
 assert.equal(detectSalary(rows,[{...payroll(),notes:'Base de cotización; neto desconocido'}],'2026-09-09'),null);
 assert.equal(detectSalary(rows.map(r=>({...r,kind:'TRANSFER'})),[payroll()],'2026-09-09')!.nextDate,null);
 assert.equal(detectSalary(rows.map(r=>({...r,status:'pending'})),[payroll()],'2026-09-09')!.nextDate,null);
 assert.equal(detectSalary(movements(['2026-09-28','2026-10-28','2026-11-28']),[payroll()],'2026-09-09')!.nextDate,null);
});
test('requires enough evidence and does not roll an old or irregular employer forward',()=>{
 assert.equal(detectSalary(movements(['2026-07-28','2026-08-28']),[payroll()],'2026-09-09')!.nextDate,null);
 assert.equal(detectSalary(movements(['2026-05-28','2026-06-28','2026-07-01']),[payroll()],'2026-09-09')!.nextDate,null);
 assert.equal(detectSalary(movements(['2026-06-04','2026-07-19','2026-08-28']),[payroll()],'2026-09-09')!.nextDate,null);
});
test('does not predict the same monthly salary twice when it was paid early',()=>{
 const r=detectSalary(movements(['2026-06-30','2026-07-28','2026-08-26']),[payroll('2026-08-26')],'2026-08-27')!;assert.equal(r.nextDate,'2026-09-28');
});
test('recognizes month end and only infers weekend shifts with repeated supporting payments',()=>{
 const dates=['2026-02-27','2026-03-31','2026-04-30','2026-05-29','2026-06-30','2026-07-31'];
 const r=detectSalary(movements(dates),[payroll('2026-07-31')],'2026-08-15')!;
 assert.equal(r.day,31);assert.equal(r.schedule!.weekendAdjustment,'PREVIOUS');assert.equal(r.nextDate,'2026-08-31');assert.equal(r.confidence,'Alta');
 assert.equal(salaryPaymentDate({...r.schedule!,anchorMonth:'2026-10'}),'2026-10-30');
});
test('explicit bank payrolls can work without payslips, generic repeated credits cannot',()=>{
 assert.equal(detectSalary(movements(['2026-06-28','2026-07-28','2026-08-28'],'Salary ACME'),[],'2026-09-09')!.day,28);
 assert.equal(detectSalary(movements(['2026-06-28','2026-07-28','2026-08-28'],'Payment from Someone'),[],'2026-09-09'),null);
});
test('rejects extra payments sharing a payroll period',()=>{
 const r=detectSalary(movements(['2026-06-28','2026-07-28','2026-08-28','2026-08-28']),[payroll()],'2026-09-09')!;assert.equal(r.nextDate,null);
});
test('saved salary pattern keeps month end, preserves other recurring schedules and validates first date',()=>{
 const schedule={day:31,weekendAdjustment:'PREVIOUS' as const,anchorMonth:'2026-10'};
 const r=recurringSchema.parse({id:randomUUID(),name:'Salary',amount:1900,kind:'INCOME',cadence:'MONTHLY',nextDate:'2026-10-30',endDate:null,active:true,merchantKey:null,salarySchedule:schedule});
 const plan=planSchema.parse({recurring:[r]});const f=forecast(0,plan,'2026-10-01',[]);
 assert.deepEqual(f.events.map(e=>e.date),['2026-10-30','2026-11-30']);assert.equal(nextDueDate(r,'2026-10-30'),'2026-11-30');
 assert.equal(recurringSchema.safeParse({...r,nextDate:'2026-10-29'}).success,false);
 assert.equal(recurringSchema.safeParse({...r,kind:'SUBSCRIPTION'}).success,false);
 const ordinary=recurringSchema.parse({...r,salarySchedule:null});assert.equal(nextDueDate(ordinary,'2026-11-30'),'2026-12-30');
});
