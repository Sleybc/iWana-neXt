/**
 * `TenantService.getStatusSummary()` contra PostgreSQL real (PROMPT-WEB-DASHBOARD-OLA1 §A).
 *
 * Siembra más de 100 empresas sintéticas en `public.tenants` y comprueba que
 * `total`, `byStatus` y `updatedLast7Days` son exactos (el defecto E-1 era contar
 * sobre una página de 100). La base puede traer empresas previas: se mide una
 * línea base antes de sembrar y se exige el delta exacto. No toca schemas tenant.
 *
 * Ejecutar:
 *   IWANA_DB_INTEGRATION_AVAILABLE=true DB_NAME=test pnpm --filter @iwana/api exec jest \
 *     --config jest.integration.config.js tenant-status-summary
 */
import { randomBytes, randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { resolveMigrationDbCredentials } from '@iwana/db';
import { TenantStatus } from '@iwana/shared';
import type { TenantStatusSummary } from '@iwana/shared';
import { TenantService } from './tenant.service';

const dbAvailable = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const describeWithDb = dbAvailable ? describe : describe.skip;
const RUN = randomBytes(4).toString('hex');

/** 133 empresas: más de 100 y repartidas en todos los estados. */
const SEED: Record<TenantStatus, number> = {
  [TenantStatus.PROVISIONING]: 7,
  [TenantStatus.ACTIVE]: 101,
  [TenantStatus.SUSPENDED]: 9,
  [TenantStatus.INACTIVE]: 5,
  [TenantStatus.MARKED_FOR_DELETION]: 4,
  [TenantStatus.PROVISIONING_FAILED]: 7,
};
/** Empresas sembradas con updated_at de hace 30 días (fuera de la ventana de 7). */
const STALE = 20;

describeWithDb('TenantService.getStatusSummary — PostgreSQL real', () => {
  let dataSource: DataSource;
  let service: TenantService;
  let baseline: TenantStatusSummary;
  const seededIds: string[] = [];
  const failedIds: string[] = [];

  beforeAll(async () => {
    const credentials = resolveMigrationDbCredentials();
    dataSource = new DataSource({
      type: 'postgres',
      host: process.env['DB_HOST'] ?? 'localhost',
      port: Number.parseInt(process.env['DB_PORT'] ?? '5432', 10),
      username: credentials.username,
      password: credentials.password,
      database: process.env['DB_NAME'] ?? 'iwana',
      entities: [],
      migrations: [],
      synchronize: false,
      logging: false,
      extra: { max: 3, min: 1, connectionTimeoutMillis: 5_000 },
    });
    await dataSource.initialize();
    // Solo se usa `dataSource`; el resto de dependencias no interviene en el resumen.
    service = new TenantService(
      undefined as never,
      dataSource,
      undefined as never,
      undefined as never,
      undefined as never,
      undefined as never,
    );

    baseline = await service.getStatusSummary();

    let index = 0;
    for (const [status, count] of Object.entries(SEED)) {
      for (let i = 0; i < count; i += 1) {
        const id = randomUUID();
        const n = index;
        index += 1;
        seededIds.push(id);
        // Los fallidos van una hora en el futuro para encabezar `attention` sin
        // depender de las empresas previas de la base.
        const updatedAt =
          status === TenantStatus.PROVISIONING_FAILED
            ? `now() + interval '1 hour' + (${n} * interval '1 second')`
            : n < STALE
              ? `now() - interval '30 days'`
              : 'now()';
        if (status === TenantStatus.PROVISIONING_FAILED) failedIds.push(id);
        await dataSource.query(
          `INSERT INTO public.tenants (id, name, slug, schema_name, status, contact_email, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, ${updatedAt})`,
          [
            id,
            `Resumen sintético ${RUN} ${n}`,
            `summary-it-${RUN}-${n}`,
            `tenant_summary_it_${RUN}_${n}`,
            status,
            `summary-it-${n}@example.invalid`,
          ],
        );
      }
    }
  });

  afterAll(async () => {
    if (!dataSource?.isInitialized) return;
    try {
      if (seededIds.length > 0) {
        await dataSource.query('DELETE FROM public.tenants WHERE id = ANY($1::uuid[])', [
          seededIds,
        ]);
      }
    } finally {
      await dataSource.destroy();
    }
  });

  it('total y byStatus son exactos con más de 100 empresas sembradas', async () => {
    const summary = await service.getStatusSummary();
    const seededTotal = Object.values(SEED).reduce((a, b) => a + b, 0);

    expect(seededTotal).toBeGreaterThan(100);
    expect(summary.total).toBe(baseline.total + seededTotal);
    for (const status of Object.values(TenantStatus)) {
      expect({ status, count: summary.byStatus[status] }).toEqual({
        status,
        count: baseline.byStatus[status] + SEED[status],
      });
    }

    const rows: Array<{ count: string }> = await dataSource.query(
      'SELECT COUNT(*) AS count FROM public.tenants',
    );
    expect(summary.total).toBe(Number(rows[0]?.count));
  });

  it('updatedLast7Days excluye las empresas sin cambios en la última semana', async () => {
    const summary = await service.getStatusSummary();
    const seededTotal = Object.values(SEED).reduce((a, b) => a + b, 0);

    expect(summary.updatedLast7Days).toBe(baseline.updatedLast7Days + seededTotal - STALE);
  });

  it('attention trae 5 empresas, las más severas y recientes primero, sin PII', async () => {
    const summary = await service.getStatusSummary();

    expect(summary.attention).toHaveLength(5);
    // Fallidos sembrados con updated_at creciente: los 5 últimos, en orden descendente.
    expect(summary.attention.map((item) => item.id)).toEqual(failedIds.slice(-5).reverse());
    for (const item of summary.attention) {
      expect(Object.keys(item).sort()).toEqual(['id', 'name', 'status', 'updatedAt']);
      expect(item.status).toBe(TenantStatus.PROVISIONING_FAILED);
    }
  });
});

/**
 * H-1 (test-change-reviewer): severidad mixta. Siembra propia, sin los 7 fallidos
 * del bloque anterior (su afterAll ya los borró). Timestamps a +10 años para
 * quedar por delante de cualquier empresa previa del mismo estado; los estados
 * fuera de atención van a +20 años y aun así no deben entrar.
 */
describeWithDb('TenantService.getStatusSummary — orden de attention con severidad mixta', () => {
  let dataSource: DataSource;
  let service: TenantService;
  const ids: Record<string, string> = {};
  const run = randomBytes(4).toString('hex');

  /** [clave, estado, segundos sobre now() + 10 años]. */
  const ROWS: Array<[string, TenantStatus, number]> = [
    ['sus_old', TenantStatus.SUSPENDED, 1],
    ['mfd_old', TenantStatus.MARKED_FOR_DELETION, 2],
    ['failed', TenantStatus.PROVISIONING_FAILED, 3],
    ['sus_new', TenantStatus.SUSPENDED, 4],
    ['mfd_new', TenantStatus.MARKED_FOR_DELETION, 5],
    ['prov', TenantStatus.PROVISIONING, 315_360_000],
    ['inactive', TenantStatus.INACTIVE, 315_360_001],
    ['active', TenantStatus.ACTIVE, 315_360_002],
  ];

  beforeAll(async () => {
    const credentials = resolveMigrationDbCredentials();
    dataSource = new DataSource({
      type: 'postgres',
      host: process.env['DB_HOST'] ?? 'localhost',
      port: Number.parseInt(process.env['DB_PORT'] ?? '5432', 10),
      username: credentials.username,
      password: credentials.password,
      database: process.env['DB_NAME'] ?? 'iwana',
      entities: [],
      migrations: [],
      synchronize: false,
      logging: false,
      extra: { max: 2, min: 1, connectionTimeoutMillis: 5_000 },
    });
    await dataSource.initialize();
    service = new TenantService(
      undefined as never,
      dataSource,
      undefined as never,
      undefined as never,
      undefined as never,
      undefined as never,
    );

    for (const [key, status, seconds] of ROWS) {
      const id = randomUUID();
      ids[key] = id;
      await dataSource.query(
        `INSERT INTO public.tenants (id, name, slug, schema_name, status, contact_email, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6,
                 now() + interval '10 years' + ($7::int * interval '1 second'))`,
        [
          id,
          `Severidad sintética ${run} ${key}`,
          `summary-sev-${run}-${key.replace('_', '-')}`,
          `tenant_summary_sev_${run}_${key}`,
          status,
          `summary-sev-${key}@example.invalid`,
          seconds,
        ],
      );
    }
  });

  afterAll(async () => {
    if (!dataSource?.isInitialized) return;
    try {
      await dataSource.query('DELETE FROM public.tenants WHERE id = ANY($1::uuid[])', [
        Object.values(ids),
      ]);
    } finally {
      await dataSource.destroy();
    }
  });

  it('ordena FAILED, MARKED_FOR_DELETION, SUSPENDED; desempata por updatedAt desc; excluye el resto', async () => {
    const rows: Array<{ count: string }> = await dataSource.query(
      `SELECT COUNT(*) AS count FROM public.tenants
        WHERE status = 'PROVISIONING_FAILED' AND id <> $1`,
      [ids['failed']],
    );
    // Precondición: otro fallido previo encabezaría la lista y haría el orden no determinista.
    expect(Number(rows[0]?.count)).toBe(0);

    const summary = await service.getStatusSummary();

    expect(summary.attention.map((item) => item.id)).toEqual([
      ids['failed'],
      ids['mfd_new'],
      ids['mfd_old'],
      ids['sus_new'],
      ids['sus_old'],
    ]);
    expect(summary.attention.map((item) => item.status)).toEqual([
      TenantStatus.PROVISIONING_FAILED,
      TenantStatus.MARKED_FOR_DELETION,
      TenantStatus.MARKED_FOR_DELETION,
      TenantStatus.SUSPENDED,
      TenantStatus.SUSPENDED,
    ]);
    const excluded = [ids['prov'], ids['inactive'], ids['active']];
    expect(summary.attention.some((item) => excluded.includes(item.id))).toBe(false);
  });
});
