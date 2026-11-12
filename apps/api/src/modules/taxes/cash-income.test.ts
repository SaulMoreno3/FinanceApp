import test from 'node:test';
import assert from 'node:assert/strict';
import { cashIncomeByYear, type CashIncome } from './cash-income';
import { buildAnnualTaxSummary } from './tax-summary';
const dividend:CashIncome={id:'1',date:new Date('2025-06-09'),type:'Dividend',currency:'USD',value:10,eurCost:null,conversionRate:null};
const fx=[{date:new Date('2025-06-06'),baseCurrency:'USD',quoteCurrency:'EUR',rate:0.9}];
test('includes dividends and interest, not deposits, using only past reference FX',()=>{
 const r=cashIncomeByYear([dividend,{...dividend,type:'Interest',currency:'EUR',value:0.21},{...dividend,type:'Deposit',value:1000}], [...fx,{...fx[0],date:new Date('2025-06-10'),rate:2}]).get(2025)!;
 assert.equal(r.dividends,9);assert.equal(r.interest,0.21);assert.equal(r.records,2);assert.equal(r.estimatedConversions,1);
});
test('explicit EUR or recorded conversion takes precedence, missing FX remains pending',()=>{
 assert.equal(cashIncomeByYear([{...dividend,eurCost:8,conversionRate:0.7}],fx).get(2025)!.dividends,8);
 assert.equal(cashIncomeByYear([{...dividend,conversionRate:0.7}],fx).get(2025)!.dividends,7);
 const r=cashIncomeByYear([dividend], [{...fx[0],date:new Date('2025-06-01')}]).get(2025)!;
 assert.equal(r.dividends,0);assert.deepEqual(r.pendingByCurrency,{USD:10});
});
test('operational total includes cash income; filed headline is not overwritten',()=>{
 const args={trades:[],salaries:[],projects:[],cashIncomes:[dividend],incomeFx:fx};
 const operational=buildAnnualTaxSummary({...args,taxReturns:[]})[0];
 assert.equal(operational.savingsIncome,9);assert.equal(operational.totalIncome,9);assert.ok(operational.issues.length);
 const filed=buildAnnualTaxSummary({...args,taxReturns:[{taxYear:2025,country:'Spain',status:'Filed',updatedAt:new Date(),totalIncome:500,taxPaid:10,finalTaxResult:0}]})[0];
 assert.equal(filed.totalIncome,500);assert.equal(filed.savingsIncome,9);assert.equal(filed.cashIncome.records,1);
});
