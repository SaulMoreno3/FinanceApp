import { useState } from 'react';
import { fetchAPI } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { expenseMoney, expenseSelect, type ExpensesOverview } from './expenses.types';

export default function ExpenseWalletCards({data,refresh,notify}:{data:ExpensesOverview;refresh:()=>Promise<void>;notify:(text:string)=>void}) {
 const [targets,setTargets]=useState<Record<string,string>>({}),[busy,setBusy]=useState(false);
 const link=async(id:string)=>{setBusy(true);try{const result=await fetchAPI<{recorded:number}>(`/expenses/wallet-cards/${id}`,{method:'PUT',body:JSON.stringify({cardId:targets[id]})});await refresh();notify(`Tarjeta vinculada. ${result.recorded} ${result.recorded===1?'pago registrado y conciliado':'pagos registrados y conciliados'}.`);}catch(e){notify((e as Error).message);}finally{setBusy(false);}};
 return <section className="space-y-5 border-t pt-6" aria-labelledby="wallet-cards-heading">
  <div><h2 id="wallet-cards-heading" className="text-xl font-semibold">Tarjetas recibidas de Wallet</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Cada pago recibido ya cuenta en tus gastos. Asocia cada nombre una sola vez para ajustar su saldo y separar crédito, débito y Pluxee. No hace falta confirmación bancaria.</p><p className="mt-2 text-xs leading-5 text-muted-foreground">Si dos tarjetas tienen exactamente el mismo nombre en Wallet, envía un identificador distinto. No se deduce crédito o débito a partir de «Visa».</p></div>
  {!data.walletCards.length?<p className="rounded-lg border border-dashed p-5 text-sm text-muted-foreground">Aquí aparecerá la tarjeta cuando llegue el primer pago con el campo card.</p>:data.walletCards.map(wallet=><div key={wallet.id} className="space-y-3 rounded-lg border p-4">
   <div><h3 className="break-words font-medium">{wallet.name} · {wallet.currency}</h3><p className="mt-1 text-sm text-muted-foreground">{wallet.cardId?`Vinculada a ${data.cards.find(c=>c.id===wallet.cardId)?.name??'tu tarjeta'}`:`${wallet.pending} pagos · ${expenseMoney(wallet.pendingAmount,wallet.currency)} netos, ya incluidos en el consumo`}</p></div>
   {!wallet.cardId&&<div className="flex flex-col gap-3 sm:flex-row"><select aria-label={`Tarjeta correspondiente a ${wallet.name}`} className={`${expenseSelect} w-full max-w-full sm:w-auto sm:flex-1`} value={targets[wallet.id]??''} onChange={e=>setTargets({...targets,[wallet.id]:e.target.value})}><option value="">Selecciona su tarjeta en Finance</option>{data.cards.filter(c=>c.currency===wallet.currency).map(c=><option key={c.id} value={c.id}>{c.name} · {c.kind==='CREDIT'?'Crédito':c.kind==='FLEXIBLE'?'Retribución flexible':'Débito'}</option>)}</select><Button className="shrink-0" disabled={busy||!targets[wallet.id]} onClick={()=>void link(wallet.id)}>Asociar tarjeta</Button></div>}
   {!wallet.cardId&&!data.cards.some(c=>c.currency===wallet.currency)&&<p className="text-sm text-muted-foreground">Añade arriba una tarjeta en {wallet.currency}, indicando su tipo y, si es débito, su cuenta de cargo.</p>}
   {wallet.pending>0&&<ul className="space-y-2 border-t pt-3 text-sm">{data.walletPending.filter(p=>p.walletCardId===wallet.id).map(p=><li key={p.id} className="flex flex-wrap justify-between gap-2"><span className="min-w-0 break-words">{new Date(p.date).toLocaleDateString('es-ES')} · {p.merchant}</span><span className="tabular-nums">{expenseMoney(p.amount,p.currency)}</span></li>)}</ul>}
  </div>)}
 </section>;
}
