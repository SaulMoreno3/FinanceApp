CREATE TABLE expense_cards (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), "userId" uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 name varchar(100) NOT NULL, kind varchar(10) NOT NULL CHECK (kind IN ('CREDIT','DEBIT')), currency varchar(3) NOT NULL,
 "bankAccountId" uuid REFERENCES bank_accounts(id) ON DELETE SET NULL,
 "providerCardId" varchar(255), "connectionId" uuid REFERENCES bank_connections(id) ON DELETE SET NULL,
 "openingBalance" numeric(14,2), "openingDate" date NOT NULL, "dueDay" integer NOT NULL DEFAULT 1 CHECK ("dueDay" BETWEEN 1 AND 28),
 "balance" numeric(14,2), "balanceAt" timestamptz,
 "createdAt" timestamptz NOT NULL DEFAULT now(),
 UNIQUE ("userId", "providerCardId"), UNIQUE(id,"userId")
);
CREATE INDEX ON expense_cards ("userId");
CREATE TABLE expense_entries (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), "userId" uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 "cardId" uuid NOT NULL, "date" timestamptz NOT NULL, amount numeric(14,2) NOT NULL CHECK (amount <> 0),
 merchant varchar(250) NOT NULL, category varchar(100), "categoryOverride" varchar(100),
 source varchar(20) NOT NULL CHECK (source IN ('APPLE_PAY','CSV','TRUELAYER','MANUAL')),
 "sourceId" varchar(255) NOT NULL,
 "entryType" varchar(10) NOT NULL DEFAULT 'PURCHASE' CHECK ("entryType" IN ('PURCHASE','REFUND','PAYMENT')),
 "matchedEntryId" uuid REFERENCES expense_entries(id), "bankTransactionId" uuid UNIQUE REFERENCES bank_transactions(id) ON DELETE SET NULL,
 excluded boolean NOT NULL DEFAULT false,
 "createdAt" timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY ("cardId","userId") REFERENCES expense_cards(id,"userId") ON DELETE CASCADE,
 UNIQUE ("cardId",source,"sourceId")
);
CREATE INDEX ON expense_entries ("userId",date);
CREATE TABLE expense_tokens (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), "userId" uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 "cardId" uuid NOT NULL, name varchar(100) NOT NULL, "tokenHash" varchar(64) NOT NULL UNIQUE,
 "createdAt" timestamptz NOT NULL DEFAULT now(), "lastUsedAt" timestamptz, "revokedAt" timestamptz,
 FOREIGN KEY ("cardId","userId") REFERENCES expense_cards(id,"userId") ON DELETE CASCADE
);
CREATE TABLE expense_rules (
 "userId" uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, merchant varchar(250) NOT NULL,
 category varchar(100) NOT NULL, PRIMARY KEY ("userId", merchant)
);
CREATE TABLE expense_budgets (
 "userId" uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, category varchar(100) NOT NULL,
 amount numeric(14,2) NOT NULL CHECK (amount > 0), PRIMARY KEY ("userId",category)
);
CREATE TABLE expense_statements (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), "userId" uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 "cardId" uuid NOT NULL, "startDate" date NOT NULL, "endDate" date NOT NULL, "dueDate" date NOT NULL,
 amount numeric(14,2) NOT NULL CHECK (amount >= 0),
 "bankTransactionId" uuid UNIQUE REFERENCES bank_transactions(id) ON DELETE SET NULL,
 "createdAt" timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY ("cardId","userId") REFERENCES expense_cards(id,"userId") ON DELETE CASCADE,
 CHECK ("startDate" <= "endDate" AND "endDate" < "dueDate"), UNIQUE("cardId","startDate","endDate")
);
CREATE TABLE expense_sync_status (
 "userId" uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 status varchar(30) NOT NULL, message text NOT NULL, "checkedAt" timestamptz NOT NULL DEFAULT now()
);
