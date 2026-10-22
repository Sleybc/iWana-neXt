import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import {
  AuditLog,
  dataSourceOptions,
  NetworkRouter,
  runInTenantSchema,
  TenantContext,
} from '@iwana/db';
import { CreateRouterBody, CONTROL_METHODS } from '@iwana/shared';
import { AuditService } from '../../audit/audit.service';
import { PlatformAuditService } from '../../audit/platform-audit.service';
import { IpamService } from '../ipam.service';
import { NetworkActorReadPort } from '../ports/network-actor-read.port';
import { NetworkCatalogService } from '../network-catalog.service';

const dbAvailable = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const describeWithDb = dbAvailable ? describe : describe.skip;

describeWithDb('NetworkCatalogService — atomicidad de auditoría con PostgreSQL real', () => {
  let dataSource: DataSource;
  let service: NetworkCatalogService;
  const tenantId = randomUUID();
  const schemaName = `tenant_mod13_catalog_${randomUUID().replaceAll('-', '')}`;
  const actorId = randomUUID();
  const context = { tenantId, schemaName, tenantSlug: 'mod13-catalog-it' };

  beforeAll(async () => {
    dataSource = new DataSource({
      ...dataSourceOptions,
      entities: [AuditLog, NetworkRouter],
      migrations: [],
      logging: false,
      extra: { ...dataSourceOptions.extra, max: 3, min: 1 },
    });
    await dataSource.initialize();
    await dataSource.query(`CREATE SCHEMA "${schemaName}"`);
    await dataSource.query(`
      CREATE TABLE "${schemaName}".network_routers (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL,
        name varchar(120) NOT NULL,
        organization_site_id uuid NULL,
        commercial_node_id uuid NULL,
        management_host varchar(255) NOT NULL,
        lan_interface varchar(64) NULL,
        supported_control_methods varchar(40)[] NOT NULL,
        status varchar(16) NOT NULL DEFAULT 'ACTIVE',
        notes text NULL,
        created_by uuid NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        version integer NOT NULL DEFAULT 1
      )
    `);
    await dataSource.query(`
      CREATE TABLE "${schemaName}".audit_logs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL,
        user_id uuid NULL,
        action varchar(50) NOT NULL,
        entity_type varchar(100) NOT NULL,
        entity_id varchar(100) NOT NULL,
        old_value jsonb NULL,
        new_value jsonb NULL,
        ip_address varchar(45) NULL,
        user_agent varchar(512) NULL,
        request_id varchar(100) NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await dataSource.query(`
      CREATE FUNCTION "${schemaName}".reject_audit_insert() RETURNS trigger
      LANGUAGE plpgsql AS $block$
      BEGIN
        RAISE EXCEPTION 'synthetic audit failure';
      END;
      $block$
    `);
    await dataSource.query(`
      CREATE TRIGGER reject_audit_insert
      BEFORE INSERT ON "${schemaName}".audit_logs
      FOR EACH ROW EXECUTE FUNCTION "${schemaName}".reject_audit_insert()
    `);

    const auditService = new AuditService(dataSource, {
      log: jest.fn().mockResolvedValue(undefined),
    } as unknown as PlatformAuditService);
    service = new NetworkCatalogService(
      dataSource,
      auditService,
      {} as NetworkActorReadPort,
      new IpamService(dataSource),
    );
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      await dataSource.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
      await dataSource.destroy();
    }
  });

  it('revierte la creación del router si AuditService.logWithin falla', async () => {
    const input: CreateRouterBody = {
      name: 'Router de integración',
      managementHost: 'router.example.invalid',
      supportedControlMethods: [CONTROL_METHODS[0]],
    };

    await expect(
      TenantContext.run(context, () => service.createRouter(input, actorId)),
    ).rejects.toThrow('synthetic audit failure');

    const rows = (await runInTenantSchema(dataSource, schemaName, (qr) =>
      qr.query('SELECT id FROM network_routers WHERE tenant_id = $1', [tenantId]),
    )) as Array<{ id: string }>;
    expect(rows).toHaveLength(0);
  });
});
