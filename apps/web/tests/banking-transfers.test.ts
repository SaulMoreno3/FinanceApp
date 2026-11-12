import test from 'node:test';
import assert from 'node:assert/strict';
import { isInternalBankTransfer, transactionCategory } from '../src/pages/banking/banking.format.ts';
test('labels both directions and legacy fund movements as internal transfers',()=>{
 for(const description of ['To Fondos Monetarios Flexibles','From Fondos Monetarios Flexibles','Savings Vault topup','From Cuenta flexible']) {
  assert.equal(isInternalBankTransfer(description),true);
  assert.equal(transactionCategory('TRANSFER',null,description),'Traspaso entre mis cuentas');
 }
});
test('ordinary transfers, purchases, salary and fund interest are not silently excluded',()=>{
 for(const description of ['Bizum payment to: Friend','Payment from Employer','Interest payment',null]) assert.equal(isInternalBankTransfer(description),false);
 assert.equal(transactionCategory('TRANSFER',null,'Bizum payment to: Friend'),'Transferencias');
});
