/**
 * EV-1 — Smoke transaccional real (PostgreSQL) para reservas efectivas Fase 03B.
 *
 * Prueba el invariante y el ciclo create → transfer 400 → dispatch/cancel
 * contra EntityManager/TypeORM reales (no mocks).
 *
 * Ejecutar:
 *   EV1_REAL_DB=1 pnpm --filter @iwana/api test -- stock-reservations.transactional.ev1.spec.ts --coverage=false
 *
 * Sin EV1_REAL_DB=1 la suite se omite (no falla CI local sin intención).
 */
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { BadRequestException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  StockBalance,
  StockIssue,
  StockIssueLine,
  StockLocation,
  StockMovement,
  StockMovementLine,
  TenantContext,
  runInTenantSchema,
} from '@iwana/db';
import {
  StockBalanceCondition,
  StockIssueType,
  StockLocationStatus,
  StockLocationType,
  UserRole,
} from '@iwana/shared';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { StockBalanceService } from '../services/stock-balance.service';
import { StockIssueService } from '../services/stock-issue.service';
import { StockLedgerService } from '../services/stock-ledger.service';

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

const enabled = process.env.EV1_REAL_DB === '1';

const actor: JwtPayload = {
  sub: '00000000-0000-4000-8000-0000000000e1',
  email: 'ev1-reservations@example.test',
  role: UserRole.ADMIN,
  tenantId: '00000000-0000-4000-8000-000000000000',
  schemaName: 'tenant_iwana',
  jti: 'jti-ev1-reservations',
  type: 'tenant',
};

