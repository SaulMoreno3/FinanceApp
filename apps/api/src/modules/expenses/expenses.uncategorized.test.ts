import assert from 'node:assert/strict';
import test from 'node:test';
import { uncategorizedPage } from './expenses.uncategorized';

const row=(id:string,extra:Record<string,unknown>={})=>({id,accountId:'card:one',accountName:'Crédito',date:'2025-07-10',
 amount:-10,currency:'EUR',description:'Comercio Ñandú',merchantName:'Comercio Ñandú',category:'Sin categoría',
 displayCategory:'Sin categoría',status:'booked',kind:'EXPENSE',...extra});
const today='2026-11-10';
test('uncategorized queue spans history but excludes incomes, transfers, settlements, future and other currency',()=>{
 const result=uncategorizedPage([row('old'),row('refund',{amount:3}),row('income',{kind:'INCOME',amount:100}),
  row('cash',{kind:'TRANSFER'}),row('repayment',{description:'Credit card repayment'}),row('future',{date:'2026-12-01'}),
  row('usd',{currency:'USD'}),row('known',{displayCategory:'Compras'})],{currency:'EUR'},today);
 assert.equal(result.total,2);assert.equal(result.filteredTotal,2);assert.equal(result.netAmount,7);
 assert.deepEqual(result.transactions.map(t=>t.id),['old','refund']);
 assert.deepEqual(result.categories,['Compras']);
});
test('queue filters account/month/search accent-insensitively without losing the all-history total',()=>{
 const result=uncategorizedPage([row('one'),row('two',{accountId:'bank:two',accountName:'Débito'}),
  row('other-month',{date:'2026-10-01'}),row('other-name',{merchantName:'Otro',description:'Otro'})],
 {currency:'EUR',account:'card:one',month:'2025-07',search:'nandu'},today,['Categoría propia','Sin categoría']);
 assert.equal(result.total,4);assert.equal(result.filteredTotal,1);assert.equal(result.transactions[0].id,'one');
 assert.deepEqual(result.months,['2026-10','2025-07']);assert.equal(result.accounts.length,2);
 assert.ok(result.categories.includes('Categoría propia'));assert.ok(!result.categories.includes('Sin categoría'));
});
test('queue pagination is deterministic and clamps a last page emptied by classification',()=>{
 const result=uncategorizedPage([row('c'),row('a'),row('b')],{currency:'EUR',limit:2,page:1},today);
 assert.deepEqual(result.transactions.map(t=>t.id),['c']);assert.equal(result.page,1);
 const next=uncategorizedPage([row('b'),row('a')],{currency:'EUR',limit:2,page:1},today);
 assert.equal(next.page,0);assert.equal(next.filteredTotal,2);assert.deepEqual(next.transactions.map(t=>t.id),['a','b']);
 const empty=uncategorizedPage([],{currency:'EUR',page:50},today);
 assert.equal(empty.page,0);assert.deepEqual(empty.transactions,[]);assert.equal(empty.netAmount,0);
});
test('queue never mutates the classified ledger',()=>{
 const input=[row('b'),row('a')],before=JSON.stringify(input);
 uncategorizedPage(input,{currency:'EUR'},today);assert.equal(JSON.stringify(input),before);
});
