import { prisma } from '../../db/prisma';

const versionsDesc = { orderBy: { versionNo: 'desc' as const } };

export async function listDocuments(companyId: string, objectId: string) {
  const object = await prisma.object.findFirst({ where: { id: objectId, companyId } });
  if (!object) return null;
  return prisma.document.findMany({
    where: { objectId },
    orderBy: { createdAt: 'desc' },
    include: { versions: versionsDesc },
  });
}

export async function createDocument(
  companyId: string,
  objectId: string,
  input: { title: string; docType: string; templateCode?: string; fileUrl: string; uploadedBy: string },
) {
  const object = await prisma.object.findFirst({ where: { id: objectId, companyId } });
  if (!object) return null;
  return prisma.document.create({
    data: {
      objectId,
      title: input.title,
      docType: input.docType,
      templateCode: input.templateCode,
      versions: {
        create: { versionNo: 1, fileUrl: input.fileUrl, uploadedById: input.uploadedBy },
      },
    },
    include: { versions: versionsDesc },
  });
}

/**
 * Документ с полной историей версий (контроль версий, кто и когда менял).
 */
export async function getDocument(companyId: string, documentId: string) {
  return prisma.document.findFirst({
    where: { id: documentId, object: { companyId } },
    include: { versions: versionsDesc },
  });
}

export async function addDocumentVersion(
  companyId: string,
  documentId: string,
  input: { fileUrl: string; uploadedBy: string },
) {
  const document = await prisma.document.findFirst({ where: { id: documentId, object: { companyId } } });
  if (!document) return null;
  const lastVersion = await prisma.documentVersion.findFirst({ where: { documentId }, ...versionsDesc });
  const versionNo = (lastVersion?.versionNo ?? 0) + 1;
  return prisma.documentVersion.create({
    data: { documentId, versionNo, fileUrl: input.fileUrl, uploadedById: input.uploadedBy },
  });
}
