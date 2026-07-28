-- CreateTable
CREATE TABLE "photo_reports" (
    "id" TEXT NOT NULL,
    "object_id" TEXT NOT NULL,
    "task_id" TEXT,
    "author_id" TEXT NOT NULL,
    "shooting_point" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'progress',
    "file_url" TEXT NOT NULL,
    "geo_lat" DOUBLE PRECISION,
    "geo_lng" DOUBLE PRECISION,
    "inspector_signature" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "photo_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "defects" (
    "id" TEXT NOT NULL,
    "object_id" TEXT NOT NULL,
    "task_id" TEXT,
    "reported_by" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "description" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "defects_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "photo_reports_object_id_idx" ON "photo_reports"("object_id");

-- CreateIndex
CREATE INDEX "photo_reports_task_id_idx" ON "photo_reports"("task_id");

-- CreateIndex
CREATE INDEX "defects_object_id_idx" ON "defects"("object_id");

-- AddForeignKey
ALTER TABLE "photo_reports" ADD CONSTRAINT "photo_reports_object_id_fkey" FOREIGN KEY ("object_id") REFERENCES "objects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "photo_reports" ADD CONSTRAINT "photo_reports_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "photo_reports" ADD CONSTRAINT "photo_reports_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "defects" ADD CONSTRAINT "defects_object_id_fkey" FOREIGN KEY ("object_id") REFERENCES "objects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "defects" ADD CONSTRAINT "defects_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "defects" ADD CONSTRAINT "defects_reported_by_fkey" FOREIGN KEY ("reported_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
