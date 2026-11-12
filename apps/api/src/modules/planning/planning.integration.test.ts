import assert from 'node:assert/strict';
import test from 'node:test';
import {randomUUID} from 'node:crypto';
import {prisma} from '../../common/db/prisma';
import pool from '../../common/db/client';
import {propertySchema} from '../real-estate/real-estate.schema';
const base='http://localhost:3109';
async function request(path:string,token?:string,body?:unknown,method=body?'POST':'GET'){
 const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:body?JSON.stringify(body):undefined});const data=await r.json().catch(()=>null);return {status:r.status,data};
}
test('planning HTTP persistence, isolation, revisions and closing audit', {skip:process.env.PLANNING_INTEGRATION!=='true'}, async()=>{
 assert.equal(process.env.DB_NAME,'financeapp_test');assert.equal(process.env.DB_PORT,'55439');
 const suffix=randomUUID(),email=`planning-test-${suffix}@example.invalid`,otherEmail=`planning-empty-${suffix}@example.invalid`;
 const created:string[]=[];
try{
 let first=await request('/auth/register',undefined,{email:email,password:'Planning-test-2026!',registrationCode:process.env.REGISTRATION_CODE});if(first.status===409)first=await request('/auth/login',undefined,{email:email,password:'Planning-test-2026!'});assert.equal(first.status,200);created.push(first.data.user.id);
 let second=await request('/auth/register',undefined,{email:otherEmail,password:'Planning-test-2026!',registrationCode:process.env.REGISTRATION_CODE});if(second.status===409)second=await request('/auth/login',undefined,{email:otherEmail,password:'Planning-test-2026!'});assert.equal(second.status,200);created.push(second.data.user.id);
 const uid=first.data.user.id,token=first.data.token,other=second.data.token;
 const conn=await prisma.bankConnection.create({data:{userId:uid,provider:'test',status:'CONNECTED'}});
 const bank=await prisma.bankAccount.create({data:{userId:uid,connectionId:conn.id,providerAccountId:'test-one',name:'Cuenta de prueba',currency:'EUR',balance:4500,balanceUpdatedAt:new Date()}});
 const transactions=[...['2026-06-05','2026-07-05','2026-08-05','2026-09-05'].map(date=>({date,amount:-12.99,merchantName:'Video Club',category:'Ocio'})),{date:'2026-09-02',amount:-75.3,merchantName:'Supermercado',category:'Alimentación'},{date:'2026-08-27',amount:2100,merchantName:'Nómina',category:'Ingresos'},{date:'2026-09-01',amount:2100,merchantName:'Nómina',category:'Ingresos'},{date:'2026-09-07',amount:-45,merchantName:'Restaurante',category:'Restauración'}];
 for(const t of transactions)await prisma.bankTransaction.create({data:{...t,date:new Date(t.date),userId:uid,accountId:bank.id,providerTransactionId:randomUUID(),currency:'EUR',direction:t.amount<0?'expense':'income'}});
 const periodId=randomUUID();const property=propertySchema.parse({name:'Piso de prueba',acquisitionDate:'2025-01-01',purchasePrice:100000,currentValue:120000,rentPeriods:[{id:periodId,startDate:'2026-01-01',endDate:null,monthlyRent:700,dueDay:5,autoCollect:true,tenant:''}],expenses:[{id:randomUUID(),description:'Comunidad',category:'COMMUNITY',amount:60,date:'2026-01-01',endDate:null,frequency:'MONTHLY'}]});
 await prisma.realEstateProperty.create({data:{userId:uid,data:property}});
 assert.equal((await request('/planning?month=2026-09')).status,401);
 const initial=await request('/planning?month=2026-09',token);assert.equal(initial.status,200);assert.equal(initial.data.candidates.length,1);assert.equal(initial.data.properties.length,1);assert.ok(initial.data.forecast.events.some((e:any)=>e.source==='RENT'));
 const empty=await request('/planning?month=2026-09',other);assert.equal(empty.data.analysis.transactions.length,0);assert.equal(empty.data.liquidity.balance,0);assert.equal(empty.data.candidates.length,0);
 const p=initial.data.plan,candidate=initial.data.candidates[0];p.reserve=1000;p.recurring=[{id:randomUUID(),name:candidate.name,amount:candidate.amount,currency:'EUR',kind:'SUBSCRIPTION',cadence:candidate.cadence,nextDate:candidate.nextDate,endDate:null,active:true,merchantKey:candidate.merchantKey,notes:''}];
 assert.equal((await request('/planning',token,{version:0,plan:p},'PUT')).status,200);
 assert.equal((await request('/planning',token,{version:0,plan:p},'PUT')).status,409);
 const saved=(await request('/planning?month=2026-09',token)).data;assert.equal(saved.candidates.length,0);assert.equal(saved.recurring.length,1);assert.equal(saved.liquidity.available,3500-saved.liquidity.committed);
 const foreignPlan=empty.data.plan;foreignPlan.transactionOverrides[initial.data.analysis.transactions[0].id]={kind:'TRANSFER',category:''};assert.equal((await request('/planning',other,{version:0,plan:foreignPlan},'PUT')).status,400);
 assert.equal((await request('/planning',token,{version:1,plan:{...p,reserve:-5}},'PUT')).status,400);
 const august=(await request('/planning?month=2026-08',token)).data;assert.equal((await request('/planning/close',token,{month:'2026-08',fingerprint:august.fingerprint})).status,200);
 assert.equal((await request('/planning?month=2026-08',other)).data.closings.length,0);
 const corrected=await prisma.bankTransaction.findFirstOrThrow({where:{userId:uid,date:new Date('2026-08-05')}});await prisma.bankTransaction.update({where:{id:corrected.id},data:{amount:-14}});
 const changed=(await request('/planning?month=2026-08',token)).data;assert.equal(changed.closings[0].changed,true);
 assert.equal((await request('/planning/close',token,{month:'2026-08',fingerprint:august.fingerprint})).status,409);
 assert.equal((await request('/planning/close',token,{month:new Date().toISOString().slice(0,7),fingerprint:changed.fingerprint})).status,400);
 // Leave one unconfirmed proposal for visual review in the isolated database only.
 const end=(await request('/planning?month=2026-09',token)).data;end.plan.recurring=[];assert.equal((await request('/planning',token,{version:end.version,plan:end.plan},'PUT')).status,200);
 console.log('PASS: authentication, owner isolation, confirmation persistence, conflict protection, validation, property forecast, month snapshot and change detection.');
}finally{if(created.length)await prisma.user.deleteMany({where:{id:{in:created},email:{in:[email,otherEmail]}}});await prisma.$disconnect();await pool.end();}
});
