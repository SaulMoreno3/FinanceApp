import { createHash, randomBytes } from 'node:crypto';
import type { PoolClient } from 'pg';
import pool from '../../common/db/client';
import { classify, iso, plusDays, recurringDate, type Movement } from '../planning/planning.calculations';
import { planSchema } from '../planning/planning.schema';
import { cents, isCardRepayment, isProvisionalEntry, isCaptureEntry, localDay, money, normalizeMerchant, normalizeWalletCard, parseStatementCsv, uniqueCaptureMatch, type Entry } from './expenses.calculations';
import { uncategorizedPage, type UncategorizedFilters } from './expenses.uncategorized';
import { categorySuggestion } from './expenses.categories';
import { spendingInsights, availableMoney } from './expenses.insights';
import { FLEXIBLE_FUNDS_OPENING_BALANCE } from '../bank-sync/bank-transfer';

export class ExpenseError extends Error { constructor(public statusCode:number,message:string){super(message);} }
type Card = {id:string;name:string;kind:'CREDIT'|'DEBIT'|'FLEXIBLE';currency:string;bankAccountId:string|null;openingBalance:string|null;openingDate:Date;dueDay:number;balance:string|null;balanceAt:Date|null;providerCardId:string|null};
type StoredEntry = Entry & {userId:string;category:string|null;categoryOverride:string|null;currency:string;cardKind:string;cardName:string};
type Statement = {id:string;cardId:string;startDate:Date;endDate:Date;dueDate:Date;amount:string;bankTransactionId:string|null};
type WalletCapture = {id:string;eventId:string;date:Date|string;amount:number|string;merchant:string;entryType:'PURCHASE'|'REFUND';expenseEntryId:string|null;categoryOverride?:string|null;excluded?:boolean};
type CaptureResult = {id:string;duplicate:boolean;status:'RECORDED';card:string;cardId:string|null;walletCardId:string|null;needsCardLink?:boolean};
const hashToken=(token:string)=>createHash('sha256').update(token).digest('hex');
// A linked repayment still reduces the card's debt; a linked debit purchase must not count twice.
const activeEntry=(e:Entry)=>!e.excluded&&!e.matchedEntryId&&(!e.bankTransactionId||e.entryType==='PAYMENT');
// pg parses DATE at local midnight; converting that to UTC can move it to yesterday.
const asDay=(d:Date|string)=>localDay(d);
const serializeEntry=(e:any):StoredEntry=>({...e,date:new Date(e.date).toISOString(),amount:Number(e.amount)});

