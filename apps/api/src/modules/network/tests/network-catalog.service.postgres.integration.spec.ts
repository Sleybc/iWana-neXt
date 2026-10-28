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
        -- Fixture simplificada para atomicidad de auditoría; incluye la columna que mapea NetworkRouter desde migración 165.
        legacy_lan_interface_id uuid NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        version integer NOT NULL DEFAULT 1
      )
    `);
    await dataSource.query(`
      CREATE TABLE "${schemaName}".ipv4_networks (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL,
        router_id uuid NOT NULL
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
      {
        requireCreateScope: jest.fn().mockResolvedValue(undefined),
        requireSiteAction: jest.fn().mockResolvedValue(undefined),
        requireSiteOrTenantWideAction: jest.fn().mockResolvedValue(undefined),
        requireTenantWideAction: jest.fn().mockResolvedValue(undefined),
        authorizedSiteScope: jest.fn().mockResolvedValue({ kind: 'TENANT_WIDE' }),
      } as never,
      { findReferenceById: jest.fn().mockResolvedValue({ isActive: true }) } as never,
      {
        findReferenceById: jest.fn().mockResolvedValue({ isActive: true, deletedAt: null }),
      } as never,
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

  it('audita los nombres de los campos opcionales enviados sin registrar sus valores', async () => {
    const organizationSiteId = randomUUID();
    const commercialNodeId = randomUUID();
    await dataSource.query(`DROP TRIGGER reject_audit_insert ON "${schemaName}".audit_logs`);

    try {
      await TenantContext.run(context, () =>
        service.createRouter(
          {
            name: 'Router con campos opcionales',
            managementHost: 'router.example.invalid',
            lanInterface: 'bridge-test',
            supportedControlMethods: [CONTROL_METHODS[0]],
            organizationSiteId,
            commercialNodeId,
            notes: 'Nota de integración',
          },
          actorId,
        ),
      );

      const auditRows = (await runInTenantSchema(dataSource, schemaName, (qr) =>
        qr.query(
          'SELECT new_value FROM audit_logs WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 1',
          [tenantId],
        ),
      )) as Array<{ new_value: Record<string, unknown> }>;
      expect(auditRows).toHaveLength(1);
      expect(auditRows[0]?.new_value['changedFields']).toEqual(
        expect.arrayContaining(['organizationSiteId', 'commercialNodeId', 'notes', 'lanInterface']),
      );
      expect(auditRows[0]?.new_value).not.toHaveProperty('organizationSiteId');
      expect(auditRows[0]?.new_value).not.toHaveProperty('commercialNodeId');
      expect(auditRows[0]?.new_value).not.toHaveProperty('notes');
      expect(auditRows[0]?.new_value).not.toHaveProperty('managementHost');
      expect(auditRows[0]?.new_value).not.toHaveProperty('lanInterface');
      const serializedAudit = JSON.stringify(auditRows[0]?.new_value);
      expect(serializedAudit).not.toContain(organizationSiteId);
      expect(serializedAudit).not.toContain(commercialNodeId);
      expect(serializedAudit).not.toContain('Nota de integración');
      expect(serializedAudit).not.toContain('router.example.invalid');
      expect(serializedAudit).not.toContain('bridge-test');
    } finally {
      await dataSource.query(`
        CREATE TRIGGER reject_audit_insert
        BEFORE INSERT ON "${schemaName}".audit_logs
        FOR EACH ROW EXECUTE FUNCTION "${schemaName}".reject_audit_insert()
      `);
    }
  });
});
