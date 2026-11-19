// apps/portal/src/components/operations/ExecutionOrdersInbox.inventory.spec.tsx
// Inventario de no regresión de la bandeja de OT (spec 2026-11-19
// mod11-bandeja-ordenes-colas-ux, CA-1; W0 del plan). Fija las capacidades
// que el rediseño por colas debe conservar: filtros, columnas, estados vacíos,
// un solo pie y encabezados sin orden. Afirma presencia de capacidades por
// nombre accesible, no posiciones ni conteos de nodos, para seguir valiendo
// después del rediseño. La columna Cliente no se toca (F-4).
import type { ReactNode } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import { ExecutionOrderResult, ExecutionOrderStatus, UserRole, WfmWorkType } from '@iwana/shared';
import type { ExecutionOrderListItem } from '@/lib/api-client';
import { tasksApi } from '@/lib/api-client';
import { ExecutionOrdersClient } from './ExecutionOrdersClient';
import { parseExecutionOrdersQuery, serializeExecutionOrdersQuery } from './execution-orders-query';

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children }: { href: string; children: ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

let searchParamsMock = new URLSearchParams();
const mockRouter = { push: jest.fn(), replace: jest.fn() };

jest.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  useSearchParams: () => searchParamsMock,
}));

let mockCurrentUser: { id: string; role: UserRole } = { id: 'user-qa', role: UserRole.ADMIN };

jest.mock('@/components/auth/AuthProvider', () => ({
  // ctx-inestable-intencional: el rol cambia por prueba (vacío de campo vs gestión).
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
  organizationApi: { list: jest.fn().mockResolvedValue({ data: [], meta: {} }) },
  tasksApi: {
    get: jest.fn(),
    list: jest.fn().mockResolvedValue({ data: [], total: 0, page: 1, limit: 20 }),
    timeline: jest.fn().mockResolvedValue([]),
    assignmentHistory: jest.fn().mockResolvedValue([]),
    transition: jest.fn(),
    create: jest.fn(),
    executionOrders: {
      list: jest.fn(),
      get: jest.fn(),
      listActivities: jest.fn().mockResolvedValue([]),
      listItemUsage: jest.fn().mockResolvedValue([]),
      listEvidence: jest.fn().mockResolvedValue({ data: [] }),
      listTemplateVersions: jest.fn(),
    },
  },
  usersApi: { searchForPicker: jest.fn().mockResolvedValue({ data: [], total: 0 }) },
}));

function buildOrder(overrides: Partial<ExecutionOrderListItem> = {}): ExecutionOrderListItem {
  return {
    id: 'eo-inv-001',
    number: 'OT-INV-0001',
    status: ExecutionOrderStatus.ASSIGNED,
    result: undefined,
    workType: WfmWorkType.INSTALLATION,
    schedule: {
      eventId: 'event-inv-001',
      window: { startAt: '2026-09-13T14:00:00.000Z', endAt: '2026-09-13T16:00:00.000Z' },
    },
    assignee: { type: 'TECHNICIAN', id: 'tech-inv-001', displayLabel: 'Técnico de prueba' },
    customerDisplayLabel: 'Cliente de prueba',
    municipality: 'Municipio de prueba',
    ticketId: null,
    taskId: null,
    visitRequestId: null,
    createdAt: '2026-09-13T10:00:00.000Z',
    updatedAt: '2026-09-13T10:00:00.000Z',
    ...overrides,
  } as ExecutionOrderListItem;
}

function mockList(
  data: ExecutionOrderListItem[],
  randomAccess: boolean,
  hasMore = false,
  total = data.length,
) {
  jest.mocked(tasksApi.executionOrders.list).mockResolvedValue({
    data,
    total,
    page: 1,
    limit: 20,
    meta: {
      nextCursor: null,
      total,
      totalIsEstimate: false,
      page: 1,
      limit: 20,
      totalPages: Math.ceil(total / 20),
      hasMore,
      mode: randomAccess ? 'page' : 'cursor',
      capabilities: { randomAccess, sortableFields: [] },
      sort: null,
    },
  } as never);
}

const PAGER_NAME = 'Paginación de órdenes de ejecución';

async function renderInbox() {
  render(<ExecutionOrdersClient />);
  await waitFor(() => expect(tasksApi.executionOrders.list).toHaveBeenCalled());
}

