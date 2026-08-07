import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Router, raw } from 'express';
import { prisma } from '../../db/prisma';

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);
const EXTENSION: Record<string, string> = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'application/pdf': '.pdf' };
const MAX_BYTES = 12 * 1024 * 1024;
const uploadDir = process.env.UPLOAD_DIR ?? path.resolve(process.cwd(), 'uploads');

function hasValidSignature(mimeType: string, body: Buffer) {
  if (mimeType === 'image/jpeg') return body.length >= 4 && body[0] === 0xff && body[1] === 0xd8 && body.at(-2) === 0xff && body.at(-1) === 0xd9;
  if (mimeType === 'image/png') return body.length >= 8 && body.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (mimeType === 'application/pdf') return body.length >= 5 && body.subarray(0, 5).toString('ascii') === '%PDF-';
  return body.length >= 12 && body.subarray(0, 4).toString('ascii') === 'RIFF' && body.subarray(8, 12).toString('ascii') === 'WEBP';
}

export const uploadsRouter = Router();

uploadsRouter.post('/', raw({ type: [...ALLOWED_MIME], limit: MAX_BYTES }), async (req, res, next) => {
  try {
    const companyId = res.locals.auth?.companyId as string | undefined;
    if (!companyId) return res.status(401).json({ error: 'unauthorized' });
    const mimeType = req.header('content-type')?.split(';')[0]?.trim().toLowerCase() ?? '';
    const idempotencyKey = req.header('idempotency-key')?.trim();
    const taskId = req.header('x-task-id')?.trim();
    if (!idempotencyKey || idempotencyKey.length > 200) return res.status(400).json({ error: 'A valid Idempotency-Key header is required' });
    if (taskId) {
      const task = await prisma.task.findFirst({ where: { id: taskId, workSection: { stage: { object: { companyId } } } }, select: { id: true } });
      if (!task) return res.status(404).json({ error: 'task_not_found' });
    }
    const existing = await prisma.fileUpload.findUnique({ where: { companyId_idempotencyKey: { companyId, idempotencyKey } } });
    if (existing) {
      if (taskId && existing.taskId !== taskId) return res.status(409).json({ error: 'idempotency_key_task_mismatch' });
      const url = `${req.protocol}://${req.get('host')}/api/uploads/${existing.id}`;
      return res.status(200).setHeader('Idempotency-Replayed', 'true').json({ id: existing.id, url, mimeType: existing.mimeType, sizeBytes: existing.sizeBytes });
    }
    if (!ALLOWED_MIME.has(mimeType)) return res.status(415).json({ error: 'Only JPEG, PNG, WebP and PDF files are allowed' });
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) return res.status(400).json({ error: 'File body is required' });
    if (req.body.length > MAX_BYTES) return res.status(413).json({ error: 'File is too large' });
    if (!hasValidSignature(mimeType, req.body)) return res.status(415).json({ error: 'File content does not match the declared image type' });

    const storageKey = `${companyId}/${randomUUID()}${EXTENSION[mimeType]}`;
    const diskPath = path.join(uploadDir, storageKey);
    const temporaryPath = `${diskPath}.part`;
    await mkdir(path.dirname(diskPath), { recursive: true });
    await writeFile(temporaryPath, req.body, { flag: 'wx', mode: 0o640 });
    await rename(temporaryPath, diskPath);
    let upload;
    try {
      upload = await prisma.fileUpload.create({ data: {
        companyId,
        uploaderId: res.locals.auth?.userId,
        taskId,
        idempotencyKey,
        storageKey,
        originalName: req.header('x-file-name')?.slice(0, 255) || `photo${EXTENSION[mimeType]}`,
        mimeType,
        sizeBytes: req.body.length,
      } });
    } catch (error) {
      await unlink(diskPath).catch(() => undefined);
      throw error;
    }
    const url = `${req.protocol}://${req.get('host')}/api/uploads/${upload.id}`;
    return res.status(201).json({ id: upload.id, url, mimeType, sizeBytes: upload.sizeBytes });
  } catch (error) { next(error); }
});

uploadsRouter.get('/:id', async (req, res, next) => {
  try {
    const companyId = res.locals.auth?.companyId as string | undefined;
    if (!companyId) return res.status(401).json({ error: 'unauthorized' });
    const upload = await prisma.fileUpload.findFirst({ where: { id: req.params.id, companyId } });
    if (!upload) return res.status(404).json({ error: 'not_found' });
    const diskPath = path.join(uploadDir, upload.storageKey);
    try { await stat(diskPath); } catch { return res.status(404).json({ error: 'file_missing' }); }
    const content = await readFile(diskPath);
    res.type(upload.mimeType).setHeader('content-length', String(content.length));
    res.setHeader('cache-control', 'private, max-age=3600');
    res.setHeader('x-content-type-options', 'nosniff');
    res.setHeader('content-disposition', `inline; filename="${upload.id}${EXTENSION[upload.mimeType] ?? ''}"`);
    return res.send(content);
  } catch (error) { next(error); }
});
