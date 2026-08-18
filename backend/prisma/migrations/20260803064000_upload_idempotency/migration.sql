ALTER TABLE "file_uploads" ADD COLUMN "idempotency_key" TEXT;
UPDATE "file_uploads" SET "idempotency_key" = "id" WHERE "idempotency_key" IS NULL;
ALTER TABLE "file_uploads" ALTER COLUMN "idempotency_key" SET NOT NULL;
CREATE UNIQUE INDEX "file_uploads_company_id_idempotency_key_key" ON "file_uploads"("company_id", "idempotency_key");
