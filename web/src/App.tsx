import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { api, UserSession } from "./api";
import "./styles.css";

type Lang = "ru" | "uz";
type ObjectSummary = {
  id: string;
  name: string;
  address?: string;
  progress: number;
  taskCount: number;
  riskLevel: string;
};
type ObjectDetail = {
  id: string;
  name: string;
  stages: {
    id: string;
    name: string;
    sections: {
      id: string;
      name: string;
      tasks: {
        id: string;
        title: string;
        status: string;
        priority: string;
        plannedEnd?: string;
      }[];
    }[];
  }[];
};
type Role = { id: number; code: string; name: string };
type User = {
  id: string;
  fullName: string;
  email: string;
  isActive: boolean;
  roles: { objectId: string | null; role: { code: string; name: string } }[];
};
type ProjectDocument = {
  id: string; title: string; kind: string; version: number; fileUrl: string; status: string;
  createdBy: { fullName: string };
  approvals: { id: string; decision: string; note?: string; actor: { fullName: string } }[];
};
type WorkAct = {
  id: string; number: string; title: string; template: string; amount: string | number;
  status: string; pdfUrl?: string; createdBy: { fullName: string }; signedBy?: { fullName: string };
};

const copy = {
  ru: {
    loginError: "Ошибка входа",
    eyebrowLogin: "УПРАВЛЕНИЕ СТРОИТЕЛЬСТВОМ",
    loginTitle: "Вход в рабочий контур",
    loginBody: "Объекты, команда и задачи одной компании.",
    login: "Email или логин",
    password: "Пароль",
    signingIn: "Входим...",
    signIn: "Войти",
    objects: "Объекты и задачи",
    team: "Пользователи и роли",
    documents: "Документы и акты",
    logout: "Выйти",
    production: "ПРОИЗВОДСТВЕННЫЙ КОНТУР",
    serverOnline: "Сервер подключен",
    overdue: "Есть просрочка",
    onTrack: "В графике",
    noAddress: "Адрес не указан",
    tasks: "задач",
    selected: "ВЫБРАННЫЙ ОБЪЕКТ",
    sections: "разделов",
    noDeadline: "Без срока",
    noTasks: "Задач пока нет",
    newTask: "Новая задача",
    section: "Раздел",
    title: "Название",
    assignee: "Исполнитель",
    unassigned: "Не назначен",
    priority: "Приоритет",
    low: "Низкий",
    normal: "Обычный",
    high: "Высокий",
    deadline: "Срок",
    createTask: "Создать задачу",
    access: "ДОСТУП И ОТВЕТСТВЕННОСТЬ",
    addEmployee: "Добавить сотрудника",
    fullName: "ФИО",
    temporaryPassword: "Временный пароль",
    role: "Роль",
    object: "Объект",
    wholeCompany: "Вся компания",
    createUser: "Создать пользователя",
  },
  uz: {
    loginError: "Kirish xatosi",
    eyebrowLogin: "QURILISHNI BOSHQARISH",
    loginTitle: "Ish tizimiga kirish",
    loginBody: "Bir kompaniyaning obyektlari, jamoasi va vazifalari.",
    login: "Email yoki login",
    password: "Parol",
    signingIn: "Kirilmoqda...",
    signIn: "Kirish",
    objects: "Obyektlar va vazifalar",
    team: "Foydalanuvchilar va rollar",
    documents: "Hujjatlar va dalolatnomalar",
    logout: "Chiqish",
    production: "ISHLAB CHIQARISH TIZIMI",
    serverOnline: "Server ulangan",
    overdue: "Kechikish bor",
    onTrack: "Reja bo‘yicha",
    noAddress: "Manzil ko‘rsatilmagan",
    tasks: "vazifa",
    selected: "TANLANGAN OBYEKT",
    sections: "bo‘lim",
    noDeadline: "Muddatsiz",
    noTasks: "Hozircha vazifalar yo‘q",
    newTask: "Yangi vazifa",
    section: "Bo‘lim",
    title: "Nomi",
    assignee: "Ijrochi",
    unassigned: "Tayinlanmagan",
    priority: "Ustuvorlik",
    low: "Past",
    normal: "Oddiy",
    high: "Yuqori",
    deadline: "Muddat",
    createTask: "Vazifa yaratish",
    access: "KIRISH VA MAS’ULIYAT",
    addEmployee: "Xodim qo‘shish",
    fullName: "F.I.Sh.",
    temporaryPassword: "Vaqtinchalik parol",
    role: "Rol",
    object: "Obyekt",
    wholeCompany: "Butun kompaniya",
    createUser: "Foydalanuvchi yaratish",
  },
} as const;
type Copy = typeof copy.ru | typeof copy.uz;

