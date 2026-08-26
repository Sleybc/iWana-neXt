import {
  clearExpedienteDetailCache,
  getCachedExpedienteResource,
  getCachedExpedienteTimelinePage,
  invalidateExpedienteFieldWorkCache,
  invalidateExpedienteTimelineCache,
} from './expediente-detail-cache';
import type { ExpedienteTimelinePageResponse } from '@/lib/api-client';
import { TENANT_SCOPE_CHANGED_STORAGE_KEY } from '@/lib/tenant-resolution';

describe('expediente-detail-cache', () => {
  beforeEach(() => {
    clearExpedienteDetailCache();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('no mezcla el mismo identificador entre scopes de tenant', async () => {
    const load = jest
      .fn()
      .mockResolvedValueOnce('valor-empresa-a')
      .mockResolvedValueOnce('valor-empresa-b');

    await expect(getCachedExpedienteResource('tenant-id:a', 'exp-1', load)).resolves.toBe(
      'valor-empresa-a',
    );
    await expect(getCachedExpedienteResource('tenant-id:b', 'exp-1', load)).resolves.toBe(
      'valor-empresa-b',
    );
    await expect(getCachedExpedienteResource('tenant-id:a', 'exp-1', load)).resolves.toBe(
      'valor-empresa-a',
    );

    expect(load).toHaveBeenCalledTimes(2);
  });

  it('deduplica solicitudes, expira por TTL y permite invalidación', async () => {
    let resolveRequest: ((value: string) => void) | undefined;
    const load = jest.fn(
      () =>
        new Promise<string>((resolve) => {
          resolveRequest = resolve;
        }),
    );

    const first = getCachedExpedienteResource('tenant-id:a', 'catalog:plan-1', load);
    const second = getCachedExpedienteResource('tenant-id:a', 'catalog:plan-1', load);
    expect(load).toHaveBeenCalledTimes(1);
    resolveRequest?.('plan');
    await expect(first).resolves.toBe('plan');
    await expect(second).resolves.toBe('plan');

    jest.advanceTimersByTime(5 * 60 * 1000 + 1);
    await expect(
      getCachedExpedienteResource('tenant-id:a', 'catalog:plan-1', async () => 'plan-renovado'),
    ).resolves.toBe('plan-renovado');

    clearExpedienteDetailCache();
    await expect(
      getCachedExpedienteResource('tenant-id:a', 'catalog:plan-1', async () => 'plan-limpio'),
    ).resolves.toBe('plan-limpio');
  });

  it('no permite que una carga force antigua sobrescriba la respuesta nueva', async () => {
    let resolveOld: ((value: string) => void) | undefined;
    let resolveNew: ((value: string) => void) | undefined;
    const load = jest
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<string>((resolve) => {
            resolveOld = resolve;
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise<string>((resolve) => {
            resolveNew = resolve;
          }),
      );

    const oldRequest = getCachedExpedienteResource('tenant-id:a', 'resource-1', load);
    const newRequest = getCachedExpedienteResource('tenant-id:a', 'resource-1', load, true);
    resolveOld?.('respuesta-vieja');
    resolveNew?.('respuesta-nueva');

    await expect(oldRequest).resolves.toBe('respuesta-vieja');
    await expect(newRequest).resolves.toBe('respuesta-nueva');
    await expect(
      getCachedExpedienteResource('tenant-id:a', 'resource-1', async () => 'inesperada'),
    ).resolves.toBe('respuesta-nueva');
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('invalida el cache cuando otro tab comunica un cambio de scope', async () => {
    const load = jest
      .fn()
      .mockResolvedValueOnce('valor-antes')
      .mockResolvedValueOnce('valor-despues');

    await expect(getCachedExpedienteResource('tenant-id:a', 'resource-1', load)).resolves.toBe(
      'valor-antes',
    );
    window.dispatchEvent(
      new StorageEvent('storage', {
        key: TENANT_SCOPE_CHANGED_STORAGE_KEY,
        newValue: 'change-2',
      }),
    );

    await expect(getCachedExpedienteResource('tenant-id:a', 'resource-1', load)).resolves.toBe(
      'valor-despues',
    );
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('invalida solo el estado WFM del expediente y tenant indicado', async () => {
    const load = jest.fn().mockResolvedValueOnce('antes').mockResolvedValueOnce('después');

    await expect(
      getCachedExpedienteResource('tenant-id:a', 'field-work:exp-1', load),
    ).resolves.toBe('antes');
    invalidateExpedienteFieldWorkCache('tenant-id:a', 'exp-1');

    await expect(
      getCachedExpedienteResource('tenant-id:a', 'field-work:exp-1', load),
    ).resolves.toBe('después');
    await expect(
      getCachedExpedienteResource('tenant-id:b', 'field-work:exp-1', async () => 'otro-tenant'),
    ).resolves.toBe('otro-tenant');
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('no recachea una respuesta pendiente antigua después de invalidar el timeline', async () => {
    let resolveOld: ((value: ExpedienteTimelinePageResponse) => void) | undefined;
    const oldResponse = {
      data: {
        events: [],
        metadata: {
          createdBy: { userId: null, name: null, role: null },
          lastEditedBy: { userId: null, name: null, role: null },
          lastActivityAt: null,
        },
      },
      meta: { page: 1, limit: 5, total: 1, totalPages: 1, truncated: false, hasMore: false },
    } satisfies ExpedienteTimelinePageResponse;
    const freshResponse = { ...oldResponse, meta: { ...oldResponse.meta, total: 2 } };

    const oldRequest = getCachedExpedienteTimelinePage(
      'tenant-id:a',
      'exp-1',
      1,
      5,
      'all',
      () =>
        new Promise<ExpedienteTimelinePageResponse>((resolve) => {
          resolveOld = resolve;
        }),
    );

    invalidateExpedienteTimelineCache('tenant-id:a', 'exp-1');
    resolveOld?.(oldResponse);
    await expect(oldRequest).resolves.toBe(oldResponse);

    await expect(
      getCachedExpedienteTimelinePage(
        'tenant-id:a',
        'exp-1',
        1,
        5,
        'all',
        async () => freshResponse,
      ),
    ).resolves.toBe(freshResponse);
  });

  it('conserva catálogos al invalidar solo el timeline del expediente', async () => {
    const catalogLoader = jest.fn().mockResolvedValue('plan-cacheado');
    const timelineLoader = jest.fn().mockResolvedValue('timeline-cacheado');

    await getCachedExpedienteResource('tenant-id:a', 'catalog:plan-1', catalogLoader);
    await getCachedExpedienteResource('tenant-id:a', 'timeline-page:exp-1:1:5:all', timelineLoader);

    invalidateExpedienteTimelineCache('tenant-id:a', 'exp-1');

    await expect(
      getCachedExpedienteResource('tenant-id:a', 'catalog:plan-1', catalogLoader),
    ).resolves.toBe('plan-cacheado');
    expect(catalogLoader).toHaveBeenCalledTimes(1);
    expect(timelineLoader).toHaveBeenCalledTimes(1);
  });
});
