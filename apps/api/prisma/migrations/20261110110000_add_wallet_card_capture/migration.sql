ALTER TABLE expense_tokens ADD COLUMN scope varchar(10) NOT NULL DEFAULT 'CARD'
 CHECK (scope IN ('CARD','WALLET'));

-- Wallet labels are aliases, not evidence of card type, debt or account ownership.
CREATE TABLE expense_wallet_cards (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 "userId" uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 name varchar(250) NOT NULL, "walletKey" varchar(250) NOT NULL, currency varchar(3) NOT NULL,
 "cardId" uuid,
 "lastSeenAt" timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY ("cardId","userId") REFERENCES expense_cards(id,"userId"),
 UNIQUE ("userId","walletKey",currency), UNIQUE(id,"userId")
);
CREATE TABLE expense_wallet_captures (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 "userId" uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 "walletCardId" uuid NOT NULL,
 "eventId" varchar(255) NOT NULL, date timestamptz NOT NULL,
 amount numeric(14,2) NOT NULL CHECK (amount <> 0), merchant varchar(250) NOT NULL,
 "entryType" varchar(10) NOT NULL CHECK ("entryType" IN ('PURCHASE','REFUND')),
 "expenseEntryId" uuid UNIQUE,
 FOREIGN KEY ("walletCardId","userId") REFERENCES expense_wallet_cards(id,"userId") ON DELETE CASCADE,
 FOREIGN KEY ("expenseEntryId") REFERENCES expense_entries(id),
 UNIQUE ("walletCardId","eventId")
);
CREATE INDEX ON expense_wallet_captures ("userId");
