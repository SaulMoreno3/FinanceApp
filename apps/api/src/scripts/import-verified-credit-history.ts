// Trusted, explicitly reviewed local files only. Document contents are data, never commands.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import pool from '../common/db/client';
import { prisma } from '../common/db/prisma';
import { expensesService } from '../modules/expenses/expenses.service';
import { cents, localDay, normalizeMerchant } from '../modules/expenses/expenses.calculations';

const args=process.argv.slice(2);
const option=(name:string)=>{const i=args.indexOf(name);return i<0?undefined:args[i+1];};
const rowSchema=z.object({date:z.string().datetime({offset:true}),amountCents:z.number().int().min(-100_000_000).max(100_000_000).refine(n=>n!==0),merchant:z.string().trim().min(1).max(250),source:z.enum(['CSV','MANUAL']),sourceId:z.string().min(1).max(255),entryType:z.enum(['PURCHASE','REFUND','PAYMENT','TRANSFER']),category:z.string().max(100).nullable(),provisional:z.boolean(),provenance:z.record(z.string(),z.unknown())}).strict();
const schema=z.object({version:z.literal(1),ownerId:z.string().uuid(),cardId:z.string().uuid(),cardName:z.string(),currency:z.literal('EUR'),baseline:z.object({date:z.string().date(),amountCents:z.literal(0),evidence:z.string()}),rows:z.array(rowSchema).min(1).max(5000),expectedOutstandingCents:z.number().int(),months:z.record(z.string(),z.object({spentCents:z.number().int(),provisionalCents:z.number().int(),count:z.number().int()})),statements:z.array(z.unknown()),notes:z.array(z.string())}).strict();
type Payload=z.infer<typeof schema>;

