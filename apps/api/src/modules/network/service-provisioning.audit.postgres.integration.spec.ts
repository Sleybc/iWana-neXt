import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import {
  AuditLog,
  dataSourceOptions,
  IpAssignment,
  Ipv4Network,
  NetworkPlanProfile,
  NetworkRouter,
  NetworkSetting,
  runInTenantSchema,
  ServiceProvisioning,
  TenantContext,
} from '@iwana/db';
import {
  AccessPermissionKey,
  AuditAction,
  UserRole,
  WfmWorkType,
  ExecutionOrderStatus,
} from '@iwana/shared';
import { CreateNetworkCatalog1600000000000 } from '../../../../../packages/database/src/migrations/tenant/160_network_catalog';
import { CreateNetworkProvisioning1610000000000 } from '../../../../../packages/database/src/migrations/tenant/161_network_provisioning';
import { EnableBtreeGist1784419216000 } from '../../../../../packages/database/src/migrations/public/028_enable_btree_gist';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { IpamService } from './ipam.service';
import { ManualRouterProvisioningAdapter } from './adapters/manual-router-provisioning.adapter';
import { ServiceProvisioningService } from './service-provisioning.service';

const dbAvailable = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const describeWithDb = dbAvailable ? describe : describe.skip;
const allowedDatabase = /^(dbiw|test|iwana_it_[a-z0-9_]+)$/u;
const tenantId = randomUUID();
const schemaName = `tenant_mod13_b2_audit_${randomUUID().replaceAll('-', '')}`;
const routerId = randomUUID();
const networkId = randomUUID();
const actorId = randomUUID();
const technicianId = randomUUID();
const subscriberId = randomUUID();
const executionOrderId = randomUUID();
const certificationEvidenceId = randomUUID();
const tenantContext = { tenantId, schemaName, tenantSlug: 'mod13-b2-audit-it' };
const actor: JwtPayload = {
  sub: actorId,
  email: 'noc@example.test',
  role: UserRole.NOC,
  tenantId,
  schemaName,
  jti: 'mod13-b2-audit-jti',
  type: 'tenant',
};

if (dbAvailable && !allowedDatabase.test(process.env['DB_NAME'] ?? 'dbiw')) {
  throw new Error('MOD13 B2 solo permite rollback integrado en dbiw, test o iwana_it_*');
}

if (!dbAvailable) {
  console.warn(
    '[MOD13-B2-audit] describe.skip activo — IWANA_DB_INTEGRATION_AVAILABLE no está habilitado.',
  );
}

