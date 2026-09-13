// apps/portal/src/components/operations/TasksInboxClient.spec.tsx
// Casos de montaje de la bandeja de tareas re-apuntados desde
// OperationsClient.spec.tsx (D-A2, split F2). Integración F5: el pie se rige
// por `meta.capabilities.randomAccess` (ADR-065 — un solo pie; el caso
// «Cargar más» ADR-064 deja de ser válido porque el listado declara
// randomAccess: true), el estado de página vive en la URL (página → push,
// filtro → replace + página 1) y los vacíos E1/E2 llevan acción (UX spec §6.1).
// QA-49 se conserva íntegro. Se mantienen los dos casos de acreditación del
// deep link `?taskId=` (spec 2026-09-13 §4.6).
import type { ReactNode } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AccessPermissionKey, TaskExecutionMode, TaskStatus } from '@iwana/shared';
import { emptyPageListMeta } from '@/lib/list-meta';
import { TasksInboxClient } from './TasksInboxClient';
import { ApiError, tasksApi } from '@/lib/api-client';

const mockPush = jest.fn();
const mockReplace = jest.fn();
// Patrón AssuranceClient.spec: instancia estable de params que el router
// mockeado reescribe, de modo que el componente URL-driven re-renderiza con
// la query nueva (ADR-065 §9).
let searchParamsMock = new URLSearchParams();

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children }: { href: string; children: ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
  }),
  useSearchParams: () => searchParamsMock,
}));

jest.mock('@/components/auth/AuthProvider', () => ({
  useAuth: () => ({ user: { id: 'user-123', role: 'ADMIN' } }),
}));

// Permisos mutables: por defecto sin permiso de creación (conducta previa del
// spec); el caso M3.1 lo concede para observar el CTA del vacío.
const mockUsePermissions = jest.fn();
jest.mock('@/components/access-control/permissions-context', () => ({
  usePermissions: () => mockUsePermissions(),
}));

jest.mock('@/lib/api-client', () => ({
  ApiError: class ApiError extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.status = status;
    }
  },
  tasksApi: {
    list: jest.fn().mockResolvedValue({ data: [], total: 0, page: 1, limit: 20 }),
    get: jest.fn(),
    create: jest.fn(),
    timeline: jest.fn().mockResolvedValue([]),
    assignmentHistory: jest.fn().mockResolvedValue([]),
    transition: jest.fn(),
    executionOrders: {
      get: jest.fn(),
      listActivities: jest.fn().mockResolvedValue([]),
      listItemUsage: jest.fn().mockResolvedValue([]),
      listEvidence: jest.fn().mockResolvedValue({ data: [] }),
      listTemplateVersions: jest.fn(),
    },
  },
}));

const TASKS_PATH = '/dashboard/operations/tasks';

function buildTask(index: number) {
  return {
    id: `task-${index}`,
    taskNumber: `TSK-${String(index).padStart(3, '0')}`,
    type: 'INTERNAL_OPERATION',
    status: TaskStatus.OPEN,
    priority: 'NORMAL',
    title: `Tarea operativa ${index}`,
    responsibleRefId: 'user-123',
    responsibleLabel: 'Laura Ruiz',
    recipientType: 'INTERNAL_AREA',
    recipientRefId: 'operations-area',
    recipientLabel: 'Operaciones',
    executionMode: TaskExecutionMode.IMMEDIATE,
    scheduledRequired: false,
    createdAt: '2026-07-24T14:00:00.000Z',
  };
}

function buildPageMeta(overrides: { total: number; page?: number; totalPages?: number }) {
  return emptyPageListMeta({
    total: overrides.total,
    page: overrides.page ?? 1,
    totalPages: overrides.totalPages ?? 1,
    hasMore: false,
  });
}

