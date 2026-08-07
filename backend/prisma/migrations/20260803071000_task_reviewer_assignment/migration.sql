ALTER TABLE "tasks" ADD COLUMN "reviewer_id" TEXT;
CREATE INDEX "tasks_reviewer_id_idx" ON "tasks"("reviewer_id");
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_reviewer_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
