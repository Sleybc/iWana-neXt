// Spec MOD14 2026-11-12 bloque C (D3, R3, CA-2) contra PostgreSQL real: los adicionales del
// contrato se facturan con el precio, nombre e IVA congelados en `additional_vat_snapshot`, leídos
// por el adaptador real del puerto de contratos. Producto: una sola vez; servicio: cada periodo,
// prorrateado como el plan en pesos enteros.
import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DataSource } from 'typeorm';
import { dataSourceOptions, runInTenantSchema, TenantContext } from '@iwana/db';
import { billingPostgresIntegrationEnabled } from '../../../../../../packages/database/src/migrations/tenant/billing-migration.integration-helpers';
import { BillingContractReadAdapter } from '../../crm/contracts/billing-contract-read.adapter';
import { createBillingSchema } from '../billing-postgres.fixture';
import { BillingDocumentsService } from '../documents/billing-documents.service';
import { BillingPaymentsService } from '../payments/billing-payments.service';
import { BillingGenerationService } from './billing-generation.service';

type Additional = {
  itemId: string;
  itemType: 'PRODUCT' | 'SERVICE';
  name?: string;
  unitPrice?: string | null;
  treatment?: string;
  legalBasis?: string;
  ratePercent?: 0 | 19;
};

const frozenAdditional = (a: Additional) => ({
  itemId: a.itemId,
  itemType: a.itemType,
  treatment: a.treatment ?? 'STANDARD',
  legalBasis: a.legalBasis ?? 'ET_468',
  ratePercent: a.ratePercent ?? 19,
  source: 'CATALOG',
  frozenAt: '2026-10-01T00:00:00.000Z',
  ...(a.name ? { name: a.name } : {}),
  ...(a.unitPrice !== undefined ? { unitPrice: a.unitPrice } : {}),
});

