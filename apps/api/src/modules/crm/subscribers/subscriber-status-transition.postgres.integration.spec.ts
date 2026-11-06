import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { AuditLog, dataSourceOptions, TenantContext } from '@iwana/db';
import { SubscriberStatus, PersonType, CustomerSegment } from '@iwana/shared';
import { AuditService } from '../../audit/audit.service';
import type { PlatformAuditService } from '../../audit/platform-audit.service';
import { Subscriber } from './entities/subscriber.entity';
import { SubscriberFiscalCompletenessService } from './subscriber-fiscal-completeness.service';
import { SubscriberStatusTransitionService } from './subscriber-status-transition.service';
import {
  applyTenantMigrationsInOrder,
  createTenantDataSource,
  TENANT_MIGRATIONS,
} from '../../../../../../packages/database/src/migrations/tenant/runner';

const integrationEnabled = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const databaseName = process.env['DB_NAME'] ?? '';
const supportedDatabaseName =
  databaseName === 'test' || /^iwana_it_g7_[a-z0-9_]+$/u.test(databaseName);
const describeWithDb = integrationEnabled && supportedDatabaseName ? describe : describe.skip;

if (integrationEnabled && !supportedDatabaseName) {
  console.warn(
    `[B1c] Integración de transición omitida: DB_NAME debe ser test o iwana_it_g7_*; recibida ${databaseName || '(vacía)'}.`,
  );
}

jest.setTimeout(900_000);

describeWithDb('B1c — transición de subscriber con auditoría PostgreSQL real', () => {
  const tenantId = randomUUID();
  const schemaName = `tenant_b1c_status_${randomUUID().replaceAll('-', '').slice(0, 16)}`;
  const tenantSlug = `b1c-status-${tenantId.slice(0, 8)}`;
  const actorId = randomUUID();
  let dataSource: DataSource | undefined;
  let tenantDataSource: DataSource | undefined;

  const context = () => ({ tenantId, schemaName, tenantSlug });
  const qualified = (table: string) => `"${schemaName}"."${table}"`;

  beforeAll(async () => {
    dataSource = new DataSource({
      ...dataSourceOptions,
      entities: [Subscriber, AuditLog],
      migrations: [],
      logging: false,
      extra: { ...dataSourceOptions.extra, max: 3, min: 1 },
    });
    await dataSource.initialize();
    await dataSource.query(`CREATE SCHEMA "${schemaName}"`);
    await dataSource.query(
      `INSERT INTO public.tenants (id, name, slug, schema_name, status, contact_email)
       VALUES ($1, 'B1c synthetic fixture', $2, $3, 'ACTIVE', 'b1c-status@invalid.example')`,
      [tenantId, tenantSlug, schemaName],
    );

    tenantDataSource = createTenantDataSource(dataSource, schemaName, tenantSlug);
    await tenantDataSource.initialize();
    await applyTenantMigrationsInOrder(tenantDataSource, {
      ...process.env,
      IWANA_APPLY_PII_CONTRACT: 'true',
    });
    const [migrationCountRow] = (await tenantDataSource.query(
      'SELECT COUNT(*)::int AS count FROM typeorm_migrations',
    )) as Array<{ count: number }>;
    const appliedMigrationCount = migrationCountRow?.count ?? 0;
    console.info(
      `[B1c] Tenant migrations applied: ${appliedMigrationCount}/${TENANT_MIGRATIONS.length}.`,
    );
    expect(appliedMigrationCount).toBe(TENANT_MIGRATIONS.length);
    await tenantDataSource.destroy();
    tenantDataSource = undefined;
  });

  afterAll(async () => {
    if (tenantDataSource?.isInitialized) await tenantDataSource.destroy();
    if (dataSource?.isInitialized) {
      try {
        await dataSource.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
        await dataSource.query('DELETE FROM public.tenants WHERE id = $1', [tenantId]);
      } finally {
        await dataSource.destroy();
      }
    }
  });

  it.each([
    [SubscriberStatus.SUSPENDED, 'Motivo sintético de suspensión'],
    [SubscriberStatus.CANCELLED, 'Motivo sintético de cancelación'],
  ])('CA-BT-18 registra %s sin guardar el motivo', async (targetStatus, privateReason) => {
    if (!dataSource) throw new Error('DataSource de integración no inicializado.');
    const subscriberId = randomUUID();
    await dataSource.query(
      `INSERT INTO ${qualified('subscribers')} (
         id, tenant_id, status, person_type, customer_segment, activated_at,
         document_type, document_number_encrypted, first_name, last_name,
         stratum, vat_treatment, vat_responsibility, address, created_by
       ) VALUES (
         $1, $2, 'ACTIVE', $3, $4, now(), 'CC', 'synthetic-encrypted',
         'Titular', 'Sintético', 3, 'STANDARD', 'RESPONSABLE',
         'Dirección sintética', $5
       )`,
      [subscriberId, tenantId, PersonType.NATURAL, CustomerSegment.RESIDENTIAL, actorId],
    );

    const platformAuditService = {
      log: jest.fn().mockResolvedValue(undefined),
    } as unknown as PlatformAuditService;
    const service = new SubscriberStatusTransitionService(
      dataSource,
      new AuditService(dataSource, platformAuditService),
      new SubscriberFiscalCompletenessService(),
    );

    await TenantContext.run(context(), () =>
      service.transition(subscriberId, targetStatus, privateReason, actorId),
    );

    const rows = (await dataSource.query(
      `SELECT new_value
         FROM ${qualified('audit_logs')}
        WHERE entity_type = 'Subscriber' AND entity_id = $1
        ORDER BY created_at DESC`,
      [subscriberId],
    )) as Array<{ new_value: Record<string, unknown> }>;

    expect(rows).toHaveLength(1);
    expect(rows[0]?.new_value).toEqual({
      fromStatus: SubscriberStatus.ACTIVE,
      toStatus: targetStatus,
      reasonProvided: true,
    });
    expect(rows[0]?.new_value).not.toHaveProperty('reason');
    expect(JSON.stringify(rows)).not.toContain(privateReason);
  });
});
