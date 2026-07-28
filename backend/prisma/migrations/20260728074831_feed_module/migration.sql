-- CreateTable
CREATE TABLE "feed_events" (
    "id" TEXT NOT NULL,
    "object_id" TEXT NOT NULL,
    "author_id" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'message',
    "body" TEXT,
    "mentioned_user_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "parent_event_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feed_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feed_reactions" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "emoji" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feed_reactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "feed_events_object_id_created_at_idx" ON "feed_events"("object_id", "created_at");

-- CreateIndex
CREATE INDEX "feed_events_parent_event_id_idx" ON "feed_events"("parent_event_id");

-- CreateIndex
CREATE UNIQUE INDEX "feed_reactions_event_id_user_id_key" ON "feed_reactions"("event_id", "user_id");

-- AddForeignKey
ALTER TABLE "feed_events" ADD CONSTRAINT "feed_events_object_id_fkey" FOREIGN KEY ("object_id") REFERENCES "objects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feed_events" ADD CONSTRAINT "feed_events_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feed_events" ADD CONSTRAINT "feed_events_parent_event_id_fkey" FOREIGN KEY ("parent_event_id") REFERENCES "feed_events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feed_reactions" ADD CONSTRAINT "feed_reactions_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "feed_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feed_reactions" ADD CONSTRAINT "feed_reactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
