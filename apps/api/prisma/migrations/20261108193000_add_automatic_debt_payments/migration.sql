CREATE TABLE "debt_payments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "debtId" UUID NOT NULL,
    "bankTransactionId" UUID NOT NULL,
    "installment" INTEGER NOT NULL,
    "paidAt" TIMESTAMPTZ(6) NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "principalAmount" DECIMAL(14,2) NOT NULL,
    "interestAmount" DECIMAL(14,2) NOT NULL,
    "detectedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "debt_payments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "debt_payments_bankTransactionId_key"
    ON "debt_payments"("bankTransactionId");
CREATE UNIQUE INDEX "debt_payments_debtId_installment_key"
    ON "debt_payments"("debtId", "installment");
CREATE INDEX "debt_payments_debtId_paidAt_idx"
    ON "debt_payments"("debtId", "paidAt");

ALTER TABLE "debt_payments"
    ADD CONSTRAINT "debt_payments_debtId_fkey"
    FOREIGN KEY ("debtId") REFERENCES "debts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "debt_payments"
    ADD CONSTRAINT "debt_payments_bankTransactionId_fkey"
    FOREIGN KEY ("bankTransactionId") REFERENCES "bank_transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
