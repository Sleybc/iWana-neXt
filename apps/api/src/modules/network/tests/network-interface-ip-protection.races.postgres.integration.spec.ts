import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DataSource } from 'typeorm';
import type { Job, Queue } from 'bullmq';
import type { ConfigService } from '@nestjs/config';
import {
  dataSourceOptions,
  Ipv4Network,
  IpAssignment,
  NetworkInboxEvent,
  NetworkRouter,
  NetworkRouterInterface,
  NetworkRouterInterfaceIpv4Address,
  ServiceProvisioning,
  Tenant,
  runInTenantSchema,
  TenantContext,
} from '@iwana/db';
import {
  canonicalizeNetworkExecutionEvent,
  ExecutionOrderResult,
  ExecutionOrderStatus,
  WfmWorkType,
  type CreateIpv4NetworkBody,
  type CreateRouterInterfaceIpv4AddressBody,
  type NetworkExecutionEvent,
  type RegularizeProvisioningBody,
  type ReserveProvisioningBody,
} from '@iwana/shared';
import { EnableBtreeGist1784419216000 } from '../../../../../../packages/database/src/migrations/public/028_enable_btree_gist';
import { CreateNetworkCatalog1600000000000 } from '../../../../../../packages/database/src/migrations/tenant/160_network_catalog';
import { CreateNetworkProvisioning1610000000000 } from '../../../../../../packages/database/src/migrations/tenant/161_network_provisioning';
import { CreateRouterInterfacesAndIpv4Addresses1650000000000 } from '../../../../../../packages/database/src/migrations/tenant/165_router_interfaces_and_ipv4_addresses';
import { AuditService } from '../../audit/audit.service';
import { NetworkAuthorizationFacade } from '../authorization/network-authorization.facade';
import { IpamService } from '../ipam.service';
import { NetworkCatalogService } from '../network-catalog.service';
import { NetworkInterfaceCatalogService } from '../network-interface-catalog.service';
import { ServiceProvisioningService } from '../service-provisioning.service';
import { NetworkExecutionEventProcessor } from '../network-execution-event.processor';
import {
  NetworkProvisioningReconcilerProcessor,
  NETWORK_PROVISIONING_RECONCILE_JOB,
} from '../network-provisioning-reconciler.processor';
import { NetworkActorReadPort } from '../ports/network-actor-read.port';
import { OrganizationSiteReadPort } from '../../organization/ports/organization-site-read.port';
import { CommercialNodeReadPort } from '../../tenant/ports/commercial-node-read.port';
import { TenantLifecycleReadAdapter } from '../../tenant/ports/tenant-lifecycle-read.adapter';
import type { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import type {
  ExecutionOrderReadPort,
  ExecutionSnapshot,
} from '../../tasks/ports/execution-order-read.port';
import type { SubscriberServiceContextReadPort } from '../../crm/ports/subscriber-service-context-read.port';
import type { InstalledEquipmentReadPort } from '../../inventory/ports/installed-equipment-read.port';
import type { EffectivePermissionScopePort } from '../../access-control/ports/effective-permission-scope.port';
import type { RouterProvisioningPort } from '../ports/router-provisioning.port';

const DB_AVAILABLE = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const describeWithDb = DB_AVAILABLE ? describe : describe.skip;
const SCHEMA = `tenant_mod13_races_${randomBytes(4).toString('hex')}`;
const TENANT_SLUG = `mod13-races-${randomBytes(4).toString('hex')}`;
const EVENT_SIGNING_KEY = randomBytes(32).toString('base64');
const ALLOWED_DATABASE = /^(dbiw|test|iwana_it_[a-z0-9_]+)$/u;

type AssignmentWriterKind = 'reserve' | 'release' | 'regularize' | 'consumer' | 'reconciler';

interface PreparedAssignmentWriter {
  expectedStatus: 'RESERVED' | 'ACTIVE' | 'RELEASED';
  getProvisioningId(): string | undefined;
  start(): Promise<unknown>;
}

if (DB_AVAILABLE && !ALLOWED_DATABASE.test(process.env['DB_NAME'] ?? 'dbiw')) {
  throw new Error(
    'MOD13 race integration solo permite schemas efímeros en dbiw, test o iwana_it_*',
  );
}

async function waitForAdvisoryWait(
  source: DataSource,
  lockName: string,
  minimumWaiters = 1,
): Promise<void> {
  // Cuenta únicamente la cola de la clave que sincroniza esta prueba.
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const rows = (await source.query(
      `SELECT COUNT(*)::int AS total
         FROM pg_locks
        WHERE locktype = 'advisory'
          AND granted = false
          AND objsubid = 1
          AND classid::bigint = ((hashtextextended($1, 0) >> 32) & 4294967295)
          AND objid::bigint = (hashtextextended($1, 0) & 4294967295)`,
      [lockName],
    )) as Array<{ total: number }>;
    if ((rows[0]?.total ?? 0) >= minimumWaiters) return;
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  throw new Error(`No aparecieron ${minimumWaiters} waiters para ${lockName} en PostgreSQL.`);
}

interface HeldAdvisoryLock {
  release(): Promise<void>;
}

async function holdAdvisoryLock(
  source: DataSource,
  schema: string,
  lockName: string,
): Promise<HeldAdvisoryLock> {
  const runner = source.createQueryRunner();
  await runner.connect();
  await runner.startTransaction();
  await runner.query(`SET LOCAL search_path TO "${schema}"`);
  await runner.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [lockName]);
  let released = false;
  return {
    async release() {
      if (released) return;
      released = true;
      try {
        await runner.commitTransaction();
      } finally {
        await runner.release();
      }
    },
  };
}

