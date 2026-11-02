import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import type { PostgresConnectionOptions } from 'typeorm/driver/postgres/PostgresConnectionOptions';
import { dataSourceOptions, TenantContext } from '@iwana/db';
import {
  applyTenantMigrationsInOrder,
  createTenantDataSource,
} from '../../../../../../../packages/database/src/migrations/tenant/runner';
import { ResponsibilitiesService } from '../responsibilities.service';

const describeWithDb =
  process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true' ? describe : describe.skip;

describeWithDb('ResponsibilitiesService — DT-3 con PostgreSQL real', () => {
  const tenantId = randomUUID();
  const tenantSlug = `dt3-responsibility-${tenantId.slice(0, 8)}`;
  const schemaName = `tenant_dt3_responsibility_${randomUUID().replace(/-/g, '')}`;
  const actorId = randomUUID();
  let dataSource: DataSource;
  let service: ResponsibilitiesService;

  beforeAll(async () => {
    dataSource = new DataSource({
      ...(dataSourceOptions as PostgresConnectionOptions),
      entities: [],
      migrations: [],
      synchronize: false,
      logging: false,
    });
    await dataSource.initialize();
    await dataSource.query(
      `INSERT INTO public.tenants (id, name, slug, schema_name, status, contact_email)
       VALUES ($1, $2, $3, $4, 'ACTIVE', $5)`,
      [tenantId, 'DT-3 synthetic', tenantSlug, schemaName, 'dt3@example.invalid'],
    );
    await dataSource.query(`CREATE SCHEMA "${schemaName}"`);
    const tenantDataSource = createTenantDataSource(dataSource, schemaName, tenantSlug);
    await tenantDataSource.initialize();
    try {
      await applyTenantMigrationsInOrder(tenantDataSource);
    } finally {
      await tenantDataSource.destroy();
    }
    service = new ResponsibilitiesService(dataSource);
  });

  afterAll(async () => {
    if (!dataSource?.isInitialized) return;
    await dataSource.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
    await dataSource.query('DELETE FROM public.tenants WHERE id = $1', [tenantId]);
    await dataSource.destroy();
  });

  it.each([false, true])(
    'devuelve 409 y conserva expediente e historial anonimizados (schema legacy: %s)',
    async (legacySchema) => {
      if (legacySchema) {
        // Schema propio: fuerza el camino de compatibilidad sin tocar datos de desarrollo.
        await dataSource.query(
          `ALTER TABLE "${schemaName}".expediente_records
             DROP COLUMN current_responsible_user_id,
             DROP COLUMN current_responsible_assigned_at`,
        );
      }
      const expedienteId = randomUUID();
      await dataSource.query(
        `INSERT INTO "${schemaName}".expediente_records
           (id, tenant_id, full_name, created_by, anonymized_at, anonymized_request_id)
         VALUES ($1, $2, 'Titular anonimizado', $3, clock_timestamp(), $4)`,
        [expedienteId, tenantId, actorId, randomUUID()],
      );
      const before = await dataSource.query(
        `SELECT row_to_json(e)::text AS snapshot
           FROM "${schemaName}".expediente_records e WHERE id = $1`,
        [expedienteId],
      );

      await expect(
        TenantContext.run({ tenantId, schemaName, tenantSlug }, () =>
          service.updateResponsibility(
            expedienteId,
            { responsibleUserId: randomUUID(), notes: 'Asignación sintética' },
            actorId,
          ),
        ),
      ).rejects.toMatchObject({
        status: 409,
        response: {
          code: 'PRIVACY_TITULAR_ANONYMIZED',
          message: 'Este titular fue anonimizado; sus registros ya no se pueden modificar.',
        },
      });

      expect(
        await dataSource.query(
          `SELECT row_to_json(e)::text AS snapshot
             FROM "${schemaName}".expediente_records e WHERE id = $1`,
          [expedienteId],
        ),
      ).toEqual(before);
      expect(
        await dataSource.query(
          `SELECT count(*)::int AS count FROM "${schemaName}".operational_responsibility_history
            WHERE expediente_id = $1`,
          [expedienteId],
        ),
      ).toEqual([{ count: 0 }]);
    },
  );
});
