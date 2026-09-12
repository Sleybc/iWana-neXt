import { BadRequestException } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { InventoryTrackingMode, SerializedAssetStatus, StockIssueStatus } from '@iwana/shared';
import {
  SerializedGroupValidator,
  type SerializedGroupEntry,
} from '../services/serialized-group.validator';

jest.mock('@iwana/db', () => ({
  InventoryItem: class InventoryItem {},
  SerializedAsset: class SerializedAsset {},
  StockIssueLineSerial: class StockIssueLineSerial {},
}));

const TENANT_ID = 'tenant-001';
const SOURCE_ID = '11111111-1111-4111-8111-111111111111';
const ITEM_ID = '33333333-3333-4333-8333-333333333333';
const CONSUMABLE_ID = '44444444-4444-4333-8333-444444444444';
const ASSET_A = '66666666-6666-4666-8666-666666666666';
const ASSET_B = '88888888-8888-4888-8888-888888888888';

const serializedItem = {
  id: ITEM_ID,
  sku: 'CFO-SER-ROGPN-TPL-XC220',
  trackingMode: InventoryTrackingMode.SERIALIZED,
};

function buildAsset(overrides: Record<string, unknown> = {}) {
  return {
    id: ASSET_A,
    tenantId: TENANT_ID,
    inventoryItemId: ITEM_ID,
    serialNumber: 'SN-0001',
    currentStatus: SerializedAssetStatus.AVAILABLE,
    currentLocationId: SOURCE_ID,
    ...overrides,
  };
}

interface ValidatorManagerOptions {
  items?: Array<Record<string, unknown>>;
  assets?: Array<Record<string, unknown>>;
  committed?: string[];
}

function buildManager(options: ValidatorManagerOptions = {}) {
  const items = options.items ?? [serializedItem];
  const assets = options.assets ?? [buildAsset()];

  const committedQb = {
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getRawMany: jest
      .fn()
      .mockResolvedValue(
        (options.committed ?? []).map((serializedAssetId) => ({ serializedAssetId })),
      ),
  };

  const manager = {
    find: jest
      .fn()
      .mockImplementation(
        async (entity: { name?: string }, query?: { where?: { id?: { value?: string[] } } }) => {
          const ids: string[] = query?.where?.id?.value ?? [];
          if (entity?.name === 'InventoryItem') {
            return items.filter((item) => ids.includes(item['id'] as string));
          }
          if (entity?.name === 'SerializedAsset') {
            return assets.filter((asset) => ids.includes(asset['id'] as string));
          }
          return [];
        },
      ),
    createQueryBuilder: jest.fn().mockReturnValue(committedQb),
  };

  return {
    manager: manager as unknown as EntityManager,
    find: manager.find,
    createQueryBuilder: manager.createQueryBuilder,
    committedQb,
  };
}

function entry(
  itemId: string,
  requestedQty: number,
  serializedAssetIds: string[],
  lotId?: string | null,
): SerializedGroupEntry {
  return {
    line: { itemId, requestedQty, serializedAssetIds, lotId: lotId ?? null },
    item: {
      id: itemId,
      sku: `SKU-${itemId.slice(0, 4)}`,
    } as unknown as SerializedGroupEntry['item'],
  };
}

