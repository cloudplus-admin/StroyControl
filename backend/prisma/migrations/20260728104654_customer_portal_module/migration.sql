-- CreateTable
CREATE TABLE "payment_schedules" (
    "id" TEXT NOT NULL,
    "object_id" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "due_date" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "paid_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_approvals" (
    "id" TEXT NOT NULL,
    "object_id" TEXT NOT NULL,
    "stage_id" TEXT,
    "task_id" TEXT,
    "title" TEXT NOT NULL,
    "comment" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "raised_by" TEXT NOT NULL,
    "response_comment" TEXT,
    "responded_by" TEXT,
    "responded_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_approvals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "payment_schedules_object_id_idx" ON "payment_schedules"("object_id");

-- CreateIndex
CREATE INDEX "customer_approvals_object_id_idx" ON "customer_approvals"("object_id");

-- CreateIndex
CREATE INDEX "customer_approvals_stage_id_idx" ON "customer_approvals"("stage_id");

-- CreateIndex
CREATE INDEX "customer_approvals_task_id_idx" ON "customer_approvals"("task_id");

-- AddForeignKey
ALTER TABLE "payment_schedules" ADD CONSTRAINT "payment_schedules_object_id_fkey" FOREIGN KEY ("object_id") REFERENCES "objects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_approvals" ADD CONSTRAINT "customer_approvals_object_id_fkey" FOREIGN KEY ("object_id") REFERENCES "objects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_approvals" ADD CONSTRAINT "customer_approvals_stage_id_fkey" FOREIGN KEY ("stage_id") REFERENCES "stages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_approvals" ADD CONSTRAINT "customer_approvals_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_approvals" ADD CONSTRAINT "customer_approvals_raised_by_fkey" FOREIGN KEY ("raised_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_approvals" ADD CONSTRAINT "customer_approvals_responded_by_fkey" FOREIGN KEY ("responded_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
