CREATE TYPE "BankConnectionStatus" AS ENUM ('PENDING', 'CONNECTED', 'ERROR', 'REAUTH_REQUIRED', 'DISCONNECTED');

CREATE TABLE "bank_connections" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL,
  "provider" VARCHAR(40) NOT NULL,
  "status" "BankConnectionStatus" NOT NULL DEFAULT 'PENDING',
  "accessTokenEncrypted" TEXT,
  "accessTokenIv" TEXT,
  "refreshTokenEncrypted" TEXT,
  "refreshTokenIv" TEXT,
  "accessTokenExpiresAt" TIMESTAMPTZ(6),
  "refreshTokenExpiresAt" TIMESTAMPTZ(6),
  "oauthStateHash" VARCHAR(128),
  "lastSyncAt" TIMESTAMPTZ(6),
  "lastError" TEXT,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "bank_connections_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "bank_connections_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "bank_connections_userId_provider_key" ON "bank_connections"("userId", "provider");
CREATE INDEX "bank_connections_userId_status_idx" ON "bank_connections"("userId", "status");

CREATE TABLE "bank_accounts" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL,
  "connectionId" UUID NOT NULL,
  "providerAccountId" VARCHAR(255) NOT NULL,
  "name" TEXT,
  "iban" TEXT,
  "currency" VARCHAR(3) NOT NULL,
  "accountType" VARCHAR(40),
  "balance" DECIMAL(20,8),
  "availableBalance" DECIMAL(20,8),
  "balanceUpdatedAt" TIMESTAMPTZ(6),
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "bank_accounts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "bank_accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "bank_accounts_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "bank_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "bank_accounts_connectionId_providerAccountId_key" ON "bank_accounts"("connectionId", "providerAccountId");
CREATE INDEX "bank_accounts_userId_idx" ON "bank_accounts"("userId");

CREATE TABLE "bank_transactions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL,
  "accountId" UUID NOT NULL,
  "providerTransactionId" VARCHAR(255) NOT NULL,
  "date" TIMESTAMPTZ(6) NOT NULL,
  "amount" DECIMAL(20,8) NOT NULL,
  "currency" VARCHAR(3) NOT NULL,
  "description" TEXT,
  "merchantName" TEXT,
  "category" TEXT,
  "direction" VARCHAR(16) NOT NULL,
  "status" VARCHAR(24) NOT NULL DEFAULT 'booked',
  "rawData" JSONB,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "bank_transactions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "bank_transactions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "bank_transactions_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "bank_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "bank_transactions_accountId_providerTransactionId_key" ON "bank_transactions"("accountId", "providerTransactionId");
CREATE INDEX "bank_transactions_userId_date_idx" ON "bank_transactions"("userId", "date");
CREATE INDEX "bank_transactions_userId_category_idx" ON "bank_transactions"("userId", "category");
