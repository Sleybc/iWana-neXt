import { randomUUID } from 'node:crypto';
import { DataSource, QueryRunner } from 'typeorm';

import {
  billingPostgresIntegrationEnabled,
  createBillingIntegrationDataSource,
  createBillingTenantFixture,
  dropBillingTenantFixture,
  type BillingTenantFixture,
} from './billing-migration.integration-helpers';
import { BillingReceiptAndUnlinkGuards2090000000209 } from './209_billing_receipt_and_unlink_guards';
import { applyTenantMigrationsInOrder, createTenantDataSource } from './runner';

const describeWithDb = billingPostgresIntegrationEnabled ? describe : describe.skip;
const RECEIPT_GUARD = 'billing_payments_receipt_number_guard';
const REVERSAL_GUARD = 'billing_payment_allocations_reversal_guard';
const VOID_GUARD = 'billing_payments_void_guard';

/**
 * Migración 209 en PostgreSQL real (informe MOD05↔MOD14 v1.0, SEC-05 / P-02): el número de
 * recibo asignado es inmutable, el desasociar sobre un documento IMPORTADO o ANULADO falla en
 * base, y los flujos autorizados (anular el pago, anular el documento, borrar el lote importado)
 * siguen pasando. down retira los triggers y up los reaplica.
 */