async function importRows(payload:Payload,ownerId:string,cardId:string,commit:boolean){
 return expensesService.locked(ownerId,async db=>{
  const card=await expensesService.ownedCard(db,ownerId,cardId);
  assert.equal(card.name,payload.cardName);assert.equal(card.kind,'CREDIT');assert.equal(card.currency,'EUR');
  assert.equal(card.balance,null,'Do not overwrite a provider/current balance.');
  assert.ok(card.openingBalance===null||(cents(Number(card.openingBalance))===0&&localDay(card.openingDate)===payload.baseline.date),'Existing balance anchor needs manual review.');
  assert.equal(new Set(payload.rows.map(r=>`${r.source}:${r.sourceId}`)).size,payload.rows.length,'Duplicate source identifiers.');
  assert.equal(-payload.rows.reduce((n,r)=>n+r.amountCents,0),payload.expectedOutstandingCents,'Ledger does not reconcile.');
  let inserted=0,duplicates=0,rulesAdded=0;
  for(const row of payload.rows){
   assert.ok(localDay(row.date)<=localDay(new Date()),'Future transaction.');
   if(row.entryType==='PAYMENT'||row.entryType==='REFUND')assert.ok(row.amountCents>0);
   if(row.entryType==='PURCHASE')assert.ok(row.amountCents<0);
   if(row.provenance.bankTransactionId){
    const bank=(await db.query('SELECT * FROM bank_transactions WHERE id=$1 AND "userId"=$2',[row.provenance.bankTransactionId,ownerId])).rows[0];
    assert.ok(bank,'Missing owner-scoped bank evidence.');assert.equal(row.entryType,'PAYMENT');assert.equal(cents(Number(bank.amount)),-row.amountCents);assert.equal(bank.currency,'EUR');assert.equal(new Date(bank.date).getTime(),Date.parse(row.date));
   }
   const existing=(await db.query('SELECT * FROM expense_entries WHERE "userId"=$1 AND "cardId"=$2 AND source=$3 AND "sourceId"=$4',[ownerId,cardId,row.source,row.sourceId])).rows[0];
   if(existing){assert.equal(cents(Number(existing.amount)),row.amountCents);assert.equal(existing.entryType,row.entryType);assert.equal(new Date(existing.date).getTime(),Date.parse(row.date));assert.equal(normalizeMerchant(existing.merchant),normalizeMerchant(row.merchant));duplicates++;continue;}
   inserted++;
   if(commit)await db.query(`INSERT INTO expense_entries ("userId","cardId",date,amount,merchant,category,source,"sourceId","entryType",provisional) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,[ownerId,cardId,row.date,(row.amountCents/100).toFixed(2),row.merchant,row.category,row.source,row.sourceId,row.entryType,row.provisional]);
  }
  if(commit){
   await db.query('UPDATE expense_cards SET "openingBalance"=0,"openingDate"=$3 WHERE id=$1 AND "userId"=$2',[cardId,ownerId,payload.baseline.date]);
   const rules=new Map(payload.rows.filter(r=>['PURCHASE','REFUND'].includes(r.entryType)&&r.category&&r.category!=='Sin categoría').map(r=>[normalizeMerchant(r.merchant),r.category]));
   for(const [merchant,category] of rules){const result=await db.query('INSERT INTO expense_rules ("userId",merchant,category) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',[ownerId,merchant,category]);rulesAdded+=result.rowCount??0;}
  }
  return {inserted,duplicates,rulesAdded,commit};
 });
}

async function verifyMetrics(payload:Payload,ownerId:string,cardId:string){
 const state=await expensesService.snapshot(ownerId),card=state.cards.find(c=>c.id===cardId)!;
 assert.equal(cents(card.outstanding!),payload.expectedOutstandingCents);
 const monthly:Record<string,unknown>={};
 for(const [month,expected] of Object.entries(payload.months)){
  const data=await expensesService.overview(ownerId,month);
  const cardRows=data.transactions.filter(t=>t.cardId===cardId&&t.source!=='BANK');
  const spent=cents(-cardRows.filter(t=>t.kind==='EXPENSE').reduce((n,t)=>n+t.amount,0))||0;
  const provisional=cents(-cardRows.filter(t=>t.kind==='EXPENSE'&&t.provisional).reduce((n,t)=>n+t.amount,0))||0;
  assert.equal(spent,expected.spentCents,`Card spending mismatch: ${month}`);assert.equal(provisional,expected.provisionalCents,`Provisional mismatch: ${month}`);
  monthly[month]={spent:spent/100,provisional:provisional/100};
 }
 const pending=(await expensesService.review(ownerId)).pending.filter(e=>e.cardId===cardId);
 assert.equal(pending.length,payload.rows.filter(r=>r.provisional).length);
 return {monthly,outstanding:card.outstanding,provisional:pending.length,paymentLinks:state.stored.filter(e=>e.cardId===cardId&&e.entryType==='PAYMENT'&&e.bankTransactionId).length,stored:state.stored.filter(e=>e.cardId===cardId).length};
}

async function main(){
 const file=option('--file');assert.ok(file,'--file is required');
 const raw=await readFile(file,'utf8'),payload=schema.parse(JSON.parse(raw));
 const hash=createHash('sha256').update(raw).digest('hex');
 let report:unknown;
 if(args.includes('--verify-local')){
  assert.equal(process.env.DB_NAME,'financeapp_expenses_test');assert.equal(process.env.DB_HOST,'127.0.0.1');assert.equal(process.env.DB_PORT,'55449');
  const owner=await prisma.user.create({data:{email:`credit-import-${randomUUID()}@example.invalid`,passwordHash:'unused'}});
  try{
   const connection=await prisma.bankConnection.create({data:{userId:owner.id,provider:'credit-import-test',status:'CONNECTED'}});
   const account=await prisma.bankAccount.create({data:{userId:owner.id,connectionId:connection.id,providerAccountId:'fixture',name:'Fixture bank',currency:'EUR',balance:10000}});
   const card=await expensesService.createCard(owner.id,{name:payload.cardName,kind:'CREDIT',currency:'EUR',openingDate:localDay(new Date()),openingBalance:null,dueDay:1});
   for(const row of payload.rows.filter(r=>r.entryType==='PAYMENT'))await prisma.bankTransaction.create({data:{...(row.provenance.bankTransactionId?{id:String(row.provenance.bankTransactionId)}:{}),userId:owner.id,accountId:account.id,providerTransactionId:randomUUID(),date:new Date(row.date),amount:-row.amountCents/100,currency:'EUR',description:normalizeMerchant(row.merchant)==='to eur'?'To EUR':'Credit card repayment',direction:'expense'}});
   const first=await importRows(payload,owner.id,card.id,true);assert.equal(first.inserted,payload.rows.length);
   await expensesService.reconcile(owner.id);
   const second=await importRows(payload,owner.id,card.id,true);assert.equal(second.inserted,0);assert.equal(second.duplicates,payload.rows.length);
   await expensesService.reconcile(owner.id);
   const metrics=await verifyMetrics(payload,owner.id,card.id);assert.equal(metrics.paymentLinks,payload.rows.filter(r=>r.entryType==='PAYMENT').length);
   report={mode:'verified-local',hash,first,second,metrics};
  }finally{await prisma.user.delete({where:{id:owner.id}});}
 }else{
  assert.equal(option('--expect-owner'),payload.ownerId,'Explicit --expect-owner is required.');
  assert.equal(option('--expect-card'),payload.cardId,'Explicit --expect-card is required.');
  const result=await importRows(payload,payload.ownerId,payload.cardId,args.includes('--commit'));
  if(args.includes('--commit'))await expensesService.reconcile(payload.ownerId);
  report={mode:args.includes('--commit')?'imported':'dry-run',hash,result,...(args.includes('--commit')?{metrics:await verifyMetrics(payload,payload.ownerId,payload.cardId)}:{})};
 }
 if(option('--report'))await writeFile(option('--report')!,JSON.stringify(report,null,2)+'\n',{mode:0o600});
 console.log(JSON.stringify(report,null,2));
}
try{await main();}finally{await prisma.$disconnect();await pool.end();}