export default function App() {
  const [session, setSession] = useState<UserSession | null>(api.getSession());
  const [lang, setLangState] = useState<Lang>(() =>
    localStorage.getItem("stroycontrol:web:lang") === "uz" ? "uz" : "ru",
  );
  const setLang = (value: Lang) => {
    localStorage.setItem("stroycontrol:web:lang", value);
    setLangState(value);
  };
  if (!session)
    return <Login lang={lang} setLang={setLang} onLogin={setSession} />;
  return (
    <Workspace
      lang={lang}
      setLang={setLang}
      session={session}
      onLogout={async () => {
        await api.logout();
        setSession(null);
      }}
    />
  );
}

function LanguageSwitch({
  lang,
  setLang,
}: {
  lang: Lang;
  setLang: (lang: Lang) => void;
}) {
  return (
    <div className="language-switch">
      <button
        className={lang === "ru" ? "active" : ""}
        onClick={() => setLang("ru")}
      >
        RU
      </button>
      <button
        className={lang === "uz" ? "active" : ""}
        onClick={() => setLang("uz")}
      >
        UZ
      </button>
    </div>
  );
}

function Login({
  lang,
  setLang,
  onLogin,
}: {
  lang: Lang;
  setLang: (lang: Lang) => void;
  onLogin: (session: UserSession) => void;
}) {
  const c = copy[lang];
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      onLogin(await api.login(email, password));
    } catch (e) {
      setError(e instanceof Error ? e.message : c.loginError);
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="login-page">
      <section className="login-card">
        <LanguageSwitch lang={lang} setLang={setLang} />
        <div className="brand">
          STROY<span>CONTROL</span>
        </div>
        <p className="eyebrow">{c.eyebrowLogin}</p>
        <h1>{c.loginTitle}</h1>
        <p className="muted">{c.loginBody}</p>
        <form onSubmit={submit}>
          <label>
            {c.login}
            <input
              type="text"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
          <label>
            {c.password}
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={3}
              required
            />
          </label>
          {error && <p className="error">{error}</p>}
          <button disabled={busy}>{busy ? c.signingIn : c.signIn}</button>
        </form>
      </section>
    </main>
  );
}

