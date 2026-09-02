CREATE TABLE "company_subscriptions" (
  "id" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "platform" TEXT NOT NULL,
  "product_id" TEXT NOT NULL,
  "transaction_id" TEXT NOT NULL,
  "original_transaction_id" TEXT,
  "status" TEXT NOT NULL,
  "purchased_at" TIMESTAMP(3),
  "expires_at" TIMESTAMP(3),
  "verified_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "raw_response" JSONB,
  CONSTRAINT "company_subscriptions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "company_subscriptions_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "company_subscriptions_platform_transaction_id_key" ON "company_subscriptions"("platform", "transaction_id");
CREATE INDEX "company_subscriptions_company_id_status_expires_at_idx" ON "company_subscriptions"("company_id", "status", "expires_at");
