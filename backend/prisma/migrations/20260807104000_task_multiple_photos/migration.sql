ALTER TABLE "tasks"
  ADD COLUMN "closure_photos" JSONB NOT NULL DEFAULT '[]'::JSONB;

UPDATE "tasks"
SET "closure_photos" = jsonb_build_array("closure_photo_url")
WHERE "closure_photo_url" IS NOT NULL;
