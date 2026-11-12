import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { registerSchema, loginSchema, changePasswordSchema } from './auth.service';
import { errorHandler } from '../../common/middleware/errorHandler';

test('registration enforces length, bounds and normalizes email', () => {
    assert.equal(registerSchema.safeParse({registrationCode:'test-code',email:'a@example.invalid',password:'123456'}).success,false);
    assert.equal(registerSchema.safeParse({registrationCode:'test-code',email:'a@example.invalid',password:'x'.repeat(129)}).success,false);
    assert.equal(registerSchema.parse({registrationCode:'test-code',email:' A@EXAMPLE.INVALID ',password:'a long passphrase works'}).email,'a@example.invalid');
    assert.equal(loginSchema.safeParse({email:'a@example.invalid',password:'old123'}).success,true);
    assert.equal(changePasswordSchema.safeParse({currentPassword:'old123',newPassword:'a long passphrase works'}).success,true);
});

test('invalid requests are 400 and internal errors do not disclose secrets', async () => {
    const app=express();app.use(express.json());
    app.post('/validate',(req,res)=>res.json(registerSchema.parse(req.body)));
    app.get('/failure',()=>{throw new Error('database password=private-secret');});
    app.use(errorHandler);
    const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));
    const address=server.address() as {port:number};const base=`http://127.0.0.1:${address.port}`;
    try {
        const invalid=await fetch(base+'/validate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'bad',password:'secret'})});
        assert.equal(invalid.status,400);assert.equal((await invalid.text()).includes('secret'),false);
        const internal=await fetch(base+'/failure');assert.equal(internal.status,500);assert.deepEqual(await internal.json(),{error:'Internal Server Error'});
        const malformed=await fetch(base+'/validate',{method:'POST',headers:{'Content-Type':'application/json'},body:'{'});assert.equal(malformed.status,400);
    } finally {await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));}
});

test('12-character boundary is identical for registration and password changes', () => {
    for (const length of [11,12,128,129]) {
        const password='x'.repeat(length), expected=length>=12&&length<=128;
        assert.equal(registerSchema.safeParse({registrationCode:'test-code',email:'a@example.invalid',password}).success,expected);
        assert.equal(changePasswordSchema.safeParse({currentPassword:'old-secret',newPassword:password}).success,expected);
    }
});

test('email changes require reauthentication and never persist the supplied password', async () => {
    const {prisma}=await import('../../common/db/prisma');
    const {AuthService,updateProfileSchema}=await import('./auth.service');
    const argon2=await import('argon2');
    const previousPepper=process.env.PEPPER;process.env.PEPPER='unit-test-pepper';
    const hash=await argon2.hash('current-password',{secret:Buffer.from(process.env.PEPPER)});
    const account={id:'00000000-0000-4000-8000-000000000001',email:'old@example.invalid',passwordHash:hash,sessionVersion:2};
    const user=prisma.user as any;const original={findUnique:user.findUnique,updateMany:user.updateMany};let writes:any[]=[];
    user.findUnique=async(args:any)=>args.where.id?account:null;
    user.updateMany=async(args:any)=>{writes.push(args);return {count:1};};
    const profile={name:'Test account',email:'new@example.invalid',avatarIcon:'user-round',avatarColor:'slate',locale:'es-ES',timezone:'Europe/Madrid',preferredCurrency:'EUR'};
    try {
        const service=new AuthService();
        await assert.rejects(()=>service.updateProfile(account.id,updateProfileSchema.parse(profile)),/contraseña actual/);
        await assert.rejects(()=>service.updateProfile(account.id,updateProfileSchema.parse({...profile,currentPassword:'wrong-password'})),/no es correcta/);
        assert.equal(writes.length,0);
        await service.updateProfile(account.id,updateProfileSchema.parse({...profile,currentPassword:'current-password'}));
        assert.equal(writes.length,1);assert.equal('currentPassword' in writes[0].data,false);
        assert.equal(writes[0].where.sessionVersion,2);
        await service.updateProfile(account.id,updateProfileSchema.parse({...profile,email:account.email}));
        assert.equal(writes.length,2);
        user.updateMany=async()=>({count:0});
        await assert.rejects(()=>service.updateProfile(account.id,updateProfileSchema.parse({...profile,email:account.email})),/sesión ha cambiado/);
        await assert.rejects(()=>service.changePassword(account.id,{currentPassword:'current-password',newPassword:'twelve-chars-plus'}),/sesión ha cambiado/);
    } finally {
        Object.assign(user,original);
        if(previousPepper===undefined)delete process.env.PEPPER;else process.env.PEPPER=previousPepper;
    }
});

test('registration code is server-enforced, exact and fail-closed', async () => {
    const {verifyRegistrationCode}=await import('./registration-code');
    const {AuthService}=await import('./auth.service');
    const previous=process.env.REGISTRATION_CODE;
    try {
        process.env.REGISTRATION_CODE='private-test-code';
        assert.doesNotThrow(()=>verifyRegistrationCode('private-test-code'));
        for(const code of ['', 'wrong-code', 'PRIVATE-TEST-CODE', ' private-test-code']) {
            assert.throws(()=>verifyRegistrationCode(code),(error:any)=>error.statusCode===403);
        }
        assert.equal(registerSchema.safeParse({email:'test@example.invalid',password:'twelve-chars'}).success,false);
        // A direct service call also rejects before any database lookup.
        await assert.rejects(()=>new AuthService().register({email:'test@example.invalid',password:'twelve-chars',registrationCode:'wrong'}),(error:any)=>error.statusCode===403);
        delete process.env.REGISTRATION_CODE;
        assert.throws(()=>verifyRegistrationCode('private-test-code'),(error:any)=>error.statusCode===503);
    } finally {
        if(previous===undefined)delete process.env.REGISTRATION_CODE;else process.env.REGISTRATION_CODE=previous;
    }
});
