import type { ReactNode } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TaskExecutionMode, TaskStatus } from '@iwana/shared';
import { OperationsClient } from './OperationsClient';
import { ApiError, tasksApi } from '@/lib/api-client';
import { getMissingRequirements } from './OperationsClient';

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
  useSearchParams: () => new URLSearchParams(),
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
      limit: 20,
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

function buildTask(index: number) {
  return {
    id: `task-${index}`,
    taskNumber: `TSK-${String(index).padStart(3, '0')}`,
    type: 'INTERNAL_OPERATION',
    status: TaskStatus.OPEN,
    priority: 'NORMAL',
    title: `Tarea operativa ${index}`,
    responsibleRefId: 'user-123',
    recipientType: 'INTERNAL_AREA',
    recipientRefId: 'operations-area',
    recipientLabel: 'Operaciones',
    executionMode: TaskExecutionMode.IMMEDIATE,
    scheduledRequired: false,
    createdAt: '2026-07-24T14:00:00.000Z',
  };
}

describe('OperationsClient', () => {
  beforeEach(() => {
    jest.mocked(tasksApi.list).mockResolvedValue({
      data: [buildTask(1)],
      total: 1,
      page: 1,
      limit: 20,
    } as never);
  });

  it('usa una etiqueta genérica y no expone la clave cruda de un requisito', () => {
    const error = new ApiError(422, 'CLOSURE_GAP', 'Faltan requisitos');
    Object.assign(error, { missingRequirements: ['req-photo-install'] });
    const missing = getMissingRequirements(error);

    expect(missing).toEqual([
      {
        requirementId: 'req-photo-install',
        label: 'Requisito pendiente',
        kind: 'OTHER',
        reason: 'Completa el requisito pendiente antes de cerrar la orden.',
      },
    ]);
    expect(missing[0]?.label).not.toContain('req-photo-install');
  });

  it('renders operations shell with task list', async () => {
    render(<OperationsClient />);

    expect(screen.getByRole('heading', { name: 'Operaciones' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Abrir Programacion' })).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Tarea operativa 1')).toBeInTheDocument();
    });

    expect(screen.getByRole('heading', { name: 'Crear tarea' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Crear tarea' })).toBeInTheDocument();
    expect(screen.getByText('1 tarea')).toBeInTheDocument();
    expect(screen.queryByText(/Fin de resultados/i)).not.toBeInTheDocument();
  });

  it('ADR-064: con total>20 muestra Cargar más y concatena la página siguiente', async () => {
    const user = userEvent.setup();
    const page1 = Array.from({ length: 20 }, (_, index) => buildTask(index + 1));
    const page2 = [buildTask(21)];

    jest.mocked(tasksApi.list).mockImplementation(async (params?: { page?: number }) => {
      if (params?.page === 2) {
        return { data: page2, total: 21, page: 2, limit: 20 } as never;
      }
      return { data: page1, total: 21, page: 1, limit: 20 } as never;
    });

    render(<OperationsClient />);

    expect(await screen.findByText('20 de 21 tareas')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cargar más' })).toBeInTheDocument();
    expect(screen.getByText('Tarea operativa 1')).toBeInTheDocument();
    expect(screen.queryByText('Tarea operativa 21')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Cargar más' }));

    await waitFor(() => {
      expect(tasksApi.list).toHaveBeenCalledWith(expect.objectContaining({ page: 2, limit: 20 }));
    });

    expect(await screen.findByText('Tarea operativa 21')).toBeInTheDocument();
    expect(screen.getByText('Tarea operativa 1')).toBeInTheDocument();
    expect(screen.getByText('21 tareas')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cargar más' })).not.toBeInTheDocument();
  });

  it('ADR-064: al cambiar filtro de estado reinicia en página 1', async () => {
    const user = userEvent.setup();
    jest.mocked(tasksApi.list).mockResolvedValue({
      data: [buildTask(1)],
      total: 1,
      page: 1,
      limit: 20,
    } as never);

    render(<OperationsClient />);
    await screen.findByText('Tarea operativa 1');

    await user.click(screen.getByRole('combobox', { name: 'Estado' }));
    await user.click(await screen.findByRole('option', { name: 'En progreso' }));

    await waitFor(() => {
      expect(tasksApi.list).toHaveBeenCalledWith(
        expect.objectContaining({ status: TaskStatus.IN_PROGRESS, page: 1, limit: 20 }),
      );
    });
  });
});
