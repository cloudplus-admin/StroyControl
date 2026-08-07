CREATE TABLE "file_uploads" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "company_id" TEXT NOT NULL,
  "uploader_id" TEXT,
  "storage_key" TEXT NOT NULL,
  "original_name" TEXT NOT NULL,
  "mime_type" TEXT NOT NULL,
  "size_bytes" INTEGER NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "file_uploads_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "file_uploads_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "file_uploads_storage_key_key" ON "file_uploads"("storage_key");
CREATE INDEX "file_uploads_company_id_created_at_idx" ON "file_uploads"("company_id", "created_at");
