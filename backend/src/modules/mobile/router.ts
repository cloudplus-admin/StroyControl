import { Router } from 'express';
import { prisma } from '../../db/prisma';

export const mobileRouter = Router();

mobileRouter.get('/bootstrap', async (req, res, next) => {
  try {
    const auth = res.locals.auth as { companyId: string; userId: string; roles: { code: string; objectId: string | null }[] } | undefined;
    if (!auth) return res.status(401).json({ error: 'unauthorized' });
    const locale = req.query.locale === 'uz' ? 'uz' : 'ru';
    const localized = (ru: string, uz?: string | null) => locale === 'uz' && uz ? uz : ru;
    const hasCompanyScope = auth.roles.some((role) => role.objectId === null);
    const objectIds = auth.roles.flatMap((role) => role.objectId ? [role.objectId] : []);
    const inspectorOnly = auth.roles.some((role) => role.code === 'inspector') && !auth.roles.some((role) => ['admin', 'owner', 'pm'].includes(role.code));
    const reviewers = await prisma.user.findMany({
      where: { companyId: auth.companyId, roles: { some: { role: { code: 'inspector' }, ...(hasCompanyScope ? {} : { OR: [{ objectId: null }, { objectId: { in: objectIds } }] }) } } },
      select: { id: true, fullName: true, roles: { where: { role: { code: 'inspector' } }, select: { objectId: true } } },
      orderBy: { fullName: 'asc' },
    });
    const objects = await prisma.object.findMany({
      where: { companyId: auth.companyId, ...(hasCompanyScope ? {} : { id: { in: objectIds } }) },
      orderBy: { createdAt: 'desc' },
      include: {
        documents: { orderBy: { createdAt: 'desc' } },
        workActs: { orderBy: { createdAt: 'desc' } },
        photoReports: { orderBy: { createdAt: 'desc' } },
        defects: { orderBy: { createdAt: 'desc' } },
        feedEvents: {
          where: { parentEventId: null },
          orderBy: { createdAt: 'desc' },
          take: 50,
          include: {
            author: { select: { fullName: true } },
            reactions: true,
            replies: { orderBy: { createdAt: 'asc' }, include: { author: { select: { fullName: true } }, reactions: true } },
          },
        },
        stages: { orderBy: { sortOrder: 'asc' }, include: { sections: { orderBy: { sortOrder: 'asc' }, include: { tasks: { where: inspectorOnly ? { reviewerId: auth.userId } : {}, orderBy: { createdAt: 'asc' }, include: { checklist: true, assignee: true, reviewer: { select: { id: true, fullName: true } } } } } } } },
      },
    });
    return res.json({ serverTime: new Date().toISOString(), reviewers: reviewers.map((reviewer) => ({ id: reviewer.id, name: reviewer.fullName, objectIds: reviewer.roles.flatMap((role) => role.objectId ? [role.objectId] : []) })), objects: objects.map((object) => {
      const tasks = object.stages.flatMap((stage) => stage.sections.flatMap((section) => section.tasks.map((task) => ({
        id: task.id, objectId: object.id, stage: localized(stage.name, stage.nameUz), section: localized(section.name, section.nameUz), title: localized(task.title, task.titleUz),
        due: task.plannedEnd?.toISOString().slice(0, 10) ?? '', priority: task.priority,
        assignee: task.assignee?.fullName ?? '', status: task.status, closurePhotoUrl: task.closurePhotoUrl,
        closureGeoLat: task.closureGeoLat, closureGeoLng: task.closureGeoLng,
        reviewNote: task.reviewNote, reviewedAt: task.reviewedAt,
        reviewerId: task.reviewerId, reviewerName: task.reviewer?.fullName ?? null,
        checklist: task.checklist.map((item) => ({ id: item.id, text: localized(item.label, item.labelUz), done: item.isDone })),
      }))));
      const done = tasks.filter((task) => task.status === 'done').length;
      return {
        id: object.id, name: localized(object.name, object.nameUz), address: localized(object.address ?? '', object.addressUz), status: object.status,
        progress: tasks.length ? Math.round(done / tasks.length * 100) : 0, tasks,
        documents: object.documents.map((document) => ({ id: document.id, objectId: object.id, name: document.title, version: document.version, uri: document.fileUrl, status: document.status, createdAt: document.createdAt.toISOString() })),
        acts: object.workActs.map((act) => ({ id: act.id, objectId: object.id, template: act.template, number: act.number, title: act.title, amount: Number(act.amount), status: act.status, pdfUri: act.pdfUrl, signedAt: act.signedAt?.toISOString() ?? null, createdAt: act.createdAt.toISOString() })),
        photoReports: object.photoReports.map((report) => ({ id: report.id, objectId: object.id, taskId: report.taskId, point: report.shootingPoint, kind: report.kind, fileUrl: report.fileUrl, requiredAngles: report.requiredAngles, photos: report.photos, status: report.status, geoLat: report.geoLat, geoLng: report.geoLng, inspectorSignature: report.inspectorSignature, inspectorNote: report.inspectorNote, reviewedAt: report.reviewedAt?.toISOString() ?? null, createdAt: report.createdAt.toISOString() })),
        defects: object.defects.map((defect) => ({ id: defect.id, objectId: object.id, taskId: defect.taskId, description: defect.description, status: defect.status, createdAt: defect.createdAt.toISOString() })),
        feed: object.feedEvents.flatMap((event) => [event, ...event.replies].map((item) => ({ id: item.id, objectId: object.id, author: item.author?.fullName ?? 'StroyControl', body: item.body ?? '', parentEventId: item.parentEventId, reactions: item.reactions.length, createdAt: item.createdAt.toISOString() }))),
      };
    }) });
  } catch (error) { next(error); }
});
