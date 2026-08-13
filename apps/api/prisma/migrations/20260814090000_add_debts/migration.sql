CREATE TYPE "DebtStatus" AS ENUM ('ACTIVE', 'PAID_OFF', 'ARCHIVED');

CREATE TABLE "debts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(160) NOT NULL,
    "lender" VARCHAR(160),
    "assetName" VARCHAR(160),
    "originalPrincipal" DECIMAL(14, 2) NOT NULL,
    "totalRepayable" DECIMAL(14, 2),
    "currentBalance" DECIMAL(14, 2) NOT NULL,
    "interestRate" DECIMAL(8, 4),
    "apr" DECIMAL(8, 4),
    "monthlyPayment" DECIMAL(14, 2),
    "totalPayments" INTEGER,
    "paidPayments" INTEGER NOT NULL DEFAULT 0,
    "startDate" DATE,
    "maturityDate" DATE,
    "nextPaymentDate" DATE,
    "currency" "Currency" NOT NULL DEFAULT 'EUR',
    "status" "DebtStatus" NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "userId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "debts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "debts_userId_idx" ON "debts"("userId");
CREATE INDEX "debts_userId_status_idx" ON "debts"("userId", "status");

ALTER TABLE "debts"
  ADD CONSTRAINT "debts_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
