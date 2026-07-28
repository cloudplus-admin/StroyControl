import { z } from 'zod';

export const createDocumentSchema = z.object({
  title: z.string().min(1).max(300),
  // чертёж | смета | договор | акт | исполнительная документация | справка о стоимости работ
  docType: z.enum(['drawing', 'estimate', 'contract', 'act', 'as_built', 'certificate']),
  // код/имя шаблона под формы РУз (акты, справки о стоимости выполненных работ, раздел 9 ТЗ)
  templateCode: z.string().max(100).optional(),
  fileUrl: z.string().url(),
  uploadedBy: z.string().uuid(),
});

export const createVersionSchema = z.object({
  fileUrl: z.string().url(),
  uploadedBy: z.string().uuid(),
});
