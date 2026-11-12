ALTER TABLE expense_entries ADD COLUMN provisional boolean NOT NULL DEFAULT false;
ALTER TABLE expense_entries DROP CONSTRAINT "expense_entries_entryType_check";
ALTER TABLE expense_entries ADD CONSTRAINT "expense_entries_entryType_check"
 CHECK ("entryType" IN ('PURCHASE','REFUND','PAYMENT','TRANSFER'));
