/**
 * Cliente HTTP de la importación UISP (ADR-110; plan 2026-11-12 bloque F) y de los soportes
 * importados del suscriptor (D13).
 */
import { ApiError, migrationApi, subscriberDocumentsApi } from './api-client';

type FetchCall = [string, RequestInit];

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => body,
    blob: async () => new Blob(['x']),
  };
}

const originalFetch = globalThis.fetch;
let fetchMock: jest.Mock;

beforeEach(() => {
  fetchMock = jest.fn();
  Reflect.set(globalThis, 'fetch', fetchMock);
});

afterEach(() => {
  if (typeof originalFetch === 'function') Reflect.set(globalThis, 'fetch', originalFetch);
  else Reflect.deleteProperty(globalThis, 'fetch');
});

function lastCall(): FetchCall {
  return fetchMock.mock.calls.at(-1) as FetchCall;
}

const T = 'tenant-demo';
const BATCH_ID = '00000000-0000-4000-8000-0000000000b1';

describe('migrationApi', () => {
  it('createBatch envía multipart con cada ZIP en «files» y sin Content-Type manual', async () => {
    fetchMock.mockResolvedValue(jsonResponse(202, { data: { id: BATCH_ID } }));
    const files = [
      new File(['a'], 'cliente-1.zip', { type: 'application/zip' }),
      new File(['b'], 'cliente-2.zip', { type: 'application/zip' }),
    ];
    await expect(migrationApi.createBatch(files, T)).resolves.toEqual({ id: BATCH_ID });
    const [url, init] = lastCall();
    expect(url).toMatch(/\/migration\/batches$/);
    expect(init.method).toBe('POST');
    const body = init.body as FormData;
    expect(body.getAll('files')).toHaveLength(2);
    expect(new Headers(init.headers).has('Content-Type')).toBe(false);
    expect(new Headers(init.headers).get('X-Requested-With')).toBe('XMLHttpRequest');
  });

  it('listBatches pagina y devuelve data con meta', async () => {
    const payload = { data: [], meta: { total: 0, page: 2, limit: 10, totalPages: 0 } };
    fetchMock.mockResolvedValue(jsonResponse(200, payload));
    await expect(migrationApi.listBatches({ page: 2, limit: 10 }, T)).resolves.toEqual(payload);
    expect(lastCall()[0]).toMatch(/\/migration\/batches\?page=2&limit=10$/);
  });

  it('getBatch, pendingMappings, promote, reconcile y revert usan sus rutas', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { data: {} }));
    await migrationApi.getBatch(BATCH_ID, T);
    expect(lastCall()[0]).toMatch(new RegExp(`/migration/batches/${BATCH_ID}$`));
    await migrationApi.pendingMappings(BATCH_ID, T);
    expect(lastCall()[0]).toMatch(/\/pending-mappings$/);
    for (const action of ['promote', 'reconcile', 'revert'] as const) {
      await migrationApi[action](BATCH_ID, T);
      expect(lastCall()[0]).toMatch(new RegExp(`/${action}$`));
      expect(lastCall()[1].method).toBe('POST');
    }
  });

  it('revert bloqueado expone details.blockers en el ApiError', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(409, {
        code: 'MIGRATION_REVERT_BLOCKED',
        message: 'blocked',
        details: { blockers: [{ motivo: 'PAGO_POSTERIOR', cantidad: 2 }] },
      }),
    );
    const error = await migrationApi.revert(BATCH_ID, T).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe('MIGRATION_REVERT_BLOCKED');
    expect((error as ApiError).details).toEqual({
      blockers: [{ motivo: 'PAGO_POSTERIOR', cantidad: 2 }],
    });
  });

  it('CRUD de equivalencias', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { data: [] }));
    await migrationApi.listMappings('PLAN', T);
    expect(lastCall()[0]).toMatch(/\/migration\/mappings\?kind=PLAN$/);
    await migrationApi.createMapping(
      {
        kind: 'CICLO',
        externalValue: '5',
        action: 'EQUIVALE',
        targetRef: '5',
      },
      T,
    );
    expect(lastCall()[1].method).toBe('POST');
    expect(JSON.parse(lastCall()[1].body as string)).toMatchObject({ kind: 'CICLO' });
    await migrationApi.updateMapping('m-1', { action: 'DESCARTAR' }, T);
    expect(lastCall()[0]).toMatch(/\/migration\/mappings\/m-1$/);
    expect(lastCall()[1].method).toBe('PATCH');
    fetchMock.mockResolvedValue({ ...jsonResponse(204, null), headers: new Headers() });
    await migrationApi.removeMapping('m-1', T);
    expect(lastCall()[1].method).toBe('DELETE');
  });
});

describe('subscriberDocumentsApi', () => {
  const SUBSCRIBER_ID = '00000000-0000-4000-8000-0000000000a1';

  it('lista los soportes del suscriptor', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { data: { items: [] } }));
    await expect(subscriberDocumentsApi.list(SUBSCRIBER_ID, T)).resolves.toEqual({ items: [] });
    expect(lastCall()[0]).toMatch(new RegExp(`/crm/subscribers/${SUBSCRIBER_ID}/documents$`));
  });

  it('descarga el soporte como blob', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, null));
    const blob = await subscriberDocumentsApi.download(SUBSCRIBER_ID, 'doc-1', T);
    expect(blob).toBeInstanceOf(Blob);
    expect(lastCall()[0]).toMatch(/\/documents\/doc-1\/download$/);
  });
});
