import { useState } from 'react';
import { fetchAPI, postAPI } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { expenseMoney, type ExpensesOverview } from './expenses.types';

export default function ExpenseFlexible({data,refresh,notify}:{data:ExpensesOverview;refresh:()=>Promise<void>;notify:(text:string)=>void}) {
 const cards=data.cards.filter(c=>c.kind==='FLEXIBLE');
 const [cardId,setCardId]=useState(cards[0]?.id??''),[balance,setBalance]=useState(''),[amount,setAmount]=useState(''),[date,setDate]=useState(data.today),[eventId,setEventId]=useState(()=>crypto.randomUUID()),[busy,setBusy]=useState(false);
 const perform=async(fn:()=>Promise<void>)=>{setBusy(true);try{await fn();await refresh();}catch(e){notify((e as Error).message);}finally{setBusy(false);}};
 if(!cards.length)return null;
 return <section className="space-y-4 border-t pt-6" aria-labelledby="flexible-title"><h2 id="flexible-title" className="text-lg font-semibold">Pluxee y retribución flexible</h2><p className="max-w-2xl text-sm leading-6 text-muted-foreground">Saldo de uso restringido, separado del banco y de la deuda. Registrar la nómina no acredita una recarga ni permite conocer cuánto queda en la tarjeta.</p>
  {cards.map(c=><p key={c.id} className="text-sm">{c.name} · Saldo disponible: <span className="font-medium tabular-nums">{c.remaining===null?'sin indicar':expenseMoney(c.remaining,c.currency)}</span></p>)}
  <div className="flex flex-wrap gap-4"><div><Label htmlFor="flexible-card">Tarjeta</Label><select id="flexible-card" className="mt-1 block h-10 rounded-md border bg-background px-3 text-sm" value={cardId} onChange={e=>setCardId(e.target.value)}>{cards.map(c=><option value={c.id} key={c.id}>{c.name}</option>)}</select></div><div><Label htmlFor="flexible-date">Fecha de cierre / recarga</Label><Input id="flexible-date" type="date" max={data.today} value={date} onChange={e=>setDate(e.target.value)}/></div></div>
  <div className="grid gap-5 sm:grid-cols-2"><form className="space-y-3" onSubmit={e=>{e.preventDefault();void perform(async()=>{await fetchAPI(`/expenses/cards/${cardId}/balance`,{method:'PUT',body:JSON.stringify({amount:Number(balance),date})});setBalance('');notify('Saldo de Pluxee actualizado al cierre del día indicado.');});}}><Label htmlFor="flexible-balance">Saldo real al cierre de ese día</Label><Input id="flexible-balance" type="number" min="0" step="0.01" value={balance} onChange={e=>setBalance(e.target.value)} required/><Button variant="outline" disabled={busy}>Guardar saldo</Button></form>
   <form className="space-y-3" onSubmit={e=>{e.preventDefault();void perform(async()=>{await postAPI(`/expenses/cards/${cardId}/topups`,{eventId,amount:Number(amount),date});setEventId(crypto.randomUUID());setAmount('');notify('Recarga guardada. No se cuenta como un nuevo ingreso ni como gasto.');});}}><Label htmlFor="flexible-topup">Recarga efectivamente recibida</Label><Input id="flexible-topup" type="number" min="0.01" step="0.01" value={amount} onChange={e=>setAmount(e.target.value)} required/><Button variant="outline" disabled={busy}>Registrar recarga</Button></form></div>
  <p className="text-xs leading-5 text-muted-foreground">El saldo se calcula desde el cierre indicado, añadiendo recargas y restando compras posteriores. Si actualizas el saldo con una recarga ya incluida, no vuelvas a registrarla.</p>
 </section>;
}