describe('TasksInboxClient', () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockReplace.mockClear();
    mockUsePermissions.mockReturnValue({
      status: 'ready',
      hasPermission: () => false,
      hasAnyPermission: () => false,
    });
    searchParamsMock = new URLSearchParams();
    mockPush.mockImplementation((href: string) => {
      searchParamsMock = new URLSearchParams(String(href).split('?')[1] ?? '');
    });
    mockReplace.mockImplementation((href: string) => {
      searchParamsMock = new URLSearchParams(String(href).split('?')[1] ?? '');
    });
    jest.mocked(tasksApi.list).mockResolvedValue({
      data: [buildTask(1)],
      total: 1,
      page: 1,
      limit: 20,
      meta: buildPageMeta({ total: 1 }),
    } as never);
  });

  it('muestra la bandeja de tareas con su lista y su pie numerado ADR-065', async () => {
    render(<TasksInboxClient />);

    expect(screen.queryByRole('link', { name: 'Abrir Programación' })).not.toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Tarea operativa 1')).toBeInTheDocument();
    });

    // Un solo pie: paginado numerado con la cuenta del pager (ADR-065).
    expect(screen.getByText('1–1 de 1 tarea')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cargar más' })).not.toBeInTheDocument();
    // Sin strip de conteo duplicado (contrato de componente §3.2).
    expect(screen.queryByText('1 tarea')).not.toBeInTheDocument();
  });

  it('ADR-065: navega a la página 2 y la URL conserva page=2', async () => {
    const user = userEvent.setup();
    const page1 = Array.from({ length: 20 }, (_, index) => buildTask(index + 1));
    const page2 = [buildTask(21)];

    jest.mocked(tasksApi.list).mockImplementation(async (params?: { page?: number }) => {
      if (params?.page === 2) {
        return {
          data: page2,
          total: 21,
          page: 2,
          limit: 20,
          meta: buildPageMeta({ total: 21, page: 2, totalPages: 2 }),
        } as never;
      }
      return {
        data: page1,
        total: 21,
        page: 1,
        limit: 20,
        meta: buildPageMeta({ total: 21, totalPages: 2 }),
      } as never;
    });

    const { rerender } = render(<TasksInboxClient />);

    expect(await screen.findByText('Tarea operativa 1')).toBeInTheDocument();
    expect(screen.queryByText('Tarea operativa 21')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Página 2' }));
    // El router real re-renderiza con la URL nueva; el mock exige el mismo
    // impulso (patrón AssuranceClient.spec).
    rerender(<TasksInboxClient />);

    // ADR-065 §9: el cambio de página hace push (el botón Atrás vuelve) y la
    // URL conserva page=2.
    await waitFor(() => {
      expect(tasksApi.list).toHaveBeenCalledWith(expect.objectContaining({ page: 2, limit: 20 }));
    });
    expect(mockPush).toHaveBeenCalledWith(
      expect.stringMatching(/^\/dashboard\/operations\/tasks\?.*page=2/),
      expect.objectContaining({ scroll: false }),
    );
    expect(await screen.findByText('Tarea operativa 21')).toBeInTheDocument();
  });

  it('ADR-065: al cambiar filtro de estado reinicia en página 1 y lo refleja con replace', async () => {
    const user = userEvent.setup();
    jest.mocked(tasksApi.list).mockResolvedValue({
      data: [buildTask(1)],
      total: 1,
      page: 1,
      limit: 20,
      meta: buildPageMeta({ total: 1 }),
    } as never);

    const { rerender } = render(<TasksInboxClient />);
    await screen.findByText('Tarea operativa 1');

    await user.click(screen.getByRole('combobox', { name: 'Estado' }));
    await user.click(await screen.findByRole('option', { name: 'En progreso' }));
    // El router real re-renderiza con la URL nueva; el mock exige el mismo
    // impulso (patrón AssuranceClient.spec).
    rerender(<TasksInboxClient />);

    await waitFor(() => {
      expect(tasksApi.list).toHaveBeenCalledWith(
        expect.objectContaining({ status: TaskStatus.IN_PROGRESS, page: 1, limit: 20 }),
      );
    });
    // Reset de página y reflejo en URL con replace (no push).
    expect(mockReplace).toHaveBeenCalledWith(
      expect.stringMatching(/^\/dashboard\/operations\/tasks\?.*status=IN_PROGRESS/),
      expect.objectContaining({ scroll: false }),
    );
    expect(mockReplace).toHaveBeenCalledWith(
      expect.not.stringContaining('page='),
      expect.anything(),
    );
  });

  it('muestra el vacío E1 con acción cuando el alcance no tiene tareas (UX spec §6.1)', async () => {
    jest.mocked(tasksApi.list).mockResolvedValue({
      data: [],
      total: 0,
      page: 1,
      limit: 20,
      meta: buildPageMeta({ total: 0 }),
    } as never);

    render(<TasksInboxClient />);

    expect(await screen.findByText('Aún no hay tareas aquí')).toBeInTheDocument();
    // Sin permiso de creación en el contexto de prueba: acción «Actualizar»
    // (la toolbar aporta un botón homónimo: se exige al menos el del vacío).
    expect(screen.getAllByRole('button', { name: 'Actualizar' }).length).toBeGreaterThanOrEqual(1);
  });

  it('DS P1-1: un fallo de refresco conserva las filas y no co-renderiza el vacío', async () => {
    const user = userEvent.setup();
    render(<TasksInboxClient />);
    expect(await screen.findByText('Tarea operativa 1')).toBeInTheDocument();

    jest.mocked(tasksApi.list).mockRejectedValueOnce(new Error('Fallo transitorio de red'));
    await user.click(screen.getByRole('button', { name: 'Actualizar' }));

    expect(await screen.findByText('No pudimos cargar la información')).toBeInTheDocument();
    // El último dato válido se conserva en pantalla (§6.7 del contrato v1.1).
    expect(screen.getByText('Tarea operativa 1')).toBeInTheDocument();
    expect(screen.queryByText('Aún no hay tareas aquí')).not.toBeInTheDocument();
  });

  it('DS P1-1: sin filas previas el error sustituye la composición vacía y «Reintentar» recupera', async () => {
    const user = userEvent.setup();
    jest.mocked(tasksApi.list).mockRejectedValueOnce(new Error('Fallo transitorio de red'));

    render(<TasksInboxClient />);

    expect(await screen.findByText('No pudimos cargar la información')).toBeInTheDocument();
    expect(screen.queryByText('Aún no hay tareas aquí')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('Tarea operativa 1')).toBeInTheDocument();
    expect(screen.queryByText('No pudimos cargar la información')).not.toBeInTheDocument();
  });

  it('E3: el vacío de ticket nombra la referencia y no promete el número visible', async () => {
    jest.mocked(tasksApi.list).mockResolvedValue({
      data: [],
      total: 0,
      page: 1,
      limit: 20,
      meta: buildPageMeta({ total: 0 }),
    } as never);
    searchParamsMock = new URLSearchParams({ ticketId: 'TCK-0007' });

    render(<TasksInboxClient />);

    expect(await screen.findByText('No hay tareas para ese ticket')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Revisa la referencia del ticket o limpia los filtros para ver todas las tareas.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole('button', { name: 'Limpiar filtros' }).length,
    ).toBeGreaterThanOrEqual(1);
  });

  it('M3.1: el CTA del vacío lleva el estado vigente de la bandeja como returnTo', async () => {
    mockUsePermissions.mockReturnValue({
      status: 'ready',
      hasPermission: (permission: AccessPermissionKey) =>
        permission === AccessPermissionKey.OPERATIONS_TASKS_MANAGE,
      hasAnyPermission: () => false,
    });
    jest.mocked(tasksApi.list).mockResolvedValue({
      data: [],
      total: 0,
      page: 3,
      limit: 20,
      meta: buildPageMeta({ total: 0, page: 3 }),
    } as never);
    searchParamsMock = new URLSearchParams({ page: '3' });

    render(<TasksInboxClient />);

    const action = await screen.findByRole('link', { name: 'Crear tarea' });
    const href = action.getAttribute('href') ?? '';
    expect(href).toContain('/dashboard/operations/tasks/new?returnTo=');
    expect(decodeURIComponent(href.split('returnTo=')[1] ?? '')).toBe(
      '/dashboard/operations/tasks?page=3',
    );
  });

  it('QA-49: no persiste OT en el almacenamiento del navegador al operar la consola', async () => {
    const setItem = jest.spyOn(Storage.prototype, 'setItem');
    const removeItem = jest.spyOn(Storage.prototype, 'removeItem');
    const clear = jest.spyOn(Storage.prototype, 'clear');
    // jsdom no implementa IndexedDB: si el entorno no la expone, no existe
    // superficie de escritura que vigilar.
    const open = typeof indexedDB === 'undefined' ? null : jest.spyOn(indexedDB, 'open');
    const user = userEvent.setup();

    render(<TasksInboxClient />);
    await screen.findByText('Tarea operativa 1');

    // Cambio de filtro: dispara la recarga de la lista sin tocar storage.
    await user.click(screen.getByRole('combobox', { name: 'Estado' }));
    await user.click(await screen.findByRole('option', { name: 'En progreso' }));

    expect(setItem).not.toHaveBeenCalled();
    expect(removeItem).not.toHaveBeenCalled();
    expect(clear).not.toHaveBeenCalled();
    if (open) expect(open).not.toHaveBeenCalled();

    setItem.mockRestore();
    removeItem.mockRestore();
    clear.mockRestore();
    open?.mockRestore();
  });

  describe('deep link ?taskId=', () => {
    it('abre el detalle de la tarea llegada por deep link resolviéndola por id', async () => {
      const linked = { ...buildTask(9), id: 'task-deep-001' };
      jest.mocked(tasksApi.get).mockResolvedValue(linked as never);
      searchParamsMock = new URLSearchParams({ taskId: 'task-deep-001' });

      render(<TasksInboxClient />);

      await waitFor(() => {
        expect(tasksApi.get).toHaveBeenCalledWith('task-deep-001');
      });
      // El drawer controlado por props se abre sobre la bandeja.
      expect(await screen.findByText('Tarea operativa 9')).toBeInTheDocument();
      expect(tasksApi.timeline).toHaveBeenCalledWith('task-deep-001');
      expect(tasksApi.assignmentHistory).toHaveBeenCalledWith('task-deep-001');
    });

    it('muestra la alerta E7 con acción cuando la tarea del enlace no está disponible', async () => {
      jest.mocked(tasksApi.get).mockRejectedValue(new ApiError(404, 'NOT_FOUND', 'No disponible'));
      searchParamsMock = new URLSearchParams({ taskId: 'task-ghost' });

      render(<TasksInboxClient />);

      expect(await screen.findByText('No pudimos abrir esta tarea')).toBeInTheDocument();
      const action = screen.getByRole('link', { name: 'Ver todas las tareas' });
      expect(action).toHaveAttribute('href', TASKS_PATH);
    });

    it('PROD-UX #4: la alerta E7 cede cuando «Ver todas las tareas» retira el parámetro', async () => {
      jest.mocked(tasksApi.get).mockRejectedValue(new ApiError(404, 'NOT_FOUND', 'No disponible'));
      searchParamsMock = new URLSearchParams({ taskId: 'task-ghost' });

      const { rerender } = render(<TasksInboxClient />);
      expect(await screen.findByText('No pudimos abrir esta tarea')).toBeInTheDocument();

      // El enlace del mock navega sin parámetros (el router real re-renderiza).
      searchParamsMock = new URLSearchParams();
      rerender(<TasksInboxClient />);

      await waitFor(() => {
        expect(screen.queryByText('No pudimos abrir esta tarea')).not.toBeInTheDocument();
      });
    });

    it('PROD-UX #1: el detalle ofrece un control «Cerrar» visible de 44 px que cierra el drawer', async () => {
      const user = userEvent.setup();
      const linked = { ...buildTask(9), id: 'task-deep-001' };
      jest.mocked(tasksApi.get).mockResolvedValue(linked as never);
      searchParamsMock = new URLSearchParams({ taskId: 'task-deep-001' });

      render(<TasksInboxClient />);
      await screen.findByRole('heading', { name: 'Tarea operativa 9' });

      const close = screen.getByRole('button', { name: 'Cerrar' });
      expect(close).toHaveClass('min-h-11', 'min-w-11');

      await user.click(close);

      // El cierre retira solo `taskId` (merge no destructivo, CA-06).
      expect(mockReplace).toHaveBeenCalledWith('/dashboard/operations/tasks');
      await waitFor(() => {
        expect(
          screen.queryByRole('heading', { name: 'Tarea operativa 9' }),
        ).not.toBeInTheDocument();
      });
    });

    it('PROD-UX #7: al cerrar por deep link el foco aterriza en el encabezado de resultados', async () => {
      const user = userEvent.setup();
      const linked = { ...buildTask(9), id: 'task-deep-001' };
      jest.mocked(tasksApi.get).mockResolvedValue(linked as never);
      searchParamsMock = new URLSearchParams({ taskId: 'task-deep-001' });

      render(<TasksInboxClient />);
      await screen.findByRole('heading', { name: 'Tarea operativa 9' });

      await user.click(screen.getByRole('button', { name: 'Cerrar' }));

      await waitFor(() => {
        expect(document.getElementById('tasks-results')).toHaveFocus();
      });
    });

    it('PROD-UX #7: la apertura por fila conserva el retorno del foco al disparador', async () => {
      const user = userEvent.setup();
      render(<TasksInboxClient />);

      const rowButton = await screen.findByRole('button', { name: 'Tarea operativa 1' });
      await user.click(rowButton);
      await screen.findByRole('heading', { name: 'Tarea operativa 1' });

      await user.click(screen.getByRole('button', { name: 'Cerrar' }));

      await waitFor(() => {
        expect(rowButton).toHaveFocus();
      });
    });
  });
});
