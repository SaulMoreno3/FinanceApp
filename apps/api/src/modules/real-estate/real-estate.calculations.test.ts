import assert from 'node:assert/strict';
import test from 'node:test';
import { propertySchema, type PropertyInput } from './real-estate.schema';
import { acquisitionCost, changeRent, mortgageSchedule, propertyReport } from './real-estate.calculations';
const rentId='10000000-0000-4000-8000-000000000001',expenseId='20000000-0000-4000-8000-000000000001',newId='10000000-0000-4000-8000-000000000002';
const property=(patch:Partial<PropertyInput>={}):PropertyInput=>propertySchema.parse({name:'Piso',acquisitionDate:'2024-01-01',purchasePrice:100000,rentPeriods:[{id:rentId,startDate:'2025-01-01',endDate:null,monthlyRent:1000,dueDay:5,autoCollect:true,tenant:''}],...patch});
const report=(p:PropertyInput,year=2025,asOf='2025-12-31')=>propertyReport(p,year,asOf);
test('normal cash purchase: annual rents, net yield and capital return',()=>{
 const p=property({acquisitionTax:10000,expenses:[{id:expenseId,date:'2025-01-01',endDate:null,amount:100,category:'COMMUNITY',description:'Comunidad',frequency:'MONTHLY'}]});
 const r=report(p);assert.equal(r.acquisitionCost,110000);assert.equal(r.ownCapital,110000);assert.equal(r.expectedRent,12000);assert.equal(r.operatingExpenses,1200);assert.equal(r.grossYield,12);assert.equal(r.netYield,9.82);assert.equal(r.cashOnCash,9.82);
});
test('gifted home with zero invested capital has no infinite return',()=>{
 const r=report(property({purchasePrice:0,currentValue:200000}));
 assert.equal(r.acquisitionCost,0);assert.equal(r.grossYield,null);assert.equal(r.netYield,null);assert.equal(r.cashOnCash,null);assert.equal(r.yieldOnValue,6);assert.equal(r.equity,200000);assert.equal(r.mortgageBalance,0);
 assert.ok(!JSON.stringify(r).includes('Infinity'));
});
test('zero purchase price with acquisition expenses still has a cost-based net yield',()=>{
 const r=report(property({purchasePrice:0,acquisitionTax:5000}));assert.equal(r.grossYield,null);assert.equal(r.netYield,240);assert.equal(r.ownCapital,5000);
});
test('mortgage fees included once and principal kept separate from operating expenses',()=>{
 const p=property({acquisitionTax:10000,mortgage:{principal:80000,annualRate:0,termMonths:100,firstPaymentDate:'2025-01-05',fees:1000}});const r=report(p);
 assert.equal(acquisitionCost(p),111000);assert.equal(r.ownCapital,31000);assert.equal(r.downPayment,20000);assert.equal(r.debtService,9600);assert.equal(r.operatingExpenses,0);assert.equal(r.operatingProfit,12000);assert.equal(r.netCashFlow,2400);assert.equal(r.mortgageBalance,70400);
});
test('100% financed acquisition yields a null cash-on-cash ratio',()=>assert.equal(report(property({mortgage:{principal:100000,annualRate:3,termMonths:240,firstPaymentDate:'2025-01-01',fees:0}})).cashOnCash,null));
test('French loan schedule ends at zero with principal reconciled to cents',()=>{
 const schedule=mortgageSchedule(property({mortgage:{principal:100000,annualRate:3,termMonths:240,firstPaymentDate:'2025-01-31',fees:0}}));
 assert.equal(schedule[0].payment,554.6);assert.equal(schedule[0].interest,250);assert.equal(schedule[0].principal,304.6);assert.equal(schedule[1].date,'2025-02-28');assert.equal(schedule[2].date,'2025-03-31');assert.equal(schedule.at(-1)?.balance,0);
 assert.equal(schedule.reduce((n,v)=>n+Math.round(v.principal*100),0),10000000);
});
test('zero interest handles final cent without division by zero',()=>{
 const schedule=mortgageSchedule(property({mortgage:{principal:100,annualRate:0,termMonths:3,firstPaymentDate:'2025-01-01',fees:0}}));assert.deepEqual(schedule.map(v=>v.payment),[33.33,33.33,33.34]);
});
test('rent change by percent preserves history and bounds',()=>{
 const p=property();p.rentPeriods=changeRent(p.rentPeriods,rentId,'2025-07-01','PERCENT',5,newId);
 assert.equal(p.rentPeriods[0].endDate,'2025-06-30');assert.equal(p.rentPeriods[1].monthlyRent,1050);assert.equal(report(p).expectedRent,12300);assert.equal(report(p,2024).expectedRent,0);
});
test('fixed rent revision supports mid-month changes and cent reconciliation',()=>{
 const p=property();p.rentPeriods=changeRent(p.rentPeriods,rentId,'2025-01-16','AMOUNT',1000,newId);
 assert.equal(report(p).months[0].rent,1000);assert.equal(report(p).expectedRent,12000);
});
test('end dates are inclusive and partial leap months use calendar days',()=>{
 const p=property();p.rentPeriods=[{...p.rentPeriods[0],startDate:'2024-02-15',endDate:'2024-02-29',monthlyRent:2900}];
 const r=report(p,2024);assert.equal(r.expectedRent,1500);assert.equal(r.charges.length,1);assert.equal(r.charges[0].days,15);
});
test('empty months remain vacant; disjoint rents are not filled automatically',()=>{
 const p=property();p.rentPeriods=[{...p.rentPeriods[0],endDate:'2025-03-31'},{...p.rentPeriods[0],id:newId,startDate:'2025-07-01',endDate:'2025-09-30'}];
 assert.equal(report(p).expectedRent,6000);assert.equal(report(p).months[4].rent,0);
});
test('auto collection excludes future due dates and does not duplicate on repeated reads',()=>{
 const p=property(),a=report(p,2025,'2025-03-04'),b=report(p,2025,'2025-03-04');assert.deepEqual(a,b);assert.equal(a.receivedRent,2000);assert.equal(a.charges[2].status,'PLANNED');assert.equal(report(p,2025,'2025-03-05').receivedRent,3000);
});
test('manual collection remains pending; zero override records unpaid instead of auto income',()=>{
 const p=property();p.rentPeriods[0].autoCollect=false;assert.equal(report(p).receivedRent,0);assert.equal(report(p).charges[0].status,'PENDING');
 p.rentPeriods[0].autoCollect=true;p.receipts=[{periodId:rentId,month:'2025-01',amount:0,paidOn:null}];assert.equal(report(p).receivedRent,11000);assert.equal(report(p).charges[0].status,'PENDING');
});
test('partial receipts affect collected income without rewriting contracted rent',()=>{
 const p=property({receipts:[{periodId:rentId,month:'2025-01',amount:400,paidOn:'2025-01-10'}]});const r=report(p);assert.equal(r.expectedRent,12000);assert.equal(r.receivedRent,11400);assert.equal(r.charges[0].status,'PARTIAL');
});
test('late cross-year receipts belong to the cash year once only',()=>{
 const p=property({receipts:[{periodId:rentId,month:'2025-12',amount:1000,paidOn:'2026-01-10'}]});p.rentPeriods[0].endDate='2025-12-31';
 assert.equal(report(p,2025,'2026-12-31').receivedRent,11000);assert.equal(report(p,2026,'2026-12-31').receivedRent,1000);
});
test('monthly expenses maintain the original day after February',()=>{
 const r=report(property({expenses:[{id:expenseId,description:'Seguro',category:'INSURANCE',amount:10,frequency:'MONTHLY',date:'2025-01-31',endDate:'2025-03-31'}]}));
 assert.deepEqual(r.expenses.map(v=>v.date),['2025-01-31','2025-02-28','2025-03-31']);assert.equal(r.operatingExpenses,30);
});
test('one-off and annual expenses occur only on intended dates',()=>{
 const p=property({expenses:[{id:expenseId,description:'IBI',category:'IBI',amount:300,frequency:'YEARLY',date:'2024-05-01',endDate:null}]});assert.equal(report(p).operatingExpenses,300);
 p.expenses[0].frequency='ONCE';assert.equal(report(p).operatingExpenses,0);assert.equal(report(p,2024).operatingExpenses,300);
});
test('negative cash flow and negative net yields are preserved',()=>{
 const p=property({rentPeriods:[],expenses:[{id:expenseId,description:'Reparación',category:'MAINTENANCE',amount:1000,frequency:'ONCE',date:'2025-01-01',endDate:null}]});assert.equal(report(p).netYield,-1);assert.equal(report(p).netCashFlow,-1000);
});
test('validation rejects overlapping periods, inverted dates and unlinked receipts',()=>{
 const p=property();assert.equal(propertySchema.safeParse({...p,rentPeriods:[...p.rentPeriods,{...p.rentPeriods[0],id:newId}]}).success,false);
 assert.equal(propertySchema.safeParse({...p,rentPeriods:[{...p.rentPeriods[0],endDate:'2024-01-01'}]}).success,false);
 assert.equal(propertySchema.safeParse({...p,receipts:[{periodId:newId,month:'2025-01',amount:100,paidOn:'2025-01-01'}]}).success,false);
});
test('validation rejects duplicate receipt overrides and acquisition before rent',()=>{
 const p=property();const receipt={periodId:rentId,month:'2025-01',amount:0,paidOn:null};
 assert.equal(propertySchema.safeParse({...p,receipts:[receipt,receipt]}).success,false);
 assert.equal(propertySchema.safeParse({...p,acquisitionDate:'2026-01-01'}).success,false);
});
test('validation rejects impossible financing and fractional money cents',()=>{
 const p=property();assert.equal(propertySchema.safeParse({...p,mortgage:{principal:200000,annualRate:3,termMonths:240,firstPaymentDate:'2025-01-01',fees:0}}).success,false);
 assert.equal(propertySchema.safeParse({...p,purchasePrice:0.001}).success,false);
 assert.equal(propertySchema.safeParse({...p,purchasePrice:-1}).success,false);
});
test('rent revisions outside a period or invalid percentage are rejected',()=>{
 const p=property();assert.throws(()=>changeRent(p.rentPeriods,rentId,'2025-01-01','AMOUNT',1100,newId));assert.throws(()=>changeRent(p.rentPeriods,rentId,'2025-02-01','PERCENT',-100,newId));
});
