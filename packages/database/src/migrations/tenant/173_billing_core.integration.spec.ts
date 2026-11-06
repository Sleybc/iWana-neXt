import { randomUUID } from 'node:crypto';

import {
  createBillingIntegrationDataSource,
  createBillingTenantFixture,
  billingPostgresIntegrationEnabled,
  dropBillingTenantFixture,
  type BillingTenantFixture,
} from './billing-migration.integration-helpers';
import { BillingCore1730000000173 } from './173_billing_core';

const describeWithBillingPostgres = billingPostgresIntegrationEnabled ? describe : describe.skip;

describeWithBillingPostgres('173 — núcleo de facturación en PostgreSQL real', () => {
  let dataSource = createBillingIntegrationDataSource();
  let fixture: BillingTenantFixture | undefined;
  const migration = new BillingCore1730000000173();

  beforeAll(async () => {
    await dataSource.initialize();
    fixture = await createBillingTenantFixture(dataSource, 'tenant_billing173');
    await fixture.queryRunner.query('CREATE TABLE contracts (id uuid PRIMARY KEY)');
  });

  afterAll(async () => {
    await dropBillingTenantFixture(dataSource, fixture);
  });

  it('up crea el esquema, siembra valores G0 y down elimina lo creado', async () => {
    const activeFixture = fixture;
    const queryRunner = activeFixture?.queryRunner;
    if (!activeFixture || !queryRunner) throw new Error('Fixture MOD14 173 no inicializado.');

    await migration.up(queryRunner);
    const encryptedColumn = (await queryRunner.query(
      `SELECT data_type, character_maximum_length, is_nullable
       FROM information_schema.columns
       WHERE table_schema = current_schema()
         AND table_name = 'billing_documents'
         AND column_name = 'buyer_document_encrypted'`,
    )) as Array<{
      data_type: string;
      character_maximum_length: number;
      is_nullable: string;
    }>;
    expect(encryptedColumn).toEqual([
      { data_type: 'character varying', character_maximum_length: 500, is_nullable: 'YES' },
    ]);
    const fingerprintColumn = (await queryRunner.query(
      `SELECT data_type, character_maximum_length, is_nullable
       FROM information_schema.columns
       WHERE table_schema = current_schema()
         AND table_name = 'billing_payments'
         AND column_name = 'allocations_fingerprint'`,
    )) as Array<{ data_type: string; character_maximum_length: number; is_nullable: string }>;
    expect(fingerprintColumn).toEqual([
      { data_type: 'character', character_maximum_length: 64, is_nullable: 'YES' },
    ]);
    const additionalCountColumn = (await queryRunner.query(
      `SELECT data_type, is_nullable, column_default
       FROM information_schema.columns
       WHERE table_schema = current_schema()
         AND table_name = 'billing_documents'
         AND column_name = 'unbilled_additional_count'`,
    )) as Array<{ data_type: string; is_nullable: string; column_default: string }>;
    expect(additionalCountColumn).toEqual([
      { data_type: 'smallint', is_nullable: 'NO', column_default: '0' },
    ]);
    const additionalCountCheck = (await queryRunner.query(
      `SELECT constraint_name FROM information_schema.check_constraints
       WHERE constraint_schema = current_schema()
         AND constraint_name = 'chk_billing_documents_unbilled_additional_count_non_negative'`,
    )) as Array<{ constraint_name: string }>;
    expect(additionalCountCheck).toEqual([
      { constraint_name: 'chk_billing_documents_unbilled_additional_count_non_negative' },
    ]);
    const buyerSnapshotCheck = (await queryRunner.query(
      `SELECT constraint_name FROM information_schema.check_constraints
       WHERE constraint_schema = current_schema()
         AND constraint_name = 'chk_billing_documents_buyer_snapshot_no_document_number'`,
    )) as Array<{ constraint_name: string }>;
    expect(buyerSnapshotCheck).toEqual([
      { constraint_name: 'chk_billing_documents_buyer_snapshot_no_document_number' },
    ]);

    const policy = (await queryRunner.query(
      `SELECT period_timing, cutoff_mode, approval_mode, automatic_generation, document_prefix
       FROM billing_policy WHERE tenant_id = $1`,
      [activeFixture.tenantId],
    )) as Array<{
      period_timing: string;
      cutoff_mode: string;
      approval_mode: string;
      automatic_generation: boolean;
      document_prefix: string;
    }>;
    expect(policy).toEqual([
      {
        period_timing: 'ANTICIPADO',
        cutoff_mode: 'DIA_FIJO_CICLO',
        approval_mode: 'BORRADOR',
        automatic_generation: false,
        document_prefix: 'DC',
      },
    ]);

    await expect(
      queryRunner.query(
        `UPDATE billing_policy SET period_timing = 'VENCIDO' WHERE tenant_id = $1`,
        [activeFixture.tenantId],
      ),
    ).rejects.toThrow();

    const contractId = randomUUID();
    const periodId = randomUUID();
    const tenantId = activeFixture.tenantId;
    await queryRunner.query('INSERT INTO contracts (id) VALUES ($1)', [contractId]);
    await queryRunner.query(
      `INSERT INTO billing_periods
        (id, tenant_id, contract_id, subscriber_id, period_start, period_end, covered_start,
         generation_date, due_date, effective_policy)
       VALUES ($1, $2, $3, $4, '2026-10-01', '2026-10-31', '2026-10-01',
               '2026-10-01', '2026-10-15', '{}'::jsonb)`,
      [periodId, tenantId, contractId, randomUUID()],
    );
    await expect(
      queryRunner.query(
        `INSERT INTO billing_periods
          (tenant_id, contract_id, subscriber_id, period_start, period_end, covered_start,
           generation_date, due_date, effective_policy)
         VALUES ($1, $2, $3, '2026-10-01', '2026-10-31', '2026-10-01',
                 '2026-10-01', '2026-10-15', '{}'::jsonb)`,
        [tenantId, contractId, randomUUID()],
      ),
    ).rejects.toThrow();

    const documentId = randomUUID();
    const insertDocument = (id: string, status: string, number: string | null) =>
      queryRunner.query(
        `INSERT INTO billing_documents
          (id, tenant_id, period_id, contract_id, subscriber_id, status, number, due_date,
           subtotal, tax_total, total)
         VALUES ($1, $2, $3, $4, $5, $6, $7, '2026-10-15', 100, 0, 100)`,
        [id, tenantId, periodId, contractId, randomUUID(), status, number],
      );

    await insertDocument(documentId, 'BORRADOR', null);
    const defaultAdditionalCount = (await queryRunner.query(
      `SELECT unbilled_additional_count FROM billing_documents WHERE id = $1`,
      [documentId],
    )) as Array<{ unbilled_additional_count: number }>;
    expect(defaultAdditionalCount).toEqual([{ unbilled_additional_count: 0 }]);
    await expect(
      queryRunner.query(
        `UPDATE billing_documents SET unbilled_additional_count = -1 WHERE id = $1`,
        [documentId],
      ),
    ).rejects.toThrow();

    const encryptedDocumentNumber = 'v1:nonce:ciphertext:tag';
    const buyerSnapshot = { displayName: 'Adquirente de prueba', documentType: 'NIT' };
    await queryRunner.query(
      `UPDATE billing_documents
       SET buyer_snapshot = $2::jsonb, buyer_document_encrypted = $3
       WHERE id = $1`,
      [documentId, JSON.stringify(buyerSnapshot), encryptedDocumentNumber],
    );
    const buyerRoundTrip = (await queryRunner.query(
      `SELECT buyer_snapshot, buyer_document_encrypted
       FROM billing_documents WHERE id = $1`,
      [documentId],
    )) as Array<{ buyer_snapshot: typeof buyerSnapshot; buyer_document_encrypted: string }>;
    expect(buyerRoundTrip).toEqual([
      { buyer_snapshot: buyerSnapshot, buyer_document_encrypted: encryptedDocumentNumber },
    ]);

    await expect(
      queryRunner.query(`UPDATE billing_documents SET buyer_snapshot = $2::jsonb WHERE id = $1`, [
        documentId,
        JSON.stringify({ ...buyerSnapshot, documentNumber: 'DOCUMENTO_FICTICIO' }),
      ]),
    ).rejects.toThrow();

    await expect(insertDocument(randomUUID(), 'EMITIDO', null)).rejects.toThrow();
    await queryRunner.query(`UPDATE billing_documents SET status = 'ANULADO' WHERE id = $1`, [
      documentId,
    ]);
    await insertDocument(randomUUID(), 'EMITIDO', 'DC-001');
    await expect(insertDocument(randomUUID(), 'ANULADO', 'DC-001')).rejects.toThrow();

    const payment = {
      tenantId,
      subscriberId: randomUUID(),
      createdBy: randomUUID(),
    };
    const paymentValues = [
      payment.tenantId,
      payment.subscriberId,
      payment.createdBy,
      'MOD14-KEY-001',
    ];
    const insertPayment = () =>
      queryRunner.query(
        `INSERT INTO billing_payments
          (tenant_id, subscriber_id, method, amount, paid_at, idempotency_key, created_by)
         VALUES ($1, $2, 'EFECTIVO', 100, '2026-10-10', $4, $3)`,
        paymentValues,
      );
    await insertPayment();
    const fingerprint = 'a'.repeat(64);
    const originalPayment = (await queryRunner.query(
      `SELECT allocations_fingerprint FROM billing_payments WHERE idempotency_key = $1`,
      [paymentValues[3]],
    )) as Array<{ allocations_fingerprint: string | null }>;
    expect(originalPayment).toEqual([{ allocations_fingerprint: null }]);
    await queryRunner.query(
      `UPDATE billing_payments SET allocations_fingerprint = $1 WHERE idempotency_key = $2`,
      [fingerprint, paymentValues[3]],
    );
    const savedFingerprint = (await queryRunner.query(
      `SELECT allocations_fingerprint FROM billing_payments WHERE idempotency_key = $1`,
      [paymentValues[3]],
    )) as Array<{ allocations_fingerprint: string | null }>;
    expect(savedFingerprint).toEqual([{ allocations_fingerprint: fingerprint }]);
    await expect(insertPayment()).rejects.toThrow();

    const systemAllocation = (await queryRunner.query(
      `INSERT INTO billing_payment_allocations
        (tenant_id, payment_id, document_id, amount, created_by)
       SELECT $1, id, $2, 100, NULL FROM billing_payments
       WHERE tenant_id = $1 AND idempotency_key = $3
       RETURNING created_by`,
      [tenantId, documentId, paymentValues[3]],
    )) as Array<{ created_by: string | null }>;
    expect(systemAllocation).toEqual([{ created_by: null }]);

    const indexRows = (await queryRunner.query(
      `SELECT indexname FROM pg_indexes WHERE schemaname = current_schema()
       AND indexname IN ('uq_billing_documents_period_live', 'idx_billing_documents_subscriber',
                         'idx_billing_allocations_document', 'idx_billing_allocations_payment')
       ORDER BY indexname`,
    )) as Array<{ indexname: string }>;
    expect(indexRows.map((row) => row.indexname)).toEqual([
      'idx_billing_allocations_document',
      'idx_billing_allocations_payment',
      'idx_billing_documents_subscriber',
      'uq_billing_documents_period_live',
    ]);

    await migration.down(queryRunner);
    const remaining = (await queryRunner.query(
      `SELECT to_regclass('billing_policy') AS policy,
              to_regclass('billing_periods') AS periods,
              to_regclass('billing_documents') AS documents,
              to_regclass('billing_payments') AS payments`,
    )) as Array<{
      policy: string | null;
      periods: string | null;
      documents: string | null;
      payments: string | null;
    }>;
    expect(remaining).toEqual([{ policy: null, periods: null, documents: null, payments: null }]);
  });
});
