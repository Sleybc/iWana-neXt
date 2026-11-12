import { SubscriberStatus } from '@iwana/shared';
import { subscriberTagsApi, subscribersApi } from './api-client';

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

  it('envía los filtros de las colas como parámetros no personales', async () => {
    const fetchMock = jest.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit): Promise<MockResponse> =>
        createJsonResponse(200, { data: [], total: 0 }),
    );
    Reflect.set(globalThis, 'fetch', fetchMock);

    await subscribersApi.list(
      {
        contactPending: true,
        fiscalIncomplete: true,
        withoutLiveServices: true,
      },
      'tenant-demo',
    );

    const [input] = fetchMock.mock.calls[0] ?? [];
    const url = new URL(String(input), 'http://portal.example.test');
    expect(url.pathname).toBe('/api/v1/crm/subscribers');
    expect(url.searchParams.get('contactPending')).toBe('true');
    expect(url.searchParams.get('fiscalIncomplete')).toBe('true');
    expect(url.searchParams.get('withoutLiveServices')).toBe('true');
  });

  it('lee conteos globales sin incluirlos en la URL de la lista', async () => {
    const counts = {
      active: 8,
      suspended: 2,
      contactPending: 1,
      fiscalIncomplete: 3,
      withoutLiveServices: 4,
    };
    const fetchMock = jest.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit): Promise<MockResponse> =>
        createJsonResponse(200, { data: counts }),
    );
    Reflect.set(globalThis, 'fetch', fetchMock);

    await expect(subscribersApi.queueCounts('tenant-demo')).resolves.toEqual(counts);

    const [input] = fetchMock.mock.calls[0] ?? [];
    const url = new URL(String(input), 'http://portal.example.test');
    expect(url.pathname).toBe('/api/v1/crm/subscribers/queue-counts');
    expect(url.search).toBe('');
  });
});

describe('etiquetas del suscriptor (ADR-110 D8)', () => {
  const TAG_ID = '00000000-0000-4000-8000-000000000001';
  const SUBSCRIBER_ID = '00000000-0000-4000-8000-0000000000aa';

  afterEach(() => {
    jest.restoreAllMocks();
    if (typeof originalFetch === 'function') {
      Reflect.set(globalThis, 'fetch', originalFetch);
    } else {
      Reflect.deleteProperty(globalThis, 'fetch');
    }
  });

  function mockFetch(body: unknown) {
    const fetchMock = jest.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit): Promise<MockResponse> =>
        createJsonResponse(200, body),
    );
    Reflect.set(globalThis, 'fetch', fetchMock);
    return fetchMock;
  }

  it('envía tagId en la URL de la lista y de la búsqueda', async () => {
    const fetchMock = mockFetch({ data: [] });
    await subscribersApi.list({ tagId: TAG_ID, page: 1, limit: 20 }, 'tenant-demo');
    await subscribersApi.list({ tagId: TAG_ID, search: 'Ana' }, 'tenant-demo');

    const [listUrl, searchUrl] = fetchMock.mock.calls.map(
      ([input]) => new URL(String(input), 'http://portal.example.test'),
    );
    expect(listUrl?.pathname).toBe('/api/v1/crm/subscribers');
    expect(listUrl?.searchParams.get('tagId')).toBe(TAG_ID);
    expect(searchUrl?.pathname).toBe('/api/v1/crm/subscribers/search');
    expect(searchUrl?.searchParams.get('tagId')).toBe(TAG_ID);
  });

  it('asigna con PUT y devuelve las etiquetas vigentes', async () => {
    const chips = [{ id: TAG_ID, name: 'VIP', color: '#2563EB' }];
    const fetchMock = mockFetch({ data: chips });
    await expect(subscriberTagsApi.assign(SUBSCRIBER_ID, TAG_ID, 'tenant-demo')).resolves.toEqual(
      chips,
    );
    const [input, init] = fetchMock.mock.calls[0] ?? [];
    expect(new URL(String(input), 'http://portal.example.test').pathname).toBe(
      `/api/v1/crm/subscribers/${SUBSCRIBER_ID}/tags/${TAG_ID}`,
    );
    expect(init?.method).toBe('PUT');
  });
});
