/**
 * `resolvePiiContractEnv` solo pregunta a la flota vigente (PostgreSQL real, base `test`).
 *
 * Una empresa retirada (`deleted_at`) que sigue en `ACTIVE` puede tener el schema ya purgado o a
 * medio borrar. Antes, la consulta de flota la incluía; su schema sin `typeorm_migrations` hacía
 * fallar (cerrado) el alta de toda empresa nueva. El schema sintético empieza por `tenant_0` para
 * que el recorrido, ordenado por nombre, lo visite primero.
 *
 * Ejecutar:
 *   IWANA_DB_INTEGRATION_AVAILABLE=true DB_NAME=test pnpm --filter @iwana/worker exec jest \
 *     --config jest.integration.config.js tenant-provisioning.pii-fleet
 */
import { randomBytes, randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { resolveMigrationDbCredentials } from '@iwana/db';
import { TenantProvisioningProcessor } from './tenant-provisioning.processor';
import type { TenantSeedService } from '../services/tenant-seed.service';

const { loadWorkspaceEnv } = require('../../../../packages/database/test/integration-db-probe');

loadWorkspaceEnv();

const available = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const describeWithInfra = available ? describe : describe.skip;

describeWithInfra('resolvePiiContractEnv — flota vigente (PostgreSQL real)', () => {
  const suffix = randomBytes(4).toString('hex');
  const retired = { id: randomUUID(), schema: `tenant_0pii_retired_${suffix}` };
  let admin: Pool;
  let processor: TenantProvisioningProcessor;

  beforeAll(async () => {
    if (process.env['DB_NAME'] !== 'test') {
      throw new Error('[BLOCKED] Solo corre con DB_NAME=test.');
    }
    const migrator = resolveMigrationDbCredentials();
    admin = new Pool({
      host: process.env['DB_HOST'] ?? 'localhost',
      port: Number.parseInt(process.env['DB_PORT'] ?? '5432', 10),
      user: migrator.username,
      password: migrator.password,
      database: 'test',
      max: 1,
    });
    // Schema vacío (sin typeorm_migrations), empresa ACTIVE pero retirada.
    await admin.query(`CREATE SCHEMA "${retired.schema}"`);
    await admin.query(
      `INSERT INTO public.tenants (id, name, slug, schema_name, status, contact_email, deleted_at)
       VALUES ($1, $2, $3, $4, 'ACTIVE', 'flota@example.test', now())`,
      [retired.id, `Flota ${suffix}`, `pii-fleet-${suffix}`, retired.schema],
    );
    processor = new TenantProvisioningProcessor({} as never, {} as TenantSeedService);
  });

  afterAll(async () => {
    if (admin) {
      await admin.query(`DROP SCHEMA IF EXISTS "${retired.schema}" CASCADE`);
      await admin.query('DELETE FROM public.tenants WHERE id = $1', [retired.id]);
      await admin.end();
    }
    await (processor as unknown as { pgPool?: Pool })?.pgPool?.end();
  });

  it('una empresa retirada con el schema vacío no bloquea el alta de las nuevas', async () => {
    const resolve = () =>
      (
        processor as unknown as { resolvePiiContractEnv(): Promise<NodeJS.ProcessEnv> }
      ).resolvePiiContractEnv();
    await expect(resolve()).resolves.toBeDefined();
  });
});
