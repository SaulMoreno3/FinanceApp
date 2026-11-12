import { createHash } from 'node:crypto';
import { categorySuggestion } from './expenses.categories';

export const cents = (n: number) => Math.round((n + Math.sign(n) * Number.EPSILON) * 100);
export const money = (n: number) => cents(n) / 100;
export const localDay = (date: Date | string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(date));
export const normalizeMerchant = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
// Preserve punctuation and digits: different Wallet labels must not be guessed as one card.
export const normalizeWalletCard = (s: string) => s.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
export const isCardRepayment = (text: string) => /credit card repayment|pago (?:de )?tarjeta|liquidaci[oó]n (?:de )?tarjeta/i.test(text);
export function categoryFor(merchant: string, fallback?: string | null) {
 return categorySuggestion(merchant,fallback).category;
}
export interface Entry { id:string; cardId:string; date:string; amount:number; merchant:string; source:string; entryType:string; matchedEntryId?:string|null; bankTransactionId?:string|null; excluded?:boolean;provisional?:boolean }
export const isProvisionalEntry=(entry:Pick<Entry,'source'|'provisional'>)=>entry.provisional===true;
// Reconciliation is optional deduplication, not a prerequisite for counting a receipt.
export const isCaptureEntry=(entry:Pick<Entry,'source'|'provisional'>)=>entry.source==='APPLE_PAY'||entry.provisional===true;
export function uniqueCaptureMatch<T extends Entry>(capture: Entry, official: T[]) {
 const matches = official.filter(e => e.cardId === capture.cardId && e.entryType === capture.entryType
  && cents(e.amount) === cents(capture.amount) && Math.abs(Date.parse(e.date) - Date.parse(capture.date)) <= 7 * 86400000
  && normalizeMerchant(e.merchant) === normalizeMerchant(capture.merchant));
 return matches.length === 1 ? matches[0] : null;
}

