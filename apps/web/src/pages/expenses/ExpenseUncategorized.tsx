import { useEffect, useMemo, useState } from 'react';
import { Check, Search } from 'lucide-react';
import { fetchAPI } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { expenseCategories, expenseMoney, expenseSelect, type ExpenseTransaction, type UncategorizedExpenses } from './expenses.types';

const monthLabel=(month:string)=>new Date(`${month}-01T12:00:00Z`).toLocaleDateString('es-ES',{month:'long',year:'numeric'});

export default function ExpenseUncategorized({currency,refresh,notify}:{currency:string;refresh:()=>Promise<void>;notify:(message:string)=>void}) {
 const [response,setResponse]=useState<{key:string;data:UncategorizedExpenses|null;error:string}|null>(null);
 const [account,setAccount]=useState(''),[month,setMonth]=useState(''),[search,setSearch]=useState(''),[query,setQuery]=useState('');
 const [page,setPage]=useState(0),[revision,setRevision]=useState(0),[saving,setSaving]=useState(''),[error,setError]=useState('');
 const [remember,setRemember]=useState<Record<string,boolean>>({}),[custom,setCustom]=useState<ExpenseTransaction|null>(null),[newCategory,setNewCategory]=useState('');
 useEffect(()=>{const timer=setTimeout(()=>{setQuery(search);setPage(0);},250);return()=>clearTimeout(timer);},[search]);
 const params=new URLSearchParams({currency,page:String(page)});
 if(account)params.set('account',account);if(month)params.set('month',month);if(query)params.set('search',query);
 const url=`/expenses/uncategorized?${params}`;
 const requestKey=`${url}#${revision}`;
 const data=response?.data??null,loading=response?.key!==requestKey;
 const failure=error||(response?.key===requestKey?response.error:'');
 useEffect(()=>{
  const controller=new AbortController();
  void fetchAPI<UncategorizedExpenses>(url,{signal:controller.signal}).then(result=>setResponse({key:requestKey,data:result,error:''}))
   .catch(e=>{if(e.name!=='AbortError')setResponse(current=>({key:requestKey,data:current?.data??null,error:e.message}));});
  return()=>controller.abort();
 },[url,requestKey]);
 const categories=useMemo(()=>[...new Set([...expenseCategories,...(data?.categories??[])])]
  .filter(c=>c!=='Sin categoría').sort((a,b)=>a.localeCompare(b,'es')),[data]);
 const disabled=loading||!!saving;
 const resetFilters=()=>{setAccount('');setMonth('');setSearch('');setQuery('');setPage(0);};
 const save=async(entry:ExpenseTransaction,category:string)=>{
  setSaving(entry.id);setError('');
  try {
   await fetchAPI('/expenses/category',{method:'PUT',body:JSON.stringify({id:entry.id,category:category.trim(),remember:remember[entry.id]??true})});
   setCustom(null);setNewCategory('');setRevision(n=>n+1);
   notify(`Categoría «${category.trim()}» guardada${(remember[entry.id]??true)?' y recordada para este comercio':''}.`);
   try{await refresh();}catch{setError('La categoría se ha guardado, pero no se pudo actualizar el resumen. Recarga la página.');}
  } catch(e){setError((e as Error).message);} finally{setSaving('');}
 };
 return <section className="space-y-5" aria-labelledby="uncategorized-title">
  <div>
   <div className="flex items-center justify-between gap-3"><h2 id="uncategorized-title" className="min-w-0 text-lg font-semibold">Movimientos sin categoría</h2>
   {data&&<p className="shrink-0 text-xs tabular-nums text-muted-foreground">{data.total} pendientes</p>}</div>
   <p className="mt-1 text-sm text-muted-foreground">Todo el historial en {currency}. Guardado al elegir categoría.</p>
  </div>
  <div className="grid grid-cols-2 gap-3 lg:grid-cols-[1.4fr_1fr_1fr_auto]">
   <div className="col-span-2 lg:col-span-1"><Label htmlFor="uncategorized-search" className="text-xs">Comercio o concepto</Label><div className="relative mt-1"><Search aria-hidden="true" className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground"/><Input id="uncategorized-search" className="pl-9" name="merchant-search" autoComplete="off" placeholder="Buscar pendientes…" maxLength={250} value={search} disabled={!!saving} onChange={e=>setSearch(e.target.value)}/></div></div>
   <div><Label htmlFor="uncategorized-account" className="text-xs">Cuenta o tarjeta</Label><select id="uncategorized-account" className={`${expenseSelect} mt-1 w-full`} value={account} disabled={disabled} onChange={e=>{setAccount(e.target.value);setPage(0);}}><option value="">Todas las cuentas y tarjetas</option>{data?.accounts.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></div>
   <div><Label htmlFor="uncategorized-month" className="text-xs">Periodo de revisión</Label><select id="uncategorized-month" className={`${expenseSelect} mt-1 w-full`} value={month} disabled={disabled} onChange={e=>{setMonth(e.target.value);setPage(0);}}><option value="">Todo el historial</option>{data?.months.map(m=><option key={m} value={m}>{monthLabel(m)}</option>)}</select></div>
   {(account||month||search)&&<Button variant="ghost" className="hidden self-end lg:inline-flex" disabled={!!saving} onClick={resetFilters}>Limpiar filtros</Button>}
  </div>
  <div className="flex items-start justify-between gap-3"><details className="text-xs text-muted-foreground"><summary className="min-h-9 cursor-pointer py-2 focus-visible:outline-2 focus-visible:outline-ring">Cómo funciona «Recordar»</summary><p className="mt-2 leading-5">Aplica la categoría al mismo comercio, también en próximos cargos. Conserva tus correcciones manuales.</p></details>{(account||month||search)&&<Button variant="ghost" size="sm" className="shrink-0 lg:hidden" disabled={!!saving} onClick={resetFilters}>Limpiar filtros</Button>}</div>
  {failure&&<div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-destructive/40 p-3 text-sm"><p>{failure}</p><Button size="sm" variant="outline" disabled={!!saving} onClick={()=>{setError('');setRevision(n=>n+1);}}>Reintentar</Button></div>}
  <div aria-busy={disabled} className="overflow-hidden rounded-lg border">
   <table role="table" className="block w-full text-left text-sm xl:table">
    <caption className="sr-only">Gastos y devoluciones pendientes de categorizar. La categoría se guarda automáticamente.</caption>
    <thead role="rowgroup" className="sr-only bg-muted/30 text-xs text-muted-foreground xl:not-sr-only xl:table-header-group"><tr role="row">{['Fecha','Comercio / cuenta','Importe','Categoría','Recordar'].map(label=><th role="columnheader" key={label} scope="col" className={`px-4 py-3 font-medium ${label==='Importe'?'text-right':''}`}>{label}</th>)}</tr></thead>
    <tbody role="rowgroup" className="block xl:table-row-group">
     {loading?<tr><td colSpan={5} className="p-10 text-center text-muted-foreground" role="status">Cargando movimientos pendientes…</td></tr>:failure&&!data?<tr><td colSpan={5} className="p-10 text-center text-muted-foreground">No se pudieron cargar los movimientos.</td></tr>:data?.transactions.map(t=>{
      const merchant=t.merchantName||t.description||'Sin concepto';
      return <tr role="row" key={t.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-t p-4 hover:bg-muted/15 xl:table-row xl:p-0">
       <td role="cell" className="hidden whitespace-nowrap px-4 py-4 text-xs text-muted-foreground xl:table-cell">{t.date.split('-').reverse().join('/')}</td>
       <td role="cell" className="min-w-0 xl:max-w-64 xl:px-4 xl:py-4"><p className="break-words font-medium" title={t.categoryReason||merchant}>{merchant}</p><p className="mt-1 truncate text-xs text-muted-foreground"><span className="xl:hidden">{t.date.split('-').reverse().join('/')} · </span>{t.accountName}{t.entryType==='REFUND'?' · Devolución':''}{t.provisional?' · Provisional':''}{t.sameMerchantCount!>1?` · ${t.sameMerchantCount} del mismo comercio`:''}</p></td>
       <td role="cell" className={`whitespace-nowrap text-right font-medium tabular-nums xl:px-4 xl:py-4 ${t.amount>0?'text-emerald-600 dark:text-emerald-400':''}`}>{expenseMoney(t.amount,t.currency)}</td>
       <td role="cell" className="min-w-0 xl:w-60 xl:px-4 xl:py-3"><select aria-label={`Categoría de ${merchant} del ${t.date}`} className={`${expenseSelect} w-full`} disabled={disabled} value="" onChange={e=>{if(e.target.value==='__new__'){setCustom(t);setNewCategory('');}else if(e.target.value)void save(t,e.target.value);}}><option value="" disabled>{saving===t.id?'Guardando…':'Elegir categoría'}</option>{categories.map(c=><option key={c} value={c}>{c}</option>)}<option value="__new__">Crear categoría…</option></select></td>
       <td role="cell" className="xl:px-4 xl:py-4"><label className="flex min-h-10 cursor-pointer items-center gap-2 text-xs"><input type="checkbox" className="h-4 w-4 accent-primary" aria-label={`Recordar categoría para ${merchant} del ${t.date}`} checked={remember[t.id]??true} disabled={disabled} onChange={e=>setRemember(current=>({...current,[t.id]:e.target.checked}))}/>Recordar</label></td>
      </tr>;
     })}
     {!loading&&data&&!data.transactions.length&&<tr><td colSpan={5} className="p-12 text-center"><Check aria-hidden="true" className="mx-auto mb-3 h-5 w-5 text-muted-foreground"/><p className="font-medium">{data.total===0?'No quedan movimientos sin categoría.':'No hay pendientes con estos filtros.'}</p><p className="mt-2 text-xs text-muted-foreground">{data.total===0?'Los nuevos gastos sin clasificar aparecerán aquí.':'Prueba otra cuenta, otro periodo o limpia la búsqueda.'}</p></td></tr>}
    </tbody>
   </table>
  </div>
  {data&&<div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground"><span>{data.filteredTotal} movimientos · gasto neto {expenseMoney(data.netAmount,currency)}</span><div className="flex items-center gap-3"><span>Página {data.page+1} de {Math.max(1,Math.ceil(data.filteredTotal/data.limit))}</span><Button size="sm" variant="outline" disabled={disabled||data.page===0} onClick={()=>setPage(data.page-1)}>Anterior</Button><Button size="sm" variant="outline" disabled={disabled||(data.page+1)*data.limit>=data.filteredTotal} onClick={()=>setPage(data.page+1)}>Siguiente</Button></div></div>}
  <Dialog open={!!custom} onOpenChange={open=>{if(!open&&!saving)setCustom(null);}}><DialogContent><DialogHeader><DialogTitle>Crear categoría</DialogTitle><DialogDescription>Se asignará a {custom?.merchantName||custom?.description}. Podrás elegirla en los siguientes movimientos.</DialogDescription></DialogHeader><form className="space-y-4" onSubmit={e=>{e.preventDefault();if(custom&&newCategory.trim())void save(custom,newCategory);}}><div><Label htmlFor="uncategorized-new-category">Nombre de la categoría</Label><Input id="uncategorized-new-category" value={newCategory} onChange={e=>setNewCategory(e.target.value)} maxLength={80} required autoFocus disabled={!!saving}/></div>{error&&<p role="alert" className="text-sm text-destructive">{error}</p>}<Button disabled={!!saving||!newCategory.trim()||newCategory.trim()==='Sin categoría'}>{saving?'Guardando…':'Crear y asignar'}</Button></form></DialogContent></Dialog>
 </section>;
}