function Workspace({
  lang,
  setLang,
  session,
  onLogout,
}: {
  lang: Lang;
  setLang: (lang: Lang) => void;
  session: UserSession;
  onLogout: () => Promise<void>;
}) {
  const c = copy[lang];
  const admin = session.user.roles.some((role) => role.code === "admin");
  const canPlan = session.user.roles.some((role) =>
    ["admin", "owner", "pm"].includes(role.code),
  );
  const canManageDocuments = session.user.roles.some((role) =>
    ["admin", "owner", "pm", "foreman"].includes(role.code),
  );
  const canDecideDocuments = session.user.roles.some((role) =>
    ["admin", "owner", "pm", "inspector", "customer"].includes(role.code),
  );
  const canSignActs = session.user.roles.some((role) =>
    ["inspector", "customer"].includes(role.code),
  );
  const [tab, setTab] = useState<"objects" | "documents" | "team">("objects");
  return (
    <div className="shell">
      <aside>
        <div className="brand">
          STROY<span>CONTROL</span>
        </div>
        <LanguageSwitch lang={lang} setLang={setLang} />
        <nav>
          <button
            className={tab === "objects" ? "active" : ""}
            onClick={() => setTab("objects")}
          >
            {c.objects}
          </button>
          <button
            className={tab === "documents" ? "active" : ""}
            onClick={() => setTab("documents")}
          >
            {c.documents}
          </button>
          {admin && (
            <button
              className={tab === "team" ? "active" : ""}
              onClick={() => setTab("team")}
            >
              {c.team}
            </button>
          )}
        </nav>
        <div className="profile">
          <strong>{session.user.fullName}</strong>
          <small>{session.user.companyName}</small>
          <button onClick={() => void onLogout()}>{c.logout}</button>
        </div>
      </aside>
      <main className="workspace">
        {tab === "objects" ? (
          <Objects lang={lang} c={c} canPlan={canPlan} />
        ) : tab === "documents" ? (
          <Documents
            lang={lang}
            canManage={canManageDocuments}
            canDecide={canDecideDocuments}
            canSign={canSignActs}
          />
        ) : (
          <Team lang={lang} c={c} currentUserId={session.user.id} />
        )}
      </main>
    </div>
  );
}

