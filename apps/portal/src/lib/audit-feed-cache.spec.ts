import {
  AUDIT_FEED_LIMIT,
  __resetAuditFeedCacheForTests,
  getAuditFeedSnapshot,
  loadAuditFeed,
  subscribeAuditFeed,
} from './audit-feed-cache';

const auditList = jest.fn();

jest.mock('@/lib/api-client', () => {
  class MockApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      Object.setPrototypeOf(this, MockApiError.prototype);
      this.name = 'ApiError';
      this.status = status;
    }
  }

  return {
    ApiError: MockApiError,
    auditApi: {
      list: (...args: unknown[]) => auditList(...args),
    },
  };
});

describe('audit-feed-cache', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    __resetAuditFeedCacheForTests();
    auditList.mockResolvedValue([{ id: 'a-1', action: 'UPDATE', entityType: 'User' }]);
  });

  it('deduplica lecturas concurrentes en una sola petición', async () => {
    let resolveList: (value: unknown[]) => void = () => undefined;
    auditList.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveList = resolve;
        }),
    );

    const first = loadAuditFeed({ slug: 'demo-isp' });
    const second = loadAuditFeed({ slug: 'demo-isp', force: true });
    expect(auditList).toHaveBeenCalledTimes(1);
    expect(auditList).toHaveBeenCalledWith({ limit: AUDIT_FEED_LIMIT }, 'demo-isp');

    resolveList([{ id: 'a-1', action: 'UPDATE', entityType: 'User' }]);
    await expect(first).resolves.toHaveLength(1);
    await expect(second).resolves.toHaveLength(1);
    expect(auditList).toHaveBeenCalledTimes(1);
  });

  it('reutiliza el snapshot en la misma carga si no hay force', async () => {
    await loadAuditFeed({ slug: 'demo-isp' });
    await loadAuditFeed({ slug: 'demo-isp' });
    expect(auditList).toHaveBeenCalledTimes(1);
    expect(getAuditFeedSnapshot()?.entries).toHaveLength(1);
  });

  it('notifica a suscriptores y no expone el enum en el snapshot de error 403', async () => {
    const seen: Array<string | null> = [];
    const unsubscribe = subscribeAuditFeed((next) => {
      seen.push(next?.error ?? null);
    });
    const { ApiError } = jest.requireMock('@/lib/api-client') as {
      ApiError: new (status: number, message: string) => Error;
    };
    auditList.mockRejectedValue(new ApiError(403, 'FORBIDDEN'));

    await expect(loadAuditFeed({ force: true })).rejects.toBeInstanceOf(Error);
    expect(getAuditFeedSnapshot()?.error).toBe('Sin permisos para ver el historial de cambios.');
    expect(seen.some((message) => message?.includes('historial'))).toBe(true);
    unsubscribe();
  });
});
