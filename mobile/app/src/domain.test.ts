import { describe, expect, it } from 'vitest';
import { addCrewShift, addDefectPhoto, addDocument, addJournalEntry, addMessage, addQualityPhoto, advanceSafetyViolation, advanceSupplyRequest, attachActPdf, closeTask, createDefect, createSafetyViolation, createSupplyRequest, createWorkAct, moveStock, reviewQualityReport, saveCrew, saveMaterial, saveSafetyChecklist, seedData, submitQualityReport, toggleChecklist, toggleCrew, toggleToolIssue } from './domain';
import { createBackup, validateBackup } from './storage';

describe('offline domain', () => {
  it('stores checklist change in sync queue', () => {
    const result = toggleChecklist(seedData, 't-101', 'c-2');
    expect(result.tasks[0]?.checklist[1]?.done).toBe(true);
    expect(result.queue.at(-1)?.type).toBe('task.updated');
  });

  it('requires field evidence in task close command', () => {
    const result = closeTask(seedData, 't-101', 'file:///photo.jpg', 41.31, 69.28);
    expect(result.tasks[0]).toMatchObject({ status: 'review', photoUri: 'file:///photo.jpg', latitude: 41.31, longitude: 69.28 });
    expect(result.queue.at(-1)?.type).toBe('task.closed');
  });

  it('creates defect and queue item', () => {
    const result = createDefect(seedData, '  Нет ограждения  ', '2026-07-31T10:00:00.000Z');
    expect(result.defects[0]?.title).toBe('Нет ограждения');
    expect(result.queue[0]?.entityId).toBe(result.defects[0]?.id);
  });

  it('keeps task linked to project and stage', () => {
    expect(seedData.tasks[0]).toMatchObject({ projectId: 'p1', stage: 'Каркас', priority: 'high' });
  });

  it('requires every mandatory angle before quality review', () => {
    const report = seedData.qualityReports[0]!;
    let next = submitQualityReport(seedData, report.id);
    expect(next.qualityReports[0]?.status).toBe('draft');
    for (const angle of report.requiredAngles) next = addQualityPhoto(next, report.id, angle, `file:///${angle}.jpg`);
    next = submitQualityReport(next, report.id);
    expect(next.qualityReports[0]?.status).toBe('review');
  });

  it('records inspector decision', () => {
    const result = reviewQualityReport(seedData, 'q-2', true);
    expect(result.qualityReports[1]).toMatchObject({ status: 'accepted', inspectorNote: 'Принято технадзором' });
  });

  it('stores defect before and after photos', () => {
    let result = addDefectPhoto(seedData, 'd-21', 'before', 'file:///before.jpg');
    result = addDefectPhoto(result, 'd-21', 'after', 'file:///after.jpg');
    expect(result.defects[0]).toMatchObject({ beforeUri: 'file:///before.jpg', afterUri: 'file:///after.jpg', status: 'review' });
  });

  it('creates threaded message with attachment', () => {
    const result = addMessage(seedData, '@Прораб проверь', 'акт.pdf', 'm-1', '2026-07-31T12:00:00.000Z');
    expect(result.messages[0]).toMatchObject({ text: '@Прораб проверь', attachmentName: 'акт.pdf', parentId: 'm-1' });
  });

  it('stores voice journal entry language', () => {
    const result = addJournalEntry(seedData, '', 'uz', 'file:///voice.m4a', '2026-07-31T12:00:00.000Z');
    expect(result.journal[0]).toMatchObject({ lang: 'uz', audioUri: 'file:///voice.m4a' });
  });

  it('increments document version', () => {
    const result = addDocument(seedData, 'КЖ-08-Колонны.pdf', 'file:///v3.pdf', '2026-07-31T12:00:00.000Z');
    expect(result.documents[0]?.version).toBe(3);
  });

  it('creates an offline supply request and advances its status', () => {
    let result = createSupplyRequest(seedData, ' Цемент М500 ', '20 т', '2026-08-05', '2026-08-01T03:00:00.000Z');
    expect(result.supplyRequests[0]).toMatchObject({ item: 'Цемент М500', quantity: '20 т', status: 'draft' });
    result = advanceSupplyRequest(result, result.supplyRequests[0]!.id);
    expect(result.supplyRequests[0]?.status).toBe('ordered');
    expect(result.queue.at(-1)?.type).toBe('supply.updated');
  });

  it('issues and returns a tool found by QR', () => {
    const tool = seedData.tools.find((x) => x.qr === 'SC-TOOL-0001')!;
    let result = toggleToolIssue(seedData, tool.id, 'Прораб');
    expect(result.tools[0]).toMatchObject({ status: 'issued', holder: 'Прораб' });
    result = toggleToolIssue(result, tool.id, 'Прораб');
    expect(result.tools[0]).toMatchObject({ status: 'available', holder: undefined });
  });

  it('receives and writes off warehouse stock', () => {
    let result = moveStock(seedData, 'mat-1', 'receipt', 2.5, '', 'Поставка №42');
    expect(result.materials[0]?.quantity).toBe(21);
    result = moveStock(result, 'mat-1', 'writeoff', 3, 'Каркас', 'Колонны');
    expect(result.materials[0]?.quantity).toBe(18);
    expect(result.stockMovements[0]).toMatchObject({ kind: 'writeoff', stage: 'Каркас' });
  });

  it('does not allow stock to become negative', () => {
    const result = moveStock(seedData, 'mat-1', 'writeoff', 999, 'Каркас', 'Ошибка');
    expect(result).toBe(seedData);
  });

  it('stores crew shift in the offline queue', () => {
    const result = addCrewShift(seedData, 'Бригада №3', 12, 8, '20 м2 кладки', '', '2026-08-01');
    expect(result.shifts[0]).toMatchObject({ workers: 12, hours: 8, downtime: 'Нет' });
    expect(result.queue.at(-1)?.type).toBe('shift.created');
  });

  it('creates and edits a material for a selected project', () => {
    let result = saveMaterial(seedData, { projectId: 'p2', name: 'Песок', unit: 'м3', minimum: 5, location: 'Склад Б' }, '2026-08-01T07:00:00.000Z');
    expect(result.materials[0]).toMatchObject({ projectId: 'p2', name: 'Песок', quantity: 0, minimum: 5 });
    result = saveMaterial(result, { id: result.materials[0]!.id, projectId: 'p2', name: 'Песок мытый', unit: 'м3', minimum: 8, location: 'Склад Б' });
    expect(result.materials[0]).toMatchObject({ name: 'Песок мытый', minimum: 8 });
  });

  it('maintains a crew directory and detailed attendance', () => {
    let result = saveCrew(seedData, { name: 'Каменщики №3', specialty: 'Кладка', foreman: 'Акмал', defaultWorkers: 12 }, '2026-08-01T07:01:00.000Z');
    const crew = result.crews[0]!;
    result = addCrewShift(result, crew.name, 11, 9, '24 м2', '', '2026-08-01', '2026-08-01T17:00:00.000Z', { projectId: 'p3', crewId: crew.id, arrival: '07:30', departure: '17:30', stage: 'Стены' });
    expect(result.shifts[0]).toMatchObject({ projectId: 'p3', crewId: crew.id, arrival: '07:30', departure: '17:30', stage: 'Стены' });
    result = toggleCrew(result, crew.id);
    expect(result.crews[0]?.active).toBe(false);
  });

  it('requires a completed safety checklist and finger signature', () => {
    const items = [{ id: 'tb-1', text: 'Каски', done: true }];
    expect(saveSafetyChecklist(seedData, 'p1', 'Прораб', items, [], '2026-08-01')).toBe(seedData);
    const result = saveSafetyChecklist(seedData, 'p1', 'Прораб', items, [{ x: 1, y: 1 }, { x: 2, y: 2 }, { x: 3, y: 3 }], '2026-08-01');
    expect(result.safetyChecklists[0]).toMatchObject({ projectId: 'p1', responsible: 'Прораб', completedAt: expect.any(String) });
    expect(result.queue.at(-1)?.type).toBe('safety.checklist');
  });

  it('records and closes a geolocated safety violation', () => {
    let result = createSafetyViolation(seedData, { projectId: 'p2', title: 'Нет ограждения', responsible: 'Акмал', photoUri: 'file:///tb.jpg', latitude: 41.3, longitude: 69.2 });
    const id = result.safetyViolations[0]!.id;
    expect(result.safetyViolations[0]).toMatchObject({ status: 'open', latitude: 41.3 });
    result = advanceSafetyViolation(result, id);
    expect(result.safetyViolations[0]?.status).toBe('fixing');
    result = advanceSafetyViolation(result, id);
    expect(result.safetyViolations[0]).toMatchObject({ status: 'closed', closedAt: expect.any(String) });
  });

  it('creates a signed work act and attaches generated PDF', () => {
    let result = createWorkAct(seedData, { projectId: 'p1', template: 'completed', number: '12', title: 'Монолитные работы', contractor: 'Строй ООО', customer: 'Заказчик ООО', amount: 15000000, date: '2026-08-01', notes: '', signature: [{ x: 1, y: 1 }, { x: 2, y: 2 }, { x: 3, y: 3 }] });
    const id = result.acts[0]!.id;
    expect(result.acts[0]).toMatchObject({ number: '12', template: 'completed', amount: 15000000 });
    result = attachActPdf(result, id, 'file:///act-12.pdf');
    expect(result.acts[0]?.pdfUri).toBe('file:///act-12.pdf');
    expect(result.queue.at(-1)?.type).toBe('act.signed');
  });

  it('validates a complete local backup', () => {
    expect(validateBackup(createBackup(seedData))?.materials.length).toBeGreaterThan(0);
    expect(validateBackup({ tasks: [] })).toBeNull();
    expect(validateBackup({ ...createBackup(seedData), version: 999 })).toBeNull();
  });
});
