import assert from 'node:assert/strict';
import test from 'node:test';
import { taxReturnSchema } from './taxes.schema';
test('distinguishes an unknown filed result from a zero balance',()=>{
 assert.equal(taxReturnSchema.parse({taxYear:2025}).finalTaxResult,null);
 assert.equal(taxReturnSchema.parse({taxYear:2025,finalTaxResult:''}).finalTaxResult,null);
 assert.equal(taxReturnSchema.parse({taxYear:2025,finalTaxResult:'0'}).finalTaxResult,0);
});
test('accepts refunds as negative filed results',()=>assert.equal(taxReturnSchema.parse({taxYear:2025,finalTaxResult:'-250.50'}).finalTaxResult,-250.5));
