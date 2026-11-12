import { Router, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import { z, ZodError } from 'zod';
import { authenticateToken } from '../auth/auth.middleware';
import { monthSchema } from '../planning/planning.schema';
import { expensesService, ExpenseError } from './expenses.service';
import { localDay } from './expenses.calculations';
const router=Router();
const user=(req:Request)=>(req as Request&{user:{id:string}}).user.id;
const uuid=z.string().uuid();
const text=z.string().trim().min(1).max(100);
const amount=z.number().finite().min(0).max(1_000_000).refine(n=>Math.abs(n*100-Math.round(n*100))<.000001,'Usa un importe con dos decimales como máximo.');
const day=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(s=>Number.isFinite(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s,'Fecha inválida.');
const historicDay=day.refine(s=>s<=localDay(new Date()),'La fecha no puede estar en el futuro.');
export const captureSchema=z.object({eventId:z.string().min(8).max(255),date:z.string().datetime({offset:true}).refine(s=>Date.parse(s)<=Date.now()+300_000&&Date.parse(s)>=Date.now()-7*86400000,'La captura debe corresponder a los últimos siete días.'),amount:amount.refine(n=>n>0),currency:z.string().regex(/^[A-Z]{3}$/),merchant:z.string().trim().min(1).max(250),card:z.string().trim().min(1).max(250).refine(s=>{const label=s.normalize('NFKC').trim();return label.length>0&&label.length<=250;},'Nombre de tarjeta inválido.').optional(),type:z.enum(['PURCHASE','REFUND']).default('PURCHASE')}).strict();
const handle=(fn:(req:Request,res:Response)=>Promise<unknown>)=>async(req:Request,res:Response)=>{try{await fn(req,res);}catch(e){if(e instanceof ZodError){res.status(400).json({error:e.issues[0]?.message??'Datos inválidos.'});return;}if(e instanceof ExpenseError){res.status(e.statusCode).json({error:e.message});return;}console.error('Expense request failed',e instanceof Error?e.message:'unknown');res.status(500).json({error:'No se pudo completar la operación de gastos.'});}};

// Append-only credentials: CARD is legacy single-card; WALLET requires an explicit label.
router.post('/capture',rateLimit({windowMs:60_000,limit:30,standardHeaders:'draft-8',legacyHeaders:false}),handle(async(req,res)=>{
 const token=req.get('Authorization')?.match(/^Bearer (fa_exp_[A-Za-z0-9_-]+)$/)?.[1];if(!token)throw new ExpenseError(401,'Falta la credencial de captura.');
 res.status(201).json(await expensesService.capture(token,captureSchema.parse(req.body)));
}));
router.use(authenticateToken);
router.get('/',handle(async(req,res)=>res.json(await expensesService.overview(user(req),monthSchema.parse(req.query.month??localDay(new Date()).slice(0,7)),z.string().regex(/^[A-Z]{3}$/).parse(req.query.currency??'EUR')))));
router.get('/accounts',handle(async(req,res)=>res.json(await expensesService.bankAccounts(user(req)))));
router.post('/cards',handle(async(req,res)=>res.status(201).json(await expensesService.createCard(user(req),z.object({name:text,kind:z.enum(['CREDIT','DEBIT','FLEXIBLE']),currency:z.string().regex(/^[A-Z]{3}$/),bankAccountId:uuid.nullable().optional(),openingBalance:amount.nullable().optional(),openingDate:historicDay,dueDay:z.number().int().min(1).max(28)}).strict().parse(req.body)))));
router.put('/cards/:id/balance',handle(async(req,res)=>{const b=z.object({amount,date:historicDay}).strict().parse(req.body);res.json(await expensesService.setBalance(user(req),uuid.parse(req.params.id),b.amount,b.date));}));
router.post('/cards/:id/topups',handle(async(req,res)=>{const b=z.object({eventId:uuid,amount:amount.refine(n=>n>0),date:historicDay}).strict().parse(req.body);res.status(201).json(await expensesService.topUpFlexible(user(req),uuid.parse(req.params.id),b));}));
router.post('/cards/merge',handle(async(req,res)=>{const b=z.object({sourceId:uuid,targetId:uuid}).strict().parse(req.body);res.json(await expensesService.mergeProviderCard(user(req),b.sourceId,b.targetId));}));
router.post('/tokens',handle(async(req,res)=>{const b=z.object({cardId:uuid,name:text,scope:z.enum(['CARD','WALLET']).default('CARD')}).strict().parse(req.body);res.status(201).json(await expensesService.createToken(user(req),b.cardId,b.name,b.scope));}));
router.put('/tokens/:id/scope',handle(async(req,res)=>{const b=z.object({scope:z.enum(['CARD','WALLET'])}).strict().parse(req.body);res.json(await expensesService.setTokenScope(user(req),uuid.parse(req.params.id),b.scope));}));
router.put('/wallet-cards/:id',handle(async(req,res)=>{const b=z.object({cardId:uuid}).strict().parse(req.body);res.json(await expensesService.linkWalletCard(user(req),uuid.parse(req.params.id),b.cardId));}));
router.delete('/tokens/:id',handle(async(req,res)=>res.json(await expensesService.revoke(user(req),uuid.parse(req.params.id)))));
const csvBody=z.object({cardId:uuid,csv:z.string().min(1).max(1_500_000)}).strict();
router.post('/import/preview',handle(async(req,res)=>{const b=csvBody.parse(req.body);res.json(await expensesService.preview(user(req),b.cardId,b.csv));}));
router.post('/import',handle(async(req,res)=>{const b=csvBody.parse(req.body);res.json(await expensesService.importCsv(user(req),b.cardId,b.csv));}));
router.post('/statements',handle(async(req,res)=>res.status(201).json(await expensesService.confirmStatement(user(req),z.object({cardId:uuid,startDate:historicDay,endDate:historicDay,dueDate:day,amount}).strict().parse(req.body)))));
router.post('/reconcile',handle(async(req,res)=>res.json(await expensesService.reconcile(user(req)))));
router.get('/review',handle(async(req,res)=>res.json(await expensesService.review(user(req)))));
router.get('/uncategorized',handle(async(req,res)=>{
 const filters=z.object({currency:z.string().regex(/^[A-Z]{3}$/).default('EUR'),
  account:z.string().max(100).optional(),month:monthSchema.optional(),search:z.string().trim().max(250).optional(),
  page:z.coerce.number().int().min(0).max(50000).default(0),limit:z.coerce.number().int().min(1).max(100).default(50),
 }).strict().parse(req.query);
 res.json(await expensesService.uncategorized(user(req),filters));
}));
router.post('/matches',handle(async(req,res)=>{const b=z.object({id:uuid,targetId:uuid}).strict().parse(req.body);res.json(await expensesService.manualMatch(user(req),b.id,b.targetId));}));
router.put('/category',handle(async(req,res)=>res.json(await expensesService.setCategory(user(req),z.object({id:uuid,category:z.string().trim().min(1).max(80),remember:z.boolean()}).strict().parse(req.body)))));
router.put('/budget',handle(async(req,res)=>{const b=z.object({category:text,amount}).strict().parse(req.body);res.json(await expensesService.budget(user(req),b.category,b.amount));}));
router.put('/entries/:id/excluded',handle(async(req,res)=>res.json(await expensesService.exclude(user(req),uuid.parse(req.params.id),z.object({excluded:z.boolean()}).strict().parse(req.body).excluded))));
export default router;
