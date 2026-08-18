ALTER TABLE "photo_reports"
  ADD COLUMN "required_angles" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "photos" JSONB NOT NULL DEFAULT '[]'::JSONB,
  ADD COLUMN "status" TEXT NOT NULL DEFAULT 'draft',
  ADD COLUMN "inspector_note" TEXT,
  ADD COLUMN "reviewed_at" TIMESTAMP(3);

UPDATE "photo_reports"
SET "photos" = jsonb_build_array(jsonb_build_object('angle', COALESCE("shooting_point", 'photo'), 'uri', "file_url")),
    "required_angles" = ARRAY[COALESCE("shooting_point", 'photo')],
    "status" = CASE WHEN "kind" = 'hidden_works' AND "inspector_signature" IS NULL THEN 'review' ELSE 'accepted' END;
