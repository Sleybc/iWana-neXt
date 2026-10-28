import type {
  CreateRouterInterfaceConversionResponseDto,
  CreateRouterInterfaceBody,
  CreateIpv4NetworkBody,
  Ipv4NetworkExtendedDto,
  RouterInterfaceDto,
  UpdateIpv4NetworkBody,
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

const extendedNetwork: Ipv4NetworkExtendedDto = {
  id: 'network-1',
  routerId: 'router-1',
  routerName: 'Router norte',
  name: 'LAN principal',
  cidr: '192.0.2.0/24',
  gateway: '192.0.2.1',
  assignableFrom: '192.0.2.2',
  assignableTo: '192.0.2.254',
  excludedIps: [],
  interfaceId: 'interface-1',
  interface: { id: 'interface-1', name: 'ether1', status: 'ACTIVE' },
  reservationAvailability: { available: true, reason: null },
  defaultControlMethod: 'SIMPLE_QUEUE_STATIC_IP',
  status: 'ACTIVE',
  occupancy: { total: 253, reserved: 1, active: 3, free: 249 },
  version: 3,
  createdAt: '2026-10-27T12:00:00.000Z',
  updatedAt: '2026-10-27T12:00:00.000Z',
};

const convertedLegacyInterface: CreateRouterInterfaceConversionResponseDto = {
  interface: {
    id: 'interface-1',
    routerId: 'router-1',
    name: 'ether1',
    kind: 'PHYSICAL',
    notes: null,
    status: 'ACTIVE',
    ipv4AddressCount: 1,
    networkCount: 0,
    version: 1,
    createdAt: '2026-10-27T12:00:00.000Z',
    updatedAt: '2026-10-27T12:00:00.000Z',
  },
  address: {
    id: 'address-1',
    routerId: 'router-1',
    interfaceId: 'interface-1',
    addressWithPrefix: '192.0.2.1/24',
    host: '192.0.2.1',
    prefixLength: 24,
    notes: null,
    version: 1,
    createdAt: '2026-10-27T12:00:00.000Z',
    updatedAt: '2026-10-27T12:00:00.000Z',
  },
  router: {
    id: 'router-1',
    name: 'Router norte',
    managementHost: '192.0.2.10',
    lanInterface: null,
    supportedControlMethods: ['SIMPLE_QUEUE_STATIC_IP'],
    organizationSiteId: null,
    commercialNodeId: null,
    status: 'ACTIVE',
    notes: null,
    networkCount: 0,
    version: 2,
    createdAt: '2026-10-27T12:00:00.000Z',
    updatedAt: '2026-10-27T12:00:00.000Z',
  },
};

const originalFetch = global.fetch;

describe('networkApi IPv4 network extended responses', () => {
  beforeEach(() => {
    jest.resetModules();
    window.localStorage.clear();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    window.localStorage.clear();
  });

  it('returns the extended network after updating an IPv4 network', async () => {
    const fetchMock = jest.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      createJsonResponse(200, extendedNetwork),
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    const { networkApi } = await import('./api-client');
    const body: UpdateIpv4NetworkBody = {
      version: 2,
      interfaceId: 'interface-1',
      interfaceVersion: 1,
    };
    const response: Promise<Ipv4NetworkExtendedDto> = networkApi.updateIpv4Network(
      'network-1',
      body,
      'isp-demo',
    );

    await expect(response).resolves.toEqual(extendedNetwork);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/network/ipv4-networks/network-1');
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe('PATCH');
  });

  it('returns the extended network after changing IPv4 network status', async () => {
    const fetchMock = jest.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      createJsonResponse(200, extendedNetwork),
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    const { networkApi } = await import('./api-client');
    const response: Promise<Ipv4NetworkExtendedDto> = networkApi.setIpv4NetworkStatus(
      'network-1',
      3,
      'INACTIVE',
      'isp-demo',
    );

    await expect(response).resolves.toEqual(extendedNetwork);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
      '/network/ipv4-networks/network-1/deactivate',
    );
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe('POST');
  });

  it('returns the shared conversion response after converting the legacy LAN interface', async () => {
    const fetchMock = jest.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      createJsonResponse(200, convertedLegacyInterface),
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    const { networkApi } = await import('./api-client');
    const body = {
      convertLegacyLan: true,
      routerVersion: 1,
      name: 'ether1',
      kind: 'PHYSICAL',
      address: { addressWithPrefix: '192.0.2.1/24' },
    } as const;
    const response: Promise<CreateRouterInterfaceConversionResponseDto> =
      networkApi.convertLegacyLanInterface('router-1', body, 'isp-demo');

    await expect(response).resolves.toEqual(convertedLegacyInterface);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/network/routers/router-1/interfaces');
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe('POST');
  });

  it('returns an extended network after creating an IPv4 network', async () => {
    const fetchMock = jest.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      createJsonResponse(201, extendedNetwork),
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    const { networkApi } = await import('./api-client');
    const body: CreateIpv4NetworkBody = {
      routerId: 'router-1',
      name: 'LAN principal',
      cidr: '192.0.2.0/24',
      gateway: '192.0.2.1',
      assignableFrom: '192.0.2.2',
      assignableTo: '192.0.2.254',
      defaultControlMethod: 'SIMPLE_QUEUE_STATIC_IP',
      excludedIps: [],
    };
    const response: Promise<Ipv4NetworkExtendedDto> = networkApi.createIpv4Network(
      body,
      'isp-demo',
    );

    await expect(response).resolves.toEqual(extendedNetwork);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/network/ipv4-networks');
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe('POST');
  });

  it('serializes the IPv4 network search and interface filters', async () => {
    const fetchMock = jest.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      createJsonResponse(200, { data: [], meta: { page: 1, limit: 20, total: 0 } }),
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    const { networkApi } = await import('./api-client');
    await networkApi.listIpv4Networks(
      { page: 2, limit: 10, q: 'LAN norte', routerId: 'router-1', interfaceId: 'interface-1' },
      'isp-demo',
    );

    const requestUrl = new URL(String(fetchMock.mock.calls[0]?.[0]), 'http://localhost');
    expect(requestUrl.pathname).toBe('/api/v1/network/ipv4-networks');
    expect(requestUrl.searchParams.get('q')).toBe('LAN norte');
    expect(requestUrl.searchParams.get('interfaceId')).toBe('interface-1');
    expect(requestUrl.searchParams.get('routerId')).toBe('router-1');
    expect(requestUrl.searchParams.get('page')).toBe('2');
    expect(requestUrl.searchParams.get('limit')).toBe('10');
  });

  it('types the interface creation response as simple or legacy conversion', async () => {
    const interfaceResponse: RouterInterfaceDto = convertedLegacyInterface.interface;
    const fetchMock = jest.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      createJsonResponse(201, interfaceResponse),
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    const { networkApi } = await import('./api-client');
    const body: CreateRouterInterfaceBody = { name: 'ether1', kind: 'PHYSICAL' };
    const response: Promise<RouterInterfaceDto | CreateRouterInterfaceConversionResponseDto> =
      networkApi.createRouterInterface('router-1', body, 'isp-demo');

    await expect(response).resolves.toEqual(interfaceResponse);
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe('POST');
  });
});
