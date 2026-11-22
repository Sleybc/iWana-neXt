/**
 * sec-eng C-2 — el aprovisionamiento siembra el ADMIN con `tenants.admin_email` de la fila real:
 * el email ya no viaja en el payload del job (PostgreSQL real, base `test`).
 *
 * Ejecutar:
 *   IWANA_DB_INTEGRATION_AVAILABLE=true DB_NAME=test pnpm --filter @iwana/worker exec jest \
 *     --config jest.integration.config.js tenant-provisioning.admin-email
 */
import { randomBytes } from 'node:crypto';
import { Pool } from 'pg';
import { DataSource } from 'typeorm';
import type { Job } from 'bullmq';
import { Tenant, resolveMigrationDbCredentials } from '@iwana/db';
import type { ProvisioningJobPayload } from '@iwana/shared';
import { TenantProvisioningProcessor } from './tenant-provisioning.processor';
import type { TenantSeedService } from '../services/tenant-seed.service';
import { ephemeralSchemaName } from '../../../../packages/database/test/ephemeral-schema';

const { loadWorkspaceEnv } = require('../../../../packages/database/test/integration-db-probe');

loadWorkspaceEnv();

const available = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const describeWithInfra = available ? describe : describe.skip;

describeWithInfra('Aprovisionamiento — email del ADMIN desde la fila (PostgreSQL real)', () => {
  const suffix = randomBytes(4).toString('hex');
  const schemaName = ephemeralSchemaName('tenant_admmail_');
  const tenantSlug = `admmail-${suffix}`;
  const adminEmail = `admin-${suffix}@fila.invalid`;
  let admin: Pool;
  let app: DataSource;
  let processor: TenantProvisioningProcessor;
  let tenantId: string | undefined;
  const seeded: Array<Record<string, unknown>> = [];

  beforeAll(async () => {
    if (process.env['DB_NAME'] !== 'test')
      throw new Error('[BLOCKED] Solo corre con DB_NAME=test.');
    const migrator = resolveMigrationDbCredentials();
    const port = Number.parseInt(process.env['DB_PORT'] ?? '5432', 10);
    admin = new Pool({
      host: process.env['DB_HOST'] ?? 'localhost',
      port,
      user: migrator.username,
      password: migrator.password,
      database: 'test',
      max: 1,
    });
    const row = await admin.query<{ id: string }>(
      `INSERT INTO public.tenants (name, slug, schema_name, status, contact_email, admin_email)
       VALUES ('Email del ADMIN', $1, $2, 'PROVISIONING', 'contacto@fila.invalid', $3)
       RETURNING id::text AS id`,
      [tenantSlug, schemaName, adminEmail],
    );
    tenantId = row.rows[0]?.id;
    app = new DataSource({
      type: 'postgres',
      host: process.env['DB_HOST'] ?? 'localhost',
      port,
      username: process.env['DB_APP_USER'] ?? process.env['DB_USER'] ?? 'iwana_app',
      password: process.env['DB_APP_PASSWORD'] ?? process.env['DB_PASSWORD'] ?? '',
      database: 'test',
      entities: [Tenant],
      synchronize: false,
      extra: { max: 2 },
    });
    await app.initialize();
    const seed = {
      seedInitialAdmin: async (input: Record<string, unknown>) => {
        seeded.push(input);
        return { created: true };
      },
      seedTaxPresets: async () => undefined,
    } as unknown as TenantSeedService;
    processor = new TenantProvisioningProcessor(app, seed);
  }, 60_000);

  afterAll(async () => {
    await admin?.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`).catch(() => undefined);
    if (tenantId) {
      await admin
        ?.query('DELETE FROM public.tenants WHERE id = $1', [tenantId])
        .catch(() => undefined);
    }
    await admin?.end();
    if (app?.isInitialized) await app.destroy();
    await (processor as unknown as { pgPool?: Pool })?.pgPool?.end();
  });

  it('el job sin email siembra el ADMIN con el admin_email de la fila', async () => {
    if (!tenantId) throw new Error('[BLOCKED] setup');
    const payload: ProvisioningJobPayload = { tenantId, schemaName, tenantSlug };
    await processor.process({
      id: `provision-${tenantId}`,
      data: payload,
    } as Job<ProvisioningJobPayload>);

    expect(seeded).toEqual([expect.objectContaining({ tenantId, schemaName, adminEmail })]);
    const status = await admin.query<{ status: string }>(
      'SELECT status FROM public.tenants WHERE id = $1',
      [tenantId],
    );
    expect(status.rows[0]?.status).toBe('ACTIVE');
  }, 180_000);
});
