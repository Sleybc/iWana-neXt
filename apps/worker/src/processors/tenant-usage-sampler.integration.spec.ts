/**
 * Muestreador de uso por empresa contra PostgreSQL real (ADR-114, PROMPT-WEB-CENTRO-CONTROL-PULSO-FASE4 §A.5).
 *
 * - Cuenta con la definición de CRM: primera activación o contrato activado; el prospecto sin
 *   servicio y el borrado quedan fuera.
 * - Fallo aislado: una empresa cuyo schema no tiene `subscribers` falla sin detener a la otra
 *   y conserva su medición anterior (nunca escribe 0).
 * - Cascada: borrar la empresa borra su medición (FK de la migración 035, purga R7).
 *
 * Crea dos empresas y schemas efímeros `tenant_itusage_*` y los borra al final.
 *
 * Ejecutar:
 *   IWANA_DB_INTEGRATION_AVAILABLE=true DB_NAME=test pnpm --filter @iwana/worker exec jest \
 *     --config jest.integration.config.js tenant-usage-sampler
 */
import { randomBytes, randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { resolveMigrationDbCredentials } from '@iwana/db';
import { TenantUsageSamplerProcessor } from './tenant-usage-sampler.processor';

const { loadWorkspaceEnv } = require('../../../../packages/database/test/integration-db-probe');

loadWorkspaceEnv();

const available = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const describeWithInfra = available ? describe : describe.skip;
const suffix = randomBytes(4).toString('hex');

describeWithInfra('TenantUsageSamplerProcessor — PostgreSQL real', () => {
  let dataSource: DataSource;
  let processor: TenantUsageSamplerProcessor;
  const healthy = { id: randomUUID(), schema: `tenant_itusage_ok_${suffix}` };
  const broken = { id: randomUUID(), schema: `tenant_itusage_ko_${suffix}` };

  async function snapshot(tenantId: string): Promise<{ active: number; measuredAt: Date } | null> {
    const rows = (await dataSource.query(
      `SELECT active_subscribers AS active, measured_at AS "measuredAt"
         FROM public.tenant_usage_snapshots WHERE tenant_id = $1`,
      [tenantId],
    )) as Array<{ active: number; measuredAt: Date }>;
    return rows[0] ?? null;
  }

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

    for (const tenant of [healthy, broken]) {
      await dataSource.query(
        `INSERT INTO public.tenants (id, name, slug, schema_name, status, contact_email)
         VALUES ($1, $2, $3, $4, 'ACTIVE', 'uso@example.test')`,
        [tenant.id, `ITUSAGE ${tenant.schema}`, tenant.schema.replace(/_/gu, '-'), tenant.schema],
      );
      await dataSource.query(`CREATE SCHEMA "${tenant.schema}"`);
    }
    // Esquema mínimo con las columnas que lee la definición de CRM.
    await dataSource.query(`
      CREATE TABLE "${healthy.schema}".subscribers (
        id uuid PRIMARY KEY, tenant_id uuid NOT NULL, status text NOT NULL,
        activated_at timestamptz, deleted_at timestamptz)`);
    await dataSource.query(`
      CREATE TABLE "${healthy.schema}".contracts (
        id uuid PRIMARY KEY, tenant_id uuid NOT NULL, subscriber_id uuid NOT NULL,
        status text NOT NULL, deleted_at timestamptz)`);
    const sub = (status: string, activated: boolean, deleted = false) =>
      dataSource.query(
        `INSERT INTO "${healthy.schema}".subscribers VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [
          randomUUID(),
          healthy.id,
          status,
          activated ? new Date() : null,
          deleted ? new Date() : null,
        ],
      ) as Promise<Array<{ id: string }>>;
    await sub('ACTIVE', true); // cuenta: primera activación
    const [imported] = await sub('PROSPECT', false); // cuenta: contrato activado
    await dataSource.query(
      `INSERT INTO "${healthy.schema}".contracts VALUES ($1, $2, $3, 'ACTIVE', NULL)`,
      [randomUUID(), healthy.id, imported!.id],
    );
    await sub('PROSPECT', false); // fuera: prospecto sin servicio
    await sub('ACTIVE', true, true); // fuera: borrado
    // Medición previa de la empresa rota: el fallo no debe pisarla con 0.
    await dataSource.query(
      `INSERT INTO public.tenant_usage_snapshots VALUES ($1, 7, now() - interval '3 hours')`,
      [broken.id],
    );

    processor = new TenantUsageSamplerProcessor(dataSource, {} as never);
  });

  afterAll(async () => {
    if (!dataSource?.isInitialized) return;
    for (const tenant of [healthy, broken]) {
      await dataSource.query(`DROP SCHEMA IF EXISTS "${tenant.schema}" CASCADE`);
      await dataSource.query(`DELETE FROM public.tenants WHERE id = $1`, [tenant.id]);
    }
    await dataSource.destroy();
  });

  it('mide con la definición de CRM y aísla el fallo de otra empresa', async () => {
    const result = await processor.sample();

    expect(result.failed).toBeGreaterThanOrEqual(1);
    expect((await snapshot(healthy.id))?.active).toBe(2);
    const previous = await snapshot(broken.id);
    expect(previous?.active).toBe(7);
    expect(Date.now() - previous!.measuredAt.getTime()).toBeGreaterThan(2 * 60 * 60 * 1000);
  });

  it('borrar la empresa borra su medición en cascada', async () => {
    expect(await snapshot(healthy.id)).not.toBeNull();
    await dataSource.query(`DELETE FROM public.tenants WHERE id = $1`, [healthy.id]);
    expect(await snapshot(healthy.id)).toBeNull();
  });
});