describe('Bandeja de OT — inventario de no regresión (CA-1)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    searchParamsMock = new URLSearchParams();
    mockCurrentUser = { id: 'user-qa', role: UserRole.ADMIN };
  });

  it('conserva los filtros: Estado, Resultado, Tipo de trabajo, Asignado a, Sede y ventana Desde/Hasta', async () => {
    mockList([buildOrder()], true);
    await renderInbox();
    await screen.findByRole('button', { name: 'OT-INV-0001' });

    expect(screen.getByLabelText('Estado')).toBeInTheDocument();
    expect(screen.getByLabelText('Resultado')).toBeInTheDocument();
    expect(screen.getByLabelText('Tipo de trabajo')).toBeInTheDocument();
    expect(screen.getByLabelText('Asignado a')).toBeInTheDocument();
    expect(screen.getByLabelText('Sede')).toBeInTheDocument();
    expect(screen.getByLabelText('Desde')).toBeInTheDocument();
    expect(screen.getByLabelText('Hasta')).toBeInTheDocument();
  });

  it('cada filtro viaja en la URL y vuelve igual al leerla (enlaces compartibles)', () => {
    const filters = {
      status: ExecutionOrderStatus.ASSIGNED,
      workType: WfmWorkType.INSTALLATION,
      assigneeId: 'tech-inv-001',
      organizationSiteId: 'site-inv-001',
      windowFrom: '2026-09-01',
      windowTo: '2026-09-30',
    };
    const parsed = parseExecutionOrdersQuery(
      new URLSearchParams(serializeExecutionOrdersQuery(filters)),
    );

    expect(parsed).toEqual(expect.objectContaining(filters));
  });

  it('conserva las columnas, incluida Cliente sin cambios, y la fila abre su consola', async () => {
    mockList(
      [
        buildOrder({
          status: ExecutionOrderStatus.COMPLETED,
          result: ExecutionOrderResult.REQUIRES_FOLLOW_UP,
        }),
      ],
      true,
    );
    await renderInbox();

    const table = await screen.findByRole('table', { name: 'Bandeja de órdenes de ejecución' });
    // Enmienda 6 columnas (2026-11-19): Número y Tipo de trabajo en «Orden»,
    // Resultado en «Estado»; los ocho datos siguen en la fila.
    expect(within(table).getAllByRole('columnheader')).toHaveLength(6);
    for (const header of [
      'Orden',
      'Estado',
      'Ventana planificada',
      'Asignado a',
      'Cliente',
      'Municipio',
    ]) {
      expect(within(table).getByRole('columnheader', { name: header })).toBeInTheDocument();
    }
    expect(within(table).getByText('Instalación')).toBeInTheDocument();
    expect(within(table).getByText('Requiere seguimiento')).toBeInTheDocument();
    expect(within(table).getByText('Cliente de prueba')).toBeInTheDocument();
    expect(within(table).getByRole('button', { name: 'OT-INV-0001' })).toBeInTheDocument();
  });

  it('ningún encabezado es ordenable ni lleva aria-sort (CA-5)', async () => {
    mockList([buildOrder()], true);
    await renderInbox();
    const table = await screen.findByRole('table', { name: 'Bandeja de órdenes de ejecución' });

    expect(table.querySelectorAll('[aria-sort]')).toHaveLength(0);
    for (const header of within(table).getAllByRole('columnheader')) {
      expect(within(header).queryByRole('button')).not.toBeInTheDocument();
    }
  });

  it('la ventana nula conserva su texto: «Por programar» en abiertas, «Sin ventana planificada» en terminales', async () => {
    mockList(
      [
        buildOrder({
          id: 'eo-inv-open',
          number: 'OT-INV-OPEN',
          status: ExecutionOrderStatus.ASSIGNED,
          schedule: { eventId: null, window: null } as never,
        }),
        buildOrder({
          id: 'eo-inv-closed',
          number: 'OT-INV-CLOSED',
          status: ExecutionOrderStatus.CANCELLED,
          schedule: { eventId: null, window: null } as never,
        }),
      ],
      true,
    );
    await renderInbox();

    const openRow = (await screen.findByRole('button', { name: 'OT-INV-OPEN' })).closest('tr');
    const closedRow = screen.getByRole('button', { name: 'OT-INV-CLOSED' }).closest('tr');
    expect(within(openRow as HTMLElement).getByText('Por programar')).toBeInTheDocument();
    expect(
      within(closedRow as HTMLElement).getByText('Sin ventana planificada'),
    ).toBeInTheDocument();
  });

  it('pie único con acceso aleatorio: paginador y nunca «Cargar más»', async () => {
    mockList([buildOrder()], true, false, 45);
    await renderInbox();
    await screen.findByRole('button', { name: 'OT-INV-0001' });

    expect(screen.getByRole('navigation', { name: PAGER_NAME })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cargar más' })).not.toBeInTheDocument();
  });

  it('pie único sin acceso aleatorio: «Cargar más» y nunca el paginador', async () => {
    mockList([buildOrder()], false, true, 45);
    await renderInbox();
    await screen.findByRole('button', { name: 'OT-INV-0001' });

    expect(screen.getByRole('button', { name: 'Cargar más' })).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: PAGER_NAME })).not.toBeInTheDocument();
  });

  it('vacío con filtros: lo dice y ofrece limpiar', async () => {
    searchParamsMock = new URLSearchParams('status=ASSIGNED');
    mockList([], true);
    await renderInbox();

    expect(await screen.findByText('No hay órdenes con estos filtros')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Limpiar filtros' }).length).toBeGreaterThan(0);
    expect(screen.queryByRole('navigation', { name: PAGER_NAME })).not.toBeInTheDocument();
  });

  it('vacío sin filtros para gestión: lleva a Programación', async () => {
    mockList([], true);
    await renderInbox();

    expect(await screen.findByText('Todavía no hay órdenes de ejecución')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ir a Programación' })).toHaveAttribute(
      'href',
      '/dashboard/scheduling',
    );
  });

  it('vacío sin filtros para el técnico: ofrece actualizar, sin enlace a Programación', async () => {
    mockCurrentUser = { id: 'user-tech', role: UserRole.TECHNICIAN };
    mockList([], true);
    await renderInbox();

    expect(
      await screen.findByText('Cuando te asignen una orden de ejecución, la verás aquí.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Ir a Programación' })).not.toBeInTheDocument();
  });

  it('error de carga: alerta con su título y sin estado vacío encima', async () => {
    jest.mocked(tasksApi.executionOrders.list).mockRejectedValue(new Error('red caída'));
    await renderInbox();

    expect(await screen.findByText('No pudimos cargar la información')).toBeInTheDocument();
    expect(screen.queryByText('Todavía no hay órdenes de ejecución')).not.toBeInTheDocument();
  });
});
