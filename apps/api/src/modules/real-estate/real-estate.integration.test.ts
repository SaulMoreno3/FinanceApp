import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { Pool } from 'pg';
import express from 'express';
import jwt from 'jsonwebtoken';
import { propertySchema, type PropertyInput } from './real-estate.schema';
const databaseURL=process.env.REAL_ESTATE_TEST_DATABASE_URL;
test('real estate HTTP, migration and persistence', {skip:!databaseURL}, async t=>{
    const url=new URL(databaseURL!);
    assert.ok(['localhost','127.0.0.1'].includes(url.hostname)&&url.pathname==='/financeapp_review','Use the isolated financeapp_review database.');
    process.env.DATABASE_URL=databaseURL;
    const pool=new Pool({connectionString:databaseURL});
    await pool.query('CREATE TABLE IF NOT EXISTS users (id UUID PRIMARY KEY, "sessionVersion" INTEGER NOT NULL DEFAULT 0)');
    const exists=await pool.query("SELECT to_regclass('public.real_estate_properties') as name");
    if(!exists.rows[0].name)await pool.query(await readFile(new URL('../../../prisma/migrations/20260907120000_add_real_estate/migration.sql',import.meta.url),'utf8'));
    const user=randomUUID(),other=randomUUID();await pool.query('INSERT INTO users(id) VALUES ($1),($2)',[user,other]);
    const {default:router}=await import('./real-estate.routes');const {prisma}=await import('../../common/db/prisma');
    const app=express();app.use(express.json({limit:'2mb'}));app.use('/real-estate',router);
    const server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));
    const base=`http://127.0.0.1:${(server.address() as AddressInfo).port}/real-estate`;
    const token=(id:string)=>jwt.sign({userId:id,sessionVersion:0},process.env.JWT_SECRET!,{expiresIn:'5m'});
    const request=(path='',method='GET',body?:unknown,owner:string|null=user)=>fetch(`${base}${path}?year=2025`,{method,headers:{'Content-Type':'application/json',...(owner?{Authorization:`Bearer ${token(owner)}`}:{})},body:body===undefined?undefined:JSON.stringify(body)});
    const periodId=randomUUID();let record:{id:string;version:number;property:PropertyInput;report:{expectedRent:number}};
    try {
        await t.test('requires authentication',async()=>assert.equal((await request('','GET',undefined,null)).status,401));
        await t.test('zero-cost property is persisted',async()=>{
            const property=propertySchema.parse({name:'Integration',acquisitionDate:'2024-01-01',purchasePrice:0,currentValue:150000,rentPeriods:[{id:periodId,startDate:'2025-01-01',endDate:null,monthlyRent:900,dueDay:1,autoCollect:true,tenant:''}]});
            const response=await request('','POST',{property});assert.equal(response.status,201);record=await response.json();assert.equal(record.version,1);assert.equal(record.report.expectedRent,10800);
            const stored=await pool.query('SELECT data FROM real_estate_properties WHERE id=$1',[record.id]);assert.equal(stored.rows[0].data.purchasePrice,0);
        });
        await t.test('ownership enforced on list/read/update/delete',async()=>{
            assert.deepEqual((await(await request('','GET',undefined,other)).json()).data,[]);
            assert.equal((await request(`/${record.id}`,'GET',undefined,other)).status,404);
            assert.equal((await request(`/${record.id}`,'PUT',{version:1,property:record.property},other)).status,404);
            assert.equal((await request(`/${record.id}`,'DELETE',{version:1},other)).status,404);
        });
        await t.test('concurrent updates cannot overwrite another version',async()=>{
            const responses=await Promise.all(['A','B'].map(name=>request(`/${record.id}`,'PUT',{version:record.version,property:{...record.property,name}})));
            assert.deepEqual(responses.map(v=>v.status).sort(),[200,409]);record=await(await request(`/${record.id}`)).json();assert.equal(record.version,2);
        });
        await t.test('rent increase preserves original period and persists',async()=>{
            const response=await request(`/${record.id}/rent-change`,'POST',{version:record.version,periodId,effectiveDate:'2025-07-01',mode:'PERCENT',value:10});assert.equal(response.status,200);record=await response.json();
            assert.equal(record.property.rentPeriods[0].endDate,'2025-06-30');assert.equal(record.property.rentPeriods[1].monthlyRent,990);assert.equal(record.report.expectedRent,11340);
        });
        await t.test('overlap is rejected without changing stored data',async()=>{
            const response=await request(`/${record.id}`,'PUT',{version:record.version,property:{...record.property,rentPeriods:[...record.property.rentPeriods,{...record.property.rentPeriods[0],id:randomUUID()}]}});assert.equal(response.status,400);
            assert.equal((await(await request(`/${record.id}`)).json()).version,record.version);
        });
        await t.test('manual receipt survives revisions that would destroy its reference',async()=>{
            const period=record.property.rentPeriods[1];const property={...record.property,receipts:[{periodId:period.id,month:'2025-10',amount:400,paidOn:'2025-10-05'}]};
            const response=await request(`/${record.id}`,'PUT',{version:record.version,property});assert.equal(response.status,200);record=await response.json();
            assert.equal((await request(`/${record.id}/rent-change`,'POST',{version:record.version,periodId:period.id,effectiveDate:'2025-09-01',mode:'AMOUNT',value:1000})).status,409);
            assert.equal((await(await request(`/${record.id}`)).json()).property.receipts[0].amount,400);
        });
        await t.test('invalid identifiers and years are rejected',async()=>{
            assert.equal((await request('/not-a-uuid')).status,400);assert.equal((await fetch(`${base}?year=bad`,{headers:{Authorization:`Bearer ${token(user)}`}})).status,400);
        });
        await t.test('deletion requires current version',async()=>{
            assert.equal((await request(`/${record.id}`,'DELETE',{version:1})).status,409);assert.equal((await request(`/${record.id}`,'DELETE',{version:record.version})).status,204);assert.equal((await request(`/${record.id}`)).status,404);
        });
    } finally {
        await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));
        await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])',[[user,other]]);await pool.end();await prisma.$disconnect();
    }
});
