import assert from 'node:assert/strict';
import test from 'node:test';
import { categorySuggestion } from './expenses.categories';
import { availableMoney, spendingInsights } from './expenses.insights';
const row=(id:string,date:string,amount:number,displayCategory='Restaurantes',funding='PERSONAL')=>({id,date,amount,displayCategory,funding,kind:'EXPENSE'});
test('categorization respects source/manual categories and leaves opaque merchants/person transfers unknown',()=>{
 for(const merchant of ['Costco Wholesale Spain','Ah Strijp','Rewe Richrath'])assert.equal(categorySuggestion(merchant,'PURCHASE').category,'Supermercado');
 assert.equal(categorySuggestion('Parkin Plaza San Francisc').category,'Aparcamiento');
 assert.equal(categorySuggestion('Openai *chatgpt Subscr').category,'Suscripciones');
 assert.equal(categorySuggestion('Mc Donalds Demer').category,'Restaurantes');
 assert.equal(categorySuggestion('Mercadona','Mi categoría propia').category,'Mi categoría propia');
 for(const name of ['Bizum payment to: Ana','To MARCOS GARCIA','Paypal *paypal','Sumup *adan','Opaque business'])assert.equal(categorySuggestion(name).confidence,'UNKNOWN');
 assert.equal(categorySuggestion('Rua Torres Quevedo',null,'FLEXIBLE').category,'Restaurantes');
 assert.equal(categorySuggestion('ES Onlinecv.es','OTHER').category,'Suscripciones');
});
test('consumption includes flexible funds, while cash spending excludes them and refunds reduce both',()=>{
 const data=spendingInsights([row('a','2026-11-10',-30),row('b','2026-11-10',-5,'Restaurantes','FLEXIBLE'),row('c','2026-11-11',2,'Restaurantes','FLEXIBLE'),row('d','2026-11-10',-4,'Sin categoría','UNASSIGNED')],'2026-11','2026-11-11',[]);
 assert.equal(data.spent,37);assert.equal(data.personalSpent,34);assert.equal(data.flexibleSpent,3);assert.equal(data.unallocatedSpent,4);assert.equal(data.categorization.uncategorized,1);
});
test('current month compares the same elapsed dates, historical months compare complete months',()=>{
 const rows=[row('a','2026-11-10',-20),row('b','2026-10-10',-10),row('c','2026-10-20',-80),row('d','2026-09-25',-50)];
 const current=spendingInsights(rows,'2026-11','2026-11-11',[]);assert.equal(current.comparison.previousSpent,10);assert.equal(current.comparison.percent,100);
 const old=spendingInsights(rows,'2026-10','2026-11-11',[]);assert.equal(old.comparison.previousSpent,50);assert.equal(old.comparison.sameElapsedDays,false);
});
test('budget suggestions require historical evidence, retain zero-spend months, and never replace set limits',()=>{
 const rows=[row('a','2026-10-10',-40),row('b','2026-09-10',-30),row('c','2026-08-10',-100,'Viajes')];
 const data=spendingInsights(rows,'2026-11','2026-11-11',[{category:'Restaurantes',amount:50}]);
 assert.equal(data.categories[0].suggestedBudget,30);assert.equal(data.categories[0].budget,50);assert.equal(data.categories[0].remaining,50);
 assert.equal(spendingInsights([rows[0]],'2026-11','2026-11-11',[{category:'Restaurantes',amount:50}]).categories[0].suggestedBudget,null);
});
test('available money deducts known credit, unreflected debits, unassigned receipts, commitments and reserve once',()=>{
 const result=availableMoney({bank:1000,monetaryFunds:200,credit:100,unreflectedDebits:10,unassigned:5,committed:200,reserve:50,unknownBalances:0,staleAccounts:0});
 assert.equal(result.available,835);assert.equal(result.estimated,true);
 assert.equal(availableMoney({...result,unassigned:0}).estimated,false);
});