describeWithDb('Migración 209 — inmutabilidad del recibo y guarda del desasociar', () => {
  let dataSource: DataSource | undefined;
  let fixture: BillingTenantFixture | undefined;
  const m209 = new BillingReceiptAndUnlinkGuards2090000000209();
  const actor = randomUUID();

  function qr(): QueryRunner {
    if (!fixture) throw new Error('Fixture no inicializado.');
    return fixture.queryRunner;
  }

  async function triggers(): Promise<string[]> {
    const rows = (await qr().query(
      `SELECT t.tgname::text AS name
         FROM pg_trigger t
         JOIN pg_class c ON c.oid = t.tgrelid
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = current_schema() AND t.tgname = ANY($1::text[])
        ORDER BY 1`,
      [[RECEIPT_GUARD, REVERSAL_GUARD, VOID_GUARD]],
    )) as Array<{ name: string }>;
    return rows.map((row) => row.name);
  }

  async function payment(input: { imported?: boolean; receipt?: number } = {}): Promise<string> {
    const id = randomUUID();
    await qr().query(
      `INSERT INTO billing_payments (id, tenant_id, subscriber_id, method, amount, paid_at,
         idempotency_key, created_by, external_id, import_batch_id, receipt_number)
       VALUES ($1, $2, $3, 'EFECTIVO', 100, '2026-11-01', $4, $5, $6, $7, $8)`,
      [
        id,
        fixture!.tenantId,
        randomUUID(),
        `m209-${id}`,
        actor,
        input.imported ? `uisp:payment:${id}` : null,
        input.imported ? randomUUID() : null,
        input.receipt ?? null,
      ],
    );
    return id;
  }

  async function issuedDocument(): Promise<string> {
    const contract = randomUUID();
    const subscriber = randomUUID();
    const period = randomUUID();
    const doc = randomUUID();
    await qr().query(
      `INSERT INTO contracts (id, tenant_id, subscriber_id, status, plan_id, plan_snapshot_json)
       VALUES ($1, $2, $3, 'ACTIVE', 'plan', '{}'::jsonb)`,
      [contract, fixture!.tenantId, subscriber],
    );
    await qr().query(
      `INSERT INTO billing_periods (id, tenant_id, contract_id, subscriber_id, period_start,
         period_end, covered_start, generation_date, due_date, effective_policy)
       VALUES ($1, $2, $3, $4, '2026-10-30', '2026-10-31', '2026-10-30', '2026-10-30',
               '2026-11-13', '{}'::jsonb)`,
      [period, fixture!.tenantId, contract, subscriber],
    );
    await qr().query(
      `INSERT INTO billing_documents (id, tenant_id, period_id, contract_id, subscriber_id, status,
         number, due_date, subtotal, tax_total, total)
       VALUES ($1, $2, $3, $4, $5, 'EMITIDO', $6, '2026-11-13', 100, 0, 100)`,
      [doc, fixture!.tenantId, period, contract, subscriber, `D209-${doc.slice(0, 8)}`],
    );
    return doc;
  }

  async function importedDocument(): Promise<string> {
    const doc = randomUUID();
    await qr().query(
      `INSERT INTO billing_documents (id, tenant_id, contract_id, subscriber_id, status,
         external_number, due_date, subtotal, tax_total, total, external_id, import_batch_id)
       VALUES ($1, $2, $3, $4, 'IMPORTADO', 'UISP-1', '2023-01-01', 100, 0, 100, $5, $6)`,
      [doc, fixture!.tenantId, randomUUID(), randomUUID(), `uisp:invoice:${doc}`, randomUUID()],
    );
    return doc;
  }

  async function allocate(paymentId: string, documentId: string, imported = false) {
    const id = randomUUID();
    // Las aplicaciones a documentos IMPORTADO solo las crea la promoción (guarda de la 199).
    if (imported) await qr().query(`SELECT set_config('iwana.import_promotion', 'on', false)`);
    try {
      await qr().query(
        `INSERT INTO billing_payment_allocations (id, tenant_id, payment_id, document_id, amount,
           created_by) VALUES ($1, $2, $3, $4, 10, $5)`,
        [id, fixture!.tenantId, paymentId, documentId, actor],
      );
    } finally {
      if (imported) await qr().query(`SELECT set_config('iwana.import_promotion', 'off', false)`);
    }
    return id;
  }

  const unlink = (allocationId: string) =>
    qr().query(
      `UPDATE billing_payment_allocations
          SET reversed_at = now(), reversed_by = $2, reversal_reason_code = 'REASIGNACION'
        WHERE id = $1`,
      [allocationId, actor],
    );
  const reverseWithoutReason = (allocationId: string) =>
    qr().query(
      `UPDATE billing_payment_allocations SET reversed_at = now(), reversed_by = $2 WHERE id = $1`,
      [allocationId, actor],
    );
  const voidPayment = (paymentId: string) =>
    qr().query(
      `UPDATE billing_payments SET status = 'ANULADO', void_reason_code = 'DUPLICADO',
         voided_at = now(), voided_by = $2 WHERE id = $1`,
      [paymentId, actor],
    );
  const voidDocument = (documentId: string) =>
    qr().query(
      `UPDATE billing_documents SET status = 'ANULADO', void_reason_code = 'ERROR_DE_VALOR',
         voided_at = now(), voided_by = $2 WHERE id = $1`,
      [documentId, actor],
    );

  async function reversed(allocationId: string): Promise<boolean> {
    const rows = (await qr().query(
      `SELECT reversed_at IS NOT NULL AS reversed FROM billing_payment_allocations WHERE id = $1`,
      [allocationId],
    )) as Array<{ reversed: boolean }>;
    return rows[0]?.reversed === true;
  }

  beforeAll(async () => {
    dataSource = createBillingIntegrationDataSource();
    await dataSource.initialize();
    fixture = await createBillingTenantFixture(dataSource, 'tenant_billing173');
    const tenantDataSource = createTenantDataSource(
      dataSource,
      fixture.schemaName,
      `billing-209-${fixture.tenantId.slice(0, 8)}`,
    );
    await tenantDataSource.initialize();
    try {
      await applyTenantMigrationsInOrder(tenantDataSource);
    } finally {
      await tenantDataSource.destroy();
    }
  }, 600_000);

  afterAll(async () => {
    await dropBillingTenantFixture(dataSource, fixture);
  });

  it('la cadena del runner deja los dos triggers', async () => {
    expect(await triggers()).toEqual([REVERSAL_GUARD, RECEIPT_GUARD, VOID_GUARD]);
  });

  it('el número de recibo asignado no cambia ni vuelve a nulo; la numeración inicial pasa', async () => {
    const numbered = await payment({ receipt: 9_001 });
    await expect(
      qr().query(`UPDATE billing_payments SET receipt_number = 9002 WHERE id = $1`, [numbered]),
    ).rejects.toMatchObject({ code: '23514', constraint: RECEIPT_GUARD });
    await expect(
      qr().query(`UPDATE billing_payments SET receipt_number = NULL WHERE id = $1`, [numbered]),
    ).rejects.toMatchObject({ code: '23514', constraint: RECEIPT_GUARD });
    // Reescribir el mismo valor y anular el pago conservan el número.
    await qr().query(`UPDATE billing_payments SET receipt_number = 9001 WHERE id = $1`, [numbered]);
    await voidPayment(numbered);
    const fresh = await payment();
    await qr().query(`UPDATE billing_payments SET receipt_number = 9003 WHERE id = $1`, [fresh]);
    const rows = (await qr().query(
      `SELECT id::text, receipt_number::text, status FROM billing_payments WHERE id = ANY($1)`,
      [[numbered, fresh]],
    )) as Array<{ id: string; receipt_number: string; status: string }>;
    expect(Object.fromEntries(rows.map((row) => [row.id, row.receipt_number]))).toEqual({
      [numbered]: '9001',
      [fresh]: '9003',
    });
  });

  it('desasociar sobre un documento IMPORTADO falla en base, también con el pago anulado', async () => {
    const doc = await importedDocument();
    const imported = await payment({ imported: true });
    const allocation = await allocate(imported, doc, true);
    await expect(unlink(allocation)).rejects.toMatchObject({
      code: '23514',
      constraint: REVERSAL_GUARD,
    });
    // Revertir sin motivo con el pago vigente tampoco es un flujo autorizado.
    await expect(reverseWithoutReason(allocation)).rejects.toMatchObject({
      code: '23514',
      constraint: REVERSAL_GUARD,
    });
    await voidPayment(imported);
    await expect(unlink(allocation)).rejects.toMatchObject({ constraint: REVERSAL_GUARD });
    expect(await reversed(allocation)).toBe(false);
  });

  it('anular el pago (estado antes de revertir) revierte la aplicación a un documento IMPORTADO', async () => {
    const doc = await importedDocument();
    const imported = await payment({ imported: true });
    const allocation = await allocate(imported, doc, true);
    await voidPayment(imported);
    await reverseWithoutReason(allocation);
    expect(await reversed(allocation)).toBe(true);
    // El motivo no se añade después a una reversión de un documento IMPORTADO.
    await expect(
      qr().query(
        `UPDATE billing_payment_allocations SET reversal_reason_code = 'REASIGNACION'
          WHERE id = $1`,
        [allocation],
      ),
    ).rejects.toMatchObject({ constraint: REVERSAL_GUARD });
  });

  it('anular el documento revierte sus aplicaciones; desasociar sobre ANULADO falla en base', async () => {
    const doc = await issuedDocument();
    const first = await allocate(await payment(), doc);
    const second = await allocate(await payment(), doc);
    await voidDocument(doc);
    await expect(unlink(first)).rejects.toMatchObject({
      code: '23514',
      constraint: REVERSAL_GUARD,
    });
    await reverseWithoutReason(first);
    await reverseWithoutReason(second);
    expect(await reversed(first)).toBe(true);
    expect(await reversed(second)).toBe(true);
  });

  it('desasociar y anular el pago sobre un documento EMITIDO siguen permitidos', async () => {
    const doc = await issuedDocument();
    const unlinked = await allocate(await payment(), doc);
    await unlink(unlinked);
    expect(await reversed(unlinked)).toBe(true);
    const native = await payment();
    const byVoid = await allocate(native, doc);
    await reverseWithoutReason(byVoid);
    expect(await reversed(byVoid)).toBe(true);
  });

  it('una reversión registrada es inmutable (fecha, autor y motivo)', async () => {
    const doc = await issuedDocument();
    const unlinked = await allocate(await payment(), doc);
    await unlink(unlinked);
    const byVoid = await allocate(await payment(), doc);
    await reverseWithoutReason(byVoid);
    for (const [allocationId, sql] of [
      [unlinked, `UPDATE billing_payment_allocations SET reversed_at = NULL WHERE id = $1`],
      [
        unlinked,
        `UPDATE billing_payment_allocations SET reversed_at = now() - interval '1 day' WHERE id = $1`,
      ],
      [
        unlinked,
        `UPDATE billing_payment_allocations SET reversed_by = gen_random_uuid() WHERE id = $1`,
      ],
      [
        unlinked,
        `UPDATE billing_payment_allocations SET reversal_reason_code = 'VALOR_EQUIVOCADO' WHERE id = $1`,
      ],
      [
        unlinked,
        `UPDATE billing_payment_allocations SET reversal_reason_code = NULL WHERE id = $1`,
      ],
      [
        byVoid,
        `UPDATE billing_payment_allocations SET reversal_reason_code = 'REASIGNACION' WHERE id = $1`,
      ],
      [byVoid, `UPDATE billing_payment_allocations SET reversed_by = NULL WHERE id = $1`],
    ] as const) {
      await expect(qr().query(sql, [allocationId])).rejects.toMatchObject({
        code: '23514',
        constraint: REVERSAL_GUARD,
      });
    }
    // Reescribir los mismos valores no cambia la reversión y pasa.
    await qr().query(
      `UPDATE billing_payment_allocations
          SET reversed_at = reversed_at, reversed_by = reversed_by,
              reversal_reason_code = reversal_reason_code
        WHERE id = $1`,
      [unlinked],
    );
    const rows = (await qr().query(
      `SELECT reversal_reason_code FROM billing_payment_allocations WHERE id = ANY($1)
        ORDER BY reversal_reason_code NULLS LAST`,
      [[unlinked, byVoid]],
    )) as Array<{ reversal_reason_code: string | null }>;
    expect(rows.map((row) => row.reversal_reason_code)).toEqual(['REASIGNACION', null]);
  });

  it('un pago ANULADO no vuelve a otro estado; anular y reescribir ANULADO pasan', async () => {
    const native = await payment();
    await voidPayment(native);
    await expect(
      qr().query(`UPDATE billing_payments SET status = 'REGISTRADO' WHERE id = $1`, [native]),
    ).rejects.toMatchObject({ code: '23514', constraint: VOID_GUARD });
    await qr().query(`UPDATE billing_payments SET status = 'ANULADO' WHERE id = $1`, [native]);
    const imported = await payment({ imported: true });
    await voidPayment(imported);
    await expect(
      qr().query(`UPDATE billing_payments SET status = 'REGISTRADO' WHERE id = $1`, [imported]),
    ).rejects.toMatchObject({ constraint: VOID_GUARD });
  });

  it('borrar el lote importado (DELETE) no lo bloquea la guarda', async () => {
    const doc = await importedDocument();
    const imported = await payment({ imported: true });
    const allocation = await allocate(imported, doc, true);
    await qr().query(`DELETE FROM billing_payment_allocations WHERE id = $1`, [allocation]);
    await qr().query(`DELETE FROM billing_documents WHERE id = $1`, [doc]);
    await qr().query(`DELETE FROM billing_payments WHERE id = $1`, [imported]);
    const rows = (await qr().query(
      `SELECT COUNT(*)::int AS total FROM billing_payment_allocations WHERE id = $1`,
      [allocation],
    )) as Array<{ total: number }>;
    expect(rows[0]?.total).toBe(0);
  });

  it('down retira triggers y funciones (la renumeración y el desasociar pasan); up reaplica', async () => {
    await m209.down(qr());
    await m209.down(qr());
    expect(await triggers()).toEqual([]);
    const functions = (await qr().query(
      `SELECT COUNT(*)::int AS total FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = current_schema() AND p.proname = ANY($1::text[])`,
      [[RECEIPT_GUARD, REVERSAL_GUARD, VOID_GUARD]],
    )) as Array<{ total: number }>;
    expect(functions[0]?.total).toBe(0);
    const numbered = await payment({ receipt: 9_101 });
    await qr().query(`UPDATE billing_payments SET receipt_number = 9102 WHERE id = $1`, [numbered]);
    const doc = await importedDocument();
    const allocation = await allocate(await payment({ imported: true }), doc, true);
    await unlink(allocation);
    expect(await reversed(allocation)).toBe(true);
    // Sin la 209, un pago anulado puede volver a REGISTRADO.
    await voidPayment(numbered);
    await qr().query(
      `UPDATE billing_payments SET status = 'REGISTRADO', void_reason_code = NULL,
         voided_at = NULL, voided_by = NULL WHERE id = $1`,
      [numbered],
    );

    await m209.up(qr());
    await m209.up(qr());
    expect(await triggers()).toEqual([REVERSAL_GUARD, RECEIPT_GUARD, VOID_GUARD]);
    await expect(
      qr().query(`UPDATE billing_payments SET receipt_number = 9103 WHERE id = $1`, [numbered]),
    ).rejects.toMatchObject({ constraint: RECEIPT_GUARD });
  });
});
