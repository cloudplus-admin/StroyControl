CREATE TABLE "mobile_records" (
  "id" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "object_id" TEXT,
  "client_id" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "mobile_records_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "mobile_records_company_id_kind_client_id_key" ON "mobile_records"("company_id", "kind", "client_id");
CREATE INDEX "mobile_records_company_id_object_id_kind_updated_at_idx" ON "mobile_records"("company_id", "object_id", "kind", "updated_at");
ALTER TABLE "mobile_records" ADD CONSTRAINT "mobile_records_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "mobile_records" ADD CONSTRAINT "mobile_records_object_id_fkey" FOREIGN KEY ("object_id") REFERENCES "objects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
