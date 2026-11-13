// Spec MOD14 2026-11-13 «Primer cobro completo», bloque A (R1, R2) contra PostgreSQL real.
// Billing con la migración 205 real; las tablas de MOD11, MOD12 y CRM se clonan del tenant de
// integración (E2E_TENANT_SLUG) con sus tipos reales (`LIKE`, sin NOT NULL para sembrar solo lo
// que se lee). Adaptadores reales de los tres módulos; MOD06 por su puerto (simulado).
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { runInTenantSchema, TenantContext } from '@iwana/db';
import { CustomerSegment, ExecutionOrderResult, SerializedAssetStatus } from '@iwana/shared';
import {
  billingPostgresIntegrationEnabled,
  createBillingIntegrationDataSource,
  createBillingTenantFixture,
  dropBillingTenantFixture,
  type BillingTenantFixture,
} from '../../../../../../packages/database/src/migrations/tenant/billing-migration.integration-helpers';
import { BillingInstallationBreakdowns2050000000205 } from '../../../../../../packages/database/src/migrations/tenant/205_billing_installation_breakdowns';
import type { AuditService } from '../../audit/audit.service';
import type { CommercialCatalogReadPort } from '../../commercial/ports/commercial-catalog-read.port';
import { InstallationContractReadAdapter } from '../../crm/contracts/installation-contract-read.adapter';
import { InstallationConsumptionValuationReadAdapter } from '../../inventory/ports/installation-consumption-valuation-read.adapter';
import { InstalledEquipmentReadAdapter } from '../../inventory/ports/installed-equipment-read.adapter';
import { ExecutionOrderConsumptionReadAdapter } from '../../tasks/ports/execution-order-consumption-read.adapter';
import { BillingInstallationBreakdownService } from './billing-installation-breakdown.service';

const integrationTenantSlug = process.env['E2E_TENANT_SLUG'];
const describeDb =
  billingPostgresIntegrationEnabled && integrationTenantSlug ? describe : describe.skip;

/** Tablas ajenas a MOD14 que leen los puertos, clonadas del tenant de integración. */
const CLONED_TABLES = [
  'execution_orders',
  'execution_order_item_usage',
  'execution_order_item_usage_reversals',
  'contracts',
  'contract_signatures',
  'contract_document_generations',
  'inventory_items',
  'serialized_assets',
  'asset_loan_assignments',
];

