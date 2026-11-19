// apps/portal/src/components/operations/ExecutionOrdersClient.spec.tsx
// Casos de montaje de la consola de OT re-apuntados desde
// OperationsClient.spec.tsx (D-A2, split F2): el componente bajo test es el
// cliente de la sub-ruta execution-orders y los deep links usan la URL
// canónica (spec 2026-09-13 §4.2). Aserciones idénticas al original; el mock
// de `useSearchParams` usa la instancia estable `searchParamsMock` (patrón
// AssuranceClient.spec), que el router mockeado reescribe en cada navegación.
import type { ReactNode } from 'react';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UserRole, WfmWorkType } from '@iwana/shared';
import { ExecutionOrdersClient } from './ExecutionOrdersClient';
import { ApiError, tasksApi } from '@/lib/api-client';

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children }: { href: string; children: ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

const mockPush = jest.fn();
const mockReplace = jest.fn();
// Patrón AssuranceClient.spec: instancia estable de params que el router
// mockeado reescribe, de modo que el cliente URL-driven re-renderiza con la
// query nueva (el deep link `?executionOrderId=` incluido).
let searchParamsMock = new URLSearchParams();

jest.mock('next/navigation', () => ({
  useRouter: (() => {
    let router: Record<string, unknown> | undefined;
    return () =>
      (router ??= {
        push: mockPush,
        replace: mockReplace,
      });
  })(),
  useSearchParams: () => searchParamsMock,
}));

// Sesión mutable: la verificación ADR-065 §15 exige dos usuarios de alcance
// distinto (técnico vs supervisor) sobre el mismo cliente.
let mockCurrentUser: { id: string; role: UserRole } = { id: 'user-123', role: UserRole.ADMIN };

jest.mock('@/components/auth/AuthProvider', () => ({
  // ctx-inestable-intencional: el valor depende de estado mutable que cambia por prueba.
  useAuth: () => ({ user: mockCurrentUser }),
}));

jest.mock('@/lib/api-client', () => ({
  ApiError: class ApiError extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.status = status;
    }
  },
  inventoryApi: {
    listItems: jest.fn().mockResolvedValue({ data: [] }),
    listLocations: jest.fn().mockResolvedValue({ data: [] }),
    getExecutorCustody: jest.fn(),
  },
  organizationApi: {
    // Catálogo de sedes de la toolbar (UX spec §7.2); acotado a una página.
    list: jest.fn().mockResolvedValue({ data: [], meta: {} }),
  },
  tasksApi: {
    get: jest.fn(),
    list: jest.fn().mockResolvedValue({ data: [], total: 0, page: 1, limit: 20 }),
    timeline: jest.fn().mockResolvedValue([]),
    assignmentHistory: jest.fn().mockResolvedValue([]),
    transition: jest.fn(),
    executionOrders: {
      // Bandeja de OT (F5): `GET /tasks/execution-orders` con meta ADR-065.
      list: jest.fn().mockResolvedValue({
        data: [],
        total: 0,
        page: 1,
        limit: 20,
        meta: {
          nextCursor: null,
          total: 0,
          totalIsEstimate: false,
          page: 1,
          limit: 20,
          totalPages: 0,
          hasMore: false,
          mode: 'page',
          capabilities: { randomAccess: true, sortableFields: [] },
          sort: null,
        },
      }),
      get: jest.fn(),
      listActivities: jest.fn().mockResolvedValue([]),
      listItemUsage: jest.fn().mockResolvedValue([]),
      listEvidence: jest.fn().mockResolvedValue({ data: [] }),
      // El detalle debe bastar para operar la OT: el catálogo de versiones de
      // plantilla queda reservado a la gestión (roles ADMIN/NOC/SUPPORT).
      listTemplateVersions: jest.fn(),
    },
    create: jest.fn(),
  },
  usersApi: {
    // El crawl del directorio ya no existe (CA-08); el typeahead queda
    // disponible para el filtro «Asignado a» (solo se invoca al escribir).
    searchForPicker: jest.fn().mockResolvedValue({ data: [], total: 0 }),
  },
}));

const CANONICAL_PATH = '/dashboard/operations/execution-orders';

