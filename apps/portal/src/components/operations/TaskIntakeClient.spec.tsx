// apps/portal/src/components/operations/TaskIntakeClient.spec.tsx
// Caso de montaje del intake re-apuntado desde OperationsClient.spec.tsx
// (D-A2, split F2) más la acreditación del redirect post-alta (D-A3): el alta
// exitosa lleva a /tasks?taskId=<nuevo> con el detalle abierto — spec de
// diseño §4.4 mecanismo 3 y UX spec §5.3 (el detalle es la confirmación; no
// existe alerta de éxito huérfana).
import type { ChangeEvent } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TaskExecutionMode, TaskOriginContext } from '@iwana/shared';
import { TaskIntakeClient } from './TaskIntakeClient';
import { tasksApi } from '@/lib/api-client';

const mockPush = jest.fn();
const mockReplace = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
  }),
  useSearchParams: () => new URLSearchParams(window.location.search),
}));

jest.mock('@/components/auth/AuthProvider', () => ({
  useAuth: () => ({ user: { id: 'user-123' } }),
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
    create: jest.fn(),
  },
  usersApi: {
    // Typeahead de personas (F5): el crawl del directorio ya no existe; el
    // picker de responsable consulta `GET /users/search` al escribir.
    searchForPicker: jest.fn().mockResolvedValue({
      data: [{ id: 'user-123', label: 'Laura Ruiz', sublabel: 'laura@demo.co' }],
      total: 1,
    }),
  },
}));

jest.mock('@iwana/ui', () => {
  const actual = jest.requireActual('@iwana/ui');

  return {
    ...actual,
    Select: ({
      id,
      label,
      value,
      onChange,
      options = [],
      placeholder,
    }: {
      id?: string;
      label?: string;
      value?: string;
      onChange?: (event: ChangeEvent<HTMLSelectElement>) => void;
      options?: Array<{ value: string; label: string }>;
      placeholder?: string;
    }) => (
      <div>
        {label && <label htmlFor={id}>{label}</label>}
        <select id={id} aria-label={label} value={value} onChange={onChange}>
          <option value="">{placeholder ?? 'Selecciona'}</option>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
    ),
  };
});

const CREATED_TASK = {
  id: 'task-new-001',
  taskNumber: 'TSK-20260913-001',
  type: 'INTERNAL_OPERATION',
  status: 'OPEN',
  priority: 'NORMAL',
  title: 'Validar equipo retirado',
  responsibleRefId: 'user-123',
  recipientType: 'INTERNAL_AREA',
  recipientRefId: 'operations-area',
  recipientLabel: 'Operaciones',
  executionMode: TaskExecutionMode.IMMEDIATE,
  scheduledRequired: false,
  originContext: TaskOriginContext.MANUAL,
  ticketId: null,
  createdAt: '2026-09-13T14:00:00.000Z',
  updatedAt: '2026-09-13T14:00:00.000Z',
} as never;

describe('TaskIntakeClient', () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockReplace.mockClear();
    // URL de llegada limpia: los casos de M3.1 la sobreescriben con su
    // `returnTo` (el mock de `useSearchParams` lee `window.location.search`).
    window.history.pushState({}, '', '/dashboard/operations/tasks/new');
    jest.mocked(tasksApi.create).mockResolvedValue(CREATED_TASK);
  });

  it('muestra el panel de alta con su acción principal "Crear tarea"', async () => {
    render(<TaskIntakeClient />);

    // Aserciones heredadas del caso de shell del monolito (:604-605).
    expect(screen.getByRole('heading', { name: 'Crear tarea' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Crear tarea' })).toBeInTheDocument();
  });

  it('D-A3: el alta exitosa redirige a /tasks?taskId=<nuevo> sin alerta de éxito', async () => {
    const user = userEvent.setup();

    render(<TaskIntakeClient />);

    await user.type(screen.getByLabelText('Titulo'), 'Validar equipo retirado');
    // Picker de responsable (typeahead F5, spec §4.8): escribir y elegir una
    // persona; sin directorio precargado.
    await user.type(screen.getByLabelText('Responsable'), 'Lau');
    await user.click(await screen.findByRole('option', { name: /Laura Ruiz/ }));
    await user.selectOptions(screen.getByLabelText('Destinatario'), 'operations-area');
    await user.click(screen.getByRole('button', { name: 'Crear tarea' }));

    await waitFor(() => {
      expect(tasksApi.create).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/dashboard/operations/tasks?taskId=task-new-001');
    });

    // UX spec §5.3: el detalle abierto en la bandeja es la confirmación; la
    // alerta de éxito del monolito no existe aquí.
    expect(screen.queryByText('Tarea TSK-20260913-001 creada')).not.toBeInTheDocument();
  });

  it('M3.1: el alta exitosa restaura el estado de origen con el detalle abierto', async () => {
    const user = userEvent.setup();
    const returnTo = '/dashboard/operations/tasks?status=OPEN&page=3';
    window.history.pushState(
      {},
      '',
      `/dashboard/operations/tasks/new?returnTo=${encodeURIComponent(returnTo)}`,
    );

    render(<TaskIntakeClient />);

    await user.type(screen.getByLabelText('Titulo'), 'Validar equipo retirado');
    await user.type(screen.getByLabelText('Responsable'), 'Lau');
    await user.click(await screen.findByRole('option', { name: /Laura Ruiz/ }));
    await user.selectOptions(screen.getByLabelText('Destinatario'), 'operations-area');
    await user.click(screen.getByRole('button', { name: 'Crear tarea' }));

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith(
        '/dashboard/operations/tasks?status=OPEN&page=3&taskId=task-new-001',
      );
    });
  });

  it('M3.1: cancelar vuelve al estado de origen sin parámetro de detalle', async () => {
    const user = userEvent.setup();
    const returnTo = '/dashboard/operations/tasks?status=OPEN&page=3&taskId=task-previa';
    window.history.pushState(
      {},
      '',
      `/dashboard/operations/tasks/new?returnTo=${encodeURIComponent(returnTo)}`,
    );

    render(<TaskIntakeClient />);
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(mockReplace).toHaveBeenCalledWith('/dashboard/operations/tasks?status=OPEN&page=3');
  });

  it('cancelar sin returnTo vuelve a la bandeja por defecto', async () => {
    const user = userEvent.setup();

    render(<TaskIntakeClient />);
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(mockReplace).toHaveBeenCalledWith('/dashboard/operations/tasks');
  });

  it('descarta un returnTo que no apunte a la bandeja de tareas', async () => {
    const user = userEvent.setup();
    window.history.pushState(
      {},
      '',
      `/dashboard/operations/tasks/new?returnTo=${encodeURIComponent('https://example.test/phishing')}`,
    );

    render(<TaskIntakeClient />);

    await user.type(screen.getByLabelText('Titulo'), 'Validar equipo retirado');
    await user.type(screen.getByLabelText('Responsable'), 'Lau');
    await user.click(await screen.findByRole('option', { name: /Laura Ruiz/ }));
    await user.selectOptions(screen.getByLabelText('Destinatario'), 'operations-area');
    await user.click(screen.getByRole('button', { name: 'Crear tarea' }));

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/dashboard/operations/tasks?taskId=task-new-001');
    });
  });
});
