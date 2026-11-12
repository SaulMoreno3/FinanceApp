import test from 'node:test';
import assert from 'node:assert/strict';
import { manualTradeSchema } from './manual-trade.schema';
const valid={date:'2026-11-12',symbol:'aapl',side:'Buy',currency:'USD',quantity:2,price:100,eurCost:180,conversionRate:.9};
test('manual trade validates numbers, currencies, sides and dates before persistence',()=>{
 assert.equal(manualTradeSchema.parse(valid).symbol,'AAPL');
 assert.equal(manualTradeSchema.parse(valid).assetType,'Stock');
 for(const change of [{quantity:-1},{quantity:0},{price:NaN},{fees:-1},{currency:'GBP'},{side:'Other'},{assetType:'Other'},{date:'bad'},{eurCost:170},{userId:'untrusted'}])assert.equal(manualTradeSchema.safeParse({...valid,...change}).success,false);
});
