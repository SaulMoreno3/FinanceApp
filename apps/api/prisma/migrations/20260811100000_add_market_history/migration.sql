CREATE TYPE "InstrumentType" AS ENUM ('STOCK', 'ETF', 'FUND', 'CRYPTO', 'INDEX', 'FOREX', 'OTHER');

CREATE TABLE "instruments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "canonicalKey" VARCHAR(255) NOT NULL,
    "isin" VARCHAR(20),
    "figi" VARCHAR(32),
    "name" VARCHAR(255) NOT NULL,
    "type" "InstrumentType" NOT NULL DEFAULT 'OTHER',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "instruments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "market_listings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "instrumentId" UUID NOT NULL,
    "ticker" VARCHAR(64) NOT NULL,
    "exchangeCode" VARCHAR(32),
    "exchangeMic" VARCHAR(8),
    "currency" "Currency" NOT NULL,
    "provider" VARCHAR(32) NOT NULL,
    "providerSymbol" VARCHAR(128) NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "market_listings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "market_price_bars" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "listingId" UUID NOT NULL,
    "date" DATE NOT NULL,
    "open" DECIMAL(20,8),
    "high" DECIMAL(20,8),
    "low" DECIMAL(20,8),
    "close" DECIMAL(20,8) NOT NULL,
    "adjustedClose" DECIMAL(20,8),
    "volume" DECIMAL(30,8),
    "currency" "Currency" NOT NULL,
    "source" VARCHAR(32) NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "market_price_bars_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "market_fx_rates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "date" DATE NOT NULL,
    "baseCurrency" "Currency" NOT NULL,
    "quoteCurrency" "Currency" NOT NULL,
    "rate" DECIMAL(20,10) NOT NULL,
    "source" VARCHAR(32) NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "market_fx_rates_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "portfolio_daily_snapshots" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "date" DATE NOT NULL,
    "currency" "Currency" NOT NULL DEFAULT 'EUR',
    "marketValue" DECIMAL(20,8) NOT NULL,
    "costBasis" DECIMAL(20,8) NOT NULL,
    "realizedGain" DECIMAL(20,8) NOT NULL,
    "unrealizedGain" DECIMAL(20,8) NOT NULL,
    "dividends" DECIMAL(20,8) NOT NULL DEFAULT 0,
    "fees" DECIMAL(20,8) NOT NULL DEFAULT 0,
    "netContributions" DECIMAL(20,8) NOT NULL DEFAULT 0,
    "dailyPnl" DECIMAL(20,8) NOT NULL DEFAULT 0,
    "hasEstimates" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "portfolio_daily_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "portfolio_position_daily_snapshots" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "snapshotId" UUID NOT NULL,
    "instrumentId" UUID NOT NULL,
    "quantity" DECIMAL(20,8) NOT NULL,
    "price" DECIMAL(20,8) NOT NULL,
    "priceCurrency" "Currency" NOT NULL,
    "fxRateToReporting" DECIMAL(20,10) NOT NULL,
    "marketValue" DECIMAL(20,8) NOT NULL,
    "costBasis" DECIMAL(20,8) NOT NULL,
    "unrealizedGain" DECIMAL(20,8) NOT NULL,
    "priceDate" DATE NOT NULL,
    "isEstimated" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "portfolio_position_daily_snapshots_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "stock_trades" ADD COLUMN "instrumentId" UUID;
ALTER TABLE "stock_trades" ADD COLUMN "listingId" UUID;

CREATE UNIQUE INDEX "instruments_canonicalKey_key" ON "instruments"("canonicalKey");
CREATE UNIQUE INDEX "instruments_isin_key" ON "instruments"("isin");
CREATE UNIQUE INDEX "instruments_figi_key" ON "instruments"("figi");
CREATE INDEX "instruments_name_idx" ON "instruments"("name");
CREATE UNIQUE INDEX "market_listings_provider_providerSymbol_key" ON "market_listings"("provider", "providerSymbol");
CREATE INDEX "market_listings_instrumentId_idx" ON "market_listings"("instrumentId");
CREATE INDEX "market_listings_ticker_idx" ON "market_listings"("ticker");
CREATE UNIQUE INDEX "market_price_bars_listingId_date_source_key" ON "market_price_bars"("listingId", "date", "source");
CREATE INDEX "market_price_bars_date_idx" ON "market_price_bars"("date");
CREATE UNIQUE INDEX "market_fx_rates_date_baseCurrency_quoteCurrency_source_key" ON "market_fx_rates"("date", "baseCurrency", "quoteCurrency", "source");
CREATE INDEX "market_fx_rates_date_idx" ON "market_fx_rates"("date");
CREATE UNIQUE INDEX "portfolio_daily_snapshots_userId_date_currency_key" ON "portfolio_daily_snapshots"("userId", "date", "currency");
CREATE INDEX "portfolio_daily_snapshots_userId_date_idx" ON "portfolio_daily_snapshots"("userId", "date");
CREATE UNIQUE INDEX "portfolio_position_daily_snapshots_snapshotId_instrumentId_key" ON "portfolio_position_daily_snapshots"("snapshotId", "instrumentId");
CREATE INDEX "portfolio_position_daily_snapshots_instrumentId_idx" ON "portfolio_position_daily_snapshots"("instrumentId");
CREATE INDEX "stock_trades_instrumentId_idx" ON "stock_trades"("instrumentId");
CREATE INDEX "stock_trades_listingId_idx" ON "stock_trades"("listingId");

ALTER TABLE "market_listings" ADD CONSTRAINT "market_listings_instrumentId_fkey" FOREIGN KEY ("instrumentId") REFERENCES "instruments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "market_price_bars" ADD CONSTRAINT "market_price_bars_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "market_listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "portfolio_daily_snapshots" ADD CONSTRAINT "portfolio_daily_snapshots_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "portfolio_position_daily_snapshots" ADD CONSTRAINT "portfolio_position_daily_snapshots_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "portfolio_daily_snapshots"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "portfolio_position_daily_snapshots" ADD CONSTRAINT "portfolio_position_daily_snapshots_instrumentId_fkey" FOREIGN KEY ("instrumentId") REFERENCES "instruments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "stock_trades" ADD CONSTRAINT "stock_trades_instrumentId_fkey" FOREIGN KEY ("instrumentId") REFERENCES "instruments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "stock_trades" ADD CONSTRAINT "stock_trades_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "market_listings"("id") ON DELETE SET NULL ON UPDATE CASCADE;
