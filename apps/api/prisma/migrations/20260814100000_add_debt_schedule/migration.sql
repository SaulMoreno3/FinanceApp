CREATE TABLE "debt_schedule" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "debtId" UUID NOT NULL,
    "installment" INTEGER NOT NULL,
    "dueDate" DATE NOT NULL,
    "paymentAmount" DECIMAL(14, 2) NOT NULL,
    "principalAmount" DECIMAL(14, 2) NOT NULL,
    "interestAmount" DECIMAL(14, 2) NOT NULL,
    "balanceAfter" DECIMAL(14, 2) NOT NULL,

    CONSTRAINT "debt_schedule_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "debt_schedule_debtId_installment_key"
  ON "debt_schedule"("debtId", "installment");
CREATE INDEX "debt_schedule_debtId_dueDate_idx"
  ON "debt_schedule"("debtId", "dueDate");

ALTER TABLE "debt_schedule"
  ADD CONSTRAINT "debt_schedule_debtId_fkey"
  FOREIGN KEY ("debtId") REFERENCES "debts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
