import { z } from 'zod';

const positive=z.number().finite().positive().max(1e12);
const fee=z.number().finite().nonnegative().max(1e12).default(0);
export const manualTradeSchema=z.object({
 date:z.string().refine(value=>Number.isFinite(Date.parse(value)),'Invalid date').transform(value=>new Date(value)),
 symbol:z.string().trim().min(1).max(50).transform(value=>value.toUpperCase()),
 assetType:z.enum(['Stock','Crypto']).default('Stock'),
 currency:z.enum(['EUR','USD']),side:z.enum(['Buy','Sell']),
 quantity:positive,price:positive,fees:fee,commission:fee,
 eurCost:positive.optional(),conversionRate:positive.optional(),
 // The UI sends the displayed total as text; the server recalculates it.
 totalValue:z.string().optional(),
}).strict().superRefine((trade,ctx)=>{
 if(trade.eurCost!==undefined&&trade.conversionRate!==undefined){
  const expected=trade.quantity*trade.price*trade.conversionRate;
  if(Math.abs(trade.eurCost-expected)>Math.max(.02,trade.eurCost*.00001))ctx.addIssue({code:'custom',message:'EUR cost and conversion rate disagree'});
 }
});
export type ManualTradeInput=z.infer<typeof manualTradeSchema>;
