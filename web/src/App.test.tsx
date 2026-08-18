import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { api, UserSession } from './api';

vi.mock('./api', () => ({
  api: {
    getSession: vi.fn(),
    json: vi.fn(),
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
  mockApi();
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
    ['admin', true, true, false],
    ['pm', true, true, false],
    ['foreman', true, false, false],
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
});
