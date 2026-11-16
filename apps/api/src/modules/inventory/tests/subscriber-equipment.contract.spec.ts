import {
  AssetLifecycleEventType,
  SerializedAssetStatus,
  SUBSCRIBER_EQUIPMENT_DEFAULT_LIMIT,
  SUBSCRIBER_EQUIPMENT_MAX_LIMIT,
  type ListMeta,
  type SubscriberEquipmentResponse,
} from '@iwana/shared';
import { GetSubscriberEquipmentQuerySchema } from '../dto';

/**
 * Contrato congelado A1 v1.0 (spec 2026-11-16-mod05-mod12-equipos-del-suscriptor §2.1).
 * La asignación tipada falla en compilación si el shape se desvía; las aserciones fijan
 * las claves visibles para el portal (F2) y para el servicio (A2).
 */
describe('SubscriberEquipmentResponse (contrato A1 v1.0)', () => {
  const meta: ListMeta = {
    nextCursor: null,
    total: 1,
    totalIsEstimate: false,
    page: 1,
    limit: SUBSCRIBER_EQUIPMENT_DEFAULT_LIMIT,
    totalPages: 1,
    hasMore: false,
    mode: 'page',
    capabilities: { randomAccess: true, sortableFields: [] },
    sort: null,
  };

  const response: SubscriberEquipmentResponse = {
    equipment: [
      {
        loanId: '11111111-1111-4111-8111-000000000001',
        assetId: '22222222-2222-4222-8222-000000000001',
        itemName: 'ONT GPON',
        model: 'MODELO-X',
        serialNumber: 'SN-EJEMPLO-0001',
        macAddress: '00:11:22:33:44:55',
        status: SerializedAssetStatus.INSTALLED_COMODATO,
        installedAt: '2026-10-01T10:00:00.000Z',
        removedAt: null,
        executionOrderRefId: '33333333-3333-4333-8333-000000000001',
        contractRefId: null,
        usefulLife: {
          monthsTotal: 36,
          monthsElapsed: 2,
          monthsRemaining: 34,
          warrantyUntil: '2027-10-01',
          status: 'vigente',
        },
      },
    ],
    materials: {
      items: [
        {
          movementId: '44444444-4444-4444-8444-000000000001',
          movementNumber: 'MOV-000001',
          occurredAt: '2026-10-01T10:00:00.000Z',
          itemName: 'Cable drop',
          quantity: '35.00',
          unitOfMeasure: 'METER',
          executionOrderRefId: null,
        },
      ],
      meta,
    },
    history: {
      items: [
        {
          id: '55555555-5555-4555-8555-000000000001',
          assetId: '22222222-2222-4222-8222-000000000001',
          serialNumber: 'SN-EJEMPLO-0001',
          eventType: AssetLifecycleEventType.INSTALLED,
          occurredAt: '2026-10-01T10:00:00.000Z',
        },
      ],
      meta,
    },
  };

  it('fija las claves de cada sección', () => {
    expect(Object.keys(response).sort()).toEqual(['equipment', 'history', 'materials']);
    expect(Object.keys(response.equipment[0]!).sort()).toEqual([
      'assetId',
      'contractRefId',
      'executionOrderRefId',
      'installedAt',
      'itemName',
      'loanId',
      'macAddress',
      'model',
      'removedAt',
      'serialNumber',
      'status',
      'usefulLife',
    ]);
    expect(Object.keys(response.materials.items[0]!).sort()).toEqual([
      'executionOrderRefId',
      'itemName',
      'movementId',
      'movementNumber',
      'occurredAt',
      'quantity',
      'unitOfMeasure',
    ]);
  });

  it('el historial no expone notas', () => {
    expect(Object.keys(response.history.items[0]!).sort()).toEqual([
      'assetId',
      'eventType',
      'id',
      'occurredAt',
      'serialNumber',
    ]);
    expect(response.history.items[0]).not.toHaveProperty('notes');
  });
});

describe('GetSubscriberEquipmentQuerySchema', () => {
  it('sin parámetros aplica página 1 y el límite por defecto en ambas secciones', () => {
    expect(GetSubscriberEquipmentQuerySchema.parse({})).toEqual({
      materialsPage: 1,
      materialsLimit: SUBSCRIBER_EQUIPMENT_DEFAULT_LIMIT,
      historyPage: 1,
      historyLimit: SUBSCRIBER_EQUIPMENT_DEFAULT_LIMIT,
    });
  });

  it('convierte los parámetros de query y acepta el filtro por equipo', () => {
    expect(
      GetSubscriberEquipmentQuerySchema.parse({
        materialsPage: '2',
        materialsLimit: '50',
        historyPage: '3',
        historyLimit: '10',
        historyAssetId: '22222222-2222-4222-8222-000000000001',
      }),
    ).toEqual({
      materialsPage: 2,
      materialsLimit: 50,
      historyPage: 3,
      historyLimit: 10,
      historyAssetId: '22222222-2222-4222-8222-000000000001',
    });
  });

  it.each([
    ['materialsPage', '0'],
    ['historyPage', '-1'],
    ['materialsLimit', String(SUBSCRIBER_EQUIPMENT_MAX_LIMIT + 1)],
    ['historyLimit', '0'],
    ['historyLimit', '1.5'],
    ['historyAssetId', 'no-es-uuid'],
  ])('rechaza %s=%s', (field, value) => {
    expect(GetSubscriberEquipmentQuerySchema.safeParse({ [field]: value }).success).toBe(false);
  });
});
