import { useState } from 'react';
import { Link } from 'react-router-dom';
import { expenseMoney, type AvailableFinances } from './expenses.types';

export default function ExpenseAvailability({data,compact=false}:{data:AvailableFinances;compact?:boolean}) {
 const [open,setOpen]=useState(false);
 const date=(day:string)=>new Date(day+'T12:00:00Z').toLocaleDateString('es-ES',{day:'numeric',month:'short'});
 return <section className="space-y-3 border-b pb-6" aria-label="Dinero disponible real">
  <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-sm text-muted-foreground">Disponible tras compromisos · EUR</p><p className="mt-2 text-3xl font-semibold tracking-tight tabular-nums">{expenseMoney(data.available)}</p></div><p className="max-w-sm text-xs leading-5 text-muted-foreground">Crédito, pagos previstos hasta el {date(data.horizon)} y reserva ya apartados. Pluxee e inversiones no se suman.</p></div>
  {data.estimated&&<p className="text-xs text-amber-600 dark:text-amber-400">Estimación: {data.unknownBalances>0?'faltan saldos; ':''}{data.staleAccounts>0?'hay saldos con más de dos días; ':''}{data.unassigned>0?'hay pagos con tarjeta aún sin asociar; ':''}consulta el desglose antes de decidir.</p>}
  <button type="button" aria-expanded={open} onClick={()=>setOpen(!open)} className="min-h-9 text-xs underline underline-offset-4">{open?'Ocultar desglose':'Cómo se calcula'}</button>
  {open&&<div className="space-y-4"><dl className="grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">{[
   ['Cuentas bancarias',data.bank],['Fondo monetario flexible',data.monetaryFunds],['Crédito pendiente',-data.credit],['Débito posterior al saldo bancario',-data.unreflectedDebits],['Pagos sin tarjeta asociada (reserva prudente)',-data.unassigned],['Compromisos próximos 30 días y vencidos',-data.committed],['Reserva personal',-data.reserve],
  ].map(([label,amount])=><div key={label} className="flex justify-between gap-3 border-b py-2"><dt className="text-muted-foreground">{label}</dt><dd className="shrink-0 tabular-nums">{expenseMoney(Number(amount))}</dd></div>)}</dl>
   {!compact&&data.commitments.length>0&&<div><h3 className="text-sm font-medium">Pagos reservados</h3><ul className="mt-2 divide-y text-xs">{data.commitments.map((c,i)=><li key={`${c.date}-${i}`} className="flex justify-between gap-3 py-2"><span>{date(c.date)} · {c.name}</span><span className="shrink-0 tabular-nums">{expenseMoney(c.amount)}</span></li>)}</ul></div>}
   <p className="text-xs leading-5 text-muted-foreground">Solo incluye los compromisos registrados, no todos los gastos futuros. Los presupuestos orientan el consumo y no se restan otra vez. No incluye futuros ingresos ni supone que una cuota esté pagada.</p><Link to="/planning" className="inline-block text-xs underline underline-offset-4">Revisar planificación y reserva</Link>
  </div>}
 </section>;
}
