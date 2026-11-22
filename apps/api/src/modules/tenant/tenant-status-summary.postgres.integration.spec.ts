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
import { DataSource, type QueryRunner } from 'typeorm';
import { resolveMigrationDbCredentials } from '@iwana/db';
import { TenantStatus } from '@iwana/shared';
import type { TenantStatusSummary } from '@iwana/shared';
import { PlatformAuditService } from '../audit/platform-audit.service';
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
      // Serie mensual v1.1: la provee el módulo audit sobre la misma base.
      new PlatformAuditService(dataSource, undefined as never),
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
      // Serie mensual v1.1: la provee el módulo audit sobre la misma base.
      new PlatformAuditService(dataSource, undefined as never),
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

/**
 * v1.1 (PROMPT-WEB-CENTRO-CONTROL-PULSO-FASE2 §A.5): serie mensual desde
 * `public.platform_audit_logs` y alta más vieja en PROVISIONING. El registro es
 * append-only (trigger 014/024) y no admite borrar lo sembrado: la siembra y las
 * lecturas corren dentro de una transacción que se revierte (F2-D4), así que no
 * queda ninguna fila. Se mide contra una línea base porque la base puede traer
 * eventos previos.
 */
describeWithDb('TenantService.getStatusSummary — v1.1 serie mensual y PROVISIONING', () => {
  let dataSource: DataSource;
  let queryRunner: QueryRunner;
  let service: TenantService;
  let baseline: TenantStatusSummary;
  const run = randomBytes(4).toString('hex');
  const provisioningId = randomUUID();

  /** Inicio del mes Bogotá desplazado `offset` meses, + 1 hora, como timestamptz. */
  const monthStart = (offset: number): string =>
    `((date_trunc('month', now() AT TIME ZONE 'America/Bogota') + (${offset} * interval '1 month') + interval '1 hour') AT TIME ZONE 'America/Bogota')`;

  const insertAudit = async (action: string, entityId: string, offset: number): Promise<void> => {
    await queryRunner.query(
      `INSERT INTO public.platform_audit_logs (id, action, entity_type, entity_id, created_at)
       VALUES ($1, $2, 'Tenant', $3, ${monthStart(offset)})`,
      [randomUUID(), action, entityId],
    );
  };

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
    queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    // El EntityManager de la transacción expone `query`, lo único que usa el resumen.
    const manager = queryRunner.manager as unknown as DataSource;
    service = new TenantService(
      undefined as never,
      manager,
      undefined as never,
      undefined as never,
      undefined as never,
      undefined as never,
      // Serie mensual v1.1: la provee el módulo audit sobre la misma transacción.
      new PlatformAuditService(manager, undefined as never),
    );

    baseline = await service.getStatusSummary();

    // Mes en curso: 2 altas; la misma empresa marcada dos veces + otra = 2 bajas.
    await insertAudit('CREATE', `it-pulse-${run}-a`, 0);
    await insertAudit('CREATE', `it-pulse-${run}-b`, 0);
    await insertAudit('DELETE', `it-pulse-${run}-a`, 0);
    await insertAudit('DELETE', `it-pulse-${run}-a`, 0);
    await insertAudit('DELETE', `it-pulse-${run}-c`, 0);
    // Hace 3 meses: 1 alta. Hace 12 meses: fuera de la ventana.
    await insertAudit('CREATE', `it-pulse-${run}-d`, -3);
    await insertAudit('CREATE', `it-pulse-${run}-e`, -12);
    // Otra acción y otra entidad no cuentan.
    await insertAudit('UPDATE', `it-pulse-${run}-a`, 0);
    await queryRunner.query(
      `INSERT INTO public.platform_audit_logs (id, action, entity_type, entity_id, created_at)
       VALUES ($1, 'CREATE', 'PlatformUser', $2, ${monthStart(0)})`,
      [randomUUID(), `it-pulse-${run}-pu`],
    );

    // Empresa en PROVISIONING con created_at muy antiguo: debe ser la más vieja.
    await queryRunner.query(
      `INSERT INTO public.tenants (id, name, slug, schema_name, status, contact_email, created_at)
       VALUES ($1, $2, $3, $4, 'PROVISIONING', $5, '2001-02-03T04:05:06.000Z')`,
      [
        provisioningId,
        `Pulso sintético ${run}`,
        `summary-pulse-${run}`,
        `tenant_summary_pulse_${run}`,
        `summary-pulse-${run}@example.invalid`,
      ],
    );
  });

  afterAll(async () => {
    if (queryRunner?.isTransactionActive) await queryRunner.rollbackTransaction();
    await queryRunner?.release();
    if (!dataSource?.isInitialized) return;
    // F2-D4: la reversión no deja eventos ni la empresa sembrada.
    const [left] = (await dataSource.query(
      `SELECT (SELECT count(*) FROM public.platform_audit_logs WHERE entity_id LIKE $1)::int AS audit,
              (SELECT count(*) FROM public.tenants WHERE id = $2)::int AS tenants`,
      [`it-pulse-${run}-%`, provisioningId],
    )) as Array<{ audit: number; tenants: number }>;
    await dataSource.destroy();
    expect(left).toEqual({ audit: 0, tenants: 0 });
  });

  it('monthly trae 12 meses consecutivos, del más antiguo al actual, y period es el último', async () => {
    const summary = await service.getStatusSummary();

    expect(summary.monthly).toHaveLength(12);
    const months = summary.monthly.map((m) => m.month);
    expect([...months].sort()).toEqual(months);
    expect(new Set(months).size).toBe(12);
    expect(summary.period).toEqual(summary.monthly[11]);
    for (const m of summary.monthly) {
      expect(m.month).toMatch(/^\d{4}-\d{2}$/);
      expect(Number.isInteger(m.created) && m.created >= 0).toBe(true);
      expect(Number.isInteger(m.removed) && m.removed >= 0).toBe(true);
    }
  });

  it('cuenta altas y bajas (DELETE repetido de la misma empresa = 1) y deja en 0 lo ajeno', async () => {
    const summary = await service.getStatusSummary();

    expect(summary.period.created - baseline.period.created).toBe(2);
    expect(summary.period.removed - baseline.period.removed).toBe(2);
    expect(summary.monthly[8]!.created - baseline.monthly[8]!.created).toBe(1);
    // Meses sin eventos sembrados: sin delta (incluye el borde de 12 meses atrás).
    for (const index of [0, 1, 2, 3, 4, 5, 6, 7, 9, 10]) {
      expect({ index, created: summary.monthly[index]!.created }).toEqual({
        index,
        created: baseline.monthly[index]!.created,
      });
      expect({ index, removed: summary.monthly[index]!.removed }).toEqual({
        index,
        removed: baseline.monthly[index]!.removed,
      });
    }
  });

  it('oldestProvisioningAt es el createdAt de la empresa PROVISIONING más antigua', async () => {
    const summary = await service.getStatusSummary();

    expect(summary.oldestProvisioningAt).toBe('2001-02-03T04:05:06.000Z');
  });
});

