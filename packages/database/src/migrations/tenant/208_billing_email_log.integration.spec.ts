import { randomUUID } from 'node:crypto';
import { DataSource, QueryRunner } from 'typeorm';

import {
  billingPostgresIntegrationEnabled,
  createBillingIntegrationDataSource,
  createBillingTenantFixture,
  dropBillingTenantFixture,
  type BillingTenantFixture,
} from './billing-migration.integration-helpers';
import { BillingEmailLog2080000000208 } from './208_billing_email_log';
import { applyTenantMigrationsInOrder, createTenantDataSource } from './runner';

const DESTRUCTIVE = 'IWANA_ALLOW_DESTRUCTIVE_TENANT_DOWN';
const describeWithDb = billingPostgresIntegrationEnabled ? describe : describe.skip;

/**
 * Migración 208 en PostgreSQL real (spec MOD05↔MOD14 2026-11-13 bloque B, R4): forma
 * tipo ↔ destino y estado ↔ motivo, un solo envío en cola por destino, cascada desde el documento
 * y el pago, down con guarda destructiva y reaplicación.
 */
describeWithDb('Migración 208 — registro de correos de Facturación', () => {
  let dataSource: DataSource | undefined;
  let fixture: BillingTenantFixture | undefined;
  const m208 = new BillingEmailLog2080000000208();
  const actor = randomUUID();
  const subscriber = randomUUID();

  function qr(): QueryRunner {
    if (!fixture) throw new Error('Fixture no inicializado.');
    return fixture.queryRunner;
  }

  async function present(): Promise<boolean> {
    const [row] = (await qr().query(
      `SELECT to_regclass('billing_email_log') IS NOT NULL AS present`,
    )) as Array<{ present: boolean }>;
    return row?.present ?? false;
  }

  async function insertDocument(): Promise<string> {
    const id = randomUUID();
    await qr().query(
      `INSERT INTO billing_documents (id, tenant_id, contract_id, subscriber_id, status,
         external_number, due_date, subtotal, tax_total, total, external_id, import_batch_id)
       VALUES ($1, $2, $3, $4, 'IMPORTADO', 'UISP-1', '2023-01-01', 10, 0, 10, $5, $6)`,
      [id, fixture!.tenantId, randomUUID(), subscriber, `uisp:invoice:${id}`, randomUUID()],
    );
    return id;
  }

  async function insertPayment(): Promise<string> {
    const id = randomUUID();
    await qr().query(
      `INSERT INTO billing_payments (id, tenant_id, subscriber_id, method, amount, paid_at,
         idempotency_key, status, created_by)
       VALUES ($1, $2, $3, 'EFECTIVO', 10, '2026-11-01', $4, 'REGISTRADO', $5)`,
      [id, fixture!.tenantId, subscriber, `m208-${id}`, actor],
    );
    return id;
  }

  async function insertLog(values: {
    kind: string;
    documentId?: string | null;
    paymentId?: string | null;
    periodFrom?: string | null;
    periodTo?: string | null;
    status?: string;
    reasonCode?: string | null;
  }): Promise<string> {
    const status = values.status ?? 'EN_COLA';
    const rows = (await qr().query(
      `INSERT INTO billing_email_log (tenant_id, subscriber_id, kind, document_id, payment_id,
         period_from, period_to, subject, status, reason_code, requested_by, processed_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'Asunto', $8, $9, $10,
               CASE WHEN $11::boolean THEN NULL ELSE now() END)
       RETURNING id::text`,
      [
        fixture!.tenantId,
        subscriber,
        values.kind,
        values.documentId ?? null,
        values.paymentId ?? null,
        values.periodFrom ?? null,
        values.periodTo ?? null,
        status,
        values.reasonCode ?? null,
        actor,
        status === 'EN_COLA',
      ],
    )) as Array<{ id: string }>;
    return rows[0]!.id;
  }

  beforeAll(async () => {
    dataSource = createBillingIntegrationDataSource();
    await dataSource.initialize();
    fixture = await createBillingTenantFixture(dataSource, 'tenant_billing173');
    const tenantDataSource = createTenantDataSource(
      dataSource,
      fixture.schemaName,
      `billing-208-${fixture.tenantId.slice(0, 8)}`,
    );
    await tenantDataSource.initialize();
    try {
      await applyTenantMigrationsInOrder(tenantDataSource);
    } finally {
      await tenantDataSource.destroy();
    }
  }, 600_000);

  afterAll(async () => {
    delete process.env[DESTRUCTIVE];
    await dropBillingTenantFixture(dataSource, fixture);
  });

  it('la cadena del runner crea la tabla y un down sin filas es repetible', async () => {
    expect(await present()).toBe(true);
    await m208.down(qr());
    await m208.down(qr());
    expect(await present()).toBe(false);
    await m208.up(qr());
    expect(await present()).toBe(true);
  });

  it('forma tipo ↔ destino y estado ↔ motivo', async () => {
    const document = await insertDocument();
    const payment = await insertPayment();
    await expect(insertLog({ kind: 'FACTURA' })).rejects.toMatchObject({
      constraint: 'chk_billing_email_log_target_shape',
    });
    await expect(insertLog({ kind: 'RECIBO', documentId: document })).rejects.toMatchObject({
      constraint: 'chk_billing_email_log_target_shape',
    });
    await expect(insertLog({ kind: 'ESTADO_CUENTA', paymentId: payment })).rejects.toMatchObject({
      constraint: 'chk_billing_email_log_target_shape',
    });
    await expect(
      insertLog({ kind: 'ESTADO_CUENTA', periodFrom: '2026-05-01', periodTo: '2026-04-01' }),
    ).rejects.toMatchObject({ constraint: 'chk_billing_email_log_period' });
    await expect(
      insertLog({ kind: 'FACTURA', documentId: document, status: 'RECHAZADO' }),
    ).rejects.toMatchObject({ constraint: 'chk_billing_email_log_reason_shape' });
    await expect(
      insertLog({
        kind: 'FACTURA',
        documentId: document,
        status: 'ERROR',
        reasonCode: 'SIN_CORREO',
      }),
    ).rejects.toMatchObject({ constraint: 'chk_billing_email_log_reason_shape' });
    await expect(
      insertLog({ kind: 'FACTURA', documentId: document, status: 'ENVIADO', reasonCode: 'OTRO' }),
    ).rejects.toThrow();
    await insertLog({
      kind: 'FACTURA',
      documentId: document,
      status: 'RECHAZADO',
      reasonCode: 'TITULAR_RESTRINGIDO',
    });
    await insertLog({
      kind: 'RECIBO',
      paymentId: payment,
      status: 'ERROR',
      reasonCode: 'FALLO_DE_ENVIO',
    });
  });

  it('un solo envío EN_COLA por destino; terminado, admite otro', async () => {
    const document = await insertDocument();
    const queued = await insertLog({ kind: 'FACTURA', documentId: document });
    await expect(insertLog({ kind: 'FACTURA', documentId: document })).rejects.toMatchObject({
      constraint: 'uq_billing_email_log_queued_target',
    });
    await insertLog({ kind: 'ESTADO_CUENTA' });
    await expect(insertLog({ kind: 'ESTADO_CUENTA' })).rejects.toMatchObject({
      constraint: 'uq_billing_email_log_queued_target',
    });
    await insertLog({ kind: 'ESTADO_CUENTA', periodTo: '2026-03-31' });
    await qr().query(
      `UPDATE billing_email_log SET status = 'ENVIADO', processed_at = now() WHERE id = $1`,
      [queued],
    );
    await insertLog({ kind: 'FACTURA', documentId: document });
  });

  it('borrar el documento o el pago arrastra sus filas', async () => {
    const document = await insertDocument();
    const payment = await insertPayment();
    await insertLog({ kind: 'FACTURA', documentId: document, status: 'ENVIADO' });
    await insertLog({ kind: 'RECIBO', paymentId: payment, status: 'ENVIADO' });
    await qr().query(`DELETE FROM billing_documents WHERE id = $1`, [document]);
    await qr().query(`DELETE FROM billing_payments WHERE id = $1`, [payment]);
    const [row] = (await qr().query(
      `SELECT COUNT(*)::int AS total FROM billing_email_log
        WHERE document_id = $1 OR payment_id = $2`,
      [document, payment],
    )) as Array<{ total: number }>;
    expect(row?.total).toBe(0);
  });

  it('down bloqueado con filas; con la guarda retira la tabla y up la reaplica', async () => {
    await expect(m208.down(qr())).rejects.toThrow(DESTRUCTIVE);
    expect(await present()).toBe(true);
    process.env[DESTRUCTIVE] = 'true';
    try {
      await m208.down(qr());
    } finally {
      delete process.env[DESTRUCTIVE];
    }
    expect(await present()).toBe(false);
    await m208.up(qr());
    expect(await present()).toBe(true);
  });
});
