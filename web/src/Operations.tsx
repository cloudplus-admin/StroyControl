import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { api, UserSession } from "./api";

type Lang = "ru" | "uz";
type ObjectSummary = { id: string; name: string };
type Gantt = {
  objectName: string;
  criticalPath: { taskIds: string[]; durationDays: number };
  forecast: {
    plannedCompletion?: string;
    forecastCompletion?: string;
    delayDays: number;
  };
  stages: {
    id: string;
    name: string;
    sections: { id: string; name: string; tasks: GanttTask[] }[];
  }[];
};
type GanttTask = {
  id: string;
  title: string;
  status: string;
  plannedStart?: string;
  plannedEnd?: string;
  baselineStart?: string;
  baselineEnd?: string;
  isCritical: boolean;
  riskLevel: string;
};
type TaskDetail = GanttTask & { closurePhotos?: string[]; reviewNote?: string };
type PhotoReport = {
  id: string;
  kind: string;
  fileUrl: string;
  status: string;
  shootingPoint?: string;
  photos: { angle: string; uri: string }[];
};
type Defect = {
  id: string;
  description: string;
  status: string;
  beforePhotos: string[];
  afterPhotos: string[];
  dueAt?: string;
  reviewNote?: string;
  assignedTo?: { id: string; fullName: string };
};
type Assignee = { id: string; fullName: string };

type Coordinates = { latitude: number; longitude: number; accuracy: number };

export function getCurrentCoordinates(): Promise<Coordinates> {
  if (!navigator.geolocation) {
    return Promise.reject(new Error("Геолокация не поддерживается этим браузером"));
  }
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => resolve({ latitude: coords.latitude, longitude: coords.longitude, accuracy: coords.accuracy }),
      (error) => {
        const messages: Record<number, string> = {
          1: "Доступ к геолокации запрещен. Разрешите его в настройках браузера",
          2: "Не удалось определить местоположение. Проверьте GPS или сеть",
          3: "Истекло время определения местоположения. Попробуйте еще раз",
        };
        reject(new Error(messages[error.code] ?? "Не удалось получить геолокацию"));
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
    );
  });
}

function useObjects() {
  const [objects, setObjects] = useState<ObjectSummary[]>([]);
  const [objectId, setObjectId] = useState("");
  useEffect(() => {
    void api.json<ObjectSummary[]>("/api/objects").then((items) => {
      setObjects(items);
      setObjectId(items[0]?.id ?? "");
    });
  }, []);
  return { objects, objectId, setObjectId };
}

function Picker({
  objects,
  objectId,
  setObjectId,
}: ReturnType<typeof useObjects>) {
  return (
    <label className="object-picker">
      Объект
      <select
        value={objectId}
        onChange={(event) => setObjectId(event.target.value)}
      >
        {objects.map((item) => (
          <option key={item.id} value={item.id}>
            {item.name}
          </option>
        ))}
      </select>
    </label>
  );
}

