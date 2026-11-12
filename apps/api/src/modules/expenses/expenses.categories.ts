// Local, deterministic rules. No transactions are sent to an external AI service.
// An explicit user correction/rule always takes priority over these suggestions.
export const normalizeCategoryMerchant = (value:string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
export type CategorySuggestion={category:string;reason:string;confidence:'HIGH'|'UNKNOWN'};
const rules:[RegExp,string,string][]=[
 [/\b(mercadona|lidl|aldi|carrefour|eroski|alcampo|costco|tesco|jumbo|supermercado|supermarkt|primaprix|condis|intermarche|rewe|spar)\b|\balbert heijn\b|^ah (strijp|etos|to go)|^dia (compromiso|supermerc)|mini market/, 'Supermercado','Cadena o comercio de alimentación identificado'],
 [/\b(parking|parkin|parkings|parquimetro|aparcamiento|easypark|telpark)\b/, 'Aparcamiento','Servicio de aparcamiento identificado'],
 [/\b(renfe|taxi|uber|bolt|flixbus|metro|autobus|skanetrafiken|arriva|ovpay|transporte)\b|\btransport for london\b|\btfl travel\b|\bnational express\b|^nlov[a-z0-9]{10,}$|^ns (groep|stat)|dopravni podnik|bellagio passeggeri|menaggio traghetto/, 'Transporte','Operador de transporte identificado'],
 [/\b(repsol|cepsa|shell|gasolinera|subigas|bp)\b|total mkt/, 'Combustible','Gasolinera identificada'],
 [/\b(farmacia|pharmacy|dentist|dental|optica)\b/, 'Salud','Servicio sanitario identificado'],
 [/\b(basic fit|basicfit|decathlon|swapfiets|enjoy wellness)\b/, 'Deporte','Gimnasio, deporte o alquiler de bicicleta identificado'],
 [/\b(estanco|tabacos|tabaco|tabak|expenduria|expendeduria|expendiduria|expendiduria)\b/, 'Tabaco','Estanco o comercio de tabaco identificado'],
 [/\b(bet365|betfair|pokerstars|electraworks|loteria|betandeal)\b|^stars \d+/, 'Apuestas y lotería','Operador de apuestas o lotería identificado'],
 [/\b(booking|hotel|hostel|expedia|ryanair|wizz air|transavia|transaviacom|pegasus|rentalcars|airbnb|vueling|easyjet)\b|bkg hotel/, 'Viajes','Alojamiento, aerolínea o alquiler de viaje identificado'],
 [/\b(coursera|udemy|universiteit|universidad|papeleria|libreria)\b/, 'Educación y papelería','Formación o material educativo identificado'],
 [/\b(netflix|spotify|disney|openai|chatgpt|youtubepremium|youtube|icloud|ionos|onlinecv)\b|apple com bill|google one/, 'Suscripciones','Servicio digital identificado; no se presupone una periodicidad'],
 [/\b(kpn|simyo|vodafone|movistar|orange)\b/, 'Telefonía e internet','Operador de telecomunicaciones identificado'],
 [/\b(sabadell consumer finance)\b/, 'Préstamos','Cuota de entidad de financiación identificada'],
 [/\bagencia tributaria\b|\baeat\b|\bayuntamiento\b/, 'Tasas y trámites','Administración pública identificada'],
 [/\b(plan fee|commission|comision|fee charge)\b/, 'Gastos financieros','Comisión financiera explícita'],
 [/\b(peluqueria|barber|barbershop|peluquer|unas)\b/, 'Cuidado personal','Servicio de cuidado personal identificado'],
 [/\b(autodoc|taller|neumaticos|itv)\b/, 'Vehículo','Mantenimiento de vehículo identificado'],
 [/\b(vestide)\b/, 'Vivienda','Proveedor de alojamiento identificado'],
 [/\b(steam games|instant gaming|pgsharp|tomorrowland|viagogo|cine|cinema|discocil)\b/, 'Ocio','Juego, entrada o evento identificado'],
 [/\b(amazon|aliexpress|zalando|ikea|mediamarkt|pull and bear|pull bear|scalpers|zara|fruugo|action|hema|wallapop|eurobazar)\b/, 'Compras','Comercio identificado; la finalidad concreta de la compra no se deduce'],
 [/\bgriferia duo\b/, 'Restaurantes','Establecimiento de hostelería identificado en el registro municipal de Zaragoza'],
 [/\b(restaur|restaurante|restaurant|cafeteria|cafe|eetcafe|bar|pub|bakery|bakkerij|frites|kfc|pizzeria|pizza|pizzium|kebap|kebab|borekcisi|buffets|heladeria|coffee|grill|ramen|sushiko|burger|mcdonalds|glovo|deliveroo|bageterie)\b|mc donald|five guys|house of fries|ubereats|uber eats|just eat|pmntsbveats/, 'Restaurantes','Restauración identificada por el comercio'],
];
const generic=/^(purchase|debit|credit|transfer|card payment|other|atm|exchange|fee charge|sin categoria)$/;
export function categorySuggestion(merchant:string,fallback?:string|null,funding?:string):CategorySuggestion {
 if(fallback&&!generic.test(normalizeCategoryMerchant(fallback)))return {category:fallback,reason:'Categoría conservada de la fuente o de una revisión',confidence:'HIGH'};
 const name=normalizeCategoryMerchant(merchant),match=rules.find(([pattern])=>pattern.test(name));
 if(match)return {category:match[1],reason:match[2],confidence:'HIGH'};
 if(funding==='FLEXIBLE')return {category:'Restaurantes',reason:'Pago con la tarjeta de comida flexible confirmada por su propietario',confidence:'HIGH'};
 return {category:'Sin categoría',reason:'El nombre no permite deducir la finalidad; necesita revisión',confidence:'UNKNOWN'};
}
