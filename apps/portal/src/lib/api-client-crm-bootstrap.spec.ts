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

describe('crmApi.getExpedienteBootstrap', () => {
  beforeEach(() => {
    jest.resetModules();
    window.localStorage.clear();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    window.localStorage.clear();
  });

  it('consulta la proyección segura con el tenant indicado', async () => {
    const bootstrap = {
      expediente: {
        id: 'exp-1',
        status: 'NUEVO_POTENCIAL',
        previousStatus: null,
        statusChangedAt: '2026-08-01T10:00:00.000Z',
        createdAt: '2026-08-01T10:00:00.000Z',
        updatedAt: '2026-08-01T10:00:00.000Z',
        fullName: 'Cliente de prueba',
        documentType: 'CC',
        personType: 'PERSONA_NATURAL',
        dataConsentRevoked: false,
        hasLocation: false,
        source: 'WEB',
        acquisitionChannel: 'WEB',
        interestedPlanId: null,
        additionalProductIds: null,
        additionalServiceIds: null,
      },
      completeness: { commercial: 0, legal: 0, technical: 0, operational: 0, overall: 0 },
      pipelineRecommendation: null,
      operationalMetadata: {
        createdBy: { userId: null, name: null },
        lastEditedBy: { userId: null, name: null },
        lastActivityAt: null,
      },
      currentAttribution: null,
      responsibility: null,
      subscriberSummary: null,
    };
    const fetchMock = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toMatch(/\/crm\/expedientes\/exp-1\/bootstrap$/);
      expect(new Headers(init?.headers).get('X-Tenant-Slug')).toBe('empresa-demo');
      return createJsonResponse(200, { data: bootstrap });
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const { crmApi } = await import('./api-client');
    const response = await crmApi.getExpedienteBootstrap('exp-1', 'empresa-demo');

    expect(response.data.expediente.additionalProductIds).toEqual([]);
    expect(response.data.expediente.additionalServiceIds).toEqual([]);
    expect(response.data.expediente).not.toHaveProperty('sourceDetail');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
