-- StroyControl — базовая схема БД (Этап 0 / Этап 1)
-- Иерархия: Company -> Object -> Stage -> WorkSection -> Task -> Subtask
-- Мультитенантность: изоляция по company_id на каждой таблице домена.

CREATE TABLE companies (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Роли: руководитель компании, ПМ, прораб, технадзор, снабженец, сметчик/финансист,
-- заказчик, субподрядчик, администратор (раздел 3 ТЗ).
CREATE TABLE roles (
    id              SMALLSERIAL PRIMARY KEY,
    code            TEXT UNIQUE NOT NULL, -- owner, pm, foreman, inspector, supplier, finance, customer, subcontractor, admin
    name            TEXT NOT NULL
);

CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id      UUID NOT NULL REFERENCES companies(id),
    email           TEXT UNIQUE NOT NULL,
    phone           TEXT,
    full_name       TEXT NOT NULL,
    password_hash   TEXT NOT NULL,
    two_factor_enabled BOOLEAN NOT NULL DEFAULT false,
    locale          TEXT NOT NULL DEFAULT 'ru', -- ru | uz
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE objects (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id      UUID NOT NULL REFERENCES companies(id),
    name            TEXT NOT NULL,
    address         TEXT,
    template_code   TEXT, -- типовой дом | многоэтажка | ремонт
    status          TEXT NOT NULL DEFAULT 'active',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Матрица прав: роль x объект x модуль x действие (см. docs/RBAC.md)
CREATE TABLE user_roles (
    user_id         UUID NOT NULL REFERENCES users(id),
    role_id         SMALLINT NOT NULL REFERENCES roles(id),
    object_id       UUID NULL REFERENCES objects(id), -- NULL = роль на уровне всей компании
    PRIMARY KEY (user_id, role_id, object_id)
);

CREATE TABLE stages (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    object_id       UUID NOT NULL REFERENCES objects(id),
    name            TEXT NOT NULL,
    sort_order      INT NOT NULL DEFAULT 0
);

CREATE TABLE work_sections (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    stage_id        UUID NOT NULL REFERENCES stages(id),
    name            TEXT NOT NULL,
    sort_order      INT NOT NULL DEFAULT 0
);

CREATE TABLE tasks (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    work_section_id UUID NOT NULL REFERENCES work_sections(id),
    parent_task_id  UUID NULL REFERENCES tasks(id), -- для подзадач
    title           TEXT NOT NULL,
    description     TEXT,
    assignee_id     UUID REFERENCES users(id),
    status          TEXT NOT NULL DEFAULT 'open', -- open | in_progress | done | overdue
    priority        TEXT NOT NULL DEFAULT 'normal',
    planned_start   DATE,
    planned_end     DATE,
    baseline_start  DATE,
    baseline_end    DATE,
    actual_start    DATE,
    actual_end      DATE,
    depends_on      UUID[] DEFAULT '{}', -- зависимости для диаграммы Ганта / критического пути
    is_recurring    BOOLEAN NOT NULL DEFAULT false,
    sla_hours       INT, -- для автоэскалации просрочки
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE task_checklist_items (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id         UUID NOT NULL REFERENCES tasks(id),
    label           TEXT NOT NULL,
    is_done         BOOLEAN NOT NULL DEFAULT false
);

-- Фотоконтроль и технадзор
CREATE TABLE photo_reports (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id         UUID REFERENCES tasks(id),
    object_id       UUID NOT NULL REFERENCES objects(id),
    author_id       UUID NOT NULL REFERENCES users(id),
    shooting_point  TEXT, -- идентификатор точки съёмки для таймлайна прогресса
    kind            TEXT NOT NULL DEFAULT 'progress', -- progress | before | after | hidden_works
    file_url        TEXT NOT NULL,
    geo_lat         DOUBLE PRECISION,
    geo_lng         DOUBLE PRECISION,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE defects (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    object_id       UUID NOT NULL REFERENCES objects(id),
    task_id         UUID REFERENCES tasks(id),
    reported_by     UUID NOT NULL REFERENCES users(id),
    status          TEXT NOT NULL DEFAULT 'open', -- open | in_progress | verified | closed
    description     TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Лента и коммуникации
CREATE TABLE feed_events (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    object_id       UUID NOT NULL REFERENCES objects(id),
    author_id       UUID REFERENCES users(id),
    kind            TEXT NOT NULL, -- message | status_change | acceptance | file
    body            TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Документооборот
CREATE TABLE project_documents (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id      UUID NOT NULL REFERENCES companies(id),
    object_id       UUID NOT NULL REFERENCES objects(id),
    created_by_id   UUID NOT NULL REFERENCES users(id),
    title           TEXT NOT NULL,
    kind            TEXT NOT NULL, -- project | estimate | contract | act | other
    version         INT NOT NULL DEFAULT 1,
    file_url        TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'draft',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE document_approvals (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id     UUID NOT NULL REFERENCES project_documents(id) ON DELETE CASCADE,
    actor_id        UUID NOT NULL REFERENCES users(id),
    decision        TEXT NOT NULL, -- approved | rejected
    note            TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (document_id, actor_id)
);

CREATE TABLE work_acts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id      UUID NOT NULL REFERENCES companies(id),
    object_id       UUID NOT NULL REFERENCES objects(id),
    created_by_id   UUID NOT NULL REFERENCES users(id),
    signed_by_id    UUID REFERENCES users(id),
    template        TEXT NOT NULL, -- completed | hidden | acceptance
    number          TEXT NOT NULL,
    title           TEXT NOT NULL,
    amount          NUMERIC(14,2) NOT NULL,
    status          TEXT NOT NULL DEFAULT 'draft',
    pdf_url         TEXT,
    signed_at       TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (company_id, number)
);

-- Аудит-лог (юридическая значимость, раздел 15 ТЗ)
CREATE TABLE audit_log (
    id              BIGSERIAL PRIMARY KEY,
    company_id      UUID NOT NULL REFERENCES companies(id),
    user_id         UUID REFERENCES users(id),
    action          TEXT NOT NULL,
    entity_type     TEXT NOT NULL,
    entity_id       UUID,
    payload         JSONB,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_objects_company ON objects(company_id);
CREATE INDEX idx_tasks_work_section ON tasks(work_section_id);
CREATE INDEX idx_tasks_assignee ON tasks(assignee_id);
CREATE INDEX idx_photo_reports_object ON photo_reports(object_id);
CREATE INDEX idx_feed_events_object ON feed_events(object_id, created_at DESC);
CREATE INDEX idx_audit_log_company ON audit_log(company_id, created_at DESC);
