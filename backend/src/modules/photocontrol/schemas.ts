import { z } from 'zod';

export const createPhotoReportSchema = z
  .object({
    taskId: z.string().uuid().optional(),
    authorId: z.string().uuid(),
    shootingPoint: z.string().max(100).optional(),
    kind: z.enum(['progress', 'before', 'after', 'hidden_works']).default('progress'),
    fileUrl: z.string().url(),
    geoLat: z.number().min(-90).max(90).optional(),
    geoLng: z.number().min(-180).max(180).optional(),
    inspectorSignature: z.string().max(200).optional(),
  })
  .refine((data) => data.kind !== 'hidden_works' || !!data.inspectorSignature, {
    message: 'Приёмка скрытых работ требует подписи инженера технадзора (inspectorSignature)',
    path: ['inspectorSignature'],
  });

export const createDefectSchema = z.object({
  taskId: z.string().uuid().optional(),
  reportedBy: z.string().uuid(),
  description: z.string().min(1).max(2000),
});

export const updateDefectSchema = z.object({
  status: z.enum(['open', 'in_progress', 'verified', 'closed']),
});

// Привязка фотофиксации к акту выполненных работ (формы РУз, раздел 6 ТЗ),
// модуль «Документооборот».
export const linkDocumentSchema = z.object({
  documentId: z.string().uuid(),
});
