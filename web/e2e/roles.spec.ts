import { expect, Page, test } from "@playwright/test";

const objectId = "object-1";
const roles = ["admin", "pm", "foreman", "inspector", "customer"] as const;
type Role = (typeof roles)[number];

const object = { id: objectId, name: "ЖК Тестовый", address: "Ташкент", progress: 45, taskCount: 1, riskLevel: "medium" };
const document = { id: "document-1", title: "Рабочий проект", kind: "project", version: 1, fileUrl: "http://files.test/project.pdf", status: "review", createdBy: { fullName: "РП" }, approvals: [] };
const act = { id: "act-1", number: "А-1", title: "Монолит", template: "completed", amount: 120000, status: "review", pdfUrl: "http://files.test/act.pdf", createdBy: { fullName: "РП" } };
const gantt = { stages: [{ id: "stage-1", name: "Этап", sections: [{ id: "section-1", name: "Раздел", tasks: [{ id: "task-1", title: "Армирование", status: "in_progress", priority: "high", plannedStart: "2026-08-01", plannedEnd: "2026-08-20", progress: 50, riskLevel: "medium", dependsOn: [] }] }] }] };
const objectDetail = { ...object, stages: gantt.stages };

async function mockApi(page: Page) {
  await page.route("http://127.0.0.1:3000/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (path === "/api/auth/login") {
      const role = (JSON.parse(request.postData() || "{}") as { email?: Role }).email || "foreman";
      return json({ accessToken: `access-${role}`, refreshToken: `refresh-${role}`, expiresIn: 900, user: { id: `user-${role}`, fullName: `Тест ${role}`, email: `${role}@test.local`, companyName: "CloudPlus", roles: [{ code: role, objectId: role === "admin" ? null : objectId }] } });
    }
    if (path === "/api/objects") return json([object]);
    if (path === `/api/objects/${objectId}`) return json(objectDetail);
    if (path === `/api/objects/${objectId}/documents`) return json(request.method() === "GET" ? [document] : { id: "document-new" }, request.method() === "GET" ? 200 : 201);
    if (path === `/api/objects/${objectId}/acts`) return json(request.method() === "GET" ? [act] : { id: "act-new" }, request.method() === "GET" ? 200 : 201);
    if (path === `/api/objects/${objectId}/gantt`) return json(gantt);
    if (path === `/api/objects/${objectId}/photo-reports` || path === `/api/objects/${objectId}/defects`) return json([]);
    if (path === `/api/objects/${objectId}/defect-assignees`) return json([{ id: "user-foreman", fullName: "Тест foreman" }]);
    if (path === "/api/tasks/task-1") return json({ ...gantt.stages[0].sections[0].tasks[0], closurePhotos: [], checklist: [] });
    if (path === "/api/uploads") return json({ id: "upload-1", url: "http://127.0.0.1:3000/api/uploads/upload-1" }, 201);
    if (path === "/api/planning/users") return json([{ id: "user-inspector", fullName: "Тест inspector", email: "inspector@test.local", isActive: true, roles: [{ objectId, role: { code: "inspector", name: "Технадзор" } }] }]);
    if (path === "/api/admin/users" || path === "/api/admin/roles") return json([]);
    if (path.includes("/decision") || path.includes("/sign") || path.includes("/close")) return json({ ok: true });
    return json({});
  });
}

async function login(page: Page, role: Role) {
  await mockApi(page);
  await page.goto("/");
  await page.getByLabel("Email или логин").fill(role);
  await page.getByLabel("Пароль").fill("test-password");
  await page.getByRole("button", { name: "Войти" }).click();
  await expect(page.getByText(`Тест ${role}`)).toBeVisible();
}

test("admin входит, видит управление командой и загружает PDF документа", async ({ page }) => {
  await login(page, "admin");
  await expect(page.getByRole("button", { name: "Пользователи и роли" })).toBeVisible();
  await page.getByRole("button", { name: "Документы и акты" }).click();
  const uploadRequest = page.waitForRequest((request) => request.url().endsWith("/api/uploads") && request.method() === "POST");
  const createRequest = page.waitForRequest((request) => request.url().endsWith(`/api/objects/${objectId}/documents`) && request.method() === "POST");
  const form = page.getByRole("heading", { name: "Добавить документ" }).locator("..");
  await form.getByLabel("Название").fill("Новый проект");
  await form.getByLabel("PDF-файл").setInputFiles({ name: "project.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 e2e") });
  await form.getByRole("button", { name: "Добавить документ" }).click();
  expect((await uploadRequest).headers()["content-type"]).toBe("application/pdf");
  expect((await createRequest).postDataJSON()).toMatchObject({ title: "Новый проект", fileUrl: "http://127.0.0.1:3000/api/uploads/upload-1" });
});

