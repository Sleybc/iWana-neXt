/**
 * CA-11 (MOD09 agenda §3 H) — conteos del encabezado con el hook REAL: cuántas consultas
 * de conteo salen por rol y que Actualizar las repite. Las consultas de conteo se
 * reconocen por `limit: 1` (la agenda nunca pide listados de un elemento).
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { UserRole } from '@iwana/shared';
import { SchedulingClient } from './SchedulingClient';
import { wfmApi } from '@/lib/api-client';

const useAuthMock = jest.fn();

jest.mock('./useOperatingWindow', () => {
  const window = {
    status: 'OPEN',
    source: 'COMPANY_HOURS',
    startTime: '08:00',
    endTime: '18:00',
    reason: null,
  };
  const state = {
    operatingWindow: window,
    isLoadingOperatingWindow: false,
    operatingWindowError: null,
  };
  return {
    useOperatingWindow: () => state,
    useDailyDisplayOperatingWindow: () => state,
    getOperatingWindowMessage: () => null,
  };
});

jest.mock('next/navigation', () => {
  const router = { replace: jest.fn(), push: jest.fn() };
  const params = new URLSearchParams();
  return {
    usePathname: () => '/dashboard/scheduling/agenda',
    useRouter: () => router,
    useSearchParams: () => params,
  };
});

jest.mock('@/components/auth/AuthProvider', () => ({
  useAuth: () => useAuthMock(),
}));

jest.mock('@/lib/api-client', () => {
  class MockApiError extends Error {
    status = 500;
    code = 'ERROR';
  }
  return {
    ApiError: MockApiError,
    assuranceApi: { tickets: { findOrCreateInstallation: jest.fn(), linkWorkOrder: jest.fn() } },
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
      visitRequests: { list: jest.fn(), get: jest.fn() },
      events: { list: jest.fn(), get: jest.fn() },
      recommendations: { create: jest.fn() },
      workOrders: { list: jest.fn() },
      dashboard: { getSummary: jest.fn() },
      eligibleAssignees: { list: jest.fn() },
      technicians: { listAvailability: jest.fn() },
    },
  };
});

const api = wfmApi as unknown as {
  visitRequests: { list: jest.Mock };
  events: { list: jest.Mock };
  workOrders: { list: jest.Mock };
  eligibleAssignees: { list: jest.Mock };
  technicians: { listAvailability: jest.Mock };
};

function pageMeta(total: number) {
  return {
    nextCursor: null,
    total,
    totalIsEstimate: false,
    page: 1,
    limit: 100,
    totalPages: 1,
    hasMore: false,
    mode: 'page',
    capabilities: { randomAccess: true, sortableFields: [] },
    sort: null,
  };
}

function countCalls(): number {
  const isCount = (call: unknown[]) => (call[0] as { limit?: number } | undefined)?.limit === 1;
  return (
    api.visitRequests.list.mock.calls.filter(isCount).length +
    api.events.list.mock.calls.filter(isCount).length
  );
}

function authAs(role: UserRole) {
  useAuthMock.mockReturnValue({
    isLoading: false,
    user: {
      id: 'user-1',
      emailHash: 'ops@example.com',
      role,
      type: 'tenant' as const,
      tenantId: 'tenant-1',
      displayName: 'Operaciones',
      subtitle: 'Operaciones',
      firstName: 'Operaciones',
      lastName: 'Demo',
    },
  });
}

describe('SchedulingClient — conteos del encabezado con el hook real', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    api.events.list.mockResolvedValue({ data: [], meta: pageMeta(2) });
    api.workOrders.list.mockResolvedValue({ data: [], meta: pageMeta(0) });
    api.eligibleAssignees.list.mockResolvedValue([]);
    api.technicians.listAvailability.mockResolvedValue({ data: [], meta: pageMeta(0) });
    api.visitRequests.list.mockResolvedValue({
      items: [],
      meta: { total: 3, page: 1, limit: 1, totalPages: 3 },
    });
  });

  it.each([UserRole.TECHNICIAN, UserRole.CONTRACTOR])(
    '%s no hace consultas de conteo',
    async (role) => {
      authAs(role);
      render(<SchedulingClient surface="agenda" />);

      await waitFor(() => expect(api.events.list).toHaveBeenCalled());
      await screen.findByRole('button', { name: 'Actualizar' });
      expect(countCalls()).toBe(0);
    },
  );

  it.each([UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT])(
    '%s hace 4 consultas de conteo y Actualizar las repite',
    async (role) => {
      authAs(role);
      render(<SchedulingClient surface="agenda" />);

      expect(await screen.findByRole('link', { name: 'Pendientes: 3' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Visitas sin realizar: 7' })).toBeInTheDocument();
      expect(countCalls()).toBe(4);

      fireEvent.click(screen.getByRole('button', { name: 'Actualizar' }));
      await waitFor(() => expect(countCalls()).toBe(8));
    },
  );

  it('cambiar de vista recarga la agenda sin repetir las consultas de conteo', async () => {
    authAs(UserRole.ADMIN);
    render(<SchedulingClient surface="agenda" />);

    await screen.findByRole('link', { name: 'Pendientes: 3' });
    expect(countCalls()).toBe(4);
    const agendaLoads = api.events.list.mock.calls.length;

    fireEvent.click(screen.getByRole('button', { name: 'Semana' }));
    await waitFor(() => expect(api.events.list.mock.calls.length).toBeGreaterThan(agendaLoads));
    await screen.findByRole('button', { name: 'Actualizar' });
    expect(countCalls()).toBe(4);
  });
});
