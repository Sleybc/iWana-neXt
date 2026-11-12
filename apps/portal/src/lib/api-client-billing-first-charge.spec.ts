import { ApiError, billingApi, persistAccessToken } from './api-client';
import { persistTenantSlug } from './tenant-resolution';

/** «Generar primer cobro» de un contrato activo sin periodos (spec 2026-11-11 R3). */
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

const CONTRACT_ID = '44444444-4444-4444-8444-444444444444';
const RESULT = {
  contractId: CONTRACT_ID,
  anchorDate: '2026-10-30',
  anchorSource: 'ACTIVATION_EVENT',
  installationFee: { outcome: 'FROZEN', amount: '50000.00' },
  summary: {
    generated: 2,
    failed: 0,
    notDue: 0,
    existing: 0,
    omittedImpersonation: 0,
    omittedTermination: 0,
    blocked: 0,
    withoutCycle: 0,
    unbilledAdditionalDocuments: 0,
  },
};
const originalFetch = globalThis.fetch;

function mockFetch(status: number, body: unknown) {
  const fetchMock = jest.fn(
    async (_input: RequestInfo | URL, _init?: RequestInit): Promise<MockResponse> =>
      jsonResponse(status, body),
  );
  Reflect.set(globalThis, 'fetch', fetchMock);
  return fetchMock;
}

describe('billingApi.generateFirstCharge', () => {
  beforeEach(() => {
    persistTenantSlug('isp-demo');
    persistAccessToken('billing-test-token');
  });

  afterEach(() => {
    jest.restoreAllMocks();
    if (typeof originalFetch === 'function') Reflect.set(globalThis, 'fetch', originalFetch);
    else Reflect.deleteProperty(globalThis, 'fetch');
  });

  it('envía POST con el contrato y la llave de idempotencia y desenvuelve data', async () => {
    const fetchMock = mockFetch(200, { data: RESULT });
    await expect(
      billingApi.generateFirstCharge({ contractId: CONTRACT_ID }, 'key-1'),
    ).resolves.toEqual(RESULT);
    const [input, init] = fetchMock.mock.calls[0] ?? [];
    expect(new URL(String(input), 'http://portal.example.test').pathname).toBe(
      '/api/v1/billing/documents/generate-first-charge',
    );
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual({ contractId: CONTRACT_ID });
    const headers = new Headers(init?.headers);
    expect(headers.get('Idempotency-Key')).toBe('key-1');
    expect(headers.get('X-Tenant-Slug')).toBe('isp-demo');
  });

  it.each([
    [404, 'CONTRACT_NOT_FOUND'],
    [409, 'CONTRACT_NOT_ACTIVE'],
    [422, 'ACTIVATION_DATE_UNKNOWN'],
  ])('propaga %i %s como ApiError con su código', async (status, code) => {
    mockFetch(status, { code, message: 'Mensaje del servidor' });
    const failure = billingApi.generateFirstCharge({ contractId: CONTRACT_ID }, 'key-2');
    await expect(failure).rejects.toBeInstanceOf(ApiError);
    await expect(failure).rejects.toMatchObject({ status, code });
  });
});
