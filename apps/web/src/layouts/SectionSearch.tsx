import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { findNavigation } from './navigation';

export default function SectionSearch({onNavigate}:{onNavigate?:()=>void}) {
 const [open,setOpen]=useState(false),[query,setQuery]=useState('');
 const results=findNavigation(query);
 useEffect(()=>{
  const keydown=(event:KeyboardEvent)=>{if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='k'){
   event.preventDefault();setOpen(current=>!current);setQuery('');
  }};
  window.addEventListener('keydown',keydown);return()=>window.removeEventListener('keydown',keydown);
 },[]);
 const close=()=>{setOpen(false);onNavigate?.();};
 return <>
  <Button variant="ghost" className="w-full justify-start gap-2 text-muted-foreground" aria-label="Buscar una sección" onClick={()=>{setQuery('');setOpen(true);}}>
   <Search className="h-4 w-4" aria-hidden="true"/><span className="flex-1 text-left text-sm">Buscar sección</span><kbd className="rounded border px-1 text-[10px]">⌘/Ctrl K</kbd>
  </Button>
  <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-h-[85dvh] max-w-[calc(100%-2rem)] gap-3 overflow-hidden rounded-xl p-0 !animate-none sm:max-w-lg">
   <DialogHeader className="px-5 pt-5 text-left"><DialogTitle>Ir a una sección</DialogTitle><DialogDescription>Busca por nombre o por lo que quieres hacer.</DialogDescription></DialogHeader>
   <div className="px-5"><Input aria-label="Buscar sección por nombre" name="section-search" autoComplete="off" placeholder="Gastos, deudas, importar…" value={query} onChange={event=>setQuery(event.target.value)} onKeyDown={event=>{
    if(event.key==='ArrowDown'){event.preventDefault();document.getElementById('section-search-results')?.querySelector('a')?.focus();}
    if(event.key==='Enter'&&results.length){event.preventDefault();document.getElementById('section-search-results')?.querySelector('a')?.click();}
   }}/></div>
   <nav id="section-search-results" aria-label="Resultados de secciones" className="max-h-[50dvh] overflow-y-auto overscroll-contain px-2 pb-2">
    {results.map(item=><Link key={item.path} to={item.path} onClick={close} className="group flex items-center gap-3 rounded-lg px-3 py-3 outline-none hover:bg-muted focus-visible:bg-muted focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
     <item.icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true"/><span className="min-w-0 flex-1"><span className="block text-sm font-medium">{item.label}</span><span className="block truncate text-xs text-muted-foreground">{item.description}</span></span><ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true"/>
    </Link>)}
    {!results.length&&<p role="status" className="p-6 text-center text-sm text-muted-foreground">No hay secciones con ese nombre.</p>}
   </nav>
  </DialogContent></Dialog>
 </>;
}
