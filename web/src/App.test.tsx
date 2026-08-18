import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { api, UserSession } from './api';

vi.mock('./api', () => ({
  api: {
    getSession: vi.fn(),
    json: vi.fn(),
    request: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
  },
}));

const object = {
  id: 'object-1',
  name: 'ЖК Тестовый',
  address: 'Ташкент',
  progress: 40,
  taskCount: 1,
  riskLevel: 'on_track',
};

const detail = {
  ...object,
  stages: [{
    id: 'stage-1',
    name: 'Коробка',
    sections: [{
      id: 'section-1',
      name: 'Монолит',
      tasks: [{ id: 'task-1', title: 'Залить плиту', status: 'in_progress', priority: 'high' }],
    }],
  }],
};

const gantt = {
  objectName: object.name,
  criticalPath: { taskIds: ['task-1'], durationDays: 7 },
  forecast: { plannedCompletion: '2026-08-20', forecastCompletion: '2026-08-23', delayDays: 3 },
  stages: [{ id: 'stage-1', name: 'Коробка', sections: [{ id: 'section-1', name: 'Монолит', tasks: [{ ...detail.stages[0].sections[0].tasks[0], plannedStart: '2026-08-13', plannedEnd: '2026-08-20', isCritical: true, riskLevel: 'overdue' }] }] }],
};

const document = {
  id: 'document-1', title: 'Рабочий проект', kind: 'project', version: 1,
  fileUrl: 'https://example.com/project.pdf', status: 'review',
  createdBy: { fullName: 'Тест PM' }, approvals: [],
};

const act = {
  id: 'act-1', number: 'А-1', title: 'Скрытые работы', template: 'hidden',
  amount: 1000, status: 'review', createdBy: { fullName: 'Тест PM' },
};

function session(role: string): UserSession {
  return {
    accessToken: 'access',
    refreshToken: 'refresh',
    expiresIn: 900,
    user: {
      id: `${role}-1`,
      fullName: `Тест ${role}`,
      email: `${role}@example.com`,
      companyName: 'CloudPlus',
      roles: [{ code: role, objectId: role === 'admin' ? null : object.id }],
    },
  };
}

function mockApi() {
  vi.mocked(api.json).mockImplementation(async (path: string) => {
    if (path === '/api/objects') return [object];
    if (path === `/api/objects/${object.id}`) return detail;
    if (path === `/api/objects/${object.id}/gantt`) return gantt;
    if (path === '/api/tasks/task-1') return { ...gantt.stages[0].sections[0].tasks[0], closurePhotos: ['https://example.com/photo.jpg'] };
    if (path.endsWith('/photo-reports')) return [];
    if (path.endsWith('/defects')) return [];
    if (path.endsWith('/defect-assignees')) return [{ id: 'user-foreman', fullName: 'Прораб' }];
    if (path === '/api/planning/users') return [];
    if (path === '/api/admin/users') return [];
    if (path === '/api/admin/roles') return [];
    if (path.endsWith('/documents')) return [document];
    if (path.endsWith('/acts')) return [act];
    return {};
  });
}

async function renderRole(role: string) {
  vi.mocked(api.getSession).mockReturnValue(session(role));
  render(<App />);
  await screen.findByText('ЖК Тестовый');
}

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  vi.stubGlobal('crypto', { randomUUID: () => 'upload-idempotency-key' });
  mockApi();
  vi.mocked(api.request).mockImplementation(async () => new Response(JSON.stringify({ url: 'https://api.test/api/uploads/pdf-1' }), { status: 201, headers: { 'content-type': 'application/json' } }));
});

afterEach(cleanup);

