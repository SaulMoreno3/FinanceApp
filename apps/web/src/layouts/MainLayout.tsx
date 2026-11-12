import { Outlet, Link, useLocation } from 'react-router-dom';
import { Menu, X, ChevronDown, TrendingUp } from 'lucide-react';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { AccountMenu } from '@/components/common/AccountMenu';
import SectionSearch from './SectionSearch';
import { navigation, navigationItems, isActivePath } from './navigation';

const mobileQuery='(max-width: 767px)';
const subscribeViewport=(callback:()=>void)=>{const media=window.matchMedia(mobileQuery);media.addEventListener('change',callback);return()=>media.removeEventListener('change',callback);};
const isMobileViewport=()=>window.matchMedia(mobileQuery).matches;

export default function MainLayout() {
 const [mobileOpen,setMobileOpen]=useState(false);
 const isMobile=useSyncExternalStore(subscribeViewport,isMobileViewport,()=>false);
 const location=useLocation();
 const active=navigationItems.find(item=>isActivePath(location.pathname,item.path));
 useEffect(()=>{
  if(!mobileOpen||!isMobile)return;
  const root=document.getElementById('app-navigation');
  const previous=document.activeElement as HTMLElement|null;
  root?.querySelector<HTMLElement>('button[aria-label="Cerrar menú"]')?.focus();
  const keydown=(event:KeyboardEvent)=>{
   if(!root||!(event.target instanceof HTMLElement)||!root.contains(event.target))return;
   if(event.key==='Escape'){event.preventDefault();setMobileOpen(false);}
   if(event.key==='Tab'){
    const controls=Array.from(root.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),summary')).filter(el=>el.getClientRects().length>0);
    const first=controls[0],last=controls.at(-1);
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
   }
  };
  window.addEventListener('keydown',keydown);return()=>{window.removeEventListener('keydown',keydown);if(previous?.isConnected)previous.focus();};
 },[mobileOpen,isMobile]);
 const link=(item:typeof navigation[number]['items'][number])=>{
  const selected=isActivePath(location.pathname,item.path);
  return <Link key={item.path} to={item.path} onClick={()=>setMobileOpen(false)} aria-current={selected?'page':undefined} className={cn(
   'flex min-h-10 min-w-0 items-center gap-3 rounded-lg px-3 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-sidebar-ring',
   selected?'bg-sidebar-accent font-medium text-sidebar-accent-foreground':'text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground',
  )}><item.icon className={cn('h-4 w-4 shrink-0',!selected&&'text-muted-foreground')} aria-hidden="true"/><span className="truncate">{item.label}</span></Link>;
 };
 return <div className="flex h-[100dvh] w-full overflow-hidden bg-background text-foreground">
  <a href="#main-content" className="fixed left-4 top-3 z-[100] -translate-y-20 rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground focus:translate-y-0">Saltar al contenido</a>
  {mobileOpen&&<button type="button" aria-label="Cerrar navegación" className="fixed inset-0 z-40 bg-black/45 md:hidden" onClick={()=>setMobileOpen(false)}/>}
  <aside id="app-navigation" aria-label="Navegación principal" inert={isMobile&&!mobileOpen} className={cn('fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r bg-sidebar transition-transform duration-150 ease-out motion-reduce:transition-none md:relative md:translate-x-0',mobileOpen?'translate-x-0':'-translate-x-full')}>
   <div className="flex h-16 shrink-0 items-center gap-2 px-5"><Link to="/" onClick={()=>setMobileOpen(false)} className="flex items-center gap-2.5 rounded-sm text-sm font-semibold tracking-tight focus-visible:outline-2 focus-visible:outline-ring"><span className="grid h-7 w-7 place-items-center rounded-md bg-sidebar-accent"><TrendingUp className="h-4 w-4" aria-hidden="true"/></span>FinanceApp</Link><Button variant="ghost" size="icon" className="ml-auto md:hidden" onClick={()=>setMobileOpen(false)} aria-label="Cerrar menú"><X className="h-4 w-4" aria-hidden="true"/></Button></div>
   <div className="px-2 pb-4"><SectionSearch onNavigate={()=>setMobileOpen(false)}/></div>
   <nav className="app-scrollbar min-h-0 flex-1 overflow-y-auto px-3 pb-4" aria-label="Secciones">
    <div className="space-y-1">{navigation[0].items.map(link)}</div>
    <div className="mt-6 space-y-2 border-t pt-4">{navigation.slice(1).map(group=><details key={group.label+location.pathname} open={group.items.some(item=>isActivePath(location.pathname,item.path))} className="group/nav">
     <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between rounded-md px-3 text-xs font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">{group.label}<ChevronDown className="h-3.5 w-3.5 transition-transform group-open/nav:rotate-180 motion-reduce:transition-none" aria-hidden="true"/></summary>
     <div className="space-y-1 pb-2">{group.items.map(link)}</div>
    </details>)}</div>
   </nav>
   <div className="border-t p-3"><AccountMenu onNavigate={()=>setMobileOpen(false)}/></div>
  </aside>
  <main id="main-content" tabIndex={-1} inert={isMobile&&mobileOpen} className="flex min-w-0 flex-1 flex-col overflow-hidden outline-none">
   <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b px-4 md:px-8">
    <div className="flex min-w-0 items-center gap-2"><Button variant="ghost" size="icon" className="-ml-2 md:hidden" onClick={()=>setMobileOpen(true)} aria-label="Abrir navegación" aria-expanded={mobileOpen}><Menu className="h-5 w-5" aria-hidden="true"/></Button><span className="hidden text-xs text-muted-foreground md:inline">Mi espacio</span><span className="hidden text-muted-foreground/50 md:inline" aria-hidden="true">/</span><span className="truncate text-sm font-medium">{active?.label??'FinanceApp'}</span></div>
    <span className="text-xs text-muted-foreground">Finanzas personales</span>
   </header>
   <div className="app-scrollbar min-h-0 flex-1 overflow-y-auto"><div className="mx-auto w-full max-w-[1280px]"><Outlet key={location.pathname}/></div></div>
  </main>
 </div>;
}
