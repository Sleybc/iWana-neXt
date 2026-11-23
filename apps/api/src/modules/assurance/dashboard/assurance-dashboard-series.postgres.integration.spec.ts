import { randomBytes, randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { DataSource } from 'typeorm';
import { resolveMigrationDbCredentials, TenantContext } from '@iwana/db';
import {
  AssuranceDashboardSeriesSchema,
  SlaBreachStatus,
  TicketFieldDecision,
  TicketPriority,
  TicketRequesterType,
  TicketSource,
  TicketStatus,
  TicketType,
} from '@iwana/shared';
import type { SettingsPriorityTenantReadPort } from '../../tenant/ports/settings-priority-tenant-read.port';
import {
  AssuranceDashboardSeriesService,
  datesEndingAt,
} from './assurance-dashboard-series.service';
import {
  applyTenantMigrationsInOrder,
  createTenantDataSource,
} from '../../../../../../packages/database/src/migrations/tenant/runner';
import { ephemeralSchemaName } from '../../../../../../packages/database/test/ephemeral-schema';

/**
 * N3 contra PostgreSQL real (HLD-MOD02 v3.0 §3 N3, §7 y §8.4). Dos schemas efímeros con la
 * cadena de migraciones tenant vigente; datos sintéticos sin PII.
 */
const dbAvailable = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const describeWithDb = dbAvailable ? describe : describe.skip;
const databaseName = process.env['DB_NAME'] ?? '';
const allowedDatabaseName = /^(test|iwana_it_[a-z0-9_]+)$/u;

if (dbAvailable && !allowedDatabaseName.test(databaseName)) {
  throw new Error(
    'Integración N3: DB_NAME debe ser test o iwana_it_*; solo crea y limpia schemas efímeros.',
  );
}

interface TenantFixture {
  tenantId: string;
  schemaName: string;
  quoted: string;
}

function newTenant(label: string): TenantFixture {
  const schemaName = ephemeralSchemaName(`tenant_n3_${label}_`);
  return { tenantId: randomUUID(), schemaName, quoted: `"${schemaName}"` };
}

const BOGOTA = 'America/Bogota';
const AS_OF = '2026-11-17';

// Presupuesto de latencia (HLD §7): el CI lo mide en un paso propio, en serie
// (`--runInBand`), porque la corrida paralela de 4 workers en un runner de 2
// núcleos mide la contención entre suites y no la consulta. Ese paso pone esta
// variable en la corrida paralela; en local, sin ella, la prueba corre siempre.
const itLatencyBudget = process.env['IWANA_IT_LATENCY_DEFERRED'] === '1' ? it.skip : it;

describeWithDb('N3 · serie diaria de casos — PostgreSQL real', () => {
  let dataSource: DataSource;
  let service: AssuranceDashboardSeriesService;
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
        'N3 sintético',
        `n3-${tenant.tenantId.slice(0, 8)}`,
        tenant.schemaName,
        'n3-dashboard@example.invalid',
      ],
    );
    await dataSource.query(`CREATE SCHEMA ${tenant.quoted}`);
    const tenantDataSource = createTenantDataSource(
      dataSource,
      tenant.schemaName,
      `n3-${tenant.schemaName}`,
    );
    await tenantDataSource.initialize();
    try {
      await applyTenantMigrationsInOrder(tenantDataSource);
    } finally {
      await tenantDataSource.destroy();
    }
  }

  async function insertTicket(
    tenant: TenantFixture,
    input: {
      createdAt: string;
      resolvedAt?: string;
      importBatchId?: string;
      rowTenantId?: string;
    },
  ): Promise<void> {
    await dataSource.query(
      `INSERT INTO ${tenant.quoted}.support_tickets (
         id, tenant_id, ticket_number, type, status, priority, source, subject,
         requester_type, sla_breach_status, field_decision, created_by_user_id,
         created_at, updated_at, resolved_at, import_batch_id
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $13, $14, $15)`,
      [
        randomUUID(),
        input.rowTenantId ?? tenant.tenantId,
        `N3-${randomBytes(8).toString('hex')}`,
        TicketType.CUSTOMER_INCIDENT,
        input.resolvedAt ? TicketStatus.RESOLVED : TicketStatus.OPEN,
        TicketPriority.NORMAL,
        TicketSource.MANUAL,
        'Caso sintético del inicio',
        TicketRequesterType.INTERNAL_USER,
        SlaBreachStatus.OK,
        TicketFieldDecision.NOT_REQUIRED,
        actorId,
        input.createdAt,
        input.resolvedAt ?? null,
        input.importBatchId ?? null,
      ],
    );
  }

  const summarize = (tenant: TenantFixture, days = 14, timezone = BOGOTA, asOf = AS_OF) =>
    service.summarize({
      tenantId: tenant.tenantId,
      schemaName: tenant.schemaName,
      timezone,
      asOf,
      days,
    });

  const day = (series: { series: Array<{ date: string }> }, date: string) =>
    series.series.find((item) => item.date === date);

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
    service = new AssuranceDashboardSeriesService(
      dataSource,
      settings as unknown as SettingsPriorityTenantReadPort,
    );

    // ── Tenant A (Bogotá, UTC-5); ventana de 14 días: 4 al 17 de noviembre ──
    // Creado y resuelto en días distintos.
    await insertTicket(tenantA, {
      createdAt: '2026-11-10T15:00:00Z',
      resolvedAt: '2026-11-12T15:00:00Z',
    });
    // Importado: excluido aunque caiga en la ventana.
    await insertTicket(tenantA, {
      createdAt: '2026-11-11T15:00:00Z',
      resolvedAt: '2026-11-11T16:00:00Z',
      importBatchId: randomUUID(),
    });
    // Fila de otro tenant en el mismo schema.
    await insertTicket(tenantA, { createdAt: '2026-11-10T15:00:00Z', rowTenantId: randomUUID() });
    // Límite superior: 18-nov 04:30 UTC es 17-nov 23:30 en Bogotá; 05:00 UTC ya es 18-nov.
    await insertTicket(tenantA, { createdAt: '2026-11-18T04:30:00Z' });
    await insertTicket(tenantA, { createdAt: '2026-11-18T05:00:00Z' });
    // Límite inferior: creado el 3-nov 23:59 Bogotá, resuelto el 4-nov 00:00 Bogotá.
    await insertTicket(tenantA, {
      createdAt: '2026-11-04T04:59:00Z',
      resolvedAt: '2026-11-04T05:00:00Z',
    });
    // Creado fuera de la ventana y resuelto hoy.
    await insertTicket(tenantA, {
      createdAt: '2026-10-01T15:00:00Z',
      resolvedAt: '2026-11-17T20:00:00Z',
    });

    // ── Tenant B ─────────────────────────────────────────────────────────
    await insertTicket(tenantB, {
      createdAt: '2026-11-15T15:00:00Z',
      resolvedAt: '2026-11-16T15:00:00Z',
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

  it('serie contigua de `days` días con ceros, que termina en asOf', async () => {
    for (const days of [7, 14, 31]) {
      const result = await summarize(tenantA, days);
      expect(AssuranceDashboardSeriesSchema.safeParse(result).success).toBe(true);
      expect(result.days).toBe(days);
      expect(result.series.map((item) => item.date)).toEqual(datesEndingAt(AS_OF, days));
    }
    const result = await summarize(tenantA);
    expect(result.series[0]!.date).toBe('2026-11-04');
    expect(day(result, '2026-11-05')).toEqual({ date: '2026-11-05', created: 0, resolved: 0 });
  });

  it('caso creado y resuelto en días distintos; importados y filas de otro tenant excluidos', async () => {
    const result = await summarize(tenantA);

    expect(day(result, '2026-11-10')).toEqual({ date: '2026-11-10', created: 1, resolved: 0 });
    expect(day(result, '2026-11-11')).toEqual({ date: '2026-11-11', created: 0, resolved: 0 });
    expect(day(result, '2026-11-12')).toEqual({ date: '2026-11-12', created: 0, resolved: 1 });
    expect(result.series.reduce((total, item) => total + item.created, 0)).toBe(2);
    expect(result.series.reduce((total, item) => total + item.resolved, 0)).toBe(3);
  });

  it('límite de día en la zona del tenant', async () => {
    const bogota = await summarize(tenantA);
    const utc = await summarize(tenantA, 14, 'UTC');

    expect(day(bogota, '2026-11-17')).toEqual({ date: '2026-11-17', created: 1, resolved: 1 });
    expect(day(bogota, '2026-11-04')).toEqual({ date: '2026-11-04', created: 0, resolved: 1 });
    // En UTC el caso de las 04:30 UTC del 18 sale de la ventana y el del 4-nov 04:59 entra.
    expect(day(utc, '2026-11-17')).toEqual({ date: '2026-11-17', created: 0, resolved: 1 });
    expect(day(utc, '2026-11-04')).toEqual({ date: '2026-11-04', created: 1, resolved: 1 });
  });

  it('dos tenants no se cruzan', async () => {
    const resultB = await summarize(tenantB);

    expect(resultB.series.reduce((total, item) => total + item.created, 0)).toBe(1);
    expect(day(resultB, '2026-11-15')).toEqual({ date: '2026-11-15', created: 1, resolved: 0 });
    expect(day(resultB, '2026-11-16')).toEqual({ date: '2026-11-16', created: 0, resolved: 1 });
    const crossed = await service.summarize({
      tenantId: tenantA.tenantId,
      schemaName: tenantB.schemaName,
      timezone: BOGOTA,
      asOf: AS_OF,
      days: 14,
    });
    expect(crossed.series.every((item) => item.created === 0 && item.resolved === 0)).toBe(true);
  });

  it('getSeries usa el TenantContext y la zona del puerto', async () => {
    const result = await TenantContext.run(
      { tenantId: tenantB.tenantId, schemaName: tenantB.schemaName, tenantSlug: 'n3-b' },
      () => service.getSeries(14),
    );

    expect(settings.getSnapshot).toHaveBeenCalledWith({ tenantId: tenantB.tenantId });
    expect(AssuranceDashboardSeriesSchema.safeParse(result).success).toBe(true);
  });

  itLatencyBudget(
    'p95 ≤ 300 ms con volumen sintético (HLD §7)',
    async () => {
      // Volumen en B, después de sus aserciones: 30 000 casos en 120 días, la mitad resueltos.
      await dataSource.query(
        `INSERT INTO ${tenantB.quoted}.support_tickets (
         id, tenant_id, ticket_number, type, status, priority, source, subject,
         requester_type, sla_breach_status, field_decision, created_by_user_id,
         created_at, updated_at, resolved_at
       )
       SELECT gen_random_uuid(), $1, 'N3-VOL-' || n, $2,
              (CASE WHEN n % 2 = 0 THEN $3 ELSE $4 END)::${tenantB.quoted}.ticket_status, $5, $6, 'Caso sintético',
              $7, $8, $9, $10,
              timestamptz '2026-07-20 00:00:00+00' + (n * interval '345 seconds'),
              timestamptz '2026-07-20 00:00:00+00' + (n * interval '345 seconds'),
              CASE WHEN n % 2 = 0
                   THEN timestamptz '2026-07-20 00:00:00+00' + (n * interval '345 seconds') + interval '2 days'
              END
         FROM generate_series(1, 30000) AS n`,
        [
          tenantB.tenantId,
          TicketType.CUSTOMER_INCIDENT,
          TicketStatus.RESOLVED,
          TicketStatus.OPEN,
          TicketPriority.NORMAL,
          TicketSource.MANUAL,
          TicketRequesterType.INTERNAL_USER,
          SlaBreachStatus.OK,
          TicketFieldDecision.NOT_REQUIRED,
          actorId,
        ],
      );
      await dataSource.query(`ANALYZE ${tenantB.quoted}.support_tickets`);

      for (const days of [14, 31]) {
        const run = () => summarize(tenantB, days);
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
          `[N3] days=${days} p50=${p50.toFixed(1)} ms p95=${p95.toFixed(1)} ms (n=60, 30k casos)`,
        );
        expect(p95).toBeLessThanOrEqual(300);
      }
    },
    180_000,
  );
});