describe('ExecutionOrdersClient', () => {
  beforeEach(() => {
    mockCurrentUser = { id: 'user-123', role: UserRole.ADMIN };
    mockPush.mockClear();
    mockReplace.mockClear();
    searchParamsMock = new URLSearchParams();
    mockPush.mockImplementation((href: string) => {
      searchParamsMock = new URLSearchParams(String(href).split('?')[1] ?? '');
    });
    mockReplace.mockImplementation((href: string) => {
      searchParamsMock = new URLSearchParams(String(href).split('?')[1] ?? '');
    });
    jest.mocked(tasksApi.list).mockResolvedValue({
      data: [],
      total: 0,
      page: 1,
      limit: 20,
    } as never);
    jest.mocked(tasksApi.executionOrders.list).mockResolvedValue({
      data: [],
      total: 0,
      page: 1,
      limit: 20,
      meta: {
        nextCursor: null,
        total: 0,
        totalIsEstimate: false,
        page: 1,
        limit: 20,
        totalPages: 0,
        hasMore: false,
        mode: 'page',
        capabilities: { randomAccess: true, sortableFields: [] },
        sort: null,
      },
    } as never);
  });

  describe('encabezado y colas (spec 2026-11-19 §3 A y B)', () => {
    it('A: un solo bloque con título y total, sin segundo título ni descripciones', async () => {
      render(<ExecutionOrdersClient />);

      expect(
        screen.getByRole('heading', { name: 'Bandeja de órdenes de ejecución' }),
      ).toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: 'Órdenes de ejecución' })).toBeNull();
      expect(
        screen.queryByText(
          'Las órdenes por programar aparecen primero; luego, la ventana planificada más reciente.',
        ),
      ).toBeNull();
      expect(await screen.findByText('0 en total')).toBeInTheDocument();
    });

    function queueButton(name: string | RegExp) {
      return within(screen.getByRole('group', { name: 'Colas de trabajo' })).getByRole('button', {
        name,
      });
    }

    const COUNTS = { ALL: 12, ACTIVE: 7, TO_SCHEDULE: 2, UNASSIGNED: 3, TODAY: 4, MINE: 1 };

    function mockListWithCounts(queueCounts: unknown) {
      const base = jest.mocked(tasksApi.executionOrders.list).getMockImplementation();
      jest.mocked(tasksApi.executionOrders.list).mockImplementation(async (...args) => {
        const response = (await base?.(...args)) as unknown as Record<string, unknown>;
        return { ...response, queueCounts } as never;
      });
    }

    function lastListParams() {
      return jest.mocked(tasksApi.executionOrders.list).mock.calls.at(-1)?.[0];
    }

    it('I: sin parámetros abre en Activas, pide queue=ACTIVE y no muestra «Mías» a quien administra', async () => {
      mockListWithCounts(COUNTS);
      render(<ExecutionOrdersClient />);

      expect(lastListParams()).toEqual(expect.objectContaining({ queue: 'ACTIVE' }));
      expect(await screen.findByRole('button', { name: /^Activas\s*7$/ })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      expect(queueButton(/^Por programar\s*2$/)).toHaveAttribute('aria-pressed', 'false');
      expect(queueButton(/^Sin asignar\s*3$/)).toHaveAttribute('aria-pressed', 'false');
      expect(queueButton(/^Hoy\s*4$/)).toHaveAttribute('aria-pressed', 'false');
      expect(queueButton(/^Todas\s*12$/)).toHaveAttribute('aria-pressed', 'false');
      expect(
        within(screen.getByRole('group', { name: 'Colas de trabajo' })).queryByRole('button', {
          name: /Mías/,
        }),
      ).toBeNull();
    });

    it('H: sin queueCounts (o malformado) las colas se muestran sin conteo', async () => {
      mockListWithCounts({ ALL: 'muchas' });
      render(<ExecutionOrdersClient />);

      expect(await screen.findByText('0 en total')).toBeInTheDocument();
      expect(queueButton('Activas')).toHaveAttribute('aria-pressed', 'true');
      expect(queueButton('Todas')).toHaveAttribute('aria-pressed', 'false');
    });

    it('CA-10: un enlace con estado terminal no se reinterpreta como Activas', async () => {
      searchParamsMock = new URLSearchParams('status=COMPLETED');
      render(<ExecutionOrdersClient />);

      await waitFor(() =>
        expect(lastListParams()).toEqual(
          expect.objectContaining({ queue: 'ALL', status: 'COMPLETED' }),
        ),
      );
      expect(queueButton('Todas')).toHaveAttribute('aria-pressed', 'true');
      expect(queueButton('Activas')).toHaveAttribute('aria-pressed', 'false');
    });

    it('CA-10: ?executionOrderId= solo abre la consola y lista en «Todas»', async () => {
      jest.mocked(tasksApi.executionOrders.get).mockRejectedValueOnce(new Error('sin detalle'));
      searchParamsMock = new URLSearchParams('executionOrderId=eo-001');
      render(<ExecutionOrdersClient />);

      await waitFor(() =>
        expect(jest.mocked(tasksApi.executionOrders.get).mock.calls[0]?.[0]).toBe('eo-001'),
      );
      expect(lastListParams()).toEqual(expect.objectContaining({ queue: 'ALL' }));
    });

    it('H: la cola se combina con el Estado y reinicia la página (CA-3)', async () => {
      const user = userEvent.setup();
      searchParamsMock = new URLSearchParams('status=ASSIGNED&page=2');
      render(<ExecutionOrdersClient />);

      await user.click(queueButton('Por programar'));

      expect(mockReplace).toHaveBeenLastCalledWith(
        `${CANONICAL_PATH}?status=ASSIGNED&queue=TO_SCHEDULE`,
        { scroll: false },
      );
      cleanup();
      render(<ExecutionOrdersClient />);
      expect(queueButton('Por programar')).toHaveAttribute('aria-pressed', 'true');
      expect(lastListParams()).toEqual(
        expect.objectContaining({ queue: 'TO_SCHEDULE', status: 'ASSIGNED' }),
      );
    });

    it('H: un filtro nuevo desde la entrada por defecto conserva Activas en la URL', async () => {
      const user = userEvent.setup();
      render(<ExecutionOrdersClient />);

      await user.click(queueButton('Hoy'));
      expect(mockReplace).toHaveBeenLastCalledWith(`${CANONICAL_PATH}?queue=TODAY`, {
        scroll: false,
      });
      await user.click(queueButton('Todas'));
      expect(mockReplace).toHaveBeenLastCalledWith(`${CANONICAL_PATH}?queue=ALL`, {
        scroll: false,
      });
    });

    it('H: «Mías» solo para quien ejecuta y la resuelve el servidor', async () => {
      const user = userEvent.setup();
      mockCurrentUser = { id: 'tech-001', role: UserRole.TECHNICIAN };
      render(<ExecutionOrdersClient />);

      await user.click(queueButton('Mías'));

      expect(mockReplace).toHaveBeenLastCalledWith(`${CANONICAL_PATH}?queue=MINE`, {
        scroll: false,
      });
      cleanup();
      render(<ExecutionOrdersClient />);
      expect(queueButton('Mías')).toHaveAttribute('aria-pressed', 'true');
      expect(lastListParams()).toEqual(expect.objectContaining({ queue: 'MINE' }));
      expect(lastListParams()).not.toHaveProperty('assigneeId');
    });

    it('I: una cola vacía con órdenes en otras ofrece «Ver todas»', async () => {
      const user = userEvent.setup();
      mockListWithCounts({ ...COUNTS, ACTIVE: 0 });
      render(<ExecutionOrdersClient />);

      expect(await screen.findByText('No hay órdenes en esta cola')).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Ver todas' }));
      expect(mockReplace).toHaveBeenLastCalledWith(`${CANONICAL_PATH}?queue=ALL`, {
        scroll: false,
      });
    });

    it('R2: «Limpiar filtros» conserva la cola elegida', async () => {
      const user = userEvent.setup();
      searchParamsMock = new URLSearchParams('queue=TODAY&status=ASSIGNED');
      render(<ExecutionOrdersClient />);

      await user.click(await screen.findByRole('button', { name: 'Limpiar filtros' }));

      expect(mockReplace).toHaveBeenLastCalledWith(`${CANONICAL_PATH}?queue=TODAY`, {
        scroll: false,
      });
    });

    it('R3: una cola elegida vacía sin queueCounts no dice que no hay órdenes', async () => {
      const user = userEvent.setup();
      searchParamsMock = new URLSearchParams('queue=TODAY');
      render(<ExecutionOrdersClient />);

      expect(await screen.findByText('No hay órdenes en esta cola')).toBeInTheDocument();
      expect(screen.queryByText('Todavía no hay órdenes de ejecución')).toBeNull();
      await user.click(screen.getByRole('button', { name: 'Ver todas' }));
      expect(mockReplace).toHaveBeenLastCalledWith(`${CANONICAL_PATH}?queue=ALL`, {
        scroll: false,
      });
    });

    it('R3: en «Todas» sin órdenes se mantiene el vacío inicial', async () => {
      searchParamsMock = new URLSearchParams('queue=ALL');
      render(<ExecutionOrdersClient />);

      expect(await screen.findByText('Todavía no hay órdenes de ejecución')).toBeInTheDocument();
    });

    it('R3: ?queue=MINE de quien administra pide MINE al servidor sin chip activo y su vacío ofrece «Ver todas»', async () => {
      // Comportamiento definido: el enlace se respeta (el servidor resuelve
      // «Mías» por la sesión); no hay chip «Mías» para este rol, así que
      // ninguno queda marcado y la salida es «Todas».
      searchParamsMock = new URLSearchParams('queue=MINE');
      render(<ExecutionOrdersClient />);

      expect(await screen.findByText('No hay órdenes en esta cola')).toBeInTheDocument();
      expect(lastListParams()).toEqual(expect.objectContaining({ queue: 'MINE' }));
      const group = screen.getByRole('group', { name: 'Colas de trabajo' });
      expect(within(group).queryByRole('button', { name: /Mías/ })).toBeNull();
      for (const button of within(group).getAllByRole('button')) {
        expect(button).toHaveAttribute('aria-pressed', 'false');
      }
    });

    it('J: la búsqueda por número llega a la URL con espera y solo si es válida', async () => {
      const user = userEvent.setup();
      render(<ExecutionOrdersClient />);
      const field = screen.getByLabelText('Número de orden');

      await user.type(field, 'Pérez');
      expect(
        await screen.findByText('Usa solo letras, números y . _ / - (hasta 40 caracteres).'),
      ).toBeInTheDocument();
      expect(mockReplace).not.toHaveBeenCalledWith(expect.stringContaining('number='), {
        scroll: false,
      });

      await user.clear(field);
      await user.type(field, 'OTE-1');
      await waitFor(() =>
        expect(mockReplace).toHaveBeenLastCalledWith(
          `${CANONICAL_PATH}?queue=ACTIVE&number=OTE-1`,
          { scroll: false },
        ),
      );
      cleanup();
      render(<ExecutionOrdersClient />);
      expect(lastListParams()).toEqual(
        expect.objectContaining({ queue: 'ACTIVE', number: 'OTE-1' }),
      );
    });
  });

  it('mantiene la OT visible cuando el endpoint de evidencias todavía no está disponible', async () => {
    const user = userEvent.setup();
    const order = {
      id: 'eo-001',
      number: 'OT-001',
      status: 'IN_PROGRESS',
      workType: WfmWorkType.INSTALLATION,
      template: {
        id: 'tpl-001',
        key: 'INSTALACION_FIBRA',
        version: 1,
        label: 'Instalación fibra',
      },
      schedule: {
        eventId: 'event-001',
        window: {
          startAt: '2026-07-30T14:00:00.000Z',
          endAt: '2026-07-30T16:00:00.000Z',
        },
      },
      site: { id: 'site-001', label: 'Sitio autorizado' },
      completion: { progress: 0 },
      syncState: 'IN_SYNC',
      inventoryReconciliation: 'NOT_REQUIRED',
      allowedActions: [],
      createdAt: '2026-07-30T12:00:00.000Z',
      updatedAt: '2026-07-30T12:00:00.000Z',
    } as never;

    jest.mocked(tasksApi.executionOrders.get).mockResolvedValue(order);
    jest.mocked(tasksApi.executionOrders.listActivities).mockResolvedValue([]);
    jest.mocked(tasksApi.executionOrders.listItemUsage).mockResolvedValue([]);
    jest
      .mocked(tasksApi.executionOrders.listEvidence)
      .mockRejectedValue(new Error('Endpoint no disponible'));
    searchParamsMock = new URLSearchParams({ executionOrderId: 'eo-001' });

    try {
      render(<ExecutionOrdersClient />);

      expect(await screen.findByText('Evidencias no disponibles')).toBeInTheDocument();
      expect(screen.getAllByText('OT-001').length).toBeGreaterThanOrEqual(1);
      expect(screen.queryByText('Sin evidencias registradas')).not.toBeInTheDocument();
      const refreshButtons = screen.getAllByRole('button', { name: 'Actualizar detalle' });
      expect(refreshButtons.length).toBeGreaterThanOrEqual(1);
      await user.click(refreshButtons[0]!);
      expect(screen.getAllByText('OT-001').length).toBeGreaterThanOrEqual(1);
    } finally {
      searchParamsMock = new URLSearchParams();
    }
  });

  it('deriva la plantilla del snapshot del detalle sin consultar el catálogo de versiones', async () => {
    const order = {
      id: 'eo-snapshot-001',
      number: 'OT-SNAPSHOT-001',
      version: 1,
      status: 'IN_PROGRESS',
      workType: WfmWorkType.INSTALLATION,
      template: {
        id: 'tpl-001',
        key: 'INSTALACION_FIBRA',
        version: 1,
        label: 'Instalación fibra',
        requirements: [
          {
            key: 'CUSTOMER_SIGNATURE',
            label: 'Firma del cliente',
            required: true,
            kind: 'EVIDENCE',
            evidenceType: 'SIGNATURE',
          },
        ],
      },
      schedule: {
        eventId: 'event-001',
        window: {
          startAt: '2026-07-30T14:00:00.000Z',
          endAt: '2026-07-30T16:00:00.000Z',
        },
      },
      site: { id: 'site-001', label: 'Sitio autorizado' },
      completion: { progress: 0 },
      syncState: 'IN_SYNC',
      inventoryReconciliation: 'NOT_REQUIRED',
      allowedActions: ['CLOSE'],
      createdAt: '2026-07-30T12:00:00.000Z',
      updatedAt: '2026-07-30T12:00:00.000Z',
    } as never;

    jest.mocked(tasksApi.executionOrders.get).mockResolvedValue(order);
    jest.mocked(tasksApi.executionOrders.listActivities).mockResolvedValue({
      data: [],
      meta: { page: 1, limit: 25, total: 0 },
    } as never);
    jest.mocked(tasksApi.executionOrders.listItemUsage).mockResolvedValue({
      data: [],
      meta: { page: 1, limit: 25, total: 0 },
    } as never);
    jest.mocked(tasksApi.executionOrders.listEvidence).mockResolvedValue({
      data: [],
      meta: {
        nextCursor: null,
        total: 0,
        totalIsEstimate: false,
        page: 1,
        limit: 100,
        totalPages: 0,
        hasMore: false,
        mode: 'page',
        capabilities: { randomAccess: true, sortableFields: [] },
        sort: null,
      },
    });
    searchParamsMock = new URLSearchParams({ executionOrderId: 'eo-snapshot-001' });

    try {
      render(<ExecutionOrdersClient />);

      expect((await screen.findAllByText('OT-SNAPSHOT-001')).length).toBeGreaterThanOrEqual(1);
      // El checklist se pinta desde el snapshot del detalle…
      expect(
        within(await screen.findByRole('navigation', { name: 'Requisitos de la orden' })).getByText(
          'Firma del cliente',
        ),
      ).toBeInTheDocument();
      // …el cierre queda habilitado…
      expect(screen.getByRole('button', { name: 'Cerrar OT' })).toBeInTheDocument();
      // …y no se consulta el catálogo vivo de versiones de plantilla.
      expect(tasksApi.executionOrders.listTemplateVersions).not.toHaveBeenCalled();
    } finally {
      searchParamsMock = new URLSearchParams();
    }
  });

  it('mantiene la OT y bloquea el cierre cuando el detalle no trae snapshot de plantilla', async () => {
    const order = {
      id: 'eo-template-error',
      number: 'OT-TEMPLATE-ERROR',
      version: 1,
      status: 'IN_PROGRESS',
      workType: WfmWorkType.INSTALLATION,
      template: {
        id: 'tpl-001',
        key: 'INSTALACION_FIBRA',
        version: 1,
        label: 'Instalación fibra',
      },
      schedule: {
        eventId: 'event-001',
        window: {
          startAt: '2026-07-30T14:00:00.000Z',
          endAt: '2026-07-30T16:00:00.000Z',
        },
      },
      site: { id: 'site-001', label: 'Sitio autorizado' },
      completion: { progress: 0 },
      syncState: 'IN_SYNC',
      inventoryReconciliation: 'NOT_REQUIRED',
      allowedActions: ['CLOSE'],
      createdAt: '2026-07-30T12:00:00.000Z',
      updatedAt: '2026-07-30T12:00:00.000Z',
    } as never;

    jest.mocked(tasksApi.executionOrders.get).mockResolvedValue(order);
    jest.mocked(tasksApi.executionOrders.listActivities).mockResolvedValue({
      data: [],
      meta: { page: 1, limit: 25, total: 0 },
    } as never);
    jest.mocked(tasksApi.executionOrders.listItemUsage).mockResolvedValue({
      data: [],
      meta: { page: 1, limit: 25, total: 0 },
    } as never);
    jest.mocked(tasksApi.executionOrders.listEvidence).mockResolvedValue({
      data: [],
      meta: {
        nextCursor: null,
        total: 0,
        totalIsEstimate: false,
        page: 1,
        limit: 100,
        totalPages: 0,
        hasMore: false,
        mode: 'page',
        capabilities: { randomAccess: true, sortableFields: [] },
        sort: null,
      },
    });
    searchParamsMock = new URLSearchParams({ executionOrderId: 'eo-template-error' });

    try {
      render(<ExecutionOrdersClient />);

      expect((await screen.findAllByText('OT-TEMPLATE-ERROR')).length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Plantilla no disponible').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('Requisitos no disponibles')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Cerrar OT' })).not.toBeInTheDocument();
      // Sin snapshot no hay fallo de red: la OT se consulta en modo degradado.
      expect(screen.queryByText('No fue posible completar la operación')).not.toBeInTheDocument();
      expect(tasksApi.executionOrders.listTemplateVersions).not.toHaveBeenCalled();
    } finally {
      searchParamsMock = new URLSearchParams();
    }
  });

  // Los casos de «custodia del ejecutor» pasaron a `ExecutionOrderMaterialConsole.spec.tsx`:
  // la custodia ya no se consulta al abrir la OT sino al abrir el acto de consumo (R3, UX §6).

  // ADR-065 §15 — «El total refleja el alcance del operador. QA verifica con
  // dos usuarios de alcance distinto que el pie no revela el total global del
  // tenant». La parte servidor (un solo `getManyAndCount` sobre el QB ya
  // scopeado) se fija en `tasks.boundary.spec.ts`; aquí se verifica la mitad
  // de UI: el pie pinta el `meta.total` del alcance recibido, sin recomputarlo.
  describe('ADR-065 §15 — alcance del conteo (dos usuarios de alcance distinto)', () => {
    const techListItem = {
      id: 'eo-tech-001',
      number: 'OT-TECH-001',
      status: 'ASSIGNED',
      workType: WfmWorkType.INSTALLATION,
      schedule: {
        eventId: 'event-001',
        window: { startAt: '2026-09-13T14:00:00.000Z', endAt: '2026-09-13T16:00:00.000Z' },
      },
      assignee: { type: 'TECHNICIAN', id: 'tech-001', displayLabel: 'Carlos López' },
      customerDisplayLabel: 'Cliente ejemplo',
      municipality: 'Bogotá',
      ticketId: null,
      taskId: null,
      visitRequestId: null,
      createdAt: '2026-09-13T10:00:00.000Z',
      updatedAt: '2026-09-13T10:00:00.000Z',
    } as never;

    function buildMeta(overrides: { total: number; page?: number; totalPages?: number }) {
      const limit = 20;
      return {
        nextCursor: null,
        total: overrides.total,
        totalIsEstimate: false,
        page: overrides.page ?? 1,
        limit,
        totalPages: overrides.totalPages ?? Math.max(1, Math.ceil(overrides.total / limit)),
        hasMore: false,
        mode: 'page',
        capabilities: { randomAccess: true, sortableFields: [] },
        sort: null,
      };
    }

    it('un TECHNICIAN ve el total de su alcance: el pie no revela el total del tenant', async () => {
      mockCurrentUser = { id: 'tech-001', role: UserRole.TECHNICIAN };
      jest.mocked(tasksApi.executionOrders.list).mockResolvedValue({
        data: [techListItem],
        total: 1,
        page: 1,
        limit: 20,
        meta: buildMeta({ total: 1 }),
      } as never);

      render(<ExecutionOrdersClient />);

      expect(await screen.findByText('1–1 de 1 orden de ejecución')).toBeInTheDocument();
      // El total del tenant (21) no aparece por ninguna vía del pie.
      expect(screen.queryByText(/de 21/)).not.toBeInTheDocument();
      expect(screen.queryByText(/21 órdenes de ejecución/)).not.toBeInTheDocument();
    });

    it('un ADMIN ve el total del tenant: mismo cliente, distinto alcance', async () => {
      mockCurrentUser = { id: 'admin-001', role: UserRole.ADMIN };
      const page = Array.from({ length: 20 }, (_, index) => ({
        ...(techListItem as Record<string, unknown>),
        id: `eo-${index}`,
        number: `OT-${index}`,
      }));
      jest.mocked(tasksApi.executionOrders.list).mockResolvedValue({
        data: page,
        total: 21,
        page: 1,
        limit: 20,
        meta: buildMeta({ total: 21, totalPages: 2 }),
      } as never);

      render(<ExecutionOrdersClient />);

      expect(
        await screen.findByText('Mostrando 1–20 de 21 órdenes de ejecución'),
      ).toBeInTheDocument();
    });

    it('el total del pie sale de meta, no del largo de data (sin recomputo local)', async () => {
      mockCurrentUser = { id: 'admin-001', role: UserRole.ADMIN };
      jest.mocked(tasksApi.executionOrders.list).mockResolvedValue({
        data: [techListItem],
        total: 3,
        page: 1,
        limit: 20,
        meta: buildMeta({ total: 3 }),
      } as never);

      render(<ExecutionOrdersClient />);

      expect(await screen.findByText('3 órdenes de ejecución')).toBeInTheDocument();
      expect(screen.queryByText('1 orden de ejecución')).not.toBeInTheDocument();
    });
  });

  // ────────────────────────────────────────────────────────────────
  // OLA 4.1 — P1-1 (contrato §6.7) y E6 (UX spec §6.3)
  // ────────────────────────────────────────────────────────────────
  describe('OLA 4.1 — estados de bandeja y deep link de OT', () => {
    function buildListOrder(index: number) {
      return {
        id: `eo-ola41-${index}`,
        number: `OT-OLA41-${index}`,
        status: 'ASSIGNED',
        result: null,
        workType: WfmWorkType.INSTALLATION,
        schedule: {
          eventId: `event-${index}`,
          window: { startAt: '2026-09-13T14:00:00.000Z', endAt: '2026-09-13T16:00:00.000Z' },
        },
        assignee: { type: 'TECHNICIAN', id: 'tech-001', displayLabel: 'Carlos López' },
        customerDisplayLabel: 'Cliente ejemplo',
        municipality: 'Bogotá',
        ticketId: null,
        taskId: null,
        visitRequestId: null,
        createdAt: '2026-09-13T10:00:00.000Z',
        updatedAt: '2026-09-13T10:00:00.000Z',
      } as never;
    }

    function buildListMeta(total: number) {
      return {
        nextCursor: null,
        total,
        totalIsEstimate: false,
        page: 1,
        limit: 20,
        totalPages: Math.max(1, Math.ceil(total / 20)),
        hasMore: false,
        mode: 'page',
        capabilities: { randomAccess: true, sortableFields: [] },
        sort: null,
      };
    }

    it('DS P1-1: un fallo de refresco conserva las filas y no co-renderiza el vacío', async () => {
      const user = userEvent.setup();
      jest.mocked(tasksApi.executionOrders.list).mockResolvedValue({
        data: [buildListOrder(1)],
        total: 1,
        page: 1,
        limit: 20,
        meta: buildListMeta(1),
      } as never);

      render(<ExecutionOrdersClient />);
      expect(await screen.findByRole('button', { name: 'OT-OLA41-1' })).toBeInTheDocument();

      jest
        .mocked(tasksApi.executionOrders.list)
        .mockRejectedValueOnce(new Error('Fallo transitorio de red'));
      await user.click(screen.getByRole('button', { name: 'Actualizar' }));

      expect(await screen.findByText('No pudimos cargar la información')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'OT-OLA41-1' })).toBeInTheDocument();
      expect(screen.queryByText('Todavía no hay órdenes de ejecución')).not.toBeInTheDocument();
    });

    it('DS P1-1: sin filas previas el error sustituye la composición vacía y «Reintentar» recupera', async () => {
      const user = userEvent.setup();
      jest.mocked(tasksApi.executionOrders.list).mockResolvedValue({
        data: [buildListOrder(1)],
        total: 1,
        page: 1,
        limit: 20,
        meta: buildListMeta(1),
      } as never);
      jest
        .mocked(tasksApi.executionOrders.list)
        .mockRejectedValueOnce(new Error('Fallo transitorio de red'));

      render(<ExecutionOrdersClient />);

      expect(await screen.findByText('No pudimos cargar la información')).toBeInTheDocument();
      expect(screen.queryByText('Todavía no hay órdenes de ejecución')).not.toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Reintentar' }));
      expect(await screen.findByRole('button', { name: 'OT-OLA41-1' })).toBeInTheDocument();
      expect(screen.queryByText('No pudimos cargar la información')).not.toBeInTheDocument();
    });

    it('E6: el deep link a una OT inaccesible muestra la alerta con salida a la bandeja', async () => {
      jest
        .mocked(tasksApi.executionOrders.get)
        .mockRejectedValue(new ApiError(404, 'NOT_FOUND', 'No disponible'));
      searchParamsMock = new URLSearchParams({ executionOrderId: 'eo-ghost' });

      try {
        render(<ExecutionOrdersClient />);

        // El error de llegada es una alerta de contenedor, no el drawer
        // (UX spec §6.3 E6): sin superficie modal bloqueante.
        expect(
          await screen.findByText('No pudimos abrir esta orden de ejecución'),
        ).toBeInTheDocument();
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(
          screen.getByText(
            'El enlace puede estar desactualizado o el elemento puede no estar disponible para ti.',
          ),
        ).toBeInTheDocument();
        expect(
          screen.getByRole('link', { name: 'Ver todas las órdenes de ejecución' }),
        ).toHaveAttribute('href', CANONICAL_PATH);
      } finally {
        searchParamsMock = new URLSearchParams();
      }
    });

    it('R1: abrir una fila desde la entrada por defecto fija la cola activa y no relista en Todas', async () => {
      const user = userEvent.setup();
      const listMock = jest.mocked(tasksApi.executionOrders.list);
      listMock.mockClear();
      listMock.mockResolvedValue({
        data: [buildListOrder(1)],
        total: 1,
        page: 1,
        limit: 20,
        meta: buildListMeta(1),
      } as never);
      jest.mocked(tasksApi.executionOrders.get).mockRejectedValue(new Error('sin detalle'));
      const { rerender } = render(<ExecutionOrdersClient />);

      await user.click(await screen.findByRole('button', { name: 'OT-OLA41-1' }));

      expect(mockPush).toHaveBeenLastCalledWith(
        `${CANONICAL_PATH}?queue=ACTIVE&executionOrderId=eo-ola41-1`,
        { scroll: false },
      );
      rerender(<ExecutionOrdersClient />);
      await waitFor(() =>
        expect(jest.mocked(tasksApi.executionOrders.get).mock.calls.at(-1)?.[0]).toBe('eo-ola41-1'),
      );
      const queues = listMock.mock.calls.map((call) => call[0]?.queue);
      expect(queues).not.toContain('ALL');
      expect(queues.every((queue) => queue === 'ACTIVE')).toBe(true);
    });

    it('R1: al cerrar la consola la cola se mantiene en la URL', async () => {
      const user = userEvent.setup();
      jest.mocked(tasksApi.executionOrders.get).mockResolvedValue({
        id: 'eo-queue-001',
        number: 'OT-QUEUE-001',
        version: 1,
        status: 'ASSIGNED',
        workType: WfmWorkType.INSTALLATION,
        template: null,
        schedule: {
          eventId: 'event-queue-001',
          window: { startAt: '2026-09-13T14:00:00.000Z', endAt: '2026-09-13T16:00:00.000Z' },
        },
        site: { id: 'site-001', label: 'Sede operativa' },
        completion: { progress: 0, completed: 0, total: 0 },
        syncState: 'IN_SYNC',
        inventoryReconciliation: 'NOT_REQUIRED',
        allowedActions: [],
        createdAt: '2026-09-13T10:00:00.000Z',
        updatedAt: '2026-09-13T10:00:00.000Z',
      } as never);
      searchParamsMock = new URLSearchParams('queue=ACTIVE&executionOrderId=eo-queue-001');
      render(<ExecutionOrdersClient />);
      await screen.findAllByText('OT-QUEUE-001');

      await user.click(screen.getByRole('button', { name: 'Cerrar' }));

      expect(mockReplace).toHaveBeenLastCalledWith(`${CANONICAL_PATH}?queue=ACTIVE`);
    });

    it('PROD-UX #7: al cerrar por deep link el foco aterriza en el encabezado de resultados', async () => {
      const user = userEvent.setup();
      const detail = {
        id: 'eo-focus-001',
        number: 'OT-FOCUS-001',
        version: 1,
        status: 'ASSIGNED',
        workType: WfmWorkType.INSTALLATION,
        template: null,
        schedule: {
          eventId: 'event-focus-001',
          window: { startAt: '2026-09-13T14:00:00.000Z', endAt: '2026-09-13T16:00:00.000Z' },
        },
        site: { id: 'site-001', label: 'Sede operativa' },
        completion: { progress: 0, completed: 0, total: 0 },
        syncState: 'IN_SYNC',
        inventoryReconciliation: 'NOT_REQUIRED',
        allowedActions: [],
        createdAt: '2026-09-13T10:00:00.000Z',
        updatedAt: '2026-09-13T10:00:00.000Z',
      } as never;
      jest.mocked(tasksApi.executionOrders.get).mockResolvedValue(detail);
      searchParamsMock = new URLSearchParams({ executionOrderId: 'eo-focus-001' });

      try {
        render(<ExecutionOrdersClient />);
        await screen.findAllByText('OT-FOCUS-001');

        await user.click(screen.getByRole('button', { name: 'Cerrar' }));

        await waitFor(() => {
          expect(document.getElementById('execution-orders-results')).toHaveFocus();
        });
      } finally {
        searchParamsMock = new URLSearchParams();
      }
    });
  });
});
