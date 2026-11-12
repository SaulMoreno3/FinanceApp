import { Router, type Request, type Response } from 'express';
import { z, ZodError } from 'zod';
import { authenticateToken } from '../auth/auth.middleware';
import { monthSchema, saveSchema } from './planning.schema';
import { planningService, PlanningError } from './planning.service';
const router=Router();router.use(authenticateToken);
const uid=(req:Request)=>(req as Request & {user:{id:string}}).user.id;
const handle=(fn:(req:Request,res:Response)=>Promise<unknown>)=>async(req:Request,res:Response)=>{
 try{await fn(req,res);}catch(e){if(e instanceof ZodError){res.status(400).json({error:e.issues[0]?.message??'Datos inválidos.'});return;}if(e instanceof PlanningError){res.status(e.status).json({error:e.message});return;}console.error('Planning request failed',e);res.status(500).json({error:'No se pudo cargar o guardar la planificación.'});}
};
router.get('/',handle(async(req,res)=>{
 const month=monthSchema.parse(req.query.month??new Date().toISOString().slice(0,7));
 const overview=await planningService.overview(uid(req),month);
 res.json(overview);
}));
router.put('/',handle(async(req,res)=>{const body=saveSchema.parse(req.body);res.json(await planningService.save(uid(req),body.version,body.plan));}));
router.post('/close',handle(async(req,res)=>{const body=z.object({month:monthSchema,fingerprint:z.string().regex(/^[a-f0-9]{64}$/)}).strict().parse(req.body);res.json(await planningService.close(uid(req),body.month,body.fingerprint));}));
export default router;
