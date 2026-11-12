import { randomUUID } from 'node:crypto';
import { DataSource, QueryRunner } from 'typeorm';

import {
  billingPostgresIntegrationEnabled,
  createBillingIntegrationDataSource,
  createBillingTenantFixture,
  dropBillingTenantFixture,
  type BillingTenantFixture,
} from './billing-migration.integration-helpers';
import { BillingCourtesies2030000000203 } from './203_billing_courtesies';
import { SeedBillingCourtesiesPermission2040000000204 } from './204_seed_billing_courtesies_permission';
import { applyTenantMigrationsInOrder, createTenantDataSource } from './runner';

const DESTRUCTIVE = 'IWANA_ALLOW_DESTRUCTIVE_TENANT_DOWN';
const describeWithDb = billingPostgresIntegrationEnabled ? describe : describe.skip;

/**
 * Migraciones 203 (cortesías) y 204 (permiso) en PostgreSQL real: restricciones, down con guarda
 * destructiva, down imposible con una línea de cortesía fiscal y reaplicación (spec MOD14
 * 2026-11-12 bloque D).
 */
describeWithDb('Migraciones 203 y 204 — cortesías de facturación', () => {
  let dataSource: DataSource | undefined;
  let fixture: BillingTenantFixture | undefined;
  const m203 = new BillingCourtesies2030000000203();
  const m204 = new SeedBillingCourtesiesPermission2040000000204();
  const actor = randomUUID();

  function qr(): QueryRunner {
    if (!fixture) throw new Error('Fixture no inicializado.');
    return fixture.queryRunner;
  }

  async function tableExists(): Promise<boolean> {
    const rows = (await qr().query(
      `SELECT to_regclass(current_schema() || '.billing_courtesies') IS NOT NULL AS present`,
    )) as Array<{ present: boolean }>;
    return rows[0]?.present === true;
  }

  async function grants(): Promise<number> {
    const rows = (await qr().query(
      `SELECT (SELECT COUNT(*)::int FROM access_permission_catalog
                WHERE permission_key = 'billing.courtesies.manage')
            + (SELECT COUNT(*)::int FROM access_profile_permissions
                WHERE permission_key = 'billing.courtesies.manage') AS total`,
    )) as Array<{ total: number }>;
    return rows[0]?.total ?? 0;
  }

  async function rejects(sql: string, params: unknown[], constraint: string): Promise<void> {
    // Sin transacción abierta: cada sentencia es atómica y el fallo no deja rastro.
    await expect(qr().query(sql, params)).rejects.toMatchObject({ constraint });
  }

  async function seedDocument(
    status: 'BORRADOR' | 'EMITIDO',
  ): Promise<{ doc: string; line: string }> {
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
       VALUES ($1, $2, $3, $4, $5, $6, $7, '2026-11-13', 0, 0, 0)`,
      [
        doc,
        fixture!.tenantId,
        period,
        contract,
        subscriber,
        status,
        status === 'EMITIDO' ? `DC-${doc.slice(0, 6)}` : null,
      ],
    );
    const lines = (await qr().query(
      `INSERT INTO billing_document_lines (tenant_id, document_id, kind, description, quantity,
         unit_price, base_amount, tax_amount, total, vat_treatment, vat_rate, position)
       VALUES ($1, $2, 'PRORRATEO', 'Prorrateo', 1, 10, 10, 0, 10, 'EXEMPT', 0, 0),
              ($1, $2, 'CORTESIA', 'Cortesía', 1, -10, -10, 0, -10, 'EXEMPT', 0, 1)
       RETURNING id::text, kind`,
      [fixture!.tenantId, doc],
    )) as Array<{ id: string; kind: string }>;
    await qr().query(
      `INSERT INTO billing_courtesies (tenant_id, document_id, subscriber_id, application, target,
         source_line_id, line_id, amount, reason_code, created_by, idempotency_key)
       VALUES ($1, $2, $3, 'LINEA_EN_BORRADOR', 'LINEA', $4, $5, 10, 'PRORRATEO_INICIAL', $6,
               gen_random_uuid()::text)`,
      [
        fixture!.tenantId,
        doc,
        subscriber,
        lines.find((l) => l.kind === 'PRORRATEO')!.id,
        lines.find((l) => l.kind === 'CORTESIA')!.id,
        actor,
      ],
    );
    return { doc, line: lines.find((l) => l.kind === 'PRORRATEO')!.id };
  }

  beforeAll(async () => {
    dataSource = createBillingIntegrationDataSource();
    await dataSource.initialize();
    fixture = await createBillingTenantFixture(dataSource, 'tenant_billing173');
    const tenantDataSource = createTenantDataSource(
      dataSource,
      fixture.schemaName,
      `billing-203-${fixture.tenantId.slice(0, 8)}`,
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
    if (dataSource?.isInitialized) await dataSource.destroy();
  });

  it('204: down retira catálogo y asignaciones y up las repone', async () => {
    expect(await grants()).toBe(3);
    await m204.down(qr());
    expect(await grants()).toBe(0);
    await m204.up(qr());
    await m204.up(qr());
    expect(await grants()).toBe(3);
  });

  it('203: CHECKs de signo, motivo y forma de anulación', async () => {
    const { doc, line } = await seedDocument('BORRADOR');
    await rejects(
      `INSERT INTO billing_document_lines (tenant_id, document_id, kind, description, quantity,
         unit_price, base_amount, tax_amount, total, vat_treatment, vat_rate, position)
       VALUES ($1, $2, 'PLAN', 'Plan', 1, -1, -1, 0, -1, 'EXEMPT', 0, 5)`,
      [fixture!.tenantId, doc],
      'chk_billing_document_lines_courtesy_sign',
    );
    await rejects(
      `INSERT INTO billing_courtesies (tenant_id, document_id, subscriber_id, application, target,
         amount, reason_code, created_by, idempotency_key)
       VALUES ($1, $2, $3, 'AJUSTE_SOBRE_EMITIDO', 'VALOR', 5, 'INVENTADO', $3, 'k-motivo')`,
      [fixture!.tenantId, doc, actor],
      'billing_courtesies_reason_code_check',
    );
    await rejects(
      `INSERT INTO billing_courtesies (tenant_id, document_id, subscriber_id, application, target,
         amount, reason_code, status, created_by, idempotency_key)
       VALUES ($1, $2, $3, 'AJUSTE_SOBRE_EMITIDO', 'VALOR', 5, 'OTRO', 'ANULADA', $3, 'k-forma')`,
      [fixture!.tenantId, doc, actor],
      'chk_billing_courtesies_void_shape',
    );
    await rejects(
      `INSERT INTO billing_courtesies (tenant_id, document_id, subscriber_id, application, target,
         source_line_id, amount, reason_code, created_by, idempotency_key)
       VALUES ($1, $2, $3, 'AJUSTE_SOBRE_EMITIDO', 'LINEA', $4, 5, 'OTRO', $3, 'k-linea')`,
      [fixture!.tenantId, doc, actor, line],
      'uq_billing_courtesies_source_line_active',
    );
    // Una línea CORTESIA nunca suma: positiva la rechaza el mismo CHECK.
    await rejects(
      `INSERT INTO billing_document_lines (tenant_id, document_id, kind, description, quantity,
         unit_price, base_amount, tax_amount, total, vat_treatment, vat_rate, position)
       VALUES ($1, $2, 'CORTESIA', 'Cortesía', 1, 1, 1, 0, 1, 'EXEMPT', 0, 6)`,
      [fixture!.tenantId, doc],
      'chk_billing_document_lines_courtesy_sign',
    );
    // La clave de idempotencia de otorgar es única por tenant.
    const keyed = (await qr().query(
      `SELECT idempotency_key FROM billing_courtesies WHERE document_id = $1`,
      [doc],
    )) as Array<{ idempotency_key: string }>;
    await rejects(
      `INSERT INTO billing_courtesies (tenant_id, document_id, subscriber_id, application, target,
         amount, reason_code, created_by, idempotency_key)
       VALUES ($1, $2, $3, 'AJUSTE_SOBRE_EMITIDO', 'VALOR', 5, 'OTRO', $3, $4)`,
      [fixture!.tenantId, doc, actor, keyed[0]!.idempotency_key],
      'uq_billing_courtesies_idempotency',
    );
    // Borrar el borrador arrastra su cortesía.
    await qr().query('DELETE FROM billing_documents WHERE id = $1', [doc]);
    const left = (await qr().query(
      'SELECT COUNT(*)::int AS n FROM billing_courtesies WHERE document_id = $1',
      [doc],
    )) as Array<{ n: number }>;
    expect(left[0]?.n).toBe(0);
  });

  it('203: down bloqueado sin la guarda; con ella recalcula el borrador y reaplica', async () => {
    const { doc } = await seedDocument('BORRADOR');
    await qr().query(
      `UPDATE billing_documents SET subtotal = 0, tax_total = 0, total = 0 WHERE id = $1`,
      [doc],
    );
    await expect(m203.down(qr())).rejects.toThrow(DESTRUCTIVE);
    expect(await tableExists()).toBe(true);
    process.env[DESTRUCTIVE] = 'true';
    try {
      await m203.down(qr());
    } finally {
      delete process.env[DESTRUCTIVE];
    }
    expect(await tableExists()).toBe(false);
    const totals = (await qr().query('SELECT total::text FROM billing_documents WHERE id = $1', [
      doc,
    ])) as Array<{ total: string }>;
    expect(totals[0]?.total).toBe('10.00');
    await m203.up(qr());
    expect(await tableExists()).toBe(true);
  });

  it('203: down imposible con una línea de cortesía en un documento emitido', async () => {
    await seedDocument('EMITIDO');
    process.env[DESTRUCTIVE] = 'true';
    try {
      await expect(m203.down(qr())).rejects.toThrow('imposible');
    } finally {
      delete process.env[DESTRUCTIVE];
    }
    expect(await tableExists()).toBe(true);
  });
});
