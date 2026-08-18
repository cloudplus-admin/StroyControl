import { z } from 'zod';

export const createPhotoReportSchema = z.object({
    taskId: z.string().uuid().optional(),
    authorId: z.string().uuid(),
    shootingPoint: z.string().max(100).optional(),
    kind: z.enum(['progress', 'before', 'after', 'hidden_works']).default('progress'),
    fileUrl: z.string().url(),
    requiredAngles: z.array(z.string().min(1).max(100)).min(1),
    photos: z.array(z.object({ angle: z.string().min(1).max(100), uri: z.string().url() })).min(1),
    status: z.enum(['draft', 'review', 'accepted', 'rejected']).default('draft'),
    geoLat: z.number().min(-90).max(90).optional(),
    geoLng: z.number().min(-180).max(180).optional(),
});

export const reviewPhotoReportSchema = z.object({
  decision: z.enum(['accepted', 'rejected']),
  note: z.string().max(2000).default(''),
}).superRefine((value, context) => {
  if (value.decision === 'rejected' && !value.note.trim()) context.addIssue({ code: 'custom', path: ['note'], message: 'rejection_note_required' });
});

export const createDefectSchema = z.object({
  taskId: z.string().uuid().optional(),
  reportedBy: z.string().uuid(),
  description: z.string().min(1).max(2000),
  beforePhotos: z.array(z.string().url()).min(1).max(20),
  assignedToId: z.string().uuid(),
  dueAt: z.coerce.date().optional(),
});

export const updateDefectSchema = z.object({
  status: z.enum(['open', 'in_progress', 'review', 'closed']),
  afterPhotos: z.array(z.string().url()).max(20).optional(),
  note: z.string().max(2000).optional(),
}).superRefine((value, context) => {
  if (value.status === 'in_progress' && value.note !== undefined && !value.note.trim()) context.addIssue({ code: 'custom', path: ['note'], message: 'rejection_note_required' });
});
