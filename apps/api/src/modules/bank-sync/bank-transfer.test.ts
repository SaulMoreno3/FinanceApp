import test from 'node:test';
import assert from 'node:assert/strict';
import { isFlexibleFundsTransfer, isInvestmentTransfer, isNonSpendingTransfer, isOwnAccountLabelTransfer } from './bank-transfer';
import { classify, expenseAnalysis, type Movement } from '../planning/planning.calculations';
import { planSchema } from '../planning/planning.schema';
test('fund deposits/withdrawals are excluded from income and spending in Banking and Planning',()=>{
 const descriptions=['To Fondos Monetarios Flexibles','From Fondos Monetarios Flexibles','Savings Vault topup','From Cuenta flexible'];
 const amounts=[-1000,500,-200,100];
 const rows:Movement[]=descriptions.map((description,i)=>({id:String(i),accountId:'bank',date:'2026-09-08',amount:amounts[i],currency:'EUR',description,merchantName:null,category:'TRANSFER',status:'booked'}));
 const ordinary:Movement={...rows[0],id:'salary',description:'Salary',amount:2000};
 rows.push(ordinary,{...ordinary,id:'spend',description:'Groceries',amount:-50});
 const bankingRows=rows.filter(t=>!isFlexibleFundsTransfer(t.description));
 assert.equal(bankingRows.filter(t=>t.amount>0).reduce((s,t)=>s+t.amount,0),2000);
 assert.equal(bankingRows.filter(t=>t.amount<0).reduce((s,t)=>s-t.amount,0),50);
 const classified=classify(rows,planSchema.parse({}));
 assert.ok(classified.slice(0,4).every(t=>t.kind==='TRANSFER'));
 const analysis=expenseAnalysis(classified,'2026-09','2026-09-09');
 assert.equal(analysis.income,2000);assert.equal(analysis.spent,50);assert.equal(analysis.saved,1950);
 assert.equal(isFlexibleFundsTransfer('Bizum payment to: Friend'),false);
});
test('tracked broker and investment-wallet movements are asset transfers',()=>{
 for(const value of ['To My Investor Banco','To investment account','From investment account','To Robo portfolio','EUR → Revolut X']){
  assert.equal(isInvestmentTransfer(value),true);assert.equal(isNonSpendingTransfer(value),true);
 }
 assert.equal(isInvestmentTransfer('Credit card repayment'),false);
 assert.equal(isInvestmentTransfer('Bizum payment to: Friend'),false);
});
test('exact Revolut EUR pocket labels are own-account transfers without catching ordinary payments',()=>{
 for(const value of ['To EUR','From EUR','To EUR Personal','From EUR Pro'])assert.equal(isOwnAccountLabelTransfer(value),true);
 assert.equal(isOwnAccountLabelTransfer('To Euro Parking'),false);
 assert.equal(isOwnAccountLabelTransfer('Payment from Employer'),false);
});
