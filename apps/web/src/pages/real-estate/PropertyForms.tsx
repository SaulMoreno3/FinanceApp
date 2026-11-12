import { useState, type ReactNode } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { acquisitionCost } from '../../../../api/src/modules/real-estate/real-estate.calculations';
import { categories, frequencies, money, today, type PropertyInput, type RentPeriod, type Expense, type Charge } from './real-estate.types';

const selectStyle='h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground';
export function Field({label,children,hint}:{label:string;children:ReactNode;hint?:string}) {
    return <label className="block space-y-1.5 text-sm"><span className="font-medium">{label}</span>{children}{hint&&<span className="block text-xs text-muted-foreground">{hint}</span>}</label>;
}
function MoneyField({label,value,onChange}:{label:string;value:number;onChange:(v:number)=>void}) {
    return <Field label={label}><Input type="number" min="0" step="0.01" max="100000000" value={value} onChange={e=>onChange(Number(e.target.value))} required /></Field>;
}
function Submit({busy}:{busy:boolean}) {return <div className="flex justify-end pt-2"><Button type="submit" disabled={busy}>{busy?'Guardando…':'Guardar'}</Button></div>;}
const empty:PropertyInput={name:'',address:'',acquisitionDate:today(),purchasePrice:0,acquisitionTax:0,notaryFees:0,registryFees:0,agencyFees:0,renovationCost:0,otherCosts:0,currentValue:null,mortgage:null,notes:'',rentPeriods:[],expenses:[],receipts:[]};
export function PropertyForm({initial,onSave,busy}:{initial?:PropertyInput;onSave:(data:PropertyInput)=>Promise<void>;busy:boolean}) {
    const [data,setData]=useState<PropertyInput>(initial??empty);
    const update=(patch:Partial<PropertyInput>)=>setData({...data,...patch});
    const cost=acquisitionCost(data),equity=cost-(data.mortgage?.principal??0);
    const costFields=[['acquisitionTax','Impuestos de adquisición (€)'],['notaryFees','Notaría (€)'],['registryFees','Registro (€)'],['agencyFees','Agencia / gestoría (€)'],['renovationCost','Reforma inicial (€)'],['otherCosts','Otros costes iniciales (€)']] as const;
    return <form className="space-y-5" onSubmit={e=>{e.preventDefault();void onSave(data);}}>
        <div className="grid gap-4 sm:grid-cols-2"><Field label="Nombre del piso"><Input value={data.name} onChange={e=>update({name:e.target.value})} maxLength={120} placeholder="Piso del centro" required /></Field><Field label="Fecha de adquisición"><Input type="date" value={data.acquisitionDate} onInput={e=>update({acquisitionDate:e.currentTarget.value})} required /></Field></div>
        <Field label="Dirección (opcional)"><Input value={data.address} onChange={e=>update({address:e.target.value})} maxLength={250} /></Field>
        <div className="grid gap-4 sm:grid-cols-2"><MoneyField label="Precio de adquisición (€)" value={data.purchasePrice} onChange={v=>update({purchasePrice:v})}/><Field label="Valor actual estimado (€)" hint="Opcional. Útil para medir la rentabilidad de un piso recibido sin coste."><Input type="number" min="0" max="100000000" step="0.01" value={data.currentValue??''} onChange={e=>update({currentValue:e.target.value===''?null:Number(e.target.value)})} /></Field></div>
        <p className="text-xs text-muted-foreground">Si lo recibiste sin pagar un precio, indica 0 €. Registra por separado los impuestos y gastos que sí asumiste.</p>
        <details className="rounded-lg border p-3" open={costFields.some(([key])=>data[key]>0)||undefined}><summary className="cursor-pointer text-sm font-medium">Gastos de adquisición y puesta a punto</summary><div className="mt-4 grid gap-4 sm:grid-cols-2">{costFields.map(([key,label])=><MoneyField key={key} label={label} value={data[key]} onChange={value=>update({[key]:value})}/>)}</div></details>
        <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={data.mortgage!==null} onChange={e=>update({mortgage:e.target.checked?{principal:0,annualRate:3,termMonths:300,firstPaymentDate:data.acquisitionDate,fees:0}:null})}/> Tiene hipoteca</label>
        {data.mortgage&&<div className="space-y-4 rounded-lg border p-4"><p className="text-xs text-muted-foreground">Cuota teórica con TIN constante y amortización francesa. El interés puede ser 0 %. No incluye revisiones de tipo ni amortizaciones extraordinarias.</p><div className="grid gap-4 sm:grid-cols-2">
            <MoneyField label="Préstamo inicial (€)" value={data.mortgage.principal} onChange={v=>update({mortgage:{...data.mortgage!,principal:v}})}/>
            <Field label="TIN anual (%)"><Input type="number" min="0" max="30" step="0.001" value={data.mortgage.annualRate} onChange={e=>update({mortgage:{...data.mortgage!,annualRate:Number(e.target.value)}})} required/></Field>
            <Field label="Plazo (meses)"><Input type="number" min="1" max="600" step="1" value={data.mortgage.termMonths} onChange={e=>update({mortgage:{...data.mortgage!,termMonths:Number(e.target.value)}})} required/></Field>
            <Field label="Primera cuota"><Input type="date" value={data.mortgage.firstPaymentDate} onInput={e=>update({mortgage:{...data.mortgage!,firstPaymentDate:e.currentTarget.value}})} required/></Field>
            <MoneyField label="Gastos iniciales de financiación (€)" value={data.mortgage.fees} onChange={v=>update({mortgage:{...data.mortgage!,fees:v}})}/>
        </div></div>}
        <dl className="grid gap-3 rounded-lg bg-muted/40 p-4 text-sm sm:grid-cols-2"><div><dt className="text-muted-foreground">Coste total</dt><dd className="mt-1 font-semibold">{money(cost)}</dd></div><div><dt className="text-muted-foreground">Capital propio · entrada y gastos</dt><dd className="mt-1 font-semibold">{money(equity)}</dd></div></dl>
        <Field label="Notas"><textarea className={`${selectStyle} min-h-20 py-2`} value={data.notes} maxLength={3000} onChange={e=>update({notes:e.target.value})}/></Field><Submit busy={busy}/>
    </form>;
}
export function RentForm({initial,minDate,onSave,busy}:{initial?:RentPeriod;minDate:string;onSave:(data:RentPeriod)=>Promise<void>;busy:boolean}) {
    const [data,setData]=useState<RentPeriod>(initial??{id:crypto.randomUUID(),startDate:minDate,endDate:null,monthlyRent:0,dueDay:1,autoCollect:true,tenant:''});
    return <form className="space-y-4" onSubmit={e=>{e.preventDefault();void onSave(data);}}>
        <MoneyField label="Renta mensual (€)" value={data.monthlyRent} onChange={v=>setData({...data,monthlyRent:v})}/>
        <div className="grid gap-4 sm:grid-cols-2"><Field label="Desde (incluido)"><Input type="date" min={minDate} value={data.startDate} onInput={e=>setData({...data,startDate:e.currentTarget.value})} required/></Field><Field label="Hasta (incluido)" hint="Vacío si continúa."><Input type="date" min={data.startDate} value={data.endDate??''} onInput={e=>setData({...data,endDate:e.currentTarget.value||null})}/></Field></div>
        <div className="grid gap-4 sm:grid-cols-2"><Field label="Día mensual de cobro"><Input type="number" min="1" max="31" value={data.dueDay} onChange={e=>setData({...data,dueDay:Number(e.target.value)})} required/></Field><Field label="Inquilino o referencia (opcional)"><Input value={data.tenant} maxLength={120} onChange={e=>setData({...data,tenant:e.target.value})}/></Field></div>
        <label className="flex items-start gap-2 text-sm"><input className="mt-1" type="checkbox" checked={data.autoCollect} onChange={e=>setData({...data,autoCollect:e.target.checked})}/><span>Dar por cobradas automáticamente las rentas vencidas<span className="mt-1 block text-xs text-muted-foreground">También se aplica al periodo histórico que indiques. Puedes corregir cada recibo; las rentas futuras se mantienen previstas.</span></span></label>
        <p className="text-xs text-muted-foreground">Los meses incompletos se prorratean por días naturales. Los periodos no pueden solaparse. No se realizan cargos bancarios.</p><Submit busy={busy}/>
    </form>;
}
export type RentRevision={periodId:string;effectiveDate:string;mode:'AMOUNT'|'PERCENT';value:number};
export function RentRevisionForm({period,onSave,busy}:{period:RentPeriod;onSave:(data:RentRevision)=>Promise<void>;busy:boolean}) {
    const next=new Date(`${period.startDate}T00:00:00Z`);next.setUTCDate(next.getUTCDate()+1);
    const min=next.toISOString().slice(0,10);
    const [date,setDate]=useState(today()>min&&(!period.endDate||today()<=period.endDate)?today():min);
    const [mode,setMode]=useState<'AMOUNT'|'PERCENT'>('AMOUNT');
    const [value,setValue]=useState(period.monthlyRent);
    const nextRent=mode==='AMOUNT'?value:Math.round(period.monthlyRent*(1+value/100)*100)/100;
    return <form className="space-y-4" onSubmit={e=>{e.preventDefault();void onSave({periodId:period.id,effectiveDate:date,mode,value});}}>
        <p className="text-sm text-muted-foreground">Renta anterior: {money(period.monthlyRent)} / mes. Se conserva hasta el día anterior a la revisión.</p>
        <Field label="Aplicar desde"><Input type="date" value={date} min={min} max={period.endDate??undefined} onInput={e=>setDate(e.currentTarget.value)} required/></Field>
        <Field label="Tipo de cambio"><select className={selectStyle} value={mode} onChange={e=>{setMode(e.target.value as typeof mode);setValue(e.target.value==='PERCENT'?3:period.monthlyRent);}}><option value="AMOUNT">Fijar nuevo importe</option><option value="PERCENT">Variación porcentual</option></select></Field>
        <Field label={mode==='AMOUNT'?'Nueva renta mensual (€)':'Variación (%)'}><Input type="number" step="0.01" min={mode==='AMOUNT'?0:-99.99} max={mode==='AMOUNT'?100000000:10000} value={value} onChange={e=>setValue(Number(e.target.value))} required/></Field>
        <p className="rounded-md bg-muted/40 p-3 text-sm">Nueva renta: <strong>{money(nextRent)} / mes</strong></p><Submit busy={busy}/>
    </form>;
}
export function ExpenseForm({initial,minDate,onSave,busy}:{initial?:Expense;minDate:string;onSave:(data:Expense)=>Promise<void>;busy:boolean}) {
    const [data,setData]=useState<Expense>(initial??{id:crypto.randomUUID(),description:'',category:'COMMUNITY',amount:0,date:today()<minDate?minDate:today(),endDate:null,frequency:'ONCE'});
    return <form className="space-y-4" onSubmit={e=>{e.preventDefault();void onSave({...data,endDate:data.frequency==='ONCE'?null:data.endDate});}}>
        <Field label="Concepto"><Input value={data.description} maxLength={160} onChange={e=>setData({...data,description:e.target.value})} required placeholder="Comunidad, reparación de caldera…"/></Field>
        <div className="grid gap-4 sm:grid-cols-2"><Field label="Categoría"><select className={selectStyle} value={data.category} onChange={e=>setData({...data,category:e.target.value as Expense['category']})}>{Object.entries(categories).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></Field><MoneyField label="Importe por cargo (€)" value={data.amount} onChange={v=>setData({...data,amount:v})}/></div>
        <Field label="Frecuencia"><select className={selectStyle} value={data.frequency} onChange={e=>setData({...data,frequency:e.target.value as Expense['frequency']})}>{Object.entries(frequencies).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></Field>
        <div className="grid gap-4 sm:grid-cols-2"><Field label={data.frequency==='ONCE'?'Fecha del gasto':'Primer cargo'}><Input type="date" min={minDate} value={data.date} onInput={e=>setData({...data,date:e.currentTarget.value})} required/></Field>{data.frequency!=='ONCE'&&<Field label="Última fecha (opcional)"><Input type="date" min={data.date} value={data.endDate??''} onInput={e=>setData({...data,endDate:e.currentTarget.value||null})}/></Field>}</div>
        <p className="text-xs text-muted-foreground">Los cargos recurrentes se computan en las fechas programadas, sin duplicarlos al abrir la app. No incluyas aquí las cuotas de hipoteca ni los gastos iniciales de la ficha.</p><Submit busy={busy}/>
    </form>;
}
export function ReceiptForm({charge,onSave,onReset,busy}:{charge:Charge;onSave:(amount:number,paidOn:string|null)=>Promise<void>;onReset:()=>Promise<void>;busy:boolean}) {
    const [amount,setAmount]=useState(charge.source==='MANUAL'?charge.received:charge.expected);
    const [date,setDate]=useState(charge.paidOn&&charge.paidOn<=today()?charge.paidOn:today());
    return <form className="space-y-4" onSubmit={e=>{e.preventDefault();void onSave(amount,amount===0?null:date);}}>
        <p className="text-sm text-muted-foreground">Renta prevista: {money(charge.expected)}. Indica 0 € para marcar un impago o un importe menor para un cobro parcial.</p>
        <MoneyField label="Importe cobrado (€)" value={amount} onChange={setAmount}/><Field label="Fecha de cobro"><Input type="date" max={today()} value={date} onInput={e=>setDate(e.currentTarget.value)} required={amount>0}/></Field>
        <div className="flex flex-wrap items-center justify-between gap-3">{charge.source==='MANUAL'&&<Button type="button" variant="outline" disabled={busy} onClick={()=>void onReset()}>Restaurar según tramo</Button>}<Submit busy={busy}/></div>
    </form>;
}
