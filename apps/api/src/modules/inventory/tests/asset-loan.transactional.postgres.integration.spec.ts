/**
 * EV-1 — Smoke transaccional real (PostgreSQL) para comodato Fase 05B.
 *
 * Ciclo completo contra EntityManager/TypeORM reales (no mocks de @iwana/db):
 * alta en OT → idempotencia al reprocesar → cierre en retorno → cierre en baja.
 *
 * Ejecutar:
 *   IWANA_DB_INTEGRATION_AVAILABLE=true pnpm --filter @iwana/api test:integration -- --runTestsByPath src/modules/inventory/tests/asset-loan.transactional.postgres.integration.spec.ts
 *
 * Sin IWANA_DB_INTEGRATION_AVAILABLE=true la suite se omite.
 */
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import {
  AssetLifecycleEvent,
  AssetLoanAssignment,
  InventoryCategory,
  InventoryItem,
  SerializedAsset,
  StockBalance,
  StockLocation,
  StockMovement,
  StockMovementLine,
  TenantContext,
  dataSourceOptions,
  runInTenantSchema,
} from '@iwana/db';
import {
  ExecutionOrderItemAction,
  InventoryDisposition,
  InventoryResponsibleType,
  SerializedAssetStatus,
  UserRole,
  WriteOffReason,
} from '@iwana/shared';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { AssetLifecycleService } from '../services/asset-lifecycle.service';
import { AssetLoanService } from '../services/asset-loan.service';
import { CustomerSiteLocationResolver } from '../services/customer-site-location.resolver';
import { InventoryCostingService } from '../services/inventory-costing.service';
import { SerializedAssetService } from '../services/serialized-asset.service';
import { StockBalanceService } from '../services/stock-balance.service';
import { StockLedgerService } from '../services/stock-ledger.service';
import {
  applyTenantMigrationsInOrder,
  createTenantDataSource,
} from '../../../../../../packages/database/src/migrations/tenant/runner';

function loadWorkspaceEnv(): void {
  if (process.env.DB_HOST && process.env.DB_PASSWORD) {
    return;
  }

  const candidates = [
    resolve(process.cwd(), '.env'),
    resolve(process.cwd(), '../../.env'),
    resolve(__dirname, '../../../../../../.env'),
    resolve(__dirname, '../../../../../../../.env'),
  ];

  for (const envPath of candidates) {
    if (!existsSync(envPath)) {
      continue;
    }
    const content = readFileSync(envPath, 'utf8');
    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) {
        continue;
      }
      const eq = line.indexOf('=');
      if (eq <= 0) {
        continue;
      }
      const key = line.slice(0, eq).trim();
      let value = line.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
    break;
  }
}

loadWorkspaceEnv();

const enabled = process.env.IWANA_DB_INTEGRATION_AVAILABLE === 'true';
const syntheticTenantId = randomUUID();
const syntheticTenantSlug = `ev1-asset-loan-${syntheticTenantId.slice(0, 8)}`;
const syntheticSchemaName = `tenant_ev1_asset_loan_${randomUUID().replace(/-/g, '')}`;

const actor: JwtPayload = {
  sub: '00000000-0000-4000-8000-0000000000e2',
  email: 'ev1-asset-loan@example.test',
  role: UserRole.ADMIN,
  tenantId: syntheticTenantId,
  schemaName: syntheticSchemaName,
  jti: 'jti-ev1-asset-loan',
  type: 'tenant',
};

const SUBSCRIBER_REF_ID = '00000000-0000-4000-8000-000000000001';
const CONTRACT_REF_ID = '00000000-0000-4000-8000-000000000002';

let ev1UuidCounter = 0;

function nextEv1Uuid(): string {
  ev1UuidCounter += 1;
  return `00000000-0000-4000-8000-${ev1UuidCounter.toString(16).padStart(12, '0')}`;
}