export function Schedule({ canPlan }: { lang: Lang; canPlan: boolean }) {
  const source = useObjects();
  const [data, setData] = useState<Gantt | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    if (source.objectId)
      setData(await api.json<Gantt>(`/api/objects/${source.objectId}/gantt`));
  }, [source.objectId]);
  useEffect(() => {
    void load().catch((e) => setError(String(e)));
  }, [load]);
  const tasks = useMemo(
    () =>
      data?.stages.flatMap((stage) =>
        stage.sections.flatMap((section) =>
          section.tasks.map((task) => ({
            ...task,
            group: `${stage.name} / ${section.name}`,
          })),
        ),
      ) ?? [],
    [data],
  );
  const dates = tasks.flatMap((task) =>
    [task.plannedStart, task.plannedEnd]
      .filter(Boolean)
      .map((value) => new Date(value!).getTime()),
  );
  const min = dates.length ? Math.min(...dates) : Date.now();
  const max = dates.length ? Math.max(...dates) : min + 86_400_000;
  return (
    <>
      <header>
        <div>
          <p className="eyebrow">ПЛАН И КРИТИЧЕСКИЙ ПУТЬ</p>
          <h1>График Ганта</h1>
        </div>
        {canPlan && (
          <button
            onClick={() =>
              void api
                .json(`/api/objects/${source.objectId}/baseline`, {
                  method: "POST",
                })
                .then(load)
            }
          >
            Зафиксировать baseline
          </button>
        )}
      </header>
      <Picker {...source} />
      {error && <p className="error">{error}</p>}
      {data && (
        <>
          <div className="forecast">
            <strong>
              Прогноз сдачи:{" "}
              {data.forecast.forecastCompletion
                ? new Date(data.forecast.forecastCompletion).toLocaleDateString(
                    "ru-RU",
                  )
                : "нет данных"}
            </strong>
            <span className={data.forecast.delayDays ? "delay" : ""}>
              {data.forecast.delayDays
                ? `Сдвиг +${data.forecast.delayDays} дн.`
                : "По плану"}
            </span>
            <span>Критический путь: {data.criticalPath.durationDays} дн.</span>
          </div>
          <section className="gantt" aria-label="График Ганта">
            {tasks.map((task) => {
              const start = task.plannedStart
                ? new Date(task.plannedStart).getTime()
                : min;
              const end = task.plannedEnd
                ? new Date(task.plannedEnd).getTime()
                : start;
              const span = Math.max(1, max - min);
              return (
                <article
                  key={task.id}
                  className={task.isCritical ? "critical" : ""}
                >
                  <div>
                    <strong>{task.title}</strong>
                    <small>{task.group}</small>
                  </div>
                  <div className="gantt-track">
                    <i
                      style={{
                        left: `${((start - min) / span) * 100}%`,
                        width: `${Math.max(2, ((end - start) / span) * 100)}%`,
                      }}
                    />
                  </div>
                  <span>{task.riskLevel}</span>
                </article>
              );
            })}
          </section>
        </>
      )}
    </>
  );
}

async function upload(file: File, taskId?: string) {
  const response = await api.request("/api/uploads", {
    method: "POST",
    headers: {
      "content-type": file.type,
      "idempotency-key": crypto.randomUUID(),
      "x-file-name": file.name,
      ...(taskId ? { "x-task-id": taskId } : {}),
    },
    body: file,
  });
  if (!response.ok) throw new Error(`Загрузка: HTTP ${response.status}`);
  return response.json() as Promise<{ url: string }>;
}

