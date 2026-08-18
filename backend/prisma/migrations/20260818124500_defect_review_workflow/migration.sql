ALTER TABLE "defects"
  ADD COLUMN "assigned_to_id" TEXT,
  ADD COLUMN "review_note" TEXT;

CREATE INDEX "defects_assigned_to_id_idx" ON "defects"("assigned_to_id");

ALTER TABLE "defects"
  ADD CONSTRAINT "defects_assigned_to_id_fkey"
  FOREIGN KEY ("assigned_to_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
