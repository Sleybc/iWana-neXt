import type { ReactNode } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { TaskExecutionMode, TaskStatus } from '@iwana/shared';
import { OperationsClient } from './OperationsClient';

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children }: { href: string; children: ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
  }),
}));

jest.mock('@/lib/api-client', () => ({
  ApiError: class ApiError extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.status = status;
    }
  },
  crmApi: {
    listExpedientes: jest.fn().mockResolvedValue({ data: [], total: 0 }),
  },
  subscribersApi: {
    list: jest.fn().mockResolvedValue({ data: [], total: 0 }),
  },
  tasksApi: {
    list: jest.fn().mockResolvedValue({
      data: [
        {
          id: 'task-001',
          taskNumber: 'TSK-20260622-001',
          type: 'INTERNAL_OPERATION',
          status: TaskStatus.OPEN,
          priority: 'NORMAL',
          title: 'Validar equipo retirado',
          responsibleRefId: 'user-123',
          recipientType: 'INTERNAL_AREA',
          recipientRefId: 'operations-area',
          recipientLabel: 'Operaciones',
          executionMode: TaskExecutionMode.IMMEDIATE,
          scheduledRequired: false,
          createdAt: '2026-06-22T14:00:00.000Z',
        },
      ],
      total: 1,
      page: 1,
      limit: 1,
    }),
    create: jest.fn(),
    timeline: jest.fn().mockResolvedValue([]),
    assignmentHistory: jest.fn().mockResolvedValue([]),
    transition: jest.fn(),
  },
  usersApi: {
    list: jest.fn().mockResolvedValue({
      data: [
        {
          id: 'user-123',
          email: 'soporte@demo.co',
          firstName: 'Laura',
          lastName: 'Ruiz',
        },
      ],
      meta: { nextCursor: null },
    }),
  },
}));

describe('OperationsClient', () => {
  it('renders operations shell with task list', async () => {
    render(<OperationsClient />);

    expect(screen.getByRole('heading', { name: 'Operaciones' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Abrir Programacion' })).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Validar equipo retirado')).toBeInTheDocument();
    });

    expect(screen.getByRole('heading', { name: 'Crear tarea' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Crear tarea' })).toBeInTheDocument();
  });
});
