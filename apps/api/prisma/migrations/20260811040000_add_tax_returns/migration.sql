CREATE TABLE "tax_returns" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "taxYear" INTEGER NOT NULL,
    "country" VARCHAR(80) NOT NULL DEFAULT 'Spain',
    "status" VARCHAR(32) NOT NULL DEFAULT 'Draft',
    "filingDate" DATE,
    "notes" TEXT,
    "fileName" TEXT,
    "fileStorageKey" TEXT,
    "fileMimeType" TEXT,
    "userId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tax_returns_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "tax_returns_userId_idx" ON "tax_returns"("userId");
CREATE INDEX "tax_returns_userId_taxYear_idx" ON "tax_returns"("userId", "taxYear");

ALTER TABLE "tax_returns"
  ADD CONSTRAINT "tax_returns_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
