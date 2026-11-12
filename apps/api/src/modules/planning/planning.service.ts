import { detectSalary, salaryPaymentDate } from './salary-detection';
import pool from '../../common/db/client';
import { prisma } from '../../common/db/prisma';
import { netWorthService } from '../networth/networth.service';
import { propertySchema } from '../real-estate/real-estate.schema';
import { propertyReport } from '../real-estate/real-estate.calculations';
import { planSchema, type Plan } from './planning.schema';
import { classify, detectSubscriptions, expenseAnalysis, forecast, inferVariableMonthlySpend, iso, nextDueDate, ledgerFingerprint, plusDays, round, type Movement, type ForecastEvent } from './planning.calculations';
import { matchesDebtPayment } from '../debts/debt-reconciliation';
import { FLEXIBLE_FUNDS_OPENING_BALANCE } from '../bank-sync/bank-transfer';
import { expensesService } from '../expenses/expenses.service';
export class PlanningError extends Error {constructor(public status:number,message:string){super(message);}}
export class PlanningService {
 async settings(userId:string) {
  const result=await pool.query('SELECT data,version FROM finance_plans WHERE "userId"=$1',[userId]);
  return {plan:planSchema.parse(result.rows[0]?.data??{}),version:result.rows[0]?.version??0};
 }
 async save(userId:string,version:number,plan:Plan) {
  const ids=Object.keys(plan.transactionOverrides);
  if(ids.length){
   const [bankRecords,cardRecords,walletRecords]=await Promise.all([prisma.bankTransaction.findMany({where:{userId,id:{in:ids}},select:{id:true,amount:true}}),prisma.expenseEntry.findMany({where:{userId,id:{in:ids}},select:{id:true,amount:true,entryType:true}}),prisma.expenseWalletCapture.findMany({where:{userId,id:{in:ids}},select:{id:true,amount:true,entryType:true}})]);
   const records=[...bankRecords.map(r=>({...r,entryType:'BANK'})),...cardRecords,...walletRecords];
   if(records.length!==ids.length)throw new PlanningError(400,'Hay movimientos que no pertenecen a tu cuenta o ya no existen.');
   if(records.some(r=>(plan.transactionOverrides[r.id].kind==='EXPENSE'&&Number(r.amount)>=0&&r.entryType!=='REFUND')||(plan.transactionOverrides[r.id].kind==='INCOME'&&Number(r.amount)<0)))throw new PlanningError(400,'La clasificación debe respetar si el movimiento es un cobro o un pago. Usa traspaso para excluirlo.');
  }
  const result=version===0
   ?await pool.query('INSERT INTO finance_plans ("userId",data) VALUES ($1,$2) ON CONFLICT DO NOTHING RETURNING version',[userId,JSON.stringify(plan)])
   :await pool.query('UPDATE finance_plans SET data=$3,version=version+1,"updatedAt"=NOW() WHERE "userId"=$1 AND version=$2 RETURNING version',[userId,version,JSON.stringify(plan)]);
  if(!result.rowCount)throw new PlanningError(409,'La planificación ha cambiado en otra pestaña. Recarga antes de guardar.');
  return {plan,version:result.rows[0].version};
 }
 async movements(userId:string) {
  return (await expensesService.financialMovements(userId)).sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id)) satisfies Movement[];
 }
 async overview(userId:string,month:string,today=iso(new Date())) {
  const [settings,rows,banks,debts,properties,worth,closures,fxPending,salaryFlags,flexibleFunds,credit]=await Promise.all([
   this.settings(userId),this.movements(userId),
   prisma.bankAccount.findMany({where:{userId},select:{id:true,name:true,balance:true,currency:true,balanceUpdatedAt:true}}),
   prisma.debt.findMany({where:{userId,status:'ACTIVE'},select:{id:true,name:true,lender:true,assetName:true,currency:true,paidPayments:true,currentBalance:true,schedule:{orderBy:{installment:'asc'}}}}),
   prisma.realEstateProperty.findMany({where:{userId},select:{id:true,data:true}}),
   netWorthService.getSummary(userId),
   pool.query('SELECT month,snapshot,fingerprint,"reviewedAt" FROM finance_month_closings WHERE "userId"=$1 ORDER BY month DESC',[userId]),
   prisma.stockTrade.findMany({where:{userId,currency:{not:'EUR'},eurValue:null,eurCost:null,conversionRate:null},select:{id:true,symbol:true,date:true},take:100}),
   prisma.salaryRecord.findMany({where:{userId},select:{id:true,date:true,notes:true,netSalary:true,company:true},orderBy:{date:'desc'}}),
   prisma.bankTransaction.aggregate({where:{userId,description:{contains:'Fondos Monetarios Flexibles',mode:'insensitive'}},_sum:{amount:true},_count:true}),
   expensesService.creditExposure(userId),
  ]);
  const {plan}=settings,classified=classify(rows,plan),analysis=expenseAnalysis(classified,month,today);
  const salarySuggestion=detectSalary(classified,salaryFlags,today);
  const debtTransactionIds=new Set(classified.filter(transaction=>transaction.kind==='EXPENSE'&&debts.some(debt=>debt.schedule.some(payment=>matchesDebtPayment(debt,payment,transaction)))).map(transaction=>transaction.id));
  const inferredVariable=inferVariableMonthlySpend(classified,plan,today,debtTransactionIds);
  const forecastPlan=plan.variableMonthly>0?plan:{...plan,variableMonthly:inferredVariable.amount};
  const candidates=detectSubscriptions(classified.filter(t=>t.date>=plusDays(today,-800)),plan,today);
  const flexibleBalance=flexibleFunds._count>0?round(FLEXIBLE_FUNDS_OPENING_BALANCE-Number(flexibleFunds._sum.amount??0)):0;
  const cash=await expensesService.availability(userId,await expensesService.snapshot(userId),plan,today);
  const balance=cash.beforeCommitments;
  const extra:ForecastEvent[]=[],end=plusDays(today,90);
  if(plan.includeDebts)for(const debt of debts.filter(d=>d.currency==='EUR'))for(const payment of debt.schedule.filter(p=>p.installment>debt.paidPayments))extra.push({date:iso(payment.dueDate),name:debt.name,amount:-Number(payment.paymentAmount),source:'DEBT'});
  if(salarySuggestion?.schedule&&salarySuggestion.nextDate&&salarySuggestion.confidence!=='Baja'&&!plan.recurring.some(r=>r.active&&r.kind==='INCOME'&&r.currency==='EUR')){
   const start=new Date(`${salarySuggestion.schedule.anchorMonth}-01T00:00:00Z`);
   for(let offset=0;offset<6;offset++){const cursor=new Date(Date.UTC(start.getUTCFullYear(),start.getUTCMonth()+offset,1)),anchorMonth=iso(cursor).slice(0,7),date=salaryPaymentDate({...salarySuggestion.schedule,anchorMonth});if(date>end)break;if(date>today)extra.push({date,name:salarySuggestion.name,amount:salarySuggestion.amount,source:'SALARY_INFERRED'});}
  }
  const propertySummaries=properties.map(record=>{
   const property=propertySchema.parse(record.data),report=propertyReport(property,Number(month.slice(0,4)),today);
   if(plan.includeProperties)for(const year of new Set([Number(today.slice(0,4)),Number(end.slice(0,4))])){
    const r=propertyReport(property,year,today);
    for(const c of r.charges)extra.push({date:c.dueDate,name:`Alquiler · ${property.name}`,amount:round(Math.max(0,c.expected-c.received)),source:'RENT'});
    for(const e of r.expenses)extra.push({date:e.date,name:`${property.name} · ${e.description}`,amount:-e.amount,source:'PROPERTY_EXPENSE'});
    for(const p of r.payments)extra.push({date:p.date,name:`Hipoteca · ${property.name}`,amount:-p.payment,source:'MORTGAGE'});
   }
   return {id:record.id,name:property.name,expectedRent:report.expectedRent,operatingExpenses:report.operatingExpenses,operatingProfit:report.operatingProfit,debtService:report.debtService,netCashFlow:report.netCashFlow,grossYield:report.grossYield,netYield:report.netYield,cashOnCash:report.cashOnCash,monthsWithoutRent:report.months.filter(m=>m.rent===0&&m.month>=property.acquisitionDate.slice(0,7)).length};
  });
  const issues:{id:string;title:string;detail:string;href:string}[]=[];
  if(credit.unknown)issues.push({id:'credit:unknown',title:'Saldo de crédito sin confirmar',detail:`${credit.unknown} tarjeta(s) necesitan un saldo de referencia. La liquidez puede estar sobreestimada.`,href:'/expenses?tab=setup'});
  if(rows.some(t=>t.amount<0&&/credit card repayment|pago (?:de )?tarjeta/i.test(t.description??'')&&t.expenseKind!=='TRANSFER'))issues.push({id:'credit:statements',title:'Recibos de tarjeta sin desglose',detail:'Importa y concilia los extractos en Gastos. Hasta entonces se conserva el recibo como aproximación del gasto en planificación.',href:'/expenses?tab=import'});
  for(const b of banks)if(b.balance===null||!b.balanceUpdatedAt||iso(b.balanceUpdatedAt)<plusDays(today,-7))issues.push({id:`bank:${b.id}:${b.balanceUpdatedAt?iso(b.balanceUpdatedAt):'missing'}`,title:'Saldo bancario pendiente de actualizar',detail:b.name??'Cuenta bancaria',href:'/banking'});
  for(const id of analysis.duplicates)issues.push({id:`duplicate:${id}`,title:'Posible cobro duplicado',detail:'Mismo día, cuenta, comercio e importe. Comprueba ambos movimientos antes de actuar.',href:'/banking/history'});
  for(const t of fxPending)issues.push({id:`fx:${t.id}`,title:'Operación sin cambio EUR registrado',detail:`${t.symbol} · ${iso(t.date)}. Puede existir una conversión estimada en la cartera.`,href:'/transactions'});
  for(const s of salaryFlags)if(/cotizaci|contribution report|net.*unknown|neto.*desconoc/i.test(s.notes??''))issues.push({id:`salary:${s.id}`,title:'Ingreso importado que requiere revisión',detail:`${s.date?iso(s.date):"Sin fecha"} · El registro puede ser una base de cotización.`,href:'/salary/history'});
  for(const debt of debts){
   const overdue=debt.schedule.filter(p=>p.installment>debt.paidPayments&&iso(p.dueDate)<=today);
   if(overdue.length)issues.push({id:`debt:${debt.id}:${overdue.at(-1)!.installment}`,title:'Cuota vencida sin pago registrado',detail:`${debt.name}: ${overdue.length} cuota(s). No se han dado por pagadas.`,href:`/debts/${debt.id}`});
  }
  const closings=closures.rows.map(c=>({...c,changed:c.fingerprint!==ledgerFingerprint(rows,plan,c.month)}));
  for(const c of closings.filter(c=>c.changed))issues.push({id:`closing:${c.month}:${ledgerFingerprint(rows,plan,c.month)}`,title:'Cambios después del cierre',detail:`Han cambiado movimientos o clasificaciones de ${c.month}.`,href:'/planning?tab=closing'});
  const recurring=plan.recurring.map(r=>{
   const matched=classified.filter(t=>t.merchantKey===r.merchantKey&&t.kind==='EXPENSE'&&t.date<=today).sort((a,b)=>a.date.localeCompare(b.date));
   const last=matched.at(-1),previous=matched.at(-2);
   return {...r,nextDueDate:nextDueDate(r,today),lastCharge:last?{date:last.date,amount:Math.abs(last.amount)}:null,priceChange:last&&previous?round(Math.abs(last.amount)-Math.abs(previous.amount)):0};
  });
  return {...settings,today,fingerprint:ledgerFingerprint(rows,plan,month),analysis,candidates,recurring,liquidity:{balance,creditPending:credit.amount,unknownCreditBalances:credit.unknown,reserve:plan.reserve,available:cash.available,committed:cash.committed,netWorth:worth.totalCurrentNetWorth,invested:worth.sources.portfolio,goods:worth.sources.manualAssets,debt:worth.totalLiabilities,accounts:[...banks.map(b=>({name:b.name,currency:b.currency,balance:b.balance===null?null:Number(b.balance),updatedAt:b.balanceUpdatedAt,calculated:false})),...(flexibleFunds._count>0?[{name:'Flexible Monetary Funds',currency:'EUR',balance:flexibleBalance,updatedAt:null,calculated:true}]:[])],scope:`Bancos y fondo monetario flexible, tras apartar ${credit.amount.toFixed(2)} EUR de crédito pendiente conocido. El disponible también aparta pagos sin tarjeta asociada, débitos posteriores al saldo, compromisos próximos 30 días y la reserva. Pluxee se analiza aparte.`},forecast:{...forecast(balance,forecastPlan,today,extra),assumptions:{variableMonthly:forecastPlan.variableMonthly,variableSource:plan.variableMonthly>0?'PLAN':'HISTORICAL_MEDIAN',variableEvidence:inferredVariable.months,salarySource:salarySuggestion?.schedule&&salarySuggestion.confidence!=='Baja'?'INFERRED_BANK_PAYMENTS':'NONE'}},properties:propertySummaries,
   issues:issues.map(i=>({...i,acknowledged:plan.acknowledgedIssues.includes(i.id)})),closings,
   coverage:{firstDate:rows[0]?.date??null,lastDate:rows.at(-1)?.date??null,movements:rows.length,pending:rows.filter(t=>t.status.toLowerCase()!=='booked').length},
   salarySuggestion};
 }
 async close(userId:string,month:string,expectedFingerprint:string) {
  if(month>=iso(new Date()).slice(0,7))throw new PlanningError(400,'Solo se pueden cerrar meses finalizados.');
  const overview=await this.overview(userId,month);
  const rows=await this.movements(userId),current=await this.settings(userId);
  const fingerprint=ledgerFingerprint(rows,current.plan,month);
  if(expectedFingerprint!==fingerprint)throw new PlanningError(409,'Los movimientos cambiaron. Recarga y revisa antes de cerrar.');
  const snapshot={analysis:expenseAnalysis(classify(rows,current.plan),month,iso(new Date())),netWorthAtReview:overview.liquidity.netWorth,debtAtReview:overview.liquidity.debt,recordedAt:new Date().toISOString()};
  await pool.query('INSERT INTO finance_month_closings ("userId",month,snapshot,fingerprint) VALUES ($1,$2,$3,$4) ON CONFLICT ("userId",month) DO UPDATE SET snapshot=EXCLUDED.snapshot,fingerprint=EXCLUDED.fingerprint,"reviewedAt"=NOW()',[userId,month,JSON.stringify(snapshot),fingerprint]);
  return {ok:true};
 }
 async fingerprint(userId:string,month:string){const [rows,{plan}]=await Promise.all([this.movements(userId),this.settings(userId)]);return ledgerFingerprint(rows,plan,month);}
}
export const planningService=new PlanningService();