function Documents({
  lang,
  canManage,
  canDecide,
  canSign,
}: {
  lang: Lang;
  canManage: boolean;
  canDecide: boolean;
  canSign: boolean;
}) {
  const t = lang === "ru" ? {
    eyebrow: "СОГЛАСОВАНИЕ И ПРИЕМКА", title: "Документы и акты", object: "Объект",
    documents: "Документы", acts: "Акты", empty: "Пока ничего нет", addDocument: "Добавить документ",
    addAct: "Создать акт", name: "Название", kind: "Тип", file: "Ссылка на PDF", version: "Версия",
    number: "Номер", template: "Шаблон", amount: "Сумма", approve: "Согласовать", reject: "Отклонить",
    note: "Комментарий", sign: "Подписать акт", reload: "Обновить", createdBy: "Автор", approvals: "Решения",
    project: "Проект", estimate: "Смета", contract: "Договор", other: "Другое",
    completed: "Выполненные работы", hidden: "Скрытые работы", acceptance: "Приемка",
  } : {
    eyebrow: "KELISHISH VA QABUL", title: "Hujjatlar va dalolatnomalar", object: "Obyekt",
    documents: "Hujjatlar", acts: "Dalolatnomalar", empty: "Hozircha hech narsa yo'q", addDocument: "Hujjat qo'shish",
    addAct: "Dalolatnoma yaratish", name: "Nomi", kind: "Turi", file: "PDF havolasi", version: "Versiya",
    number: "Raqam", template: "Shablon", amount: "Summa", approve: "Tasdiqlash", reject: "Rad etish",
    note: "Izoh", sign: "Imzolash", reload: "Yangilash", createdBy: "Muallif", approvals: "Qarorlar",
    project: "Loyiha", estimate: "Smeta", contract: "Shartnoma", other: "Boshqa",
    completed: "Bajarilgan ishlar", hidden: "Yashirin ishlar", acceptance: "Qabul",
  };
  const [objects, setObjects] = useState<ObjectSummary[]>([]);
  const [objectId, setObjectId] = useState("");
  const [documents, setDocuments] = useState<ProjectDocument[]>([]);
  const [acts, setActs] = useState<WorkAct[]>([]);
  const [error, setError] = useState("");
  const [note, setNote] = useState<Record<string, string>>({});
  const [documentForm, setDocumentForm] = useState({ title: "", kind: "project", fileUrl: "", version: 1 });
  const [actForm, setActForm] = useState({ number: "", title: "", template: "completed", amount: "0", pdfUrl: "" });
  useEffect(() => {
    void api.json<ObjectSummary[]>("/api/objects").then((items) => {
      setObjects(items);
      setObjectId((current) => current || items[0]?.id || "");
    }).catch((e) => setError(String(e)));
  }, []);
  const load = useCallback(async () => {
    if (!objectId) return;
    setError("");
    try {
      const [documentItems, actItems] = await Promise.all([
        api.json<ProjectDocument[]>(`/api/objects/${objectId}/documents`),
        api.json<WorkAct[]>(`/api/objects/${objectId}/acts`),
      ]);
      setDocuments(documentItems);
      setActs(actItems);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }, [objectId]);
  useEffect(() => { void load(); }, [load]);
  const createDocument = async (event: FormEvent) => {
    event.preventDefault();
    await api.json(`/api/objects/${objectId}/documents`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(documentForm) });
    setDocumentForm({ ...documentForm, title: "", fileUrl: "" });
    await load();
  };
  const createAct = async (event: FormEvent) => {
    event.preventDefault();
    await api.json(`/api/objects/${objectId}/acts`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...actForm, amount: Number(actForm.amount), pdfUrl: actForm.pdfUrl || undefined }) });
    setActForm({ ...actForm, number: "", title: "", amount: "0", pdfUrl: "" });
    await load();
  };
  const decide = async (id: string, decision: "approved" | "rejected") => {
    await api.json(`/api/documents/${id}/decision`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ decision, note: note[id] || undefined }) });
    await load();
  };
  const sign = async (id: string) => { await api.json(`/api/acts/${id}/sign`, { method: "POST" }); await load(); };
  return <>
    <header><div><p className="eyebrow">{t.eyebrow}</p><h1>{t.title}</h1></div><button onClick={() => void load()}>{t.reload}</button></header>
    {error && <p className="error">{error}</p>}
    <label className="object-picker">{t.object}<select value={objectId} onChange={(e) => setObjectId(e.target.value)}>{objects.map((object) => <option key={object.id} value={object.id}>{object.name}</option>)}</select></label>
    <div className="document-layout">
      <section className="document-column"><h2>{t.documents}</h2>{documents.length === 0 && <p className="muted">{t.empty}</p>}
        {documents.map((document) => <article className="document-card" key={document.id}><div className="document-head"><div><strong>{document.title}</strong><small>{document.kind} · v{document.version} · {t.createdBy}: {document.createdBy.fullName}</small></div><span className={`task-status ${document.status}`}>{document.status}</span></div><a href={document.fileUrl} target="_blank" rel="noreferrer">PDF</a>
          {document.approvals.length > 0 && <p className="decision-log">{t.approvals}: {document.approvals.map((item) => `${item.actor.fullName} - ${item.decision}${item.note ? ` (${item.note})` : ""}`).join("; ")}</p>}
          {canDecide && document.status === "review" && <div className="decision-actions"><input placeholder={t.note} value={note[document.id] || ""} onChange={(e) => setNote({ ...note, [document.id]: e.target.value })}/><button onClick={() => void decide(document.id, "approved")}>{t.approve}</button><button className="danger" disabled={!note[document.id]?.trim()} onClick={() => void decide(document.id, "rejected")}>{t.reject}</button></div>}
        </article>)}
        {canManage && <form className="panel compact" onSubmit={createDocument}><h3>{t.addDocument}</h3><label>{t.name}<input required minLength={2} value={documentForm.title} onChange={(e) => setDocumentForm({ ...documentForm, title: e.target.value })}/></label><label>{t.kind}<select value={documentForm.kind} onChange={(e) => setDocumentForm({ ...documentForm, kind: e.target.value })}><option value="project">{t.project}</option><option value="estimate">{t.estimate}</option><option value="contract">{t.contract}</option><option value="other">{t.other}</option></select></label><label>{t.file}<input required type="url" value={documentForm.fileUrl} onChange={(e) => setDocumentForm({ ...documentForm, fileUrl: e.target.value })}/></label><label>{t.version}<input required type="number" min="1" value={documentForm.version} onChange={(e) => setDocumentForm({ ...documentForm, version: Number(e.target.value) })}/></label><button>{t.addDocument}</button></form>}
      </section>
      <section className="document-column"><h2>{t.acts}</h2>{acts.length === 0 && <p className="muted">{t.empty}</p>}
        {acts.map((act) => <article className="document-card" key={act.id}><div className="document-head"><div><strong>{act.number} - {act.title}</strong><small>{act.template} · {Number(act.amount).toLocaleString(lang === "ru" ? "ru-RU" : "uz-UZ")} · {t.createdBy}: {act.createdBy.fullName}</small></div><span className={`task-status ${act.status}`}>{act.status}</span></div>{act.pdfUrl && <a href={act.pdfUrl} target="_blank" rel="noreferrer">PDF</a>}{canSign && act.status === "review" && <button onClick={() => void sign(act.id)}>{t.sign}</button>}</article>)}
        {canManage && <form className="panel compact" onSubmit={createAct}><h3>{t.addAct}</h3><label>{t.number}<input required value={actForm.number} onChange={(e) => setActForm({ ...actForm, number: e.target.value })}/></label><label>{t.name}<input required minLength={2} value={actForm.title} onChange={(e) => setActForm({ ...actForm, title: e.target.value })}/></label><label>{t.template}<select value={actForm.template} onChange={(e) => setActForm({ ...actForm, template: e.target.value })}><option value="completed">{t.completed}</option><option value="hidden">{t.hidden}</option><option value="acceptance">{t.acceptance}</option></select></label><label>{t.amount}<input required type="number" min="0" step="0.01" value={actForm.amount} onChange={(e) => setActForm({ ...actForm, amount: e.target.value })}/></label><label>{t.file}<input type="url" value={actForm.pdfUrl} onChange={(e) => setActForm({ ...actForm, pdfUrl: e.target.value })}/></label><button>{t.addAct}</button></form>}
      </section>
    </div>
  </>;
}

