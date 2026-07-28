import { z } from 'zod';

export const createPaymentScheduleSchema = z.object({
  description: z.string().min(1).max(500),
  amount: z.number().positive(),
  dueDate: z.coerce.date(),
});

export const markPaymentPaidSchema = z.object({
  paidAt: z.coerce.date().optional(),
});

export const createCustomerApprovalSchema = z.object({
  taskId: z.string().uuid().optional(),
  stageId: z.string().uuid().optional(),
  title: z.string().min(1).max(300),
  comment: z.string().max(2000).optional(),
  raisedBy: z.string().uuid(),
});

export const respondToApprovalSchema = z.object({
  status: z.enum(['approved', 'changes_requested']),
  respondedBy: z.string().uuid(),
  responseComment: z.string().max(2000).optional(),
}).refine((data) => data.status !== 'changes_requested' || !!data.responseComment, {
  message: 'Запрос изменений требует комментария заказчика (responseComment)',
  path: ['responseComment'],
});
