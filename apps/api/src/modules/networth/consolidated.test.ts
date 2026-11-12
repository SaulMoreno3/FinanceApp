import test from 'node:test';
import assert from 'node:assert/strict';
import { consolidatedValues } from './consolidated';
test('consolidates balances and market value, subtracts debt once, keeps other currencies separate', () => {
 const r=consolidatedValues({EUR:1000,USD:50},[{currency:'EUR',balance:'200.10',balanceUpdatedAt:new Date('2026-09-02')},{currency:'USD',balance:30,balanceUpdatedAt:null}],{marketValue:400,date:new Date('2026-09-03'),hasEstimates:true},100);
 assert.equal(r.totalCurrentNetWorth,1500.1);assert.equal(r.totalAssets,1600.1);assert.equal(r.totalsByCurrency.USD,80);assert.equal(r.sources.portfolioDate,'2026-09-03');assert.equal(r.sources.portfolioEstimated,true);
});
test('includes a reconciled flexible monetary fund once as a liquid asset',()=>{
 const r=consolidatedValues({EUR:1000},[{currency:'EUR',balance:200,balanceUpdatedAt:new Date('2026-09-02')}],undefined,100,4500);
 assert.equal(r.totalAssets,5700);assert.equal(r.totalCurrentNetWorth,5600);assert.equal(r.sources.flexibleFunds,4500);
});
test('empty users do not inherit the virtual fund; missing balances remain visible; overdrafts reduce wealth',()=>{
 assert.equal(consolidatedValues({},[],undefined,0).totalCurrentNetWorth,0);
 const r=consolidatedValues({},[{currency:'EUR',balance:null,balanceUpdatedAt:null},{currency:'EUR',balance:-50,balanceUpdatedAt:null}],undefined,0);
 assert.equal(r.totalCurrentNetWorth,-50);assert.equal(r.sources.missingBankBalances,1);assert.equal(r.sources.bankUpdatedAt,null);
});
