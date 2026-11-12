import assert from 'node:assert/strict';
import test from 'node:test';
import { holdingCostEur } from '../src/components/reports/report-data.ts';
const base={symbol:'TEST',currency:'USD',realizedGain:0,remainingShares:1,totalCostBasis:100,averageCost:100};
test('does not relabel dollars as euros',()=>assert.equal(holdingCostEur(base),null));
test('uses converted EUR cost for weights and totals',()=>assert.equal(holdingCostEur({...base,totalCostBasisEur:90}),90));
test('retains genuine EUR costs',()=>assert.equal(holdingCostEur({...base,currency:'EUR'}),100));
test('does not expose incomplete conversions as complete',()=>assert.equal(holdingCostEur({...base,totalCostBasisEur:50,conversionComplete:false}),null));
