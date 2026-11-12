import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { prisma } from '../../common/db/prisma';
import pool from '../../common/db/client';
import { expensesService } from './expenses.service';
import { localDay } from './expenses.calculations';
import { planningService } from '../planning/planning.service';
test('confirmed Wallet receipts, unknown funding, flexible balances and category association are independent',{skip:process.env.EXPENSES_INTEGRATION!=='true'},async()=>{
 assert.equal(process.env.DB_NAME,'financeapp_expenses_test');assert.equal(process.env.DB_PORT,'55449');
 const user=await prisma.user.create({data:{email:`confirmed-${randomUUID()}@example.invalid`,passwordHash:'unused'}});
 try{
  const today=localDay(new Date()),month=today.slice(0,7),yesterday=localDay(new Date(Date.now()-86400000));
  const conn=await prisma.bankConnection.create({data:{userId:user.id,provider:'test',status:'CONNECTED'}});
  await prisma.bankAccount.create({data:{userId:user.id,connectionId:conn.id,providerAccountId:randomUUID(),currency:'EUR',balance:1000,balanceUpdatedAt:new Date()}});
  const credit=await expensesService.createCard(user.id,{name:'Credit',kind:'CREDIT',currency:'EUR',openingBalance:0,openingDate:yesterday,dueDay:1});
  const key=await expensesService.createToken(user.id,credit.id,'Wallet','WALLET');
  const event={eventId:randomUUID(),date:new Date().toISOString(),amount:5.55,currency:'EUR',merchant:'Rua Torres Quevedo',card:'Tarjeta Pluxee',type:'PURCHASE' as const};
  const capture=await expensesService.capture(key.token,event);assert.equal(capture.status,'RECORDED');assert.equal(capture.needsCardLink,true);
  let overview=await expensesService.overview(user.id,month);assert.equal(overview.spent,5.55);assert.equal(overview.personalSpent,0);assert.equal(overview.flexibleSpent,5.55);assert.equal(overview.unconfirmed,0);assert.equal(overview.finances.available,1000);
  const unknown=await expensesService.capture(key.token,{...event,eventId:randomUUID(),card:'Visa unknown',merchant:'Parking',amount:2.85});
  overview=await expensesService.overview(user.id,month);assert.equal(overview.spent,8.4);assert.equal(overview.personalSpent,2.85);assert.equal(overview.finances.available,997.15);assert.equal(overview.finances.unassigned,2.85);assert.equal(overview.credit.amount,0);
  const plan=await planningService.overview(user.id,month);assert.equal(plan.liquidity.available,overview.finances.available);assert.equal(plan.analysis.spent,2.85);
  await expensesService.setCategory(user.id,{id:capture.id,category:'Comida del trabajo',remember:true});
  const flexible=await expensesService.createCard(user.id,{name:'Pluxee',kind:'FLEXIBLE',currency:'EUR',openingBalance:100,openingDate:yesterday,dueDay:1});
  await expensesService.linkWalletCard(user.id,capture.walletCardId!,flexible.id);
  overview=await expensesService.overview(user.id,month);assert.equal(overview.spent,8.4);assert.equal(overview.cards.find(c=>c.id===flexible.id)!.remaining,94.45);assert.equal(overview.transactions.find(e=>e.merchantName===event.merchant)!.displayCategory,'Comida del trabajo');assert.equal(overview.credit.amount,0);
  const topup={eventId:randomUUID(),date:today,amount:20};await expensesService.topUpFlexible(user.id,flexible.id,topup);assert.equal((await expensesService.topUpFlexible(user.id,flexible.id,topup)).duplicate,true);
  overview=await expensesService.overview(user.id,month);assert.equal(overview.cards.find(c=>c.id===flexible.id)!.remaining,114.45);assert.equal(overview.spent,8.4);assert.equal(overview.finances.available,997.15);assert.equal(overview.transactions.some(e=>e.kind==='INCOME'),false);
  assert.equal((await expensesService.financialMovements(user.id)).some(e=>e.funding==='FLEXIBLE'),false);
  await expensesService.linkWalletCard(user.id,unknown.walletCardId!,credit.id);overview=await expensesService.overview(user.id,month);assert.equal(overview.spent,8.4);assert.equal(overview.finances.available,997.15);assert.equal(overview.finances.unassigned,0);assert.equal(overview.credit.amount,2.85);
  assert.equal((await expensesService.capture(key.token,event)).duplicate,true);
  await expensesService.importCsv(user.id,flexible.id,`date,description,amount,id\n${today},Rua Torres Quevedo,-5.55,pluxee-original`);overview=await expensesService.overview(user.id,month);assert.equal(overview.spent,8.4);assert.equal(overview.transactions.filter(e=>e.merchantName===event.merchant).length,1);assert.equal(overview.cards.find(c=>c.id===flexible.id)!.remaining,114.45);
 }finally{await prisma.user.delete({where:{id:user.id}});await prisma.$disconnect();await pool.end();}
});
