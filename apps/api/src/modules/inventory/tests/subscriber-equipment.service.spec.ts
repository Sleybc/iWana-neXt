import { BadRequestException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AssetLifecycleEventType, SerializedAssetStatus, StockLocationType } from '@iwana/shared';
import { GetSubscriberEquipmentQuerySchema } from '../dto';
import { AssetLoanService } from '../services/asset-loan.service';
import {
  EXECUTION_ORDER_ORIGIN_CONTEXT,
  loadSubscriberEquipment,
  loadSubscriberHistory,
  loadSubscriberMaterials,
  type SubscriberEquipmentQueryRunner,
} from '../services/subscriber-equipment.queries';

jest.mock('@iwana/db', () => ({
  AssetLoanAssignment: class AssetLoanAssignment {},
  TenantContext: {
    getOrThrow: jest.fn().mockReturnValue({
      tenantId: 'tenant-ctx-001',
      schemaName: 'tenant_ctx_001',
    }),
  },
  runInTenantSchema: jest.fn(),
}));

import { runInTenantSchema } from '@iwana/db';

const TENANT_ID = 'tenant-ctx-001';
const SUBSCRIBER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ASSET_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const NOTE = 'Nota con dato personal';

/** Runner falso: responde según la forma del SQL y registra cada llamada. */
function fakeRunner(rows: {
  equipment?: Record<string, unknown>[];
  materialsTotal?: number;
  materials?: Record<string, unknown>[];
  historyTotal?: number;
  history?: Record<string, unknown>[];
}) {
  const query = jest.fn(async (sql: string, _params?: unknown[]): Promise<unknown> => {
    if (sql.includes('AS loan_id')) return rows.equipment ?? [];
    if (sql.includes('FROM (SELECT 1')) return [{ total: String(rows.materialsTotal ?? 0) }];
    if (sql.includes('sum(line.quantity)')) return rows.materials ?? [];
    if (sql.includes('count(*)::text AS total FROM asset_lifecycle_events'))
      return [{ total: String(rows.historyTotal ?? 0) }];
    if (sql.includes('e.event_type::text')) return rows.history ?? [];
    throw new Error(`SQL inesperado: ${sql}`);
  });
  return { query: query as jest.Mock & SubscriberEquipmentQueryRunner['query'] };
}

const equipmentRow = {
  loan_id: 'loan-1',
  asset_id: ASSET_ID,
  item_name: 'ONT',
  model: 'HG-1',
  serial_number: 'SN-1',
  mac_address: '00:11:22:33:44:55',
  status: SerializedAssetStatus.INSTALLED_COMODATO,
  installed_at: new Date('2026-02-01T10:00:00.000Z'),
  removed_at: null,
  execution_order_ref_id: 'ot-1',
  contract_ref_id: 'contract-1',
  useful_life_months: 12,
  purchase_date: '2026-01-15',
  warranty_until: '2027-01-15',
  notes: NOTE, // aunque la fila lo trajera, no debe salir
  stock_movement_id: 'mov-interno',
};