const describeDb = billingPostgresIntegrationEnabled ? describe : describe.skip;
describeDb('Bloque C — adicionales facturados (PostgreSQL real)', () => {
  let ds: DataSource;
  let schemaName: string;
  let tenantId: string;
  let generation: BillingGenerationService;
  const actorId = randomUUID();
  const settings = { getSnapshot: jest.fn().mockResolvedValue({ timezone: 'America/Bogota' }) };
  const audit = { logWithin: jest.fn().mockResolvedValue(undefined) };
  const privacy = { activeMarks: jest.fn().mockResolvedValue({}) };
  const config = new ConfigService({
    PII_ENCRYPTION_KEY: '34'.repeat(32),
    MFA_ENCRYPTION_KEY: '34'.repeat(32),
    NODE_ENV: 'test',
  });
  const run = <T>(fn: () => Promise<T>) =>
    TenantContext.run({ tenantId, schemaName, tenantSlug: 'additionals-it' }, fn);
  const sql = <T = Record<string, unknown>>(query: string, args: unknown[] = []) =>
    runInTenantSchema(ds, schemaName, (qr) => qr.query(query, args) as Promise<T[]>);

  async function seed(additionals: Additional[], startDate = '2026-10-20'): Promise<string> {
    const id = randomUUID();
    const subscriber = randomUUID();
    await sql(
      `INSERT INTO subscribers (id,tenant_id,party_id,person_type,document_type,business_name) VALUES ($1,$2,$3,'JURIDICA','NIT','Titular sintético')`,
      [subscriber, tenantId, randomUUID()],
    );
    await sql(
      `INSERT INTO contracts (id,tenant_id,subscriber_id,status,billing_cycle_day,start_date,plan_snapshot_json,vat_snapshot,fiscal_document,additional_product_ids,additional_service_ids,additional_vat_snapshot)
       VALUES ($1,$2,$3,'ACTIVE',5,$4::date,$5::jsonb,$6::jsonb,'900000001',$7::jsonb,$8::jsonb,$9::jsonb)`,
      [
        id,
        tenantId,
        subscriber,
        startDate,
        JSON.stringify({ name: 'Plan sintético', monthlyPrice: '100000.00' }),
        JSON.stringify({
          treatment: 'EXEMPT',
          legalBasis: 'ET_481_H',
          ratePercent: 0,
          requiresAccountantReview: false,
          resolvedAt: '2026-10-01T00:00:00Z',
        }),
        JSON.stringify(additionals.filter((a) => a.itemType === 'PRODUCT').map((a) => a.itemId)),
        JSON.stringify(additionals.filter((a) => a.itemType === 'SERVICE').map((a) => a.itemId)),
        JSON.stringify(additionals.map(frozenAdditional)),
      ],
    );
    return id;
  }

  const lines = (contractId: string) =>
    sql<{
      period_start: string;
      kind: string;
      description: string;
      unit_price: string;
      base_amount: string;
      tax_amount: string;
      total: string;
      vat_treatment: string;
      vat_rate: string;
      vat_legal_basis: string | null;
      additional_item_id: string | null;
    }>(
      `SELECT p.period_start::text, l.kind, l.description, l.unit_price, l.base_amount,
              l.tax_amount, l.total, l.vat_treatment, l.vat_rate::text, l.vat_legal_basis,
              l.additional_item_id
         FROM billing_document_lines l
         JOIN billing_documents d ON d.id = l.document_id
         JOIN billing_periods p ON p.id = d.period_id
        WHERE d.contract_id = $1 AND d.status <> 'ANULADO'
        ORDER BY p.period_start, l.position`,
      [contractId],
    );
  const docs = (contractId: string) =>
    sql<{ subtotal: string; tax_total: string; total: string; unbilled_additional_count: number }>(
      `SELECT d.subtotal, d.tax_total, d.total, d.unbilled_additional_count FROM billing_documents d
         JOIN billing_periods p ON p.id = d.period_id
        WHERE d.contract_id = $1 AND d.status <> 'ANULADO' ORDER BY p.period_start`,
      [contractId],
    );
  const firstCharge = (contractId: string, from = '2026-10-20') =>
    run(() =>
      generation.generate({ contractId, date: '2026-10-21', firstChargeFrom: from, actorId: null }),
    );
  const nextPeriod = (contractId: string) =>
    run(() => generation.generate({ contractId, date: '2026-12-05', actorId }));

  beforeAll(async () => {
    ds = new DataSource({
      ...dataSourceOptions,
      entities: [],
      migrations: [],
      logging: false,
      extra: { max: 5, connectionTimeoutMillis: 3000 },
    });
    await ds.initialize();
    const fixture = await createBillingSchema(ds);
    schemaName = fixture.schemaName;
    tenantId = fixture.tenantId;
    const adapter = new BillingContractReadAdapter(ds, config, settings as never);
    const payments = new BillingPaymentsService(
      ds,
      adapter,
      audit as never,
      new EventEmitter2(),
      privacy as never,
      settings as never,
    );
    const documents = new BillingDocumentsService(
      ds,
      audit as never,
      adapter,
      { getIssuerIdentity: jest.fn() } as never,
      config,
      { getEffectivePermissionsForUser: jest.fn().mockResolvedValue([]) } as never,
      settings as never,
      privacy as never,
      payments,
    );
    generation = new BillingGenerationService(
      ds,
      adapter,
      settings as never,
      documents,
      audit as never,
      privacy as never,
    );
    await sql(
      `UPDATE billing_policy SET period_timing='VENCIDO',cutoff_mode='VENCIMIENTO_MAS_GRACIA',first_period_mode='SEPARADO',approval_mode='BORRADOR',proration_method='DIAS_REALES'`,
    );
  });

  afterAll(async () => {
    if (ds?.isInitialized) {
      await ds.query(`DROP SCHEMA "${schemaName}" CASCADE`);
      await ds.query('DELETE FROM public.tenants WHERE id=$1', [tenantId]);
      await ds.destroy();
    }
  });

  it('CA-2: el servicio aparece cada periodo con su IVA (prorrateado al inicio); el producto solo en el primer cobro', async () => {
    const service = randomUUID();
    const product = randomUUID();
    const id = await seed([
      { itemId: product, itemType: 'PRODUCT', name: 'Router WiFi 6', unitPrice: '120000.00' },
      { itemId: service, itemType: 'SERVICE', name: 'IP fija', unitPrice: '30000.00' },
    ]);

    expect(await firstCharge(id)).toMatchObject({ generated: 1 });
    expect(await nextPeriod(id)).toMatchObject({ generated: 1 });

    const rows = await lines(id);
    expect(rows.map((r) => [r.period_start, r.kind, r.additional_item_id])).toEqual([
      ['2026-10-05', 'PRORRATEO', null],
      ['2026-10-05', 'ADICIONAL', product],
      ['2026-10-05', 'ADICIONAL', service],
      ['2026-11-05', 'PLAN', null],
      ['2026-11-05', 'ADICIONAL', service],
    ]);
    // Producto completo con IVA 19 % aunque el internet sea exento (D2).
    expect(rows[1]).toMatchObject({
      description: 'Router WiFi 6',
      unit_price: '120000.00',
      base_amount: '120000.00',
      tax_amount: '22800.00',
      total: '142800.00',
      vat_treatment: 'STANDARD',
      vat_rate: '19.0000',
      vat_legal_basis: 'ET_468',
    });
    // Servicio prorrateado como el plan: 30.000 × 16 ÷ 31 = 15.483,87 → 15.484 (pesos enteros).
    expect(rows[2]).toMatchObject({
      description: 'IP fija',
      unit_price: '30000.00',
      base_amount: '15484.00',
      tax_amount: '2941.96',
      total: '18425.96',
    });
    expect(rows[4]).toMatchObject({
      base_amount: '30000.00',
      tax_amount: '5700.00',
      total: '35700.00',
    });
    const documents = await docs(id);
    expect(documents[1]).toEqual({
      subtotal: '130000.00',
      tax_total: '5700.00',
      total: '135700.00',
      unbilled_additional_count: 0,
    });
    expect(documents[0]!.unbilled_additional_count).toBe(0);
  });

  it('R2: el adicional con tratamiento exento congelado no causa IVA', async () => {
    const service = randomUUID();
    const id = await seed(
      [
        {
          itemId: service,
          itemType: 'SERVICE',
          unitPrice: '20000.00',
          treatment: 'EXEMPT',
          legalBasis: 'ET_476_7',
          ratePercent: 0,
        },
      ],
      '2026-10-05',
    );

    await firstCharge(id, '2026-10-05');

    const [, additional] = await lines(id);
    expect(additional).toMatchObject({
      kind: 'ADICIONAL',
      description: 'Servicio adicional',
      base_amount: '20000.00',
      tax_amount: '0.00',
      vat_treatment: 'EXEMPT',
      vat_rate: '0.0000',
      vat_legal_basis: 'ET_476_7',
    });
  });

  it('sin precio congelado el adicional no se cobra y queda contado como sin cobrar', async () => {
    const id = await seed(
      [
        { itemId: randomUUID(), itemType: 'SERVICE', unitPrice: null },
        { itemId: 'legado-sin-congelar', itemType: 'PRODUCT' },
      ],
      '2026-10-05',
    );

    await firstCharge(id, '2026-10-05');

    expect((await lines(id)).map(({ kind }) => kind)).toEqual(['PLAN']);
    expect((await docs(id))[0]!.unbilled_additional_count).toBe(2);
  });

  it('R3 idempotencia: evento repetido, regeneración y periodos siguientes no cobran el producto dos veces', async () => {
    const product = randomUUID();
    const id = await seed(
      [{ itemId: product, itemType: 'PRODUCT', unitPrice: '50000.00' }],
      '2026-10-05',
    );

    const [first, second] = await Promise.all([
      firstCharge(id, '2026-10-05'),
      firstCharge(id, '2026-10-05'),
    ]);
    expect(first.generated + second.generated).toBe(1);
    expect(
      await run(() => generation.generate({ contractId: id, date: '2026-11-05', actorId })),
    ).toMatchObject({ existing: 1 });
    await nextPeriod(id);
    await nextPeriod(id);

    const products = (await lines(id)).filter((r) => r.additional_item_id === product);
    expect(products).toHaveLength(1);
    expect(products[0]!.period_start).toBe('2026-10-05');
  });

  it('un producto agregado después del primer cobro se cobra una vez en el periodo siguiente', async () => {
    const product = randomUUID();
    const id = await seed([], '2026-10-05');
    await firstCharge(id, '2026-10-05');
    await sql(
      `UPDATE contracts SET additional_product_ids = $2::jsonb, additional_vat_snapshot = $3::jsonb WHERE id = $1`,
      [
        id,
        JSON.stringify([product]),
        JSON.stringify([
          frozenAdditional({ itemId: product, itemType: 'PRODUCT', unitPrice: '40000.00' }),
        ]),
      ],
    );

    await nextPeriod(id);
    await run(() => generation.generate({ contractId: id, date: '2027-01-05', actorId }));

    const products = (await lines(id)).filter(({ kind }) => kind === 'ADICIONAL');
    expect(products.map((r) => [r.period_start, r.base_amount])).toEqual([
      ['2026-11-05', '40000.00'],
    ]);
  });

  it('202: una línea que no es ADICIONAL no puede enlazar un ítem', async () => {
    await expect(
      sql(`UPDATE billing_document_lines SET additional_item_id = 'x' WHERE kind = 'PLAN'`),
    ).rejects.toMatchObject({ constraint: 'chk_billing_document_lines_additional_item' });
  });
});
