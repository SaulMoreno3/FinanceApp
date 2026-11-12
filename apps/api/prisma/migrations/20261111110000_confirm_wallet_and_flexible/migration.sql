-- Wallet receipts are expenses immediately; funding association is independent.
ALTER TABLE expense_cards DROP CONSTRAINT expense_cards_kind_check;
ALTER TABLE expense_cards ADD CONSTRAINT expense_cards_kind_check CHECK (kind IN ('CREDIT','DEBIT','FLEXIBLE'));
ALTER TABLE expense_wallet_captures ADD COLUMN "categoryOverride" varchar(100);
ALTER TABLE expense_wallet_captures ADD COLUMN excluded boolean NOT NULL DEFAULT false;
