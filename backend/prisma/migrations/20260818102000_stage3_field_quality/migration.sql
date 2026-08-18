ALTER TABLE "defects"
  ADD COLUMN "before_photos" JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN "after_photos" JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN "due_at" TIMESTAMP(3),
  ADD COLUMN "resolved_at" TIMESTAMP(3);