function Objects({
  lang,
  c,
  canPlan,
}: {
  lang: Lang;
  c: Copy;
  canPlan: boolean;
}) {
  const [objects, setObjects] = useState<ObjectSummary[]>([]);
  const [people, setPeople] = useState<User[]>([]);
  const [selected, setSelected] = useState<ObjectDetail | null>(null);
  const [error, setError] = useState("");
  const [title, setTitle] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [priority, setPriority] = useState("normal");
  const [plannedEnd, setPlannedEnd] = useState("");
  const load = useCallback(async () => {
    try {
      setObjects(await api.json("/api/objects"));
      if (canPlan) setPeople(await api.json("/api/planning/users"));
    } catch (e) {
      setError(String(e));
    }
  }, [canPlan]);
  useEffect(() => {
    void load();
  }, [load]);
  const open = async (id: string) => {
    const value = await api.json<ObjectDetail>(`/api/objects/${id}`);
    setSelected(value);
    setSectionId(value.stages[0]?.sections[0]?.id ?? "");
  };
  const sections = useMemo(
    () =>
      selected?.stages.flatMap((stage) =>
        stage.sections.map((section) => ({ ...section, stage: stage.name })),
      ) ?? [],
    [selected],
  );
  const createTask = async (event: FormEvent) => {
    event.preventDefault();
    if (!sectionId) return;
    await api.json(`/api/objects/sections/${sectionId}/tasks`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title,
        assigneeId: assigneeId || null,
        priority,
        plannedEnd: plannedEnd || undefined,
        dependsOn: [],
      }),
    });
    setTitle("");
    setPlannedEnd("");
    if (selected) await open(selected.id);
    await load();
  };
  return (
    <>
      <header>
        <div>
          <p className="eyebrow">{c.production}</p>
          <h1>{c.objects}</h1>
        </div>
        <div className="status-dot">{c.serverOnline}</div>
      </header>
      {error && <p className="error">{error}</p>}
      <section className="object-grid">
        {objects.map((object) => (
          <button
            className={`object-card ${selected?.id === object.id ? "selected" : ""}`}
            key={object.id}
            onClick={() => void open(object.id)}
          >
            <span className={`risk ${object.riskLevel}`}>
              {object.riskLevel === "overdue" ? c.overdue : c.onTrack}
            </span>
            <h2>{object.name}</h2>
            <p>{object.address || c.noAddress}</p>
            <div className="progress">
              <i style={{ width: `${object.progress}%` }} />
            </div>
            <div className="metrics">
              <strong>{object.progress}%</strong>
              <span>
                {object.taskCount} {c.tasks}
              </span>
            </div>
          </button>
        ))}
      </section>
      {selected && (
        <section className="detail">
          <div className="detail-head">
            <div>
              <p className="eyebrow">{c.selected}</p>
              <h2>{selected.name}</h2>
            </div>
            <span>
              {sections.length} {c.sections}
            </span>
          </div>
          <div className="task-layout">
            <div>
              {sections.map((section) => (
                <article className="section" key={section.id}>
                  <h3>
                    {section.stage} / {section.name}
                  </h3>
                  {section.tasks.length ? (
                    section.tasks.map((task) => (
                      <div className="task" key={task.id}>
                        <div>
                          <strong>{task.title}</strong>
                          <small>
                            {task.plannedEnd
                              ? new Date(task.plannedEnd).toLocaleDateString(
                                  lang === "uz" ? "uz-UZ" : "ru-RU",
                                )
                              : c.noDeadline}
                          </small>
                        </div>
                        <span className={`task-status ${task.status}`}>
                          {task.status}
                        </span>
                      </div>
                    ))
                  ) : (
                    <p className="muted">{c.noTasks}</p>
                  )}
                </article>
              ))}
            </div>
            {canPlan && (
              <form className="panel" onSubmit={createTask}>
                <h3>{c.newTask}</h3>
                <label>
                  {c.section}
                  <select
                    value={sectionId}
                    onChange={(e) => setSectionId(e.target.value)}
                  >
                    {sections.map((section) => (
                      <option value={section.id} key={section.id}>
                        {section.stage} / {section.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {c.title}
                  <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    required
                  />
                </label>
                <label>
                  {c.assignee}
                  <select
                    value={assigneeId}
                    onChange={(e) => setAssigneeId(e.target.value)}
                  >
                    <option value="">{c.unassigned}</option>
                    {people.map((person) => (
                      <option value={person.id} key={person.id}>
                        {person.fullName}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {c.priority}
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value)}
                  >
                    <option value="low">{c.low}</option>
                    <option value="normal">{c.normal}</option>
                    <option value="high">{c.high}</option>
                  </select>
                </label>
                <label>
                  {c.deadline}
                  <input
                    type="date"
                    value={plannedEnd}
                    onChange={(e) => setPlannedEnd(e.target.value)}
                  />
                </label>
                <button>{c.createTask}</button>
              </form>
            )}
          </div>
        </section>
      )}
    </>
  );
}

function Team({
  lang,
  c,
  currentUserId,
}: {
  lang: Lang;
  c: Copy;
  currentUserId: string;
}) {
  const text =
    lang === "ru"
      ? {
          edit: "Изменить сотрудника",
          active: "Активен",
          disabled: "Отключен",
          newPassword: "Новый пароль",
          passwordHint: "Оставь пустым, если менять не нужно",
          save: "Сохранить изменения",
          cancel: "Отмена",
          saved: "Изменения сохранены",
          enabled: "Доступ включен",
          addRole: "Добавить роль",
          removeRole: "Удалить",
        }
      : {
          edit: "Xodimni o\u2018zgartirish",
          active: "Faol",
          disabled: "O\u2018chirilgan",
          newPassword: "Yangi parol",
          passwordHint:
            "O\u2018zgartirish kerak bo\u2018lmasa bo\u2018sh qoldiring",
          save: "O\u2018zgarishlarni saqlash",
          cancel: "Bekor qilish",
          saved: "O\u2018zgarishlar saqlandi",
          enabled: "Kirish yoqilgan",
          addRole: "Rol qo\u2018shish",
          removeRole: "Olib tashlash",
        };
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [objects, setObjects] = useState<ObjectSummary[]>([]);
  const [form, setForm] = useState({
    fullName: "",
    email: "",
    password: "",
    roleCode: "foreman",
    objectId: "",
  });
  const [editing, setEditing] = useState<User | null>(null);
  const [editForm, setEditForm] = useState({
    fullName: "",
    password: "",
    roles: [] as { roleCode: string; objectId: string }[],
    isActive: true,
  });
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const [u, r, o] = await Promise.all([
      api.json<User[]>("/api/admin/users"),
      api.json<Role[]>("/api/admin/roles"),
      api.json<ObjectSummary[]>("/api/objects"),
    ]);
    setUsers(u);
    setRoles(r);
    setObjects(o);
  }, []);
  useEffect(() => {
    void load().catch((e) => setError(String(e)));
  }, [load]);
  const create = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setNotice("");
    setBusy(true);
    try {
      await api.json("/api/admin/users", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...form, objectId: form.objectId || null }),
      });
      setForm({ ...form, fullName: "", email: "", password: "" });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const startEdit = (user: User) => {
    setEditing(user);
    setEditForm({
      fullName: user.fullName,
      password: "",
      roles: user.roles.length
        ? user.roles.map((assignment) => ({
            roleCode: assignment.role.code,
            objectId: assignment.objectId ?? "",
          }))
        : [{ roleCode: roles[0]?.code ?? "", objectId: "" }],
      isActive: user.isActive,
    });
    setError("");
    setNotice("");
  };
  const update = async (event: FormEvent) => {
    event.preventDefault();
    if (!editing) return;
    setError("");
    setNotice("");
    setBusy(true);
    try {
      const body: Record<string, unknown> = {
        fullName: editForm.fullName,
        isActive: editForm.isActive,
        roles: editForm.roles.map((assignment) => ({
          roleCode: assignment.roleCode,
          objectId: assignment.objectId || null,
        })),
      };
      if (editForm.password) body.password = editForm.password;
      const updated = await api.json<User>(`/api/admin/users/${editing.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      setEditing(updated);
      setEditForm({ ...editForm, password: "" });
      setNotice(text.saved);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <header>
        <div>
          <p className="eyebrow">{c.access}</p>
          <h1>{c.team}</h1>
        </div>
      </header>
      {error && <p className="error">{error}</p>}
      {notice && <p className="notice">{notice}</p>}
      <div className="team-layout">
        <section className="user-list">
          {users.map((user) => (
            <button
              type="button"
              className={`user-row ${editing?.id === user.id ? "selected" : ""} ${user.isActive ? "" : "inactive"}`}
              key={user.id}
              onClick={() => startEdit(user)}
            >
              <div className="avatar">
                {user.fullName
                  .split(" ")
                  .map((x) => x[0])
                  .join("")
                  .slice(0, 2)}
              </div>
              <div className="user-copy">
                <strong>{user.fullName}</strong>
                <small>{user.email}</small>
                <small>
                  {user.roles
                    .map((assignment) => assignment.role.name)
                    .join(", ")}
                </small>
              </div>
              <span className={`user-state ${user.isActive ? "active" : ""}`}>
                {user.isActive ? text.active : text.disabled}
              </span>
            </button>
          ))}
        </section>
        {editing ? (
          <form className="panel" onSubmit={update}>
            <div className="panel-title">
              <h3>{text.edit}</h3>
              <button
                type="button"
                className="link-button"
                onClick={() => {
                  setEditing(null);
                  setNotice("");
                }}
              >
                {text.cancel}
              </button>
            </div>
            <label>
              {c.fullName}
              <input
                value={editForm.fullName}
                onChange={(e) =>
                  setEditForm({ ...editForm, fullName: e.target.value })
                }
                required
              />
            </label>
            <label>
              Email
              <input value={editing.email} disabled />
            </label>
            {editForm.roles.map((assignment, index) => (
              <div className="role-assignment" key={index}>
                <label>
                  {c.role}
                  <select
                    value={assignment.roleCode}
                    onChange={(e) =>
                      setEditForm({
                        ...editForm,
                        roles: editForm.roles.map((item, itemIndex) =>
                          itemIndex === index
                            ? { ...item, roleCode: e.target.value }
                            : item,
                        ),
                      })
                    }
                  >
                    {roles.map((role) => (
                      <option value={role.code} key={role.code}>
                        {role.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {c.object}
                  <select
                    value={assignment.objectId}
                    onChange={(e) =>
                      setEditForm({
                        ...editForm,
                        roles: editForm.roles.map((item, itemIndex) =>
                          itemIndex === index
                            ? { ...item, objectId: e.target.value }
                            : item,
                        ),
                      })
                    }
                  >
                    <option value="">{c.wholeCompany}</option>
                    {objects.map((object) => (
                      <option value={object.id} key={object.id}>
                        {object.name}
                      </option>
                    ))}
                  </select>
                </label>
                {editForm.roles.length > 1 && (
                  <button
                    type="button"
                    className="link-button remove-role"
                    onClick={() =>
                      setEditForm({
                        ...editForm,
                        roles: editForm.roles.filter(
                          (_, itemIndex) => itemIndex !== index,
                        ),
                      })
                    }
                  >
                    {text.removeRole}
                  </button>
                )}
              </div>
            ))}
            <button
              type="button"
              className="secondary-button"
              onClick={() =>
                setEditForm({
                  ...editForm,
                  roles: [
                    ...editForm.roles,
                    { roleCode: roles[0]?.code ?? "", objectId: "" },
                  ],
                })
              }
            >
              {text.addRole}
            </button>
            <label>
              {text.newPassword}
              <input
                type="password"
                minLength={10}
                placeholder={text.passwordHint}
                value={editForm.password}
                onChange={(e) =>
                  setEditForm({ ...editForm, password: e.target.value })
                }
              />
            </label>
            <label className="toggle">
              <input
                type="checkbox"
                checked={editForm.isActive}
                disabled={editing.id === currentUserId}
                onChange={(e) =>
                  setEditForm({ ...editForm, isActive: e.target.checked })
                }
              />
              <span>{editForm.isActive ? text.enabled : text.disabled}</span>
            </label>
            <button disabled={busy}>{text.save}</button>
          </form>
        ) : (
          <form className="panel" onSubmit={create}>
            <h3>{c.addEmployee}</h3>
            <label>
              {c.fullName}
              <input
                value={form.fullName}
                onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                required
              />
            </label>
            <label>
              Email
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                required
              />
            </label>
            <label>
              {c.temporaryPassword}
              <input
                type="password"
                minLength={10}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                required
              />
            </label>
            <label>
              {c.role}
              <select
                value={form.roleCode}
                onChange={(e) => setForm({ ...form, roleCode: e.target.value })}
              >
                {roles.map((role) => (
                  <option value={role.code} key={role.code}>
                    {role.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {c.object}
              <select
                value={form.objectId}
                onChange={(e) => setForm({ ...form, objectId: e.target.value })}
              >
                <option value="">{c.wholeCompany}</option>
                {objects.map((object) => (
                  <option value={object.id} key={object.id}>
                    {object.name}
                  </option>
                ))}
              </select>
            </label>
            <button disabled={busy}>{c.createUser}</button>
          </form>
        )}
      </div>
    </>
  );
}
