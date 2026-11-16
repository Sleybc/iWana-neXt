import type { ListMeta, SubscriberEquipmentResponse } from '@iwana/shared';
import { inventoryApi } from './api-client';

type MockResponse = {
  ok: boolean;
  status: number;
  headers: Headers;
  json: () => Promise<unknown>;
};

const originalFetch = globalThis.fetch;
const SUBSCRIBER_ID = '6f0f2c1e-3c43-4f1e-9a43-6c2d9b1f0a11';
const TENANT = 'tenant-demo';
const ASSET_ID = '7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';

const meta: ListMeta = {
  nextCursor: null,
  total: 0,
  totalIsEstimate: false,
  page: 1,
  limit: 20,
  totalPages: 0,
  hasMore: false,
  mode: 'page',
  capabilities: { randomAccess: true, sortableFields: [] },
  sort: null,
};

/** Inventario responde sin el envoltorio `{ data }` (igual que `GET /inventory/assets/:id`). */
const RAW_BODY: SubscriberEquipmentResponse = {
  equipment: [
    {
      loanId: '11111111-1111-4111-8111-111111111111',
      assetId: ASSET_ID,
      itemName: 'ONT GPON',
      model: 'HG8145',
      serialNumber: 'SN-0001',
      macAddress: '02:00:00:00:00:01',
      status: 'INSTALLED_COMODATO' as SubscriberEquipmentResponse['equipment'][number]['status'],
      installedAt: '2026-11-01T10:00:00.000Z',
      removedAt: null,
      executionOrderRefId: null,
      contractRefId: null,
      usefulLife: {
        monthsTotal: null,
        monthsElapsed: null,
        monthsRemaining: null,
        warrantyUntil: null,
        status: 'sin-dato',
      },
    },
  ],
  materials: { items: [], meta },
  history: { items: [], meta },
};

function mockFetch(body: unknown) {
  const fetchMock = jest.fn(
    async (_input: RequestInfo | URL, _init?: RequestInit): Promise<MockResponse> => ({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => body,
    }),
  );
  Reflect.set(globalThis, 'fetch', fetchMock);
  return fetchMock;
}

function requestedUrl(fetchMock: jest.Mock): URL {
  const [input] = (fetchMock.mock.calls[0] ?? []) as [RequestInfo | URL];
  return new URL(String(input), 'http://portal.example.test');
}

describe('inventoryApi.getSubscriberEquipment — equipos del suscriptor', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    if (typeof originalFetch === 'function') {
      Reflect.set(globalThis, 'fetch', originalFetch);
    } else {
      Reflect.deleteProperty(globalThis, 'fetch');
    }
  });

  it('devuelve el cuerpo sin envoltorio tal como lo responde Inventario', async () => {
    mockFetch(RAW_BODY);

    const result = await inventoryApi.getSubscriberEquipment(SUBSCRIBER_ID, undefined, TENANT);

    expect(result).toEqual(RAW_BODY);
    expect(result.equipment[0]?.serialNumber).toBe('SN-0001');
  });

  it('la primera llamada va sin parámetros a la ruta del suscriptor', async () => {
    const fetchMock = mockFetch(RAW_BODY);

    await inventoryApi.getSubscriberEquipment(SUBSCRIBER_ID, undefined, TENANT);

    const url = requestedUrl(fetchMock);
    expect(url.pathname).toBe(`/api/v1/inventory/subscribers/${SUBSCRIBER_ID}/equipment`);
    expect(url.search).toBe('');
  });

  it('las páginas siguientes envían solo los parámetros de su sección', async () => {
    const fetchMock = mockFetch(RAW_BODY);

    await inventoryApi.getSubscriberEquipment(
      SUBSCRIBER_ID,
      {
        historyPage: 2,
        historyLimit: 20,
        historyAssetId: ASSET_ID,
      },
      TENANT,
    );

    const params = requestedUrl(fetchMock).searchParams;
    expect(params.get('historyPage')).toBe('2');
    expect(params.get('historyLimit')).toBe('20');
    expect(params.get('historyAssetId')).toBe(ASSET_ID);
    expect(params.has('materialsPage')).toBe(false);
  });
});
