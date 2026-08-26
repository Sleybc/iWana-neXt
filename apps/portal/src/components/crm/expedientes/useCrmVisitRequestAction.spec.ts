import { act, renderHook } from '@testing-library/react';
import { createCrmVisitRequestAndRoute } from '@/components/scheduling/visit-request-origin-orchestration';
import { useCrmVisitRequestAction } from './useCrmVisitRequestAction';
import { invalidateExpedienteFieldWorkCache } from './expediente-detail-cache';

const pushMock = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}));

jest.mock('@/components/scheduling/visit-request-origin-orchestration', () => ({
  createCrmVisitRequestAndRoute: jest.fn(),
}));

jest.mock('./expediente-detail-cache', () => ({
  invalidateExpedienteFieldWorkCache: jest.fn(),
  resolveExpedienteCacheScope: jest.fn(() => 'tenant-id:tenant-1'),
}));

const createVisitRequestMock = jest.mocked(createCrmVisitRequestAndRoute);
const invalidateFieldWorkCacheMock = jest.mocked(invalidateExpedienteFieldWorkCache);

describe('useCrmVisitRequestAction', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    createVisitRequestMock.mockResolvedValue({ href: '/agenda/visit-1' } as never);
  });

  it('no expone el mensaje técnico de WFM ante un error inesperado', async () => {
    createVisitRequestMock.mockRejectedValue(new Error('stack interno del backend'));
    const { result } = renderHook(() => useCrmVisitRequestAction());

    await act(async () => {
      await result.current.submit(
        { expedienteId: 'exp-1', customerLabel: 'Cliente de prueba' },
        'schedule-now',
      );
    });

    expect(result.current.error).toBe(
      'No fue posible coordinar la visita de instalación. Intenta de nuevo.',
    );
    expect(result.current.error).not.toContain('stack interno del backend');
  });

  it('invalida el cache WFM después de crear o reutilizar una solicitud', async () => {
    const { result } = renderHook(() => useCrmVisitRequestAction());

    await act(async () => {
      await result.current.submit(
        {
          expedienteId: 'exp-1',
          tenantScope: 'tenant-id:tenant-1',
          customerLabel: 'Cliente de prueba',
        },
        'schedule-now',
      );
    });

    expect(invalidateFieldWorkCacheMock).toHaveBeenCalledWith('tenant-id:tenant-1', 'exp-1');
    expect(pushMock).toHaveBeenCalledWith('/agenda/visit-1');
  });
});