(enabled ? describe : describe.skip)('EV-1 comodato transaccional (DB real)', () => {
  let dataSource: DataSource;
  let tenantId: string;
  let schemaName: string;
  let ledgerService: StockLedgerService;

  let mainLocationId: string;
  let techLocationId: string;
  let itemId: string;
  beforeAll(async () => {
    dataSource = new DataSource({
      ...dataSourceOptions,
      entities: [
        AssetLifecycleEvent,
        AssetLoanAssignment,
        InventoryCategory,
        InventoryItem,
        SerializedAsset,
        StockBalance,
        StockLocation,
        StockMovement,
        StockMovementLine,
      ],
      synchronize: false,
      logging: false,
    });
    await dataSource.initialize();
    tenantId = syntheticTenantId;
    schemaName = syntheticSchemaName;
    await dataSource.query(
      `INSERT INTO public.tenants (id, name, slug, schema_name, status, contact_email)
       VALUES ($1, $2, $3, $4, 'ACTIVE', $5)`,
      [
        tenantId,
        'EV1 asset loan synthetic',
        syntheticTenantSlug,
        schemaName,
        'ev1-asset-loan@example.invalid',
      ],
    );
    await dataSource.query(`CREATE SCHEMA "${schemaName}"`);
    const tenantDataSource = createTenantDataSource(dataSource, schemaName, syntheticTenantSlug);
    await tenantDataSource.initialize();
    try {
      await applyTenantMigrationsInOrder(tenantDataSource);
    } finally {
      await tenantDataSource.destroy();
    }
    actor.tenantId = tenantId;
    actor.schemaName = schemaName;

    const balanceService = new StockBalanceService(dataSource);
    const serializedAssetService = new SerializedAssetService(
      dataSource,
      new AssetLifecycleService(dataSource),
      {} as never,
      { getSupplierSummary: async () => null } as never,
      new AssetLoanService(dataSource),
    );
    const assetLifecycleService = new AssetLifecycleService(dataSource);
    const inventoryCostingService = new InventoryCostingService();
    const assetLoanService = new AssetLoanService(dataSource);
    const customerSiteResolver = new CustomerSiteLocationResolver();

    ledgerService = new StockLedgerService(
      dataSource,
      balanceService,
      serializedAssetService,
      assetLifecycleService,
      inventoryCostingService,
      assetLoanService,
      {
        captureItemSnapshots: jest.fn().mockResolvedValue(new Map()),
        publishAfterCommittedMovement: jest.fn(),
      } as never,
      customerSiteResolver,
    );

    await runInTenantSchema(dataSource, schemaName, async (qr) => {
      let mainRows = (await qr.query(
        `SELECT id::text AS id
         FROM stock_locations
         WHERE tenant_id = $1 AND type = 'MAIN_WAREHOUSE'
         ORDER BY created_at ASC
         LIMIT 1`,
        [tenantId],
      )) as Array<{ id: string }>;

      if (!mainRows[0]) {
        mainRows = (await qr.query(
          `INSERT INTO stock_locations (
             tenant_id, code, name, type, status, responsible_ref_id, max_capacity
           ) VALUES ($1, 'EV1-MAIN', 'EV1 bodega principal', 'MAIN_WAREHOUSE', 'ACTIVE', NULL, NULL)
           RETURNING id::text AS id`,
          [tenantId],
        )) as Array<{ id: string }>;
      }
      mainLocationId = mainRows[0]!.id;

      let techRows = (await qr.query(
        `SELECT id::text AS id
         FROM stock_locations
         WHERE tenant_id = $1 AND type = 'MOBILE_TECHNICIAN'
         ORDER BY created_at ASC
         LIMIT 1`,
        [tenantId],
      )) as Array<{ id: string }>;

      if (!techRows[0]) {
        techRows = (await qr.query(
          `INSERT INTO stock_locations (
             tenant_id, code, name, type, status, responsible_ref_id, max_capacity
           ) VALUES ($1, 'EV1-TECH', 'EV1 custodia técnico', 'MOBILE_TECHNICIAN', 'ACTIVE', NULL, NULL)
           RETURNING id::text AS id`,
          [tenantId],
        )) as Array<{ id: string }>;
      }
      techLocationId = techRows[0]!.id;

      const items = (await qr.query(
        `SELECT id::text AS id
         FROM inventory_items
         WHERE tenant_id = $1
         ORDER BY created_at ASC
         LIMIT 1`,
        [tenantId],
      )) as Array<{ id: string }>;

      if (items[0]) {
        itemId = items[0].id;
      } else {
        let categoryRows = (await qr.query(
          `SELECT id::text AS id
           FROM inventory_categories
           WHERE tenant_id = $1
           ORDER BY created_at ASC
           LIMIT 1`,
          [tenantId],
        )) as Array<{ id: string }>;

        if (!categoryRows[0]) {
          categoryRows = (await qr.query(
            `INSERT INTO inventory_categories (
               tenant_id, code, code_prefix, name, status, sort_order
             ) VALUES ($1, 'EV1-CAT', 'EV1', 'EV1 categoría', 'ACTIVE', 0)
             RETURNING id::text AS id`,
            [tenantId],
          )) as Array<{ id: string }>;
        }

        const categoryId = categoryRows[0]!.id;
        const insertedItem = (await qr.query(
          `INSERT INTO inventory_items (
             tenant_id, sku, name, item_kind, category, category_id,
             tracking_mode, unit_of_measure, status, purchasable
           ) VALUES (
             $1, 'EV1-ONU-001', 'EV1 ONU serializado', 'STOCK', 'CPE', $2,
              'SERIALIZED', 'UNIT', 'ACTIVE', false
           )
           RETURNING id::text AS id`,
          [tenantId, categoryId],
        )) as Array<{ id: string }>;
        itemId = insertedItem[0]!.id;
      }
    });
  }, 60_000);

  afterAll(async () => {
    if (!dataSource?.isInitialized) {
      return;
    }

    await dataSource.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
    await dataSource.query('DELETE FROM public.tenants WHERE id = $1', [tenantId]);

    await dataSource.destroy();
  }, 60_000);

  async function seedAssetAtTechnician(serialSuffix: string) {
    const serialNumber = `EV1-LOAN-${serialSuffix}`;
    let assetId = '';
    let customerSiteId = '';

    await runInTenantSchema(dataSource, schemaName, async (qr) => {
      const asset = await qr.manager.save(
        SerializedAsset,
        qr.manager.create(SerializedAsset, {
          tenantId,
          inventoryItemId: itemId,
          serialNumber,
          normalizedSerialNumber: serialNumber.toUpperCase(),
          macAddress: null,
          normalizedMacAddress: null,
          assetTag: null,
          currentStatus: SerializedAssetStatus.ASSIGNED_TO_TECHNICIAN,
          currentLocationId: techLocationId,
          currentResponsibleType: InventoryResponsibleType.TECHNICIAN,
          currentResponsibleRefId: null,
          subscriberRefId: null,
          contractRefId: null,
          purchaseOrderRef: null,
          purchaseDate: null,
          usefulLifeMonths: null,
          warrantyUntil: null,
        }),
      );
      assetId = asset.id;

      await qr.query(
        `INSERT INTO stock_balances (
           tenant_id, item_id, location_id, lot_id, condition,
           quantity_on_hand, quantity_reserved
         ) VALUES ($1, $2, $3, NULL, 'NEW', 2.00, 0.00)
         ON CONFLICT DO NOTHING`,
        [tenantId, itemId, techLocationId],
      );

      await qr.query(
        `UPDATE stock_balances
         SET quantity_on_hand = GREATEST(quantity_on_hand, 2.00),
             quantity_reserved = 0.00
         WHERE tenant_id = $1
           AND item_id = $2
           AND location_id = $3
           AND lot_id IS NULL
           AND condition = 'NEW'`,
        [tenantId, itemId, techLocationId],
      );
    });

    return { assetId, serialNumber, customerSiteId };
  }

  async function countLoansForAsset(assetId: string): Promise<number> {
    return runInTenantSchema(dataSource, schemaName, async (qr) => {
      const rows = (await qr.query(
        `SELECT COUNT(*)::int AS count
         FROM asset_loan_assignments
         WHERE tenant_id = $1 AND serialized_asset_id = $2`,
        [tenantId, assetId],
      )) as Array<{ count: number }>;
      return rows[0]?.count ?? 0;
    });
  }

  async function findOpenLoan(
    assetId: string,
  ): Promise<{ id: string; removedAt: Date | null } | null> {
    return runInTenantSchema(dataSource, schemaName, async (qr) => {
      const rows = (await qr.query(
        `SELECT id::text AS id, removed_at AS "removedAt"
         FROM asset_loan_assignments
         WHERE tenant_id = $1
           AND serialized_asset_id = $2
           AND removed_at IS NULL
         LIMIT 1`,
        [tenantId, assetId],
      )) as Array<{ id: string; removedAt: Date | null }>;
      return rows[0] ?? null;
    });
  }

  async function queryLoanRow(assetId: string) {
    return runInTenantSchema(dataSource, schemaName, async (qr) => {
      const rows = (await qr.query(
        `SELECT subscriber_ref_id::text AS "subscriberRefId",
                contract_ref_id::text AS "contractRefId",
                stock_movement_id::text AS "stockMovementId",
                removed_at AS "removedAt"
         FROM asset_loan_assignments
         WHERE tenant_id = $1 AND serialized_asset_id = $2`,
        [tenantId, assetId],
      )) as Array<{
        subscriberRefId: string;
        contractRefId: string | null;
        stockMovementId: string;
        removedAt: Date | null;
      }>;
      return rows[0] ?? null;
    });
  }

  async function findCustomerSiteForSubscriber(subscriberId: string): Promise<string | null> {
    return runInTenantSchema(dataSource, schemaName, async (qr) => {
      const rows = (await qr.query(
        `SELECT id::text AS id
         FROM stock_locations
         WHERE tenant_id = $1
           AND type = 'CUSTOMER_SITE'
           AND responsible_ref_id = $2
         LIMIT 1`,
        [tenantId, subscriberId],
      )) as Array<{ id: string }>;
      return rows[0]?.id ?? null;
    });
  }

  it('alta en OT, idempotencia al reprocesar y cierre en retorno (misma TX real)', async () => {
    const runId = Date.now().toString(36);
    const executionOrderId = nextEv1Uuid();
    const { assetId, serialNumber } = await seedAssetAtTechnician(runId);
    const idempotencyKey = `ev1-loan-install:${runId}`;

    let customerSiteId = '';

    await TenantContext.run({ tenantId, schemaName, tenantSlug: syntheticTenantSlug }, async () => {
      const installResult = await ledgerService.recordExecutionOrderMovement(
        {
          executionOrderId,
          itemId,
          technicianCustodyId: techLocationId,
          quantity: 1,
          serialNumber,
          subscriberId: SUBSCRIBER_REF_ID,
          contractRefId: CONTRACT_REF_ID,
          action: ExecutionOrderItemAction.INSTALL,
          finalDisposition: InventoryDisposition.INSTALLED_AT_CUSTOMER,
          idempotencyKey,
        },
        actor,
      );

      const openLoan = await findOpenLoan(assetId);
      expect(openLoan).not.toBeNull();

      expect(await countLoansForAsset(assetId)).toBe(1);

      const loanRow = await queryLoanRow(assetId);

      expect(loanRow).toMatchObject({
        subscriberRefId: SUBSCRIBER_REF_ID,
        contractRefId: CONTRACT_REF_ID,
        stockMovementId: installResult.movement.id,
        removedAt: null,
      });

      const replayResult = await ledgerService.recordExecutionOrderMovement(
        {
          executionOrderId,
          itemId,
          technicianCustodyId: techLocationId,
          quantity: 1,
          serialNumber,
          subscriberId: SUBSCRIBER_REF_ID,
          contractRefId: CONTRACT_REF_ID,
          action: ExecutionOrderItemAction.INSTALL,
          finalDisposition: InventoryDisposition.INSTALLED_AT_CUSTOMER,
          idempotencyKey,
        },
        actor,
      );

      expect(replayResult.movement.id).toBe(installResult.movement.id);
      expect(await countLoansForAsset(assetId)).toBe(1);

      customerSiteId = (await findCustomerSiteForSubscriber(SUBSCRIBER_REF_ID)) ?? '';
      expect(customerSiteId).toBeTruthy();

      await ledgerService.recordReturn(
        {
          itemId,
          sourceLocationId: customerSiteId,
          destinationLocationId: mainLocationId,
          quantity: 1,
          serializedAssetId: assetId,
          targetStatus: SerializedAssetStatus.IN_TRANSIT,
          idempotencyKey: `ev1-loan-return:${runId}`,
        },
        actor,
      );

      const closedLoan = await queryLoanRow(assetId);

      expect(closedLoan?.removedAt).not.toBeNull();
      expect(await findOpenLoan(assetId)).toBeNull();
    });
  }, 120_000);

  it('cierre en baja cuando hay comodato abierto', async () => {
    const runId = `wo-${Date.now().toString(36)}`;
    const executionOrderId = nextEv1Uuid();
    const { assetId, serialNumber } = await seedAssetAtTechnician(runId);

    await TenantContext.run({ tenantId, schemaName, tenantSlug: syntheticTenantSlug }, async () => {
      const installResult = await ledgerService.recordExecutionOrderMovement(
        {
          executionOrderId,
          itemId,
          technicianCustodyId: techLocationId,
          quantity: 1,
          serialNumber,
          subscriberId: SUBSCRIBER_REF_ID,
          action: ExecutionOrderItemAction.INSTALL,
          finalDisposition: InventoryDisposition.INSTALLED_AT_CUSTOMER,
          idempotencyKey: `ev1-loan-wo-install:${runId}`,
        },
        actor,
      );

      const openLoan = await findOpenLoan(assetId);
      expect(openLoan).not.toBeNull();

      const customerSiteId = await findCustomerSiteForSubscriber(SUBSCRIBER_REF_ID);
      expect(customerSiteId).toBeTruthy();

      await runInTenantSchema(dataSource, schemaName, async (qr) => {
        await qr.query(
          `INSERT INTO stock_balances (
             tenant_id, item_id, location_id, lot_id, condition,
             quantity_on_hand, quantity_reserved
           ) VALUES ($1, $2, $3, NULL, 'NEW', 1.00, 0.00)
           ON CONFLICT DO NOTHING`,
          [tenantId, itemId, customerSiteId],
        );
        await qr.query(
          `UPDATE stock_balances
           SET quantity_on_hand = GREATEST(quantity_on_hand, 1.00)
           WHERE tenant_id = $1 AND item_id = $2 AND location_id = $3
             AND lot_id IS NULL AND condition = 'NEW'`,
          [tenantId, itemId, customerSiteId],
        );
      });

      await ledgerService.recordWriteOff(
        {
          serializedAssetId: assetId,
          itemId,
          locationId: customerSiteId,
          quantity: 1,
          reason: WriteOffReason.LOST,
          idempotencyKey: `ev1-loan-writeoff:${runId}`,
        },
        actor,
      );

      const closedLoan = await queryLoanRow(assetId);

      expect(closedLoan?.removedAt).not.toBeNull();
      expect(await findOpenLoan(assetId)).toBeNull();
    });
  }, 120_000);

  it('retorno sin comodato abierto no falla (D-F5-13)', async () => {
    const runId = `orphan-${Date.now().toString(36)}`;
    const { assetId } = await seedAssetAtTechnician(runId);

    await TenantContext.run({ tenantId, schemaName, tenantSlug: syntheticTenantSlug }, async () => {
      expect(await findOpenLoan(assetId)).toBeNull();

      const returnResult = await ledgerService.recordReturn(
        {
          itemId,
          sourceLocationId: techLocationId,
          destinationLocationId: mainLocationId,
          quantity: 1,
          serializedAssetId: assetId,
          targetStatus: SerializedAssetStatus.IN_TRANSIT,
          idempotencyKey: `ev1-loan-orphan-return:${runId}`,
        },
        actor,
      );

      expect(returnResult.movement.id).toBeTruthy();
      expect(await countLoansForAsset(assetId)).toBe(0);
    });
  }, 120_000);
});
