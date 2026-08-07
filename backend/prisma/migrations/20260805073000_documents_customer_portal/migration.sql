CREATE TABLE "project_documents" (
  "id" TEXT NOT NULL, "company_id" TEXT NOT NULL, "object_id" TEXT NOT NULL,
  "created_by_id" TEXT NOT NULL, "title" TEXT NOT NULL, "kind" TEXT NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1, "file_url" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'draft', "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "project_documents_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "document_approvals" (
  "id" TEXT NOT NULL, "document_id" TEXT NOT NULL, "actor_id" TEXT NOT NULL,
  "decision" TEXT NOT NULL, "note" TEXT, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "document_approvals_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "work_acts" (
  "id" TEXT NOT NULL, "company_id" TEXT NOT NULL, "object_id" TEXT NOT NULL,
  "created_by_id" TEXT NOT NULL, "signed_by_id" TEXT, "template" TEXT NOT NULL,
  "number" TEXT NOT NULL, "title" TEXT NOT NULL, "amount" DECIMAL(14,2) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'draft', "pdf_url" TEXT, "signed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "work_acts_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "project_documents_company_id_object_id_created_at_idx" ON "project_documents"("company_id", "object_id", "created_at");
CREATE UNIQUE INDEX "document_approvals_document_id_actor_id_key" ON "document_approvals"("document_id", "actor_id");
CREATE UNIQUE INDEX "work_acts_company_id_number_key" ON "work_acts"("company_id", "number");
CREATE INDEX "work_acts_company_id_object_id_created_at_idx" ON "work_acts"("company_id", "object_id", "created_at");
ALTER TABLE "project_documents" ADD CONSTRAINT "project_documents_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "project_documents" ADD CONSTRAINT "project_documents_object_id_fkey" FOREIGN KEY ("object_id") REFERENCES "objects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "project_documents" ADD CONSTRAINT "project_documents_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "document_approvals" ADD CONSTRAINT "document_approvals_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "project_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "document_approvals" ADD CONSTRAINT "document_approvals_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "work_acts" ADD CONSTRAINT "work_acts_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "work_acts" ADD CONSTRAINT "work_acts_object_id_fkey" FOREIGN KEY ("object_id") REFERENCES "objects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "work_acts" ADD CONSTRAINT "work_acts_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "work_acts" ADD CONSTRAINT "work_acts_signed_by_id_fkey" FOREIGN KEY ("signed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
