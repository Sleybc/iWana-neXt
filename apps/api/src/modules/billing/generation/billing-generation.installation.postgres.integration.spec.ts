// MOD05 Cierre de venta fase 2 · bloque D (CA-4, CA-5, D-F1) contra PostgreSQL real: la línea
// «Instalación» del primer cobro leída por el adaptador real del puerto de contratos.
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

const STANDARD = { treatment: 'STANDARD', legalBasis: 'ET-468', ratePercent: 19 };
const EXEMPT = { treatment: 'EXENTO', legalBasis: 'ET_481_H', ratePercent: 0 };

const describeDb = billingPostgresIntegrationEnabled ? describe : describe.skip;
describeDb('Bloque D — línea de instalación del primer cobro (PostgreSQL real)', () => {
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
    TenantContext.run({ tenantId, schemaName, tenantSlug: 'install-fee-it' }, fn);
  const sql = <T = Record<string, unknown>>(query: string, args: unknown[] = []) =>
    runInTenantSchema(ds, schemaName, (qr) => qr.query(query, args) as Promise<T[]>);

  async function seed(input: {
    fee: string | null;
    vat?: typeof STANDARD;
    discount?: string;
  }): Promise<string> {
    const id = randomUUID();
    const subscriber = randomUUID();
    await sql(
      `INSERT INTO subscribers (id,tenant_id,party_id,person_type,document_type,business_name) VALUES ($1,$2,$3,'JURIDICA','NIT','Titular sintético')`,
      [subscriber, tenantId, randomUUID()],
    );
    await sql(
      `INSERT INTO contracts (id,tenant_id,subscriber_id,status,billing_cycle_day,start_date,plan_snapshot_json,vat_snapshot,fiscal_document,installation_fee)
       VALUES ($1,$2,$3,'ACTIVE',5,'2026-10-05',$4::jsonb,$5::jsonb,'900000001',$6)`,
      [
        id,
        tenantId,
        subscriber,
        JSON.stringify({ name: 'Plan sintético', monthlyPrice: '100000.00' }),
        JSON.stringify({
          ...(input.vat ?? STANDARD),
          requiresAccountantReview: false,
          resolvedAt: '2026-10-01T00:00:00Z',
        }),
        input.fee,
      ],
    );
    if (input.discount) {
      await sql(
        `INSERT INTO contract_permanence (contract_id,tenant_id,accepted,months,connection_fee,discounted_amount)
         VALUES ($1,$2,true,12,$3,$4)`,
        [id, tenantId, input.fee, input.discount],
      );
    }
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
    }>(
      `SELECT p.period_start::text, l.kind, l.description, l.unit_price, l.base_amount,
              l.tax_amount, l.total, l.vat_treatment
         FROM billing_document_lines l
         JOIN billing_documents d ON d.id = l.document_id
         JOIN billing_periods p ON p.id = d.period_id
        WHERE d.contract_id = $1
        ORDER BY p.period_start, l.position`,
      [contractId],
    );
  const docs = (contractId: string) =>
    sql<{ subtotal: string; tax_total: string; total: string }>(
      `SELECT d.subtotal, d.tax_total, d.total FROM billing_documents d
         JOIN billing_periods p ON p.id = d.period_id
        WHERE d.contract_id = $1 ORDER BY p.period_start`,
      [contractId],
    );
  const firstCharge = (contractId: string) =>
    run(() =>
      generation.generate({
        contractId,
        date: '2026-10-06',
        firstChargeFrom: '2026-10-05',
        actorId: null,
      }),
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

  it('CA-4 sin permanencia: el primer cobro trae «Instalación» con IVA del servicio; el siguiente no', async () => {
    const id = await seed({ fee: '80000.00' });

    expect(await firstCharge(id)).toMatchObject({ generated: 1 });
    expect(await nextPeriod(id)).toMatchObject({ generated: 1 });

    const rows = await lines(id);
    expect(rows.map(({ period_start, kind }) => [period_start, kind])).toEqual([
      ['2026-10-05', 'PLAN'],
      ['2026-10-05', 'INSTALACION'],
      ['2026-11-05', 'PLAN'],
    ]);
    expect(rows[1]).toMatchObject({
      description: 'Instalación',
      unit_price: '80000.00',
      base_amount: '80000.00',
      tax_amount: '15200.00',
      total: '95200.00',
      vat_treatment: 'STANDARD',
    });
    expect(await docs(id)).toEqual([
      { subtotal: '180000.00', tax_total: '34200.00', total: '214200.00' },
      { subtotal: '100000.00', tax_total: '19000.00', total: '119000.00' },
    ]);
  });

  it('D-F1 contrato exento (estrato 1-3): la instalación sale sin IVA, igual que el servicio', async () => {
    const id = await seed({ fee: '80000.00', vat: EXEMPT });

    await firstCharge(id);

    const [, install] = await lines(id);
    expect(install).toMatchObject({
      base_amount: '80000.00',
      tax_amount: '0.00',
      total: '80000.00',
      vat_treatment: 'EXENTO',
    });
    expect(await docs(id)).toEqual([
      { subtotal: '180000.00', tax_total: '0.00', total: '180000.00' },
    ]);
  });

  it('CA-5 permanencia parcial: cobra cargo menos descontado y muestra el descuento', async () => {
    const id = await seed({ fee: '80000.00', discount: '50000.00' });

    await firstCharge(id);

    const [, install] = await lines(id);
    expect(install).toMatchObject({
      kind: 'INSTALACION',
      unit_price: '80000.00',
      base_amount: '30000.00',
      tax_amount: '5700.00',
      total: '35700.00',
    });
    expect(install!.description).toMatch(/^Instalación \(.*descuento por permanencia/u);
    expect(await docs(id)).toEqual([
      { subtotal: '130000.00', tax_total: '24700.00', total: '154700.00' },
    ]);
  });

  it('CA-5 permanencia total: la línea sale en cero con el descuento visible', async () => {
    const id = await seed({ fee: '80000.00', discount: '80000.00' });

    await firstCharge(id);

    const [, install] = await lines(id);
    expect(install).toMatchObject({ base_amount: '0.00', tax_amount: '0.00', total: '0.00' });
    expect(install!.description).toContain('descuento por permanencia');
    expect(await docs(id)).toEqual([
      { subtotal: '100000.00', tax_total: '19000.00', total: '119000.00' },
    ]);
  });

  it.each([null, '0.00'])('sin cargo de instalación (%p) no agrega línea', async (fee) => {
    const id = await seed({ fee });

    await firstCharge(id);

    expect((await lines(id)).map(({ kind }) => kind)).toEqual(['PLAN']);
  });

  it('idempotencia: el evento repetido y la regeneración manual no cobran la instalación dos veces', async () => {
    const id = await seed({ fee: '80000.00' });

    const [first, second] = await Promise.all([firstCharge(id), firstCharge(id)]);
    expect(first.generated + second.generated).toBe(1);
    expect(first.existing + second.existing).toBe(1);
    expect(
      await run(() => generation.generate({ contractId: id, date: '2026-11-05', actorId })),
    ).toMatchObject({ existing: 1 });
    await nextPeriod(id);
    await nextPeriod(id);

    const installs = (await lines(id)).filter(
      ({ description, kind }) => description.startsWith('Instalación') && kind === 'INSTALACION',
    );
    expect(installs).toHaveLength(1);
  });
});