/**
 * v1.2 (F2-D2): periodo de 6/12/24 meses y `activeAtClose`. Una empresa sembrada en la
 * transacción con `created_at` antiguo y sin ningún evento auditado hace irreconstruible el
 * cierre de todos los meses pasados: deben salir `null` (nunca 0) sea cual sea la base. El
 * cálculo con historia completa lo cubren `tenant-active-at-close.spec.ts` y
 * `platform-audit-entity-lifecycle.postgres.integration.spec.ts`.
 */
describeWithDb('TenantService.getStatusSummary — v1.2 periodo y activas al cierre', () => {
  let dataSource: DataSource;
  let queryRunner: QueryRunner;
  let service: TenantService;
  const run = randomBytes(4).toString('hex');
  const silentId = randomUUID();

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
    queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    const manager = queryRunner.manager as unknown as DataSource;
    service = new TenantService(
      undefined as never,
      manager,
      undefined as never,
      undefined as never,
      undefined as never,
      undefined as never,
      new PlatformAuditService(manager, undefined as never),
    );

    // Empresa activa anterior a la auditoría: sin un solo evento en platform_audit_logs.
    await queryRunner.query(
      `INSERT INTO public.tenants (id, name, slug, schema_name, status, contact_email, created_at)
       VALUES ($1, $2, $3, $4, 'ACTIVE', $5, '2001-02-03T04:05:06.000Z')`,
      [
        silentId,
        `Sin historia ${run}`,
        `summary-silent-${run}`,
        `tenant_summary_silent_${run}`,
        `summary-silent-${run}@example.invalid`,
      ],
    );
  });

  afterAll(async () => {
    if (queryRunner?.isTransactionActive) await queryRunner.rollbackTransaction();
    await queryRunner?.release();
    if (!dataSource?.isInitialized) return;
    const [left] = (await dataSource.query(
      `SELECT count(*)::int AS tenants FROM public.tenants WHERE id = $1`,
      [silentId],
    )) as Array<{ tenants: number }>;
    await dataSource.destroy();
    expect(left).toEqual({ tenants: 0 });
  });

  it.each([6, 12, 24] as const)(
    'months=%i: serie de ese largo, el mes en curso es byStatus.ACTIVE y los pasados null',
    async (months) => {
      const summary = await service.getStatusSummary(months);

      expect(summary.monthly).toHaveLength(months);
      expect(summary.period).toEqual(summary.monthly[months - 1]);
      expect(summary.period.activeAtClose).toBe(summary.byStatus.ACTIVE);
      expect(summary.byStatus.ACTIVE).toBeGreaterThanOrEqual(1);
      for (const month of summary.monthly.slice(0, -1)) {
        expect({ month: month.month, activeAtClose: month.activeAtClose }).toEqual({
          month: month.month,
          activeAtClose: null,
        });
      }
    },
  );

  it('sin periodo devuelve 12 meses', async () => {
    const summary = await service.getStatusSummary();

    expect(summary.monthly).toHaveLength(12);
  });
});