describe('Lectura de equipos del suscriptor (MOD12)', () => {
  const runInTenantSchemaMock = runInTenantSchema as jest.MockedFunction<typeof runInTenantSchema>;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('loadSubscriberEquipment', () => {
    it('mapea campo por campo y calcula la vida útil como la ficha 360', async () => {
      const runner = fakeRunner({ equipment: [equipmentRow] });

      const items = await loadSubscriberEquipment(
        runner,
        TENANT_ID,
        SUBSCRIBER_ID,
        new Date('2026-07-15T00:00:00.000Z'),
      );

      expect(items).toEqual([
        {
          loanId: 'loan-1',
          assetId: ASSET_ID,
          itemName: 'ONT',
          model: 'HG-1',
          serialNumber: 'SN-1',
          macAddress: '00:11:22:33:44:55',
          status: SerializedAssetStatus.INSTALLED_COMODATO,
          installedAt: '2026-02-01T10:00:00.000Z',
          removedAt: null,
          executionOrderRefId: 'ot-1',
          contractRefId: 'contract-1',
          usefulLife: {
            monthsTotal: 12,
            monthsElapsed: 6,
            monthsRemaining: 6,
            warrantyUntil: '2027-01-15',
            status: 'vigente',
          },
        },
      ]);
      expect(runner.query).toHaveBeenCalledWith(expect.stringContaining('l.tenant_id = $1'), [
        TENANT_ID,
        SUBSCRIBER_ID,
      ]);
    });

    it('serializa removedAt y devuelve sin-dato sin fecha de compra', async () => {
      const runner = fakeRunner({
        equipment: [
          {
            ...equipmentRow,
            removed_at: new Date('2026-03-01T00:00:00.000Z'),
            purchase_date: null,
          },
        ],
      });

      const [item] = await loadSubscriberEquipment(runner, TENANT_ID, SUBSCRIBER_ID);

      expect(item!.removedAt).toBe('2026-03-01T00:00:00.000Z');
      expect(item!.usefulLife.status).toBe('sin-dato');
    });
  });

  describe('loadSubscriberMaterials', () => {
    it('no consulta la página si el total es 0', async () => {
      const runner = fakeRunner({ materialsTotal: 0 });

      await expect(
        loadSubscriberMaterials(runner, TENANT_ID, SUBSCRIBER_ID, 1, 20),
      ).resolves.toEqual({ items: [], total: 0 });
      expect(runner.query).toHaveBeenCalledTimes(1);
      expect(runner.query).toHaveBeenCalledWith(expect.any(String), [
        TENANT_ID,
        SUBSCRIBER_ID,
        StockLocationType.CUSTOMER_SITE,
      ]);
    });

    it('pasa contexto de OT, limit y offset parametrizados y mapea sin notas ni referencias', async () => {
      const runner = fakeRunner({
        materialsTotal: 3,
        materials: [
          {
            movement_id: 'mov-1',
            movement_number: 'MOV-1',
            occurred_at: '2026-06-10T10:00:00.000Z',
            item_name: 'Cable',
            quantity: '3.00',
            unit_of_measure: 'METER',
            execution_order_ref_id: null,
            notes: NOTE,
            origin_ref_id: 'REF-INTERNA',
          },
        ],
      });

      const result = await loadSubscriberMaterials(runner, TENANT_ID, SUBSCRIBER_ID, 2, 2);

      expect(result).toEqual({
        total: 3,
        items: [
          {
            movementId: 'mov-1',
            movementNumber: 'MOV-1',
            occurredAt: '2026-06-10T10:00:00.000Z',
            itemName: 'Cable',
            quantity: '3.00',
            unitOfMeasure: 'METER',
            executionOrderRefId: null,
          },
        ],
      });
      expect(runner.query).toHaveBeenLastCalledWith(expect.stringContaining('LIMIT $5 OFFSET $6'), [
        TENANT_ID,
        SUBSCRIBER_ID,
        StockLocationType.CUSTOMER_SITE,
        EXECUTION_ORDER_ORIGIN_CONTEXT,
        2,
        2,
      ]);
    });
  });

  describe('loadSubscriberHistory', () => {
    const historyRow = {
      id: 'ev-1',
      asset_id: ASSET_ID,
      serial_number: 'SN-1',
      event_type: AssetLifecycleEventType.INSTALLED,
      occurred_at: new Date('2026-02-01T10:00:00.000Z'),
      notes: NOTE,
    };

    it('sin filtro: limit y offset son $3 y $4', async () => {
      const runner = fakeRunner({ historyTotal: 1, history: [historyRow] });

      const result = await loadSubscriberHistory(runner, TENANT_ID, SUBSCRIBER_ID, 1, 20);

      expect(result).toEqual({
        total: 1,
        items: [
          {
            id: 'ev-1',
            assetId: ASSET_ID,
            serialNumber: 'SN-1',
            eventType: AssetLifecycleEventType.INSTALLED,
            occurredAt: '2026-02-01T10:00:00.000Z',
          },
        ],
      });
      const [countSql] = runner.query.mock.calls[0]!;
      expect(countSql).not.toContain('$3');
      expect(runner.query).toHaveBeenLastCalledWith(expect.stringContaining('LIMIT $3 OFFSET $4'), [
        TENANT_ID,
        SUBSCRIBER_ID,
        20,
        0,
      ]);
    });

    it('con historyAssetId: filtro en $3 y limit/offset en $4/$5', async () => {
      const runner = fakeRunner({ historyTotal: 1, history: [historyRow] });

      await loadSubscriberHistory(runner, TENANT_ID, SUBSCRIBER_ID, 3, 10, ASSET_ID);

      expect(runner.query).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining('AND e.serialized_asset_id = $3'),
        [TENANT_ID, SUBSCRIBER_ID, ASSET_ID],
      );
      expect(runner.query).toHaveBeenLastCalledWith(expect.stringContaining('LIMIT $4 OFFSET $5'), [
        TENANT_ID,
        SUBSCRIBER_ID,
        ASSET_ID,
        10,
        20,
      ]);
    });

    it('el recorte exige comodato del suscriptor (EXISTS por periodo o movimiento de apertura)', async () => {
      const runner = fakeRunner({ historyTotal: 0 });

      await expect(
        loadSubscriberHistory(runner, TENANT_ID, SUBSCRIBER_ID, 1, 20, ASSET_ID),
      ).resolves.toEqual({ items: [], total: 0 });
      const [sql] = runner.query.mock.calls[0]!;
      expect(sql).toContain('l.subscriber_ref_id = $2');
      expect(sql).toContain('e.created_at >= l.installed_at');
      expect(sql).toContain('e.created_at <= l.removed_at');
      expect(sql).toContain('e.stock_movement_id = l.stock_movement_id');
      expect(sql).not.toContain('notes');
      expect(runner.query).toHaveBeenCalledTimes(1);
    });
  });

  describe('AssetLoanService.getSubscriberEquipment', () => {
    let service: AssetLoanService;

    beforeEach(() => {
      service = new AssetLoanService({} as DataSource);
    });

    it('usa el tenant del contexto y arma meta por sección', async () => {
      const runner = fakeRunner({
        equipment: [equipmentRow],
        materialsTotal: 0,
        historyTotal: 0,
      });
      runInTenantSchemaMock.mockImplementation(async (_ds, schemaName, fn) => {
        expect(schemaName).toBe('tenant_ctx_001');
        return fn(runner as never);
      });

      const response = await service.getSubscriberEquipment(
        SUBSCRIBER_ID,
        GetSubscriberEquipmentQuerySchema.parse({ historyPage: 2, historyLimit: 5 }),
      );

      expect(response.equipment).toHaveLength(1);
      expect(response.materials).toEqual({
        items: [],
        meta: expect.objectContaining({ total: 0, page: 1, limit: 20, hasMore: false }),
      });
      expect(response.history.meta).toMatchObject({ total: 0, page: 2, limit: 5, mode: 'page' });
      for (const [, params] of runner.query.mock.calls) {
        expect((params as unknown[])[0]).toBe(TENANT_ID);
      }
    });

    it('rechaza una página fuera del límite de offset antes de consultar', async () => {
      await expect(
        service.getSubscriberEquipment(
          SUBSCRIBER_ID,
          GetSubscriberEquipmentQuerySchema.parse({ historyPage: 200, historyLimit: 100 }),
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(runInTenantSchemaMock).not.toHaveBeenCalled();
    });

    it('revalida la consulta: un limit mayor a 100 no llega a la base', async () => {
      await expect(
        service.getSubscriberEquipment(SUBSCRIBER_ID, {
          materialsPage: 1,
          materialsLimit: 500,
          historyPage: 1,
          historyLimit: 20,
        }),
      ).rejects.toThrow();
      expect(runInTenantSchemaMock).not.toHaveBeenCalled();
    });
  });
});
