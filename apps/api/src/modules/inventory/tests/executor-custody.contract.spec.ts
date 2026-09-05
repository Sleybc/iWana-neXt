import {
  InventoryResponsibleType,
  SerializedAssetStatus,
  StockBalanceCondition,
  type ExecutorCustodyResponse,
  type ListMeta,
  type SerializedAssetRecord,
  type StockBalanceRecord,
} from '@iwana/shared';

/**
 * Contrato congelado v1 (PROMPT-MOD12-MOD11-CUSTODIA-EJECUTOR-BLOQUE-OT §1).
 * La asignación tipada falla en compilación si el shape se desvía; las
 * aserciones fijan las claves visibles para el portal (track B2).
 */
describe('ExecutorCustodyResponse (contrato v1)', () => {
  const buildMeta = (overrides: Partial<ListMeta> = {}): ListMeta => ({
    nextCursor: null,
    total: 0,
    totalIsEstimate: false,
    page: 1,
    limit: 25,
    totalPages: 0,
    hasMore: false,
    mode: 'page',
    capabilities: { randomAccess: true, sortableFields: [] },
    sort: null,
    ...overrides,
  });

  const buildAsset = (overrides: Partial<SerializedAssetRecord> = {}): SerializedAssetRecord => ({
    id: '11111111-1111-4111-8111-000000000001',
    tenantId: 'tenant-001',
    inventoryItemId: '22222222-2222-4222-8222-000000000001',
    serialNumber: 'SN-001',
    normalizedSerialNumber: 'sn-001',
    macAddress: null,
    normalizedMacAddress: null,
    assetTag: null,
    currentStatus: SerializedAssetStatus.ASSIGNED_TO_TECHNICIAN,
    currentLocationId: '33333333-3333-4333-8333-000000000001',
    currentResponsibleType: InventoryResponsibleType.TECHNICIAN,
    currentResponsibleRefId: '44444444-4444-4444-8444-000000000001',
    subscriberRefId: null,
    contractRefId: null,
    purchaseOrderRef: null,
    purchaseDate: null,
    usefulLifeMonths: null,
    warrantyUntil: null,
    createdAt: '2026-08-31T10:00:00.000Z',
    updatedAt: '2026-08-31T11:00:00.000Z',
    ...overrides,
  });

  const buildBalance = (overrides: Partial<StockBalanceRecord> = {}): StockBalanceRecord => ({
    id: '55555555-5555-4555-8555-000000000001',
    tenantId: 'tenant-001',
    itemId: '22222222-2222-4222-8222-000000000002',
    locationId: '33333333-3333-4333-8333-000000000001',
    lotId: null,
    condition: StockBalanceCondition.NEW,
    quantityOnHand: '4.00',
    quantityReserved: '1.00',
    createdAt: '2026-08-31T10:00:00.000Z',
    updatedAt: '2026-08-31T11:00:00.000Z',
    ...overrides,
  });

  it('acepta una respuesta con custodia activa en la forma exacta del contrato', () => {
    const response: ExecutorCustodyResponse = {
      location: {
        id: '33333333-3333-4333-8333-000000000001',
        name: 'Móvil técnico zona norte',
        type: 'MOBILE_TECHNICIAN',
        responsibleType: 'TECHNICIAN',
        responsibleRefId: '44444444-4444-4444-8444-000000000001',
      },
      assets: {
        items: [buildAsset()],
        meta: buildMeta({ total: 1, totalPages: 1, hasMore: false }),
      },
      balances: {
        items: [buildBalance()],
        meta: buildMeta({ total: 1, totalPages: 1, hasMore: false }),
      },
    };

    expect(Object.keys(response.location ?? {}).sort()).toEqual(
      ['id', 'name', 'responsibleRefId', 'responsibleType', 'type'].sort(),
    );
    expect(Object.keys(response.assets).sort()).toEqual(['items', 'meta']);
    expect(Object.keys(response.balances).sort()).toEqual(['items', 'meta']);
    expect(Object.keys(response.assets.items[0] ?? {}).sort()).toEqual(
      Object.keys(buildAsset()).sort(),
    );
    expect(Object.keys(response.balances.items[0] ?? {}).sort()).toEqual(
      Object.keys(buildBalance()).sort(),
    );
    // ListMeta del contrato unificado de paginación (ADR-065), no duplicado.
    expect(response.assets.meta).toHaveProperty('hasMore');
    expect(response.assets.meta).toHaveProperty('mode', 'page');
  });

  it('acepta location null con colecciones vacías (sin custodia activa)', () => {
    const response: ExecutorCustodyResponse = {
      location: null,
      assets: { items: [], meta: buildMeta() },
      balances: { items: [], meta: buildMeta() },
    };

    expect(response.location).toBeNull();
    expect(response.assets.items).toHaveLength(0);
    expect(response.balances.items).toHaveLength(0);
    expect(response.assets.meta.total).toBe(0);
    expect(response.balances.meta.total).toBe(0);
  });

  it('restringe location.type a las ubicaciones móviles del contrato', () => {
    const types: NonNullable<ExecutorCustodyResponse['location']>['type'][] = [
      'MOBILE_TECHNICIAN',
      'MOBILE_CREW',
    ];

    expect(types).toContain('MOBILE_TECHNICIAN');
    expect(types).toContain('MOBILE_CREW');
  });
});
