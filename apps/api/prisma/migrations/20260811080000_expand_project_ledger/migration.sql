CREATE TYPE "ProjectStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'ARCHIVED');
CREATE TYPE "ProjectPaymentStatus" AS ENUM ('PENDING', 'PAID');

ALTER TABLE "projects"
ADD COLUMN "client" TEXT,
ADD COLUMN "budget" DECIMAL(14, 2),
ADD COLUMN "status" "ProjectStatus" NOT NULL DEFAULT 'ACTIVE';

ALTER TABLE "project_entries"
ADD COLUMN "counterparty" TEXT,
ADD COLUMN "reference" TEXT,
ADD COLUMN "notes" TEXT,
ADD COLUMN "paymentStatus" "ProjectPaymentStatus" NOT NULL DEFAULT 'PAID',
ADD COLUMN "dueDate" DATE;

CREATE INDEX "project_entries_projectId_paymentStatus_idx"
ON "project_entries"("projectId", "paymentStatus");
