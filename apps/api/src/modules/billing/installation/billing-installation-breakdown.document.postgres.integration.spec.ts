// Spec MOD14 2026-11-13 «Primer cobro completo», bloque B (R3–R5; CA-1, CA-2, CA-3) contra
// PostgreSQL real con la cadena completa de migraciones tenant (incluye 205). El registro del
// consumo usa el servicio real con sus puertos simulados (los adaptadores de MOD11, MOD12 y CRM
// los cubre la integración del bloque A); el detalle es el de BillingDocumentsService real.
import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { dataSourceOptions, runInTenantSchema, TenantContext } from '@iwana/db';
import { BillingDocumentResponseSchema, CustomerSegment } from '@iwana/shared';
import {
  createBillingTenantFixture,
  dropBillingTenantFixture,
} from '../../../../../../packages/database/src/migrations/tenant/billing-migration.integration-helpers';
import {
  applyTenantMigrationsInOrder,
  createTenantDataSource,
} from '../../../../../../packages/database/src/migrations/tenant/runner';
import type { ClosedInstallationConsumptionLine } from '../../tasks/ports/execution-order-consumption-read.port';
import type { InventoryItemValuation } from '../../inventory/ports/installation-consumption-valuation-read.port';
import { BillingDocumentsService } from '../documents/billing-documents.service';
import { renderBillingDocumentPdf } from '../documents/billing-documents.pdf';
import { BillingInstallationBreakdownService } from './billing-installation-breakdown.service';

const dbAvailable = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const databaseName = dataSourceOptions.database;
const safeDatabaseName =
  typeof databaseName === 'string' && /^(test|iwana_it_[a-z0-9_]+)$/u.test(databaseName);
const describeWithDb = dbAvailable && safeDatabaseName ? describe : describe.skip;

const CABLE = randomUUID();
const CONNECTOR = randomUUID();
const ROUTER = randomUUID();
const ROUTER_PRODUCT = randomUUID();

const VALUATIONS: InventoryItemValuation[] = [
  {
    itemId: CABLE,
    name: 'Cable drop 1 hilo',
    unitOfMeasure: 'M',
    averageCost: '1200.00',
    commercialProduct: null,
  },
  {
    itemId: CONNECTOR,
    name: 'Conector SC/APC',
    unitOfMeasure: 'UND',
    averageCost: '2500.00',
    commercialProduct: null,
  },
  {
    itemId: ROUTER,
    name: 'Router WiFi doble banda',
    unitOfMeasure: 'UND',
    averageCost: '150000.00',
    commercialProduct: { id: ROUTER_PRODUCT, currentBasePrice: '180000.00', isLoan: true },
  },
] as InventoryItemValuation[];

