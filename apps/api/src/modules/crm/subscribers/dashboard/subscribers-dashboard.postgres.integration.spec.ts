import { randomBytes, randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { DataSource } from 'typeorm';
import { resolveMigrationDbCredentials, TenantContext } from '@iwana/db';
import { SubscribersDashboardSummarySchema } from '@iwana/shared';
import type { SettingsPriorityTenantReadPort } from '../../../tenant/ports/settings-priority-tenant-read.port';
import { SubscribersDashboardService } from './subscribers-dashboard.service';
import {
  applyTenantMigrationsInOrder,
  createTenantDataSource,
} from '../../../../../../../packages/database/src/migrations/tenant/runner';

/**
 * N2 contra PostgreSQL real (HLD-MOD02 v3.0 §3 N2, §7, §8.2 y §8.3). Dos schemas efímeros con
 * la cadena de migraciones tenant vigente; datos sintéticos sin PII.
 */
const dbAvailable = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const describeWithDb = dbAvailable ? describe : describe.skip;
const databaseName = process.env['DB_NAME'] ?? '';
const allowedDatabaseName = /^(test|iwana_it_[a-z0-9_]+)$/u;

if (dbAvailable && !allowedDatabaseName.test(databaseName)) {
  throw new Error(
    'Integración N2: DB_NAME debe ser test o iwana_it_*; solo crea y limpia schemas efímeros.',
  );
}

interface TenantFixture {
  tenantId: string;
  schemaName: string;
  quoted: string;
}

function newTenant(label: string): TenantFixture {
  const schemaName = `tenant_n2_${label}_${randomBytes(4).toString('hex')}`;
  return { tenantId: randomUUID(), schemaName, quoted: `"${schemaName}"` };
}

const BOGOTA = 'America/Bogota';
const AS_OF = '2026-11-17';

describeWithDb('N2 · resumen de altas y bajas — PostgreSQL real', () => {
  let dataSource: DataSource;
  let service: SubscribersDashboardService;
  const tenantA = newTenant('a');
  const tenantB = newTenant('b');
  const actorId = randomUUID();
  const settings = { getSnapshot: jest.fn().mockResolvedValue({ timezone: BOGOTA }) };

  async function createTenantSchema(tenant: TenantFixture): Promise<void> {
    await dataSource.query(
      `INSERT INTO public.tenants (id, name, slug, schema_name, status, contact_email)
       VALUES ($1, $2, $3, $4, 'ACTIVE', $5)`,
      [
        tenant.tenantId,
        'N2 sintético',
        `n2-${tenant.tenantId.slice(0, 8)}`,
        tenant.schemaName,
        'n2-dashboard@example.invalid',
      ],
    );
    await dataSource.query(`CREATE SCHEMA ${tenant.quoted}`);
    const tenantDataSource = createTenantDataSource(
      dataSource,
      tenant.schemaName,
      `n2-${tenant.schemaName}`,
    );
    await tenantDataSource.initialize();
    try {
      await applyTenantMigrationsInOrder(tenantDataSource);
    } finally {
      await tenantDataSource.destroy();
    }
  }

  async function insertSubscriber(
    tenant: TenantFixture,
    input: {
      activatedAt: string | null;
      deletedAt?: string;
      importBatchId?: string;
      rowTenantId?: string;
    },
  ): Promise<string> {
    const id = randomUUID();
    await dataSource.query(
      `INSERT INTO ${tenant.quoted}.subscribers (
         id, tenant_id, status, person_type, customer_segment, activated_at, deleted_at,
         import_batch_id, document_type, document_number_encrypted, first_name, last_name,
         stratum, vat_treatment, vat_responsibility, address, created_by
       ) VALUES (
         $1, $2, 'ACTIVE', 'NATURAL', 'RESIDENTIAL', $3, $4, $5, 'CC', 'synthetic-encrypted',
         'Titular', 'Sintético', 3, 'STANDARD', 'RESPONSABLE', 'Dirección sintética', $6
       )`,
      [
        id,
        input.rowTenantId ?? tenant.tenantId,
        input.activatedAt,
        input.deletedAt ?? null,
        input.importBatchId ?? null,
        actorId,
      ],
    );
    return id;
  }

  async function insertChange(
    tenant: TenantFixture,
    subscriberId: string,
    input: {
      from: string;
      to: string;
      changedAt: string;
      entityType?: 'SUBSCRIBER' | 'CONTRACT';
      rowTenantId?: string;
    },
  ): Promise<void> {
    await dataSource.query(
      `INSERT INTO ${tenant.quoted}.crm_lifecycle_changes (
         tenant_id, entity_type, entity_id, subscriber_id, from_status, to_status,
         reason_code, source, batch_id, actor_id, changed_at
       ) VALUES ($1, $2, $3, $3, $4, $5, 'SOLICITUD_TITULAR', 'MANUAL', $6, $7, $8)`,
      [
        input.rowTenantId ?? tenant.tenantId,
        input.entityType ?? 'SUBSCRIBER',
        subscriberId,
        input.from,
        input.to,
        randomUUID(),
        actorId,
        input.changedAt,
      ],
    );
  }

  const summarize = (tenant: TenantFixture, timezone = BOGOTA, asOf = AS_OF) =>
    service.summarize({
      tenantId: tenant.tenantId,
      schemaName: tenant.schemaName,
      timezone,
      asOf,
    });

  beforeAll(async () => {
    const credentials = resolveMigrationDbCredentials();
    dataSource = new DataSource({
      type: 'postgres',
      host: process.env['DB_HOST'] ?? '127.0.0.1',
      port: Number.parseInt(process.env['DB_PORT'] ?? '5432', 10),
      username: credentials.username,
      password: credentials.password,
      database: databaseName,
      entities: [],
      migrations: [],
      synchronize: false,
      logging: false,
      extra: { max: 3, min: 1, connectionTimeoutMillis: 5_000 },
    });
    await dataSource.initialize();
    await createTenantSchema(tenantA);
    await createTenantSchema(tenantB);
    service = new SubscribersDashboardService(
      dataSource,
      settings as unknown as SettingsPriorityTenantReadPort,
    );

    // ── Tenant A ─────────────────────────────────────────────────────────
    // Altas de noviembre (Bogotá, UTC-5).
    const s1 = await insertSubscriber(tenantA, { activatedAt: '2026-11-05T15:00:00Z' });
    const s5 = await insertSubscriber(tenantA, { activatedAt: '2026-11-01T05:30:00Z' }); // 1-nov 00:30
    const s6 = await insertSubscriber(tenantA, { activatedAt: '2026-12-01T04:59:00Z' }); // 30-nov 23:59
    // Excluidas: borrado lógico, importado y fila de otro tenant en el mismo schema.
    await insertSubscriber(tenantA, {
      activatedAt: '2026-11-06T15:00:00Z',
      deletedAt: '2026-11-07T15:00:00Z',
    });
    await insertSubscriber(tenantA, {
      activatedAt: '2026-11-06T15:00:00Z',
      importBatchId: randomUUID(),
    });
    await insertSubscriber(tenantA, {
      activatedAt: '2026-11-06T15:00:00Z',
      rowTenantId: randomUUID(),
    });
    // Límite de mes: 1-nov 03:00 UTC es 31-oct 22:00 en Bogotá.
    const s4 = await insertSubscriber(tenantA, { activatedAt: '2026-11-01T03:00:00Z' });
    // Fuera del mes en curso por arriba (1-dic 00:00 Bogotá) y por debajo de la ventana.
    await insertSubscriber(tenantA, { activatedAt: '2026-12-01T05:00:00Z' });
    await insertSubscriber(tenantA, { activatedAt: '2025-12-01T04:59:00Z' }); // 30-nov-2025
    await insertSubscriber(tenantA, { activatedAt: '2025-12-01T05:00:00Z' }); // 1-dic-2025
    // Sin activar (prospecto): no es alta.
    const prospect = await insertSubscriber(tenantA, { activatedAt: null });

    // Suspensión, reactivación y cancelación en el mismo mes: una sola baja.
    await insertChange(tenantA, s1, {
      from: 'ACTIVE',
      to: 'SUSPENDED',
      changedAt: '2026-11-03T15:00:00Z',
    });
    await insertChange(tenantA, s1, {
      from: 'SUSPENDED',
      to: 'ACTIVE',
      changedAt: '2026-11-04T15:00:00Z',
    });
    await insertChange(tenantA, s1, {
      from: 'ACTIVE',
      to: 'CANCELLED',
      changedAt: '2026-11-10T15:00:00Z',
    });
    // Cancelación desde suspendido: cuenta.
    await insertChange(tenantA, s5, {
      from: 'SUSPENDED',
      to: 'CANCELLED',
      changedAt: '2026-11-12T15:00:00Z',
    });
    // Lotes de ciclo de vida sin cambio de estado del suscriptor: no duplican.
    await insertChange(tenantA, s6, {
      from: 'ACTIVE',
      to: 'ACTIVE',
      changedAt: '2026-11-13T15:00:00Z',
    });
    await insertChange(tenantA, s1, {
      from: 'CANCELLED',
      to: 'CANCELLED',
      changedAt: '2026-11-14T15:00:00Z',
    });
    // Fila CONTRACT y descarte de prospecto: no son bajas de cliente.
    await insertChange(tenantA, s6, {
      from: 'ACTIVE',
      to: 'CANCELLED',
      changedAt: '2026-11-15T15:00:00Z',
      entityType: 'CONTRACT',
    });
    await insertChange(tenantA, prospect, {
      from: 'PROSPECT',
      to: 'CANCELLED',
      changedAt: '2026-11-15T15:00:00Z',
    });
    // Fila de otro tenant en el mismo schema.
    await insertChange(tenantA, s6, {
      from: 'ACTIVE',
      to: 'CANCELLED',
      changedAt: '2026-11-15T15:00:00Z',
      rowTenantId: randomUUID(),
    });
    // Límite de mes: 1-nov 04:59 UTC es 31-oct 23:59 en Bogotá.
    await insertChange(tenantA, s4, {
      from: 'ACTIVE',
      to: 'CANCELLED',
      changedAt: '2026-11-01T04:59:00Z',
    });

    // ── Tenant B ─────────────────────────────────────────────────────────
    const b1 = await insertSubscriber(tenantB, { activatedAt: '2026-11-08T15:00:00Z' });
    await insertSubscriber(tenantB, { activatedAt: '2026-11-09T15:00:00Z' });
    await insertChange(tenantB, b1, {
      from: 'ACTIVE',
      to: 'CANCELLED',
      changedAt: '2026-11-16T15:00:00Z',
    });
  }, 300_000);

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      try {
        for (const tenant of [tenantA, tenantB]) {
          await dataSource.query(`DROP SCHEMA IF EXISTS ${tenant.quoted} CASCADE`);
          await dataSource.query('DELETE FROM public.tenants WHERE id = $1', [tenant.tenantId]);
        }
      } finally {
        await dataSource.destroy();
      }
    }
  });

  it('altas: excluye borrado lógico, importados, prospectos y filas de otro tenant', async () => {
    const summary = await summarize(tenantA);

    expect(SubscribersDashboardSummarySchema.safeParse(summary).success).toBe(true);
    expect(summary.asOf).toBe(AS_OF);
    expect(summary.activations).toBe(3);
    expect(summary.series).toHaveLength(12);
    expect(summary.series[0]).toEqual({ month: '2025-12', activations: 1, cancellations: 0 });
  });

  it('bajas: suspensión, reactivación y cancelación en el mismo mes cuentan una vez; sin duplicar por lotes sin cambio de estado', async () => {
    const summary = await summarize(tenantA);

    expect(summary.cancellations).toBe(2);
    expect(summary.series[summary.series.length - 1]).toEqual({
      month: '2026-11',
      activations: 3,
      cancellations: 2,
    });
  });

  it('límite de mes en la zona del tenant', async () => {
    const bogota = await summarize(tenantA);
    const utc = await summarize(tenantA, 'UTC');

    const octBogota = bogota.series.find((item) => item.month === '2026-10');
    const octUtc = utc.series.find((item) => item.month === '2026-10');
    expect(octBogota).toEqual({ month: '2026-10', activations: 1, cancellations: 1 });
    expect(octUtc).toEqual({ month: '2026-10', activations: 0, cancellations: 0 });
    // En UTC: s4 y su baja pasan a noviembre; s6 (1-dic 04:59 UTC) sale del mes.
    expect(utc.activations).toBe(3);
    expect(utc.cancellations).toBe(3);
    // En UTC la ventana empieza el 1-dic-2025 00:00 UTC: entran las dos filas de esa noche.
    expect(utc.series[0]).toEqual({ month: '2025-12', activations: 2, cancellations: 0 });
  });

  it('dos tenants no se cruzan', async () => {
    const summaryA = await summarize(tenantA);
    const summaryB = await summarize(tenantB);

    expect(summaryB.activations).toBe(2);
    expect(summaryB.cancellations).toBe(1);
    expect(summaryA.activations).toBe(3);
    // El tenant A leído con el schema de B no devuelve nada: tenant_id y search_path filtran.
    const crossed = await service.summarize({
      tenantId: tenantA.tenantId,
      schemaName: tenantB.schemaName,
      timezone: BOGOTA,
      asOf: AS_OF,
    });
    expect(crossed.series.every((item) => item.activations === 0 && item.cancellations === 0)).toBe(
      true,
    );
  });

  it('getSummary usa el TenantContext y la zona del puerto', async () => {
    const summary = await TenantContext.run(
      { tenantId: tenantB.tenantId, schemaName: tenantB.schemaName, tenantSlug: 'n2-b' },
      () => service.getSummary(),
    );

    expect(settings.getSnapshot).toHaveBeenCalledWith({ tenantId: tenantB.tenantId });
    expect(SubscribersDashboardSummarySchema.safeParse(summary).success).toBe(true);
  });

  it('p95 ≤ 300 ms con volumen sintético (HLD §7)', async () => {
    // Volumen en B, después de sus aserciones: 20 000 suscriptores y 40 000 cambios en 3 años.
    await dataSource.query(
      `INSERT INTO ${tenantB.quoted}.subscribers (
         id, tenant_id, status, person_type, customer_segment, activated_at,
         document_type, document_number_encrypted, first_name, last_name,
         stratum, vat_treatment, vat_responsibility, address, created_by
       )
       SELECT gen_random_uuid(), $1, 'ACTIVE', 'NATURAL', 'RESIDENTIAL',
              timestamptz '2024-01-01 00:00:00+00' + (n * interval '75 minutes'),
              'CC', 'synthetic-encrypted', 'Titular', 'Sintético', 3, 'STANDARD',
              'RESPONSABLE', 'Dirección sintética', $2
         FROM generate_series(1, 20000) AS n`,
      [tenantB.tenantId, actorId],
    );
    await dataSource.query(
      `INSERT INTO ${tenantB.quoted}.crm_lifecycle_changes (
         tenant_id, entity_type, entity_id, subscriber_id, from_status, to_status,
         reason_code, source, batch_id, changed_at
       )
       SELECT s.tenant_id, CASE WHEN k = 1 THEN 'SUBSCRIBER' ELSE 'CONTRACT' END, s.id, s.id,
              'ACTIVE', CASE WHEN k = 1 THEN 'CANCELLED' ELSE 'SUSPENDED' END,
              'MORA', 'SYSTEM', gen_random_uuid(), s.activated_at + interval '20 days'
         FROM ${tenantB.quoted}.subscribers s
        CROSS JOIN generate_series(1, 2) AS k
        WHERE s.tenant_id = $1`,
      [tenantB.tenantId],
    );
    await dataSource.query(`ANALYZE ${tenantB.quoted}.subscribers`);
    await dataSource.query(`ANALYZE ${tenantB.quoted}.crm_lifecycle_changes`);

    const run = () => summarize(tenantB);
    for (let index = 0; index < 5; index += 1) await run();
    const samples: number[] = [];
    for (let index = 0; index < 60; index += 1) {
      const started = performance.now();
      await run();
      samples.push(performance.now() - started);
    }
    samples.sort((a, b) => a - b);
    const p95 = samples[Math.ceil(samples.length * 0.95) - 1]!;
    const p50 = samples[Math.floor(samples.length / 2)]!;
    console.info(
      `[N2] p50=${p50.toFixed(1)} ms p95=${p95.toFixed(1)} ms (n=60, 20k suscriptores, 40k cambios)`,
    );
    expect(p95).toBeLessThanOrEqual(300);
  }, 180_000);
});