describeWithDb('MOD13 B2: rollback de reserve, certify y release — PostgreSQL real', () => {
  let dataSource: DataSource;
  let service: ServiceProvisioningService;
  const auditService = {
    logWithin: jest.fn().mockRejectedValue(new Error('synthetic audit failure')),
  };
  const executionOrderReadPort = {
    getExecutionSnapshot: jest.fn(),
    getExecutionSnapshots: jest.fn(),
    hasEvidence: jest.fn(),
    listInstallationOrders: jest.fn(),
    hasOpenWithdrawalOrders: jest.fn(),
  };
  const subscriberServiceContextReadPort = {
    getForSubscriber: jest.fn().mockResolvedValue({
      expedienteId: null,
      planId: null,
      downloadMbps: null,
      uploadMbps: null,
      contracts: [],
    }),
  };
  const installedEquipmentReadPort = {
    getFirstInstalledAtCustomer: jest.fn().mockResolvedValue(null),
  };
  const networkActorReadPort = { findByIds: jest.fn().mockResolvedValue([]) };
  const effectivePermissionsService = {
    getEffectivePermissionsForUser: jest
      .fn()
      .mockResolvedValue([AccessPermissionKey.NETWORK_PROVISIONING_CERTIFY]),
  };
  const routerProvisioningPort = new ManualRouterProvisioningAdapter();

  const run = <T>(operation: () => Promise<T>) => TenantContext.run(tenantContext, operation);

  async function clearProvisionings(): Promise<void> {
    await run(() =>
      runInTenantSchema(dataSource, schemaName, async (qr) => {
        await qr.query(
          'UPDATE service_provisionings SET ip_assignment_id = NULL WHERE tenant_id = $1',
          [tenantId],
        );
        await qr.query('DELETE FROM ip_assignments WHERE tenant_id = $1', [tenantId]);
        await qr.query('DELETE FROM service_provisionings WHERE tenant_id = $1', [tenantId]);
      }),
    );
  }

  async function readRows(): Promise<{
    services: Array<{ id: string; status: string; version: number; certified_by: string | null }>;
    assignments: Array<{ ip: string; status: string }>;
  }> {
    return run(() =>
      runInTenantSchema(dataSource, schemaName, async (qr) => {
        const services = (await qr.query(
          `SELECT id, status, version, certified_by
             FROM service_provisionings WHERE tenant_id = $1`,
          [tenantId],
        )) as Array<{ id: string; status: string; version: number; certified_by: string | null }>;
        const assignments = (await qr.query(
          `SELECT host(ip) AS ip, status FROM ip_assignments WHERE tenant_id = $1`,
          [tenantId],
        )) as Array<{ ip: string; status: string }>;
        return { services, assignments };
      }),
    );
  }

  async function insertProvisioning(status: 'RESERVED' | 'CERTIFIED'): Promise<string> {
    const id = randomUUID();
    await run(() =>
      runInTenantSchema(dataSource, schemaName, async (qr) => {
        await qr.query(
          `INSERT INTO service_provisionings (
             id, tenant_id, subscriber_id, execution_order_id, execution_order_number,
             router_id, ipv4_network_id, control_method, control_params, status,
             reserved_by, reserved_at, certified_by, certified_at, certification_evidence_id,
             commercial_activation_status, version
           ) VALUES (
             $1, $2, $3, $4, 'OTE-MOD13-0001', $5, $6, 'PCQ_ADDRESS_LIST',
             '{"method":"PCQ_ADDRESS_LIST","addressList":"subscribers"}'::jsonb, $7,
             $8, NOW(), $9, $10, $11, 'NOT_APPLICABLE', 1
           )`,
          [
            id,
            tenantId,
            subscriberId,
            executionOrderId,
            routerId,
            networkId,
            status,
            actorId,
            status === 'CERTIFIED' ? actorId : null,
            status === 'CERTIFIED' ? new Date() : null,
            status === 'CERTIFIED' ? certificationEvidenceId : null,
          ],
        );
        const assignmentRows = (await qr.query(
          `INSERT INTO ip_assignments (tenant_id, ipv4_network_id, ip, service_provisioning_id, status)
           VALUES ($1, $2, '10.44.0.10', $3, 'RESERVED') RETURNING id`,
          [tenantId, networkId, id],
        )) as Array<{ id: string }>;
        await qr.query('UPDATE service_provisionings SET ip_assignment_id = $1 WHERE id = $2', [
          assignmentRows[0]?.id,
          id,
        ]);
      }),
    );
    return id;
  }

  beforeAll(async () => {
    dataSource = new DataSource({
      ...dataSourceOptions,
      entities: [
        AuditLog,
        NetworkRouter,
        Ipv4Network,
        NetworkPlanProfile,
        NetworkSetting,
        ServiceProvisioning,
        IpAssignment,
      ],
      migrations: [],
      logging: false,
      extra: { ...dataSourceOptions.extra, max: 4, min: 1 },
    });
    await dataSource.initialize();
    const bootstrap = dataSource.createQueryRunner();
    await bootstrap.connect();
    try {
      await new EnableBtreeGist1784419216000().up(bootstrap);
      await bootstrap.query(`CREATE SCHEMA "${schemaName}"`);
    } finally {
      await bootstrap.release();
    }

    const migrationRunner = dataSource.createQueryRunner();
    await migrationRunner.connect();
    await migrationRunner.query(`SET search_path TO "${schemaName}"`);
    try {
      await new CreateNetworkCatalog1600000000000().up(migrationRunner);
      await new CreateNetworkProvisioning1610000000000().up(migrationRunner);
    } finally {
      await migrationRunner.release();
    }

    await run(() =>
      runInTenantSchema(dataSource, schemaName, async (qr) => {
        await qr.query(
          `INSERT INTO network_routers
             (id, tenant_id, name, management_host, supported_control_methods, created_by)
           VALUES ($1, $2, 'Router B2', 'router.example.invalid', ARRAY['PCQ_ADDRESS_LIST'], $3)`,
          [routerId, tenantId, actorId],
        );
        await qr.query(
          `INSERT INTO ipv4_networks
             (id, tenant_id, router_id, name, cidr, gateway, assignable_from, assignable_to,
              default_control_method, created_by)
           VALUES ($1, $2, $3, 'Red B2', '10.44.0.0/24', '10.44.0.1', '10.44.0.10', '10.44.0.250',
                   'PCQ_ADDRESS_LIST', $4)`,
          [networkId, tenantId, routerId, actorId],
        );
      }),
    );

    service = new ServiceProvisioningService(
      dataSource,
      auditService as never,
      new IpamService(dataSource),
      executionOrderReadPort as never,
      subscriberServiceContextReadPort as never,
      installedEquipmentReadPort as never,
      networkActorReadPort as never,
      effectivePermissionsService as never,
      routerProvisioningPort,
      { emitAsync: jest.fn().mockResolvedValue([]) } as never,
    );
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      await dataSource.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
      await dataSource.destroy();
    }
  });

  beforeEach(async () => {
    await clearProvisionings();
    jest.clearAllMocks();
    auditService.logWithin.mockRejectedValue(new Error('synthetic audit failure'));
    executionOrderReadPort.getExecutionSnapshot.mockResolvedValue({
      id: executionOrderId,
      executionOrderNumber: 'OTE-MOD13-0001',
      status: ExecutionOrderStatus.IN_PROGRESS,
      workType: WfmWorkType.INSTALLATION,
      isAnnulled: false,
      subscriberId,
      assignedTechnicianId: technicianId,
      customerDisplayLabel: 'Suscriptor de prueba',
      closedAt: null,
      result: null,
    });
    executionOrderReadPort.hasEvidence.mockResolvedValue(true);
    effectivePermissionsService.getEffectivePermissionsForUser.mockResolvedValue([
      AccessPermissionKey.NETWORK_PROVISIONING_CERTIFY,
    ]);
  });

  it('revierte el servicio y la IP si falla la auditoría de reserve', async () => {
    await expect(
      run(() =>
        service.reserve(
          {
            executionOrderId,
            routerId,
            ipv4NetworkId: networkId,
            controlParams: { method: 'PCQ_ADDRESS_LIST', addressList: 'subscribers' },
          },
          actor,
        ),
      ),
    ).rejects.toThrow('synthetic audit failure');

    expect(auditService.logWithin).toHaveBeenCalledTimes(1);
    await expect(readRows()).resolves.toEqual({ services: [], assignments: [] });
  });

  it('revierte la certificación si falla la auditoría de certify', async () => {
    const provisioningId = await insertProvisioning('RESERVED');

    await expect(
      run(() =>
        service.certify(provisioningId, { evidenceId: certificationEvidenceId, version: 1 }, actor),
      ),
    ).rejects.toThrow('synthetic audit failure');

    expect(auditService.logWithin).toHaveBeenCalledTimes(1);
    await expect(readRows()).resolves.toMatchObject({
      services: [{ id: provisioningId, status: 'RESERVED', version: 1, certified_by: null }],
      assignments: [{ ip: '10.44.0.10', status: 'RESERVED' }],
    });
  });

  it('revierte el servicio y la IP si falla la auditoría de release', async () => {
    const provisioningId = await insertProvisioning('CERTIFIED');

    await expect(
      run(() =>
        service.release(
          provisioningId,
          { version: 1, reason: 'Corrección operativa de prueba' },
          actor,
        ),
      ),
    ).rejects.toThrow('synthetic audit failure');

    expect(auditService.logWithin).toHaveBeenCalledTimes(1);
    await expect(readRows()).resolves.toMatchObject({
      services: [{ id: provisioningId, status: 'CERTIFIED', version: 1 }],
      assignments: [{ ip: '10.44.0.10', status: 'RESERVED' }],
    });
  });
});
