import { prisma } from '../../common/db/prisma';
import { propertySchema, type PropertyInput } from './real-estate.schema';
import { changeRent, propertyReport } from './real-estate.calculations';
import { randomUUID } from 'node:crypto';

export class RealEstateError extends Error {
    constructor(public status:number,message:string) {super(message);}
}
export class RealEstateService {
    async list(userId:string,year:number) {
        const records=await prisma.realEstateProperty.findMany({where:{userId},orderBy:{createdAt:'asc'}});
        return records.map(record=>this.dto(record,year));
    }
    private dto(record:{id:string;version:number;data:unknown},year:number) {
        const property=propertySchema.parse(record.data);
        return {id:record.id,version:record.version,property,report:propertyReport(property,year)};
    }
    async get(userId:string,id:string,year:number) {
        const record=await prisma.realEstateProperty.findFirst({where:{id,userId}});
        if(!record) throw new RealEstateError(404,'Inmueble no encontrado.');
        return this.dto(record,year);
    }
    async create(userId:string,property:PropertyInput,year:number) {
        const record=await prisma.realEstateProperty.create({data:{userId,data:property}});
        return this.dto(record,year);
    }
    async update(userId:string,id:string,version:number,property:PropertyInput,year:number) {
        // Version checking prevents one browser tab from overwriting another tab's ledger.
        return prisma.$transaction(async tx=>{
            const record=await tx.realEstateProperty.findFirst({where:{id,userId}});
            if(!record) throw new RealEstateError(404,'Inmueble no encontrado.');
            const result=await tx.realEstateProperty.updateMany({where:{id,userId,version},data:{data:property,version:{increment:1}}});
            if(!result.count) throw new RealEstateError(409,'El inmueble ha cambiado. Recarga la ficha antes de guardar.');
            return this.dto({id,version:version+1,data:property},year);
        });
    }
    async reviseRent(userId:string,id:string,version:number,periodId:string,effectiveDate:string,mode:'AMOUNT'|'PERCENT',value:number,year:number) {
        const record=await this.get(userId,id,year);
        if(record.version!==version) throw new RealEstateError(409,'El inmueble ha cambiado. Recarga la ficha antes de guardar.');
        if(record.property.receipts.some(r=>r.periodId===periodId && r.month>=effectiveDate.slice(0,7))) throw new RealEstateError(409,'Hay cobros manuales desde ese mes. Revisa esos cobros antes de dividir el tramo.');
        let rentPeriods;
        try {rentPeriods=changeRent(record.property.rentPeriods,periodId,effectiveDate,mode,value,randomUUID());}
        catch(error) {throw new RealEstateError(400,error instanceof Error?error.message:'Revisión inválida.');}
        const parsed=propertySchema.safeParse({...record.property,rentPeriods});
        if(!parsed.success) throw new RealEstateError(400,parsed.error.issues[0].message);
        return this.update(userId,id,version,parsed.data,year);
    }
    async delete(userId:string,id:string,version:number) {
        const record=await prisma.realEstateProperty.findFirst({where:{id,userId},select:{id:true}});
        if(!record) throw new RealEstateError(404,'Inmueble no encontrado.');
        const result=await prisma.realEstateProperty.deleteMany({where:{id,userId,version}});
        if(!result.count) throw new RealEstateError(409,'El inmueble ha cambiado. Recarga antes de eliminarlo.');
    }
}
export const realEstateService=new RealEstateService();
