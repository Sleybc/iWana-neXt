import {
  ApiError,
  DASHBOARD_CASES_SERIES_DAYS,
  DashboardContractError,
  dashboardSeriesApi,
  persistAccessToken,
} from './api-client';
import { persistTenantSlug } from './tenant-resolution';
import {
  billingSummaryFixture,
  casesSeriesFixture,
  subscribersSummaryFixture,
} from '@/components/dashboard/dashboard-series-test-fixtures';

/**
 * Clientes N1–N3 del inicio (HLD-MOD02 v3.0 §3 y §8): sobre `{ data }`, validación con el Zod
 * congelado de `@iwana/shared` y propagación del error HTTP.
 */
type MockResponse = {
  ok: boolean;
  status: number;
  headers: Headers;
  json: () => Promise<unknown>;
};

const originalFetch = globalThis.fetch;

function mockFetch(status: number, body: unknown) {
  const fetchMock = jest.fn(
    async (_input: RequestInfo | URL, _init?: RequestInit): Promise<MockResponse> => ({
      ok: status >= 200 && status < 300,
      status,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => body,
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

const cases = [
  {
    name: 'billingSummary (N1)',
    run: () => dashboardSeriesApi.billingSummary(),
    path: '/api/v1/billing/dashboard/summary',
    search: '',
    fixture: billingSummaryFixture(),
  },
  {
    name: 'subscribersSummary (N2)',
    run: () => dashboardSeriesApi.subscribersSummary(),
    path: '/api/v1/crm/subscribers/dashboard/summary',
    search: '',
    fixture: subscribersSummaryFixture(),
  },
  {
    name: 'casesSeries (N3)',
    run: () => dashboardSeriesApi.casesSeries(),
    path: '/api/v1/assurance/dashboard/series',
    search: `?days=${DASHBOARD_CASES_SERIES_DAYS}`,
    fixture: casesSeriesFixture(),
  },
] as const;

describe('dashboardSeriesApi — resúmenes N1–N3 del inicio', () => {
  beforeEach(() => {
    persistTenantSlug('isp-demo');
    persistAccessToken('dashboard-test-token');
  });

  afterEach(() => {
    jest.restoreAllMocks();
    if (typeof originalFetch === 'function') Reflect.set(globalThis, 'fetch', originalFetch);
    else Reflect.deleteProperty(globalThis, 'fetch');
  });

  it('la serie de casos pide 14 días (contrato DS §6)', () => {
    expect(DASHBOARD_CASES_SERIES_DAYS).toBe(14);
  });

  describe.each(cases)('$name', ({ run, path, search, fixture }) => {
    it('lee el sobre { data } y devuelve los datos validados', async () => {
      const fetchMock = mockFetch(200, { data: fixture });
      await expect(run()).resolves.toEqual(fixture);

      const { url, init, headers } = call(fetchMock);
      expect(url.pathname).toBe(path);
      // N1 y N2 sin query (responden 400 a cualquier parámetro); N3 con days=14.
      expect(url.search).toBe(search);
      expect(init?.method ?? 'GET').toBe('GET');
      expect(headers.get('X-Tenant-Slug')).toBe('isp-demo');
    });

    it('una forma que no cumple el contrato lanza DashboardContractError', async () => {
      mockFetch(200, { data: { ...fixture, asOf: 'no-es-fecha' } });
      const failure = run();
      await expect(failure).rejects.toBeInstanceOf(DashboardContractError);
      await expect(failure).rejects.toMatchObject({
        name: 'DashboardContractError',
        message: 'No pudimos leer este resumen. Reintenta en unos minutos.',
      });
    });

    it('sin sobre { data } no adivina: lanza DashboardContractError', async () => {
      mockFetch(200, fixture);
      await expect(run()).rejects.toBeInstanceOf(DashboardContractError);
    });

    it('un cuerpo que no es objeto lanza DashboardContractError', async () => {
      mockFetch(200, null);
      await expect(run()).rejects.toBeInstanceOf(DashboardContractError);
    });

    it('propaga el error HTTP con su estado (403 sin permiso)', async () => {
      mockFetch(403, { code: 'FORBIDDEN', message: 'Forbidden resource' });
      const failure = run();
      await expect(failure).rejects.toBeInstanceOf(ApiError);
      await expect(failure).rejects.toMatchObject({ status: 403 });
    });

    it('propaga el 500 del servidor como ApiError, no como dato', async () => {
      mockFetch(500, { code: 'INTERNAL', message: 'down' });
      const failure = run();
      await expect(failure).rejects.toBeInstanceOf(ApiError);
      await expect(failure).rejects.toMatchObject({ status: 500 });
    });
  });

  it('usa el tenant explícito cuando se pasa', async () => {
    const fetchMock = mockFetch(200, { data: billingSummaryFixture() });
    await dashboardSeriesApi.billingSummary('otro-isp');
    expect(call(fetchMock).headers.get('X-Tenant-Slug')).toBe('otro-isp');
  });
});
