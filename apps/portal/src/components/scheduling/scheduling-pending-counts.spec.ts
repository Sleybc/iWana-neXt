import { renderHook, waitFor } from '@testing-library/react';
import { ScheduleEventStatus, VisitRequestStatus } from '@iwana/shared';
import { ApiError, wfmApi } from '@/lib/api-client';
import {
  getPendingShortcutLabel,
  loadSchedulingPendingCounts,
  useSchedulingPendingCounts,
} from './scheduling-pending-counts';

jest.mock('@/lib/api-client', () => {
  class MockApiError extends Error {
    constructor(
      public status: number,
      public code: string,
      message: string,
    ) {
      super(message);
      this.name = 'ApiError';
    }
  }
  return {
    ApiError: MockApiError,
    wfmApi: {
      visitRequests: { list: jest.fn() },
      events: { list: jest.fn() },
    },
  };
});

const visitRequestsList = wfmApi.visitRequests.list as jest.Mock;
const eventsList = wfmApi.events.list as jest.Mock;

const page = (total: number) => ({ items: [], data: [], meta: { total } });

describe('conteos del encabezado de la agenda (spec MOD09 agenda §3 H, CA-11)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    visitRequestsList.mockImplementation((params: { status?: string }) =>
      Promise.resolve(page(params.status === VisitRequestStatus.REQUIRES_RESCHEDULE ? 2 : 7)),
    );
    eventsList.mockImplementation((params: { status?: string }) =>
      Promise.resolve(page(params.status === ScheduleEventStatus.NO_SHOW ? 3 : 4)),
    );
  });

  it('usa las consultas de cada bandeja con limit 1 y suma las tres fuentes de sin realizar', async () => {
    await expect(loadSchedulingPendingCounts()).resolves.toEqual({ toSchedule: 7, unrealized: 9 });

    expect(visitRequestsList).toHaveBeenCalledWith({ page: 1, limit: 1 });
    expect(visitRequestsList).toHaveBeenCalledWith({
      status: VisitRequestStatus.REQUIRES_RESCHEDULE,
      page: 1,
      limit: 1,
    });
    expect(eventsList).toHaveBeenCalledWith({
      status: ScheduleEventStatus.NO_SHOW,
      page: 1,
      limit: 1,
    });
    expect(eventsList).toHaveBeenCalledWith({
      status: ScheduleEventStatus.EXPIRED,
      page: 1,
      limit: 1,
    });
  });

  it('403 (técnico o contratista): sin conteo de solicitudes ni de sin realizar', async () => {
    visitRequestsList.mockRejectedValue(new ApiError(403, 'FORBIDDEN', 'Sin permiso'));

    await expect(loadSchedulingPendingCounts()).resolves.toEqual({
      toSchedule: null,
      unrealized: null,
    });
  });

  it('una fuente de sin realizar caída deja solo ese conteo vacío', async () => {
    eventsList.mockRejectedValue(new ApiError(500, 'ERROR', 'Falla'));

    await expect(loadSchedulingPendingCounts()).resolves.toEqual({
      toSchedule: 7,
      unrealized: null,
    });
  });

  it('el hook no consulta si no está habilitado', async () => {
    const { result } = renderHook(() => useSchedulingPendingCounts(false));
    expect(result.current).toEqual({ toSchedule: null, unrealized: null });
    expect(visitRequestsList).not.toHaveBeenCalled();
  });

  it('el hook entrega los conteos cuando está habilitado', async () => {
    const { result } = renderHook(() => useSchedulingPendingCounts(true));
    await waitFor(() => expect(result.current).toEqual({ toSchedule: 7, unrealized: 9 }));
  });

  it('nombre accesible con número y sin número', () => {
    expect(getPendingShortcutLabel('Pendientes', 3)).toBe('Pendientes: 3');
    expect(getPendingShortcutLabel('Visitas sin realizar', 0)).toBe('Visitas sin realizar: 0');
    expect(getPendingShortcutLabel('Pendientes', null)).toBe('Pendientes');
  });
});
