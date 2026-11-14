import { randomUUID } from 'node:crypto';
import { DataSource, QueryRunner } from 'typeorm';

import {
  billingPostgresIntegrationEnabled,
  createBillingIntegrationDataSource,
  createBillingTenantFixture,
  dropBillingTenantFixture,
  type BillingTenantFixture,
} from './billing-migration.integration-helpers';
import { BillingReceiptsAndAllocationReversalReason2070000000207 } from './207_billing_receipts_and_allocation_reversal_reason';
import { BillingReceiptAndUnlinkGuards2090000000209 } from './209_billing_receipt_and_unlink_guards';
import { applyTenantMigrationsInOrder, createTenantDataSource } from './runner';

const DESTRUCTIVE = 'IWANA_ALLOW_DESTRUCTIVE_TENANT_DOWN';
const describeWithDb = billingPostgresIntegrationEnabled ? describe : describe.skip;

/**
 * Migración 207 en PostgreSQL real (spec MOD05↔MOD14 2026-11-13 bloque A, D8): backfill del
 * consecutivo por tenant y `(created_at, id)` solo en pagos nativos —anulados incluidos—,
 * restricciones del recibo y del motivo de desasociación, down con guarda destructiva y
 * reaplicación.
 */
describeWithDb('Migración 207 — recibo numerado y motivo de desasociación', () => {
  let dataSource: DataSource | undefined;
  let fixture: BillingTenantFixture | undefined;
  const m207 = new BillingReceiptsAndAllocationReversalReason2070000000207();
  const actor = randomUUID();
  const otherTenant = randomUUID();

  function qr(): QueryRunner {
    if (!fixture) throw new Error('Fixture no inicializado.');
    return fixture.queryRunner;
  }

  async function columns(): Promise<string[]> {
    const rows = (await qr().query(
      `SELECT table_name || '.' || column_name AS name FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name IN ('billing_payments', 'billing_payment_allocations')
          AND column_name IN ('receipt_number', 'reversal_reason_code')
        ORDER BY 1`,
    )) as Array<{ name: string }>;
    return rows.map((row) => row.name);
  }

  async function insertPayment(input: {
    tenantId: string;
    createdAt: string;
    status?: 'REGISTRADO' | 'ANULADO';
    imported?: boolean;
  }): Promise<string> {
    const id = randomUUID();
    const voided = input.status === 'ANULADO';
    await qr().query(
      `INSERT INTO billing_payments (id, tenant_id, subscriber_id, method, amount, paid_at,
         idempotency_key, status, void_reason_code, voided_at, voided_by, created_by, created_at,
         external_id, import_batch_id)
       VALUES ($1, $2, $3, 'EFECTIVO', 10, '2026-11-01', $4, $5, $6, $7::timestamptz, $8::uuid,
               $9, $10::timestamptz, $11, $12)`,
      [
        id,
        input.tenantId,
        randomUUID(),
        `m207-${id}`,
        voided ? 'ANULADO' : 'REGISTRADO',
        voided ? 'DUPLICADO' : null,
        voided ? new Date().toISOString() : null,
        voided ? actor : null,
        actor,
        input.createdAt,
        input.imported ? `uisp:payment:${id.slice(0, 8)}` : null,
        input.imported ? randomUUID() : null,
      ],
    );
    return id;
  }

  async function receipts(): Promise<Map<string, string | null>> {
    const rows = (await qr().query(
      `SELECT id::text, receipt_number::text FROM billing_payments`,
    )) as Array<{ id: string; receipt_number: string | null }>;
    return new Map(rows.map((row) => [row.id, row.receipt_number]));
  }

  beforeAll(async () => {
    dataSource = createBillingIntegrationDataSource();
    await dataSource.initialize();
    fixture = await createBillingTenantFixture(dataSource, 'tenant_billing173');
    const tenantDataSource = createTenantDataSource(
      dataSource,
      fixture.schemaName,
      `billing-207-${fixture.tenantId.slice(0, 8)}`,
    );
    await tenantDataSource.initialize();
    try {
      await applyTenantMigrationsInOrder(tenantDataSource);
    } finally {
      await tenantDataSource.destroy();
    }
    // La 207 se prueba en su propio estado: los triggers de la 209 dependen de sus columnas
    // (UPDATE OF) y rechazan el desasociar sobre IMPORTADO que esta suite ejercita en crudo.
    await new BillingReceiptAndUnlinkGuards2090000000209().down(qr());
  }, 600_000);

  afterAll(async () => {
    delete process.env[DESTRUCTIVE];
    await dropBillingTenantFixture(dataSource, fixture);
  });

  it('la cadena del runner deja las dos columnas', async () => {
    expect(await columns()).toEqual([
      'billing_payment_allocations.reversal_reason_code',
      'billing_payments.receipt_number',
    ]);
  });

  it('down sin datos retira columnas y un segundo down es inocuo', async () => {
    await m207.down(qr());
    expect(await columns()).toEqual([]);
    await m207.down(qr());
    expect(await columns()).toEqual([]);
  });

  it('up numera los nativos por tenant y (created_at, id), anulados incluidos; los importados quedan nulos', async () => {
    const tenantId = fixture!.tenantId;
    const second = await insertPayment({ tenantId, createdAt: '2026-11-02T00:00:00Z' });
    const voided = await insertPayment({
      tenantId,
      createdAt: '2026-11-03T00:00:00Z',
      status: 'ANULADO',
    });
    const first = await insertPayment({ tenantId, createdAt: '2026-11-01T00:00:00Z' });
    const imported = await insertPayment({
      tenantId,
      createdAt: '2026-10-01T00:00:00Z',
      imported: true,
    });
    const other = await insertPayment({ tenantId: otherTenant, createdAt: '2026-11-05T00:00:00Z' });

    await m207.up(qr());
    await m207.up(qr());

    const numbers = await receipts();
    expect(numbers.get(first)).toBe('1');
    expect(numbers.get(second)).toBe('2');
    expect(numbers.get(voided)).toBe('3');
    expect(numbers.get(imported)).toBeNull();
    expect(numbers.get(other)).toBe('1');
  });

  it('restricciones: único por tenant, solo nativos, positivo y motivo cerrado solo en revertidas', async () => {
    const tenantId = fixture!.tenantId;
    const fresh = await insertPayment({ tenantId, createdAt: '2026-11-09T00:00:00Z' });
    await expect(
      qr().query(`UPDATE billing_payments SET receipt_number = 1 WHERE id = $1`, [fresh]),
    ).rejects.toMatchObject({ constraint: 'uq_billing_payments_receipt_number' });
    await expect(
      qr().query(`UPDATE billing_payments SET receipt_number = 0 WHERE id = $1`, [fresh]),
    ).rejects.toMatchObject({ constraint: 'chk_billing_payments_receipt_positive' });
    const imported = await insertPayment({
      tenantId,
      createdAt: '2026-11-09T00:00:00Z',
      imported: true,
    });
    await expect(
      qr().query(`UPDATE billing_payments SET receipt_number = 500 WHERE id = $1`, [imported]),
    ).rejects.toMatchObject({ constraint: 'chk_billing_payments_receipt_native' });

    const document = randomUUID();
    const contract = randomUUID();
    await qr().query(
      `INSERT INTO billing_documents (id, tenant_id, contract_id, subscriber_id, status,
         external_number, due_date, subtotal, tax_total, total, external_id, import_batch_id)
       VALUES ($1, $2, $3, $4, 'IMPORTADO', 'UISP-1', '2023-01-01', 10, 0, 10, $5, $6)`,
      [document, tenantId, contract, randomUUID(), `uisp:invoice:${document}`, randomUUID()],
    );
    const allocation = (await qr().query(`SELECT gen_random_uuid()::text AS id`)) as Array<{
      id: string;
    }>;
    const allocationId = allocation[0]!.id;
    // Aplicación de la promoción (guarda de la 199): pago importado sobre documento IMPORTADO.
    await qr().query(`SELECT set_config('iwana.import_promotion', 'on', false)`);
    try {
      await qr().query(
        `INSERT INTO billing_payment_allocations (id, tenant_id, payment_id, document_id, amount,
           created_by) VALUES ($1, $2, $3, $4, 1, $5)`,
        [allocationId, tenantId, imported, document, actor],
      );
    } finally {
      await qr().query(`SELECT set_config('iwana.import_promotion', 'off', false)`);
    }
    await expect(
      qr().query(
        `UPDATE billing_payment_allocations SET reversal_reason_code = 'REASIGNACION'
          WHERE id = $1`,
        [allocationId],
      ),
    ).rejects.toMatchObject({ constraint: 'chk_billing_allocations_reversal_reason_shape' });
    await expect(
      qr().query(
        `UPDATE billing_payment_allocations
            SET reversed_at = now(), reversed_by = $2, reversal_reason_code = 'OTRO'
          WHERE id = $1`,
        [allocationId, actor],
      ),
    ).rejects.toMatchObject({ constraint: 'chk_billing_allocations_reversal_reason_code' });
    await qr().query(
      `UPDATE billing_payment_allocations
          SET reversed_at = now(), reversed_by = $2, reversal_reason_code = 'VALOR_EQUIVOCADO'
        WHERE id = $1`,
      [allocationId, actor],
    );
  });

  it('down bloqueado con recibos o motivos; con la guarda retira todo y up reaplica', async () => {
    await expect(m207.down(qr())).rejects.toThrow(DESTRUCTIVE);
    expect(await columns()).toHaveLength(2);
    process.env[DESTRUCTIVE] = 'true';
    try {
      await m207.down(qr());
    } finally {
      delete process.env[DESTRUCTIVE];
    }
    expect(await columns()).toEqual([]);
    await m207.up(qr());
    expect(await columns()).toHaveLength(2);
    const [row] = (await qr().query(
      `SELECT COUNT(*)::int AS total FROM billing_payments
        WHERE import_batch_id IS NULL AND receipt_number IS NULL`,
    )) as Array<{ total: number }>;
    expect(row?.total).toBe(0);
  });
});
