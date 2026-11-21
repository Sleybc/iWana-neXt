import { randomBytes, randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { AssetLoanAssignment, resolveMigrationDbCredentials, TenantContext } from '@iwana/db';
import type { SubscriberEquipmentResponse } from '@iwana/shared';
import {
  applyTenantMigrationsInOrder,
  createTenantDataSource,
} from '../../../../../../packages/database/src/migrations/tenant/runner';
import { GetSubscriberEquipmentQuerySchema } from '../dto';
import { AssetLoanService } from '../services/asset-loan.service';
import { ephemeralSchemaName } from '../../../../../../packages/database/test/ephemeral-schema';

/**
 * Lectura de equipos del suscriptor (spec 2026-11-16 §2.1, §4; CA-4 y CA-5) contra
 * PostgreSQL real con la cadena de migraciones tenant vigente.
 */
const dbAvailable = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const describeWithDb = dbAvailable ? describe : describe.skip;
const schemaA = ephemeralSchemaName('tenant_sub_equip_');
const schemaB = ephemeralSchemaName('tenant_sub_equip_');
const allowedDatabaseName = /^(dbiw|test|iwana_it_[a-z0-9_]+)$/u;

if (dbAvailable && !allowedDatabaseName.test(process.env['DB_NAME'] ?? '')) {
  throw new Error(
    'Integración SubscriberEquipment: DB_NAME debe ser dbiw, test o iwana_it_*; solo se crean y eliminan schemas efímeros.',
  );
}

const PRIVATE_NOTE = 'Nota libre con dato personal de prueba';

describeWithDb('GET subscribers/:id/equipment — lectura MOD12 en PostgreSQL', () => {
  let dataSource: DataSource;
  let service: AssetLoanService;
  const tenantA = randomUUID();
  const tenantB = randomUUID();

  // Suscriptores (referencias opacas a CRM).
  const subA = randomUUID();
  const subB = randomUUID();
  const subC = randomUUID();

  // Activos: X pasa por A y luego por B; Y sigue con A; Z es de C.
  let assetX: string;
  let assetY: string;
  let assetZ: string;
  let materialItemId: string;
  const otA = randomUUID();
  const ids: Record<string, string> = {};

  // Línea de tiempo del activo X (CA-4).
  const t = {
    received: '2026-01-05T08:00:00.000Z',
    installA: '2026-02-01T10:00:00.000Z',
    installAEvent: '2026-02-01T09:59:59.950Z', // la transacción arranca antes del comodato
    beforeInstallA: '2026-02-01T09:59:59.999Z',
    repairA: '2026-02-10T12:00:00.000Z',
    removeA: '2026-03-01T15:00:00.000Z',
    afterRemoveA: '2026-03-01T15:00:00.001Z',
    warehouse: '2026-03-15T09:00:00.000Z',
    installB: '2026-04-01T11:00:00.000Z',
    installBEvent: '2026-04-01T10:59:59.950Z',
    duringB: '2026-05-01T08:00:00.000Z',
    installY: '2026-06-01T10:00:00.000Z',
    installYEvent: '2026-06-01T09:59:59.950Z',
  };

  function asTenant<T>(tenantId: string, schemaName: string, fn: () => Promise<T>): Promise<T> {
    return TenantContext.run({ tenantId, schemaName, tenantSlug: 'sub-equip' }, fn);
  }

  function read(subscriberRefId: string, query: Record<string, unknown> = {}) {
    return asTenant(tenantA, schemaA, () =>
      service.getSubscriberEquipment(
        subscriberRefId,
        GetSubscriberEquipmentQuerySchema.parse(query),
      ),
    );
  }

  beforeAll(async () => {
    const credentials = resolveMigrationDbCredentials();
    dataSource = new DataSource({
      type: 'postgres',
      host: process.env['DB_HOST'] ?? '127.0.0.1',
      port: Number.parseInt(process.env['DB_PORT'] ?? '5433', 10),
      username: credentials.username,
      password: credentials.password,
      database: process.env['DB_NAME'] ?? 'dbiw',
      entities: [AssetLoanAssignment],
      migrations: [],
      synchronize: false,
      logging: false,
      extra: { max: 2, min: 1, connectionTimeoutMillis: 5_000 },
    });
    await dataSource.initialize();

    await createTenantSchema(schemaA, tenantA);
    await createTenantSchema(schemaB, tenantB);
    service = new AssetLoanService(dataSource);
    await seedTenantA();
  }, 240_000);

  afterAll(async () => {
    if (!dataSource?.isInitialized) return;
    await dataSource.query(`DROP SCHEMA IF EXISTS "${schemaA}" CASCADE`);
    await dataSource.query(`DROP SCHEMA IF EXISTS "${schemaB}" CASCADE`);
    await dataSource.query('DELETE FROM public.tenants WHERE id = ANY($1::uuid[])', [
      [tenantA, tenantB],
    ]);
    await dataSource.destroy();
  });

  async function createTenantSchema(schemaName: string, tenantId: string): Promise<void> {
    await dataSource.query(
      `INSERT INTO public.tenants (id, name, slug, schema_name, status, contact_email)
       VALUES ($1, $2, $3, $4, 'ACTIVE', $5)`,
      [
        tenantId,
        'Equipos del suscriptor sintético',
        `sub-equip-${tenantId.slice(0, 8)}`,
        schemaName,
        'sub-equip@example.invalid',
      ],
    );
    await dataSource.query(`CREATE SCHEMA "${schemaName}"`);
    const tenantDataSource = createTenantDataSource(
      dataSource,
      schemaName,
      `sub-equip-${schemaName}`,
    );
    await tenantDataSource.initialize();
    try {
      await applyTenantMigrationsInOrder(tenantDataSource);
    } finally {
      await tenantDataSource.destroy();
    }
  }

  async function one<T = { id: string }>(sql: string, params: unknown[]): Promise<T> {
    const rows = (await dataSource.query(sql, params)) as T[];
    return rows[0]!;
  }

  async function insertAsset(itemId: string, serial: string, mac: string | null, status: string) {
    const row = await one(
      `INSERT INTO "${schemaA}".serialized_assets (
         tenant_id, inventory_item_id, current_status, serial_number, mac_address,
         purchase_date, useful_life_months, warranty_until
       ) VALUES ($1, $2, $3, $4, $5, '2026-01-01', 60, '2027-01-01')
       RETURNING id::text AS id`,
      [tenantA, itemId, status, serial, mac],
    );
    return row.id;
  }

  async function insertMovement(
    key: string,
    createdAt: string,
    opts: { context?: string; refId?: string | null; isReversal?: boolean } = {},
  ): Promise<string> {
    const row = await one(
      `INSERT INTO "${schemaA}".stock_movements (
         tenant_id, movement_number, origin, origin_context, origin_ref_id, idempotency_key,
         notes, is_reversal, created_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id::text AS id`,
      [
        tenantA,
        `MOV-${key}`,
        opts.isReversal ? 'EXECUTION_ORDER_REVERSAL' : 'EXECUTION_ORDER',
        opts.context ?? 'tasks.execution-order',
        opts.refId === undefined ? otA : opts.refId,
        `idem-${key}-${randomBytes(3).toString('hex')}`,
        PRIVATE_NOTE,
        opts.isReversal ?? false,
        createdAt,
      ],
    );
    ids[key] = row.id;
    return row.id;
  }

  async function insertLoan(
    assetId: string,
    subscriberRefId: string,
    installedAt: string,
    removedAt: string | null,
    movementId: string | null,
  ): Promise<string> {
    const row = await one(
      `INSERT INTO "${schemaA}".asset_loan_assignments (
         tenant_id, serialized_asset_id, subscriber_ref_id, contract_ref_id, installed_at,
         removed_at, execution_order_ref_id, stock_movement_id
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id::text AS id`,
      [tenantA, assetId, subscriberRefId, randomUUID(), installedAt, removedAt, otA, movementId],
    );
    return row.id;
  }

  async function insertEvent(
    key: string,
    assetId: string,
    eventType: string,
    createdAt: string,
    movementId: string | null = null,
  ): Promise<void> {
    const row = await one(
      `INSERT INTO "${schemaA}".asset_lifecycle_events (
         tenant_id, serialized_asset_id, event_type, notes, stock_movement_id, created_at
       ) VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id::text AS id`,
      [tenantA, assetId, eventType, PRIVATE_NOTE, movementId, createdAt],
    );
    ids[key] = row.id;
  }

  async function insertLine(
    movementId: string,
    itemId: string,
    locationId: string,
    quantity: number,
    serializedAssetId: string | null = null,
  ): Promise<void> {
    await dataSource.query(
      `INSERT INTO "${schemaA}".stock_movement_lines (
         tenant_id, movement_id, item_id, location_id, quantity, serialized_asset_id
       ) VALUES ($1, $2, $3, $4, $5, $6)`,
      [tenantA, movementId, itemId, locationId, quantity, serializedAssetId],
    );
  }

  async function insertCustomerSite(subscriberRefId: string, code: string): Promise<string> {
    const row = await one(
      `INSERT INTO "${schemaA}".stock_locations (tenant_id, code, name, type, responsible_ref_id)
       VALUES ($1, $2, 'Sitio sintético', 'CUSTOMER_SITE', $3)
       RETURNING id::text AS id`,
      [tenantA, code, subscriberRefId],
    );
    return row.id;
  }

  async function seedTenantA(): Promise<void> {
    const suffix = randomBytes(4).toString('hex');
    const category = await one(
      `INSERT INTO "${schemaA}".inventory_categories (tenant_id, code, code_prefix, name)
       VALUES ($1, $2, $3, 'Categoría sintética') RETURNING id::text AS id`,
      [tenantA, `CAT-${suffix}`, suffix.slice(0, 3)],
    );
    const serialItem = await one(
      `INSERT INTO "${schemaA}".inventory_items (
         tenant_id, sku, name, model, category, category_id, tracking_mode, unit_of_measure
       ) VALUES ($1, $2, 'ONT GPON sintética', 'HG-SINT', 'CPE', $3, 'SERIALIZED', 'UNIT')
       RETURNING id::text AS id`,
      [tenantA, `SKU-S-${suffix}`, category.id],
    );
    const materialItem = await one(
      `INSERT INTO "${schemaA}".inventory_items (
         tenant_id, sku, name, category, category_id, tracking_mode, unit_of_measure
       ) VALUES ($1, $2, 'Cable drop sintético', 'CPE', $3, 'CONSUMABLE', 'METER')
       RETURNING id::text AS id`,
      [tenantA, `SKU-M-${suffix}`, category.id],
    );
    materialItemId = materialItem.id;

    assetX = await insertAsset(
      serialItem.id,
      'SN-SINT-X',
      '00:11:22:33:44:01',
      'INSTALLED_COMODATO',
    );
    assetY = await insertAsset(serialItem.id, 'SN-SINT-Y', null, 'INSTALLED_COMODATO');
    assetZ = await insertAsset(serialItem.id, 'SN-SINT-Z', null, 'INSTALLED_COMODATO');

    // Activo X: bodega → cliente A → bodega → cliente B.
    const movInstallA = await insertMovement('installA', t.installAEvent);
    const movInstallB = await insertMovement('installB', t.installBEvent);
    const movInstallY = await insertMovement('installY', t.installYEvent);
    await insertLoan(assetX, subA, t.installA, t.removeA, movInstallA);
    await insertLoan(assetX, subB, t.installB, null, movInstallB);
    await insertLoan(assetY, subA, t.installY, null, movInstallY);
    await insertLoan(assetZ, subC, t.installA, null, null);

    await insertEvent('received', assetX, 'RECEIVED', t.received);
    await insertEvent('installAEvent', assetX, 'INSTALLED', t.installAEvent, movInstallA);
    await insertEvent('beforeInstallA', assetX, 'STATUS_CHANGED', t.beforeInstallA);
    await insertEvent('atInstallA', assetX, 'STATUS_CHANGED', t.installA);
    await insertEvent('repairA', assetX, 'REPAIRED', t.repairA);
    await insertEvent('closeA', assetX, 'RETURNED', t.removeA);
    await insertEvent('afterRemoveA', assetX, 'TRANSFERRED', t.afterRemoveA);
    await insertEvent('warehouse', assetX, 'REFURBISHED', t.warehouse);
    await insertEvent('installBEvent', assetX, 'INSTALLED', t.installBEvent, movInstallB);
    await insertEvent('duringB', assetX, 'STATUS_CHANGED', t.duringB);
    await insertEvent('installYEvent', assetY, 'INSTALLED', t.installYEvent, movInstallY);
    await insertEvent('zEvent', assetZ, 'STATUS_CHANGED', t.duringB);

    // Materiales en el sitio de A.
    const siteA = await insertCustomerSite(subA, `CS-A-${suffix}`);
    const siteC = await insertCustomerSite(subC, `CS-C-${suffix}`);
    const movMatOt = await insertMovement('matOt', '2026-06-10T10:00:00.000Z');
    await insertLine(movMatOt, materialItemId, siteA, 1.5); // dos lotes del mismo ítem
    await insertLine(movMatOt, materialItemId, siteA, 1.5);
    await insertLine(movMatOt, serialItem.id, siteA, 1, assetY); // serializado: fuera
    const movTransfer = await insertMovement('matTransfer', '2026-06-20T10:00:00.000Z', {
      context: 'inventory.transfer',
      refId: 'REF-INTERNA-TRANSFER',
    });
    await insertLine(movTransfer, materialItemId, siteA, 4);
    const movNegative = await insertMovement('matNegative', '2026-06-25T10:00:00.000Z');
    await insertLine(movNegative, materialItemId, siteA, -2); // salida: fuera
    const movReversed = await insertMovement('matReversed', '2026-06-26T10:00:00.000Z');
    await insertLine(movReversed, materialItemId, siteA, 7);
    const movReversal = await insertMovement('matReversal', '2026-06-27T10:00:00.000Z', {
      refId: movReversed,
      isReversal: true,
    });
    await insertLine(movReversal, materialItemId, siteA, -7);
    await dataSource.query(
      `UPDATE "${schemaA}".stock_movements SET reversed_by_movement_id = $1 WHERE id = $2`,
      [movReversal, movReversed],
    );
    const movOther = await insertMovement('matOther', '2026-06-28T10:00:00.000Z');
    await insertLine(movOther, materialItemId, siteC, 9); // otro suscriptor: fuera
  }

  function eventIds(response: SubscriberEquipmentResponse): string[] {
    return response.history.items.map((item) => item.id);
  }

  describe('CA-4 — historial recortado por periodo de comodato', () => {
    it('A ve solo su periodo, con los bordes installedAt y removedAt y el evento de cierre', async () => {
      const response = await read(subA, { historyAssetId: assetX });

      expect(eventIds(response)).toEqual([
        ids['closeA'],
        ids['repairA'],
        ids['atInstallA'],
        ids['installAEvent'],
      ]);
      expect(eventIds(response)).not.toContain(ids['beforeInstallA']);
      expect(eventIds(response)).not.toContain(ids['afterRemoveA']);
      expect(eventIds(response)).not.toContain(ids['received']);
      expect(eventIds(response)).not.toContain(ids['warehouse']);
      expect(eventIds(response)).not.toContain(ids['installBEvent']);
      expect(eventIds(response)).not.toContain(ids['duringB']);
    });

    it('B no ve eventos del periodo de A ni de bodega', async () => {
      const response = await read(subB);

      expect(eventIds(response)).toEqual([ids['duringB'], ids['installBEvent']]);
      expect(response.equipment.map((item) => item.assetId)).toEqual([assetX]);
      expect(response.equipment[0]!.removedAt).toBeNull();
    });
  });

  describe('CA-5 — aislamiento por tenant', () => {
    it('el mismo subscriberRefId desde otro tenant devuelve colecciones vacías', async () => {
      const fromOtherTenant = await asTenant(tenantB, schemaB, () =>
        service.getSubscriberEquipment(subA, GetSubscriberEquipmentQuerySchema.parse({})),
      );
      const unknownSubscriber = await read(randomUUID());

      expect(fromOtherTenant.equipment).toEqual([]);
      expect(fromOtherTenant.materials.items).toEqual([]);
      expect(fromOtherTenant.materials.meta.total).toBe(0);
      expect(fromOtherTenant.history.items).toEqual([]);
      expect(fromOtherTenant.history.meta.total).toBe(0);
      // «No existe» y «otro tenant» responden exactamente igual.
      expect(fromOtherTenant).toEqual(unknownSubscriber);
    });

    it('filtra por tenant_id aunque el schema sea el mismo', async () => {
      const response = await asTenant(tenantB, schemaA, () =>
        service.getSubscriberEquipment(subA, GetSubscriberEquipmentQuerySchema.parse({})),
      );

      expect(response.equipment).toEqual([]);
      expect(response.materials.items).toEqual([]);
      expect(response.history.items).toEqual([]);
    });
  });

  it('equipment: abiertos primero, datos del activo y vida útil de la ficha 360', async () => {
    const response = await read(subA);

    expect(response.equipment.map((item) => item.assetId)).toEqual([assetY, assetX]);
    const closed = response.equipment[1]!;
    expect(closed).toEqual({
      loanId: expect.any(String),
      assetId: assetX,
      itemName: 'ONT GPON sintética',
      model: 'HG-SINT',
      serialNumber: 'SN-SINT-X',
      macAddress: '00:11:22:33:44:01',
      status: 'INSTALLED_COMODATO',
      installedAt: t.installA,
      removedAt: t.removeA,
      executionOrderRefId: otA,
      contractRefId: expect.any(String),
      usefulLife: {
        monthsTotal: 60,
        monthsElapsed: expect.any(Number),
        monthsRemaining: expect.any(Number),
        warrantyUntil: '2027-01-01',
        status: expect.stringMatching(/^(vigente|por-vencer|vencida)$/u),
      },
    });
  });

  it('claves exactas por sección: sin notes ni referencias del movimiento', async () => {
    const response = await read(subA);
    const serialized = JSON.stringify(response);

    expect(Object.keys(response).sort()).toEqual(['equipment', 'history', 'materials']);
    expect(Object.keys(response.equipment[0]!).sort()).toEqual(
      [
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
      ].sort(),
    );
    expect(Object.keys(response.materials.items[0]!).sort()).toEqual(
      [
        'executionOrderRefId',
        'itemName',
        'movementId',
        'movementNumber',
        'occurredAt',
        'quantity',
        'unitOfMeasure',
      ].sort(),
    );
    expect(Object.keys(response.history.items[0]!).sort()).toEqual(
      ['assetId', 'eventType', 'id', 'occurredAt', 'serialNumber'].sort(),
    );
    expect(serialized).not.toContain('notes');
    expect(serialized).not.toContain(PRIVATE_NOTE);
    expect(serialized).not.toContain('REF-INTERNA-TRANSFER');
  });

  it('materials: líneas positivas no serializadas del sitio, agregadas por movimiento, sin reversados', async () => {
    const response = await read(subA);

    expect(response.materials.items).toEqual([
      {
        movementId: ids['matTransfer'],
        movementNumber: 'MOV-matTransfer',
        occurredAt: '2026-06-20T10:00:00.000Z',
        itemName: 'Cable drop sintético',
        quantity: '4.00',
        unitOfMeasure: 'METER',
        executionOrderRefId: null,
      },
      {
        movementId: ids['matOt'],
        movementNumber: 'MOV-matOt',
        occurredAt: '2026-06-10T10:00:00.000Z',
        itemName: 'Cable drop sintético',
        quantity: '3.00',
        unitOfMeasure: 'METER',
        executionOrderRefId: otA,
      },
    ]);
    expect(response.materials.meta.total).toBe(2);
  });

  it('pagina materials e history de forma independiente', async () => {
    const page2 = await read(subA, {
      materialsPage: 2,
      materialsLimit: 1,
      historyPage: 2,
      historyLimit: 2,
    });

    expect(page2.materials.items.map((item) => item.movementId)).toEqual([ids['matOt']]);
    expect(page2.materials.meta).toMatchObject({ total: 2, page: 2, limit: 1, hasMore: false });
    // Historial de A: Y (1 evento) + X en su periodo (4 eventos) = 5.
    expect(page2.history.meta).toMatchObject({ total: 5, page: 2, limit: 2, hasMore: true });
    expect(eventIds(page2)).toEqual([ids['repairA'], ids['atInstallA']]);
    // equipment no se pagina.
    expect(page2.equipment).toHaveLength(2);
  });

  it('historyAssetId ajeno (de otro suscriptor o inexistente) devuelve historial vacío', async () => {
    const foreign = await read(subA, { historyAssetId: assetZ });
    const unknown = await read(subA, { historyAssetId: randomUUID() });

    expect(foreign.history.items).toEqual([]);
    expect(foreign.history.meta.total).toBe(0);
    expect(unknown.history.items).toEqual([]);
    // El resto de la respuesta no cambia con el filtro.
    expect(foreign.equipment).toHaveLength(2);
  });
});
