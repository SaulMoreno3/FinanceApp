import test from 'node:test';
import assert from 'node:assert/strict';
import { categoryFor, isProvisionalEntry, localDay, normalizeWalletCard, parseStatementCsv, uniqueCaptureMatch, type Entry } from './expenses.calculations';
import { captureSchema } from './expenses.routes';
import { classify, expenseAnalysis } from '../planning/planning.calculations';
import { planSchema } from '../planning/planning.schema';

test('CSV supports escaped quotes, Spanish amounts, refunds, payments and duplicate purchases',()=>{
 const rows=parseStatementCsv('Fecha;Descripción;Importe;Divisa;Tipo\n02/11/2026;"Café ""El Sol""";-12,50;EUR;purchase\n02/11/2026;"Café ""El Sol""";-12,50;EUR;purchase\n03/11/2026;Devolución;2,50;EUR;refund\n04/11/2026;Pago tarjeta;22,50;EUR;repayment','EUR');
 assert.equal(rows.length,4);assert.equal(rows[0].merchant,'Café "El Sol"');assert.equal(rows[0].amount,-12.5);assert.notEqual(rows[0].sourceId,rows[1].sourceId);assert.equal(rows[2].entryType,'REFUND');assert.equal(rows[3].entryType,'PAYMENT');
 assert.deepEqual(parseStatementCsv('date,description,amount\n2026-11-02,Shop,-12.50','EUR'),parseStatementCsv('date,description,amount\n2026-11-02,Shop,-12.50','EUR'));
});
test('CSV rejects bad dates, currency mixtures, pending transactions and malformed records',()=>{
 for(const text of ['date,description,amount\n2026-02-30,Shop,-1','date,description,amount,currency\n2026-11-02,Shop,-1,USD','date,description,amount,state\n2026-11-02,Shop,-1,PENDING','date,description,amount\n2026-11-02,Shop,-1,extra','date,description,amount\n2026-11-02,"Shop,-1','date,description,amount\n2026-11-02,Shop,0'])assert.throws(()=>parseStatementCsv(text,'EUR'));
});
test('matching is card-specific, signed, date-limited, merchant-specific and refuses ambiguity',()=>{
 const e:Entry={id:'a',cardId:'card',date:'2026-11-02T12:00:00Z',amount:-20,merchant:'CAFÉ SOL',source:'APPLE_PAY',entryType:'PURCHASE'};
 const target={...e,id:'b',source:'CSV',merchant:'Cafe Sol',date:'2026-11-03T12:00:00Z'};
 assert.equal(uniqueCaptureMatch(e,[target])?.id,'b');
 assert.equal(uniqueCaptureMatch(e,[target,{...target,id:'c'}]),null);
 for(const change of [{cardId:'other'},{amount:20},{date:'2026-12-02T12:00:00Z'},{merchant:'Cafe Luna'},{entryType:'PAYMENT'}])assert.equal(uniqueCaptureMatch(e,[{...target,...change}]),null);
});
test('refunds reduce consumption, repayment is a transfer, and Madrid midnight is respected',()=>{
 const base={accountId:'card',currency:'EUR',description:'Shop',merchantName:'Shop',category:'Compras',status:'booked',date:'2026-11-02'};
 const rows=classify([{...base,id:'a',amount:-100,expenseKind:'EXPENSE' as const},{...base,id:'b',amount:30,expenseKind:'EXPENSE' as const},{...base,id:'c',amount:-70,expenseKind:'TRANSFER' as const}],planSchema.parse({}));
 const analysis=expenseAnalysis(rows,'2026-11','2026-11-09');assert.equal(analysis.spent,70);assert.equal(analysis.income,0);assert.equal(analysis.transfers,1);assert.equal(analysis.categories[0].amount,70);
 assert.equal(localDay('2026-11-08T23:30:00Z'),'2026-11-09');assert.equal(categoryFor('Mercadona','PURCHASE'),'Supermercado');
});
test('Wallet capture accepts an explicit text label without breaking the legacy body',()=>{
 const payload={eventId:'test-event-001',date:new Date().toISOString(),amount:12.5,currency:'EUR',merchant:'Tienda',type:'PURCHASE'};
 assert.equal(captureSchema.parse(payload).card,undefined);
 assert.equal(captureSchema.parse({...payload,card:'  Revolut • 1234  '}).card,'Revolut • 1234');
 for(const card of ['', '   ', {}, ['Revolut'], null, 'x'.repeat(251)])assert.equal(captureSchema.safeParse({...payload,card}).success,false);
 for(const extra of [{cardId:'untrusted'},{userId:'untrusted'},{scope:'WALLET'}])assert.equal(captureSchema.safeParse({...payload,...extra}).success,false);
});
test('Wallet label normalization preserves identifying punctuation and digits',()=>{
 assert.equal(normalizeWalletCard('  Revolut   CREDIT 1234 '),'revolut credit 1234');
 assert.notEqual(normalizeWalletCard('Revolut 1234'),normalizeWalletCard('Revolut 5678'));
 assert.notEqual(normalizeWalletCard('Card-1234'),normalizeWalletCard('Card1234'));
});
test('explicit cash movements are transfers, while fees remain purchases',()=>{
 const rows=parseStatementCsv('date,description,amount,type\n2026-07-17,Cash withdrawal,-500,cash transfer\n2026-07-17,ATM commission,-20,fee\n2026-07-31,Cash adjustment,8.55,cash transfer','EUR');
 assert.deepEqual(rows.map(r=>r.entryType),['TRANSFER','PURCHASE','TRANSFER']);
 assert.throws(()=>parseStatementCsv('date,description,amount,type\n2026-07-17,Unverified transfer,-500,transfer','EUR'));
});
test('manual screenshot imports can be provisional without pretending to be Apple Pay',()=>{
 assert.equal(isProvisionalEntry({source:'MANUAL',provisional:true}),true);
 assert.equal(isProvisionalEntry({source:'CSV',provisional:false}),false);
 assert.equal(isProvisionalEntry({source:'APPLE_PAY'}),false);
});
