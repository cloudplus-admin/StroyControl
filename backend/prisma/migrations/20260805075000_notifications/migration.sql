CREATE TABLE "notifications" (
  "id" TEXT NOT NULL, "company_id" TEXT NOT NULL, "user_id" TEXT NOT NULL,
  "object_id" TEXT, "kind" TEXT NOT NULL, "title" TEXT NOT NULL, "body" TEXT NOT NULL,
  "entity_type" TEXT, "entity_id" TEXT, "read_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "notifications_company_id_user_id_read_at_created_at_idx" ON "notifications"("company_id", "user_id", "read_at", "created_at");
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
