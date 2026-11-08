import { randomUUID } from 'node:crypto';
import { TenantContext, runInTenantSchema } from '@iwana/db';
import type { DataSource } from 'typeorm';
import {
  billingPostgresIntegrationEnabled,
  createBillingIntegrationDataSource,
  dropBillingTenantFixture,
} from '../../../../../../packages/database/src/migrations/tenant/billing-migration.integration-helpers';
import { createBillingSchema } from '../billing-postgres.fixture';
import { BillingTitularErasureParticipant } from './billing-titular-erasure.participant';

const describeDb = billingPostgresIntegrationEnabled ? describe : describe.skip;

describeDb('MOD14 — supresión de notas de anulación sobre migración 173 real', () => {
  let ds: DataSource;
  let fixture: Awaited<ReturnType<typeof createBillingSchema>>;

  beforeAll(async () => {
    ds = createBillingIntegrationDataSource();
    await ds.initialize();
    fixture = await createBillingSchema(ds);
  });
  afterAll(async () => dropBillingTenantFixture(ds, fixture));

  it('detecta notas como único residual, las limpia sin cambiar montos ni terceros y es idempotente', async () => {
    const subscriber = randomUUID();
    const otherSubscriber = randomUUID();
    const contract = randomUUID();
    const owner = fixture.tenantId;
    const otherOwner = randomUUID();
    const actor = randomUUID();
    await runInTenantSchema(ds, fixture.schemaName, async (qr) => {
      await qr.query(
        `INSERT INTO contracts (id,tenant_id,subscriber_id,status,plan_snapshot_json)
        VALUES ($1,$2,$3,'TERMINATED','{}')`,
        [contract, owner, subscriber],
      );
      for (const [index, tenant, subject] of [
        [0, owner, subscriber],
        [1, owner, otherSubscriber],
        [2, otherOwner, subscriber],
      ] as const) {
        const period = randomUUID();
        await qr.query(
          `INSERT INTO billing_periods
          (id,tenant_id,contract_id,subscriber_id,period_start,period_end,covered_start,generation_date,due_date,effective_policy)
          VALUES ($1,$2,$3,$4,$5::date,$5::date,$5::date,$5::date,$5::date,'{}')`,
          [period, tenant, contract, subject, `2020-01-0${index + 1}`],
        );
        await qr.query(
          `INSERT INTO billing_documents
          (tenant_id,period_id,contract_id,subscriber_id,status,number,due_date,subtotal,tax_total,total,void_note)
          VALUES ($1,$2,$3,$4,'ANULADO',$5,'2020-01-01',100,19,119,'canario sintético de anulación')`,
          [tenant, period, contract, subject, `TEST-${index}`],
        );
        await qr.query(
          `INSERT INTO billing_payments
          (tenant_id,subscriber_id,method,amount,paid_at,idempotency_key,status,void_note,created_by)
          VALUES ($1,$2,'EFECTIVO',119,'2020-01-01',$3,'ANULADO','canario sintético de anulación',$4)`,
          [tenant, subject, `probe-${index}`, actor],
        );
      }
    });
    const scope = { partyId: null, subscriberIds: [subscriber], expedienteIds: [], userIds: [] };
    const participant = new BillingTitularErasureParticipant();
    const run = (mode: 'dry-run' | 'apply') =>
      TenantContext.run(
        { tenantId: owner, schemaName: fixture.schemaName, tenantSlug: 'synthetic-erasure' },
        () => runInTenantSchema(ds, fixture.schemaName, (qr) => participant.apply(scope, qr, mode)),
      );
    const preview = await run('dry-run');
    expect(preview.find((r) => r.table === 'billing_documents')?.residual).toBe(1);
    expect(preview.find((r) => r.table === 'billing_payments')?.residual).toBe(1);
    expect(preview.every((r) => r.changed === 0)).toBe(true);
    const applied = await run('apply');
    expect(applied.every((r) => r.residual === 0)).toBe(true);
    expect((await run('apply')).every((r) => r.changed === 0 && r.residual === 0)).toBe(true);
    await runInTenantSchema(ds, fixture.schemaName, async (qr) => {
      for (const [table, amount] of [
        ['billing_documents', 'total'],
        ['billing_payments', 'amount'],
      ] as const) {
        const rows =
          (await qr.query(`SELECT tenant_id, subscriber_id, void_note, ${amount}::text AS amount
          FROM ${table}`)) as Array<{
            tenant_id: string;
            subscriber_id: string;
            void_note: string | null;
            amount: string;
          }>;
        expect(rows).toHaveLength(3);
        for (const row of rows) {
          expect(row.amount).toBe('119.00');
          expect(row.void_note).toBe(
            row.tenant_id === owner && row.subscriber_id === subscriber
              ? null
              : 'canario sintético de anulación',
          );
        }
      }
    });
  });
});
