import assert from 'node:assert/strict';
import { expensesService } from '../modules/expenses/expenses.service';
import { localDay } from '../modules/expenses/expenses.calculations';
import pool from '../common/db/client';

// Explicit, owner-scoped setup. No token, balance or salary-derived recharge is invented.
const args=process.argv.slice(2),owner=args[args.indexOf('--owner')+1],commit=args.includes('--commit');
assert.ok(args.includes('--owner')&&/^[a-f0-9-]{36}$/i.test(owner),'--owner UUID required');
try{
 const month=localDay(new Date()).slice(0,7),before=await expensesService.overview(owner,month),actions=[];
 for(const wallet of before.walletCards.filter(w=>/\bpluxee\b/i.test(w.name))){
  if(wallet.cardId){assert.equal(before.cards.find(c=>c.id===wallet.cardId)?.kind,'FLEXIBLE','Existing association is not a flexible card; review manually');continue;}
  const cards=before.cards.filter(c=>c.kind==='FLEXIBLE'&&c.currency===wallet.currency&&/pluxee/i.test(c.name));
  assert.ok(cards.length<=1,'Several possible Pluxee cards; refusing ambiguous association');
  let cardId=cards[0]?.id;
  if(commit){
   if(!cardId){const card=await expensesService.createCard(owner,{name:'Pluxee · Retribución flexible',kind:'FLEXIBLE',currency:wallet.currency,openingBalance:null,openingDate:'2000-01-01',dueDay:1});cardId=card.id;}
   const result=await expensesService.linkWalletCard(owner,wallet.id,cardId!);
   actions.push({walletId:wallet.id,cardId,associated:result.recorded});
  }else actions.push({walletId:wallet.id,existingCardId:cardId??null,receipts:wallet.pending,willCreate:!cardId});
 }
 const after=await expensesService.overview(owner,month);
 console.log(JSON.stringify({mode:commit?'committed':'preview',owner,actions,before:{spent:before.spent,flexible:before.flexibleSpent,credit:before.credit.amount},after:{spent:after.spent,flexible:after.flexibleSpent,credit:after.credit.amount,quality:after.quality},unknownPluxeeBalance:after.cards.filter(c=>c.kind==='FLEXIBLE'&&c.remaining===null).length},null,2));
}finally{await pool.end();}
