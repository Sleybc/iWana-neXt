import {
  AccessPermissionCatalogVersion,
  ExecutionOrderItemAction,
  ExecutionOrderResult,
  InventoryDisposition,
} from '@iwana/shared';

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
    const receivedAuthorizations: Array<string | null> = [];
    const protectedAttempts = new Map<string, number>();
    const fetchMock = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const authorization = new Headers(init?.headers).get('Authorization');
      receivedAuthorizations.push(authorization);

      if (url.endsWith('/auth/refresh')) {
        return createJsonResponse(200, {
          data: { accessToken: 'renewed-token' },
        });
      }

      if (url.endsWith('/access-control/permissions')) {
        const attempts = (protectedAttempts.get(url) ?? 0) + 1;
        protectedAttempts.set(url, attempts);
        if (attempts === 1) {
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
        const attempts = (protectedAttempts.get(url) ?? 0) + 1;
        protectedAttempts.set(url, attempts);
        if (attempts === 1) {
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
    // La cookie httpOnly es la credencial canónica: ningún request ordinario
    // debe reutilizar el Bearer en memoria, aunque este sea obsoleto.
    expect(receivedAuthorizations.every((authorization) => authorization === null)).toBe(true);
  });

  it('stops retrying refresh after a terminal session expiration until a new token is stored', async () => {
    const fetchMock = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url.endsWith('/auth/refresh')) {
        return createJsonResponse(401, { message: 'Unauthorized' });
      }

      if (url.endsWith('/access-control/profiles')) {
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

describe('crmApi.getExpedienteTimelinePage', () => {
  beforeEach(() => {
    jest.resetModules();
    window.localStorage.clear();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    window.localStorage.clear();
  });

  it('envía la paginación y el filtro al endpoint unificado y conserva el envelope', async () => {
    const responseBody = {
      data: {
        events: [
          {
            kind: 'contact' as const,
            id: 'contact-1',
            attemptedAt: '2026-08-24T10:00:00.000Z',
            channel: 'TELEFONO',
            result: 'EXITOSO',
            durationMinutes: 4,
            notes: null,
            actor: { userId: 'user-1', name: 'Laura Comercial', role: 'SALES' },
          },
        ],
        metadata: {
          createdBy: { userId: 'user-1', name: 'Laura Comercial', role: 'SALES' },
          lastEditedBy: { userId: 'user-1', name: 'Laura Comercial', role: 'SALES' },
          lastActivityAt: '2026-08-24T10:00:00.000Z',
        },
      },
      meta: {
        page: 2,
        limit: 10,
        total: 11,
        totalPages: 2,
        truncated: false,
        hasMore: false,
      },
    };
    const fetchMock = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe(
        '/api/v1/crm/expedientes/exp-1/timeline?page=2&limit=10&filter=contact',
      );
      expect(new Headers(init?.headers).get('X-Tenant-Slug')).toBe('tenant-a');
      return createJsonResponse(200, responseBody);
    });

    global.fetch = fetchMock as unknown as typeof fetch;

    const { crmApi } = await import('./api-client');
    const response = await crmApi.getExpedienteTimelinePage(
      'exp-1',
      { page: 2, limit: 10, filter: 'contact' },
      'tenant-a',
    );

    expect(response).toEqual(responseBody);
    expect(response.data.events[0]?.kind).toBe('contact');
    expect(response.meta).toEqual({
      page: 2,
      limit: 10,
      total: 11,
      totalPages: 2,
      truncated: false,
      hasMore: false,
    });
  });
});

describe('usersApi.list', () => {
  beforeEach(() => {
    jest.resetModules();
    window.localStorage.clear();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    window.localStorage.clear();
  });

  it('normaliza la respuesta canónica y conserva la metadata completa', async () => {
    const rows = [{ id: 'user-1' }];
    const meta = {
      nextCursor: 'cursor-2',
      total: 3,
      totalIsEstimate: false,
      page: null,
      limit: 17,
      totalPages: null,
      hasMore: true,
      mode: 'cursor' as const,
      capabilities: { randomAccess: false, sortableFields: [] },
      sort: null,
    };
    const fetchMock = jest.fn(async () => createJsonResponse(200, { data: { data: rows, meta } }));
    global.fetch = fetchMock as unknown as typeof fetch;

    const { usersApi } = await import('./api-client');
    const response = await usersApi.list({ limit: 17 }, 'isp-demo');

    expect(response).toEqual({ data: rows, meta });
    expect(response.meta.capabilities.randomAccess).toBe(false);
    expect(response.meta.mode).toBe('cursor');
    expect(response.meta.limit).toBe(17);
  });

  it('normaliza la metadata legacy del listado cursor-based', async () => {
    const fetchMock = jest.fn(async () =>
      createJsonResponse(200, {
        data: { data: [], meta: { nextCursor: 'cursor-legacy', total: 5 } },
      }),
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    const { usersApi } = await import('./api-client');
    const response = await usersApi.list({ limit: 17 }, 'isp-demo');

    expect(response.data).toEqual([]);
    expect(response.meta).toEqual({
      nextCursor: 'cursor-legacy',
      total: 5,
      totalIsEstimate: false,
      page: null,
      limit: 17,
      totalPages: null,
      hasMore: true,
      mode: 'cursor',
      capabilities: { randomAccess: false, sortableFields: [] },
      sort: null,
    });
    expect(response.meta.capabilities.randomAccess).toBe(false);
    expect(response.meta.mode).toBe('cursor');
    expect(response.meta.limit).toBe(17);
  });

  it.each([
    ['respuesta sin datos ni metadata', {}],
    ['metadata nula', { data: [], meta: null }],
  ])('devuelve una lista vacía cuando llega %s', async (_label, payload) => {
    const fetchMock = jest.fn(async () => createJsonResponse(200, { data: payload }));
    global.fetch = fetchMock as unknown as typeof fetch;

    const { usersApi } = await import('./api-client');
    const response = await usersApi.list({ limit: 17 }, 'isp-demo');

    expect(response.data).toEqual([]);
    expect(response.meta).toEqual({
      nextCursor: null,
      total: 0,
      totalIsEstimate: false,
      page: null,
      limit: 17,
      totalPages: null,
      hasMore: false,
      mode: 'cursor',
      capabilities: { randomAccess: false, sortableFields: [] },
      sort: null,
    });
    expect(response.meta.capabilities.randomAccess).toBe(false);
    expect(response.meta.mode).toBe('cursor');
    expect(response.meta.limit).toBe(17);
  });
});

describe('tasksApi execution order payloads', () => {
  beforeEach(() => {
    jest.resetModules();
    window.localStorage.clear();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    Reflect.deleteProperty(globalThis.crypto, 'randomUUID');
    window.localStorage.clear();
  });

  it('envía las formas exactas del contrato y autoriza multipart', async () => {
    const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
    const evidenceExpiresAt = '2026-08-01T00:00:00.000Z';
    const fetchMock = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, init });
      if (url.endsWith('/evidence-assets')) {
        return createJsonResponse(202, {
          intentId: 'intent-001',
          mediaAssetId: 'asset-001',
          status: 'PENDING_ANALYSIS',
          expiresAt: evidenceExpiresAt,
        });
      }
      return createJsonResponse(200, { id: 'receipt-001' });
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const { persistAccessToken, tasksApi } = await import('./api-client');
    Object.defineProperty(globalThis.crypto, 'randomUUID', {
      configurable: true,
      value: jest
        .fn()
        .mockReturnValueOnce('command-start-key')
        .mockReturnValueOnce('command-field-work-key')
        .mockReturnValueOnce('command-item-usage-key')
        .mockReturnValueOnce('command-upload-evidence-key')
        .mockReturnValueOnce('command-register-evidence-key')
        .mockReturnValueOnce('command-close-key'),
    });
    const storageSetItem = jest.spyOn(Storage.prototype, 'setItem');
    persistAccessToken('portal-token');
    const writesAfterAuth = storageSetItem.mock.calls.length;

    await tasksApi.executionOrders.start('eo-001', { note: 'Inicio en campo' }, 3, 'isp-demo');
    await tasksApi.executionOrders.registerFieldWork(
      'eo-001',
      { activityType: 'INSTALLATION', description: 'ONU instalada' },
      4,
      'isp-demo',
    );
    await tasksApi.executionOrders.registerItemUsage(
      'eo-001',
      {
        itemId: 'item-001',
        technicianCustodyId: 'tech-001',
        quantity: 1,
        serialNumber: 'ONT-001',
        action: ExecutionOrderItemAction.INSTALL,
        finalDisposition: InventoryDisposition.INSTALLED_AT_CUSTOMER,
      },
      5,
      'isp-demo',
    );
    const file = new File(['foto'], 'instalacion.jpg', { type: 'image/jpeg' });
    await tasksApi.executionOrders.uploadEvidenceAsset('eo-001', file, 6, 'isp-demo');
    await tasksApi.executionOrders.registerEvidence(
      'eo-001',
      {
        mediaAssetId: 'asset-001',
        evidenceType: 'PHOTO',
        requirementKey: 'req-photo-install',
        expiresAt: evidenceExpiresAt,
      },
      7,
      'isp-demo',
    );
    await tasksApi.executionOrders.close(
      'eo-001',
      {
        result: ExecutionOrderResult.EXECUTED,
        summary: 'Trabajo completado',
        customerAcceptance: { artifactId: 'firma-001', method: 'SIGNATURE' },
      },
      8,
      'isp-demo',
    );

    const commandHeaders = (index: number) => {
      const headers = new Headers(calls[index]?.init?.headers);
      return {
        'Idempotency-Key': headers.get('Idempotency-Key'),
        'If-Match': headers.get('If-Match'),
      };
    };

    expect(commandHeaders(0)).toEqual({
      'Idempotency-Key': 'command-start-key',
      'If-Match': '3',
    });
    expect(commandHeaders(1)).toEqual({
      'Idempotency-Key': 'command-field-work-key',
      'If-Match': '4',
    });
    expect(commandHeaders(2)).toEqual({
      'Idempotency-Key': 'command-item-usage-key',
      'If-Match': '5',
    });
    expect(commandHeaders(3)).toEqual({
      'Idempotency-Key': 'command-upload-evidence-key',
      'If-Match': '6',
    });
    expect(commandHeaders(4)).toEqual({
      'Idempotency-Key': 'command-register-evidence-key',
      'If-Match': '7',
    });
    expect(commandHeaders(5)).toEqual({
      'Idempotency-Key': 'command-close-key',
      'If-Match': '8',
    });
    expect(
      new Set([0, 1, 2, 3, 4, 5].map(commandHeaders).map((headers) => headers['Idempotency-Key']))
        .size,
    ).toBe(6);
    expect(storageSetItem.mock.calls.length).toBe(writesAfterAuth);

    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({ note: 'Inicio en campo' });
    expect(JSON.parse(String(calls[1]?.init?.body))).toEqual({
      activityType: 'INSTALLATION',
      description: 'ONU instalada',
    });
    expect(JSON.parse(String(calls[2]?.init?.body))).toEqual({
      itemId: 'item-001',
      technicianCustodyId: 'tech-001',
      quantity: 1,
      serialNumber: 'ONT-001',
      action: 'INSTALL',
      finalDisposition: 'INSTALLED_AT_CUSTOMER',
    });
    expect(calls[3]?.init?.body).toBeInstanceOf(FormData);
    expect(new Headers(calls[3]?.init?.headers).get('If-Match')).toBe('6');
    expect(new Headers(calls[3]?.init?.headers).get('Authorization')).toBeNull();
    expect(JSON.parse(String(calls[4]?.init?.body))).toEqual({
      mediaAssetId: 'asset-001',
      evidenceType: 'PHOTO',
      requirementKey: 'req-photo-install',
      expiresAt: evidenceExpiresAt,
    });
    expect(new Headers(calls[4]?.init?.headers).get('If-Match')).toBe('7');
    expect(JSON.parse(String(calls[5]?.init?.body))).toEqual({
      result: 'EXECUTED',
      summary: 'Trabajo completado',
      customerAcceptance: { artifactId: 'firma-001', method: 'SIGNATURE' },
    });
  });

  it('no envía el comando de evidencia cuando falta el requisito de plantilla', async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    const { tasksApi } = await import('./api-client');

    expect(() =>
      tasksApi.executionOrders.registerEvidence(
        'eo-001',
        {
          mediaAssetId: 'asset-001',
          evidenceType: 'PHOTO',
          requirementKey: '  ',
          expiresAt: '2026-08-01T00:00:00.000Z',
        },
        3,
        'isp-demo',
      ),
    ).toThrow('La evidencia requiere un requisito válido de la plantilla.');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
