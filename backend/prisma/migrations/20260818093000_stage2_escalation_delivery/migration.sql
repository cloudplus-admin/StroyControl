ALTER TABLE "users" ADD COLUMN "telegram_chat_id" TEXT;
ALTER TABLE "users" ADD COLUMN "push_token" TEXT;

ALTER TABLE "tasks" ADD COLUMN "escalation_level" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "notifications" ADD COLUMN "delivery_status" TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE "notifications" ADD COLUMN "delivery_attempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "notifications" ADD COLUMN "delivered_at" TIMESTAMP(3);
ALTER TABLE "notifications" ADD COLUMN "delivery_error" TEXT;
CREATE INDEX "notifications_delivery_status_created_at_idx" ON "notifications"("delivery_status", "created_at");