describe('role-based web workspace', () => {
  it.each([
    ['admin', true, true],
    ['pm', false, true],
    ['foreman', false, false],
    ['inspector', false, false],
    ['customer', false, false],
  ])('renders allowed navigation and planning actions for %s', async (role, hasTeam, canPlan) => {
    await renderRole(role);

    expect(screen.getByRole('button', { name: 'Документы и акты' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Пользователи и роли' })).toBe(hasTeam ? screen.getByRole('button', { name: 'Пользователи и роли' }) : null);

    await userEvent.click(screen.getByRole('button', { name: /ЖК Тестовый/ }));
    await screen.findByText('Залить плиту');
    expect(screen.queryByRole('heading', { name: 'Новая задача' })).toBe(canPlan ? screen.getByRole('heading', { name: 'Новая задача' }) : null);
  });

  it('lets a PM create a task from the selected object', async () => {
    await renderRole('pm');
    await userEvent.click(screen.getByRole('button', { name: /ЖК Тестовый/ }));
    await userEvent.type(await screen.findByLabelText('Название'), 'Проверить армирование');
    await userEvent.click(screen.getByRole('button', { name: 'Создать задачу' }));

    await waitFor(() => expect(api.json).toHaveBeenCalledWith(
      '/api/objects/sections/section-1/tasks',
      expect.objectContaining({ method: 'POST' }),
    ));
    const call = vi.mocked(api.json).mock.calls.find(([path]) => path.includes('/tasks'));
    expect(JSON.parse(String(call?.[1]?.body))).toMatchObject({
      title: 'Проверить армирование',
      priority: 'normal',
      dependsOn: [],
    });
  });

  it.each([
    ['admin', true, false, false],
    ['pm', true, false, false],
    ['foreman', false, false, false],
    ['inspector', false, true, true],
    ['customer', false, true, true],
  ])('enforces document and act actions for %s', async (role, canManage, canDecide, canSign) => {
    await renderRole(role);
    await userEvent.click(screen.getByRole('button', { name: 'Документы и акты' }));
    await screen.findByRole('heading', { name: 'Документы и акты' });

    expect(screen.queryByRole('heading', { name: 'Добавить документ' })).toBe(canManage ? screen.getByRole('heading', { name: 'Добавить документ' }) : null);
    expect(screen.queryByRole('heading', { name: 'Создать акт' })).toBe(canManage ? screen.getByRole('heading', { name: 'Создать акт' }) : null);
    expect(screen.queryByRole('button', { name: 'Согласовать' })).toBe(canDecide ? screen.getByRole('button', { name: 'Согласовать' }) : null);
    expect(screen.queryByRole('button', { name: 'Подписать акт' })).toBe(canSign ? screen.getByRole('button', { name: 'Подписать акт' }) : null);
  });

  it('scopes document actions to the selected object', async () => {
    const scopedSession = session('foreman');
    scopedSession.user.roles.push({ code: 'inspector', objectId: 'object-2' });
    vi.mocked(api.getSession).mockReturnValue(scopedSession);
    render(<App />);
    await screen.findByText('ЖК Тестовый');
    await userEvent.click(screen.getByRole('button', { name: 'Документы и акты' }));
    await screen.findByRole('heading', { name: 'Документы и акты' });

    expect(screen.queryByRole('button', { name: 'Согласовать' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Подписать акт' })).not.toBeInTheDocument();
  });

  it('uploads PDF files before creating documents and acts', async () => {
    await renderRole('pm');
    await userEvent.click(screen.getByRole('button', { name: 'Документы и акты' }));
    await screen.findByRole('heading', { name: 'Документы и акты' });
    const pdf = new File(['%PDF-1.4\n%%EOF'], 'work.pdf', { type: 'application/pdf' });

    await userEvent.type(screen.getAllByLabelText('Название')[0], 'Новый проект');
    fireEvent.change(screen.getAllByLabelText('PDF-файл')[0], { target: { files: [pdf] } });
    fireEvent.submit(screen.getByRole('heading', { name: 'Добавить документ' }).closest('form')!);
    await waitFor(() => expect(api.request).toHaveBeenCalledWith('/api/uploads', expect.objectContaining({ method: 'POST', body: pdf })));
    await waitFor(() => expect(api.json).toHaveBeenCalledWith(`/api/objects/${object.id}/documents`, expect.objectContaining({
      body: expect.stringContaining('https://api.test/api/uploads/pdf-1'),
    })));

    await userEvent.type(screen.getByLabelText('Номер'), 'А-2');
    await userEvent.type(screen.getAllByLabelText('Название')[1], 'Акт работ');
    fireEvent.change(screen.getAllByLabelText('PDF-файл')[1], { target: { files: [pdf] } });
    fireEvent.submit(screen.getByRole('heading', { name: 'Создать акт' }).closest('form')!);
    await waitFor(() => expect(api.json).toHaveBeenCalledWith(`/api/objects/${object.id}/acts`, expect.objectContaining({
      body: expect.stringContaining('https://api.test/api/uploads/pdf-1'),
    })));
  });

  it('shows the calculated completion forecast and critical path', async () => {
    await renderRole('pm');
    await userEvent.click(screen.getByRole('button', { name: 'График Ганта' }));
    expect(await screen.findByText('Сдвиг +3 дн.')).toBeInTheDocument();
    expect(screen.getByText('Критический путь: 7 дн.')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'График Ганта' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Зафиксировать baseline' })).toBeInTheDocument();
  });

  it.each([
    ['foreman', true, false],
    ['inspector', false, true],
    ['customer', false, false],
  ])('enforces task acceptance actions for %s', async (role, canClose, canReview) => {
    await renderRole(role);
    await userEvent.click(screen.getByRole('button', { name: 'Приемка задач' }));
    await userEvent.click(await screen.findByRole('button', { name: /Залить плиту/ }));
    expect(await screen.findByRole('heading', { name: 'Залить плиту' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Закрыть задачу' })).toBe(canClose ? screen.getByRole('button', { name: 'Закрыть задачу' }) : null);
    expect(screen.queryByRole('button', { name: 'Принять' })).toBe(canReview ? null : null);
  });

  it('shows photo and defect creation to a foreman', async () => {
    await renderRole('foreman');
    await userEvent.click(screen.getByRole('button', { name: 'Фотоконтроль' }));
    expect(await screen.findByRole('heading', { name: 'Фотоконтроль и замечания' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Новый фотоотчет' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Новое замечание' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Скрытые работы - на приемку' })).not.toBeInTheDocument();
  });

  it('allows an inspector to submit hidden works for review', async () => {
    await renderRole('inspector');
    await userEvent.click(screen.getByRole('button', { name: 'Фотоконтроль' }));
    expect(await screen.findByRole('option', { name: 'Скрытые работы - на приемку' })).toBeInTheDocument();
  });
});
