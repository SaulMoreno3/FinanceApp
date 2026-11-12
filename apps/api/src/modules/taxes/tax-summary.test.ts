import assert from 'node:assert/strict';
import test from 'node:test';
import { buildAnnualTaxSummary, type TaxTrade } from './tax-summary';
const buy:TaxTrade={id:'1',date:new Date('2025-01-01'),symbol:'TEST',quantity:10,price:10,value:100,currency:'EUR',side:'Buy',fees:0,commission:0,eurValue:null,eurCost:null,type:'Trade'};
const summary=(trades:TaxTrade[])=>buildAnnualTaxSummary({trades,taxReturns:[],salaries:[],projects:[]});
test('partial sales retain a constant FIFO unit cost',()=>{
 const r=summary([buy,{...buy,id:'2',date:new Date('2025-02-01'),side:'Sell',quantity:4,value:80},{...buy,id:'3',date:new Date('2025-03-01'),side:'Sell',quantity:6,value:120}])[0];
 assert.equal(r.capitalGains,100); assert.deepEqual(r.issues,[]);
});
test('deducts fees converted in the currency of each trade',()=>{
 const r=summary([{...buy,currency:'USD',eurValue:90,fees:10},{...buy,id:'2',date:new Date('2025-02-01'),side:'Sell',currency:'USD',value:200,eurValue:180,fees:10}])[0];
 assert.equal(r.capitalGains,72);
});
test('unknown buy costs are not skipped when matching subsequent sales',()=>{
 const r=summary([{...buy,currency:'USD'}, {...buy,id:'2'}, {...buy,id:'3',side:'Sell',date:new Date('2025-02-01'),value:200}])[0];
 assert.equal(r.capitalGains,0);assert.ok(r.issues.length);
});
test('same-date buys precede sells',()=>assert.equal(summary([{...buy,id:'0',side:'Sell',value:150},buy])[0].capitalGains,50));
test('unmatched sales and internal transfers require review',()=>{
 assert.ok(summary([{...buy,side:'Sell'}])[0].issues.length);
 assert.ok(summary([{...buy,type:' InternalTransfer '}])[0].issues.length);
});
test('paid expenses reduce total income even when they precede income',()=>{
 const data=buildAnnualTaxSummary({trades:[],taxReturns:[],salaries:[],projects:[{entries:[{date:new Date('2025-01-01'),type:'EXPENSE',amount:100,paymentStatus:'PAID'},{date:new Date('2025-02-01'),type:'INCOME',amount:500,paymentStatus:'PAID'}]}]})[0];
 assert.equal(data.totalIncome,400); assert.equal(data.selfEmploymentIncome,400);
});
test('latest filed version wins, excluding drafts and other countries',()=>{
 const base={taxYear:2025,country:'Spain',status:'Filed',updatedAt:new Date('2025-01-01'),totalIncome:40000,taxPaid:5000,finalTaxResult:100};
 const r=buildAnnualTaxSummary({trades:[],salaries:[],projects:[],taxReturns:[base,{...base,status:'Amended',updatedAt:new Date('2025-02-01'),totalIncome:42000,finalTaxResult:200},{...base,status:'Draft',updatedAt:new Date('2025-03-01'),totalIncome:99999},{...base,country:'France',updatedAt:new Date('2025-04-01'),totalIncome:99999}]})[0];
 assert.equal(r.totalIncome,42000);assert.equal(r.taxPaid,5000);assert.equal(r.finalTaxResult,200);assert.equal(r.operationalTaxPaid,0);
});
test('in-kind labels alone do not establish a fiscal exemption',()=>{
 const r=buildAnnualTaxSummary({trades:[],projects:[],taxReturns:[],salaries:[{date:new Date('2025-01-01'),grossSalary:3000,notes:null,breakdown:[{type:'payment',concept:'Retribución flexible',amount:300}]}]})[0];
 assert.equal(r.employmentIncome,3000);assert.ok(r.issues.length);
});
