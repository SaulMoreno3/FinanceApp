import type { PropertyInput, RentPeriod } from '../../../../api/src/modules/real-estate/real-estate.schema';
import type { propertyReport } from '../../../../api/src/modules/real-estate/real-estate.calculations';
export type { PropertyInput, RentPeriod };
export type Expense = PropertyInput['expenses'][number];
export type PropertyReport = ReturnType<typeof propertyReport>;
export type Charge = PropertyReport['charges'][number];
export interface PropertyRecord {id:string;version:number;property:PropertyInput;report:PropertyReport}
export const money=(v:number)=>new Intl.NumberFormat('es-ES',{style:'currency',currency:'EUR',maximumFractionDigits:2}).format(v);
export const percent=(v:number|null)=>v===null?'No aplicable':`${new Intl.NumberFormat('es-ES',{maximumFractionDigits:2}).format(v)} %`;
export const today=()=>new Date().toISOString().slice(0,10);
export const dateLabel=(value:string)=>new Intl.DateTimeFormat('es-ES',{timeZone:'UTC'}).format(new Date(`${value}T00:00:00Z`));
export const categories:Record<Expense['category'],string>={COMMUNITY:'Comunidad',IBI:'IBI y tasas',INSURANCE:'Seguro',MAINTENANCE:'Mantenimiento',UTILITIES:'Suministros',MANAGEMENT:'Gestión',OTHER:'Otros'};
export const frequencies:Record<Expense['frequency'],string>={ONCE:'Puntual',MONTHLY:'Mensual',YEARLY:'Anual'};
