CREATE TABLE "real_estate_properties" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "data" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "real_estate_properties_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "real_estate_properties_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "real_estate_properties_version_check" CHECK ("version" > 0),
    CONSTRAINT "real_estate_properties_data_check" CHECK (jsonb_typeof("data") = 'object')
);
CREATE INDEX "real_estate_properties_userId_idx" ON "real_estate_properties"("userId");
