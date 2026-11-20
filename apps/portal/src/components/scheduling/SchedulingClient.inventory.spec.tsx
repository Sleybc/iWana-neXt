/**
 * CA-1 (MOD09 agenda: densidad y enlaces) — inventario de capacidades de la agenda.
 *
 * Enumera vistas, filtros, acciones y estados vacíos por rol y nombre accesible, sin
 * depender de textos descriptivos (encabezados, «Vista diaria», ayudas) que el rediseño
 * retira. Debe pasar antes y después del rediseño: si una capacidad desaparece, falla.
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import {
  ScheduleEventStatus,
  UserRole,
  VisitRequestStatus,
  WfmWorkType,
  WorkOrderPriority,
  WorkOrderSourceContext,
} from '@iwana/shared';
import { SchedulingClient } from './SchedulingClient';
import { wfmApi } from '@/lib/api-client';
import { PENDING_VISIT_DRAG_MIME, serializePendingVisitDragPayload } from './daily-schedule-draft';

const useAuthMock = jest.fn();
const replaceMock = jest.fn();
const pushMock = jest.fn();
const useOperatingWindowMock = jest.fn();
let searchParamsMock = new URLSearchParams();
let pathnameMock = '/dashboard/scheduling/agenda';
const TECHNICIAN_ID = '11111111-1111-4111-8111-111111111111';

jest.mock('./useOperatingWindow', () => ({
  useOperatingWindow: (...args: unknown[]) => useOperatingWindowMock(...args),
  useDailyDisplayOperatingWindow: () => ({
    operatingWindow: {
      status: 'OPEN',
      source: 'COMPANY_HOURS',
      startTime: '08:00',
      endTime: '18:00',
      reason: null,
    },
    isLoadingOperatingWindow: false,
    operatingWindowError: null,
  }),
  getOperatingWindowMessage: () => null,
}));

// Router con referencia estable: un objeto nuevo por render reinicia efectos.
jest.mock('next/navigation', () => ({
  usePathname: () => pathnameMock,
  useRouter: (() => {
    let router: Record<string, unknown> | undefined;
    return () => (router ??= { replace: replaceMock, push: pushMock });
  })(),
  useSearchParams: () => searchParamsMock,
}));

jest.mock('@/components/auth/AuthProvider', () => ({
  useAuth: () => useAuthMock(),
}));

jest.mock('@/lib/api-client', () => {
  class MockApiError extends Error {
    status: number;
    code: string;
    details?: unknown;

    constructor(status: number, code: string, message: string, details?: unknown) {
      super(message);
      this.name = 'ApiError';
      this.status = status;
      this.code = code;
      this.details = details;
    }
  }

  return {
    ApiError: MockApiError,
    assuranceApi: {
      tickets: { findOrCreateInstallation: jest.fn(), linkWorkOrder: jest.fn() },
    },
    crmApi: {
      getExpediente: jest.fn(),
      linkInstallationOperationalRefs: jest.fn(),
      transitionExpedienteStatus: jest.fn(),
    },
    tasksApi: {
      create: jest.fn(),
      linkScheduleEvent: jest.fn(),
      linkWorkOrder: jest.fn(),
      executionOrders: { get: jest.fn() },
    },
    wfmApi: {
      visitRequests: {
        list: jest.fn(),
        get: jest.fn(),
        updateContext: jest.fn(),
        recommend: jest.fn(),
        schedule: jest.fn(),
      },
      events: {
        list: jest.fn(),
        get: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        transitionStatus: jest.fn(),
        reschedule: jest.fn(),
        moveToPending: jest.fn(),
        remove: jest.fn(),
      },
      recommendations: { create: jest.fn() },
      workOrders: { list: jest.fn(), get: jest.fn(), transitionStatus: jest.fn() },
      dashboard: { getSummary: jest.fn() },
      eligibleAssignees: { list: jest.fn() },
      technicians: { listAvailability: jest.fn(), createAvailability: jest.fn() },
    },
  };
});

type WfmMock = {
  visitRequests: { list: jest.Mock; get: jest.Mock; recommend: jest.Mock };
  events: { list: jest.Mock; get: jest.Mock };
  recommendations: { create: jest.Mock };
  workOrders: { list: jest.Mock };
  dashboard: { getSummary: jest.Mock };
  eligibleAssignees: { list: jest.Mock };
  technicians: { listAvailability: jest.Mock };
};
const wfmApiMock = wfmApi as unknown as WfmMock;

function page<T>(data: T[]) {
  return {
    data,
    meta: {
      nextCursor: null,
      total: data.length,
      totalIsEstimate: false,
      page: 1,
      limit: 100,
      totalPages: data.length ? 1 : 0,
      hasMore: false,
      mode: 'page',
      capabilities: { randomAccess: true, sortableFields: [] },
      sort: null,
    },
  };
}

// Estado de sesión con referencia estable.
const AUTH_STATE = {
  user: {
    id: 'user-1',
    emailHash: 'ops@example.test',
    role: UserRole.ADMIN,
    type: 'tenant' as const,
    tenantId: 'tenant-1',
    displayName: 'Operaciones',
    subtitle: 'Admin',
    firstName: 'Operaciones',
    lastName: 'Prueba',
  },
  isLoading: false,
};

const TECHNICIAN = {
  id: TECHNICIAN_ID,
  email: 'tecnico@example.test',
  role: UserRole.TECHNICIAN,
  status: 'ACTIVE',
  tenantId: 'tenant-1',
  mfaEnabled: true,
  mfaRequired: false,
  isOperationalResource: true,
  emailVerified: true,
  passwordResetRequired: false,
  lastLoginAt: null,
  createdAt: '2026-05-01T00:00:00.000Z',
  updatedAt: '2026-05-01T00:00:00.000Z',
  deletedAt: null,
  firstName: 'Luisa',
  lastName: 'Campos',
  phone: null,
  jobTitle: 'Técnica de campo',
  documentType: null,
  documentNumber: null,
  avatarUrl: null,
};

function buildEventToday() {
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 9, 0, 0, 0);
  return {
    id: 'evt-inv-1',
    tenantId: 'tenant-1',
    workOrderId: null,
    type: WfmWorkType.INSTALLATION,
    status: ScheduleEventStatus.SCHEDULED,
    title: 'Instalación inventario',
    description: null,
    scheduledStartAt: start.toISOString(),
    scheduledEndAt: new Date(start.getTime() + 60 * 60 * 1000).toISOString(),
    assignedUserId: TECHNICIAN_ID,
    assignedTeamId: null,
    address: 'Calle 1 # 1 - 1',
    municipality: 'Bogotá',
    latitude: null,
    longitude: null,
    expedienteId: null,
    subscriberId: null,
    ticketId: null,
    contractId: null,
    createdBy: 'user-1',
    updatedBy: 'user-1',
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z',
    deletedAt: null,
  };
}

const PENDING_VISIT = {
  id: 'vr-inv-1',
  tenantId: 'tenant-1',
  status: VisitRequestStatus.READY_TO_SCHEDULE,
  originContext: WorkOrderSourceContext.CRM,
  originRef: 'EXP-INV',
  originLabel: 'Oportunidad EXP-INV',
  customerDisplayName: 'Cliente Prueba',
  workType: WfmWorkType.INSTALLATION,
  priority: WorkOrderPriority.HIGH,
  title: 'Visita pendiente inventario',
  description: null,
  address: 'Calle 2 # 2 - 2',
  municipality: 'Bogotá',
  sector: 'Centro',
  latitude: null,
  longitude: null,
  requestedWindowStartAt: null,
  requestedWindowEndAt: null,
  organizationSiteId: '77777777-7777-4777-8777-777777777777',
  expedienteId: null,
  subscriberId: null,
  ticketId: null,
  workOrderId: null,
  assignedEventId: null,
  scheduledStartAt: null,
  scheduledEndAt: null,
  createdBy: 'user-1',
  updatedBy: 'user-1',
  createdAt: '2026-06-01T00:00:00.000Z',
  updatedAt: '2026-06-01T00:00:00.000Z',
  deletedAt: null,
};

// Con el rango sin eventos, la recarga sustituye la barra por el esqueleto: cada paso
// vuelve a buscar el grupo de vistas en lugar de reutilizar un nodo desmontado.
async function viewButton(name: string) {
  const views = await screen.findByRole('group', { name: 'Vista de agenda' });
  return within(views).getByRole('button', { name });
}

async function expectActiveView(name: string) {
  await waitFor(async () => {
    expect(await viewButton(name)).toHaveAttribute('aria-pressed', 'true');
  });
}

describe('SchedulingClient — inventario de la agenda (CA-1)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    searchParamsMock = new URLSearchParams();
    pathnameMock = '/dashboard/scheduling/agenda';
    useOperatingWindowMock.mockReturnValue({
      operatingWindow: {
        status: 'OPEN',
        source: 'COMPANY_HOURS',
        startTime: '07:00',
        endTime: '18:00',
        reason: null,
      },
      isLoadingOperatingWindow: false,
      operatingWindowError: null,
    });
    useAuthMock.mockReturnValue(AUTH_STATE);
    wfmApiMock.eligibleAssignees.list.mockResolvedValue([TECHNICIAN]);
    wfmApiMock.dashboard.getSummary.mockResolvedValue({
      todayCount: 0,
      overdueCount: 0,
      upcomingCount: 0,
      activeCount: 0,
      enRouteCount: 0,
      atRiskCount: 0,
      pendingInbox: {
        totalOpen: 0,
        readyToScheduleCount: 0,
        needsContextCount: 0,
        overdueSlaCount: 0,
        highPriorityOpenCount: 0,
      },
      alerts: [],
      technicianLoad: [],
    });
    wfmApiMock.technicians.listAvailability.mockResolvedValue(page([]));
    wfmApiMock.workOrders.list.mockResolvedValue(page([]));
    wfmApiMock.events.list.mockResolvedValue(page([]));
    wfmApiMock.visitRequests.list.mockResolvedValue({
      items: [],
      meta: { total: 0, page: 1, limit: 8, totalPages: 1 },
    });
    wfmApiMock.visitRequests.recommend.mockResolvedValue([]);
    wfmApiMock.recommendations.create.mockResolvedValue([]);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('ofrece las cuatro vistas, Día es la inicial y cada una se puede activar', async () => {
    render(<SchedulingClient surface="agenda" />);

    const views = await screen.findByRole('group', { name: 'Vista de agenda' });
    expect(
      within(views)
        .getAllByRole('button')
        .map((button) => button.textContent?.trim()),
    ).toEqual(['Día', 'Lista', 'Semana', 'Mes']);
    await expectActiveView('Día');

    for (const name of ['Lista', 'Semana', 'Mes', 'Día']) {
      fireEvent.click(await viewButton(name));
      await expectActiveView(name);
    }
  });

  it('expone los cuatro filtros: fecha base, responsable, tipo y estado', async () => {
    render(<SchedulingClient surface="agenda" />);

    await screen.findByRole('group', { name: 'Vista de agenda' });
    expect(screen.getByLabelText('Fecha base')).toBeInTheDocument();
    expect(screen.getByLabelText('Responsable')).toBeInTheDocument();
    expect(screen.getByLabelText('Tipo')).toBeInTheDocument();
    expect(screen.getByLabelText('Estado')).toBeInTheDocument();
  });

  it('expone Hoy, rango anterior y siguiente, y Actualizar vuelve a cargar eventos', async () => {
    render(<SchedulingClient surface="agenda" />);

    await screen.findByRole('group', { name: 'Vista de agenda' });
    expect(screen.getByRole('button', { name: 'Hoy' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /rango siguiente/i }));
    fireEvent.click(await screen.findByRole('button', { name: /rango anterior/i }));
    fireEvent.click(await screen.findByRole('button', { name: 'Hoy' }));
    const callsBefore = wfmApiMock.events.list.mock.calls.length;

    fireEvent.click(await screen.findByRole('button', { name: /Actualizar/ }));

    await waitFor(() => {
      expect(wfmApiMock.events.list.mock.calls.length).toBeGreaterThan(callsBefore);
    });
  });

  it('enlaza a Pendientes y a Visitas sin realizar', async () => {
    render(<SchedulingClient surface="agenda" />);

    await screen.findByRole('group', { name: 'Vista de agenda' });
    expect(screen.getByRole('link', { name: /^Pendientes/ })).toHaveAttribute(
      'href',
      expect.stringContaining('/dashboard/scheduling/pending-visits'),
    );
    expect(screen.getByRole('link', { name: /Visitas sin realizar/ })).toHaveAttribute(
      'href',
      expect.stringContaining('/dashboard/scheduling/unrealized-visits'),
    );
  });

  it('en Día ofrece crear evento desde una celda por técnico y hora', async () => {
    render(<SchedulingClient surface="agenda" />);

    expect(
      await screen.findByRole('button', { name: /Crear evento para Luisa Campos a las 07:00/i }),
    ).toBeInTheDocument();
  });

  it('en Día muestra cada evento con nombre accesible de título y franja', async () => {
    wfmApiMock.events.list.mockResolvedValue(page([buildEventToday()]));
    render(<SchedulingClient surface="agenda" />);

    expect(
      await screen.findByRole('button', {
        name: /^Evento Instalación inventario de 09:00/,
      }),
    ).toBeInTheDocument();
  });

  it('arrastrar una pendiente a la grilla crea un borrador ajustable con confirmar y quitar', async () => {
    // Reloj fijo: la grilla descarta franjas pasadas al soltar.
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-06-23T06:00:00'));
    wfmApiMock.visitRequests.list.mockResolvedValue({
      items: [PENDING_VISIT],
      meta: { total: 1, page: 1, limit: 8, totalPages: 1 },
    });
    render(<SchedulingClient surface="agenda" />);

    const dropTarget = await screen.findByRole('button', {
      name: /Crear evento para Luisa Campos a las 14:00/i,
    });
    const payload = serializePendingVisitDragPayload({
      visitRequestId: PENDING_VISIT.id,
      organizationSiteId: PENDING_VISIT.organizationSiteId,
      workType: WfmWorkType.INSTALLATION,
      durationMinutes: 60,
      customerDisplayName: PENDING_VISIT.customerDisplayName,
      title: PENDING_VISIT.title,
    });
    const dataTransfer = {
      getData: jest.fn((type: string) => (type === PENDING_VISIT_DRAG_MIME ? payload : '')),
      dropEffect: 'copy',
    };
    fireEvent.dragOver(dropTarget, { dataTransfer });
    fireEvent.drop(dropTarget, { dataTransfer });

    expect(await screen.findByRole('button', { name: 'Confirmar agenda' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Quitar borrador' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ajustar inicio del borrador' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ajustar fin del borrador' })).toBeInTheDocument();
  });

  it('Semana y Mes ofrecen abrir cada día y el día abierto vuelve a la vista Día', async () => {
    render(<SchedulingClient surface="agenda" />);

    fireEvent.click(await viewButton('Semana'));
    await expectActiveView('Semana');
    expect(await screen.findAllByRole('button', { name: /Abrir día/i })).toHaveLength(7);

    fireEvent.click(await viewButton('Mes'));
    await expectActiveView('Mes');
    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: /Abrir día/i }).length).toBeGreaterThanOrEqual(
        28,
      );
    });

    fireEvent.click(screen.getAllByRole('button', { name: /Abrir día/i })[0] as HTMLElement);
    await expectActiveView('Día');
  });

  it('Lista sin eventos muestra su estado vacío', async () => {
    render(<SchedulingClient surface="agenda" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Lista' }));

    expect(await screen.findByText('Sin eventos en el rango')).toBeInTheDocument();
  });

  it('el fallo de carga muestra un error con reintento', async () => {
    wfmApiMock.events.list.mockRejectedValue(new Error('Servicio caído'));
    render(<SchedulingClient surface="agenda" />);

    expect(await screen.findByRole('button', { name: 'Reintentar carga' })).toBeInTheDocument();
  });
});
