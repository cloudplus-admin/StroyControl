ALTER TABLE "file_uploads" ADD COLUMN "task_id" UUID;
CREATE INDEX "file_uploads_task_id_idx" ON "file_uploads"("task_id");
