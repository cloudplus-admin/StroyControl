import { z } from 'zod';

const isoDate = z.coerce.date();

export const updateTaskSchema = z.object({
  title: z.string().min(1).max(300).optional(),
  description: z.string().max(2000).optional(),
  status: z.enum(['open', 'in_progress', 'done', 'overdue']).optional(),
  priority: z.enum(['low', 'normal', 'high']).optional(),
  assigneeId: z.string().uuid().nullable().optional(),
  tags: z.array(z.string().min(1).max(40)).optional(),
  plannedStart: isoDate.optional(),
  plannedEnd: isoDate.nullable().optional(),
  actualStart: isoDate.optional(),
  actualEnd: isoDate.optional(),
  dependsOn: z.array(z.string().uuid()).optional(),
  slaHours: z.number().int().positive().nullable().optional(),
  isRecurring: z.boolean().optional(),
  recurrenceRule: z.string().regex(/^(daily|weekdays|weekly:[0-6](,[0-6])*|monthly:([1-9]|1\d|2[0-8]))$/).nullable().optional(),
});

export const addChecklistItemSchema = z.object({
  label: z.string().min(1).max(300),
});

export const toggleChecklistItemSchema = z.object({
  isDone: z.boolean(),
});

export const closeTaskSchema = z.object({
  photoUrl: z.string().url().optional(),
  photoUrls: z.array(z.string().url()).min(1).max(10).optional(),
  geoLat: z.number().min(-90).max(90),
  geoLng: z.number().min(-180).max(180),
}).superRefine((value, ctx) => {
  if (!value.photoUrl && !value.photoUrls?.length) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['photoUrls'], message: 'At least one photo is required' });
}).transform((value) => ({ photoUrls: value.photoUrls?.length ? value.photoUrls : [value.photoUrl!], geoLat: value.geoLat, geoLng: value.geoLng }));

export const reviewTaskSchema = z.object({
  decision: z.enum(['accepted', 'rejected']),
  note: z.string().trim().max(1000).default(''),
}).superRefine((value, ctx) => {
  if (value.decision === 'rejected' && !value.note) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['note'], message: 'Rejection note is required' });
});

export const assignReviewerSchema = z.object({
  reviewerId: z.string().uuid(),
});
