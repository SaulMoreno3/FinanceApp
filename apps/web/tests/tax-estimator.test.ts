import assert from 'node:assert/strict';
import test from 'node:test';
import { estimateAragonIrpf } from '../src/pages/taxes/tax-estimator.ts';
const input = {taxYear:2025, employmentGross:0,selfEmploymentProfit:0,savingsIncome:0,capitalGains:0,socialSecurity:0,workExpenses:0,personalDeductions:0,withholdings:0,advancePayments:0};
test('zero income has no tax',()=>assert.equal(estimateAragonIrpf(input).estimatedTax,0));
test('taxes the general base then subtracts tax on the minimum, using separate Aragón bands',()=>{
 const r=estimateAragonIrpf({...input,employmentGross:40000,socialSecurity:2600,withholdings:7500});
 assert.equal(r.generalBase,35400);
 // State: 4399.75 - 527.25 = 3872.50; Aragón: 4346.89 - 527.25 = 3819.64.
 assert.equal(r.generalTax,7692.14); assert.equal(r.result,192.14);
});
test('part of minimum unused in general base applies to savings',()=>{
 const r=estimateAragonIrpf({...input,selfEmploymentProfit:3000,savingsIncome:6000});
 assert.equal(r.generalTax,0); assert.equal(r.savingsTax,655.50);
});
test('uses 2025 top savings bracket at 30%',()=>{
 const a=estimateAragonIrpf({...input,selfEmploymentProfit:40000,savingsIncome:300000});
 const b=estimateAragonIrpf({...input,selfEmploymentProfit:40000,savingsIncome:301000});
 assert.equal(b.savingsTax-a.savingsTax,300);
});
test('limits cross-category compensation to 25 percent',()=>{
 const r=estimateAragonIrpf({...input,savingsIncome:10000,capitalGains:-8000});
 assert.equal(r.savingsBase,7500);assert.equal(r.unappliedSavingsLoss,5500);
 const inverse=estimateAragonIrpf({...input,savingsIncome:-8000,capitalGains:10000});
 assert.equal(inverse.savingsBase,7500);
});
test('employment allowance and low-income reduction cannot create a loss',()=>{
 const r=estimateAragonIrpf({...input,employmentGross:10000});
 assert.equal(r.employmentReduction,7302);assert.equal(r.generalBase,698);assert.equal(r.estimatedTax,0);
 assert.equal(estimateAragonIrpf({...input,employmentGross:1000}).generalBase,0);
});
test('does not use the €2000 allowance to qualify for article 20 reduction',()=>{
 assert.equal(estimateAragonIrpf({...input,employmentGross:20000}).employmentReduction,0);
});
test('refund is withholding minus liability',()=>assert.equal(estimateAragonIrpf({...input,withholdings:200}).result,-200));
test('rejects unverified years and invalid inputs',()=>{
 assert.throws(()=>estimateAragonIrpf({...input,taxYear:2024}),RangeError);
 assert.throws(()=>estimateAragonIrpf({...input,employmentGross:NaN}),RangeError);
 assert.throws(()=>estimateAragonIrpf({...input,withholdings:-1}),RangeError);
});
test('2025 employment credit requires effective-employment confirmation',()=>{
 const base={...input,employmentGross:16500,socialSecurity:1200};
 assert.equal(estimateAragonIrpf(base).employmentCredit,0);
 const r=estimateAragonIrpf({...base,employmentCreditConfirmed:true});
 // 15,300 net before allowance; reduction 6,518; base 6,782; (6,782-5,550)*19%.
 assert.equal(r.taxBeforeCredits,234.08);
 assert.equal(r.employmentCredit,234.08);
 assert.equal(r.estimatedTax,0);
});
test('credit tapers at statutory gross-income limits and respects other-income condition',()=>{
 const confirmed={...input,employmentCreditConfirmed:true};
 assert.equal(estimateAragonIrpf({...confirmed,employmentGross:16576}).employmentCredit,340);
 assert.equal(estimateAragonIrpf({...confirmed,employmentGross:17000}).employmentCredit,255.20);
 assert.equal(estimateAragonIrpf({...confirmed,employmentGross:18275}).employmentCredit,.20);
 assert.equal(estimateAragonIrpf({...confirmed,employmentGross:18276}).employmentCredit,0);
 assert.equal(estimateAragonIrpf({...confirmed,employmentGross:17000,savingsIncome:6500}).employmentCredit,255.20);
 assert.equal(estimateAragonIrpf({...confirmed,employmentGross:17000,savingsIncome:6500.01}).employmentCredit,0);
 assert.equal(estimateAragonIrpf({...confirmed,employmentGross:17000,personalDeductions:100}).employmentCredit,0);
});
test('credit cannot offset savings tax or create a tax liability below zero',()=>{
 const r=estimateAragonIrpf({...input,employmentGross:16500,socialSecurity:1200,savingsIncome:6000,employmentCreditConfirmed:true});
 assert.equal(r.employmentCredit,234.08);
 assert.equal(r.savingsTax,1140);
 assert.equal(r.estimatedTax,1140);
 assert.equal(estimateAragonIrpf({...input,employmentCreditConfirmed:true}).employmentCredit,0);
});
test('rounds each savings quota separately',()=>{
 const r=estimateAragonIrpf({...input,selfEmploymentProfit:40000,savingsIncome:100.03});
 assert.equal(r.savingsTax,19);
});
test('separate general quotas agree with their sum and do not jump across thresholds',()=>{
 for(const threshold of [12450,13072.5,20200,21210,35200,36960,52500,60000,80000,90000,130000,300000]) {
  const before=estimateAragonIrpf({...input,selfEmploymentProfit:threshold-.01});
  const after=estimateAragonIrpf({...input,selfEmploymentProfit:threshold+.01});
  assert.ok(after.generalTax>=before.generalTax);
  assert.ok(after.generalTax-before.generalTax<=.021);
  assert.ok(Math.abs(after.generalTax-after.stateGeneralTax-after.regionalGeneralTax)<1e-8);
 }
});