(enabled ? describe : describe.skip)('EV-1 reservas transaccionales (DB real)', () => {
  let dataSource: DataSource;
  let tenantId: string;
  let schemaName: string;
  let balanceService: StockBalanceService;
  let issueService: StockIssueService;
  let ledgerService: StockLedgerService;

  let mainLocationId: string;
  let otherWarehouseId: string;
  let itemId: string;
  let createdIssueIds: string[] = [];

  beforeAll(async () => {
    dataSource = new DataSource({
      type: 'postgres',
      host: process.env.DB_HOST ?? 'localhost',
      port: Number.parseInt(process.env.DB_PORT ?? '5433', 10),
      username: process.env.DB_USER ?? 'iwana',
      password: process.env.DB_PASSWORD ?? '',
      database: process.env.DB_NAME ?? 'dbiw',
      entities: [
        StockBalance,
        StockIssue,
        StockIssueLine,
        StockLocation,
        StockMovement,
        StockMovementLine,
      ],
      synchronize: false,
      logging: false,
    });
    await dataSource.initialize();

    const tenants = (await dataSource.query(
      `SELECT id::text AS id, schema_name AS "schemaName"
       FROM public.tenants
       WHERE schema_name = 'tenant_iwana'
       LIMIT 1`,
    )) as Array<{ id: string; schemaName: string }>;

    if (!tenants[0]) {
      throw new Error('No existe tenant con schema tenant_iwana para EV-1.');
    }

    tenantId = tenants[0].id;
    schemaName = tenants[0].schemaName;
    actor.tenantId = tenantId;
    actor.schemaName = schemaName;

    balanceService = new StockBalanceService(dataSource);
    ledgerService = new StockLedgerService(
      dataSource,
      balanceService,
      {
        resolveForMovementWithManager: jest.fn(),
        transitionAssetWithManager: jest.fn(),
      } as never,
      { recordWithManager: jest.fn() } as never,
      { resolveSealedUnitCostWithManager: jest.fn().mockResolvedValue(null) } as never,
      { openLoanWithManager: jest.fn(), closeOpenLoanWithManager: jest.fn() } as never,
      {
        captureItemSnapshots: jest.fn().mockResolvedValue(new Map()),
        publishAfterCommittedMovement: jest.fn(),
      } as never,
    );
    issueService = new StockIssueService(dataSource, ledgerService, balanceService, {
      captureItemSnapshots: jest.fn().mockResolvedValue(new Map()),
      publishAfterCommittedMovement: jest.fn(),
    } as never);

    await runInTenantSchema(dataSource, schemaName, async (qr) => {
      const main = await qr.manager.findOne(StockLocation, {
        where: { tenantId, type: StockLocationType.MAIN_WAREHOUSE },
      });
      if (!main) {
        throw new Error('EV-1 requiere una bodega MAIN_WAREHOUSE en tenant_iwana.');
      }
      mainLocationId = main.id;

      let otherWarehouse = await qr.manager
        .createQueryBuilder(StockLocation, 'loc')
        .where('loc.tenant_id = :tenantId', { tenantId })
        .andWhere('loc.type = :type', { type: StockLocationType.MAIN_WAREHOUSE })
        .andWhere('loc.id <> :mainId', { mainId: mainLocationId })
        .getOne();

      if (!otherWarehouse) {
        otherWarehouse = await qr.manager.save(
          StockLocation,
          qr.manager.create(StockLocation, {
            tenantId,
            code: 'EV1-BOD',
            name: 'EV1 bodega secundaria',
            type: StockLocationType.OFFICE_STOCK,
            status: StockLocationStatus.ACTIVE,
            responsibleRefId: null,
            maxCapacity: null,
          }),
        );
      }
      otherWarehouseId = otherWarehouse.id;

      const items = (await qr.query(
        `SELECT id::text AS id
         FROM inventory_items
         WHERE tenant_id = $1
         ORDER BY created_at ASC
         LIMIT 1`,
        [tenantId],
      )) as Array<{ id: string }>;
      if (!items[0]) {
        throw new Error('EV-1 requiere al menos un inventory_item en tenant_iwana.');
      }
      itemId = items[0].id;

      await qr.query(
        `INSERT INTO stock_balances (
           tenant_id, item_id, location_id, lot_id, condition,
           quantity_on_hand, quantity_reserved
         ) VALUES ($1, $2, $3, NULL, 'NEW', 20.00, 0.00)
         ON CONFLICT DO NOTHING`,
        [tenantId, itemId, mainLocationId],
      );

      await qr.query(
        `UPDATE stock_balances
         SET quantity_on_hand = GREATEST(quantity_on_hand, 20.00),
             quantity_reserved = 0.00
         WHERE tenant_id = $1
           AND item_id = $2
           AND location_id = $3
           AND lot_id IS NULL
           AND condition = 'NEW'`,
        [tenantId, itemId, mainLocationId],
      );
    });
  }, 60_000);

  afterAll(async () => {
    if (!dataSource?.isInitialized) {
      return;
    }

    await TenantContext.run({ tenantId, schemaName, tenantSlug: 'iwana' }, async () => {
      for (const issueId of createdIssueIds) {
        try {
          await issueService.cancel(issueId, actor);
        } catch {
          // ya terminal o inexistente
        }
      }
    });

    await runInTenantSchema(dataSource, schemaName, async (qr) => {
      if (createdIssueIds.length > 0) {
        await qr.query(`DELETE FROM stock_issue_lines WHERE issue_id = ANY($1::uuid[])`, [
          createdIssueIds,
        ]);
        await qr.query(`DELETE FROM stock_issues WHERE id = ANY($1::uuid[])`, [createdIssueIds]);
      }

      await qr.query(
        `UPDATE stock_balances
         SET quantity_reserved = 0.00
         WHERE tenant_id = $1 AND item_id = $2 AND location_id = $3 AND lot_id IS NULL`,
        [tenantId, itemId, mainLocationId],
      );

      await qr.query(`DELETE FROM stock_locations WHERE tenant_id = $1 AND code = 'EV1-BOD'`, [
        tenantId,
      ]);
    });

    await dataSource.destroy();
  }, 60_000);

  async function readAvailability() {
    return runInTenantSchema(dataSource, schemaName, async (qr) =>
      balanceService.getAvailabilityWithManager(qr.manager, tenantId, {
        itemId,
        locationId: mainLocationId,
        lotId: null,
        condition: StockBalanceCondition.NEW,
      }),
    );
  }

  it('reserva al crear; transferencia sobre comprometido falla; cancel libera; despacho libera y descuenta', async () => {
    await TenantContext.run({ tenantId, schemaName, tenantSlug: 'iwana' }, async () => {
      const before = await readAvailability();
      expect(before.onHand).toBeGreaterThanOrEqual(10);
      expect(before.reserved).toBe(0);

      const issueA = await issueService.create(
        {
          type: StockIssueType.SALE_DISPATCH,
          sourceLocationId: mainLocationId,
          originRefId: '00000000-0000-4000-8000-0000000000c1',
          lines: [
            {
              itemId,
              requestedQty: 5,
              condition: StockBalanceCondition.NEW,
            },
          ],
        },
        actor,
      );
      createdIssueIds.push(issueA.id);

      const afterCreate = await readAvailability();
      expect(afterCreate.onHand).toBe(before.onHand);
      expect(afterCreate.reserved).toBe(5);
      expect(afterCreate.available).toBe(before.onHand - 5);

      await expect(
        ledgerService.transfer(
          {
            itemId,
            sourceLocationId: mainLocationId,
            destinationLocationId: otherWarehouseId,
            quantity: before.onHand,
            condition: StockBalanceCondition.NEW,
            handoffReference: 'EV1-ACTA-OVERSELL',
          },
          actor,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);

      await expect(
        ledgerService.transfer(
          {
            itemId,
            sourceLocationId: mainLocationId,
            destinationLocationId: otherWarehouseId,
            quantity: before.onHand,
            condition: StockBalanceCondition.NEW,
            handoffReference: 'EV1-ACTA-OVERSELL',
          },
          actor,
        ),
      ).rejects.toThrow(/comprometidos|disponible suficiente/);

      const stillReserved = await readAvailability();
      expect(stillReserved.reserved).toBe(5);
      expect(stillReserved.onHand).toBe(before.onHand);

      const issueB = await issueService.create(
        {
          type: StockIssueType.SALE_DISPATCH,
          sourceLocationId: mainLocationId,
          originRefId: '00000000-0000-4000-8000-0000000000c2',
          lines: [
            {
              itemId,
              requestedQty: 2,
              condition: StockBalanceCondition.NEW,
            },
          ],
        },
        actor,
      );
      createdIssueIds.push(issueB.id);

      const afterSecond = await readAvailability();
      expect(afterSecond.reserved).toBe(7);

      await issueService.cancel(issueB.id, actor);
      createdIssueIds = createdIssueIds.filter((id) => id !== issueB.id);

      const afterCancel = await readAvailability();
      expect(afterCancel.reserved).toBe(5);
      expect(afterCancel.onHand).toBe(before.onHand);

      const dispatched = await issueService.dispatch(
        issueA.id,
        {
          handoffMethod: 'ACTA',
          handoffNotes: 'EV1 despacho',
          handoffAttachments: [],
        },
        actor,
      );
      createdIssueIds = createdIssueIds.filter((id) => id !== issueA.id);

      expect(dispatched.stockMovementId).toBeTruthy();

      const afterDispatch = await readAvailability();
      expect(afterDispatch.reserved).toBe(0);
      expect(afterDispatch.onHand).toBe(before.onHand - 5);
    });
  }, 120_000);

  it('rechaza applyDelta que dejaría existencia bajo lo reservado (invariante real)', async () => {
    await TenantContext.run({ tenantId, schemaName, tenantSlug: 'iwana' }, async () => {
      const issue = await issueService.create(
        {
          type: StockIssueType.SALE_DISPATCH,
          sourceLocationId: mainLocationId,
          originRefId: '00000000-0000-4000-8000-0000000000c3',
          lines: [
            {
              itemId,
              requestedQty: 4,
              condition: StockBalanceCondition.NEW,
            },
          ],
        },
        actor,
      );
      createdIssueIds.push(issue.id);

      const availability = await readAvailability();
      expect(availability.reserved).toBeGreaterThanOrEqual(4);

      await expect(
        runInTenantSchema(dataSource, schemaName, async (qr) =>
          balanceService.applyDeltaWithManager(qr.manager, {
            tenantId,
            itemId,
            locationId: mainLocationId,
            lotId: null,
            condition: StockBalanceCondition.NEW,
            delta: -(availability.onHand - availability.reserved + 1),
            reservedDelta: 0,
          }),
        ),
      ).rejects.toThrow(/comprometido|existencia/);

      await issueService.cancel(issue.id, actor);
      createdIssueIds = createdIssueIds.filter((id) => id !== issue.id);
    });
  }, 120_000);

  it('dos reservas concurrentes sobre la misma tupla no sobre-reservan (advisory lock)', async () => {
    await TenantContext.run({ tenantId, schemaName, tenantSlug: 'iwana' }, async () => {
      const before = await readAvailability();
      expect(before.reserved).toBe(0);

      // Ambas transacciones se abren en paralelo contra la misma tupla.
      // Sin el advisory lock, la segunda pisaría la lectura de la primera (lost update)
      // y el reservado final sería 3 en vez de 6.
      const reserveThree = async () =>
        // runInTenantSchema abre su propio QueryRunner + transacción,
        // por lo que cada llamada corre sobre una conexión distinta (concurrencia real).
        runInTenantSchema(dataSource, schemaName, async (qr) =>
          balanceService.applyDeltaWithManager(qr.manager, {
            tenantId,
            itemId,
            locationId: mainLocationId,
            lotId: null,
            condition: StockBalanceCondition.NEW,
            delta: 0,
            reservedDelta: 3,
          }),
        );

      const results = await Promise.allSettled([reserveThree(), reserveThree()]);
      const rejected = results.filter((r) => r.status === 'rejected');
      expect(rejected).toHaveLength(0);

      const after = await readAvailability();
      expect(after.onHand).toBe(before.onHand);
      expect(after.reserved).toBe(6);
      expect(after.available).toBe(before.onHand - 6);

      await runInTenantSchema(dataSource, schemaName, async (qr) => {
        await qr.query(
          `UPDATE stock_balances
           SET quantity_reserved = 0.00
           WHERE tenant_id = $1
             AND item_id = $2
             AND location_id = $3
             AND lot_id IS NULL
             AND condition = 'NEW'`,
          [tenantId, itemId, mainLocationId],
        );
      });
    });
  }, 120_000);
});
