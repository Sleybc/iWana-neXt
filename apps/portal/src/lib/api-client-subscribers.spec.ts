import { SubscriberStatus } from '@iwana/shared';
import { subscribersApi } from './api-client';

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

const originalFetch = globalThis.fetch;

describe('subscribersApi.search', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    if (typeof originalFetch === 'function') {
      Reflect.set(globalThis, 'fetch', originalFetch);
    } else {
      Reflect.deleteProperty(globalThis, 'fetch');
    }
  });

  it('envía criterios personales en el cuerpo POST y no los incluye en la URL', async () => {
    const fetchMock = jest.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit): Promise<MockResponse> =>
        createJsonResponse(200, { data: [] }),
    );
    Reflect.set(globalThis, 'fetch', fetchMock);
    const criteria = {
      documentNumber: 'doc-test-001',
      email: 'persona@example.test',
      phone: '+570000000000',
    };

    await subscribersApi.search(criteria, 'tenant-demo');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [input, init] = fetchMock.mock.calls[0] ?? [];
    const url = new URL(String(input), 'http://portal.example.test');

    expect(url.pathname).toBe('/api/v1/crm/subscribers/search');
    expect(url.search).toBe('');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual(criteria);
  });

  it('envía la búsqueda libre de listados por POST y conserva filtros no personales en query', async () => {
    const fetchMock = jest.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit): Promise<MockResponse> =>
        createJsonResponse(200, {
          data: [],
          total: 0,
          meta: { page: 2, limit: 10, total: 0 },
        }),
    );
    Reflect.set(globalThis, 'fetch', fetchMock);

    await subscribersApi.list(
      {
        search: 'persona@example.test',
        status: SubscriberStatus.ACTIVE,
        page: 2,
        limit: 10,
        sortBy: 'createdAt',
        sortDir: 'asc',
      },
      'tenant-demo',
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [input, init] = fetchMock.mock.calls[0] ?? [];
    const url = new URL(String(input), 'http://portal.example.test');

    expect(url.pathname).toBe('/api/v1/crm/subscribers/search');
    expect(url.searchParams.get('search')).toBeNull();
    expect(url.searchParams.get('documentNumber')).toBeNull();
    expect(url.searchParams.get('nit')).toBeNull();
    expect(url.searchParams.get('email')).toBeNull();
    expect(url.searchParams.get('phone')).toBeNull();
    expect(url.searchParams.get('status')).toBe('ACTIVE');
    expect(url.searchParams.get('page')).toBe('2');
    expect(url.searchParams.get('limit')).toBe('10');
    expect(url.searchParams.get('sortBy')).toBe('createdAt');
    expect(url.searchParams.get('sortDir')).toBe('asc');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual({ search: 'persona@example.test' });
  });
});
