/**
 * F2-D2 — el aprovisionador audita sus transiciones de estado en `platform_audit_logs`
 * (PostgreSQL real, base `test`).
 *
 * Sin esa fila la serie «Activas al cierre» del API (`tenant-active-at-close.ts`) no puede
 * reconstruir la activación. Comprueba la forma que esa serie lee: `UPDATE` de `Tenant` con
 * `new_value.status`, en la misma transacción que el cambio de estado.
 *
 * Ejecutar:
 *   IWANA_DB_INTEGRATION_AVAILABLE=true DB_NAME=test pnpm --filter @iwana/worker exec jest \
 *     --config jest.integration.config.js tenant-provisioning.audit
 */
import { randomBytes, randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { resolveMigrationDbCredentials } from '@iwana/db';
import { TenantProvisioningProcessor } from './tenant-provisioning.processor';
import type { TenantSeedService } from '../services/tenant-seed.service';

const { loadWorkspaceEnv } = require('../../../../packages/database/test/integration-db-probe');

loadWorkspaceEnv();

const available = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const describeWithInfra = available ? describe : describe.skip;
const suffix = randomBytes(4).toString('hex');

describeWithInfra('Aprovisionamiento — auditoría de la transición (PostgreSQL real)', () => {
  let app: DataSource;
  let admin: DataSource;
  let processor: TenantProvisioningProcessor;
  const activated = { id: randomUUID(), slug: `audit-act-${suffix}` };
  const failed = { id: randomUUID(), slug: `audit-fail-${suffix}` };
  const untouched = { id: randomUUID(), slug: `audit-sus-${suffix}` };

  const source = (username: string, password: string) =>
    new DataSource({
      type: 'postgres',
      host: process.env['DB_HOST'] ?? 'localhost',
      port: Number.parseInt(process.env['DB_PORT'] ?? '5432', 10),
      username,
      password,
      database: 'test',
      entities: [],
      synchronize: false,
      logging: false,
      extra: { max: 2 },
    });

  async function auditRows(tenantId: string) {
    return (await admin.query(
      `SELECT action, entity_type, user_id, new_value ->> 'status' AS status,
              old_value ->> 'status' AS old_status, request_id
         FROM public.platform_audit_logs
        WHERE entity_type = 'Tenant' AND entity_id = $1 AND action = 'UPDATE'`,
      [tenantId],
    )) as Array<Record<string, string | null>>;
  }

  beforeAll(async () => {
    if (process.env['DB_NAME'] !== 'test') {
      throw new Error('[BLOCKED] Solo corre con DB_NAME=test.');
    }
    const migrator = resolveMigrationDbCredentials();
    admin = source(migrator.username, migrator.password);
    // El aprovisionador usa en runtime el rol de la app: la prueba también.
    app = source(
      process.env['DB_APP_USER'] ?? process.env['DB_USER'] ?? 'iwana_app',
      process.env['DB_APP_PASSWORD'] ?? process.env['DB_PASSWORD'] ?? '',
    );
    await Promise.all([admin.initialize(), app.initialize()]);

    for (const [tenant, status] of [
      [activated, 'PROVISIONING'],
      [failed, 'PROVISIONING'],
      [untouched, 'SUSPENDED'],
    ] as const) {
      await admin.query(
        `INSERT INTO public.tenants (id, name, slug, schema_name, status, contact_email)
         VALUES ($1, $2, $3, $4, $5, 'auditoria@example.test')`,
        [
          tenant.id,
          `Auditoría ${tenant.slug}`,
          tenant.slug,
          `tenant_${tenant.slug.replace(/-/gu, '_')}`,
          status,
        ],
      );
    }
    processor = new TenantProvisioningProcessor(app, {} as TenantSeedService);
  });

  afterAll(async () => {
    if (admin?.isInitialized) {
      await admin.query('DELETE FROM public.tenants WHERE id = ANY($1::uuid[])', [
        [activated.id, failed.id, untouched.id],
      ]);
      await admin.destroy();
    }
    if (app?.isInitialized) await app.destroy();
    await (processor as unknown as { pgPool?: { end(): Promise<void> } })?.pgPool?.end();
  });

  const internals = () =>
    processor as unknown as {
      activateIfStillProvisioning(tenantId: string, slug: string): Promise<boolean>;
      markFailed(tenantId: string): Promise<void>;
    };

  it('la activación deja la empresa ACTIVE y una fila UPDATE de Tenant con new_value.status ACTIVE', async () => {
    await expect(
      internals().activateIfStillProvisioning(activated.id, activated.slug),
    ).resolves.toBe(true);

    const [row] = (await admin.query(`SELECT status FROM public.tenants WHERE id = $1`, [
      activated.id,
    ])) as Array<{ status: string }>;
    expect(row?.status).toBe('ACTIVE');
    expect(await auditRows(activated.id)).toEqual([
      {
        action: 'UPDATE',
        entity_type: 'Tenant',
        user_id: null,
        status: 'ACTIVE',
        old_status: 'PROVISIONING',
        request_id: 'worker:tenant-provisioning',
      },
    ]);
  });

  it('el fallo deja PROVISIONING_FAILED auditado', async () => {
    await internals().markFailed(failed.id);
    expect((await auditRows(failed.id)).map((r) => r.status)).toEqual(['PROVISIONING_FAILED']);
  });

  it('una empresa que ya no está en PROVISIONING no cambia ni se audita', async () => {
    await expect(
      internals().activateIfStillProvisioning(untouched.id, untouched.slug),
    ).resolves.toBe(false);
    expect(await auditRows(untouched.id)).toEqual([]);
  });
});
