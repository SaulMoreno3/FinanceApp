import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowRight, Landmark, ReceiptText, RefreshCw, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { fetchAPI } from '@/lib/api';
import type { NetWorthSummary } from '@/components/net-worth/net-worth.types';
import type { PortfolioSummary } from '@/components/portfolio/portfolio.types';
import type { SalaryListResponse } from '@/components/salary/salary.types';
import type { ExpensesOverview } from '@/pages/expenses/expenses.types';
import ExpenseAvailability from '@/pages/expenses/ExpenseAvailability';

type DashboardData={netWorth:NetWorthSummary;portfolio:PortfolioSummary;salaries:SalaryListResponse;expenses:ExpensesOverview;
 imports:{myinvestor:string|null;revolut:string|null}};
const money=(value:number)=>new Intl.NumberFormat('es-ES',{style:'currency',currency:'EUR',maximumFractionDigits:2}).format(value);
const date=(value:string|null|undefined)=>value?new Intl.DateTimeFormat('es-ES',{dateStyle:'medium'}).format(new Date(value)):'Sin datos';
const quickLinks=[
 {path:'/expenses',label:'Revisar gastos',detail:'Compras y categorías de este mes',icon:ReceiptText},
 {path:'/banking',label:'Consultar cuentas',detail:'Saldos y movimientos bancarios',icon:Landmark},
 {path:'/planning',label:'Planificar pagos',detail:'Previsión de ahorro y próximos vencimientos',icon:TrendingUp},
];
export default function DashboardPage() {
 const [data,setData]=useState<DashboardData|null>(null),[error,setError]=useState<string|null>(null),[loading,setLoading]=useState(true);
 const loadDashboard=async()=>{
  setLoading(true);
  try {
   const [netWorth,portfolio,salaries,imports,expenses]=await Promise.all([
    fetchAPI<NetWorthSummary>('/networth/summary'),fetchAPI<PortfolioSummary>('/portfolio/summary'),
    fetchAPI<SalaryListResponse>('/salary?limit=100'),fetchAPI<DashboardData['imports']>('/import/status'),
    fetchAPI<ExpensesOverview>('/expenses'),
   ]);
   setData({netWorth,portfolio,salaries,imports,expenses});setError(null);
  } catch {setError('No se ha podido cargar el resumen. Pulsa Actualizar para reintentar.');}
  finally {setLoading(false);}
 };
 useEffect(()=>{
  // eslint-disable-next-line react-hooks/set-state-in-effect -- initial remote dashboard load
  void loadDashboard();
 },[]);
 const latestSalary=data?[...data.salaries.data].sort((a,b)=>b.date.localeCompare(a.date))[0]:undefined;
 const latestImport=data?[data.imports.myinvestor,data.imports.revolut].filter((v):v is string=>Boolean(v)).sort().at(-1):null;
 const sources=data?.netWorth.sources;
 const qualityWarning=data&&(data.portfolio.valuation.status!=='fresh'||(sources?.missingBankBalances??0)>0);
 return <div className="space-y-8 px-4 py-6 md:px-8 md:py-8">
  <header className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-semibold tracking-tight">Inicio</h1><p className="mt-1 text-sm text-muted-foreground">Resumen de tus finanzas.</p></div><Button variant="outline" onClick={loadDashboard} disabled={loading}><RefreshCw aria-hidden="true" className={loading?'h-4 w-4 animate-spin':'h-4 w-4'}/>Actualizar</Button></header>
  {error&&<p role="alert" className="border-l-2 border-destructive px-4 py-2 text-sm">{error}</p>}
  {loading&&!data?<div className="space-y-6"><Skeleton className="h-28 w-full"/><Skeleton className="h-32 w-full"/></div>:data&&<>
   <ExpenseAvailability data={data.expenses.finances} compact/>
   <div className="flex flex-wrap justify-between gap-3 border-b pb-5 text-sm"><p>Consumo del mes: <strong className="tabular-nums">{money(data.expenses.spent)}</strong> · Pluxee: {money(data.expenses.flexibleSpent)}</p><Link to="/expenses" className="underline underline-offset-4">Ver categorías y presupuestos</Link></div>
   <section aria-label="Situación financiera" className="grid gap-7 border-b pb-8 lg:grid-cols-[1.3fr_1fr]">
    <div><p className="text-sm text-muted-foreground">Patrimonio neto</p><p className="mt-3 break-words text-4xl font-semibold tracking-tight tabular-nums sm:text-5xl">{money(data.netWorth.totalCurrentNetWorth)}</p><Link to="/networth" className="mt-4 inline-flex items-center gap-2 rounded text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-ring">Ver detalle del patrimonio <ArrowRight aria-hidden="true" className="h-3 w-3"/></Link></div>
    <dl className="grid grid-cols-2 content-center gap-5 rounded-xl border bg-card/50 p-5">
     <div><dt className="text-xs text-muted-foreground">En cuentas</dt><dd className="mt-2 text-xl font-semibold tabular-nums">{sources?money(sources.bankAccounts):'Sin datos'}</dd>{(sources?.missingBankBalances??0)>0&&<p className="mt-1 text-xs text-amber-600 dark:text-amber-400">Saldo parcial</p>}</div>
     <div><dt className="text-xs text-muted-foreground">Invertido</dt><dd className="mt-2 text-xl font-semibold tabular-nums">{data.portfolio.valuation.totalMarketValue===null?'Incompleto':money(data.portfolio.valuation.totalMarketValue)}</dd>{data.portfolio.valuation.status!=='fresh'&&<p className="mt-1 text-xs text-amber-600 dark:text-amber-400">Valoración por revisar</p>}</div>
    </dl>
   </section>
   <section aria-labelledby="dashboard-shortcuts"><h2 id="dashboard-shortcuts" className="text-base font-semibold">Accesos rápidos</h2><div className="mt-3 divide-y">{quickLinks.map(item=><Link key={item.path} to={item.path} className="group flex min-h-20 items-center gap-4 rounded-sm px-1 py-4 outline-none hover:bg-muted/25 focus-visible:ring-2 focus-visible:ring-ring"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-muted/60"><item.icon className="h-4 w-4 text-muted-foreground" aria-hidden="true"/></span><span className="min-w-0 flex-1"><span className="block text-sm font-medium">{item.label}</span><span className="mt-1 block text-xs text-muted-foreground">{item.detail}</span></span><ArrowRight aria-hidden="true" className="h-4 w-4 text-muted-foreground group-hover:text-foreground"/></Link>)}</div></section>
   <section className="grid gap-6 border-y py-6 sm:grid-cols-2">
    <div><p className="text-xs text-muted-foreground">Última nómina registrada</p><p className="mt-2 text-xl font-semibold tabular-nums">{latestSalary?.netSalary!=null?money(Number(latestSalary.netSalary)):'Sin datos'}</p><p className="mt-1 text-xs text-muted-foreground">{date(latestSalary?.date)}</p></div>
    <div><p className="text-xs text-muted-foreground">Deudas registradas</p><p className="mt-2 text-xl font-semibold tabular-nums">{data.netWorth.totalLiabilities!=null?money(data.netWorth.totalLiabilities):'Sin datos'}</p><Link to="/debts" className="mt-1 inline-block rounded text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-ring">Consultar préstamos y cuotas</Link></div>
   </section>
   <section aria-label="Estado de los datos">
    {qualityWarning&&<div role="status" className="mb-4 flex items-start gap-2 text-sm"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true"/><div><p>Hay fuentes que necesitan atención.</p>{(sources?.missingBankBalances??0)>0&&<p className="mt-1 text-xs text-muted-foreground">{sources?.missingBankBalances} cuentas sin saldo disponible.</p>}</div></div>}
    <details className="text-sm"><summary className="cursor-pointer rounded py-1 text-muted-foreground focus-visible:outline-2 focus-visible:outline-ring">Origen y actualización de los datos</summary><dl className="mt-4 grid gap-4 text-xs sm:grid-cols-3"><div><dt className="text-muted-foreground">Bancos</dt><dd className="mt-1">{date(sources?.bankUpdatedAt)}</dd></div><div><dt className="text-muted-foreground">Valoración de cartera</dt><dd className="mt-1">{date(data.portfolio.valuation.asOf)} · {data.portfolio.valuation.status}</dd></div><div><dt className="text-muted-foreground">Última importación</dt><dd className="mt-1">{date(latestImport)}</dd></div></dl></details>
   </section>
  </>}
 </div>;
}
