import { Router, type Request, type Response } from 'express';
import { z, ZodError } from 'zod';
import { authenticateToken } from '../auth/auth.middleware';
import { createPropertySchema, updatePropertySchema, propertyIdSchema, reportQuerySchema } from './real-estate.schema';
import { realEstateService, RealEstateError } from './real-estate.service';

const router=Router();
router.use(authenticateToken);
const userId=(req:Request)=>(req as Request & {user:{id:string}}).user.id;
const year=(req:Request)=>reportQuerySchema.parse(req.query).year;
const id=(req:Request)=>propertyIdSchema.parse(req.params.id);
const versionSchema=z.object({version:z.number().int().positive()}).strict();
const revisionSchema=z.object({version:z.number().int().positive(),periodId:z.string().uuid(),effectiveDate:z.iso.date(),mode:z.enum(['AMOUNT','PERCENT']),value:z.number().finite().min(-99.99).max(100_000_000)}).strict();
const handle=(fn:(req:Request,res:Response)=>Promise<unknown>)=>async(req:Request,res:Response)=>{
    try {await fn(req,res);} catch(error) {
        if(error instanceof ZodError) {res.status(400).json({error:error.issues[0]?.message??'Datos inválidos.',details:error.flatten()});return;}
        if(error instanceof RealEstateError) {res.status(error.status).json({error:error.message});return;}
        console.error('Real estate request failed',error);
        res.status(500).json({error:'No se pudo guardar o cargar el inmueble.'});
    }
};
router.get('/',handle(async(req,res)=>res.json({data:await realEstateService.list(userId(req),year(req))})));
router.post('/',handle(async(req,res)=>res.status(201).json(await realEstateService.create(userId(req),createPropertySchema.parse(req.body).property,year(req)))));
router.get('/:id',handle(async(req,res)=>res.json(await realEstateService.get(userId(req),id(req),year(req)))));
router.put('/:id',handle(async(req,res)=>{
    const body=updatePropertySchema.parse(req.body);
    res.json(await realEstateService.update(userId(req),id(req),body.version,body.property,year(req)));
}));
router.post('/:id/rent-change',handle(async(req,res)=>{
    const body=revisionSchema.parse(req.body);
    res.json(await realEstateService.reviseRent(userId(req),id(req),body.version,body.periodId,body.effectiveDate,body.mode,body.value,year(req)));
}));
router.delete('/:id',handle(async(req,res)=>{
    await realEstateService.delete(userId(req),id(req),versionSchema.parse(req.body).version);
    res.status(204).send();
}));
export default router;