// RFC4180 quoting, including quoted delimiters/newlines and escaped double quotes.
export function parseCsv(text: string) {
 if (text.length > 1_500_000) throw new Error('El CSV supera 1,5 MB. Divide el extracto.');
 text = text.replace(/^\uFEFF/,'');
 const header = text.split(/\r?\n/)[0], delimiter = (header.match(/;/g)?.length ?? 0) > (header.match(/,/g)?.length ?? 0) ? ';' : ',';
 const rows:string[][] = []; let row:string[] = [], field='', quoted=false;
 for (let i=0; i<text.length; i++) {
  const c=text[i];
  if (c==='"') { if (quoted && text[i+1]==='"') {field+='"';i++;} else quoted=!quoted; }
  else if (!quoted && (c===delimiter || c==='\n')) {row.push(field.replace(/\r$/,''));field='';if(c==='\n'){if(row.some(v=>v.trim()))rows.push(row);row=[];}}
  else field+=c;
 }
 if(quoted)throw new Error('CSV inválido: faltan comillas de cierre.');
 row.push(field.replace(/\r$/,''));if(row.some(v=>v.trim()))rows.push(row);
 if(rows.length<2 || rows.length>5001)throw new Error('El CSV debe contener entre 1 y 5.000 movimientos.');
 const headers=rows.shift()!.map(normalizeMerchant);
 if(new Set(headers).size!==headers.length)throw new Error('El CSV contiene columnas duplicadas.');
 return {headers,rows};
}
function parseAmount(text: string) {
 let value=text.trim().replace(/[€$£\s]/g,'');
 if(value.includes(','))value=value.includes('.')?(value.lastIndexOf(',')>value.lastIndexOf('.')?value.replace(/\./g,'').replace(',','.'):value.replace(/,/g,'')):value.replace(',','.');
 if(!/^[+-]?\d+(\.\d{1,2})?$/.test(value))throw new Error(`Importe inválido: ${text}`);
 const number=Number(value);if(!Number.isFinite(number)||number===0||Math.abs(number)>1_000_000)throw new Error(`Importe fuera de rango: ${text}`);
 return number;
}
export function parseStatementCsv(text: string, currency: string) {
 const {headers,rows}=parseCsv(text);
 const col=(aliases:string[])=>headers.findIndex(h=>aliases.includes(h));
 const dateCol=col(['date','fecha','started date','fecha de inicio','transaction date','fecha de la transaccion']);
 const merchantCol=col(['merchant','comercio','description','descripcion','concepto']);
 const amountCol=col(['amount','importe','cantidad']);
 const currencyCol=col(['currency','divisa','moneda']);
 const statusCol=col(['state','estado','status']);
 const typeCol=col(['type','tipo']);
 const idCol=col(['id','transaction id','identificador']);
 const categoryCol=col(['category','categoria']);
 if([dateCol,merchantCol,amountCol].some(i=>i<0))throw new Error('Faltan columnas: fecha/date, comercio/description e importe/amount.');
 const occurrences = new Map<string,number>();
 return rows.map((cells,index)=>{
  if(cells.length!==headers.length)throw new Error(`Fila ${index+2}: número incorrecto de columnas.`);
  const status=statusCol>=0?normalizeMerchant(cells[statusCol]):'';
  if(status && !['completed','completado','completada','booked','settled','confirmado'].includes(status))throw new Error(`Fila ${index+2}: solo se admiten movimientos confirmados.`);
  const rawDate=cells[dateCol].trim();
  let day=rawDate.slice(0,10);
  if(/^\d{2}[/-]\d{2}[/-]\d{4}$/.test(rawDate)) {const [d,m,y]=rawDate.split(/[/-]/);day=`${y}-${m}-${d}`;}
  if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||!Number.isFinite(Date.parse(day))||new Date(day).toISOString().slice(0,10)!==day)throw new Error(`Fila ${index+2}: fecha inválida.`);
  if(currencyCol>=0 && cells[currencyCol].trim().toUpperCase()!==currency)throw new Error(`Fila ${index+2}: la divisa no coincide con la tarjeta.`);
  const merchant=cells[merchantCol].trim();if(!merchant||merchant.length>250)throw new Error(`Fila ${index+2}: comercio vacío o demasiado largo.`);
  const amount=parseAmount(cells[amountCol]);
  const type=typeCol>=0?normalizeMerchant(cells[typeCol]):'';
  if(type&&!['card payment','purchase','refund','repayment','pago tarjeta','payment','card repayment','card refund','fee','comision','compra','devolucion','cash transfer','transferencia efectivo'].includes(type))throw new Error(`Fila ${index+2}: el tipo ${cells[typeCol]} no es una compra, devolución, comisión, pago de tarjeta o movimiento de efectivo explícito.`);
  const payment=isCardRepayment(merchant)||['repayment','pago tarjeta','payment','card repayment'].includes(type);
  if(payment&&amount<0)throw new Error(`Fila ${index+2}: el pago de la tarjeta debe ser positivo. Usa un CSV con compras negativas y devoluciones/pagos positivos.`);
  const entryType=payment?'PAYMENT':['cash transfer','transferencia efectivo'].includes(type)?'TRANSFER':amount<0?'PURCHASE':'REFUND';
  const base=`${day}|${cents(amount)}|${normalizeMerchant(merchant)}|${entryType}`;
  const occurrence=(occurrences.get(base)??0)+1;occurrences.set(base,occurrence);
  const sourceId=idCol>=0&&cells[idCol].trim()?cells[idCol].trim():createHash('sha256').update(`${base}|${occurrence}`).digest('hex');
  if(sourceId.length>255)throw new Error(`Fila ${index+2}: identificador demasiado largo.`);
  return {date:`${day}T12:00:00Z`,amount,merchant,entryType,sourceId,category:categoryCol>=0?cells[categoryCol].trim().slice(0,100)||null:null};
 });
}