describeWithDb('MOD13 interfaces ↔ IPAM — carreras PostgreSQL reales', () => {
  let dataSource: DataSource | undefined;
  let tenantId: string;
  let actorId: string;
  let routerId: string;
  let interfaceId: string;
  let publicTenantInserted = false;
  let ipamService: IpamService;
  let interfaceService: NetworkInterfaceCatalogService;
  let catalogService: NetworkCatalogService;
  const context = () => ({ tenantId, schemaName: SCHEMA, tenantSlug: SCHEMA });
  const run = <T>(operation: () => Promise<T>) => TenantContext.run(context(), operation);
  const audit = { logWithin: jest.fn().mockResolvedValue(undefined) } as unknown as AuditService;
  const authorization = {
    requireSiteOrTenantWideAction: jest.fn().mockResolvedValue(undefined),
    requireTenantWideAction: jest.fn().mockResolvedValue(undefined),
  } as unknown as NetworkAuthorizationFacade;

  async function createNetwork(cidr: string, associatedInterfaceId?: string): Promise<string> {
    const [networkStart, gatewayHost, startHost, endHost] = (() => {
      const [octet3] =
        cidr
          .match(/^10\.(\d+)\./u)
          ?.slice(1)
          .map(Number) ?? [];
      if (octet3 === undefined) throw new Error(`CIDR sintético inválido: ${cidr}`);
      return [cidr, `10.${octet3}.0.1`, `10.${octet3}.0.10`, `10.${octet3}.0.30`];
    })();
    const body: CreateIpv4NetworkBody = {
      routerId,
      name: `Race pool ${cidr}`,
      cidr: networkStart,
      gateway: gatewayHost,
      assignableFrom: startHost,
      assignableTo: endHost,
      defaultControlMethod: 'SIMPLE_QUEUE_STATIC_IP',
      excludedIps: [],
    };
    const created = await run(() => catalogService.createIpv4Network(body, actorId));
    if (associatedInterfaceId) {
      const version = await interfaceVersion();
      await run(() =>
        catalogService.updateIpv4Network(
          created.id,
          {
            version: created.version,
            interfaceId: associatedInterfaceId,
            interfaceVersion: version,
          },
          actorId,
        ),
      );
    }
    return created.id;
  }

  async function createProvisioning(networkId: string): Promise<string> {
    const provisioningId = randomUUID();
    await dataSource!.query(
      `INSERT INTO "${SCHEMA}".service_provisionings
         (id, tenant_id, subscriber_id, execution_order_id, execution_order_number,
          router_id, ipv4_network_id, control_method, control_params, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'SIMPLE_QUEUE_STATIC_IP',
               '{"method":"SIMPLE_QUEUE_STATIC_IP"}'::jsonb, 'RESERVED')`,
      [
        provisioningId,
        tenantId,
        randomUUID(),
        randomUUID(),
        `R-${randomUUID().slice(0, 30)}`,
        routerId,
        networkId,
      ],
    );
    return provisioningId;
  }

  async function createFlowProvisioning(
    networkId: string,
    executionOrderId: string,
    host: string,
    status: 'RESERVED' | 'CERTIFIED' = 'RESERVED',
  ): Promise<string> {
    const provisioningId = randomUUID();
    await dataSource!.query(
      `INSERT INTO "${SCHEMA}".service_provisionings
         (id, tenant_id, subscriber_id, execution_order_id, execution_order_number,
          router_id, ipv4_network_id, control_method, control_params, status,
          reserved_by, reserved_at, certified_by, certified_at, certification_evidence_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'SIMPLE_QUEUE_STATIC_IP',
               '{"method":"SIMPLE_QUEUE_STATIC_IP","queueName":"mod13-races"}'::jsonb,
               $8, $9, now(), $10, $11, $12)`,
      [
        provisioningId,
        tenantId,
        randomUUID(),
        executionOrderId,
        `R-${executionOrderId.slice(0, 28)}`,
        routerId,
        networkId,
        status,
        actorId,
        status === 'CERTIFIED' ? actorId : null,
        status === 'CERTIFIED' ? new Date() : null,
        status === 'CERTIFIED' ? randomUUID() : null,
      ],
    );
    const assignments = (await dataSource!.query(
      `INSERT INTO "${SCHEMA}".ip_assignments
         (tenant_id, ipv4_network_id, ip, service_provisioning_id, status)
       VALUES ($1, $2, $3::inet, $4, 'RESERVED') RETURNING id`,
      [tenantId, networkId, host, provisioningId],
    )) as Array<{ id: string }>;
    const assignmentId = assignments[0]?.id;
    if (!assignmentId) throw new Error('No se pudo crear la asignación sintética.');
    await dataSource!.query(
      `UPDATE "${SCHEMA}".service_provisionings
          SET ip_assignment_id = $1
        WHERE tenant_id = $2 AND id = $3`,
      [assignmentId, tenantId, provisioningId],
    );
    return provisioningId;
  }

  function createProvisioningService(snapshot: ExecutionSnapshot): {
    service: ServiceProvisioningService;
    routerProvisioningPort: RouterProvisioningPort & {
      apply: jest.Mock;
      remove: jest.Mock;
    };
  } {
    const executionOrderReadPort = {
      getExecutionSnapshot: jest.fn().mockResolvedValue(snapshot),
      getExecutionReference: jest.fn().mockImplementation(async (id: string) => ({
        id,
        assignedTechnicianId: snapshot.assignedTechnicianId,
      })),
      getExecutionSnapshots: jest.fn().mockResolvedValue([snapshot]),
      hasEvidence: jest.fn().mockResolvedValue(true),
      hasOpenWithdrawalOrders: jest.fn().mockResolvedValue(false),
      listProvisioningEvidence: jest.fn().mockResolvedValue([]),
      listInstallationOrders: jest.fn().mockResolvedValue({ rows: [], total: 0 }),
    } as unknown as ExecutionOrderReadPort;
    const subscriberContextPort = {
      getForSubscriber: jest.fn().mockResolvedValue({
        expedienteId: null,
        planId: null,
        downloadMbps: null,
        uploadMbps: null,
        contracts: [{ id: randomUUID(), alias: null, status: 'ACTIVE', planId: randomUUID() }],
      }),
    } as unknown as SubscriberServiceContextReadPort;
    const installedEquipmentReadPort = {
      getFirstInstalledAtCustomer: jest.fn().mockResolvedValue(null),
    } as unknown as InstalledEquipmentReadPort;
    const actorReadPort = {
      findByIds: jest.fn().mockResolvedValue([]),
    } as unknown as NetworkActorReadPort;
    const effectivePermissionScope = {
      authorizeTenantWide: jest.fn().mockResolvedValue(true),
      evaluateSite: jest.fn().mockResolvedValue('ALLOWED'),
      listAuthorizedSiteScope: jest.fn().mockResolvedValue({ kind: 'TENANT_WIDE' }),
    } as unknown as EffectivePermissionScopePort;
    const routerProvisioningPort = {
      apply: jest.fn().mockResolvedValue({ mode: 'MANUAL', steps: [] }),
      remove: jest.fn().mockResolvedValue({ mode: 'MANUAL', steps: [] }),
      suspend: jest.fn().mockResolvedValue({ mode: 'MANUAL', steps: [] }),
      sync: jest.fn().mockResolvedValue({ supported: false }),
    } as unknown as RouterProvisioningPort & { apply: jest.Mock; remove: jest.Mock };
    const service = new ServiceProvisioningService(
      dataSource!,
      audit,
      ipamService,
      executionOrderReadPort,
      subscriberContextPort,
      installedEquipmentReadPort,
      actorReadPort,
      effectivePermissionScope,
      authorization,
      routerProvisioningPort,
      new EventEmitter2(),
      false,
    );
    return { service, routerProvisioningPort };
  }

  function syntheticSnapshot(
    executionOrderId: string,
    overrides: Partial<ExecutionSnapshot> = {},
  ): ExecutionSnapshot {
    return {
      id: executionOrderId,
      executionOrderNumber: `R-${executionOrderId.slice(0, 28)}`,
      status: ExecutionOrderStatus.IN_PROGRESS,
      workType: WfmWorkType.INSTALLATION,
      isAnnulled: false,
      subscriberId: randomUUID(),
      assignedTechnicianId: randomUUID(),
      customerDisplayLabel: 'Suscriptor sintético',
      closedAt: null,
      result: null,
      ...overrides,
    };
  }

  function syntheticActor(): JwtPayload {
    return {
      sub: actorId,
      email: randomBytes(32).toString('hex'),
      role: 'NOC',
      tenantId,
      schemaName: SCHEMA,
      jti: randomUUID(),
      type: 'tenant',
    };
  }

  function reserveBody(
    networkId: string,
    executionOrderId: string,
    requestedIp?: string,
  ): ReserveProvisioningBody {
    return {
      executionOrderId,
      routerId,
      ipv4NetworkId: networkId,
      controlParams: { method: 'SIMPLE_QUEUE_STATIC_IP', queueName: 'mod13-races' },
      ...(requestedIp ? { requestedIp } : {}),
    };
  }

  async function provisioningRowCount(executionOrderId: string): Promise<number> {
    const rows = (await dataSource!.query(
      `SELECT COUNT(*)::int AS total FROM "${SCHEMA}".service_provisionings
        WHERE tenant_id = $1 AND execution_order_id = $2`,
      [tenantId, executionOrderId],
    )) as Array<{ total: number }>;
    return rows[0]?.total ?? 0;
  }

  async function assignmentStatus(provisioningId: string): Promise<string | null> {
    const rows = (await dataSource!.query(
      `SELECT status FROM "${SCHEMA}".ip_assignments
        WHERE tenant_id = $1 AND service_provisioning_id = $2`,
      [tenantId, provisioningId],
    )) as Array<{ status: string }>;
    return rows[0]?.status ?? null;
  }

  async function assignmentState(provisioningId: string): Promise<{
    id: string;
    status: string;
    releasedAt: Date | null;
    releaseReason: string | null;
    updatedAt: Date;
  } | null> {
    const rows = (await dataSource!.query(
      `SELECT id::text AS id, status, released_at AS "releasedAt",
              release_reason AS "releaseReason", updated_at AS "updatedAt"
         FROM "${SCHEMA}".ip_assignments
        WHERE tenant_id = $1 AND service_provisioning_id = $2`,
      [tenantId, provisioningId],
    )) as Array<{
      id: string;
      status: string;
      releasedAt: Date | null;
      releaseReason: string | null;
      updatedAt: Date;
    }>;
    return rows[0] ?? null;
  }

  async function signEvent(event: NetworkExecutionEvent): Promise<Record<string, unknown>> {
    const envelope = { ...event };
    return {
      tenantId,
      envelope,
      signature: createHmac('sha256', Buffer.from(EVENT_SIGNING_KEY, 'base64'))
        .update(canonicalizeNetworkExecutionEvent(tenantId, envelope))
        .digest('hex'),
    };
  }

  function createEventProcessor(snapshot: ExecutionSnapshot): NetworkExecutionEventProcessor {
    const config = {
      get: jest.fn((key: string) =>
        key === 'INTERNAL_QUEUE_SIGNING_KEY' ? EVENT_SIGNING_KEY : undefined,
      ),
    } as unknown as ConfigService;
    const executionOrderReadPort = {
      getExecutionSnapshot: jest.fn().mockResolvedValue(snapshot),
    } as unknown as ExecutionOrderReadPort;
    return new NetworkExecutionEventProcessor(
      dataSource!,
      config,
      new EventEmitter2(),
      executionOrderReadPort,
      audit,
      ipamService,
      new TenantLifecycleReadAdapter(dataSource!.getRepository(Tenant)),
    );
  }

  function createReconciler(snapshot: ExecutionSnapshot): NetworkProvisioningReconcilerProcessor {
    const executionOrderReadPort = {
      getExecutionSnapshots: jest.fn().mockResolvedValue([snapshot]),
    } as unknown as ExecutionOrderReadPort;
    return new NetworkProvisioningReconcilerProcessor(
      dataSource!,
      {} as Queue,
      executionOrderReadPort,
      audit,
      new EventEmitter2(),
      ipamService,
      new TenantLifecycleReadAdapter(dataSource!.getRepository(Tenant)),
    );
  }

  async function assertAssignmentCount(networkId: string): Promise<number> {
    const rows = (await dataSource!.query(
      `SELECT COUNT(*)::int AS total FROM "${SCHEMA}".ip_assignments
        WHERE tenant_id = $1 AND ipv4_network_id = $2`,
      [tenantId, networkId],
    )) as Array<{ total: number }>;
    return rows[0]?.total ?? 0;
  }

  async function reserve(
    networkId: string,
    provisioningId: string,
    host?: string,
  ): Promise<string> {
    return run(() =>
      runInTenantSchema(dataSource!, SCHEMA, (runner) =>
        ipamService.reserveIp(runner.manager, {
          networkId,
          provisioningId,
          ...(host ? { requestedIp: host } : {}),
        }),
      ),
    );
  }

  async function createAddress(host: string): Promise<{ id: string; host: string }> {
    const body: CreateRouterInterfaceIpv4AddressBody = { addressWithPrefix: `${host}/24` };
    return run(() =>
      interfaceService.createInterfaceIpv4Address(routerId, interfaceId, body, actorId),
    );
  }

  async function correctAddress(addressId: string, newHost: string): Promise<unknown> {
    return run(() =>
      interfaceService.correctInterfaceIpv4Address(
        routerId,
        interfaceId,
        addressId,
        {
          newAddress: `${newHost}/24`,
          version: 1,
          reason: 'ERROR_DE_REGISTRO',
          confirmReleasedHost: true,
        },
        actorId,
      ),
    );
  }

  async function setInterfaceStatus(status: 'ACTIVE' | 'INACTIVE'): Promise<{ version: number }> {
    const version = await interfaceVersion();
    return run(() =>
      interfaceService.setRouterInterfaceStatus(routerId, interfaceId, version, status, actorId),
    );
  }

  async function setRouterStatus(status: 'ACTIVE' | 'INACTIVE'): Promise<{ version: number }> {
    const version = await routerVersion();
    return run(() => catalogService.setRouterStatus(routerId, version, status, actorId));
  }

  async function assertTenantWideI1(): Promise<void> {
    const rows = (await dataSource!.query(
      `SELECT COUNT(*)::int AS total
         FROM "${SCHEMA}".network_router_interface_ipv4_addresses address
         JOIN "${SCHEMA}".ip_assignments assignment
           ON assignment.tenant_id = address.tenant_id
          AND set_masklen(assignment.ip, 32) = address.host_address
        WHERE address.tenant_id = $1
          AND assignment.status IN ('RESERVED', 'ACTIVE')`,
      [tenantId],
    )) as Array<{ total: number }>;
    expect(rows[0]?.total).toBe(0);
  }

  async function liveAssignments(
    networkId: string,
  ): Promise<Array<{ ip: string; status: string }>> {
    return (await dataSource!.query(
      `SELECT host(ip) AS ip, status
         FROM "${SCHEMA}".ip_assignments
        WHERE tenant_id = $1 AND ipv4_network_id = $2
          AND status IN ('RESERVED', 'ACTIVE')
        ORDER BY ip`,
      [tenantId, networkId],
    )) as Array<{ ip: string; status: string }>;
  }

  async function interfaceVersion(): Promise<number> {
    const rows = (await dataSource!.query(
      `SELECT version FROM "${SCHEMA}".network_router_interfaces
        WHERE tenant_id = $1 AND router_id = $2 AND id = $3`,
      [tenantId, routerId, interfaceId],
    )) as Array<{ version: number }>;
    if (!rows[0]) throw new Error('No se encontró la interfaz sintética.');
    return rows[0].version;
  }

  async function routerVersion(): Promise<number> {
    const rows = (await dataSource!.query(
      `SELECT version FROM "${SCHEMA}".network_routers WHERE tenant_id = $1 AND id = $2`,
      [tenantId, routerId],
    )) as Array<{ version: number }>;
    if (!rows[0]) throw new Error('No se encontró el router sintético.');
    return rows[0].version;
  }

  async function networkVersion(networkId: string): Promise<number> {
    const rows = (await dataSource!.query(
      `SELECT version FROM "${SCHEMA}".ipv4_networks WHERE tenant_id = $1 AND id = $2`,
      [tenantId, networkId],
    )) as Array<{ version: number }>;
    if (!rows[0]) throw new Error('No se encontró el pool sintético.');
    return rows[0].version;
  }

  async function patchAssignableTo(
    networkId: string,
    assignableTo: string,
  ): Promise<{ version: number }> {
    const version = await networkVersion(networkId);
    return run(() =>
      catalogService.updateIpv4Network(networkId, { version, assignableTo }, actorId),
    );
  }

  async function setNetworkStatus(
    networkId: string,
    status: 'ACTIVE' | 'INACTIVE',
  ): Promise<{ version: number }> {
    const version = await networkVersion(networkId);
    return run(() => catalogService.setIpv4NetworkStatus(networkId, version, status, actorId));
  }

  async function networkStatus(networkId: string): Promise<string> {
    const rows = (await dataSource!.query(
      `SELECT status FROM "${SCHEMA}".ipv4_networks WHERE tenant_id = $1 AND id = $2`,
      [tenantId, networkId],
    )) as Array<{ status: string }>;
    if (!rows[0]) throw new Error('No se encontró el pool sintético.');
    return rows[0].status;
  }

  async function patchNetworkInterface(
    networkId: string,
    nextInterfaceId: string | null,
  ): Promise<{ version: number; interfaceId: string | null }> {
    const version = await networkVersion(networkId);
    const interfaceVersionValue = nextInterfaceId ? await interfaceVersion() : undefined;
    return run(() =>
      catalogService.updateIpv4Network(
        networkId,
        {
          version,
          interfaceId: nextInterfaceId,
          ...(interfaceVersionValue !== undefined
            ? { interfaceVersion: interfaceVersionValue }
            : {}),
        },
        actorId,
      ),
    );
  }

  async function networkInterfaceId(networkId: string): Promise<string | null> {
    const rows = (await dataSource!.query(
      `SELECT interface_id FROM "${SCHEMA}".ipv4_networks WHERE tenant_id = $1 AND id = $2`,
      [tenantId, networkId],
    )) as Array<{ interface_id: string | null }>;
    if (!rows[0]) throw new Error('No se encontró el pool sintético.');
    return rows[0].interface_id;
  }

  function interfaceServiceWithProtection(
    status: 'ACTIVE' | 'PENDING',
  ): NetworkInterfaceCatalogService {
    return new NetworkInterfaceCatalogService(
      dataSource!,
      audit,
      ipamService,
      authorization,
      status,
    );
  }

  async function restoreCatalogStatuses(): Promise<void> {
    await dataSource!.query(
      `UPDATE "${SCHEMA}".network_router_interfaces
          SET status = 'ACTIVE', version = version + 1
        WHERE tenant_id = $1 AND router_id = $2 AND id = $3 AND status <> 'ACTIVE'`,
      [tenantId, routerId, interfaceId],
    );
    await dataSource!.query(
      `UPDATE "${SCHEMA}".network_routers
          SET status = 'ACTIVE', version = version + 1
        WHERE tenant_id = $1 AND id = $2 AND status <> 'ACTIVE'`,
      [tenantId, routerId],
    );
  }

  async function releaseAssignments(networkId: string): Promise<void> {
    await dataSource!.query(
      `UPDATE "${SCHEMA}".ip_assignments
          SET status = 'RELEASED', released_at = now(), release_reason = 'MOD13_TEST_CLEANUP'
        WHERE tenant_id = $1 AND ipv4_network_id = $2
          AND status IN ('RESERVED', 'ACTIVE')`,
      [tenantId, networkId],
    );
  }

  async function deleteLocalAddress(addressId: string): Promise<void> {
    await dataSource!.query(
      `DELETE FROM "${SCHEMA}".network_router_interface_ipv4_addresses
        WHERE tenant_id = $1 AND router_id = $2 AND interface_id = $3 AND id = $4`,
      [tenantId, routerId, interfaceId, addressId],
    );
  }

  async function catalogStatus(target: 'interface' | 'router'): Promise<string> {
    const table = target === 'interface' ? 'network_router_interfaces' : 'network_routers';
    const idColumn = target === 'interface' ? 'id = $2 AND router_id = $3' : 'id = $2';
    const parameters =
      target === 'interface' ? [tenantId, interfaceId, routerId] : [tenantId, routerId];
    const rows = (await dataSource!.query(
      `SELECT status FROM "${SCHEMA}".${table} WHERE tenant_id = $1 AND ${idColumn}`,
      parameters,
    )) as Array<{ status: string }>;
    if (!rows[0]) throw new Error(`No se encontró el estado sintético de ${target}.`);
    return rows[0].status;
  }

  async function assertDeactivationRace(
    target: 'interface' | 'router',
    deactivationFirst: boolean,
    cidr: string,
    host: string,
  ): Promise<void> {
    const networkId = await createNetwork(cidr, interfaceId);
    const provisioningId = await createProvisioning(networkId);
    const lock = await holdAdvisoryLock(dataSource!, SCHEMA, `ipv4:${networkId}`);
    let deactivation: Promise<{ version: number }> | undefined;
    let reservation: Promise<string> | undefined;
    const changeStatus = target === 'interface' ? setInterfaceStatus : setRouterStatus;
    try {
      if (deactivationFirst) {
        deactivation = changeStatus('INACTIVE');
        await waitForAdvisoryWait(dataSource!, `ipv4:${networkId}`);
        reservation = reserve(networkId, provisioningId, host);
        await waitForAdvisoryWait(dataSource!, `ipv4:${networkId}`, 2);
      } else {
        reservation = reserve(networkId, provisioningId, host);
        await waitForAdvisoryWait(dataSource!, `ipv4:${networkId}`);
        deactivation = changeStatus('INACTIVE');
        await waitForAdvisoryWait(dataSource!, `ipv4:${networkId}`, 2);
      }

      await lock.release();
      if (deactivationFirst) {
        await expect(deactivation).resolves.toMatchObject({ status: 'INACTIVE' });
        await expect(reservation).rejects.toMatchObject({
          response: { code: 'NETWORK_NOT_IN_ROUTER' },
        });
        expect(await liveAssignments(networkId)).toEqual([]);
      } else {
        await expect(reservation).resolves.toBe(host);
        await expect(deactivation).resolves.toMatchObject({ status: 'INACTIVE' });
        expect(await liveAssignments(networkId)).toEqual([{ ip: host, status: 'RESERVED' }]);
      }
      expect(await catalogStatus(target)).toBe('INACTIVE');
      await assertTenantWideI1();
    } finally {
      await lock.release();
      await Promise.allSettled([deactivation, reservation].filter(Boolean) as Promise<unknown>[]);
      await releaseAssignments(networkId);
      await restoreCatalogStatuses();
    }
  }

  async function assertNetworkDeactivationRace(
    deactivationFirst: boolean,
    cidr: string,
    host: string,
  ): Promise<void> {
    const networkId = await createNetwork(cidr);
    const provisioningId = await createProvisioning(networkId);
    const lock = await holdAdvisoryLock(dataSource!, SCHEMA, `ipv4:${networkId}`);
    let deactivation: Promise<{ version: number }> | undefined;
    let reservation: Promise<string> | undefined;
    try {
      if (deactivationFirst) {
        deactivation = setNetworkStatus(networkId, 'INACTIVE');
        await waitForAdvisoryWait(dataSource!, `ipv4:${networkId}`);
        reservation = reserve(networkId, provisioningId, host);
        await waitForAdvisoryWait(dataSource!, `ipv4:${networkId}`, 2);
      } else {
        reservation = reserve(networkId, provisioningId, host);
        await waitForAdvisoryWait(dataSource!, `ipv4:${networkId}`);
        deactivation = setNetworkStatus(networkId, 'INACTIVE');
        await waitForAdvisoryWait(dataSource!, `ipv4:${networkId}`, 2);
      }

      await lock.release();
      if (deactivationFirst) {
        await expect(deactivation).resolves.toMatchObject({ status: 'INACTIVE' });
        await expect(reservation).rejects.toMatchObject({
          response: { code: 'NETWORK_NOT_IN_ROUTER' },
        });
        expect(await liveAssignments(networkId)).toEqual([]);
      } else {
        await expect(reservation).resolves.toBe(host);
        await expect(deactivation).resolves.toMatchObject({ status: 'INACTIVE' });
        expect(await liveAssignments(networkId)).toEqual([{ ip: host, status: 'RESERVED' }]);
      }
      expect(await networkStatus(networkId)).toBe('INACTIVE');
      await assertTenantWideI1();
    } finally {
      await lock.release();
      await Promise.allSettled([deactivation, reservation].filter(Boolean) as Promise<unknown>[]);
      await releaseAssignments(networkId);
      if ((await networkStatus(networkId)) !== 'ACTIVE') {
        await setNetworkStatus(networkId, 'ACTIVE');
      }
    }
  }

  async function assertPoolRouterDeactivationRace(
    deactivationFirst: boolean,
    cidr: string,
  ): Promise<void> {
    const held = await holdAdvisoryLock(dataSource!, SCHEMA, `ipv4-catalog:${tenantId}`);
    let deactivation: Promise<{ version: number }> | undefined;
    let poolCreation: Promise<string> | undefined;
    let networkId: string | undefined;
    try {
      if (deactivationFirst) {
        deactivation = setRouterStatus('INACTIVE');
        await waitForAdvisoryWait(dataSource!, `ipv4-catalog:${tenantId}`);
        poolCreation = createNetwork(cidr);
        await waitForAdvisoryWait(dataSource!, `ipv4-catalog:${tenantId}`, 2);
      } else {
        poolCreation = createNetwork(cidr);
        await waitForAdvisoryWait(dataSource!, `ipv4-catalog:${tenantId}`);
        deactivation = setRouterStatus('INACTIVE');
        await waitForAdvisoryWait(dataSource!, `ipv4-catalog:${tenantId}`, 2);
      }

      await held.release();
      if (deactivationFirst) {
        await expect(deactivation).resolves.toMatchObject({ status: 'INACTIVE' });
        await expect(poolCreation).rejects.toMatchObject({
          response: { code: 'RESOURCE_NOT_FOUND' },
        });
        const rows = (await dataSource!.query(
          `SELECT COUNT(*)::int AS total FROM "${SCHEMA}".ipv4_networks
            WHERE tenant_id = $1 AND cidr = $2::cidr`,
          [tenantId, cidr],
        )) as Array<{ total: number }>;
        expect(rows[0]?.total).toBe(0);
      } else {
        networkId = await poolCreation;
        await expect(deactivation).resolves.toMatchObject({ status: 'INACTIVE' });
        expect(await networkStatus(networkId)).toBe('ACTIVE');
        const provisioningId = await createProvisioning(networkId);
        await expect(
          reserve(networkId, provisioningId, `${cidr.replace(/0\/24$/u, '')}10`),
        ).rejects.toMatchObject({
          response: { code: 'NETWORK_NOT_IN_ROUTER' },
        });
        expect(await liveAssignments(networkId)).toEqual([]);
      }
      expect(await catalogStatus('router')).toBe('INACTIVE');
      await assertTenantWideI1();
    } finally {
      await held.release();
      await Promise.allSettled([deactivation, poolCreation].filter(Boolean) as Promise<unknown>[]);
      if (networkId) await releaseAssignments(networkId);
      if ((await catalogStatus('router')) !== 'ACTIVE') await setRouterStatus('ACTIVE');
    }
  }

  async function assertInterfaceAssociationRace(
    patchFirst: boolean,
    association: boolean,
    cidr: string,
    host: string,
  ): Promise<void> {
    const initialInterfaceId = association ? null : interfaceId;
    const nextInterfaceId = association ? interfaceId : null;
    const networkId = await createNetwork(cidr, initialInterfaceId ?? undefined);
    const provisioningId = await createProvisioning(networkId);
    const lock = await holdAdvisoryLock(dataSource!, SCHEMA, `ipv4:${networkId}`);
    let patch: Promise<{ version: number; interfaceId: string | null }> | undefined;
    let reservation: Promise<string> | undefined;
    try {
      if (patchFirst) {
        patch = patchNetworkInterface(networkId, nextInterfaceId);
        await waitForAdvisoryWait(dataSource!, `ipv4:${networkId}`);
        reservation = reserve(networkId, provisioningId, host);
        await waitForAdvisoryWait(dataSource!, `ipv4:${networkId}`, 2);
      } else {
        reservation = reserve(networkId, provisioningId, host);
        await waitForAdvisoryWait(dataSource!, `ipv4:${networkId}`);
        patch = patchNetworkInterface(networkId, nextInterfaceId);
        await waitForAdvisoryWait(dataSource!, `ipv4:${networkId}`, 2);
      }

      await lock.release();
      await expect(reservation).resolves.toBe(host);
      await expect(patch).resolves.toMatchObject({ interfaceId: nextInterfaceId });
      expect(await networkInterfaceId(networkId)).toBe(nextInterfaceId);
      expect(await liveAssignments(networkId)).toEqual([{ ip: host, status: 'RESERVED' }]);
      await assertTenantWideI1();
    } finally {
      await lock.release();
      await Promise.allSettled([patch, reservation].filter(Boolean) as Promise<unknown>[]);
      await releaseAssignments(networkId);
      await patchNetworkInterface(networkId, initialInterfaceId);
    }
  }

  async function assertCorrectionPoolRace(
    poolFirst: boolean,
    cidr: string,
    previousHost: string,
    targetHost: string,
  ): Promise<void> {
    const previousService = interfaceService;
    interfaceService = interfaceServiceWithProtection('ACTIVE');
    const localAddress = await createAddress(previousHost);
    const held = await holdAdvisoryLock(dataSource!, SCHEMA, `ipv4-catalog:${tenantId}`);
    let poolCreation: Promise<string> | undefined;
    let correction: Promise<unknown> | undefined;
    let networkId: string | undefined;
    try {
      if (poolFirst) {
        poolCreation = createNetwork(cidr);
        await waitForAdvisoryWait(dataSource!, `ipv4-catalog:${tenantId}`);
        correction = correctAddress(localAddress.id, targetHost);
        await waitForAdvisoryWait(dataSource!, `ipv4-catalog:${tenantId}`, 2);
      } else {
        correction = correctAddress(localAddress.id, targetHost);
        await waitForAdvisoryWait(dataSource!, `ipv4-catalog:${tenantId}`);
        poolCreation = createNetwork(cidr);
        await waitForAdvisoryWait(dataSource!, `ipv4-catalog:${tenantId}`, 2);
      }

      await held.release();
      if (poolFirst) {
        networkId = await poolCreation;
        await expect(correction).resolves.toMatchObject({ releasedHost: previousHost });
      } else {
        await expect(correction).resolves.toMatchObject({ releasedHost: previousHost });
        networkId = await poolCreation;
      }

      const localRows = (await dataSource!.query(
        `SELECT host(host_address) AS host
           FROM "${SCHEMA}".network_router_interface_ipv4_addresses
          WHERE tenant_id = $1 AND id = $2`,
        [tenantId, localAddress.id],
      )) as Array<{ host: string }>;
      expect(localRows).toEqual([{ host: targetHost }]);
      const provisioningId = await createProvisioning(networkId);
      await expect(reserve(networkId, provisioningId, targetHost)).rejects.toMatchObject({
        response: { code: 'IP_PROTECTED_BY_INFRASTRUCTURE' },
      });
      await assertTenantWideI1();
    } finally {
      await held.release();
      await Promise.allSettled([poolCreation, correction].filter(Boolean) as Promise<unknown>[]);
      if (networkId) await releaseAssignments(networkId);
      await deleteLocalAddress(localAddress.id);
      interfaceService = previousService;
    }
  }

  async function assertPendingCaptureReserveRace(
    reserveFirst: boolean,
    cidr: string,
    host: string,
  ): Promise<void> {
    const previousService = interfaceService;
    interfaceService = interfaceServiceWithProtection('PENDING');
    const networkId = await createNetwork(cidr);
    const provisioningId = await createProvisioning(networkId);
    const held = await holdAdvisoryLock(dataSource!, SCHEMA, `ipv4:${networkId}`);
    let reservation: Promise<string> | undefined;
    let addressAttempt: Promise<{ id: string; host: string }> | undefined;
    try {
      if (reserveFirst) {
        reservation = reserve(networkId, provisioningId, host);
        await waitForAdvisoryWait(dataSource!, `ipv4:${networkId}`);
        addressAttempt = createAddress(host);
        await waitForAdvisoryWait(dataSource!, `ipv4:${networkId}`, 2);
      } else {
        addressAttempt = createAddress(host);
        await waitForAdvisoryWait(dataSource!, `ipv4:${networkId}`);
        reservation = reserve(networkId, provisioningId, host);
        await waitForAdvisoryWait(dataSource!, `ipv4:${networkId}`, 2);
      }

      await held.release();
      if (reserveFirst) {
        await expect(reservation).resolves.toBe(host);
        await expect(addressAttempt).rejects.toMatchObject({ response: { code: 'IP_IN_USE' } });
        expect(await liveAssignments(networkId)).toEqual([{ ip: host, status: 'RESERVED' }]);
      } else {
        await expect(addressAttempt).rejects.toMatchObject({
          response: { code: 'IP_PROTECTION_PENDING' },
        });
        await expect(reservation).resolves.toBe(host);
        expect(await liveAssignments(networkId)).toEqual([{ ip: host, status: 'RESERVED' }]);
      }

      const rows = (await dataSource!.query(
        `SELECT COUNT(*)::int AS total
           FROM "${SCHEMA}".network_router_interface_ipv4_addresses
          WHERE tenant_id = $1 AND host_address = set_masklen($2::inet, 32)`,
        [tenantId, host],
      )) as Array<{ total: number }>;
      expect(rows[0]?.total).toBe(0);
      await assertTenantWideI1();
    } finally {
      await held.release();
      await Promise.allSettled([reservation, addressAttempt].filter(Boolean) as Promise<unknown>[]);
      await releaseAssignments(networkId);
      interfaceService = previousService;
    }
  }

  async function assertPatchReservationRace(
    reservationFirst: boolean,
    cidr: string,
    targetHost: string,
  ): Promise<void> {
    const networkId = await createNetwork(cidr);
    const provisioningId = await createProvisioning(networkId);
    const addressPrefix = cidr.replace(/0\/24$/u, '');
    const originalAssignableTo = `${addressPrefix}30`;
    const patchedAssignableTo = `${addressPrefix}20`;
    const held = await holdAdvisoryLock(dataSource!, SCHEMA, `ipv4:${networkId}`);
    let reservation: Promise<string> | undefined;
    let patch: Promise<{ version: number }> | undefined;
    try {
      if (reservationFirst) {
        reservation = reserve(networkId, provisioningId, targetHost);
        await waitForAdvisoryWait(dataSource!, `ipv4:${networkId}`);
        patch = patchAssignableTo(networkId, patchedAssignableTo);
        await waitForAdvisoryWait(dataSource!, `ipv4:${networkId}`, 2);
      } else {
        patch = patchAssignableTo(networkId, patchedAssignableTo);
        await waitForAdvisoryWait(dataSource!, `ipv4:${networkId}`);
        reservation = reserve(networkId, provisioningId, targetHost);
        await waitForAdvisoryWait(dataSource!, `ipv4:${networkId}`, 2);
      }

      await held.release();
      if (reservationFirst) {
        await expect(reservation).resolves.toBe(targetHost);
        await expect(patch).rejects.toMatchObject({ response: { code: 'IP_IN_USE' } });
        expect(await liveAssignments(networkId)).toEqual([{ ip: targetHost, status: 'RESERVED' }]);
      } else {
        await expect(patch).resolves.toMatchObject({ version: 2 });
        await expect(reservation).rejects.toMatchObject({
          response: { code: 'IP_OUTSIDE_RANGE' },
        });
        expect(await liveAssignments(networkId)).toEqual([]);
      }

      const rows = (await dataSource!.query(
        `SELECT host(assignable_to) AS host FROM "${SCHEMA}".ipv4_networks
          WHERE tenant_id = $1 AND id = $2`,
        [tenantId, networkId],
      )) as Array<{ host: string }>;
      expect(rows[0]?.host).toBe(reservationFirst ? originalAssignableTo : patchedAssignableTo);
      await assertTenantWideI1();
    } finally {
      await held.release();
      await Promise.allSettled([reservation, patch].filter(Boolean) as Promise<unknown>[]);
      await releaseAssignments(networkId);
      await patchAssignableTo(networkId, originalAssignableTo);
    }
  }

  async function assertFullReservePatchRace(
    patchFirst: boolean,
    cidr: string,
    requestedIp: string,
  ): Promise<void> {
    const networkId = await createNetwork(cidr);
    const executionOrderId = randomUUID();
    const { service } = createProvisioningService(syntheticSnapshot(executionOrderId));
    const poolLock = `ipv4:${networkId}`;
    const externalLockName = patchFirst
      ? `provisioning-order:${executionOrderId}`
      : `ipv4-catalog:${tenantId}`;
    const heldPool = await holdAdvisoryLock(dataSource!, SCHEMA, poolLock);
    const heldExternal = await holdAdvisoryLock(dataSource!, SCHEMA, externalLockName);
    let reservation: ReturnType<typeof service.reserve> | undefined;
    let patch: Promise<{ version: number }> | undefined;
    try {
      if (patchFirst) {
        reservation = run(() =>
          service.reserve(reserveBody(networkId, executionOrderId, requestedIp), syntheticActor()),
        );
        await waitForAdvisoryWait(dataSource!, externalLockName);
        patch = patchAssignableTo(
          networkId,
          `${cidr.split('.')[0]}.${cidr.split('.')[1]}.${cidr.split('.')[2]}.20`,
        );
        await waitForAdvisoryWait(dataSource!, poolLock);
      } else {
        patch = patchAssignableTo(
          networkId,
          `${cidr.split('.')[0]}.${cidr.split('.')[1]}.${cidr.split('.')[2]}.20`,
        );
        await waitForAdvisoryWait(dataSource!, externalLockName);
        reservation = run(() =>
          service.reserve(reserveBody(networkId, executionOrderId, requestedIp), syntheticActor()),
        );
        await waitForAdvisoryWait(dataSource!, poolLock);
      }

      expect(await provisioningRowCount(executionOrderId)).toBe(0);
      if (patchFirst) {
        await heldPool.release();
        await expect(patch).resolves.toMatchObject({ version: 2 });
        await heldExternal.release();
        await expect(reservation).rejects.toMatchObject({
          response: { code: 'IP_OUTSIDE_RANGE' },
        });
        expect(await provisioningRowCount(executionOrderId)).toBe(0);
        expect(await liveAssignments(networkId)).toEqual([]);
      } else {
        await heldPool.release();
        const result = await reservation;
        expect(result).toMatchObject({ status: 'RESERVED', ip: requestedIp });
        await heldExternal.release();
        await expect(patch).rejects.toMatchObject({ response: { code: 'IP_IN_USE' } });
        expect(await provisioningRowCount(executionOrderId)).toBe(1);
        expect(await assignmentStatus(result.id)).toBe('RESERVED');
        expect(await liveAssignments(networkId)).toEqual([{ ip: requestedIp, status: 'RESERVED' }]);
      }
      await assertTenantWideI1();
    } finally {
      await heldPool.release();
      await heldExternal.release();
      await Promise.allSettled([reservation, patch].filter(Boolean) as Promise<unknown>[]);
      await releaseAssignments(networkId);
      await patchAssignableTo(
        networkId,
        `${cidr.split('.')[0]}.${cidr.split('.')[1]}.${cidr.split('.')[2]}.30`,
      );
    }
  }

  async function assertReplayDeactivationRace(
    target: 'network' | 'router' | 'interface',
    deactivationFirst: boolean,
    cidr: string,
    host: string,
  ): Promise<void> {
    const networkId = await createNetwork(cidr, target === 'interface' ? interfaceId : undefined);
    const executionOrderId = randomUUID();
    const provisioningId = await createFlowProvisioning(
      networkId,
      executionOrderId,
      host,
      'RESERVED',
    );
    const { service, routerProvisioningPort } = createProvisioningService(
      syntheticSnapshot(executionOrderId),
    );
    const poolLock = `ipv4:${networkId}`;
    const held = await holdAdvisoryLock(dataSource!, SCHEMA, poolLock);
    let deactivation: Promise<unknown> | undefined;
    let replay: ReturnType<typeof service.reserve> | undefined;
    const deactivate = async (): Promise<unknown> => {
      if (target === 'network') return setNetworkStatus(networkId, 'INACTIVE');
      if (target === 'router') return setRouterStatus('INACTIVE');
      return setInterfaceStatus('INACTIVE');
    };
    try {
      if (deactivationFirst) {
        deactivation = deactivate();
        await waitForAdvisoryWait(dataSource!, poolLock);
        replay = run(() =>
          service.reserve(reserveBody(networkId, executionOrderId), syntheticActor()),
        );
        await waitForAdvisoryWait(dataSource!, poolLock, 2);
      } else {
        replay = run(() =>
          service.reserve(reserveBody(networkId, executionOrderId), syntheticActor()),
        );
        await waitForAdvisoryWait(dataSource!, poolLock);
        deactivation = deactivate();
        await waitForAdvisoryWait(dataSource!, poolLock, 2);
      }

      await held.release();
      if (deactivationFirst) {
        await expect(deactivation).resolves.toBeDefined();
        await expect(replay).rejects.toMatchObject({
          response: {
            code:
              target === 'interface' ? 'NETWORK_NOT_IN_ROUTER' : 'PROVISIONING_ORDER_NOT_ELIGIBLE',
          },
        });
        expect(routerProvisioningPort.apply).not.toHaveBeenCalled();
      } else {
        await expect(replay).resolves.toMatchObject({ id: provisioningId, status: 'RESERVED' });
        await expect(deactivation).resolves.toBeDefined();
        expect(routerProvisioningPort.apply).toHaveBeenCalledTimes(1);
      }
      expect(await assignmentStatus(provisioningId)).toBe('RESERVED');
      expect(await catalogStatus(target === 'network' ? 'router' : target)).toBe(
        target === 'network' ? 'ACTIVE' : 'INACTIVE',
      );
      if (target === 'network') expect(await networkStatus(networkId)).toBe('INACTIVE');
      await assertTenantWideI1();
    } finally {
      await held.release();
      await Promise.allSettled([replay, deactivation].filter(Boolean) as Promise<unknown>[]);
      await releaseAssignments(networkId);
      if (target === 'network' && (await networkStatus(networkId)) !== 'ACTIVE') {
        await setNetworkStatus(networkId, 'ACTIVE');
      }
      await restoreCatalogStatuses();
    }
  }

  async function assertFullReserveDeactivationRace(
    target: 'network' | 'router' | 'interface',
    deactivationFirst: boolean,
    cidr: string,
    host: string,
  ): Promise<void> {
    const networkId = await createNetwork(cidr, target === 'interface' ? interfaceId : undefined);
    const executionOrderId = randomUUID();
    const { service, routerProvisioningPort } = createProvisioningService(
      syntheticSnapshot(executionOrderId),
    );
    const poolLock = `ipv4:${networkId}`;
    const held = await holdAdvisoryLock(dataSource!, SCHEMA, poolLock);
    let deactivation: Promise<unknown> | undefined;
    let reservation: ReturnType<typeof service.reserve> | undefined;
    const deactivate = async (): Promise<unknown> => {
      if (target === 'network') return setNetworkStatus(networkId, 'INACTIVE');
      if (target === 'router') return setRouterStatus('INACTIVE');
      return setInterfaceStatus('INACTIVE');
    };
    const reserve = () =>
      run(() => service.reserve(reserveBody(networkId, executionOrderId, host), syntheticActor()));
    try {
      if (deactivationFirst) {
        deactivation = deactivate();
        await waitForAdvisoryWait(dataSource!, poolLock);
        reservation = reserve();
        await waitForAdvisoryWait(dataSource!, poolLock, 2);
      } else {
        reservation = reserve();
        await waitForAdvisoryWait(dataSource!, poolLock);
        deactivation = deactivate();
        await waitForAdvisoryWait(dataSource!, poolLock, 2);
      }

      await held.release();
      if (deactivationFirst) {
        await expect(deactivation).resolves.toBeDefined();
        await expect(reservation).rejects.toMatchObject({
          response: {
            code:
              target === 'interface' ? 'NETWORK_NOT_IN_ROUTER' : 'PROVISIONING_ORDER_NOT_ELIGIBLE',
          },
        });
        expect(await provisioningRowCount(executionOrderId)).toBe(0);
        expect(await assertAssignmentCount(networkId)).toBe(0);
        expect(routerProvisioningPort.apply).not.toHaveBeenCalled();
        expect(await liveAssignments(networkId)).toEqual([]);
      } else {
        const result = await reservation;
        expect(result).toMatchObject({ status: 'RESERVED', ip: host });
        await expect(deactivation).resolves.toBeDefined();
        expect(await provisioningRowCount(executionOrderId)).toBe(1);
        expect(await assignmentStatus(result.id)).toBe('RESERVED');
        expect(await liveAssignments(networkId)).toEqual([{ ip: host, status: 'RESERVED' }]);
        expect(routerProvisioningPort.apply).toHaveBeenCalledTimes(1);
      }
      if (target === 'network') expect(await networkStatus(networkId)).toBe('INACTIVE');
      else expect(await catalogStatus(target)).toBe('INACTIVE');
      await assertTenantWideI1();
    } finally {
      await held.release();
      await Promise.allSettled([reservation, deactivation].filter(Boolean) as Promise<unknown>[]);
      await releaseAssignments(networkId);
      if ((await networkStatus(networkId)) !== 'ACTIVE')
        await setNetworkStatus(networkId, 'ACTIVE');
      await restoreCatalogStatuses();
    }
  }

  async function prepareAssignmentWriter(
    kind: AssignmentWriterKind,
    networkId: string,
    executionOrderId: string,
    host: string,
  ): Promise<PreparedAssignmentWriter> {
    if (kind === 'reserve') {
      const { service } = createProvisioningService(syntheticSnapshot(executionOrderId));
      let createdId: string | undefined;
      return {
        expectedStatus: 'RESERVED',
        getProvisioningId: () => createdId,
        start: async () => {
          const result = await run(() =>
            service.reserve(reserveBody(networkId, executionOrderId), syntheticActor()),
          );
          createdId = result.id;
          return result;
        },
      };
    }

    if (kind === 'release') {
      const provisioningId = await createFlowProvisioning(networkId, executionOrderId, host);
      const { service } = createProvisioningService(syntheticSnapshot(executionOrderId));
      return {
        expectedStatus: 'RELEASED',
        getProvisioningId: () => provisioningId,
        start: () =>
          run(() =>
            service.release(
              provisioningId,
              { version: 1, reason: 'Liberación sintética en carrera H-5' },
              syntheticActor(),
            ),
          ),
      };
    }

    if (kind === 'regularize') {
      const order = syntheticSnapshot(executionOrderId, {
        status: ExecutionOrderStatus.COMPLETED,
        result: ExecutionOrderResult.EXECUTED,
      });
      const { service } = createProvisioningService(order);
      const body: RegularizeProvisioningBody = {
        executionOrderId,
        routerId,
        ipv4NetworkId: networkId,
        controlParams: { method: 'SIMPLE_QUEUE_STATIC_IP', queueName: 'mod13-races' },
        reason: 'Regularización sintética en carrera H-5',
      };
      let createdId: string | undefined;
      return {
        expectedStatus: 'ACTIVE',
        getProvisioningId: () => createdId,
        start: async () => {
          const result = await run(() => service.regularize(body, syntheticActor()));
          createdId = result.id;
          return result;
        },
      };
    }

    const provisioningId = await createFlowProvisioning(networkId, executionOrderId, host);
    const cancelledOrder = syntheticSnapshot(executionOrderId, {
      status: ExecutionOrderStatus.CANCELLED,
      result: ExecutionOrderResult.CANCELLED,
    });
    if (kind === 'consumer') {
      const processor = createEventProcessor(cancelledOrder);
      const event: NetworkExecutionEvent = {
        eventId: randomUUID(),
        eventType: 'ExecutionOrderCancelledV1',
        executionOrderId,
        aggregateVersion: 2,
        result: null,
        occurredAt: new Date().toISOString(),
      };
      const signed = await signEvent(event);
      return {
        expectedStatus: 'RELEASED',
        getProvisioningId: () => provisioningId,
        start: () => processor.process({ data: signed } as Job<unknown>),
      };
    }

    const processor = createReconciler(cancelledOrder);
    return {
      expectedStatus: 'RELEASED',
      getProvisioningId: () => provisioningId,
      start: () =>
        processor.process({
          name: NETWORK_PROVISIONING_RECONCILE_JOB,
          data: { tenantId, tenantSlug: TENANT_SLUG, schemaName: SCHEMA },
        } as Job<unknown>),
    };
  }

  async function assertAssignmentWriterRace(
    firstKind: AssignmentWriterKind,
    secondKind: AssignmentWriterKind,
    cidr: string,
  ): Promise<void> {
    const networkId = await createNetwork(cidr);
    const firstOrderId = randomUUID();
    const secondOrderId = randomUUID();
    const networkPrefix = cidr.slice(0, cidr.lastIndexOf('.'));
    const firstHost = `${networkPrefix}.10`;
    const secondHost = `${networkPrefix}.11`;
    const first = await prepareAssignmentWriter(firstKind, networkId, firstOrderId, firstHost);
    const second = await prepareAssignmentWriter(secondKind, networkId, secondOrderId, secondHost);
    const poolLock = `ipv4:${networkId}`;
    const held = await holdAdvisoryLock(dataSource!, SCHEMA, poolLock);
    let firstWrite: Promise<unknown> | undefined;
    let secondWrite: Promise<unknown> | undefined;
    try {
      firstWrite = first.start();
      await waitForAdvisoryWait(dataSource!, poolLock);
      secondWrite = second.start();
      await waitForAdvisoryWait(dataSource!, poolLock, 2);
      for (const writer of [first, second]) {
        const provisioningId = writer.getProvisioningId();
        if (provisioningId) {
          await expect(assertProvisioningRowLockAvailable(provisioningId)).resolves.toBeUndefined();
        }
      }
      await held.release();
      const [firstResult, secondResult] = await Promise.all([firstWrite, secondWrite]);
      const firstId = first.getProvisioningId() ?? (firstResult as { id?: string }).id;
      const secondId = second.getProvisioningId() ?? (secondResult as { id?: string }).id;
      if (!firstId || !secondId) throw new Error('El writer no produjo una fila de servicio.');
      expect(await assignmentStatus(firstId)).toBe(first.expectedStatus);
      expect(await assertProvisioningStatus(firstId)).toBe(first.expectedStatus);
      expect(await assignmentStatus(secondId)).toBe(second.expectedStatus);
      expect(await assertProvisioningStatus(secondId)).toBe(second.expectedStatus);
      expect(await assertAssignmentCount(networkId)).toBe(2);
      expect(
        (await liveAssignments(networkId)).map((assignment) => assignment.status).sort(),
      ).toEqual(
        [first.expectedStatus, second.expectedStatus]
          .filter((status) => status !== 'RELEASED')
          .sort(),
      );
      await assertTenantWideI1();
    } finally {
      await held.release();
      await Promise.allSettled([firstWrite, secondWrite].filter(Boolean) as Promise<unknown>[]);
      await releaseAssignments(networkId);
    }
  }

  async function assertProvisioningStatus(provisioningId: string): Promise<string | null> {
    const rows = (await dataSource!.query(
      `SELECT status FROM "${SCHEMA}".service_provisionings
        WHERE tenant_id = $1 AND id = $2`,
      [tenantId, provisioningId],
    )) as Array<{ status: string }>;
    return rows[0]?.status ?? null;
  }

  async function assertProvisioningRowLockAvailable(provisioningId: string): Promise<void> {
    const runner = dataSource!.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    try {
      await runner.query(`SET LOCAL search_path TO "${SCHEMA}"`);
      const rows = (await runner.query(
        `SELECT id FROM service_provisionings
          WHERE tenant_id = $1 AND id = $2
          FOR UPDATE NOWAIT`,
        [tenantId, provisioningId],
      )) as Array<{ id: string }>;
      expect(rows).toHaveLength(1);
    } finally {
      await runner.rollbackTransaction();
      await runner.release();
    }
  }

  async function assertFlowReleaseWaitsForPoolLock(): Promise<void> {
    const networkId = await createNetwork('10.85.0.0/24');
    const executionOrderId = randomUUID();
    const provisioningId = await createFlowProvisioning(networkId, executionOrderId, '10.85.0.10');
    const { service } = createProvisioningService(syntheticSnapshot(executionOrderId));
    const held = await holdAdvisoryLock(dataSource!, SCHEMA, `ipv4:${networkId}`);
    let release: ReturnType<typeof service.release> | undefined;
    try {
      release = run(() =>
        service.release(
          provisioningId,
          { version: 1, reason: 'Prueba sintética de liberación' },
          syntheticActor(),
        ),
      );
      await waitForAdvisoryWait(dataSource!, `ipv4:${networkId}`);
      expect(await assignmentStatus(provisioningId)).toBe('RESERVED');
      expect(await assertProvisioningStatus(provisioningId)).toBe('RESERVED');
      await held.release();
      await expect(release).resolves.toMatchObject({ status: 'RELEASED' });
      expect(await assignmentStatus(provisioningId)).toBe('RELEASED');
      expect(await assertProvisioningStatus(provisioningId)).toBe('RELEASED');
      await assertTenantWideI1();
    } finally {
      await held.release();
      await Promise.allSettled([release].filter(Boolean) as Promise<unknown>[]);
      await releaseAssignments(networkId);
    }
  }

  async function assertRegularizeWaitsForPoolLock(): Promise<void> {
    const networkId = await createNetwork('10.86.0.0/24');
    const executionOrderId = randomUUID();
    const order = syntheticSnapshot(executionOrderId, {
      status: ExecutionOrderStatus.COMPLETED,
      result: ExecutionOrderResult.EXECUTED,
    });
    const { service } = createProvisioningService(order);
    const body: RegularizeProvisioningBody = {
      executionOrderId,
      routerId,
      ipv4NetworkId: networkId,
      controlParams: { method: 'SIMPLE_QUEUE_STATIC_IP', queueName: 'mod13-races' },
      reason: 'Regularización sintética de una orden ejecutada',
    };
    const held = await holdAdvisoryLock(dataSource!, SCHEMA, `ipv4:${networkId}`);
    let regularization: ReturnType<typeof service.regularize> | undefined;
    try {
      regularization = run(() => service.regularize(body, syntheticActor()));
      await waitForAdvisoryWait(dataSource!, `ipv4:${networkId}`);
      expect(await provisioningRowCount(executionOrderId)).toBe(0);
      expect(await assertAssignmentCount(networkId)).toBe(0);
      await held.release();
      const result = await regularization;
      expect(result).toMatchObject({ status: 'ACTIVE', ip: '10.86.0.10' });
      expect(await provisioningRowCount(executionOrderId)).toBe(1);
      expect(await assignmentStatus(result.id)).toBe('ACTIVE');
      await assertTenantWideI1();
    } finally {
      await held.release();
      await Promise.allSettled([regularization].filter(Boolean) as Promise<unknown>[]);
      await releaseAssignments(networkId);
    }
  }

  async function assertConsumerReleaseWaitsForPoolLock(): Promise<void> {
    const networkId = await createNetwork('10.87.0.0/24');
    const executionOrderId = randomUUID();
    const provisioningId = await createFlowProvisioning(networkId, executionOrderId, '10.87.0.10');
    const order = syntheticSnapshot(executionOrderId, {
      status: ExecutionOrderStatus.CANCELLED,
      result: ExecutionOrderResult.CANCELLED,
    });
    const processor = createEventProcessor(order);
    const event: NetworkExecutionEvent = {
      eventId: randomUUID(),
      eventType: 'ExecutionOrderCancelledV1',
      executionOrderId,
      aggregateVersion: 2,
      result: null,
      occurredAt: new Date().toISOString(),
    };
    const held = await holdAdvisoryLock(dataSource!, SCHEMA, `ipv4:${networkId}`);
    let processing: Promise<void> | undefined;
    try {
      processing = processor.process({ data: await signEvent(event) } as Job<unknown>);
      await waitForAdvisoryWait(dataSource!, `ipv4:${networkId}`);
      await expect(assertProvisioningRowLockAvailable(provisioningId)).resolves.toBeUndefined();
      expect(await assignmentStatus(provisioningId)).toBe('RESERVED');
      expect(await assertProvisioningStatus(provisioningId)).toBe('RESERVED');
      await held.release();
      await expect(processing).resolves.toBeUndefined();
      expect(await assignmentStatus(provisioningId)).toBe('RELEASED');
      expect(await assertProvisioningStatus(provisioningId)).toBe('RELEASED');
      await assertTenantWideI1();
    } finally {
      await held.release();
      await Promise.allSettled([processing].filter(Boolean) as Promise<unknown>[]);
      await releaseAssignments(networkId);
    }
  }

  async function assertConsumerActivationWaitsForPoolLock(): Promise<void> {
    const networkId = await createNetwork('10.98.0.0/24');
    const executionOrderId = randomUUID();
    const provisioningId = await createFlowProvisioning(
      networkId,
      executionOrderId,
      '10.98.0.10',
      'CERTIFIED',
    );
    const order = syntheticSnapshot(executionOrderId, {
      status: ExecutionOrderStatus.COMPLETED,
      result: ExecutionOrderResult.EXECUTED,
    });
    const processor = createEventProcessor(order);
    const event: NetworkExecutionEvent = {
      eventId: randomUUID(),
      eventType: 'ExecutionOrderClosedV1',
      executionOrderId,
      aggregateVersion: 2,
      result: ExecutionOrderResult.EXECUTED,
      occurredAt: new Date().toISOString(),
    };
    const held = await holdAdvisoryLock(dataSource!, SCHEMA, `ipv4:${networkId}`);
    let processing: Promise<void> | undefined;
    try {
      processing = processor.process({ data: await signEvent(event) } as Job<unknown>);
      await waitForAdvisoryWait(dataSource!, `ipv4:${networkId}`);
      await expect(assertProvisioningRowLockAvailable(provisioningId)).resolves.toBeUndefined();
      expect(await assignmentStatus(provisioningId)).toBe('RESERVED');
      expect(await assertProvisioningStatus(provisioningId)).toBe('CERTIFIED');
      await held.release();
      await expect(processing).resolves.toBeUndefined();
      expect(await assignmentStatus(provisioningId)).toBe('ACTIVE');
      expect(await assertProvisioningStatus(provisioningId)).toBe('ACTIVE');
      await assertTenantWideI1();
    } finally {
      await held.release();
      await Promise.allSettled([processing].filter(Boolean) as Promise<unknown>[]);
      await releaseAssignments(networkId);
    }
  }

  async function assertReconcilerReleaseWaitsForPoolLock(): Promise<void> {
    const networkId = await createNetwork('10.88.0.0/24');
    const executionOrderId = randomUUID();
    const provisioningId = await createFlowProvisioning(networkId, executionOrderId, '10.88.0.10');
    const order = syntheticSnapshot(executionOrderId, {
      status: ExecutionOrderStatus.CANCELLED,
      result: ExecutionOrderResult.CANCELLED,
    });
    const processor = createReconciler(order);
    const held = await holdAdvisoryLock(dataSource!, SCHEMA, `ipv4:${networkId}`);
    let processing: Promise<void> | undefined;
    try {
      processing = processor.process({
        name: NETWORK_PROVISIONING_RECONCILE_JOB,
        data: { tenantId, tenantSlug: TENANT_SLUG, schemaName: SCHEMA },
      } as Job<unknown>);
      await waitForAdvisoryWait(dataSource!, `ipv4:${networkId}`);
      await expect(assertProvisioningRowLockAvailable(provisioningId)).resolves.toBeUndefined();
      expect(await assignmentStatus(provisioningId)).toBe('RESERVED');
      expect(await assertProvisioningStatus(provisioningId)).toBe('RESERVED');
      await held.release();
      await expect(processing).resolves.toBeUndefined();
      expect(await assignmentStatus(provisioningId)).toBe('RELEASED');
      expect(await assertProvisioningStatus(provisioningId)).toBe('RELEASED');
      await assertTenantWideI1();
    } finally {
      await held.release();
      await Promise.allSettled([processing].filter(Boolean) as Promise<unknown>[]);
      await releaseAssignments(networkId);
    }
  }

  async function assertReconcilerActivationWaitsForPoolLock(): Promise<void> {
    const networkId = await createNetwork('10.99.0.0/24');
    const executionOrderId = randomUUID();
    const provisioningId = await createFlowProvisioning(
      networkId,
      executionOrderId,
      '10.99.0.10',
      'CERTIFIED',
    );
    const order = syntheticSnapshot(executionOrderId, {
      status: ExecutionOrderStatus.COMPLETED,
      result: ExecutionOrderResult.EXECUTED,
    });
    const processor = createReconciler(order);
    const held = await holdAdvisoryLock(dataSource!, SCHEMA, `ipv4:${networkId}`);
    let processing: Promise<void> | undefined;
    try {
      processing = processor.process({
        name: NETWORK_PROVISIONING_RECONCILE_JOB,
        data: { tenantId, tenantSlug: TENANT_SLUG, schemaName: SCHEMA },
      } as Job<unknown>);
      await waitForAdvisoryWait(dataSource!, `ipv4:${networkId}`);
      await expect(assertProvisioningRowLockAvailable(provisioningId)).resolves.toBeUndefined();
      expect(await assignmentStatus(provisioningId)).toBe('RESERVED');
      expect(await assertProvisioningStatus(provisioningId)).toBe('CERTIFIED');
      await held.release();
      await expect(processing).resolves.toBeUndefined();
      expect(await assignmentStatus(provisioningId)).toBe('ACTIVE');
      expect(await assertProvisioningStatus(provisioningId)).toBe('ACTIVE');
      await assertTenantWideI1();
    } finally {
      await held.release();
      await Promise.allSettled([processing].filter(Boolean) as Promise<unknown>[]);
      await releaseAssignments(networkId);
    }
  }

  async function assertReleaseDeactivationRace(
    deactivationFirst: boolean,
    cidr: string,
    host: string,
  ): Promise<void> {
    const networkId = await createNetwork(cidr);
    const executionOrderId = randomUUID();
    const provisioningId = await createFlowProvisioning(networkId, executionOrderId, host);
    const { service } = createProvisioningService(syntheticSnapshot(executionOrderId));
    const poolLock = `ipv4:${networkId}`;
    const held = await holdAdvisoryLock(dataSource!, SCHEMA, poolLock);
    let deactivation: Promise<{ version: number }> | undefined;
    let release: ReturnType<typeof service.release> | undefined;
    try {
      if (deactivationFirst) {
        deactivation = setNetworkStatus(networkId, 'INACTIVE');
        await waitForAdvisoryWait(dataSource!, poolLock);
        release = run(() =>
          service.release(
            provisioningId,
            { version: 1, reason: 'Liberación sintética bajo inactivación' },
            syntheticActor(),
          ),
        );
        await waitForAdvisoryWait(dataSource!, poolLock, 2);
      } else {
        release = run(() =>
          service.release(
            provisioningId,
            { version: 1, reason: 'Liberación sintética bajo inactivación' },
            syntheticActor(),
          ),
        );
        await waitForAdvisoryWait(dataSource!, poolLock);
        deactivation = setNetworkStatus(networkId, 'INACTIVE');
        await waitForAdvisoryWait(dataSource!, poolLock, 2);
      }

      await held.release();
      if (deactivationFirst) {
        await expect(deactivation).resolves.toMatchObject({ status: 'INACTIVE' });
        await expect(release).rejects.toMatchObject({
          response: { code: 'PROVISIONING_ORDER_NOT_ELIGIBLE' },
        });
        expect(await assignmentStatus(provisioningId)).toBe('RESERVED');
      } else {
        await expect(release).resolves.toMatchObject({ status: 'RELEASED' });
        await expect(deactivation).resolves.toMatchObject({ status: 'INACTIVE' });
        expect(await assignmentStatus(provisioningId)).toBe('RELEASED');
      }
      expect(await networkStatus(networkId)).toBe('INACTIVE');
      await assertTenantWideI1();
    } finally {
      await held.release();
      await Promise.allSettled([deactivation, release].filter(Boolean) as Promise<unknown>[]);
      await releaseAssignments(networkId);
      if ((await networkStatus(networkId)) !== 'ACTIVE')
        await setNetworkStatus(networkId, 'ACTIVE');
    }
  }

  async function assertRegularizeDeactivationRace(
    regularizeFirst: boolean,
    cidr: string,
  ): Promise<void> {
    const networkId = await createNetwork(cidr);
    const executionOrderId = randomUUID();
    const closedOrder = syntheticSnapshot(executionOrderId, {
      status: ExecutionOrderStatus.COMPLETED,
      result: ExecutionOrderResult.EXECUTED,
    });
    const { service } = createProvisioningService(closedOrder);
    const body: RegularizeProvisioningBody = {
      executionOrderId,
      routerId,
      ipv4NetworkId: networkId,
      controlParams: { method: 'SIMPLE_QUEUE_STATIC_IP', queueName: 'mod13-races' },
      reason: 'Regularización sintética bajo inactivación',
    };
    const poolLock = `ipv4:${networkId}`;
    const held = await holdAdvisoryLock(dataSource!, SCHEMA, poolLock);
    let deactivation: Promise<{ version: number }> | undefined;
    let regularization: ReturnType<typeof service.regularize> | undefined;
    try {
      if (regularizeFirst) {
        regularization = run(() => service.regularize(body, syntheticActor()));
        await waitForAdvisoryWait(dataSource!, poolLock);
        deactivation = setNetworkStatus(networkId, 'INACTIVE');
        await waitForAdvisoryWait(dataSource!, poolLock, 2);
      } else {
        deactivation = setNetworkStatus(networkId, 'INACTIVE');
        await waitForAdvisoryWait(dataSource!, poolLock);
        regularization = run(() => service.regularize(body, syntheticActor()));
        await waitForAdvisoryWait(dataSource!, poolLock, 2);
      }

      await held.release();
      if (regularizeFirst) {
        const result = await regularization;
        expect(result).toMatchObject({
          status: 'ACTIVE',
          ip: `${cidr.slice(0, cidr.lastIndexOf('.'))}.10`,
        });
        await expect(deactivation).resolves.toMatchObject({ status: 'INACTIVE' });
        expect(await provisioningRowCount(executionOrderId)).toBe(1);
        expect(await assignmentStatus(result.id)).toBe('ACTIVE');
      } else {
        await expect(deactivation).resolves.toMatchObject({ status: 'INACTIVE' });
        await expect(regularization).rejects.toMatchObject({
          response: { code: 'PROVISIONING_ORDER_NOT_ELIGIBLE' },
        });
        expect(await provisioningRowCount(executionOrderId)).toBe(0);
        expect(await assertAssignmentCount(networkId)).toBe(0);
      }
      expect(await networkStatus(networkId)).toBe('INACTIVE');
      await assertTenantWideI1();
    } finally {
      await held.release();
      await Promise.allSettled(
        [deactivation, regularization].filter(Boolean) as Promise<unknown>[],
      );
      await releaseAssignments(networkId);
      if ((await networkStatus(networkId)) !== 'ACTIVE')
        await setNetworkStatus(networkId, 'ACTIVE');
    }
  }

  beforeAll(async () => {
    tenantId = randomUUID();
    actorId = randomUUID();
    dataSource = new DataSource({
      ...dataSourceOptions,
      entities: [
        NetworkRouter,
        Ipv4Network,
        IpAssignment,
        NetworkInboxEvent,
        NetworkRouterInterface,
        NetworkRouterInterfaceIpv4Address,
        ServiceProvisioning,
        Tenant,
      ],
      migrations: [],
      logging: false,
      extra: { ...dataSourceOptions.extra, max: 24, min: 1 },
    });
    await dataSource.initialize();

    const bootstrap = dataSource.createQueryRunner();
    await bootstrap.connect();
    try {
      await new EnableBtreeGist1784419216000().up(bootstrap);
      await bootstrap.query(`CREATE SCHEMA "${SCHEMA}"`);
    } finally {
      await bootstrap.release();
    }

    const runner = dataSource.createQueryRunner();
    await runner.connect();
    try {
      await runner.query(`SET search_path TO "${SCHEMA}"`);
      await new CreateNetworkCatalog1600000000000().up(runner);
      await new CreateNetworkProvisioning1610000000000().up(runner);
      await new CreateRouterInterfacesAndIpv4Addresses1650000000000().up(runner);
    } finally {
      await runner.release();
    }

    await dataSource.query(
      `INSERT INTO public.tenants (id, name, slug, schema_name, status, contact_email)
       VALUES ($1, 'MOD13 race fixture', $2, $3, 'ACTIVE', $4)`,
      [tenantId, TENANT_SLUG, SCHEMA, `${TENANT_SLUG}@example.invalid`],
    );
    publicTenantInserted = true;

    ipamService = new IpamService(dataSource);
    interfaceService = new NetworkInterfaceCatalogService(
      dataSource,
      audit,
      ipamService,
      authorization,
    );
    catalogService = new NetworkCatalogService(
      dataSource,
      audit,
      {} as NetworkActorReadPort,
      ipamService,
      authorization,
      {} as OrganizationSiteReadPort,
      {} as CommercialNodeReadPort,
    );

    const routerRows = (await dataSource.query(
      `INSERT INTO "${SCHEMA}".network_routers
         (tenant_id, name, management_host, supported_control_methods, created_by)
       VALUES ($1, 'Race router', '192.0.2.250', ARRAY['SIMPLE_QUEUE_STATIC_IP'], $2)
       RETURNING id`,
      [tenantId, actorId],
    )) as Array<{ id: string }>;
    routerId = routerRows[0]?.id ?? '';
    if (!routerId) throw new Error('No se pudo crear el router sintético.');
    const interfaceRows = (await dataSource.query(
      `INSERT INTO "${SCHEMA}".network_router_interfaces
         (tenant_id, router_id, name, kind, created_by)
       VALUES ($1, $2, 'ether1', 'PHYSICAL', $3) RETURNING id`,
      [tenantId, routerId, actorId],
    )) as Array<{ id: string }>;
    interfaceId = interfaceRows[0]?.id ?? '';
    if (!interfaceId) throw new Error('No se pudo crear la interfaz sintética.');
  });

  afterAll(async () => {
    if (!dataSource?.isInitialized) return;
    const cleanup = dataSource.createQueryRunner();
    try {
      if (publicTenantInserted) {
        await cleanup.query('DELETE FROM public.tenants WHERE id = $1', [tenantId]);
      }
      await cleanup.query(`DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE`);
    } finally {
      await cleanup.release();
      await dataSource.destroy();
    }
  });

  it('mantiene PENDING si no recibe configuración autorizada para capturar', async () => {
    await expect(createAddress('10.59.0.10')).rejects.toMatchObject({
      response: { code: 'IP_PROTECTION_PENDING' },
    });
    const rows = (await dataSource!.query(
      `SELECT COUNT(*)::int AS total FROM "${SCHEMA}".network_router_interface_ipv4_addresses`,
    )) as Array<{ total: number }>;
    expect(rows[0]?.total).toBe(0);
  });

  it('linealiza reserva primero: la captura ACTIVE posterior ve la asignación y falla', async () => {
    const networkId = await createNetwork('10.60.0.0/24');
    const provisioningId = await createProvisioning(networkId);
    const host = '10.60.0.10';
    const held = await holdAdvisoryLock(dataSource!, SCHEMA, `ipv4:${networkId}`);
    interfaceService = new NetworkInterfaceCatalogService(
      dataSource!,
      audit,
      ipamService,
      authorization,
      'ACTIVE',
    );
    let reservation: Promise<string> | undefined;
    let addressAttempt: Promise<unknown> | undefined;
    try {
      reservation = reserve(networkId, provisioningId, host);
      await waitForAdvisoryWait(dataSource!, `ipv4:${networkId}`);
      addressAttempt = createAddress(host);
      await waitForAdvisoryWait(dataSource!, `ipv4:${networkId}`, 2);
      await held.release();
      await expect(reservation).resolves.toBe(host);
      await expect(addressAttempt).rejects.toMatchObject({ response: { code: 'IP_IN_USE' } });
    } finally {
      await held.release();
      await Promise.allSettled([reservation, addressAttempt].filter(Boolean) as Promise<unknown>[]);
    }
    const rows = (await dataSource!.query(
      `SELECT COUNT(*)::int AS total FROM "${SCHEMA}".network_router_interface_ipv4_addresses`,
    )) as Array<{ total: number }>;
    expect(rows[0]?.total).toBe(0);
    await assertTenantWideI1();
  });

  it('linealiza captura ACTIVE primero: la reserva concurrente omite el host protegido', async () => {
    const networkId = await createNetwork('10.61.0.0/24');
    const provisioningId = await createProvisioning(networkId);
    const host = '10.61.0.10';
    const held = await holdAdvisoryLock(dataSource!, SCHEMA, `ipv4:${networkId}`);
    interfaceService = new NetworkInterfaceCatalogService(
      dataSource!,
      audit,
      ipamService,
      authorization,
      'ACTIVE',
    );
    let addressAttempt: Promise<unknown> | undefined;
    let reservation: Promise<string> | undefined;
    try {
      addressAttempt = createAddress(host);
      await waitForAdvisoryWait(dataSource!, `ipv4:${networkId}`);
      reservation = reserve(networkId, provisioningId);
      await waitForAdvisoryWait(dataSource!, `ipv4:${networkId}`, 2);
      await held.release();
      await expect(addressAttempt).resolves.toMatchObject({ host });
      await expect(reservation).resolves.toBe('10.61.0.11');
    } finally {
      await held.release();
      await Promise.allSettled([addressAttempt, reservation].filter(Boolean) as Promise<unknown>[]);
    }
    const rows = (await dataSource!.query(
      `SELECT host(host_address) AS host
         FROM "${SCHEMA}".network_router_interface_ipv4_addresses
        WHERE tenant_id = $1`,
      [tenantId],
    )) as Array<{ host: string }>;
    expect(rows.map(({ host: storedHost }) => storedHost)).toEqual([host]);
    await assertTenantWideI1();
  });

  it('linealiza reserva antes de corregir una IP local: la corrección no libera una IP viva', async () => {
    const networkId = await createNetwork('10.64.0.0/24');
    const provisioningId = await createProvisioning(networkId);
    const previousHost = '10.64.0.12';
    const targetHost = '10.64.0.13';
    const localAddress = await createAddress(previousHost);
    const held = await holdAdvisoryLock(dataSource!, SCHEMA, `ipv4:${networkId}`);
    let reservation: Promise<string> | undefined;
    let correction: Promise<unknown> | undefined;
    try {
      reservation = reserve(networkId, provisioningId, targetHost);
      await waitForAdvisoryWait(dataSource!, `ipv4:${networkId}`);
      correction = correctAddress(localAddress.id, targetHost);
      await waitForAdvisoryWait(dataSource!, `ipv4:${networkId}`, 2);
      await held.release();

      await expect(reservation).resolves.toBe(targetHost);
      await expect(correction).rejects.toMatchObject({ response: { code: 'IP_IN_USE' } });
      expect(await liveAssignments(networkId)).toEqual([{ ip: targetHost, status: 'RESERVED' }]);
      const localRows = (await dataSource!.query(
        `SELECT host(host_address) AS host
           FROM "${SCHEMA}".network_router_interface_ipv4_addresses
          WHERE tenant_id = $1 AND id = $2`,
        [tenantId, localAddress.id],
      )) as Array<{ host: string }>;
      expect(localRows).toEqual([{ host: previousHost }]);
      await assertTenantWideI1();
    } finally {
      await held.release();
      await Promise.allSettled([reservation, correction].filter(Boolean) as Promise<unknown>[]);
      await releaseAssignments(networkId);
      await deleteLocalAddress(localAddress.id);
    }
  });

  it('linealiza corrección de IP local antes de reservar: el IPAM ve el host actualizado', async () => {
    const networkId = await createNetwork('10.65.0.0/24');
    const provisioningId = await createProvisioning(networkId);
    const previousHost = '10.65.0.12';
    const targetHost = '10.65.0.13';
    const localAddress = await createAddress(previousHost);
    const held = await holdAdvisoryLock(dataSource!, SCHEMA, `ipv4:${networkId}`);
    let correction: Promise<unknown> | undefined;
    let reservation: Promise<string> | undefined;
    try {
      correction = correctAddress(localAddress.id, targetHost);
      await waitForAdvisoryWait(dataSource!, `ipv4:${networkId}`);
      reservation = reserve(networkId, provisioningId, targetHost);
      await waitForAdvisoryWait(dataSource!, `ipv4:${networkId}`, 2);
      await held.release();

      await expect(correction).resolves.toMatchObject({ releasedHost: previousHost });
      await expect(reservation).rejects.toMatchObject({
        response: { code: 'IP_PROTECTED_BY_INFRASTRUCTURE' },
      });
      expect(await liveAssignments(networkId)).toEqual([]);
      const localRows = (await dataSource!.query(
        `SELECT host(host_address) AS host
           FROM "${SCHEMA}".network_router_interface_ipv4_addresses
          WHERE tenant_id = $1 AND id = $2`,
        [tenantId, localAddress.id],
      )) as Array<{ host: string }>;
      expect(localRows).toEqual([{ host: targetHost }]);
      await assertTenantWideI1();
    } finally {
      await held.release();
      await Promise.allSettled([correction, reservation].filter(Boolean) as Promise<unknown>[]);
      await releaseAssignments(networkId);
      await deleteLocalAddress(localAddress.id);
    }
  });

  it('linealiza alta de pool antes de corregir una IP local: el nuevo host queda protegido', async () => {
    await assertCorrectionPoolRace(true, '10.71.0.0/24', '10.71.0.14', '10.71.0.12');
  });

  it('linealiza corrección de IP local antes de alta de pool: el pool posterior ve la protección', async () => {
    await assertCorrectionPoolRace(false, '10.72.0.0/24', '10.72.0.14', '10.72.0.12');
  });

  it('linealiza reserva antes del PATCH de rango: conserva la asignación viva y rechaza el PATCH', async () => {
    await assertPatchReservationRace(true, '10.73.0.0/24', '10.73.0.25');
  });

  it('linealiza PATCH de rango antes de reserva: la reserva rechaza el host fuera del nuevo rango', async () => {
    await assertPatchReservationRace(false, '10.74.0.0/24', '10.74.0.25');
  });

  it('mantiene PENDING bajo carrera: la reserva gana y la captura no persiste una IP local', async () => {
    await assertPendingCaptureReserveRace(true, '10.75.0.0/24', '10.75.0.12');
  });

  it('mantiene PENDING bajo carrera: la captura falla cerrada antes de la reserva', async () => {
    await assertPendingCaptureReserveRace(false, '10.76.0.0/24', '10.76.0.12');
  });

  it('linealiza reserva antes de desactivar interfaz y conserva la asignación viva', async () => {
    await assertDeactivationRace('interface', false, '10.66.0.0/24', '10.66.0.10');
  });

  it('linealiza desactivación de interfaz antes de reservar y rechaza la reserva', async () => {
    await assertDeactivationRace('interface', true, '10.67.0.0/24', '10.67.0.10');
  });

  it('linealiza reserva antes de desactivar router y conserva la asignación viva', async () => {
    await assertDeactivationRace('router', false, '10.68.0.0/24', '10.68.0.10');
  });

  it('linealiza desactivación de router antes de reservar y rechaza la reserva', async () => {
    await assertDeactivationRace('router', true, '10.69.0.0/24', '10.69.0.10');
  });

  it('linealiza reserva antes de desactivar red y conserva la asignación viva', async () => {
    await assertNetworkDeactivationRace(false, '10.79.0.0/24', '10.79.0.10');
  });

  it('linealiza desactivación de red antes de reservar y rechaza la reserva', async () => {
    await assertNetworkDeactivationRace(true, '10.80.0.0/24', '10.80.0.10');
  });

  it('reserva completa antes de inactivar la red y conserva su asignación', async () => {
    await assertFullReserveDeactivationRace('network', false, '10.104.0.0/24', '10.104.0.10');
  });

  it('inactivación de red antes de reserva completa rechaza sin filas parciales', async () => {
    await assertFullReserveDeactivationRace('network', true, '10.105.0.0/24', '10.105.0.10');
  });

  it('reserva completa antes de inactivar el router y conserva su asignación', async () => {
    await assertFullReserveDeactivationRace('router', false, '10.106.0.0/24', '10.106.0.10');
  });

  it('inactivación de router antes de reserva completa rechaza sin filas parciales', async () => {
    await assertFullReserveDeactivationRace('router', true, '10.107.0.0/24', '10.107.0.10');
  });

  it('reserva completa antes de inactivar la interfaz y conserva su asignación', async () => {
    await assertFullReserveDeactivationRace('interface', false, '10.108.0.0/24', '10.108.0.10');
  });

  it('inactivación de interfaz antes de reserva completa rechaza sin filas parciales', async () => {
    await assertFullReserveDeactivationRace('interface', true, '10.109.0.0/24', '10.109.0.10');
  });

  it('linealiza alta de pool antes de desactivar router y conserva el pool activo histórico', async () => {
    await assertPoolRouterDeactivationRace(false, '10.77.0.0/24');
  });

  it('linealiza desactivación de router antes de alta de pool y no crea el pool', async () => {
    await assertPoolRouterDeactivationRace(true, '10.78.0.0/24');
  });

  it('linealiza reserva antes de asociar interfaz y conserva la asignación viva', async () => {
    await assertInterfaceAssociationRace(false, true, '10.81.0.0/24', '10.81.0.10');
  });

  it('linealiza asociación de interfaz antes de reserva', async () => {
    await assertInterfaceAssociationRace(true, true, '10.82.0.0/24', '10.82.0.10');
  });

  it('linealiza reserva antes de desasociar interfaz y conserva la asignación viva', async () => {
    await assertInterfaceAssociationRace(false, false, '10.83.0.0/24', '10.83.0.10');
  });

  it('linealiza desasociación de interfaz antes de reserva', async () => {
    await assertInterfaceAssociationRace(true, false, '10.84.0.0/24', '10.84.0.10');
  });

  it('reserva completa espera L2 antes de persistir servicio y asignación, gana sobre PATCH de rango', async () => {
    await assertFullReservePatchRace(false, '10.89.0.0/24', '10.89.0.25');
  });

  it('PATCH de rango gana antes de reserva completa y no deja servicio parcial', async () => {
    await assertFullReservePatchRace(true, '10.90.0.0/24', '10.90.0.25');
  });

  it('release completo espera L2 y actualiza servicio y asignación en la misma secuencia', async () => {
    await assertFlowReleaseWaitsForPoolLock();
  });

  it('certify no modifica ip_assignments aunque otra transacción mantenga L2', async () => {
    const networkId = await createNetwork('10.91.0.0/24');
    const executionOrderId = randomUUID();
    const provisioningId = await createFlowProvisioning(networkId, executionOrderId, '10.91.0.10');
    const { service } = createProvisioningService(syntheticSnapshot(executionOrderId));
    const assignmentBefore = await assignmentState(provisioningId);
    const held = await holdAdvisoryLock(dataSource!, SCHEMA, `ipv4:${networkId}`);
    const certification = run(() =>
      service.certify(provisioningId, { version: 1, evidenceId: randomUUID() }, syntheticActor()),
    );
    let settled = false;
    void certification.then(
      () => {
        settled = true;
      },
      () => {
        settled = true;
      },
    );
    try {
      const deadline = Date.now() + 10_000;
      while (!settled && Date.now() < deadline) {
        await new Promise<void>((resolve) => setImmediate(resolve));
      }
      expect(settled).toBe(true);
      await expect(certification).resolves.toMatchObject({ status: 'CERTIFIED' });
      expect(await assignmentStatus(provisioningId)).toBe('RESERVED');
      expect(await assignmentState(provisioningId)).toEqual(assignmentBefore);
      expect(await assertAssignmentCount(networkId)).toBe(1);
      expect(await assertProvisioningStatus(provisioningId)).toBe('CERTIFIED');
      await assertTenantWideI1();
    } finally {
      await held.release();
      await Promise.allSettled([certification]);
      await releaseAssignments(networkId);
    }
  });

  it('regularize espera L2 y solo entonces crea servicio y asignación ACTIVE', async () => {
    await assertRegularizeWaitsForPoolLock();
  });

  it('consumer de evento espera L2 antes de liberar la asignación IPv4', async () => {
    await assertConsumerReleaseWaitsForPoolLock();
  });

  it('consumer de evento espera L2 antes de activar la asignación IPv4', async () => {
    await assertConsumerActivationWaitsForPoolLock();
  });

  it('reconciler espera L2 antes de liberar la asignación IPv4', async () => {
    await assertReconcilerReleaseWaitsForPoolLock();
  });

  it('reconciler espera L2 antes de activar la asignación IPv4', async () => {
    await assertReconcilerActivationWaitsForPoolLock();
  });

  it('release precede la inactivación de red sin perder la transición de asignación', async () => {
    await assertReleaseDeactivationRace(false, '10.100.0.0/24', '10.100.0.10');
  });

  it('inactivación de red precede release y conserva la asignación viva', async () => {
    await assertReleaseDeactivationRace(true, '10.101.0.0/24', '10.101.0.10');
  });

  it('regularize precede la inactivación de red y conserva la asignación activa', async () => {
    await assertRegularizeDeactivationRace(true, '10.102.0.0/24');
  });

  it('inactivación de red precede regularize y no crea asignación parcial', async () => {
    await assertRegularizeDeactivationRace(false, '10.103.0.0/24');
  });

  it('replay idempotente espera la inactivación de red y rechaza reemitir después', async () => {
    await assertReplayDeactivationRace('network', true, '10.92.0.0/24', '10.92.0.10');
  });

  it('replay idempotente precede a inactivación de red y reemite antes del cambio', async () => {
    await assertReplayDeactivationRace('network', false, '10.93.0.0/24', '10.93.0.10');
  });

  it('replay idempotente espera la inactivación de router y rechaza reemitir después', async () => {
    await assertReplayDeactivationRace('router', true, '10.94.0.0/24', '10.94.0.10');
  });

  it('replay idempotente precede a inactivación de router y reemite antes del cambio', async () => {
    await assertReplayDeactivationRace('router', false, '10.95.0.0/24', '10.95.0.10');
  });

  it('replay idempotente espera la inactivación de interfaz y rechaza reemitir después', async () => {
    await assertReplayDeactivationRace('interface', true, '10.96.0.0/24', '10.96.0.10');
  });

  it('replay idempotente precede a inactivación de interfaz y reemite antes del cambio', async () => {
    await assertReplayDeactivationRace('interface', false, '10.97.0.0/24', '10.97.0.10');
  });

  it('asigna 20 reservas concurrentes distintas sobre un pool migrado y una barrera L2', async () => {
    const networkId = await createNetwork('10.70.0.0/24');
    const provisioningIds = await Promise.all(
      Array.from({ length: 20 }, () => createProvisioning(networkId)),
    );
    const held = await holdAdvisoryLock(dataSource!, SCHEMA, `ipv4:${networkId}`);
    let reservations: Promise<string>[] = [];
    try {
      reservations = provisioningIds.map((provisioningId) => reserve(networkId, provisioningId));
      await waitForAdvisoryWait(dataSource!, `ipv4:${networkId}`, 20);
      await held.release();
      const assigned = await Promise.all(reservations);
      expect(new Set(assigned).size).toBe(20);
      expect([...assigned].sort((left, right) => left.localeCompare(right))).toEqual(
        Array.from({ length: 20 }, (_, index) => `10.70.0.${index + 10}`),
      );
      expect(await liveAssignments(networkId)).toHaveLength(20);
      await assertTenantWideI1();
    } finally {
      await held.release();
      await Promise.allSettled(reservations);
      await releaseAssignments(networkId);
    }
  });

  const h5WriterPairs: Array<[AssignmentWriterKind, AssignmentWriterKind]> = [
    ['reserve', 'release'],
    ['reserve', 'regularize'],
    ['reserve', 'consumer'],
    ['reserve', 'reconciler'],
    ['release', 'regularize'],
    ['release', 'consumer'],
    ['release', 'reconciler'],
    ['regularize', 'consumer'],
    ['regularize', 'reconciler'],
    ['consumer', 'reconciler'],
  ];

  h5WriterPairs.forEach(([left, right], index) => {
    const firstOctet = 110 + index * 2;
    it(`serializa writer H-5 ${left} → ${right} bajo L2`, async () => {
      await assertAssignmentWriterRace(left, right, `10.${firstOctet}.0.0/24`);
    });
    it(`serializa writer H-5 ${right} → ${left} bajo L2`, async () => {
      await assertAssignmentWriterRace(right, left, `10.${firstOctet + 1}.0.0/24`);
    });
  });

  it('linealiza alta de pool primero: la captura ACTIVE espera y protege el host del pool nuevo', async () => {
    const cidr = '10.62.0.0/24';
    const held = await holdAdvisoryLock(dataSource!, SCHEMA, `ipv4-catalog:${tenantId}`);
    interfaceService = new NetworkInterfaceCatalogService(
      dataSource!,
      audit,
      ipamService,
      authorization,
      'ACTIVE',
    );
    let poolCreation:
      | Promise<Awaited<ReturnType<NetworkCatalogService['createIpv4Network']>>>
      | undefined;
    let addressAttempt: Promise<unknown> | undefined;
    try {
      poolCreation = run(() =>
        catalogService.createIpv4Network(
          {
            routerId,
            name: `Race pool ${cidr}`,
            cidr,
            gateway: '10.62.0.1',
            assignableFrom: '10.62.0.10',
            assignableTo: '10.62.0.30',
            defaultControlMethod: 'SIMPLE_QUEUE_STATIC_IP',
            excludedIps: [],
          },
          actorId,
        ),
      );
      await waitForAdvisoryWait(dataSource!, `ipv4-catalog:${tenantId}`);
      addressAttempt = createAddress('10.62.0.12');
      await waitForAdvisoryWait(dataSource!, `ipv4-catalog:${tenantId}`, 2);
      await held.release();
      const created = await poolCreation;
      expect(created.cidr).toBe(cidr);
      await expect(addressAttempt).resolves.toMatchObject({ host: '10.62.0.12' });
      const provisioningId = await createProvisioning(created.id);
      await expect(reserve(created.id, provisioningId)).resolves.toBe('10.62.0.10');
    } finally {
      await held.release();
      await Promise.allSettled(
        [poolCreation, addressAttempt].filter(Boolean) as Promise<unknown>[],
      );
    }
    await assertTenantWideI1();
  });

  it('linealiza captura ACTIVE primero frente a alta de pool: el pool posterior respeta el host', async () => {
    const cidr = '10.63.0.0/24';
    const held = await holdAdvisoryLock(dataSource!, SCHEMA, `ipv4-catalog:${tenantId}`);
    interfaceService = new NetworkInterfaceCatalogService(
      dataSource!,
      audit,
      ipamService,
      authorization,
      'ACTIVE',
    );
    let addressAttempt: Promise<unknown> | undefined;
    let poolCreation:
      | Promise<Awaited<ReturnType<NetworkCatalogService['createIpv4Network']>>>
      | undefined;
    try {
      addressAttempt = createAddress('10.63.0.12');
      await waitForAdvisoryWait(dataSource!, `ipv4-catalog:${tenantId}`);
      poolCreation = run(() =>
        catalogService.createIpv4Network(
          {
            routerId,
            name: `Race pool ${cidr}`,
            cidr,
            gateway: '10.63.0.1',
            assignableFrom: '10.63.0.10',
            assignableTo: '10.63.0.30',
            defaultControlMethod: 'SIMPLE_QUEUE_STATIC_IP',
            excludedIps: [],
          },
          actorId,
        ),
      );
      await waitForAdvisoryWait(dataSource!, `ipv4-catalog:${tenantId}`, 2);
      await held.release();
      await expect(addressAttempt).resolves.toMatchObject({ host: '10.63.0.12' });
      const created = await poolCreation;
      expect(created.cidr).toBe(cidr);
      const provisioningId = await createProvisioning(created.id);
      await expect(reserve(created.id, provisioningId)).resolves.toBe('10.63.0.10');
    } finally {
      await held.release();
      await Promise.allSettled(
        [addressAttempt, poolCreation].filter(Boolean) as Promise<unknown>[],
      );
    }
    await assertTenantWideI1();
  });
});
