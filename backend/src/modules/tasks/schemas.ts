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
  plannedEnd: isoDate.optional(),
  actualStart: isoDate.optional(),
  actualEnd: isoDate.optional(),
  dependsOn: z.array(z.string().uuid()).optional(),
  slaHours: z.number().int().positive().nullable().optional(),
  isRecurring: z.boolean().optional(),
  recurrenceRule: z.string().max(100).nullable().optional(),
});

export const addChecklistItemSchema = z.object({
  label: z.string().min(1).max(300),
});

export const toggleChecklistItemSchema = z.object({
  isDone: z.boolean(),
});

export const closeTaskSchema = z.object({
  photoUrl: z.string().url(),
  geoLat: z.number().min(-90).max(90),
  geoLng: z.number().min(-180).max(180),
});