export class ExpensesService {
 async locked<T>(userId:string,fn:(db:PoolClient)=>Promise<T>) {
  const db=await pool.connect();
  try {await db.query('BEGIN');await db.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`expenses:${userId}`]);const result=await fn(db);await db.query('COMMIT');return result;}
  catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
 }
 async ownedCard(db:PoolClient,userId:string,id:string) {
  const result=await db.query<Card>('SELECT * FROM expense_cards WHERE id=$1 AND "userId"=$2',[id,userId]);
  if(!result.rows[0])throw new ExpenseError(404,'Tarjeta no encontrada.');return result.rows[0];
 }
 async createCard(userId:string,body:{name:string;kind:string;currency:string;bankAccountId?:string|null;openingBalance?:number|null;openingDate:string;dueDay:number}) {
  return this.locked(userId,async db=>{
   if(body.bankAccountId){const account=await db.query('SELECT id FROM bank_accounts WHERE id=$1 AND "userId"=$2 AND currency=$3',[body.bankAccountId,userId,body.currency]);if(!account.rowCount)throw new ExpenseError(400,'La cuenta bancaria no pertenece a tu usuario o tiene otra divisa.');}
   if(body.kind==='DEBIT'&&!body.bankAccountId)throw new ExpenseError(400,'Vincula la tarjeta de débito a su cuenta bancaria para evitar duplicados.');
   const result=await db.query(`INSERT INTO expense_cards ("userId",name,kind,currency,"bankAccountId","openingBalance","openingDate","dueDay") VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,[userId,body.name,body.kind,body.currency,body.bankAccountId??null,body.openingBalance??null,body.openingDate,body.dueDay]);return result.rows[0];
  });
 }
 async createToken(userId:string,cardId:string,name:string,scope:'CARD'|'WALLET'='CARD') {
  const token=`fa_exp_${randomBytes(32).toString('base64url')}`;
  return this.locked(userId,async db=>{await this.ownedCard(db,userId,cardId);const result=await db.query('INSERT INTO expense_tokens ("userId","cardId",name,"tokenHash",scope) VALUES ($1,$2,$3,$4,$5) RETURNING id,name,"cardId",scope,"createdAt"',[userId,cardId,name,hashToken(token),scope]);return {...result.rows[0],token};});
 }
 async setTokenScope(userId:string,id:string,scope:'CARD'|'WALLET') {
  return this.locked(userId,async db=>{const result=await db.query('UPDATE expense_tokens SET scope=$3 WHERE id=$1 AND "userId"=$2 AND "revokedAt" IS NULL RETURNING id,scope',[id,userId,scope]);if(!result.rowCount)throw new ExpenseError(404,'Credencial no encontrada.');return result.rows[0];});
 }
 async capture(token:string,input:{eventId:string;date:string;amount:number;currency:string;merchant:string;card?:string;type:'PURCHASE'|'REFUND'}):Promise<CaptureResult> {
  const auth=await pool.query('SELECT "userId","cardId",id FROM expense_tokens WHERE "tokenHash"=$1 AND "revokedAt" IS NULL',[hashToken(token)]);
  const credential=auth.rows[0];if(!credential)throw new ExpenseError(401,'Credencial de captura inválida o revocada.');
  return this.locked(credential.userId,async db=>{
   const valid=await db.query('SELECT * FROM expense_tokens WHERE id=$1 AND "revokedAt" IS NULL FOR UPDATE',[credential.id]);if(!valid.rowCount)throw new ExpenseError(401,'Credencial revocada.');
   // Check the locked scope: neither a label nor a card id can widen a single-card key.
   if(valid.rows[0].scope==='WALLET') {
    if(!input.card)throw new ExpenseError(400,'Esta clave requiere card con el nombre de la tarjeta de Wallet.');
    return this.captureWallet(db,credential.userId,credential.id,input as typeof input & {card:string});
   }
   if(input.card){const alias=(await db.query('SELECT "cardId" FROM expense_wallet_cards WHERE "userId"=$1 AND "walletKey"=$2 AND currency=$3',[credential.userId,normalizeWalletCard(input.card),input.currency])).rows[0];const own=await this.ownedCard(db,credential.userId,credential.cardId);if(alias?alias.cardId!==own.id:normalizeWalletCard(own.name)!==normalizeWalletCard(input.card))throw new ExpenseError(403,'La tarjeta no corresponde a esta clave. Activa «Todas mis tarjetas» para enviar card desde Wallet.');}
   const card=await this.ownedCard(db,credential.userId,credential.cardId);if(card.currency!==input.currency)throw new ExpenseError(400,'La divisa del pago no coincide con la tarjeta. Importa el importe liquidado en su divisa desde el extracto.');
   const amount=input.type==='REFUND'?input.amount:-input.amount;
   const prior=await db.query('SELECT * FROM expense_entries WHERE "cardId"=$1 AND source=$2 AND "sourceId"=$3',[credential.cardId,'APPLE_PAY',input.eventId]);
   if(prior.rows[0]){const p=prior.rows[0];if(cents(Number(p.amount))!==cents(amount)||normalizeMerchant(p.merchant)!==normalizeMerchant(input.merchant)||new Date(p.date).getTime()!==Date.parse(input.date))throw new ExpenseError(409,'Este identificador ya se utilizó para otra compra.');return {id:p.id,duplicate:true,status:'RECORDED',card:card.name,cardId:card.id,walletCardId:null};}
   const result=await db.query(`INSERT INTO expense_entries ("userId","cardId",date,amount,merchant,source,"sourceId","entryType") VALUES ($1,$2,$3,$4,$5,'APPLE_PAY',$6,$7) RETURNING id`,[credential.userId,credential.cardId,input.date,amount,input.merchant,input.eventId,input.type]);
   await db.query('UPDATE expense_tokens SET "lastUsedAt"=now() WHERE id=$1',[credential.id]);
   await this.reconcileIn(db,credential.userId);return {id:result.rows[0].id,duplicate:false,status:'RECORDED',card:card.name,cardId:card.id,walletCardId:null};
  });
 }
 private async captureWallet(db:PoolClient,userId:string,tokenId:string,input:{eventId:string;date:string;amount:number;currency:string;merchant:string;card:string;type:'PURCHASE'|'REFUND'}):Promise<CaptureResult> {
  const wallet=(await db.query(`INSERT INTO expense_wallet_cards ("userId",name,"walletKey",currency) VALUES ($1,$2,$3,$4) ON CONFLICT ("userId","walletKey",currency) DO UPDATE SET "lastSeenAt"=now() RETURNING *`,[userId,input.card,normalizeWalletCard(input.card),input.currency])).rows[0];
  const amount=input.type==='REFUND'?input.amount:-input.amount;
  let capture=(await db.query('SELECT * FROM expense_wallet_captures WHERE "walletCardId"=$1 AND "eventId"=$2',[wallet.id,input.eventId])).rows[0];
  const duplicate=Boolean(capture);
  if(capture&&(cents(Number(capture.amount))!==cents(amount)||normalizeMerchant(capture.merchant)!==normalizeMerchant(input.merchant)||new Date(capture.date).getTime()!==Date.parse(input.date)||capture.entryType!==input.type))throw new ExpenseError(409,'Este identificador ya se utilizó para otra compra de esta tarjeta.');
  if(!capture)capture=(await db.query(`INSERT INTO expense_wallet_captures ("userId","walletCardId","eventId",date,amount,merchant,"entryType") VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,[userId,wallet.id,input.eventId,input.date,amount,input.merchant,input.type])).rows[0];
  if(wallet.cardId&&!capture.expenseEntryId){await this.materializeWalletCapture(db,userId,wallet.cardId,capture);await this.reconcileIn(db,userId);}
  await db.query('UPDATE expense_tokens SET "lastUsedAt"=now() WHERE id=$1',[tokenId]);
  return {id:capture.expenseEntryId??capture.id,duplicate,status:'RECORDED',needsCardLink:!wallet.cardId,card:wallet.name,cardId:wallet.cardId,walletCardId:wallet.id};
 }
 private async materializeWalletCapture(db:PoolClient,userId:string,cardId:string,capture:WalletCapture) {
  // The inbox id is immutable even when the human-readable Wallet name changes.
  // A retry after upgrading a legacy key can add card to an already recorded event.
  let entry=(await db.query(`SELECT * FROM expense_entries WHERE "userId"=$1 AND "cardId"=$2 AND source='APPLE_PAY' AND "sourceId"=$3`,[userId,cardId,capture.eventId])).rows[0];
  if(entry){if(cents(Number(entry.amount))!==cents(Number(capture.amount))||new Date(entry.date).getTime()!==new Date(capture.date).getTime()||normalizeMerchant(entry.merchant)!==normalizeMerchant(capture.merchant)||entry.entryType!==capture.entryType)throw new ExpenseError(409,'El identificador coincide con una captura anterior de otros datos.');const taken=await db.query('SELECT id FROM expense_wallet_captures WHERE "expenseEntryId"=$1 AND id<>$2',[entry.id,capture.id]);if(taken.rowCount)throw new ExpenseError(409,'La captura anterior ya está asociada a otro nombre de Wallet.');}
  else entry=(await db.query(`INSERT INTO expense_entries ("userId","cardId",date,amount,merchant,source,"sourceId","entryType") VALUES ($1,$2,$3,$4,$5,'APPLE_PAY',$6,$7) RETURNING id`,[userId,cardId,capture.date,capture.amount,capture.merchant,capture.id,capture.entryType])).rows[0];
  await db.query('UPDATE expense_wallet_captures SET "expenseEntryId"=$2 WHERE id=$1',[capture.id,entry.id]);capture.expenseEntryId=entry.id;
  if(capture.categoryOverride)await db.query('UPDATE expense_entries SET "categoryOverride"=COALESCE("categoryOverride",$2) WHERE id=$1',[entry.id,capture.categoryOverride]);
  if(capture.excluded)await db.query('UPDATE expense_entries SET excluded=true WHERE id=$1',[entry.id]);
 }
 async linkWalletCard(userId:string,walletId:string,cardId:string) {
  return this.locked(userId,async db=>{
   const wallet=(await db.query('SELECT * FROM expense_wallet_cards WHERE id=$1 AND "userId"=$2',[walletId,userId])).rows[0];if(!wallet)throw new ExpenseError(404,'Tarjeta de Wallet no encontrada.');
   const card=await this.ownedCard(db,userId,cardId);if(card.currency!==wallet.currency)throw new ExpenseError(400,'La tarjeta y los pagos deben tener la misma divisa.');
   if(wallet.cardId&&wallet.cardId!==cardId)throw new ExpenseError(409,'Esta tarjeta de Wallet ya está vinculada. Revisa sus movimientos antes de cambiarla.');
   await db.query('UPDATE expense_wallet_cards SET "cardId"=$3 WHERE id=$1 AND "userId"=$2',[walletId,userId,cardId]);
   const pending=(await db.query('SELECT * FROM expense_wallet_captures WHERE "walletCardId"=$1 AND "userId"=$2 AND "expenseEntryId" IS NULL ORDER BY date,id',[walletId,userId])).rows;
   for(const capture of pending)await this.materializeWalletCapture(db,userId,cardId,capture);
   await this.reconcileIn(db,userId);return {ok:true,recorded:pending.length,cardId};
  });
 }
 async reconcile(userId:string){return this.locked(userId,db=>this.reconcileIn(db,userId));}
 private async reconcileIn(db:PoolClient,userId:string) {
  await db.query(`UPDATE expense_entries a SET "matchedEntryId"=NULL FROM expense_entries b WHERE a."userId"=$1 AND a."matchedEntryId"=b.id AND (b.excluded OR a.amount<>b.amount OR a."cardId"<>b."cardId" OR a."entryType"<>b."entryType")`,[userId]);
  await db.query(`UPDATE expense_entries a SET "bankTransactionId"=NULL FROM bank_transactions b WHERE a."userId"=$1 AND a."bankTransactionId"=b.id AND ((CASE WHEN a."entryType"='PAYMENT' THEN -a.amount ELSE a.amount END)<>b.amount OR lower(b.status)<>'booked')`,[userId]);
  const cards=(await db.query<Card>('SELECT * FROM expense_cards WHERE "userId"=$1',[userId])).rows;
  const entries=(await db.query(`SELECT e.*,c.currency,c.kind AS "cardKind",c.name AS "cardName" FROM expense_entries e JOIN expense_cards c ON c.id=e."cardId" WHERE e."userId"=$1 ORDER BY e.date,e.id`,[userId])).rows.map(serializeEntry);
  let matched=0;
  // Only unambiguous one-to-one pairs. Similar purchases remain visible for review.
  const official=entries.filter(e=>activeEntry(e)&&!isProvisionalEntry(e)&&['CSV','TRUELAYER'].includes(e.source));
  const csvTargets=new Set(entries.filter(e=>e.source==='CSV'&&e.matchedEntryId).map(e=>e.matchedEntryId));
  for(const e of official.filter(e=>e.source==='CSV')){const candidate=uniqueCaptureMatch(e,official.filter(o=>o.source==='TRUELAYER'&&!csvTargets.has(o.id)));if(!candidate)continue;
   if(official.filter(o=>o.source==='CSV'&&activeEntry(o)&&uniqueCaptureMatch(o,[candidate])).length!==1)continue;
   await db.query('UPDATE expense_entries SET "matchedEntryId"=$2 WHERE id=$1',[e.id,candidate.id]);
   if(e.categoryOverride&&!candidate.categoryOverride)await db.query('UPDATE expense_entries SET "categoryOverride"=$2 WHERE id=$1',[candidate.id,e.categoryOverride]);
   e.matchedEntryId=candidate.id;csvTargets.add(candidate.id);matched++;
  }
  const terminal=(id:string)=>{let row=entries.find(e=>e.id===id);for(let n=0;n<entries.length&&row?.matchedEntryId;n++)row=entries.find(e=>e.id===row!.matchedEntryId);return row?.id??id;};
  const captureTargets=new Set(entries.filter(e=>isCaptureEntry(e)&&e.matchedEntryId).map(e=>terminal(e.matchedEntryId!)));
  const captures=entries.filter(e=>activeEntry(e)&&isCaptureEntry(e));
  for(const e of captures){const candidate=uniqueCaptureMatch(e,official.filter(o=>activeEntry(o)&&!captureTargets.has(o.id)));if(!candidate)continue;
   if(captures.filter(c=>activeEntry(c)&&uniqueCaptureMatch(c,[candidate])).length!==1)continue;
   await db.query('UPDATE expense_entries SET "matchedEntryId"=$2 WHERE id=$1',[e.id,candidate.id]);
   if(e.categoryOverride&&!candidate.categoryOverride)await db.query('UPDATE expense_entries SET "categoryOverride"=$2 WHERE id=$1',[candidate.id,e.categoryOverride]);
   e.matchedEntryId=candidate.id;captureTargets.add(candidate.id);matched++;
  }
  const banks=(await db.query('SELECT * FROM bank_transactions WHERE "userId"=$1 AND lower(status)=\'booked\'',[userId])).rows;
  const usedBank=new Set(entries.filter(e=>e.bankTransactionId).map(e=>e.bankTransactionId));
  // Verify the card-side credit against its opposite bank debit, including partial/early payments.
  // Month-end statement balance need not equal a subsequent repayment.
  const repayments=entries.filter(e=>activeEntry(e)&&e.entryType==='PAYMENT'&&!e.bankTransactionId);
  const repaymentCandidates=(e:StoredEntry)=>banks.filter(b=>!usedBank.has(b.id)&&b.currency===e.currency&&cents(Number(b.amount))===-cents(e.amount)&&Math.abs(new Date(b.date).getTime()-Date.parse(e.date))<=2*86400000&&(isCardRepayment(b.description??'')||(normalizeMerchant(e.merchant)==='to eur'&&normalizeMerchant(b.description??'')==='to eur')));
  for(const e of repayments){const matches=repaymentCandidates(e);if(matches.length!==1||repayments.filter(other=>repaymentCandidates(other).some(b=>b.id===matches[0].id)).length!==1)continue;await db.query('UPDATE expense_entries SET "bankTransactionId"=$2 WHERE id=$1',[e.id,matches[0].id]);e.bankTransactionId=matches[0].id;usedBank.add(matches[0].id);matched++;}
  const debits=entries.filter(e=>activeEntry(e)&&e.cardKind==='DEBIT');
  const bankCandidates=(e:StoredEntry)=>banks.filter(b=>!usedBank.has(b.id)&&b.accountId===cards.find(c=>c.id===e.cardId)?.bankAccountId&&b.currency===e.currency&&cents(Number(b.amount))===cents(e.amount)&&Math.abs(new Date(b.date).getTime()-Date.parse(e.date))<=7*86400000&&normalizeMerchant(b.merchantName||b.description||'')===normalizeMerchant(e.merchant));
  for(const e of debits){const matches=bankCandidates(e);if(matches.length!==1||debits.filter(d=>bankCandidates(d).some(b=>b.id===matches[0].id)).length!==1)continue;await db.query('UPDATE expense_entries SET "bankTransactionId"=$2 WHERE id=$1',[e.id,matches[0].id]);usedBank.add(matches[0].id);matched++;}
  const statements=(await db.query<Statement>('SELECT * FROM expense_statements WHERE "userId"=$1',[userId])).rows;
  const used=new Set(statements.map(s=>s.bankTransactionId).filter(Boolean));
  const candidatePayments=(s:Statement)=>banks.filter(b=>!used.has(b.id)&&b.currency===cards.find(c=>c.id===s.cardId)?.currency&&Number(b.amount)<0&&cents(-Number(b.amount))===cents(Number(s.amount))&&isCardRepayment(b.description??'')&&Math.abs(Date.parse(asDay(b.date))-Date.parse(asDay(s.dueDate)))<=7*86400000);
  for(const s of statements.filter(s=>!s.bankTransactionId)){
   const total=-entries.filter(e=>activeEntry(e)&&e.cardId===s.cardId&&e.entryType!=='PAYMENT'&&localDay(e.date)>=asDay(s.startDate)&&localDay(e.date)<=asDay(s.endDate)).reduce((n,e)=>n+e.amount,0);
   if(cents(total)!==cents(Number(s.amount)))continue;
   const matches=candidatePayments(s);if(matches.length!==1||statements.filter(other=>!other.bankTransactionId&&candidatePayments(other).some(b=>b.id===matches[0].id)).length!==1)continue;
   await db.query('UPDATE expense_statements SET "bankTransactionId"=$2 WHERE id=$1',[s.id,matches[0].id]);used.add(matches[0].id);matched++;
  }
  return {matched};
 }
 async preview(userId:string,cardId:string,csv:string) {
  const cards=await pool.query<Card>('SELECT * FROM expense_cards WHERE id=$1 AND "userId"=$2',[cardId,userId]);const card=cards.rows[0];if(!card)throw new ExpenseError(404,'Tarjeta no encontrada.');
  let rows:ReturnType<typeof parseStatementCsv>;try{rows=parseStatementCsv(csv,card.currency);}catch(e){throw new ExpenseError(400,(e as Error).message);}
  if(rows.some(r=>localDay(r.date)>localDay(new Date())))throw new ExpenseError(400,'El extracto contiene movimientos con fecha futura.');
  const prior=(await pool.query('SELECT "sourceId",date,amount,merchant,"entryType" FROM expense_entries WHERE "cardId"=$1 AND source=\'CSV\'',[cardId])).rows;
  const existing=new Map(prior.map(e=>[e.sourceId,e]));
  for(const r of rows){const old=existing.get(r.sourceId);if(old&&(cents(Number(old.amount))!==cents(r.amount)||asDay(old.date)!==asDay(r.date)||normalizeMerchant(old.merchant)!==normalizeMerchant(r.merchant)))throw new ExpenseError(409,`El identificador ${r.sourceId} ya existe con otros datos.`);}
  return {rows:rows.map(r=>({...r,duplicate:existing.has(r.sourceId)})),total:money(-rows.filter(r=>!['PAYMENT','TRANSFER'].includes(r.entryType)).reduce((n,r)=>n+r.amount,0)),currency:card.currency};
 }
 async importCsv(userId:string,cardId:string,csv:string) {
  // Parse and validate again on commit; the browser preview is never trusted.
  await this.preview(userId,cardId,csv);
  return this.locked(userId,async db=>{const card=await this.ownedCard(db,userId,cardId);const rows=parseStatementCsv(csv,card.currency);let imported=0;
   for(const r of rows){const existing=await db.query('SELECT * FROM expense_entries WHERE "cardId"=$1 AND source=\'CSV\' AND "sourceId"=$2',[cardId,r.sourceId]);if(existing.rows[0]){const old=existing.rows[0];if(cents(Number(old.amount))!==cents(r.amount)||asDay(old.date)!==asDay(r.date)||normalizeMerchant(old.merchant)!==normalizeMerchant(r.merchant))throw new ExpenseError(409,'El extracto cambió desde la vista previa.');continue;}
    const result=await db.query(`INSERT INTO expense_entries ("userId","cardId",date,amount,merchant,category,source,"sourceId","entryType") VALUES ($1,$2,$3,$4,$5,$6,'CSV',$7,$8) ON CONFLICT DO NOTHING`,[userId,cardId,r.date,r.amount,r.merchant,r.category,r.sourceId,r.entryType]);imported+=result.rowCount??0;}
   const reconciliation=await this.reconcileIn(db,userId);return {imported,duplicates:rows.length-imported,...reconciliation};
  });
 }
 async confirmStatement(userId:string,body:{cardId:string;startDate:string;endDate:string;dueDate:string;amount:number}) {
  return this.locked(userId,async db=>{const card=await this.ownedCard(db,userId,body.cardId);if(card.kind!=='CREDIT')throw new ExpenseError(400,'Los extractos de liquidación corresponden a tarjetas de crédito.');
   if(body.startDate>body.endDate||body.endDate>=body.dueDate)throw new ExpenseError(400,'Revisa el periodo y el vencimiento del extracto.');
   const overlap=await db.query('SELECT id FROM expense_statements WHERE "cardId"=$1 AND "startDate"<=$3 AND "endDate">=$2',[body.cardId,body.startDate,body.endDate]);if(overlap.rowCount)throw new ExpenseError(409,'Ya existe un extracto que cubre parte de este periodo.');
   const rows=(await db.query('SELECT * FROM expense_entries WHERE "cardId"=$1 AND NOT excluded AND "matchedEntryId" IS NULL AND "bankTransactionId" IS NULL',[body.cardId])).rows;
   const period=rows.filter(e=>e.entryType!=='PAYMENT'&&localDay(e.date)>=body.startDate&&localDay(e.date)<=body.endDate);
   if(!period.length||period.some(isProvisionalEntry))throw new ExpenseError(400,'Importa primero todas las compras confirmadas del periodo. Una captura provisional no acredita un extracto completo.');
   const total=money(-period.reduce((n,e)=>n+Number(e.amount),0));if(cents(total)!==cents(body.amount))throw new ExpenseError(400,`El detalle suma ${total.toFixed(2)} ${card.currency}, distinto del recibo. Completa compras, devoluciones y comisiones antes de conciliar.`);
   const result=await db.query('INSERT INTO expense_statements ("userId","cardId","startDate","endDate","dueDate",amount) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',[userId,body.cardId,body.startDate,body.endDate,body.dueDate,body.amount]);await this.reconcileIn(db,userId);return result.rows[0];
  });
 }
 async snapshot(userId:string) {
  const [cards,entries,banks,rules,budgets,statements,settings,tokens,wallet]=await Promise.all([
   pool.query<Card>('SELECT * FROM expense_cards WHERE "userId"=$1 ORDER BY "createdAt"',[userId]),
   pool.query('SELECT e.*,c.currency,c.kind AS "cardKind",c.name AS "cardName" FROM expense_entries e JOIN expense_cards c ON c.id=e."cardId" WHERE e."userId"=$1 ORDER BY e.date,e.id',[userId]),
   pool.query('SELECT b.*,a.name AS "accountName" FROM bank_transactions b JOIN bank_accounts a ON a.id=b."accountId" WHERE b."userId"=$1 ORDER BY b.date,b.id LIMIT 50001',[userId]),
   pool.query('SELECT merchant,category FROM expense_rules WHERE "userId"=$1',[userId]),pool.query('SELECT category,amount FROM expense_budgets WHERE "userId"=$1',[userId]),
   pool.query<Statement>('SELECT * FROM expense_statements WHERE "userId"=$1 ORDER BY "endDate" DESC',[userId]),
   pool.query('SELECT data FROM finance_plans WHERE "userId"=$1',[userId]),
   pool.query('SELECT id,name,"cardId",scope,"createdAt","lastUsedAt","revokedAt" FROM expense_tokens WHERE "userId"=$1 ORDER BY "createdAt" DESC',[userId]),
   pool.query(`SELECT c.*,w.name AS "cardName",w.currency FROM expense_wallet_captures c JOIN expense_wallet_cards w ON w.id=c."walletCardId" WHERE c."userId"=$1 AND c."expenseEntryId" IS NULL AND NOT c.excluded ORDER BY c.date,c.id`,[userId]),
  ]);
  if(banks.rows.length>50000||entries.rows.length>50000)throw new ExpenseError(422,'El historial supera el límite de análisis.');
  const stored=entries.rows.map(serializeEntry),active=stored.filter(activeEntry),ruleMap=new Map(rules.rows.map(r=>[r.merchant,r.category]));
  const validStatements=statements.rows.map(s=>{const period=active.filter(e=>e.cardId===s.cardId&&e.entryType!=='PAYMENT'&&localDay(e.date)>=asDay(s.startDate)&&localDay(e.date)<=asDay(s.endDate));return {...s,valid:period.length>0&&period.every(e=>!isProvisionalEntry(e))&&cents(-period.reduce((n,e)=>n+e.amount,0))===cents(Number(s.amount))};});
  const paidBank=new Set(validStatements.filter(s=>s.valid&&s.bankTransactionId).map(s=>s.bankTransactionId));
  for(const entry of stored.filter(e=>!e.excluded&&e.entryType==='PAYMENT'&&e.bankTransactionId))paidBank.add(entry.bankTransactionId!);
  const plan=planSchema.parse(settings.rows[0]?.data??{});
  const bankClassified=classify(banks.rows.map(b=>({...b,date:localDay(b.date),amount:Number(b.amount)})),plan);
  const movements: (Movement & {expenseKind?:'EXPENSE'|'TRANSFER';cardId?:string;walletCardId?:string;source:string;entryType?:string;provisional:boolean;accountName:string;category:string;funding:string;categoryMethod:string;categoryReason:string})[] = bankClassified.map(b=>{const linked=stored.find(e=>e.bankTransactionId===b.id&&!e.excluded),label=b.merchantName||b.description||'',rule=ruleMap.get(normalizeMerchant(label)),suggestion=categorySuggestion(label,b.displayCategory);return {...b,cardId:linked?.cardId,entryType:linked?.entryType,category:linked?.categoryOverride??rule??suggestion.category,categoryMethod:plan.transactionOverrides[b.id]?.category||linked?.categoryOverride?'MANUAL':rule?'RULE':suggestion.confidence==='HIGH'?'AUTOMATIC':'UNKNOWN',categoryReason:rule?'Regla recordada para este comercio':suggestion.reason,expenseKind:paidBank.has(b.id)?'TRANSFER':linked?.entryType==='REFUND'?'EXPENSE':b.kind==='TRANSFER'?'TRANSFER':undefined,source:'BANK',provisional:false,accountName:(b as any).accountName??'Cuenta bancaria',funding:'PERSONAL'};});
  for(const e of active)if(e.entryType!=='PAYMENT'){
   const funding=e.cardKind==='FLEXIBLE'?'FLEXIBLE':'PERSONAL',rule=ruleMap.get(normalizeMerchant(e.merchant)),suggestion=categorySuggestion(e.merchant,e.category,funding);
   movements.push({id:e.id,accountId:`card:${e.cardId}`,cardId:e.cardId,date:localDay(e.date),amount:e.amount,currency:e.currency,description:e.merchant,merchantName:e.merchant,category:e.categoryOverride??rule??suggestion.category,categoryMethod:e.categoryOverride?'MANUAL':rule?'RULE':suggestion.confidence==='HIGH'?'AUTOMATIC':'UNKNOWN',categoryReason:rule?'Regla recordada para este comercio':suggestion.reason,status:'booked',expenseKind:e.entryType==='TRANSFER'?'TRANSFER':'EXPENSE',source:e.source,entryType:e.entryType,provisional:isProvisionalEntry(e),accountName:e.cardName,funding});
  }
  for(const e of wallet.rows){
   const funding=/\bpluxee\b/i.test(e.cardName)?'FLEXIBLE':'UNASSIGNED',rule=ruleMap.get(normalizeMerchant(e.merchant)),suggestion=categorySuggestion(e.merchant,null,funding);
   movements.push({id:e.id,accountId:`wallet:${e.walletCardId}`,walletCardId:e.walletCardId,date:localDay(e.date),amount:Number(e.amount),currency:e.currency,description:e.merchant,merchantName:e.merchant,category:e.categoryOverride??rule??suggestion.category,categoryMethod:e.categoryOverride?'MANUAL':rule?'RULE':suggestion.confidence==='HIGH'?'AUTOMATIC':'UNKNOWN',categoryReason:suggestion.reason,status:'booked',expenseKind:'EXPENSE',source:'APPLE_PAY',entryType:e.entryType,provisional:false,accountName:e.cardName,funding});
  }
  const summaries=cards.rows.map(card=>{
   const baseline=card.balance!==null?Number(card.balance):card.openingBalance!==null?Number(card.openingBalance):null;
   const afterAnchor=(date:string|Date)=>card.balanceAt?new Date(date).getTime()>new Date(card.balanceAt).getTime():localDay(date)>asDay(card.openingDate);
   const after=active.filter(e=>e.cardId===card.id&&localDay(e.date)<=localDay(new Date())&&(card.balanceAt?(e.source==='CSV'?localDay(e.date)>localDay(card.balanceAt):afterAnchor(e.date)):afterAnchor(e.date)));
   // Payments already represented by the provider/CSV must not also be deducted as bank settlements.
   const settlements=validStatements.filter(s=>s.valid&&s.cardId===card.id&&s.bankTransactionId).map(s=>banks.rows.find(b=>b.id===s.bankTransactionId)).filter(Boolean);
   let settlementTotal=0;
   for(const b of settlements){if(!afterAnchor(b.date)||new Date(b.date).getTime()>Date.now())continue;const payment=after.filter(e=>e.entryType==='PAYMENT'&&cents(e.amount)===cents(-Number(b.amount))&&Math.abs(Date.parse(e.date)-new Date(b.date).getTime())<=7*86400000);if(!payment.length)settlementTotal+=-Number(b.amount);}
   const outstanding=card.kind==='CREDIT'&&baseline!==null?money(Math.max(0,baseline-after.reduce((n,e)=>n+e.amount,0)-settlementTotal)):null;
   const remaining=card.kind==='FLEXIBLE'&&baseline!==null?money(baseline+after.reduce((n,e)=>n+e.amount,0)):null;
   return {...card,remaining,openingDate:asDay(card.openingDate),openingBalance:card.openingBalance===null?null:Number(card.openingBalance),balance:card.balance===null?null:Number(card.balance),outstanding,balanceKnown:card.kind==='DEBIT'||baseline!==null,unconfirmed:active.filter(e=>e.cardId===card.id&&isProvisionalEntry(e)).length};
  });
  return {cards:summaries,stored,movements,statements:validStatements.map(s=>({...s,startDate:asDay(s.startDate),endDate:asDay(s.endDate),dueDate:asDay(s.dueDate),amount:Number(s.amount)})),rules:rules.rows,budgets:budgets.rows.map(b=>({...b,amount:Number(b.amount)})),tokens:tokens.rows};
 }
 async financialMovements(userId:string){return (await this.snapshot(userId)).movements.filter(e=>e.funding!=='FLEXIBLE');}
 async creditExposure(userId:string){const {cards}=await this.snapshot(userId);return {amount:money(cards.filter(c=>c.kind==='CREDIT'&&c.currency==='EUR').reduce((n,c)=>n+(c.outstanding??0),0)),unknown:cards.filter(c=>c.kind==='CREDIT'&&!c.balanceKnown).length,cards};}
 async overview(userId:string,month:string,currency='EUR') {
  const state=await this.snapshot(userId),today=localDay(new Date());
  const walletCards=(await pool.query(`SELECT w.id,w.name,w.currency,w."cardId",w."lastSeenAt",count(c.id)::integer AS pending,COALESCE(-sum(c.amount),0)::float8 AS "pendingAmount" FROM expense_wallet_cards w LEFT JOIN expense_wallet_captures c ON c."walletCardId"=w.id AND c."expenseEntryId" IS NULL AND NOT c.excluded WHERE w."userId"=$1 GROUP BY w.id ORDER BY w."lastSeenAt" DESC`,[userId])).rows;
  const walletPending=(await pool.query(`SELECT c.id,c."walletCardId",c.date,c.amount::float8 AS amount,c.merchant,c."entryType",w.name AS card,w.currency FROM expense_wallet_captures c JOIN expense_wallet_cards w ON w.id=c."walletCardId" WHERE c."userId"=$1 AND c."expenseEntryId" IS NULL AND NOT c.excluded ORDER BY c.date DESC LIMIT 500`,[userId])).rows;
  const plan=planSchema.parse((await pool.query('SELECT data FROM finance_plans WHERE "userId"=$1',[userId])).rows[0]?.data??{});
  const classified=classify(state.movements,plan);
  // Unallocated bank settlements are shown separately, never as a second purchase.
  const consumption=classified.filter(e=>!isCardRepayment(e.description??''));
  const expenses=consumption.filter(e=>e.kind==='EXPENSE'&&e.currency===currency&&e.date<=today);
  const selected=consumption.filter(e=>e.currency===currency&&e.date.startsWith(month)&&e.date<=today);
  const insights=spendingInsights(expenses,month,today,currency==='EUR'?state.budgets:[]);
  const history=Array.from({length:6},(_,index)=>{const d=new Date(month+'-01T00:00:00Z');d.setUTCMonth(d.getUTCMonth()-5+index);const m=iso(d).slice(0,7);return {month:m,spent:money(-expenses.filter(e=>e.date.startsWith(m)).reduce((n,e)=>n+e.amount,0))};});
  const sync=(await pool.query('SELECT status,message,"checkedAt" FROM expense_sync_status WHERE "userId"=$1',[userId])).rows[0]??{status:'NOT_CHECKED',message:'Sin comprobar. La conexión de cuentas sigue funcionando.'};
  const finances=await this.availability(userId,state,plan,today);
  const lastBank=state.movements.filter(e=>e.source==='BANK').map(e=>e.date).sort().at(-1)??null;
  const lastCapture=state.tokens.map(t=>t.lastUsedAt?new Date(t.lastUsedAt).toISOString():null).filter(Boolean).sort().at(-1)??null;
  const lastStatement=state.stored.filter(e=>e.source==='CSV').map(e=>e.date).sort().at(-1)??null;
  return {...state,stored:undefined,movements:undefined,...insights,today,month,currency,history,walletCards,walletPending,transactions:selected.sort((a,b)=>b.date.localeCompare(a.date)||a.id.localeCompare(b.id)),refunds:money(selected.filter(e=>e.entryType==='REFUND').reduce((n,e)=>n+e.amount,0)),unconfirmed:state.stored.filter(e=>activeEntry(e)&&isProvisionalEntry(e)).length,matched:state.stored.filter(e=>e.matchedEntryId||e.bankTransactionId).length,unresolvedRepayments:state.movements.filter(e=>e.amount<0&&isCardRepayment(e.description??'')&&e.expenseKind!=='TRANSFER').map(e=>({id:e.id,date:e.date,amount:-e.amount,currency:e.currency})),credit:{amount:money(state.cards.filter(c=>c.kind==='CREDIT'&&c.currency==='EUR').reduce((n,c)=>n+(c.outstanding??0),0)),unknown:state.cards.filter(c=>c.kind==='CREDIT'&&!c.balanceKnown).length},sync,finances,
   quality:{lastBank,lastCapture,lastStatement,unassigned:walletCards.filter(w=>!w.cardId).reduce((n,w)=>n+w.pending,0),unknownCreditBalances:finances.unknownBalances,staleAccounts:finances.staleAccounts,bankCardSyncOptional:true,historyComplete:false,totalHistory:expenses.length,categorizedHistory:expenses.filter(e=>e.displayCategory!=='Sin categoría').length},
  };
 }
 async availability(userId:string,state:Awaited<ReturnType<ExpensesService['snapshot']>>,plan:ReturnType<typeof planSchema.parse>,today:string) {
  const [accounts,debtRows,flex]=await Promise.all([
   pool.query('SELECT id,name,currency,balance,"balanceUpdatedAt" FROM bank_accounts WHERE "userId"=$1',[userId]),
   pool.query(`SELECT d.name,s."dueDate",s."paymentAmount" FROM debt_schedule s JOIN debts d ON d.id=s."debtId" WHERE d."userId"=$1 AND d.status='ACTIVE' AND d.currency='EUR' AND s.installment>d."paidPayments" AND s."dueDate"<=$2::date`,[userId,plusDays(today,30)]),
   pool.query(`SELECT count(*)::integer AS count,COALESCE(sum(amount),0) AS total FROM bank_transactions WHERE "userId"=$1 AND description ILIKE '%Fondos Monetarios Flexibles%'`,[userId]),
  ]);
  const euros=accounts.rows.filter(a=>a.currency==='EUR'),credit=money(state.cards.filter(c=>c.kind==='CREDIT'&&c.currency==='EUR').reduce((n,c)=>n+(c.outstanding??0),0));
  const unreflectedDebits=money(Math.max(0,-state.stored.filter(e=>activeEntry(e)&&e.cardKind==='DEBIT'&&e.currency==='EUR'&&e.entryType!=='PAYMENT'&&localDay(e.date)<=today).filter(e=>{const account=euros.find(a=>a.id===state.cards.find(c=>c.id===e.cardId)?.bankAccountId);return account&&(!account.balanceUpdatedAt||Date.parse(e.date)>new Date(account.balanceUpdatedAt).getTime());}).reduce((n,e)=>n+e.amount,0)));
  const unassigned=money(Math.max(0,-state.movements.filter(e=>e.funding==='UNASSIGNED'&&e.currency==='EUR'&&e.date<=today).reduce((n,e)=>n+e.amount,0)));
  const commitments:{date:string;name:string;amount:number;source:string}[]=plan.includeDebts?debtRows.rows.map(d=>({date:localDay(d.dueDate),name:d.name,amount:Number(d.paymentAmount),source:'DEBT'})):[];
  for(const r of plan.recurring.filter(r=>r.active&&r.kind!=='INCOME'&&r.currency==='EUR'))for(let i=0;i<6000;i++){const date=recurringDate(r,i);if(date>plusDays(today,30)||(r.endDate&&date>r.endDate))break;if(date>today)commitments.push({date,name:r.name,amount:r.amount,source:'RECURRING'});}
  const summary=availableMoney({bank:money(euros.reduce((n,a)=>n+Number(a.balance??0),0)),monetaryFunds:flex.rows[0].count?money(FLEXIBLE_FUNDS_OPENING_BALANCE-Number(flex.rows[0].total)):0,credit,unreflectedDebits,unassigned,committed:money(commitments.reduce((n,c)=>n+c.amount,0)),reserve:plan.reserve,unknownBalances:euros.filter(a=>a.balance===null).length+state.cards.filter(c=>c.kind==='CREDIT'&&!c.balanceKnown).length,staleAccounts:euros.filter(a=>!a.balanceUpdatedAt||localDay(a.balanceUpdatedAt)<plusDays(today,-2)).length});
  return {...summary,horizon:plusDays(today,30),commitments:commitments.sort((a,b)=>a.date.localeCompare(b.date)),accounts:euros.map(a=>({name:a.name,balance:a.balance===null?null:Number(a.balance),updatedAt:a.balanceUpdatedAt}))};
 }
 async uncategorized(userId:string,filters:UncategorizedFilters) {
  const state=await this.snapshot(userId);
  const plan=planSchema.parse((await pool.query('SELECT data FROM finance_plans WHERE "userId"=$1',[userId])).rows[0]?.data??{});
  return uncategorizedPage(classify(state.movements,plan),filters,localDay(new Date()),
   [...state.rules.map(r=>r.category),...state.budgets.map(b=>b.category)]);
 }
 async setCategory(userId:string,body:{id:string;category:string;remember:boolean}) {
  return this.locked(userId,async db=>{const entry=(await db.query('SELECT merchant FROM expense_entries WHERE id=$1 AND "userId"=$2',[body.id,userId])).rows[0];const wallet=entry?null:(await db.query('SELECT merchant,"expenseEntryId" FROM expense_wallet_captures WHERE id=$1 AND "userId"=$2',[body.id,userId])).rows[0];const bank=entry||wallet?null:(await db.query('SELECT COALESCE("merchantName",description) AS merchant FROM bank_transactions WHERE id=$1 AND "userId"=$2',[body.id,userId])).rows[0];if(!entry&&!bank&&!wallet)throw new ExpenseError(404,'Movimiento no encontrado.');
   if(entry)await db.query('UPDATE expense_entries SET "categoryOverride"=$3 WHERE id=$1 AND "userId"=$2',[body.id,userId,body.category]);
   if(wallet){await db.query('UPDATE expense_wallet_captures SET "categoryOverride"=$3 WHERE id=$1 AND "userId"=$2',[body.id,userId,body.category]);if(wallet.expenseEntryId)await db.query('UPDATE expense_entries SET "categoryOverride"=$3 WHERE id=$1 AND "userId"=$2',[wallet.expenseEntryId,userId,body.category]);}
   if(bank){const override=JSON.stringify({category:body.category});await db.query(`INSERT INTO finance_plans ("userId",data) VALUES ($1,jsonb_build_object('transactionOverrides',jsonb_build_object($2::text,jsonb_build_object('kind','AUTO')||$3::jsonb))) ON CONFLICT ("userId") DO UPDATE SET data=jsonb_set(finance_plans.data,'{transactionOverrides}',COALESCE(finance_plans.data->'transactionOverrides','{}'::jsonb)||jsonb_build_object($2::text,COALESCE(finance_plans.data->'transactionOverrides'->$2::text,jsonb_build_object('kind','AUTO'))||$3::jsonb)),version=finance_plans.version+1,"updatedAt"=now()`,[userId,body.id,override]);}
   if(body.remember)await db.query('INSERT INTO expense_rules ("userId",merchant,category) VALUES ($1,$2,$3) ON CONFLICT ("userId",merchant) DO UPDATE SET category=EXCLUDED.category',[userId,normalizeMerchant((entry??wallet??bank).merchant??''),body.category]);return {ok:true};
  });
 }
 async setBalance(userId:string,cardId:string,amount:number,date:string){return this.locked(userId,async db=>{await this.ownedCard(db,userId,cardId);await db.query('UPDATE expense_cards SET "openingBalance"=$3,"openingDate"=$4,balance=NULL,"balanceAt"=NULL WHERE id=$1 AND "userId"=$2',[cardId,userId,amount,date]);return {ok:true};});}
 async exclude(userId:string,id:string,excluded:boolean){return this.locked(userId,async db=>{const result=await db.query('UPDATE expense_entries SET excluded=$3 WHERE id=$1 AND "userId"=$2 RETURNING id',[id,userId,excluded]);if(!result.rowCount){const capture=await db.query('UPDATE expense_wallet_captures SET excluded=$3 WHERE id=$1 AND "userId"=$2 RETURNING "expenseEntryId"',[id,userId,excluded]);if(!capture.rowCount)throw new ExpenseError(404,'Compra no encontrada.');if(capture.rows[0].expenseEntryId)await db.query('UPDATE expense_entries SET excluded=$3 WHERE id=$1 AND "userId"=$2',[capture.rows[0].expenseEntryId,userId,excluded]);}await this.reconcileIn(db,userId);return {ok:true};});}
 async topUpFlexible(userId:string,cardId:string,body:{eventId:string;amount:number;date:string}) {
  return this.locked(userId,async db=>{const card=await this.ownedCard(db,userId,cardId);if(card.kind!=='FLEXIBLE')throw new ExpenseError(400,'Las recargas corresponden a tarjetas de retribución flexible.');
   const prior=(await db.query(`SELECT id,amount,date FROM expense_entries WHERE "cardId"=$1 AND source='MANUAL' AND "sourceId"=$2`,[cardId,body.eventId])).rows[0];
   if(prior){if(cents(Number(prior.amount))!==cents(body.amount)||localDay(prior.date)!==body.date)throw new ExpenseError(409,'La referencia de recarga ya se utilizó con otros datos.');return {id:prior.id,duplicate:true};}
   const row=(await db.query(`INSERT INTO expense_entries ("userId","cardId",date,amount,merchant,source,"sourceId","entryType") VALUES ($1,$2,$3,$4,'Recarga de retribución flexible','MANUAL',$5,'PAYMENT') RETURNING id`,[userId,cardId,body.date+'T12:00:00Z',body.amount,body.eventId])).rows[0];return {...row,duplicate:false};
  });
 }
 async revoke(userId:string,id:string){const result=await pool.query('UPDATE expense_tokens SET "revokedAt"=now() WHERE id=$1 AND "userId"=$2 RETURNING id',[id,userId]);if(!result.rowCount)throw new ExpenseError(404,'Credencial no encontrada.');return {ok:true};}
 async budget(userId:string,category:string,amount:number){if(amount===0)await pool.query('DELETE FROM expense_budgets WHERE "userId"=$1 AND category=$2',[userId,category]);else await pool.query('INSERT INTO expense_budgets ("userId",category,amount) VALUES ($1,$2,$3) ON CONFLICT ("userId",category) DO UPDATE SET amount=EXCLUDED.amount',[userId,category,amount]);return {ok:true};}
 async bankAccounts(userId:string){return (await pool.query('SELECT id,name,currency FROM bank_accounts WHERE "userId"=$1',[userId])).rows;}
 async review(userId:string) {
  const state=await this.snapshot(userId);
  return {pending:state.stored.filter(e=>activeEntry(e)&&isCaptureEntry(e)).map(e=>({...e,candidates:state.stored.filter(t=>activeEntry(t)&&!isProvisionalEntry(t)&&t.cardId===e.cardId&&['CSV','TRUELAYER'].includes(t.source)&&t.entryType===e.entryType&&cents(t.amount)===cents(e.amount)&&Math.abs(Date.parse(t.date)-Date.parse(e.date))<=7*86400000).map(t=>({id:t.id,date:localDay(t.date),merchant:t.merchant,source:t.source}))})),excluded:state.stored.filter(e=>e.excluded)};
 }
 async manualMatch(userId:string,id:string,targetId:string) {
  return this.locked(userId,async db=>{
   const entries=(await db.query('SELECT * FROM expense_entries WHERE "userId"=$1 AND id=ANY($2::uuid[])',[userId,[id,targetId]])).rows.map(serializeEntry);
   const capture=entries.find(e=>e.id===id),target=entries.find(e=>e.id===targetId);
   if(!capture||!target)throw new ExpenseError(404,'Movimiento no encontrado.');
   if(!isCaptureEntry(capture)||isProvisionalEntry(target)||!['CSV','TRUELAYER'].includes(target.source)||!activeEntry(capture)||!activeEntry(target)||capture.cardId!==target.cardId||capture.entryType!==target.entryType||cents(capture.amount)!==cents(target.amount)||Math.abs(Date.parse(capture.date)-Date.parse(target.date))>7*86400000)throw new ExpenseError(400,'Estos movimientos no pueden representar la misma compra.');
   const taken=await db.query(`SELECT a.id FROM expense_entries a LEFT JOIN expense_entries b ON b.id=a."matchedEntryId" WHERE a."userId"=$2 AND (a.source='APPLE_PAY' OR a.provisional) AND NOT a.excluded AND (a."matchedEntryId"=$1 OR b."matchedEntryId"=$1)`,[target.id,userId]);if(taken.rowCount)throw new ExpenseError(409,'La compra ya tiene otra captura asociada.');
   await db.query('UPDATE expense_entries SET "matchedEntryId"=$2 WHERE id=$1',[id,targetId]);if(capture.categoryOverride&&!target.categoryOverride)await db.query('UPDATE expense_entries SET "categoryOverride"=$2 WHERE id=$1',[targetId,capture.categoryOverride]);return {ok:true};
  });
 }
 async mergeProviderCard(userId:string,sourceId:string,targetId:string) {
  return this.locked(userId,async db=>{const source=await this.ownedCard(db,userId,sourceId),target=await this.ownedCard(db,userId,targetId);
   if(source.id===target.id||source.providerCardId||!target.providerCardId||source.currency!==target.currency||source.kind!==target.kind)throw new ExpenseError(400,'Elige la tarjeta manual y su tarjeta conectada, de la misma divisa y tipo.');
   const collision=await db.query('SELECT a.id FROM expense_entries a JOIN expense_entries b ON a.source=b.source AND a."sourceId"=b."sourceId" WHERE a."cardId"=$1 AND b."cardId"=$2 LIMIT 1',[sourceId,targetId]);
   const overlap=await db.query('SELECT a.id FROM expense_statements a JOIN expense_statements b ON a."startDate"<=b."endDate" AND a."endDate">=b."startDate" WHERE a."cardId"=$1 AND b."cardId"=$2 LIMIT 1',[sourceId,targetId]);
   if(collision.rowCount||overlap.rowCount)throw new ExpenseError(409,'Hay extractos o identificadores solapados. Revisa ambas tarjetas antes de unificarlas.');
   for(const table of ['expense_entries','expense_tokens','expense_statements'])await db.query(`UPDATE ${table} SET "cardId"=$3 WHERE "cardId"=$1 AND "userId"=$2`,[sourceId,userId,targetId]);
   await db.query('UPDATE expense_wallet_cards SET "cardId"=$3 WHERE "cardId"=$1 AND "userId"=$2',[sourceId,userId,targetId]);
   await db.query('DELETE FROM expense_cards WHERE id=$1 AND "userId"=$2',[sourceId,userId]);await this.reconcileIn(db,userId);return {ok:true,cardId:targetId};
  });
 }
 async syncProviderCards(userId:string,connectionId:string,request:(path:string)=>Promise<any>) {
  let status='CONNECTED',message='Tarjetas sincronizadas.';let count=0;
  try {
   const list=await request('/data/v1/cards');
   if(!list.results?.length){status='NO_CARDS';message='El proveedor no devuelve tarjetas de crédito para esta conexión.';}
   for(const card of list.results??[]){
    if(!card.account_id)continue;
    const balances=await request(`/data/v1/cards/${encodeURIComponent(card.account_id)}/balance`),balance=balances.results?.[0];
    if(!balance?.currency||!Number.isFinite(Number(balance.current)))throw new Error('La tarjeta no devuelve un saldo y una divisa válidos.');
    const existing=(await pool.query('SELECT id FROM expense_cards WHERE "userId"=$1 AND "providerCardId"=$2',[userId,card.account_id])).rows[0];
    const from=existing?new Date(Date.now()-14*86400000).toISOString().slice(0,10):new Date(Date.now()-6*366*86400000).toISOString().slice(0,10);
    const txs:any[]=[];let cursor:string|undefined;
    for(let page=0;page<100;page++) {const params=new URLSearchParams({from,to:iso(new Date()),...(cursor?{cursor}:{})});const response=await request(`/data/v1/cards/${encodeURIComponent(card.account_id)}/transactions?${params}`);txs.push(...response.results??[]);cursor=response.meta?.cursors?.next;if(!cursor)break;if(page===99)throw new Error('La tarjeta supera el límite de paginación.');}
    await this.locked(userId,async db=>{
     const saved=(await db.query(`INSERT INTO expense_cards ("userId",name,kind,currency,"openingDate","providerCardId","connectionId",balance,"balanceAt") VALUES ($1,$2,'CREDIT',$3,CURRENT_DATE,$4,$5,$6,$7) ON CONFLICT ("userId","providerCardId") DO UPDATE SET balance=EXCLUDED.balance,"balanceAt"=EXCLUDED."balanceAt" RETURNING id`,[userId,card.display_name??card.card_network??'Tarjeta de crédito',balance.currency,card.account_id,connectionId,Number(balance.current),balance.update_timestamp?new Date(balance.update_timestamp):new Date()])).rows[0];
     for(const t of txs){const sourceId=t.normalised_provider_transaction_id??t.provider_transaction_id??t.transaction_id;if(!sourceId||!t.timestamp||!Number.isFinite(Number(t.amount))||Number(t.amount)===0||t.currency!==balance.currency)continue;
      const repayment=/repayment|bill_payment/i.test(t.transaction_category??'')||isCardRepayment(t.description??'');
      // The card API uses positive amounts for purchases, the reverse of a bank account.
      const signed=-Number(t.amount),entryType=repayment?'PAYMENT':signed<0?'PURCHASE':'REFUND';
      await db.query(`INSERT INTO expense_entries ("userId","cardId",date,amount,merchant,category,source,"sourceId","entryType") VALUES ($1,$2,$3,$4,$5,$6,'TRUELAYER',$7,$8) ON CONFLICT ("cardId",source,"sourceId") DO UPDATE SET date=EXCLUDED.date,amount=EXCLUDED.amount,merchant=EXCLUDED.merchant,"entryType"=EXCLUDED."entryType"`,[userId,saved.id,t.timestamp,signed,t.merchant_name??t.description??'Compra',t.transaction_classification?.at(-1)??null,sourceId,entryType]);
     }
     await this.reconcileIn(db,userId);
    });count++;
   }
  }catch(e:any){status=[401,403].includes(e.providerStatus)?'NEEDS_AUTH':[404,501].includes(e.providerStatus)?'UNSUPPORTED':'ERROR';message=status==='NEEDS_AUTH'?'La conexión no permite consultar tarjetas. Puedes probar a autorizar el permiso de tarjetas; su disponibilidad depende del proveedor.':status==='UNSUPPORTED'?'El proveedor no ofrece tarjetas mediante esta conexión. Usa Apple Pay y extractos.':'No se han podido actualizar las tarjetas. Se conserva la última información.';}
  await pool.query('INSERT INTO expense_sync_status ("userId",status,message) VALUES ($1,$2,$3) ON CONFLICT ("userId") DO UPDATE SET status=EXCLUDED.status,message=EXCLUDED.message,"checkedAt"=now()',[userId,status,message]);return {status,message,count};
 }
}
export const expensesService=new ExpensesService();