describe('SerializedGroupValidator (MOD12 S2.1 · B2)', () => {
  const validator = new SerializedGroupValidator();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('loadSerializedEntries', () => {
    it('conserva solo las líneas de seguimiento serializado', async () => {
      const { manager, find } = buildManager({
        items: [
          serializedItem,
          { id: CONSUMABLE_ID, sku: 'CBL-1', trackingMode: InventoryTrackingMode.CONSUMABLE },
        ],
      });

      const entries = await validator.loadSerializedEntries(manager, TENANT_ID, [
        { itemId: ITEM_ID, requestedQty: 1, serializedAssetIds: [ASSET_A] },
        { itemId: CONSUMABLE_ID, requestedQty: 5, serializedAssetIds: [] },
      ]);

      expect(entries).toHaveLength(1);
      expect(entries[0]?.line.itemId).toBe(ITEM_ID);
      expect(find).toHaveBeenCalledTimes(1);
    });

    it('omite ítems inexistentes sin consultar activos', async () => {
      const { manager, find } = buildManager({ items: [] });

      const entries = await validator.loadSerializedEntries(manager, TENANT_ID, [
        { itemId: ITEM_ID, requestedQty: 1, serializedAssetIds: [ASSET_A] },
      ]);

      expect(entries).toEqual([]);
      expect(find).toHaveBeenCalledTimes(1);
    });
  });

  describe('assertGroupQuantities', () => {
    it('rechaza el grupo vacío en español', () => {
      expect(() => validator.assertGroupQuantities([entry(ITEM_ID, 1, [])])).toThrow(
        'exige seleccionar los activos serializados que salen',
      );
    });

    it('rechaza la cantidad fraccionaria (CA-S2.1-BE04)', () => {
      expect(() => validator.assertGroupQuantities([entry(ITEM_ID, 1.5, [ASSET_A])])).toThrow(
        'número entero',
      );
    });

    it('rechaza la cantidad distinta del tamaño del grupo', () => {
      expect(() => validator.assertGroupQuantities([entry(ITEM_ID, 3, [ASSET_A])])).toThrow(
        '(1 seriales, cantidad 3)',
      );
    });

    it('acepta grupo coherente', () => {
      expect(() =>
        validator.assertGroupQuantities([entry(ITEM_ID, 2, [ASSET_A, ASSET_B])]),
      ).not.toThrow();
    });
  });

  describe('assertNoRepeatedAssets', () => {
    it('rechaza el serial repetido entre líneas con su número legible', () => {
      expect(() =>
        validator.assertNoRepeatedAssets([ASSET_A, ASSET_B, ASSET_A], () => 'El activo SN-0001'),
      ).toThrow('El activo SN-0001 está repetido en la salida.');
    });

    it('acepta seriales únicos', () => {
      expect(() =>
        validator.assertNoRepeatedAssets([ASSET_A, ASSET_B], () => 'etiqueta'),
      ).not.toThrow();
    });
  });

  describe('assertAssetsEligible', () => {
    it('rechaza el activo inexistente', () => {
      expect(() =>
        validator.assertAssetsEligible([entry(ITEM_ID, 1, [ASSET_A])], new Map(), SOURCE_ID),
      ).toThrow('no existe en la bodega de origen');
    });

    it('rechaza el activo de otro artículo', () => {
      const assetById = new Map([[ASSET_A, buildAsset({ inventoryItemId: 'otro' })]]);

      expect(() =>
        validator.assertAssetsEligible(
          [entry(ITEM_ID, 1, [ASSET_A])],
          assetById as never,
          SOURCE_ID,
        ),
      ).toThrow('pertenece a otro artículo');
    });

    it('rechaza el activo fuera de la bodega de origen', () => {
      const assetById = new Map([[ASSET_A, buildAsset({ currentLocationId: 'otra' })]]);

      expect(() =>
        validator.assertAssetsEligible(
          [entry(ITEM_ID, 1, [ASSET_A])],
          assetById as never,
          SOURCE_ID,
        ),
      ).toThrow('no está en la bodega de origen');
    });

    it('rechaza el activo en estado no despachable', () => {
      const assetById = new Map([
        [ASSET_A, buildAsset({ currentStatus: SerializedAssetStatus.INSTALLED_COMODATO })],
      ]);

      expect(() =>
        validator.assertAssetsEligible(
          [entry(ITEM_ID, 1, [ASSET_A])],
          assetById as never,
          SOURCE_ID,
        ),
      ).toThrow('no está disponible para salida');
    });

    it('acepta REFURBISHED disponible (despachable D3)', () => {
      const assetById = new Map([
        [ASSET_A, buildAsset({ currentStatus: SerializedAssetStatus.AVAILABLE_REFURBISHED })],
      ]);

      expect(() =>
        validator.assertAssetsEligible(
          [entry(ITEM_ID, 1, [ASSET_A])],
          assetById as never,
          SOURCE_ID,
        ),
      ).not.toThrow();
    });

    describe('coherencia serial ↔ lote', () => {
      const LOT_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
      const LOT_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

      it('rechaza el serial que pertenece a otro lote', () => {
        // Sin esta regla la salida reservaba y descontaba de la tupla del lote
        // de la línea, que no contiene ese serial.
        const assetById = new Map([[ASSET_A, buildAsset({ lotId: LOT_B })]]);

        expect(() =>
          validator.assertAssetsEligible(
            [entry(ITEM_ID, 1, [ASSET_A], LOT_A)],
            assetById as never,
            SOURCE_ID,
          ),
        ).toThrow('pertenece a otro lote');
      });

      it('acepta el serial del mismo lote de la línea', () => {
        const assetById = new Map([[ASSET_A, buildAsset({ lotId: LOT_A })]]);

        expect(() =>
          validator.assertAssetsEligible(
            [entry(ITEM_ID, 1, [ASSET_A], LOT_A)],
            assetById as never,
            SOURCE_ID,
          ),
        ).not.toThrow();
      });

      it('acepta el activo sin lote: el backfill de la 129 no inventa valores', () => {
        const assetById = new Map([[ASSET_A, buildAsset({ lotId: null })]]);

        expect(() =>
          validator.assertAssetsEligible(
            [entry(ITEM_ID, 1, [ASSET_A], LOT_A)],
            assetById as never,
            SOURCE_ID,
          ),
        ).not.toThrow();
      });

      it('no exige lote cuando la línea sale sin lote específico', () => {
        const assetById = new Map([[ASSET_A, buildAsset({ lotId: LOT_B })]]);

        expect(() =>
          validator.assertAssetsEligible(
            [entry(ITEM_ID, 1, [ASSET_A], null)],
            assetById as never,
            SOURCE_ID,
          ),
        ).not.toThrow();
      });
    });
  });

  describe('assertNotCommittedElsewhere', () => {
    it('rechaza el serial comprometido por otra salida', async () => {
      const { manager } = buildManager({ committed: [ASSET_A] });

      await expect(
        validator.assertNotCommittedElsewhere(
          manager,
          TENANT_ID,
          [ASSET_A],
          undefined,
          () => 'El activo SN-0001',
        ),
      ).rejects.toThrow('El activo SN-0001 ya está comprometido en otra salida.');
    });

    it('excluye la propia salida (update que reusa seriales)', async () => {
      const { manager, committedQb } = buildManager({ committed: [] });

      await validator.assertNotCommittedElsewhere(
        manager,
        TENANT_ID,
        [ASSET_A],
        'issue-001',
        () => 'etiqueta',
      );

      expect(committedQb.andWhere).toHaveBeenCalledWith(
        'serial.issue_id != :excludeSerialIssueId',
        { excludeSerialIssueId: 'issue-001' },
      );
    });

    it('sin seriales no consulta', async () => {
      const { manager, createQueryBuilder } = buildManager();

      await validator.assertNotCommittedElsewhere(manager, TENANT_ID, [], undefined, () => 'x');

      expect(createQueryBuilder).not.toHaveBeenCalled();
    });
  });

  describe('assertGroupsIntegrity (orquestador)', () => {
    it('vía feliz: carga batch y no lanza', async () => {
      const { manager } = buildManager({
        assets: [buildAsset(), buildAsset({ id: ASSET_B, serialNumber: 'SN-0002' })],
      });

      await expect(
        validator.assertGroupsIntegrity(
          manager,
          TENANT_ID,
          [{ itemId: ITEM_ID, requestedQty: 2, serializedAssetIds: [ASSET_A, ASSET_B] }],
          SOURCE_ID,
        ),
      ).resolves.toBeUndefined();
    });

    it('sin líneas serializadas no toca activos ni la hija', async () => {
      const { manager, find, createQueryBuilder } = buildManager();

      await validator.assertGroupsIntegrity(manager, TENANT_ID, [], SOURCE_ID);

      expect(find).not.toHaveBeenCalled();
      expect(createQueryBuilder).not.toHaveBeenCalled();
    });

    it('propaga el error de cantidad con SKU (B3.1)', async () => {
      const { manager } = buildManager();

      await expect(
        validator.assertGroupsIntegrity(
          manager,
          TENANT_ID,
          [{ itemId: ITEM_ID, requestedQty: 1, serializedAssetIds: [] }],
          SOURCE_ID,
        ),
      ).rejects.toThrow(
        'El ítem CFO-SER-ROGPN-TPL-XC220 exige seleccionar los activos serializados que salen.',
      );
    });
  });

  describe('constantes', () => {
    it('los terminales incluyen DISPATCHED/RECEIVED/CANCELLED y nada más', async () => {
      const { committedQb, manager } = buildManager();
      await validator.assertNotCommittedElsewhere(
        manager,
        TENANT_ID,
        [ASSET_A],
        undefined,
        () => 'x',
      );

      const terminalCall = committedQb.andWhere.mock.calls.find((call: unknown[]) =>
        String(call[0]).includes('issue_status NOT IN'),
      );
      expect(terminalCall?.[1]).toEqual({
        serialTerminalStatuses: [
          StockIssueStatus.CANCELLED,
          StockIssueStatus.DISPATCHED,
          StockIssueStatus.RECEIVED,
        ],
      });
    });
  });
});