export function Acceptance({ session }: { session: UserSession }) {
  const source = useObjects();
  const [gantt, setGantt] = useState<Gantt | null>(null);
  const [task, setTask] = useState<TaskDetail | null>(null);
  const [note, setNote] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState("");
  const [isClosing, setIsClosing] = useState(false);
  const canClose = session.user.roles.some((role) =>
    ["admin", "owner", "pm", "foreman", "subcontractor"].includes(role.code),
  );
  const canReview = session.user.roles.some((role) =>
    ["admin", "owner", "pm", "inspector"].includes(role.code),
  );
  const load = useCallback(async () => {
    if (source.objectId)
      setGantt(await api.json(`/api/objects/${source.objectId}/gantt`));
  }, [source.objectId]);
  useEffect(() => {
    void load();
  }, [load]);
  const tasks =
    gantt?.stages.flatMap((stage) =>
      stage.sections.flatMap((section) => section.tasks),
    ) ?? [];
  const select = async (id: string) =>
    setTask(await api.json(`/api/tasks/${id}`));
  const close = async () => {
    if (!task || !files.length) return;
    setError("");
    setIsClosing(true);
    try {
      const coordinates = await getCurrentCoordinates();
      const photos = await Promise.all(files.map((file) => upload(file, task.id)));
      await api.json(`/api/tasks/${task.id}/close`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": crypto.randomUUID(),
        },
        body: JSON.stringify({
          photoUrls: photos.map((photo) => photo.url),
          geoLat: coordinates.latitude,
          geoLng: coordinates.longitude,
        }),
      });
      setFiles([]);
      await select(task.id);
      await load();
    } finally {
      setIsClosing(false);
    }
  };
  const review = async (decision: "accepted" | "rejected") => {
    if (!task) return;
    await api.json(`/api/tasks/${task.id}/review`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": crypto.randomUUID(),
      },
      body: JSON.stringify({ decision, note }),
    });
    await select(task.id);
    await load();
  };
  return (
    <>
      <header>
        <div>
          <p className="eyebrow">ЗАКРЫТИЕ И ТЕХНАДЗОР</p>
          <h1>Приемка задач</h1>
        </div>
      </header>
      <Picker {...source} />
      {error && <p className="error">{error}</p>}
      <div className="task-layout">
        <section>
          {tasks.map((item) => (
            <button
              className="acceptance-row"
              key={item.id}
              onClick={() => void select(item.id)}
            >
              <strong>{item.title}</strong>
              <span className={`task-status ${item.status}`}>
                {item.status}
              </span>
            </button>
          ))}
        </section>
        {task && (
          <section className="panel">
            <h3>{task.title}</h3>
            {task.closurePhotos?.map((url) => (
              <a key={url} href={url} target="_blank" rel="noreferrer">
                Фото закрытия
              </a>
            ))}
            {task.reviewNote && <p>{task.reviewNote}</p>}
            {canClose && !["review", "done"].includes(task.status) && (
              <>
                <label>
                  Фото
                  <input
                    type="file"
                    multiple
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
                  />
                </label>
                <button
                  disabled={!files.length || isClosing}
                  onClick={() => void close().catch((e) => setError(String(e)))}
                >
                  {isClosing ? "Определяем геолокацию..." : "Закрыть задачу"}
                </button>
                <small>При закрытии браузер запросит доступ к точной геолокации.</small>
              </>
            )}
            {canReview && task.status === "review" && (
              <>
                <label>
                  Комментарий
                  <input
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                  />
                </label>
                <div className="decision-actions">
                  <button onClick={() => void review("accepted")}>
                    Принять
                  </button>
                  <button
                    className="danger"
                    disabled={!note.trim()}
                    onClick={() => void review("rejected")}
                  >
                    Отклонить
                  </button>
                </div>
              </>
            )}
          </section>
        )}
      </div>
    </>
  );
}