describeWithDb('MOD14 · valor real de la instalación en el documento (PostgreSQL real)', () => {
  let dataSource: DataSource;
  let fixture: Awaited<ReturnType<typeof createBillingTenantFixture>> | undefined;
  let tenantId: string;
  let schemaName: string;
  let documents: BillingDocumentsService;
  let capture: BillingInstallationBreakdownService;
  const actorId = randomUUID();
  const partyId = randomUUID();
  let subscriberId: string;
  let contractId: string;
  let privacyMarks: { activeMarks: jest.Mock };
  let anonymized: boolean;
  /** OT cerrada que devuelve el puerto de MOD11 en cada prueba. */
  let order: {
    executionOrderId: string;
    executionOrderNumber: string;
    subscriberId: string;
    closedAt: string;
    lines: ClosedInstallationConsumptionLine[];
  } | null;

  const ctx = () => ({ tenantId, schemaName, tenantSlug: 'billing-installation-doc-it' });
  const inTenant = <T>(fn: () => Promise<T>) => TenantContext.run(ctx(), fn);
  const sql = <T = unknown>(text: string, params: unknown[] = []) =>
    runInTenantSchema(dataSource, schemaName, (qr) => qr.query(text, params) as Promise<T>);
  const detail = (documentId: string) => inTenant(() => documents.findOne(documentId, actorId));

  async function insertFirstCharge(status: 'BORRADOR' | 'EMITIDO'): Promise<string> {
    const periodId = randomUUID();
    await sql(
      `INSERT INTO billing_periods (id, tenant_id, contract_id, subscriber_id, period_start,
         period_end, covered_start, generation_date, due_date, effective_policy)
       VALUES ($1, $2, $3, $4, '2026-11-05', '2026-12-04', '2026-11-13', '2026-11-13',
               '2026-11-20', '{}'::jsonb)`,
      [periodId, tenantId, contractId, subscriberId],
    );
    const id = randomUUID();
    await sql(
      `INSERT INTO billing_documents (id, tenant_id, period_id, contract_id, subscriber_id, status,
         number, issue_date, due_date, subtotal, tax_total, total, buyer_snapshot)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::date, '2026-11-20', '150000.00', '19000.00',
               '169000.00', $9::jsonb)`,
      [
        id,
        tenantId,
        periodId,
        contractId,
        subscriberId,
        status,
        status === 'EMITIDO' ? `DC-${id.slice(0, 8)}` : null,
        status === 'EMITIDO' ? '2026-11-13' : null,
        JSON.stringify({ displayName: 'Titular sintético', rutResponsibilities: [] }),
      ],
    );
    const lines = [
      ['PRORRATEO', 'Prorrateo noviembre', '50000.00', '0.00', '50000.00', 'EXCLUIDO', '0.00'],
      ['INSTALACION', 'Instalación', '100000.00', '19000.00', '119000.00', 'GRAVADO', '19.00'],
    ];
    for (const [
      position,
      [kind, description, base, tax, total, treatment, rate],
    ] of lines.entries())
      await sql(
        `INSERT INTO billing_document_lines (tenant_id, document_id, kind, description, quantity,
           unit_price, base_amount, tax_amount, total, vat_treatment, vat_rate, position)
         VALUES ($1, $2, $3, $4, 1, $5, $5, $6, $7, $8, $9, $10)`,
        [tenantId, id, kind, description, base, tax, total, treatment, rate, position],
      );
    return id;
  }

  /** Montos fiscales del documento y sus líneas, para la prueba de total invariante. */
  async function fiscalSnapshot(documentId: string) {
    const document = await sql<unknown[]>(
      `SELECT subtotal::text, tax_total::text, total::text, status, updated_at
         FROM billing_documents WHERE id = $1`,
      [documentId],
    );
    const lines = await sql<unknown[]>(
      `SELECT id::text, kind, base_amount::text, tax_amount::text, total::text
         FROM billing_document_lines WHERE document_id = $1 ORDER BY position`,
      [documentId],
    );
    return { document, lines };
  }

  function closeOrder(lines: ClosedInstallationConsumptionLine[]) {
    const executionOrderId = randomUUID();
    order = {
      executionOrderId,
      executionOrderNumber: `OT-${executionOrderId.slice(0, 8)}`,
      subscriberId,
      closedAt: '2026-11-13T15:00:00.000Z',
      lines,
    };
    return executionOrderId;
  }

  const cableAndConnectors: ClosedInstallationConsumptionLine[] = [
    { itemId: CABLE, quantity: 60, serialNumber: null },
    { itemId: CONNECTOR, quantity: 2, serialNumber: null },
  ] as ClosedInstallationConsumptionLine[];

  beforeAll(async () => {
    dataSource = new DataSource({
      ...dataSourceOptions,
      entities: [],
      migrations: [],
      logging: false,
      extra: { ...dataSourceOptions.extra, max: 10, min: 1 },
    });
    await dataSource.initialize();
    fixture = await createBillingTenantFixture(dataSource, 'tenant_billing173');
    schemaName = fixture.schemaName;
    tenantId = fixture.tenantId;
    await fixture.queryRunner.release();
    const tenantDataSource = createTenantDataSource(
      dataSource,
      schemaName,
      `billing-installation-doc-${tenantId.slice(0, 8)}`,
    );
    await tenantDataSource.initialize();
    try {
      await applyTenantMigrationsInOrder(tenantDataSource);
    } finally {
      await tenantDataSource.destroy();
    }

    const audit = { logWithin: jest.fn().mockResolvedValue(undefined) };
    const contractRead = {
      findTitularRefs: jest.fn(async (ids: string[]) =>
        ids.map((id) => ({ subscriberId: id, partyId, anonymized })),
      ),
    };
    privacyMarks = { activeMarks: jest.fn(async () => ({})) };
    const key = '4ef6bb844c9e858d2a93b5585599d419f79148fc24b5d9b0e03f5a53fa146d27';
    documents = new BillingDocumentsService(
      dataSource,
      audit as never,
      contractRead as never,
      {} as never,
      new ConfigService({ NODE_ENV: 'test', MFA_ENCRYPTION_KEY: key, PII_ENCRYPTION_KEY: key }),
      { getEffectivePermissionsForUser: jest.fn(async () => []) } as never,
      { getSnapshot: jest.fn(async () => ({ timezone: 'America/Bogota' })) } as never,
      privacyMarks as never,
      {} as never,
    );
    capture = new BillingInstallationBreakdownService(
      dataSource,
      audit as never,
      {
        getClosedInstallationConsumption: jest.fn(async (id: string) =>
          order && order.executionOrderId === id ? order : null,
        ),
      } as never,
      {
        findByExecutionOrder: jest.fn(async () => ({
          contractId,
          customerSegment: CustomerSegment.RESIDENTIAL,
        })),
      } as never,
      {
        describeItems: jest.fn(async (ids: string[]) =>
          VALUATIONS.filter((valuation) => ids.includes(valuation.itemId)),
        ),
      } as never,
      {
        listInstalledAtCustomer: jest.fn(async () =>
          (order?.lines ?? [])
            .filter((line) => line.itemId === ROUTER && line.serialNumber)
            .map((line) => ({ serialNumber: line.serialNumber })),
        ),
      } as never,
    );
  }, 600_000);

  beforeEach(async () => {
    subscriberId = randomUUID();
    contractId = randomUUID();
    anonymized = false;
    order = null;
    privacyMarks.activeMarks.mockReset().mockResolvedValue({});
    await sql(
      `INSERT INTO subscribers (id, tenant_id, party_id, status, person_type, customer_segment,
         document_type, document_number_encrypted, first_name, last_name, stratum, vat_treatment,
         vat_responsibility, address, created_by)
       VALUES ($1, $2, $3, 'ACTIVE', 'NATURAL', 'RESIDENTIAL', 'CC', 'sintetico-cifrado',
               'Titular', 'Sintético', 2, 'EXEMPT', 'NO_RESPONSABLE', 'Dirección sintética', $4)`,
      [subscriberId, tenantId, partyId, actorId],
    );
    await sql(
      `INSERT INTO contracts (id, tenant_id, subscriber_id, status, plan_id, plan_snapshot_json)
       VALUES ($1, $2, $3, 'ACTIVE', 'fixture-plan', '{}'::jsonb)`,
      [contractId, tenantId, subscriberId],
    );
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) await dropBillingTenantFixture(dataSource, fixture);
  });

  it('CA-1: 60 m de cable y conectores → desglose con valor real; el total no cambia', async () => {
    const documentId = await insertFirstCharge('BORRADOR');
    const before = await fiscalSnapshot(documentId);
    expect((await detail(documentId)).installationBreakdown).toBeNull();

    closeOrder(cableAndConnectors);
    await expect(inTenant(() => capture.capture(order!.executionOrderId))).resolves.toBe(
      'recorded',
    );

    const result = await detail(documentId);
    expect(BillingDocumentResponseSchema.safeParse(result).success).toBe(true);
    expect(result).toMatchObject({
      subtotal: '150000.00',
      taxTotal: '19000.00',
      total: '169000.00',
    });
    expect(result.lines).toHaveLength(2);
    expect(result.installationBreakdown).toEqual({
      executionOrders: [
        { executionOrderNumber: order!.executionOrderNumber, closedAt: '2026-11-13T15:00:00.000Z' },
      ],
      items: [
        expect.objectContaining({
          description: 'Cable drop 1 hilo',
          quantity: '60.00',
          unitOfMeasure: 'M',
          unitReferenceValue: '1200.00',
          referenceValue: '72000.00',
          valueSource: 'COSTO_PROMEDIO',
          isLoan: false,
        }),
        expect.objectContaining({
          description: 'Conector SC/APC',
          quantity: '2.00',
          referenceValue: '5000.00',
        }),
      ],
      realValue: '77000.00',
      chargedValue: '119000.00',
      itemsWithoutValue: 0,
      serialsProtected: false,
    });
    expect(await fiscalSnapshot(documentId)).toEqual(before);
  });

  it('CA-2: OT cerrada después del documento emitido → el desglose aparece sin cambiar montos (idempotente)', async () => {
    const documentId = await insertFirstCharge('EMITIDO');
    const before = await fiscalSnapshot(documentId);
    const orderId = closeOrder(cableAndConnectors);

    await expect(inTenant(() => capture.capture(orderId))).resolves.toBe('recorded');
    await expect(inTenant(() => capture.capture(orderId))).resolves.toBe('existing');

    const result = await detail(documentId);
    expect(result.status).toBe('EMITIDO');
    expect(result.total).toBe('169000.00');
    expect(result.installationBreakdown?.executionOrders).toHaveLength(1);
    expect(result.installationBreakdown?.items).toHaveLength(2);
    expect(result.installationBreakdown?.realValue).toBe('77000.00');
    const counts = await sql<Array<{ breakdowns: number; items: number }>>(
      `SELECT (SELECT count(*)::int FROM billing_installation_breakdowns
                WHERE execution_order_id = $1) AS breakdowns,
              (SELECT count(*)::int FROM billing_installation_breakdown_items i
                 JOIN billing_installation_breakdowns b ON b.id = i.breakdown_id
                WHERE b.execution_order_id = $1) AS items`,
      [orderId],
    );
    expect(counts[0]).toEqual({ breakdowns: 1, items: 2 });
    expect(await fiscalSnapshot(documentId)).toEqual(before);
  });

  it('CA-3: el router en comodato aparece «en comodato» con su valor de referencia (detalle y PDF)', async () => {
    const documentId = await insertFirstCharge('EMITIDO');
    closeOrder([
      ...cableAndConnectors,
      { itemId: ROUTER, quantity: 1, serialNumber: 'SN-IT-ROUTER-1' },
    ] as ClosedInstallationConsumptionLine[]);
    await inTenant(() => capture.capture(order!.executionOrderId));

    const result = await detail(documentId);
    const router = result.installationBreakdown?.items.find((item) => item.isLoan);
    expect(router).toMatchObject({
      description: 'Router WiFi doble banda',
      unitReferenceValue: '180000.00',
      referenceValue: '180000.00',
      valueSource: 'PRECIO_COMERCIAL',
      serialNumbers: ['SN-IT-ROUTER-1'],
    });
    expect(result.installationBreakdown?.realValue).toBe('257000.00');
    expect(result.total).toBe('169000.00');

    const pdf = await renderBillingDocumentPdf(result);
    expect(pdf.length).toBeGreaterThan(0);
  });

  it('documento sin línea INSTALACION del mismo contrato → sin desglose', async () => {
    const documentId = await insertFirstCharge('BORRADOR');
    await sql(
      `DELETE FROM billing_document_lines WHERE document_id = $1 AND kind = 'INSTALACION'`,
      [documentId],
    );
    closeOrder(cableAndConnectors);
    await inTenant(() => capture.capture(order!.executionOrderId));
    expect((await detail(documentId)).installationBreakdown).toBeNull();
  });

  it('titular con DATOS_BLOQUEADOS sin permiso o anonimizado → seriales ocultos, valores intactos', async () => {
    const documentId = await insertFirstCharge('EMITIDO');
    closeOrder([
      { itemId: ROUTER, quantity: 1, serialNumber: 'SN-IT-ROUTER-2' },
    ] as ClosedInstallationConsumptionLine[]);
    await inTenant(() => capture.capture(order!.executionOrderId));

    privacyMarks.activeMarks.mockResolvedValueOnce({ [partyId]: ['DATOS_BLOQUEADOS'] });
    const blocked = await detail(documentId);
    expect(blocked.buyerProtected).toBe(true);
    expect(blocked.installationBreakdown).toMatchObject({
      serialsProtected: true,
      realValue: '180000.00',
      items: [{ isLoan: true, serialNumbers: [] }],
    });

    anonymized = true;
    const erased = await detail(documentId);
    expect(erased.installationBreakdown?.serialsProtected).toBe(true);
    expect(erased.installationBreakdown?.items[0]?.serialNumbers).toEqual([]);
  });

  it('no mezcla el consumo de otro tenant ni de otro contrato', async () => {
    const documentId = await insertFirstCharge('EMITIDO');
    await sql(
      `INSERT INTO billing_installation_breakdowns
         (tenant_id, contract_id, subscriber_id, execution_order_id, execution_order_number,
          execution_order_closed_at, price_segment)
       VALUES ($1, $2, $3, $4, 'OT-AJENA-1', now(), 'RESIDENTIAL'),
              ($5, $6, $3, $7, 'OT-AJENA-2', now(), 'RESIDENTIAL')`,
      [randomUUID(), contractId, subscriberId, randomUUID(), tenantId, randomUUID(), randomUUID()],
    );
    expect((await detail(documentId)).installationBreakdown).toBeNull();
  });
});
