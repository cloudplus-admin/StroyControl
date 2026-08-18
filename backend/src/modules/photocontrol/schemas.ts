import { z } from 'zod';

export const createPhotoReportSchema = z
  .object({
    taskId: z.string().uuid().optional(),
    authorId: z.string().uuid(),
    shootingPoint: z.string().max(100).optional(),
    kind: z.enum(['progress', 'before', 'after', 'hidden_works']).default('progress'),
    fileUrl: z.string().url(),
    requiredAngles: z.array(z.string().min(1).max(100)).default([]),
    photos: z.array(z.object({ angle: z.string().min(1).max(100), uri: z.string().url() })).default([]),
    status: z.enum(['draft', 'review', 'accepted', 'rejected']).default('draft'),
    geoLat: z.number().min(-90).max(90).optional(),
    geoLng: z.number().min(-180).max(180).optional(),
    inspectorSignature: z.string().max(200).optional(),
  })
  .refine((data) => data.kind !== 'hidden_works' || data.status === 'review' || !!data.inspectorSignature, {
    message: 'Приёмка скрытых работ требует подписи инженера технадзора (inspectorSignature)',
    path: ['inspectorSignature'],
  });

export const reviewPhotoReportSchema = z.object({
  decision: z.enum(['accepted', 'rejected']),
  note: z.string().max(2000).default(''),
  inspectorSignature: z.string().min(1).max(200),
});

export const createDefectSchema = z.object({
  taskId: z.string().uuid().optional(),
  reportedBy: z.string().uuid(),
  description: z.string().min(1).max(2000),
  beforePhotos: z.array(z.string().url()).min(1).max(20),
  dueAt: z.coerce.date().optional(),
});

export const updateDefectSchema = z.object({
  status: z.enum(['open', 'in_progress', 'verified', 'closed']),
  afterPhotos: z.array(z.string().url()).max(20).optional(),
});
