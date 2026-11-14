import { ApiError, billingApi, persistAccessToken } from './api-client';
import { persistTenantSlug } from './tenant-resolution';

/**
 * Rutas de Facturación en la ficha (spec MOD05↔MOD14 2026-11-13 D3–D6): recibo, desasociar,
 * libro del estado de cuenta, envíos por correo y su registro.
 */
type MockResponse = {
  ok: boolean;
  status: number;
  headers: Headers;
  json: () => Promise<unknown>;
  blob: () => Promise<Blob>;
};

const SUBSCRIBER_ID = '55555555-5555-4555-8555-555555555555';
const PAYMENT_ID = '66666666-6666-4666-8666-666666666666';
const ALLOCATION_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
const DOCUMENT_ID = '11111111-1111-4111-8111-111111111111';
const originalFetch = globalThis.fetch;

function mockFetch(status: number, body: unknown, contentType = 'application/json') {
  const fetchMock = jest.fn(
    async (_input: RequestInfo | URL, _init?: RequestInit): Promise<MockResponse> => ({
      ok: status >= 200 && status < 300,
      status,
      headers: new Headers({ 'content-type': contentType }),
      json: async () => body,
      blob: async () => new Blob(['%PDF'], { type: 'application/pdf' }),
    }),
  );
  Reflect.set(globalThis, 'fetch', fetchMock);
  return fetchMock;
}

function call(fetchMock: ReturnType<typeof mockFetch>) {
  const [input, init] = fetchMock.mock.calls[0] ?? [];
  const url = new URL(String(input), 'http://portal.example.test');
  return { url, init, headers: new Headers(init?.headers) };
}

describe('billingApi — facturación en la ficha', () => {
  beforeEach(() => {
    persistTenantSlug('isp-demo');
    persistAccessToken('billing-test-token');
  });

  afterEach(() => {
    jest.restoreAllMocks();
    if (typeof originalFetch === 'function') Reflect.set(globalThis, 'fetch', originalFetch);
    else Reflect.deleteProperty(globalThis, 'fetch');
  });

  it('desasocia una aplicación con POST y el motivo, y desenvuelve el pago', async () => {
    const fetchMock = mockFetch(200, { data: { id: PAYMENT_ID } });
    await expect(
      billingApi.unlinkAllocation(PAYMENT_ID, ALLOCATION_ID, { reasonCode: 'REASIGNACION' }),
    ).resolves.toEqual({ id: PAYMENT_ID });
    const { url, init, headers } = call(fetchMock);
    expect(url.pathname).toBe(
      `/api/v1/billing/payments/${PAYMENT_ID}/allocations/${ALLOCATION_ID}/unlink`,
    );
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual({ reasonCode: 'REASIGNACION' });
    expect(headers.get('X-Tenant-Slug')).toBe('isp-demo');
  });

  it('propaga el 409 de documento anulado o importado con su código', async () => {
    mockFetch(409, { code: 'BILLING_ALLOCATION_NOT_UNLINKABLE', message: 'x' });
    const failure = billingApi.unlinkAllocation(PAYMENT_ID, ALLOCATION_ID, {
      reasonCode: 'VALOR_EQUIVOCADO',
    });
    await expect(failure).rejects.toBeInstanceOf(ApiError);
    await expect(failure).rejects.toMatchObject({
      status: 409,
      code: 'BILLING_ALLOCATION_NOT_UNLINKABLE',
    });
  });

  it('descarga el recibo del pago como blob', async () => {
    const fetchMock = mockFetch(200, null, 'application/pdf');
    await expect(billingApi.receiptPdf(PAYMENT_ID)).resolves.toBeInstanceOf(Blob);
    const { url, init } = call(fetchMock);
    expect(url.pathname).toBe(`/api/v1/billing/payments/${PAYMENT_ID}/receipt/pdf`);
    expect(init?.method ?? 'GET').toBe('GET');
  });

  it('consulta el libro con from y to, y sin filtros sin query', async () => {
    const fetchMock = mockFetch(200, { data: { rows: [] } });
    await billingApi.statementLedger(SUBSCRIBER_ID, { from: '2026-08-13', to: '2026-11-13' });
    const { url } = call(fetchMock);
    expect(url.pathname).toBe(`/api/v1/billing/subscribers/${SUBSCRIBER_ID}/statement/ledger`);
    expect(Object.fromEntries(url.searchParams)).toEqual({ from: '2026-08-13', to: '2026-11-13' });
    fetchMock.mockClear();
    await billingApi.statementLedger(SUBSCRIBER_ID);
    expect(call(fetchMock).url.search).toBe('');
  });

  it('descarga el PDF del libro con el periodo', async () => {
    const fetchMock = mockFetch(200, null, 'application/pdf');
    await billingApi.statementLedgerPdf(SUBSCRIBER_ID, { from: '2026-05-13' });
    const { url } = call(fetchMock);
    expect(url.pathname).toBe(`/api/v1/billing/subscribers/${SUBSCRIBER_ID}/statement/ledger/pdf`);
    expect(url.searchParams.get('from')).toBe('2026-05-13');
    expect(url.searchParams.has('to')).toBe(false);
  });

  it.each([
    [
      'sendDocumentEmail',
      () => billingApi.sendDocumentEmail(DOCUMENT_ID),
      `/api/v1/billing/documents/${DOCUMENT_ID}/send`,
      undefined,
    ],
    [
      'sendReceiptEmail',
      () => billingApi.sendReceiptEmail(PAYMENT_ID),
      `/api/v1/billing/payments/${PAYMENT_ID}/receipt/send`,
      undefined,
    ],
    [
      'sendStatementEmail',
      () => billingApi.sendStatementEmail(SUBSCRIBER_ID, { from: '2026-08-13' }),
      `/api/v1/billing/subscribers/${SUBSCRIBER_ID}/statement/send`,
      { from: '2026-08-13' },
    ],
  ])('%s hace POST a su ruta y devuelve la fila del registro', async (_name, send, path, body) => {
    const fetchMock = mockFetch(202, { data: { id: 'fila', status: 'EN_COLA' } });
    await expect(send()).resolves.toEqual({ id: 'fila', status: 'EN_COLA' });
    const { url, init, headers } = call(fetchMock);
    expect(url.pathname).toBe(path);
    expect(init?.method).toBe('POST');
    expect(headers.get('X-Requested-With')).toBe('XMLHttpRequest');
    if (body) expect(JSON.parse(String(init?.body))).toEqual(body);
    else expect(init?.body).toBeUndefined();
  });

  it('consulta el registro de correos del titular', async () => {
    const fetchMock = mockFetch(200, { data: { subscriberId: SUBSCRIBER_ID, entries: [] } });
    await expect(billingApi.emailLog(SUBSCRIBER_ID)).resolves.toEqual({
      subscriberId: SUBSCRIBER_ID,
      entries: [],
    });
    expect(call(fetchMock).url.pathname).toBe(
      `/api/v1/billing/subscribers/${SUBSCRIBER_ID}/email-log`,
    );
  });
});