test("РП входит и может создавать документы и акты без доступа к команде", async ({ page }) => {
  await login(page, "pm");
  await expect(page.getByRole("button", { name: "Пользователи и роли" })).toHaveCount(0);
  await page.getByRole("button", { name: "Документы и акты" }).click();
  await expect(page.getByRole("heading", { name: "Добавить документ" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Создать акт" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Согласовать" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Подписать акт" })).toHaveCount(0);
});

test("РП редактирует задачу, добавляет чек-лист, зависимость и проверяющего", async ({ page }) => {
  await login(page, "pm");
  await page.getByRole("button", { name: /ЖК Тестовый/ }).click();
  await page.getByRole("button", { name: /Армирование/ }).click();
  await expect(page.getByRole("heading", { name: "Редактировать задачу" })).toBeVisible();
  const checklistRequest = page.waitForRequest((request) => request.url().endsWith("/api/tasks/task-1/checklist") && request.method() === "POST");
  await page.getByLabel("Добавить пункт").fill("Проверить исполнительную схему");
  await page.getByRole("button", { name: "Добавить пункт" }).click();
  expect((await checklistRequest).postDataJSON()).toEqual({ label: "Проверить исполнительную схему" });
  await page.getByLabel("Проверяющий").selectOption("user-inspector");
  const reviewerRequest = page.waitForRequest((request) => request.url().endsWith("/api/tasks/task-1/reviewer"));
  await page.getByRole("button", { name: "Сохранить задачу" }).click();
  expect((await reviewerRequest).postDataJSON()).toEqual({ reviewerId: "user-inspector" });
});

test("прораб закрывает задачу с координатами браузера и фото", async ({ page, context }) => {
  await context.grantPermissions(["geolocation"], { origin: "http://127.0.0.1:48741" });
  await context.setGeolocation({ latitude: 41.311081, longitude: 69.240562 });
  await login(page, "foreman");
  await page.getByRole("button", { name: "Приемка задач" }).click();
  await page.getByRole("button", { name: /Армирование/ }).click();
  await page.getByLabel("Фото").setInputFiles({ name: "result.jpg", mimeType: "image/jpeg", buffer: Buffer.from("e2e-image") });
  const closeRequest = page.waitForRequest((request) => request.url().endsWith("/api/tasks/task-1/close"));
  await page.getByRole("button", { name: "Закрыть задачу" }).click();
  expect((await closeRequest).postDataJSON()).toMatchObject({ photoUrls: ["http://127.0.0.1:3000/api/uploads/upload-1"], geoLat: 41.311081, geoLng: 69.240562 });
  await page.getByRole("button", { name: "Документы и акты" }).click();
  await expect(page.getByRole("heading", { name: "Добавить документ" })).toHaveCount(0);
});

test("прораб отправляет фото по точке и ракурсам и создает назначенное замечание", async ({ page, context }) => {
  await context.grantPermissions(["geolocation"], { origin: "http://127.0.0.1:48741" });
  await context.setGeolocation({ latitude: 41.311081, longitude: 69.240562 });
  await login(page, "foreman");
  await page.getByRole("button", { name: "Фотоконтроль" }).click();

  const reportForm = page.getByRole("heading", { name: "Новый фотоотчет" }).locator("..");
  await reportForm.getByLabel("Точка съемки").fill("Ось А-4");
  await reportForm.getByLabel("Ракурсы через запятую").fill("Общий, Узел");
  await reportForm.getByLabel("Фото").setInputFiles([
    { name: "overview.jpg", mimeType: "image/jpeg", buffer: Buffer.from("overview") },
    { name: "detail.jpg", mimeType: "image/jpeg", buffer: Buffer.from("detail") },
  ]);
  const reportRequest = page.waitForRequest((request) => request.url().endsWith(`/api/objects/${objectId}/photo-reports`) && request.method() === "POST");
  await reportForm.getByRole("button", { name: "Отправить" }).click();
  expect((await reportRequest).postDataJSON()).toMatchObject({ shootingPoint: "Ось А-4", requiredAngles: ["Общий", "Узел"], geoLat: 41.311081, geoLng: 69.240562 });

  const defectForm = page.getByRole("heading", { name: "Новое замечание" }).locator("..");
  await defectForm.getByLabel("Описание").fill("Скол защитного слоя");
  await defectForm.getByLabel("Ответственный").selectOption("user-foreman");
  await defectForm.getByLabel("Срок").fill("2026-08-25");
  await defectForm.getByLabel("Фото").setInputFiles({ name: "before.jpg", mimeType: "image/jpeg", buffer: Buffer.from("before") });
  const defectRequest = page.waitForRequest((request) => request.url().endsWith(`/api/objects/${objectId}/defects`) && request.method() === "POST");
  await defectForm.getByRole("button", { name: "Создать замечание" }).click();
  expect((await defectRequest).postDataJSON()).toMatchObject({ description: "Скол защитного слоя", assignedToId: "user-foreman" });
});

for (const role of ["inspector", "customer"] as const) {
  test(`${role} согласует документ и подписывает акт в своем объекте`, async ({ page }) => {
    await login(page, role);
    await page.getByRole("button", { name: "Документы и акты" }).click();
    await expect(page.getByRole("heading", { name: "Добавить документ" })).toHaveCount(0);
    const decisionRequest = page.waitForRequest((request) => request.url().endsWith("/api/documents/document-1/decision"));
    await page.getByRole("button", { name: "Согласовать" }).click();
    expect((await decisionRequest).postDataJSON()).toMatchObject({ decision: "approved" });
    const signRequest = page.waitForRequest((request) => request.url().endsWith("/api/acts/act-1/sign"));
    await page.getByRole("button", { name: "Подписать акт" }).click();
    expect((await signRequest).method()).toBe("POST");
  });
}
