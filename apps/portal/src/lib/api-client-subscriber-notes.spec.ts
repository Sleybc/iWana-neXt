import { subscribersApi } from './api-client';

/** Cliente de notas y del historial de ciclo de vida (MOD05 ficha UISP, bloque D). */
type MockResponse = {
  ok: boolean;
  status: number;
  headers: Headers;
  json: () => Promise<unknown>;
};

function jsonResponse(status: number, body: unknown): MockResponse {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => body,
  };
}

const SUBSCRIBER_ID = '00000000-0000-4000-8000-000000000001';
const META = { page: 1, limit: 20, hasMore: false, totalPages: 1 };
const originalFetch = globalThis.fetch;

function mockFetch(status: number, body: unknown) {
  const fetchMock = jest.fn(
    async (_input: RequestInfo | URL, _init?: RequestInit): Promise<MockResponse> =>
      jsonResponse(status, body),
  );
  Reflect.set(globalThis, 'fetch', fetchMock);
  return fetchMock;
}

function calledUrl(fetchMock: jest.Mock): URL {
  const [input] = fetchMock.mock.calls[0] ?? [];
  return new URL(String(input), 'http://portal.example.test');
}

describe('subscribersApi — notas y ciclo de vida', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    if (typeof originalFetch === 'function') Reflect.set(globalThis, 'fetch', originalFetch);
    else Reflect.deleteProperty(globalThis, 'fetch');
  });

  it('lista notas con página y límite y conserva el sobre completo', async () => {
    const fetchMock = mockFetch(200, { data: [], meta: META });
    const response = await subscribersApi.listNotes(SUBSCRIBER_ID, { page: 2, limit: 20 }, 't');
    const url = calledUrl(fetchMock);
    expect(url.pathname).toBe(`/api/v1/crm/subscribers/${SUBSCRIBER_ID}/notes`);
    expect(url.searchParams.get('page')).toBe('2');
    expect(url.searchParams.get('limit')).toBe('20');
    expect(response).toEqual({ data: [], meta: META });
  });

  it('crea la nota por POST con el cuerpo y devuelve la nota creada', async () => {
    const note = {
      id: '00000000-0000-4000-8000-000000000002',
      subscriberId: SUBSCRIBER_ID,
      body: 'Llamó para confirmar la visita.',
      createdBy: '00000000-0000-4000-8000-000000000003',
      createdAt: '2026-11-10T10:00:00.000Z',
    };
    const fetchMock = mockFetch(201, { data: note });
    await expect(
      subscribersApi.createNote(SUBSCRIBER_ID, { body: note.body }, 't'),
    ).resolves.toEqual(note);
    const [, init] = fetchMock.mock.calls[0] ?? [];
    expect(calledUrl(fetchMock).pathname).toBe(`/api/v1/crm/subscribers/${SUBSCRIBER_ID}/notes`);
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual({ body: note.body });
  });

  it('consulta el historial de ciclo de vida sin parámetros cuando no se piden', async () => {
    const fetchMock = mockFetch(200, { data: [], meta: META });
    await subscribersApi.lifecycleChanges(SUBSCRIBER_ID, undefined, 't');
    const url = calledUrl(fetchMock);
    expect(url.pathname).toBe(`/api/v1/crm/subscribers/${SUBSCRIBER_ID}/lifecycle-changes`);
    expect(url.search).toBe('');
  });
});