export function PhotoControl({ session }: { session: UserSession }) {
  const source = useObjects();
  const [reports, setReports] = useState<PhotoReport[]>([]);
  const [defects, setDefects] = useState<Defect[]>([]);
  const [error, setError] = useState("");
  const [reportFiles, setReportFiles] = useState<File[]>([]);
  const [defectFile, setDefectFile] = useState<File | null>(null);
  const [afterFile, setAfterFile] = useState<Record<string, File | null>>({});
  const [description, setDescription] = useState("");
  const [reportKind, setReportKind] = useState("progress");
  const [shootingPoint, setShootingPoint] = useState("");
  const [angles, setAngles] = useState("Общий");
  const [dueAt, setDueAt] = useState("");
  const [assignees, setAssignees] = useState<Assignee[]>([]);
  const [assignedToId, setAssignedToId] = useState("");
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const rolesForObject = session.user.roles.filter((role) => role.objectId === null || role.objectId === source.objectId);
  const canWrite = rolesForObject.some((role) =>
    ["admin", "owner", "pm", "foreman", "subcontractor", "inspector"].includes(
      role.code,
    ),
  );
  const canReview = rolesForObject.some((role) =>
    ["admin", "owner", "pm", "inspector", "customer"].includes(role.code),
  );
  const canSubmitHiddenWorks = rolesForObject.some((role) =>
    ["admin", "owner", "pm", "inspector"].includes(role.code),
  );
  const load = useCallback(async () => {
    if (!source.objectId) return;
    const [photoItems, defectItems, people] = await Promise.all([
      api.json<PhotoReport[]>(`/api/objects/${source.objectId}/photo-reports`),
      api.json<Defect[]>(`/api/objects/${source.objectId}/defects`),
      api.json<Assignee[]>(`/api/objects/${source.objectId}/defect-assignees`),
    ]);
    setReports(photoItems);
    setDefects(defectItems);
    setAssignees(people);
    setAssignedToId((current) => current || people[0]?.id || "");
  }, [source.objectId]);
  useEffect(() => {
    void load().catch((e) => setError(String(e)));
  }, [load]);
  const createReport = async (event: FormEvent) => {
    event.preventDefault();
    if (!reportFiles.length) return;
    const coordinates = await getCurrentCoordinates();
    const angleNames = angles.split(",").map((item) => item.trim()).filter(Boolean);
    if (angleNames.length !== reportFiles.length) throw new Error("Для каждого ракурса выбери отдельное фото");
    const uploaded = await Promise.all(reportFiles.map((item) => upload(item)));
    await api.json(`/api/objects/${source.objectId}/photo-reports`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        authorId: session.user.id,
          kind: reportKind,
          shootingPoint,
          fileUrl: uploaded[0].url,
          requiredAngles: angleNames,
          photos: uploaded.map((photo, index) => ({ angle: angleNames[index], uri: photo.url })),
          status: "review",
          geoLat: coordinates.latitude,
          geoLng: coordinates.longitude,
        }),
    });
    setReportFiles([]);
    setReportKind("progress");
    setShootingPoint("");
    await load();
  };
  const createDefect = async (event: FormEvent) => {
    event.preventDefault();
    if (!defectFile || !assignedToId) return;
    const photo = await upload(defectFile);
    await api.json(`/api/objects/${source.objectId}/defects`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        reportedBy: session.user.id,
        description,
        beforePhotos: [photo.url],
        assignedToId,
        ...(dueAt ? { dueAt: new Date(`${dueAt}T23:59:59`).toISOString() } : {}),
      }),
    });
    setDescription("");
    setDefectFile(null);
    setDueAt("");
    await load();
  };
  const review = async (id: string, decision: "accepted" | "rejected") => {
    const note = reviewNotes[id] || "";
    if (decision === "rejected" && !note.trim()) return;
    await api.json(`/api/photo-reports/${id}/review`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ decision, note }),
    });
    await load();
  };
  const updateDefect = async (defect: Defect, status: "in_progress" | "review" | "closed") => {
    let afterPhotos: string[] | undefined;
    if (status === "review") {
      const selected = afterFile[defect.id];
      if (!selected) return;
      afterPhotos = [(await upload(selected)).url];
    }
    const note = reviewNotes[defect.id] || undefined;
    await api.json(`/api/defects/${defect.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status, afterPhotos, note }) });
    setAfterFile((items) => ({ ...items, [defect.id]: null }));
    await load();
  };
  return (
    <>
      <header>
        <div>
          <p className="eyebrow">ФОТОФИКСАЦИЯ И КАЧЕСТВО</p>
          <h1>Фотоконтроль и замечания</h1>
        </div>
      </header>
      <Picker {...source} />
      {error && <p className="error">{error}</p>}
      <div className="document-layout">
        <section className="document-column">
          <h2>Фотоотчеты</h2>
          {reports.map((report) => (
            <article className="document-card" key={report.id}>
              <a href={report.fileUrl} target="_blank" rel="noreferrer">
                Открыть фото
              </a>
              <span className={`task-status ${report.status}`}>
                {report.status}
              </span>
              {canReview && report.status === "review" && (
                <div className="decision-actions">
                  <input aria-label="Комментарий к фотоотчету" placeholder="Комментарий при отклонении" value={reviewNotes[report.id] || ""} onChange={(event) => setReviewNotes({ ...reviewNotes, [report.id]: event.target.value })} />
                  <button onClick={() => void review(report.id, "accepted")}>
                    Принять
                  </button>
                  <button
                    className="danger"
                    disabled={!reviewNotes[report.id]?.trim()}
                    onClick={() => void review(report.id, "rejected")}
                  >
                    Отклонить
                  </button>
                </div>
              )}
            </article>
          ))}
          {canWrite && (
            <form className="panel compact" onSubmit={createReport}>
              <h3>Новый фотоотчет</h3>
              <label>
                Тип
                <select
                  value={reportKind}
                  onChange={(event) => setReportKind(event.target.value)}
                >
                  <option value="progress">Ход работ</option>
                  {canSubmitHiddenWorks && (
                    <option value="hidden_works">
                      Скрытые работы - на приемку
                    </option>
                  )}
                </select>
              </label>
              <label>
                Точка съемки
                <input required value={shootingPoint} onChange={(event) => setShootingPoint(event.target.value)} />
              </label>
              <label>
                Ракурсы через запятую
                <input required value={angles} onChange={(event) => setAngles(event.target.value)} />
              </label>
              <label>
                Фото
                <input
                  required
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={(e) => setReportFiles(Array.from(e.target.files ?? []))}
                />
              </label>
              <button>Отправить</button>
            </form>
          )}
        </section>
        <section className="document-column">
          <h2>Замечания</h2>
          {defects.map((defect) => (
            <article className="document-card" key={defect.id}>
              <strong>{defect.description}</strong>
              <span className={`task-status ${defect.status}`}>
                {defect.status}
              </span>
              {defect.beforePhotos.map((url) => (
                <a key={url} href={url} target="_blank" rel="noreferrer">
                  Фото до
                </a>
              ))}
              {defect.afterPhotos.map((url) => <a key={url} href={url} target="_blank" rel="noreferrer">Фото после</a>)}
              {defect.assignedTo && <small>Ответственный: {defect.assignedTo.fullName}</small>}
              {defect.dueAt && <small>Срок: {new Date(defect.dueAt).toLocaleDateString("ru-RU")}</small>}
              {defect.reviewNote && <p className="error">Отклонено: {defect.reviewNote}</p>}
              {canWrite && defect.status === "open" && <button onClick={() => void updateDefect(defect, "in_progress")}>Взять в работу</button>}
              {canWrite && defect.status === "in_progress" && <><label>Фото после<input aria-label={`Фото после ${defect.description}`} type="file" accept="image/*" onChange={(event) => setAfterFile({ ...afterFile, [defect.id]: event.target.files?.[0] ?? null })} /></label><button disabled={!afterFile[defect.id]} onClick={() => void updateDefect(defect, "review")}>Отправить на проверку</button></>}
              {canReview && defect.status === "review" && <div className="decision-actions"><input aria-label={`Комментарий ${defect.description}`} placeholder="Комментарий при отклонении" value={reviewNotes[defect.id] || ""} onChange={(event) => setReviewNotes({ ...reviewNotes, [defect.id]: event.target.value })} /><button onClick={() => void updateDefect(defect, "closed")}>Принять</button><button className="danger" disabled={!reviewNotes[defect.id]?.trim()} onClick={() => void updateDefect(defect, "in_progress")}>Отклонить</button></div>}
            </article>
          ))}
          {canWrite && (
            <form className="panel compact" onSubmit={createDefect}>
              <h3>Новое замечание</h3>
              <label>
                Описание
                <textarea
                  required
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </label>
              <label>
                Ответственный
                <select required value={assignedToId} onChange={(event) => setAssignedToId(event.target.value)}>{assignees.map((person) => <option key={person.id} value={person.id}>{person.fullName}</option>)}</select>
              </label>
              <label>
                Срок
                <input required type="date" value={dueAt} onChange={(event) => setDueAt(event.target.value)} />
              </label>
              <label>
                Фото
                <input
                  required
                  type="file"
                  accept="image/*"
                  onChange={(e) => setDefectFile(e.target.files?.[0] ?? null)}
                />
              </label>
              <button>Создать замечание</button>
            </form>
          )}
        </section>
      </div>
    </>
  );
}
