import { LayoutDashboard, PieChart, Landmark, ArrowRightLeft, TrendingUp, LineChart,
 Upload, Banknote, FolderKanban, ReceiptText, CreditCard, WalletCards, Building2 } from 'lucide-react';

export const navigation = [
 {label:'Principal',items:[
  {icon:LayoutDashboard,label:'Inicio',path:'/',description:'Resumen de tus finanzas'},
  {icon:ReceiptText,label:'Gastos',path:'/expenses',description:'Compras, tarjetas, categorías y crédito'},
  {icon:WalletCards,label:'Cuentas',path:'/banking',description:'Saldos y conexiones bancarias'},
  {icon:LineChart,label:'Inversiones',path:'/portfolio',description:'Cartera y rendimiento'},
  {icon:TrendingUp,label:'Planificación',path:'/planning',description:'Ahorro, previsión y próximos pagos'},
 ]},
 {label:'Tus finanzas',items:[
  {icon:Landmark,label:'Patrimonio',path:'/networth',description:'Bienes y patrimonio consolidado'},
  {icon:CreditCard,label:'Deudas',path:'/debts',description:'Préstamos, cuotas y amortizaciones'},
  {icon:Banknote,label:'Nóminas',path:'/salary',description:'Ingresos y documentos de nómina'},
  {icon:Building2,label:'Inmuebles',path:'/real-estate',description:'Propiedades y rentabilidad'},
 ]},
 {label:'Herramientas',items:[
  {icon:ArrowRightLeft,label:'Movimientos bancarios',path:'/transactions',description:'Historial y operaciones de las cuentas'},
  {icon:PieChart,label:'Informes',path:'/reports',description:'Gráficas y análisis financiero'},
  {icon:ReceiptText,label:'Impuestos',path:'/taxes',description:'Declaraciones y estimación fiscal'},
  {icon:FolderKanban,label:'Proyectos',path:'/projects',description:'Seguimiento de proyectos'},
  {icon:Upload,label:'Importar datos',path:'/import',description:'Archivos de MyInvestor y Revolut'},
 ]},
];
export const navigationItems=navigation.flatMap(group=>group.items.map(item=>({...item,group:group.label})));
const searchableNavigation=[...navigationItems,
 {icon:ReceiptText,label:'Categorizar gastos',path:'/expenses?tab=uncategorized',group:'Gastos',description:'Sin categoría: clasificar compras pendientes'},
 {icon:Upload,label:'Importar extractos de tarjeta',path:'/expenses?tab=import',group:'Gastos',description:'Cargar el historial de compras de crédito'},
 {icon:WalletCards,label:'Conectar iPhone y tarjetas',path:'/expenses?tab=setup',group:'Gastos',description:'Configurar Apple Wallet y Apple Pay'},
 {icon:ReceiptText,label:'Revisar capturas',path:'/expenses?tab=review',group:'Gastos',description:'Confirmar pagos provisionales y evitar duplicados'},
];
export const isActivePath=(pathname:string,path:string)=>path==='/'?pathname==='/':pathname===path||pathname.startsWith(`${path}/`);
const normalize=(text:string)=>text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('es-ES');
export const findNavigation=(query:string)=>{
 const words=normalize(query).trim().split(/\s+/).filter(Boolean);
 return searchableNavigation.filter(item=>words.every(word=>normalize(`${item.label} ${item.description} ${item.group}`).includes(word)));
};
