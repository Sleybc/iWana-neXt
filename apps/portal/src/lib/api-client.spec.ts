import { AccessPermissionCatalogVersion } from '@iwana/shared';

type MockResponse = {
  ok: boolean;
  status: number;
  headers: Headers;
  json: () => Promise<unknown>;
};

function createJsonResponse(status: number, body: unknown): MockResponse {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => body,
  };
}

describe('api-client auth refresh handling', () => {
  beforeEach(() => {
    jest.resetModules();
    window.localStorage.clear();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    window.localStorage.clear();
  });

  it('deduplicates refresh calls when multiple protected requests receive 401 at the same time', async () => {
    const fetchMock = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const authorization = new Headers(init?.headers).get('Authorization');

      if (url.endsWith('/auth/refresh')) {
        return createJsonResponse(200, {
          data: { accessToken: 'renewed-token' },
        });
      }

      if (url.endsWith('/access-control/permissions')) {
        if (authorization === 'Bearer expired-token') {
          return createJsonResponse(401, { message: 'Unauthorized' });
        }

        return createJsonResponse(200, {
          data: {
            version: AccessPermissionCatalogVersion.MOD00_ACCESS_V1,
            permissions: [],
            compatibilityMatrix: {},
          },
        });
      }

      if (url.endsWith('/access-control/profiles')) {
        if (authorization === 'Bearer expired-token') {
          return createJsonResponse(401, { message: 'Unauthorized' });
        }

        return createJsonResponse(200, { data: [] });
      }

      throw new Error(`Unexpected fetch call: ${url}`);
    });

    global.fetch = fetchMock as unknown as typeof fetch;

    const { accessControlApi, persistAccessToken } = await import('./api-client');
    persistAccessToken('expired-token');

    await Promise.all([
      accessControlApi.listPermissions('isp-demo'),
      accessControlApi.listProfiles('isp-demo'),
    ]);

    expect(
      fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/auth/refresh')),
    ).toHaveLength(1);
    expect(window.localStorage.getItem('iwana.portal.access-token')).toBe('renewed-token');
  });

  it('stops retrying refresh after a terminal session expiration until a new token is stored', async () => {
    const fetchMock = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const authorization = new Headers(init?.headers).get('Authorization');

      if (url.endsWith('/auth/refresh')) {
        return createJsonResponse(401, { message: 'Unauthorized' });
      }

      if (url.endsWith('/access-control/profiles') && authorization === 'Bearer expired-token') {
        return createJsonResponse(401, { message: 'Unauthorized' });
      }

      if (url.endsWith('/tenants/me/summary')) {
        return createJsonResponse(401, { message: 'Unauthorized' });
      }

      throw new Error(`Unexpected fetch call: ${url}`);
    });

    global.fetch = fetchMock as unknown as typeof fetch;

    const { accessControlApi, dashboardApi, persistAccessToken } = await import('./api-client');
    persistAccessToken('expired-token');

    await expect(accessControlApi.listProfiles('isp-demo')).rejects.toEqual(
      expect.objectContaining({
        status: 401,
        code: 'SESSION_EXPIRED',
      }),
    );

    await expect(dashboardApi.getSummary('isp-demo')).rejects.toEqual(
      expect.objectContaining({
        status: 401,
        code: 'SESSION_EXPIRED',
      }),
    );

    expect(
      fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/auth/refresh')),
    ).toHaveLength(1);
  });
});

describe('usersApi.bulkCreate', () => {
  beforeEach(() => {
    jest.resetModules();
    window.localStorage.clear();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    window.localStorage.clear();
  });

  it('acepta el lote async (202) con Idempotency-Key y sin secretos', async () => {
    const accepted = {
      jobId: 'job-abc',
      status: 'queued',
    };

    const fetchMock = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/users/bulk')) {
        expect(new Headers(init?.headers).get('Idempotency-Key')).toBe('idem-bulk-1');
        expect(init?.method).toBe('POST');
        return createJsonResponse(202, accepted);
      }
      throw new Error(`Unexpected fetch call: ${url}`);
    });

    global.fetch = fetchMock as unknown as typeof fetch;

    const { persistAccessToken, usersApi } = await import('./api-client');
    persistAccessToken('access-token');

    const response = await usersApi.bulkCreate(
      [{ email: 'nuevo@empresa.com', role: 'NOC' }],
      'idem-bulk-1',
      'isp-demo',
    );

    expect(response).toEqual(accepted);
    expect(response.jobId).toBe('job-abc');
  });

  it('consulta estado y reclama resultado one-time sin envelope', async () => {
    const statusBody = {
      jobId: 'job-abc',
      status: 'completed',
      summary: { total: 1, succeeded: 1, failed: 0 },
      failed: [],
      credentialsClaimed: false,
    };
    const claimBody = {
      ...statusBody,
      status: 'completed',
      succeeded: [
        {
          email: 'nuevo@empresa.com',
          firstName: 'Ada',
          lastName: 'Lovelace',
          role: 'NOC',
          temporaryPassword: 'Temp-1234!',
          createdAt: '2026-07-22T12:00:00.000Z',
        },
      ],
      credentialsClaimed: true,
    };

    const fetchMock = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/users/bulk/jobs/job-abc')) {
        return createJsonResponse(200, statusBody);
      }
      if (url.endsWith('/users/bulk/jobs/job-abc/result')) {
        expect(init?.method).toBe('POST');
        return createJsonResponse(200, claimBody);
      }
      throw new Error(`Unexpected fetch call: ${url}`);
    });

    global.fetch = fetchMock as unknown as typeof fetch;

    const { persistAccessToken, usersApi } = await import('./api-client');
    persistAccessToken('access-token');

    const status = await usersApi.getBulkJobStatus('job-abc', 'isp-demo');
    expect(status.credentialsClaimed).toBe(false);
    expect(status).not.toHaveProperty('succeeded');

    const claimed = await usersApi.claimBulkJobResult('job-abc', 'isp-demo');
    expect(claimed.succeeded[0]?.temporaryPassword).toBe('Temp-1234!');
    expect(claimed.credentialsClaimed).toBe(true);
  });
});
