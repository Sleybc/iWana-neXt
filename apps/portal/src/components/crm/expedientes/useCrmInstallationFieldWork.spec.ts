import { act, renderHook, waitFor } from '@testing-library/react';
import {
  resolveCrmInstallationFieldWork,
  type CrmInstallationFieldWork,
} from '@/components/scheduling/visit-request-origin-orchestration';
import { useCrmInstallationFieldWork } from './useCrmInstallationFieldWork';
import { clearExpedienteDetailCache } from './expediente-detail-cache';

jest.mock('@/components/scheduling/visit-request-origin-orchestration', () => ({
  resolveCrmInstallationFieldWork: jest.fn(),
}));

const resolveCrmInstallationFieldWorkMock = jest.mocked(resolveCrmInstallationFieldWork);

const emptyFieldWork: CrmInstallationFieldWork = {
  kind: 'none',
  visitRequestId: null,
  scheduleEventId: null,
  activeEventStatus: null,
  scheduledStartAt: null,
  assignedUserId: null,
  href: null,
};

describe('useCrmInstallationFieldWork', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearExpedienteDetailCache();
    resolveCrmInstallationFieldWorkMock.mockResolvedValue(emptyFieldWork);
  });

  it('no consulta WFM en el primer render y deduplica la carga bajo demanda', async () => {
    const { result } = renderHook(() => useCrmInstallationFieldWork('exp-1', false, 'tenant-a'));

    expect(resolveCrmInstallationFieldWorkMock).not.toHaveBeenCalled();

    await act(async () => {
      await result.current.load();
      await result.current.load();
    });

    expect(resolveCrmInstallationFieldWorkMock).toHaveBeenCalledTimes(1);
    expect(result.current.fieldWork).toEqual(emptyFieldWork);
  });

  it('permite reintentar después de un rechazo y no conserva el fallo en cache', async () => {
    resolveCrmInstallationFieldWorkMock
      .mockRejectedValueOnce(new Error('fallo transitorio'))
      .mockResolvedValueOnce({ ...emptyFieldWork, kind: 'scheduled', href: '/agenda/visit-1' });
    const { result } = renderHook(() =>
      useCrmInstallationFieldWork('exp-retry', false, 'tenant-a'),
    );

    await act(async () => {
      await expect(result.current.load()).rejects.toThrow('fallo transitorio');
    });
    expect(result.current.error).toBe(
      'No fue posible consultar el estado de la visita de instalación.',
    );

    await act(async () => {
      await result.current.load();
    });

    expect(resolveCrmInstallationFieldWorkMock).toHaveBeenCalledTimes(2);
    expect(result.current.fieldWork.kind).toBe('scheduled');
    expect(result.current.error).toBeNull();
  });

  it('ignora la respuesta de un expediente anterior cuando cambia el id', async () => {
    let resolveFirst: ((value: CrmInstallationFieldWork) => void) | undefined;
    let resolveSecond: ((value: CrmInstallationFieldWork) => void) | undefined;
    resolveCrmInstallationFieldWorkMock.mockImplementation((id: string) => {
      return new Promise<CrmInstallationFieldWork>((resolve) => {
        if (id === 'exp-old') {
          resolveFirst = resolve;
        } else {
          resolveSecond = resolve;
        }
      });
    });

    const { result, rerender } = renderHook(
      ({ id }) => useCrmInstallationFieldWork(id, false, 'tenant-a'),
      { initialProps: { id: 'exp-old' } },
    );
    let oldRequest: Promise<CrmInstallationFieldWork> | undefined;
    await act(async () => {
      oldRequest = result.current.load();
    });

    rerender({ id: 'exp-new' });
    let newRequest: Promise<CrmInstallationFieldWork> | undefined;
    await act(async () => {
      newRequest = result.current.load();
    });

    resolveFirst?.({ ...emptyFieldWork, kind: 'scheduled', href: '/agenda/old' });
    await act(async () => {
      await oldRequest;
    });
    expect(result.current.fieldWork).toEqual(emptyFieldWork);

    resolveSecond?.({ ...emptyFieldWork, kind: 'in_progress', href: '/agenda/new' });
    await act(async () => {
      await newRequest;
    });
    await waitFor(() => expect(result.current.fieldWork.kind).toBe('in_progress'));
  });

  it('permite retry force y conserva solo la respuesta más reciente del mismo expediente', async () => {
    let resolveOld: ((value: CrmInstallationFieldWork) => void) | undefined;
    let resolveNew: ((value: CrmInstallationFieldWork) => void) | undefined;
    resolveCrmInstallationFieldWorkMock
      .mockImplementationOnce(
        () =>
          new Promise<CrmInstallationFieldWork>((resolve) => {
            resolveOld = resolve;
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise<CrmInstallationFieldWork>((resolve) => {
            resolveNew = resolve;
          }),
      );

    const { result } = renderHook(() => useCrmInstallationFieldWork('exp-same', false, 'tenant-a'));
    let oldRequest: Promise<CrmInstallationFieldWork> | undefined;
    let newRequest: Promise<CrmInstallationFieldWork> | undefined;
    await act(async () => {
      oldRequest = result.current.load();
      newRequest = result.current.load(true);
    });

    resolveOld?.({ ...emptyFieldWork, kind: 'scheduled', href: '/agenda/old' });
    await act(async () => {
      await oldRequest;
    });
    expect(result.current.fieldWork).toEqual(emptyFieldWork);

    resolveNew?.({ ...emptyFieldWork, kind: 'in_progress', href: '/agenda/new' });
    await act(async () => {
      await newRequest;
    });
    expect(result.current.fieldWork.kind).toBe('in_progress');
    expect(result.current.fieldWork.href).toBe('/agenda/new');
  });
});
