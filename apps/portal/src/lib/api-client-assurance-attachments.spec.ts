import { ApiError, assuranceApi } from './api-client';

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
const TICKET_ID = '6f0f2c1e-3c43-4f1e-9a43-6c2d9b1f0a11';

function mockFetch(status: number, body: unknown) {
  const fetchMock = jest.fn(
    async (_input: RequestInfo | URL, _init?: RequestInit): Promise<MockResponse> =>
      createJsonResponse(status, body),
  );
  Reflect.set(globalThis, 'fetch', fetchMock);
  return fetchMock;
}

function call(fetchMock: jest.Mock) {
  const [input, init] = (fetchMock.mock.calls[0] ?? []) as [RequestInfo | URL, RequestInit];
  return { url: new URL(String(input), 'http://portal.example.test'), init };
}

describe('assuranceApi — adjuntos de tickets (MOD09)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    if (typeof originalFetch === 'function') {
      Reflect.set(globalThis, 'fetch', originalFetch);
    } else {
      Reflect.deleteProperty(globalThis, 'fetch');
    }
  });

  it('con archivos envía multipart a /comments/with-attachments con body, isInternal y files', async () => {
    const fetchMock = mockFetch(201, { id: 'c1', attachments: [] });
    const photo = new File(['foto'], 'foto.jpg', { type: 'image/jpeg' });
    const pdf = new File(['%PDF'], 'acta.pdf', { type: 'application/pdf' });

    await assuranceApi.tickets.submitComment(
      TICKET_ID,
      { body: 'Se cambió la ONU', isInternal: true, files: [photo, pdf] },
      'tenant-demo',
    );

    const { url, init } = call(fetchMock);
    expect(url.pathname).toBe(`/api/v1/assurance/tickets/${TICKET_ID}/comments/with-attachments`);
    expect(init.method).toBe('POST');
    expect(init.body).toBeInstanceOf(FormData);
    const form = init.body as FormData;
    expect(form.get('body')).toBe('Se cambió la ONU');
    expect(form.get('isInternal')).toBe('true');
    expect(form.getAll('files').map((file) => (file as File).name)).toEqual([
      'foto.jpg',
      'acta.pdf',
    ]);
    // El navegador pone el boundary: nunca se fija Content-Type a mano.
    expect(new Headers(init.headers).has('Content-Type')).toBe(false);
  });

  it('sin archivos usa el endpoint JSON de siempre', async () => {
    const fetchMock = mockFetch(201, { id: 'c1', attachments: [] });

    await assuranceApi.tickets.submitComment(
      TICKET_ID,
      { body: 'Solo texto', isInternal: false, files: [] },
      'tenant-demo',
    );

    const { url, init } = call(fetchMock);
    expect(url.pathname).toBe(`/api/v1/assurance/tickets/${TICKET_ID}/comments`);
    expect(JSON.parse(String(init.body))).toEqual({ body: 'Solo texto', isInternal: false });
  });

  it('el rechazo de un archivo llega como ApiError con su mensaje', async () => {
    mockFetch(400, {
      code: 'TICKET_ATTACHMENT_REJECTED',
      message: '«informe.exe»: Tipo de archivo no permitido.',
    });

    const error = await assuranceApi.tickets
      .submitComment(
        TICKET_ID,
        { body: 'x', files: [new File(['x'], 'informe.exe')] },
        'tenant-demo',
      )
      .catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 400,
      code: 'TICKET_ATTACHMENT_REJECTED',
      message: '«informe.exe»: Tipo de archivo no permitido.',
    });
  });

  it('pide el enlace firmado con la disposición y lista los adjuntos del caso', async () => {
    const linkFetch = mockFetch(200, {
      url: 'https://archivos.example.test/a',
      expiresAt: '2026-11-16T12:05:00.000Z',
      filename: 'acta.pdf',
      contentType: 'application/pdf',
    });
    const linkResult = await assuranceApi.tickets.getAttachmentLink(
      TICKET_ID,
      'a1',
      'attachment',
      'tenant-demo',
    );
    const { url } = call(linkFetch);
    expect(url.pathname).toBe(`/api/v1/assurance/tickets/${TICKET_ID}/attachments/a1/link`);
    expect(url.searchParams.get('disposition')).toBe('attachment');
    expect(linkResult.url).toBe('https://archivos.example.test/a');

    const listFetch = mockFetch(200, []);
    await assuranceApi.tickets.listAttachments(TICKET_ID, 'tenant-demo');
    expect(call(listFetch).url.pathname).toBe(`/api/v1/assurance/tickets/${TICKET_ID}/attachments`);
  });
});