describeDb('MOD14 · consumo de la instalación al contrato (PostgreSQL real)', () => {
  let ds: DataSource;
  let fixture: BillingTenantFixture;
  let service: BillingInstallationBreakdownService;
  const audit = { logWithin: jest.fn().mockResolvedValue(undefined) };
  // MOD06: precio vigente por segmento y comodato por producto.
  const prices: Record<string, Partial<Record<CustomerSegment, string>>> = {};
  const loanProducts = new Set<string>();
  const catalog = {
    getItemVatTreatments: jest.fn(
      async (
        _tenant: string,
        _schema: string,
        ids: string[],
        _ctx: unknown,
        segment?: CustomerSegment,
      ) =>
        ids
          .filter((id) => prices[id])
          .map((id) => ({
            itemId: id,
            itemType: 'PRODUCT',
            currentBasePrice: (segment && prices[id]?.[segment]) ?? null,
          })),
    ),
    resolveProductReference: jest.fn(async (_tenant: string, _schema: string, id: string) =>
      prices[id]
        ? {
            id,
            name: `Producto ${id.slice(0, 4)}`,
            isActive: true,
            requiresInventory: true,
            isLoan: loanProducts.has(id),
          }
        : null,
    ),
  };

  const run = <T>(fn: () => Promise<T>) =>
    TenantContext.run(
      {
        tenantId: fixture.tenantId,
        schemaName: fixture.schemaName,
        tenantSlug: 'mod14-installation-it',
      },
      fn,
    );
  const sql = <T = Record<string, unknown>>(query: string, args: unknown[] = []) =>
    runInTenantSchema(ds, fixture.schemaName, (qr) => qr.query(query, args) as Promise<T[]>);

  beforeAll(async () => {
    ds = createBillingIntegrationDataSource();
    await ds.initialize();
    fixture = await createBillingTenantFixture(ds, 'tenant_billing173');
    const source = (await ds.query('SELECT schema_name FROM public.tenants WHERE slug = $1', [
      integrationTenantSlug,
    ])) as Array<{ schema_name: string }>;
    const sourceSchema = source[0]?.schema_name;
    if (!sourceSchema)
      throw new Error(`No existe el tenant de integración '${integrationTenantSlug}'.`);

    const qr = fixture.queryRunner;
    for (const table of CLONED_TABLES) {
      await qr.query(
        `CREATE TABLE "${table}" (LIKE "${sourceSchema}"."${table}" INCLUDING DEFAULTS)`,
      );
      const required = (await qr.query(
        `SELECT column_name FROM information_schema.columns
          WHERE table_schema = $1 AND table_name = $2 AND is_nullable = 'NO'`,
        [fixture.schemaName, table],
      )) as Array<{ column_name: string }>;
      for (const { column_name: column } of required) {
        await qr.query(`ALTER TABLE "${table}" ALTER COLUMN "${column}" DROP NOT NULL`);
      }
    }
    await new BillingInstallationBreakdowns2050000000205().up(qr);

    const valuationReader = new InstallationConsumptionValuationReadAdapter(
      ds,
      catalog as unknown as CommercialCatalogReadPort,
    );
    service = new BillingInstallationBreakdownService(
      ds,
      audit as unknown as AuditService,
      new ExecutionOrderConsumptionReadAdapter(ds),
      new InstallationContractReadAdapter(ds),
      valuationReader,
      new InstalledEquipmentReadAdapter(ds),
    );
  }, 60_000);

  afterAll(async () => {
    await dropBillingTenantFixture(ds, fixture);
  });

  beforeEach(() => audit.logWithin.mockClear());

  interface Seeded {
    orderId: string;
    subscriberId: string;
    contractId: string;
  }

  async function seedOrder(
    overrides: {
      workType?: string;
      result?: ExecutionOrderResult | null;
      annulled?: boolean;
      closed?: boolean;
      subscriberId?: string | null;
    } = {},
  ): Promise<Seeded> {
    const orderId = randomUUID();
    const subscriberId =
      overrides.subscriberId === undefined ? randomUUID() : overrides.subscriberId;
    await sql(
      `INSERT INTO execution_orders
         (id, tenant_id, execution_order_number, origin_context, customer_display_label, work_type,
          work_summary, result, is_annulled, closed_at, subscriber_id)
       VALUES ($1,$2,$3,'test','Titular sintético',$4,'Instalación',$5,$6,$7,$8)`,
      [
        orderId,
        fixture.tenantId,
        `OT-${orderId.slice(0, 8)}`,
        overrides.workType ?? 'INSTALLATION',
        overrides.result === undefined ? ExecutionOrderResult.EXECUTED : overrides.result,
        overrides.annulled ?? false,
        overrides.closed === false ? null : '2026-11-13T15:00:00Z',
        subscriberId,
      ],
    );
    return { orderId, subscriberId: subscriberId ?? '', contractId: '' };
  }

  async function seedContract(
    order: Seeded,
    link: 'signature' | 'generation',
    segment: CustomerSegment | null = CustomerSegment.RESIDENTIAL,
    subscriberId = order.subscriberId,
  ): Promise<string> {
    const contractId = randomUUID();
    await sql(
      `INSERT INTO contracts (id, tenant_id, subscriber_id, customer_segment) VALUES ($1,$2,$3,$4)`,
      [contractId, fixture.tenantId, subscriberId, segment],
    );
    if (link === 'signature') {
      await sql(
        `INSERT INTO contract_signatures (id, tenant_id, contract_id, execution_order_id, signed_at)
         VALUES ($1,$2,$3,$4,now())`,
        [randomUUID(), fixture.tenantId, contractId, order.orderId],
      );
    } else {
      await sql(
        `INSERT INTO contract_document_generations
           (id, tenant_id, contract_id, execution_order_id, requested_at)
         VALUES ($1,$2,$3,$4,now())`,
        [randomUUID(), fixture.tenantId, contractId, order.orderId],
      );
    }
    return contractId;
  }

  async function seedItem(name: string, unit: string, averageCost: string, productId?: string) {
    const id = randomUUID();
    await sql(
      `INSERT INTO inventory_items
         (id, tenant_id, sku, name, unit_of_measure, average_cost, commercial_reference_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [id, fixture.tenantId, `SKU-${id.slice(0, 6)}`, name, unit, averageCost, productId ?? null],
    );
    return id;
  }

  async function seedUsage(
    orderId: string,
    itemId: string,
    quantity: number,
    disposition: string,
    extra: { serial?: string; movement?: string | null; action?: string } = {},
  ): Promise<string> {
    const id = randomUUID();
    await sql(
      `INSERT INTO execution_order_item_usage
         (id, execution_order_id, tenant_id, item_id, technician_custody_id, quantity,
          serial_number, action, final_disposition, movement_status)
       VALUES ($1,$2,$3,$4,'custodia',$5,$6,$7,$8,$9)`,
      [
        id,
        orderId,
        fixture.tenantId,
        itemId,
        quantity,
        extra.serial ?? null,
        extra.action ?? (extra.serial ? 'INSTALL' : 'CONSUME'),
        disposition,
        extra.movement === undefined ? 'CONFIRMED' : extra.movement,
      ],
    );
    return id;
  }

  async function seedLoan(order: Seeded, itemId: string, serial: string) {
    const assetId = randomUUID();
    await sql(
      `INSERT INTO serialized_assets (id, tenant_id, inventory_item_id, serial_number, current_status)
       VALUES ($1,$2,$3,$4,$5)`,
      [assetId, fixture.tenantId, itemId, serial, SerializedAssetStatus.INSTALLED_COMODATO],
    );
    await sql(
      `INSERT INTO asset_loan_assignments
         (id, tenant_id, serialized_asset_id, subscriber_ref_id, execution_order_ref_id, installed_at)
       VALUES ($1,$2,$3,$4,$5,now())`,
      [randomUUID(), fixture.tenantId, assetId, order.subscriberId, order.orderId],
    );
  }

  const breakdownOf = (orderId: string) =>
    sql<{ id: string; contract_id: string; price_segment: string; execution_order_number: string }>(
      `SELECT id::text, contract_id::text, price_segment, execution_order_number
         FROM billing_installation_breakdowns WHERE tenant_id = $1 AND execution_order_id = $2`,
      [fixture.tenantId, orderId],
    );
  const itemsOf = (breakdownId: string) =>
    sql<{
      position: number;
      description: string;
      unit_of_measure: string;
      quantity: string;
      serial_numbers: string[];
      is_loan: boolean;
      value_source: string;
      unit_reference_value: string | null;
      reference_value: string | null;
    }>(
      `SELECT position, description, unit_of_measure, quantity::text, serial_numbers, is_loan,
              value_source, unit_reference_value::text, reference_value::text
         FROM billing_installation_breakdown_items WHERE breakdown_id = $1 ORDER BY position`,
      [breakdownId],
    );

  it('CA-1/CA-3: cable, conectores y router en comodato con valor congelado; excluye reversos y rechazos', async () => {
    const order = await seedOrder();
    const contractId = await seedContract(order, 'signature');
    // Una generación de otro contrato del titular no gana a la firma.
    await seedContract(order, 'generation');
    const cableProduct = randomUUID();
    const routerProduct = randomUUID();
    prices[cableProduct] = { RESIDENTIAL: '1500.00' };
    prices[routerProduct] = { RESIDENTIAL: '250000.00' };
    const cable = await seedItem('Cable drop', 'M', '900.00000', cableProduct);
    const connector = await seedItem('Conector SC', 'UND', '2500.12345');
    const router = await seedItem('Router WiFi', 'UND', '180000.00000', routerProduct);
    const tape = await seedItem('Cinta', 'UND', '0.00000');

    await seedUsage(order.orderId, cable, 40, 'INTERNAL_CONSUMPTION');
    await seedUsage(order.orderId, cable, 20, 'INTERNAL_CONSUMPTION', { movement: 'PENDING' });
    await seedUsage(order.orderId, connector, 4, 'INTERNAL_CONSUMPTION', { movement: null });
    await seedUsage(order.orderId, router, 1, 'INSTALLED_AT_CUSTOMER', { serial: 'SN-IT-1' });
    await seedLoan(order, router, 'SN-IT-1');
    await seedUsage(order.orderId, tape, 2, 'INTERNAL_CONSUMPTION');
    // No cuentan: rechazado por MOD12, devuelto a bodega y reversado.
    await seedUsage(order.orderId, cable, 999, 'INTERNAL_CONSUMPTION', { movement: 'REJECTED' });
    await seedUsage(order.orderId, connector, 7, 'RETURNED_TO_WAREHOUSE', { action: 'RETURN' });
    const reversed = await seedUsage(order.orderId, connector, 50, 'INTERNAL_CONSUMPTION');
    await sql(
      `INSERT INTO execution_order_item_usage_reversals
         (id, tenant_id, execution_order_id, item_usage_id, status)
       VALUES ($1,$2,$3,$4,'CONFIRMED')`,
      [randomUUID(), fixture.tenantId, order.orderId, reversed],
    );

    await expect(run(() => service.capture(order.orderId))).resolves.toBe('recorded');

    const [header] = await breakdownOf(order.orderId);
    expect(header).toMatchObject({ contract_id: contractId, price_segment: 'RESIDENTIAL' });
    expect(header?.execution_order_number).toBe(`OT-${order.orderId.slice(0, 8)}`);
    const items = await itemsOf(header!.id);
    expect(items).toEqual([
      {
        position: 1,
        description: 'Cable drop',
        unit_of_measure: 'M',
        quantity: '60.00',
        serial_numbers: [],
        is_loan: false,
        value_source: 'PRECIO_COMERCIAL',
        unit_reference_value: '1500.00',
        reference_value: '90000.00',
      },
      {
        position: 2,
        description: 'Conector SC',
        unit_of_measure: 'UND',
        quantity: '4.00',
        serial_numbers: [],
        is_loan: false,
        value_source: 'COSTO_PROMEDIO',
        unit_reference_value: '2500.12',
        reference_value: '10000.48',
      },
      {
        position: 3,
        description: 'Router WiFi',
        unit_of_measure: 'UND',
        quantity: '1.00',
        serial_numbers: ['SN-IT-1'],
        is_loan: true,
        value_source: 'PRECIO_COMERCIAL',
        unit_reference_value: '250000.00',
        reference_value: '250000.00',
      },
      {
        position: 4,
        description: 'Cinta',
        unit_of_measure: 'UND',
        quantity: '2.00',
        serial_numbers: [],
        is_loan: false,
        value_source: 'SIN_VALOR',
        unit_reference_value: null,
        reference_value: null,
      },
    ]);
    expect(audit.logWithin).toHaveBeenCalledTimes(1);
  });

  it('R2: el valor queda congelado; un cambio de precio posterior no revalora (idempotente por OT)', async () => {
    const order = await seedOrder();
    await seedContract(order, 'signature');
    const product = randomUUID();
    prices[product] = { RESIDENTIAL: '1000.00' };
    const item = await seedItem('ONT', 'UND', '0', product);
    await seedUsage(order.orderId, item, 1, 'INSTALLED_AT_CUSTOMER');

    await expect(run(() => service.capture(order.orderId))).resolves.toBe('recorded');
    prices[product] = { RESIDENTIAL: '9999.00' };
    await expect(run(() => service.capture(order.orderId))).resolves.toBe('existing');

    const [header] = await breakdownOf(order.orderId);
    const items = await itemsOf(header!.id);
    expect(items.map((row) => row.reference_value)).toEqual(['1000.00']);
  });

  it('reintentos concurrentes del mismo cierre: una sola cabecera y un solo juego de ítems', async () => {
    const order = await seedOrder();
    await seedContract(order, 'signature');
    const item = await seedItem('Cable', 'M', '100', undefined);
    await seedUsage(order.orderId, item, 10, 'INTERNAL_CONSUMPTION');

    const outcomes = await Promise.all(
      Array.from({ length: 4 }, () => run(() => service.capture(order.orderId))),
    );

    expect(outcomes.filter((outcome) => outcome === 'recorded')).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome === 'existing')).toHaveLength(3);
    const [header] = await breakdownOf(order.orderId);
    expect(await itemsOf(header!.id)).toHaveLength(1);
    const counts = await sql<{ total: number }>(
      `SELECT COUNT(*)::int AS total FROM billing_installation_breakdowns WHERE execution_order_id = $1`,
      [order.orderId],
    );
    expect(counts[0]?.total).toBe(1);
  });

  it('contrato por generación (sin firma) con segmento PYME: usa el precio PYME', async () => {
    const order = await seedOrder();
    const contractId = await seedContract(order, 'generation', CustomerSegment.PYME);
    const product = randomUUID();
    prices[product] = { RESIDENTIAL: '100.00', PYME: '150.00' };
    const item = await seedItem('Router', 'UND', '0', product);
    await seedUsage(order.orderId, item, 2, 'INSTALLED_AT_CUSTOMER');

    await expect(run(() => service.capture(order.orderId))).resolves.toBe('recorded');
    const [header] = await breakdownOf(order.orderId);
    expect(header).toMatchObject({ contract_id: contractId, price_segment: 'PYME' });
    expect((await itemsOf(header!.id))[0]).toMatchObject({ reference_value: '300.00' });
  });

  it.each([
    ['no es de instalación', { workType: 'MAINTENANCE' }],
    ['no ejecutada', { result: ExecutionOrderResult.NOT_EXECUTED }],
    ['anulada', { annulled: true }],
    ['abierta', { closed: false, result: null }],
  ] as const)('OT %s: no aplica y no escribe', async (_label, overrides) => {
    const order = await seedOrder(overrides);
    await seedContract(order, 'signature');
    await expect(run(() => service.capture(order.orderId))).resolves.toBe('notApplicable');
    expect(await breakdownOf(order.orderId)).toHaveLength(0);
  });

  it('sin contrato de la OT, o con contrato de otro titular: no registra', async () => {
    const lonely = await seedOrder();
    await expect(run(() => service.capture(lonely.orderId))).resolves.toBe('withoutContract');

    const foreign = await seedOrder();
    await seedContract(foreign, 'signature', CustomerSegment.RESIDENTIAL, randomUUID());
    await expect(run(() => service.capture(foreign.orderId))).resolves.toBe('withoutContract');
    expect(await breakdownOf(foreign.orderId)).toHaveLength(0);
  });

  it('OT sin titular: no registra', async () => {
    const order = await seedOrder({ subscriberId: null });
    await expect(run(() => service.capture(order.orderId))).resolves.toBe('withoutSubscriber');
  });

  it('las restricciones de la 205 rechazan forma de valor inválida y OT duplicada', async () => {
    const order = await seedOrder();
    await seedContract(order, 'signature');
    await run(() => service.capture(order.orderId));
    const [header] = await breakdownOf(order.orderId);

    await expect(
      sql(
        `INSERT INTO billing_installation_breakdown_items
           (tenant_id, breakdown_id, position, inventory_item_id, description, unit_of_measure,
            quantity, value_source, unit_reference_value, reference_value)
         VALUES ($1,$2,9,'x','x','UND',1,'SIN_VALOR','1.00','1.00')`,
        [fixture.tenantId, header!.id],
      ),
    ).rejects.toThrow(/chk_billing_installation_items_value_shape/u);
    await expect(
      sql(
        `INSERT INTO billing_installation_breakdowns
           (tenant_id, contract_id, subscriber_id, execution_order_id, execution_order_number,
            execution_order_closed_at, price_segment)
         VALUES ($1,$2,$3,$4,'OT',now(),'RESIDENTIAL')`,
        [fixture.tenantId, randomUUID(), randomUUID(), order.orderId],
      ),
    ).rejects.toThrow(/uq_billing_installation_breakdowns_order/u);
  });

  it('down() de la 205: bloqueado con registros; destructivo con la variable', async () => {
    const migration = new BillingInstallationBreakdowns2050000000205();
    const qr = fixture.queryRunner;
    await expect(migration.down(qr)).rejects.toThrow(
      /Rollback de BillingInstallationBreakdowns bloqueado/u,
    );

    process.env['IWANA_ALLOW_DESTRUCTIVE_TENANT_DOWN'] = 'true';
    try {
      await migration.down(qr);
    } finally {
      delete process.env['IWANA_ALLOW_DESTRUCTIVE_TENANT_DOWN'];
    }
    const left = (await qr.query(
      `SELECT table_name FROM information_schema.tables
        WHERE table_schema = $1 AND table_name LIKE 'billing_installation_%'`,
      [fixture.schemaName],
    )) as unknown[];
    expect(left).toHaveLength(0);
    // up() vuelve a aplicar sobre el schema limpio y down() sin datos no exige la variable.
    await migration.up(qr);
    await migration.down(qr);
    // M6: down() repetido, ya sin tablas, no falla (to_regclass) ni exige la variable.
    await expect(migration.down(qr)).resolves.toBeUndefined();
  });
});
