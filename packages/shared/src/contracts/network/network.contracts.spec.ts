import {
  AccessPermissionKey,
  COMMERCIAL_ACTIVATION_STATUSES,
  CONTROL_METHODS,
  ControlParamsSchema,
  CreateIpv4NetworkBodySchema,
  CreateRouterBodySchema,
  NETWORK_ERROR_CODES,
  NETWORK_INBOX_ERROR_CODES,
  IP_ASSIGNMENT_STATUSES,
  PatchNetworkSettingsBodySchema,
  PutPlanProfileBodySchema,
  NETWORK_EXECUTION_EVENTS_QUEUE,
  NETWORK_PROVISIONING_RECONCILE_QUEUE,
  NetworkExecutionEventSchema,
  RegularizeProvisioningBodySchema,
  ReleaseProvisioningBodySchema,
  ReserveProvisioningBodySchema,
  RouterStatusBodySchema,
  UpdateIpv4NetworkBodySchema,
  UpdateRouterBodySchema,
  CertifyProvisioningBodySchema,
  PROVISIONING_RELEASE_REASONS,
  SERVICE_PROVISIONING_STATUSES,
  SignedNetworkExecutionEventSchema,
  canonicalizeNetworkExecutionEvent,
} from '../..';

const EVENT_ID = '00000000-0000-4000-8000-000000000001';
const ORDER_ID = '00000000-0000-4000-8000-000000000002';
const TENANT_ID = '00000000-0000-4000-8000-000000000003';

describe('MOD13 network contracts', () => {
  it('exports the frozen control and provisioning values', () => {
    expect(CONTROL_METHODS).toEqual(['SIMPLE_QUEUE_STATIC_IP', 'PCQ_ADDRESS_LIST']);
    expect(SERVICE_PROVISIONING_STATUSES).toEqual([
      'RESERVED',
      'CERTIFIED',
      'ACTIVE',
      'FAILED',
      'RELEASED',
    ]);
    expect(IP_ASSIGNMENT_STATUSES).toEqual(['RESERVED', 'ACTIVE', 'RELEASED']);
    expect(PROVISIONING_RELEASE_REASONS).toEqual([
      'NOT_EXECUTED',
      'CANCELLED',
      'ANNULLED',
      'REPLACED',
      'MANUAL',
      'RECONCILED',
    ]);
    expect(COMMERCIAL_ACTIVATION_STATUSES).toEqual([
      'NOT_APPLICABLE',
      'PENDING',
      'DONE',
      'BLOCKED',
    ]);
  });

  it('validates each supported control parameter branch and rejects invalid values', () => {
    expect(
      ControlParamsSchema.safeParse({
        method: 'SIMPLE_QUEUE_STATIC_IP',
        queueName: 'OTE-20261022-001',
      }).success,
    ).toBe(true);
    expect(
      ControlParamsSchema.safeParse({
        method: 'PCQ_ADDRESS_LIST',
        addressList: 'plan_fibra_300',
      }).success,
    ).toBe(true);
    expect(
      ControlParamsSchema.safeParse({ method: 'PCQ_ADDRESS_LIST', queueName: 'wrong-branch' })
        .success,
    ).toBe(false);
    expect(
      ControlParamsSchema.safeParse({ method: 'SIMPLE_QUEUE_STATIC_IP', queueName: 'bad name' })
        .success,
    ).toBe(false);
    expect(
      ControlParamsSchema.safeParse({
        method: 'SIMPLE_QUEUE_STATIC_IP',
        queueName: 'OTE-001',
        ignored: true,
      }).success,
    ).toBe(false);
    expect(
      ControlParamsSchema.safeParse({ method: 'PCQ_ADDRESS_LIST', addressList: 'a'.repeat(64) })
        .success,
    ).toBe(true);
    expect(
      ControlParamsSchema.safeParse({ method: 'PCQ_ADDRESS_LIST', addressList: 'a'.repeat(65) })
        .success,
    ).toBe(false);
  });

  it('validates signed execution events and rejects an unsupported event type', () => {
    const event = {
      eventId: EVENT_ID,
      eventType: 'ExecutionOrderClosedV1',
      executionOrderId: ORDER_ID,
      aggregateVersion: 1,
      result: 'EXECUTED',
      occurredAt: '2026-10-22T12:00:00.000Z',
    };

    expect(NetworkExecutionEventSchema.safeParse(event).success).toBe(true);
    expect(
      SignedNetworkExecutionEventSchema.safeParse({
        tenantId: TENANT_ID,
        envelope: event,
        signature: 'a'.repeat(64),
      }).success,
    ).toBe(true);
    expect(
      NetworkExecutionEventSchema.safeParse({ ...event, eventType: 'ExecutionOrderStartedV1' })
        .success,
    ).toBe(false);
  });

  it('canonicalizes the signed envelope independently of object key order', () => {
    const first = {
      eventId: EVENT_ID,
      eventType: 'ExecutionOrderClosedV1' as const,
      executionOrderId: ORDER_ID,
      aggregateVersion: 1,
      result: 'EXECUTED' as const,
      occurredAt: '2026-10-22T12:00:00.000Z',
    };
    const reordered = {
      occurredAt: '2026-10-22T12:00:00.000Z',
      result: 'EXECUTED' as const,
      aggregateVersion: 1,
      executionOrderId: ORDER_ID,
      eventType: 'ExecutionOrderClosedV1' as const,
      eventId: EVENT_ID,
    };

    expect(canonicalizeNetworkExecutionEvent(TENANT_ID, first)).toBe(
      canonicalizeNetworkExecutionEvent(TENANT_ID, reordered),
    );
    expect(canonicalizeNetworkExecutionEvent(TENANT_ID, first)).toBe(
      `{"envelope":{"aggregateVersion":1,"eventId":"${EVENT_ID}","eventType":"ExecutionOrderClosedV1","executionOrderId":"${ORDER_ID}","occurredAt":"2026-10-22T12:00:00.000Z","result":"EXECUTED"},"tenantId":"${TENANT_ID}"}`,
    );
  });

  it('exports the network queue names and six permission keys', () => {
    expect(NETWORK_EXECUTION_EVENTS_QUEUE).toBe('network-execution-events');
    expect(NETWORK_PROVISIONING_RECONCILE_QUEUE).toBe('network-provisioning-reconcile');
    expect([
      AccessPermissionKey.NETWORK_CATALOG_READ,
      AccessPermissionKey.NETWORK_CATALOG_MANAGE,
      AccessPermissionKey.NETWORK_PROVISIONING_READ,
      AccessPermissionKey.NETWORK_PROVISIONING_EXECUTE,
      AccessPermissionKey.NETWORK_PROVISIONING_CERTIFY,
      AccessPermissionKey.NETWORK_PROVISIONING_REGULARIZE,
    ]).toEqual([
      'network.catalog.read',
      'network.catalog.manage',
      'network.provisioning.read',
      'network.provisioning.execute',
      'network.provisioning.certify',
      'network.provisioning.regularize',
    ]);
  });

  it('exports the closed network and inbox error code lists', () => {
    expect(NETWORK_ERROR_CODES).toEqual([
      'NETWORK_POOL_EXHAUSTED',
      'IP_OUTSIDE_RANGE',
      'IP_IS_GATEWAY',
      'IP_EXCLUDED',
      'IP_IN_USE',
      'NETWORK_OVERLAP',
      'NETWORK_NOT_IN_ROUTER',
      'CONTROL_METHOD_NOT_SUPPORTED',
      'CONTRACT_NOT_OF_SUBSCRIBER',
      'PROVISIONING_ORDER_NOT_ELIGIBLE',
      'PROVISIONING_TECHNICIAN_REQUIRED',
      'PROVISIONING_CERTIFIER_IS_EXECUTOR',
      'PROVISIONING_EVIDENCE_REQUIRED',
      'PROVISIONING_STATE_INVALID',
      'PROVISIONING_ALREADY_ACTIVE',
      'VERSION_CONFLICT',
      'RESOURCE_NOT_FOUND',
      'SITE_OR_NODE_INACTIVE',
      'CATALOG_REFERENCE_INACTIVE',
      'INTERFACE_NOT_AVAILABLE',
      'INTERFACE_NAME_IN_USE',
      'INTERFACE_ADDRESS_IS_GATEWAY',
      'INTERFACE_ADDRESS_DUPLICATED',
      'IP_PROTECTED_BY_INFRASTRUCTURE',
      'IP_PROTECTION_PENDING',
      'RESERVATIONS_PAUSED',
      'EXCLUDED_IP_IN_USE',
      'EXCLUDED_IP_OUTSIDE_BLOCK',
      'ADDRESS_NOT_USABLE',
      'LEGACY_LAN_NOT_AVAILABLE',
      'LEGACY_LAN_ALREADY_CONVERTED',
      'NETWORK_PREFIX_NOT_ASSIGNABLE',
      'NETWORK_CONFIRMATION_MISMATCH',
      'ADDRESS_RELEASE_CONFIRMATION_REQUIRED',
      'ROUTER_NAME_IN_USE',
      'CONTROL_METHOD_IN_USE',
      'GATEWAY_INVALID',
      'ASSIGNABLE_RANGE_INVALID',
    ]);
    expect(NETWORK_INBOX_ERROR_CODES).toEqual([
      'SIGNATURE_INVALID',
      'ORDER_NOT_FOUND',
      'IPAM_CONFLICT',
      'CRM_LISTENER_FAILED',
      'INVENTORY_LISTENER_FAILED',
      'UNEXPECTED',
    ]);
  });

  it('validates provisioning request bodies and enforces IPv4 and strict keys', () => {
    const reserve = {
      executionOrderId: ORDER_ID,
      routerId: EVENT_ID,
      ipv4NetworkId: TENANT_ID,
      requestedIp: '192.0.2.15',
      controlParams: { method: 'SIMPLE_QUEUE_STATIC_IP', queueName: 'OTE-001' },
    };
    expect(ReserveProvisioningBodySchema.safeParse(reserve).success).toBe(true);
    expect(
      ReserveProvisioningBodySchema.safeParse({ ...reserve, requestedIp: '192.0.2.999' }).success,
    ).toBe(false);
    expect(
      ReserveProvisioningBodySchema.safeParse({ ...reserve, unrecognized: true }).success,
    ).toBe(false);

    expect(
      CertifyProvisioningBodySchema.safeParse({ evidenceId: EVENT_ID, version: 1 }).success,
    ).toBe(true);
    expect(
      CertifyProvisioningBodySchema.safeParse({ evidenceId: EVENT_ID, version: 0 }).success,
    ).toBe(false);
    expect(
      ReleaseProvisioningBodySchema.safeParse({ version: 1, reason: '  motivo válido  ' }).success,
    ).toBe(true);
    expect(ReleaseProvisioningBodySchema.safeParse({ version: 1, reason: 'corto' }).success).toBe(
      false,
    );
    expect(
      ReleaseProvisioningBodySchema.safeParse({ version: 1, reason: 'R'.repeat(500) }).success,
    ).toBe(true);
    expect(
      ReleaseProvisioningBodySchema.safeParse({ version: 1, reason: 'R'.repeat(501) }).success,
    ).toBe(false);
    expect(
      RegularizeProvisioningBodySchema.safeParse({ ...reserve, reason: 'motivo válido' }).success,
    ).toBe(true);
  });

  it('validates router body length limits, host values, repeated methods, and extra keys', () => {
    const router = {
      name: 'R'.repeat(120),
      managementHost: '192.0.2.10',
      lanInterface: 'L'.repeat(64),
      supportedControlMethods: ['SIMPLE_QUEUE_STATIC_IP', 'PCQ_ADDRESS_LIST'],
      notes: 'N'.repeat(1000),
    };

    expect(CreateRouterBodySchema.safeParse(router).success).toBe(true);
    for (const name of ['   ', '\t \n']) {
      expect(CreateRouterBodySchema.safeParse({ ...router, name }).success).toBe(false);
      expect(UpdateRouterBodySchema.safeParse({ version: 1, name }).success).toBe(false);
    }
    for (const name of ['Router', ' Router ']) {
      expect(CreateRouterBodySchema.safeParse({ ...router, name }).success).toBe(true);
      const update = UpdateRouterBodySchema.safeParse({ version: 1, name });
      expect(update.success).toBe(true);
      if (update.success) expect(update.data.name).toBe(name);
    }
    expect(CreateRouterBodySchema.safeParse({ ...router, name: `${router.name}R` }).success).toBe(
      false,
    );
    expect(
      CreateRouterBodySchema.safeParse({ ...router, lanInterface: `${router.lanInterface}L` })
        .success,
    ).toBe(false);
    expect(CreateRouterBodySchema.safeParse({ ...router, notes: `${router.notes}N` }).success).toBe(
      false,
    );
    const fqdnAtMaximumDnsLength = `${'a'.repeat(63)}.${'b'.repeat(63)}.${'c'.repeat(63)}.${'d'.repeat(61)}`;
    expect(
      CreateRouterBodySchema.safeParse({ ...router, managementHost: fqdnAtMaximumDnsLength })
        .success,
    ).toBe(true);
    const fqdnAboveMaximumDnsLength = `${'a'.repeat(63)}.${'b'.repeat(63)}.${'c'.repeat(63)}.${'d'.repeat(62)}`;
    expect(
      CreateRouterBodySchema.safeParse({ ...router, managementHost: fqdnAboveMaximumDnsLength })
        .success,
    ).toBe(false);
    expect(
      CreateRouterBodySchema.safeParse({ ...router, managementHost: '999.0.2.10' }).success,
    ).toBe(false);
    expect(
      CreateRouterBodySchema.safeParse({
        ...router,
        supportedControlMethods: ['SIMPLE_QUEUE_STATIC_IP', 'SIMPLE_QUEUE_STATIC_IP'],
      }).success,
    ).toBe(false);
    expect(CreateRouterBodySchema.safeParse({ ...router, extra: 'field' }).success).toBe(false);
    expect(
      UpdateRouterBodySchema.safeParse({ version: 1, name: 'Router', extra: 'field' }).success,
    ).toBe(false);
    expect(UpdateRouterBodySchema.safeParse({ version: 1 }).success).toBe(true);
    expect(UpdateRouterBodySchema.safeParse({ version: 1, organizationSiteId: null }).success).toBe(
      true,
    );
    expect(UpdateRouterBodySchema.safeParse({ version: 1, commercialNodeId: null }).success).toBe(
      true,
    );
    expect(
      UpdateRouterBodySchema.safeParse({
        version: 1,
        organizationSiteId: null,
        commercialNodeId: null,
      }).success,
    ).toBe(true);
    expect(RouterStatusBodySchema.safeParse({ version: 1 }).success).toBe(true);
  });

  it('validates IPv4 network bodies, bounded collections, and strict update bodies', () => {
    const network = {
      routerId: EVENT_ID,
      name: 'Red'.repeat(40),
      cidr: '192.0.2.0/24',
      gateway: '192.0.2.1',
      assignableFrom: '192.0.2.10',
      assignableTo: '192.0.2.250',
      excludedIps: ['192.0.2.20'],
      defaultControlMethod: 'PCQ_ADDRESS_LIST',
    };

    expect(CreateIpv4NetworkBodySchema.safeParse(network).success).toBe(true);
    for (const name of ['   ', '\t \n']) {
      expect(CreateIpv4NetworkBodySchema.safeParse({ ...network, name }).success).toBe(false);
      expect(UpdateIpv4NetworkBodySchema.safeParse({ version: 1, name }).success).toBe(false);
    }
    for (const name of ['Red', ' Red ']) {
      const create = CreateIpv4NetworkBodySchema.safeParse({ ...network, name });
      expect(create.success).toBe(true);
      if (create.success) expect(create.data.name).toBe(name);
      const update = UpdateIpv4NetworkBodySchema.safeParse({ version: 1, name });
      expect(update.success).toBe(true);
      if (update.success) expect(update.data.name).toBe(name);
    }
    expect(
      CreateIpv4NetworkBodySchema.safeParse({ ...network, cidr: '192.0.0.0/16' }).success,
    ).toBe(true);
    expect(
      CreateIpv4NetworkBodySchema.safeParse({ ...network, cidr: '192.0.2.0/30' }).success,
    ).toBe(true);
    expect(
      CreateIpv4NetworkBodySchema.safeParse({ ...network, cidr: '192.0.0.0/15' }).success,
    ).toBe(false);
    expect(
      CreateIpv4NetworkBodySchema.safeParse({ ...network, cidr: '192.0.2.0/31' }).success,
    ).toBe(false);
    expect(
      CreateIpv4NetworkBodySchema.safeParse({ ...network, cidr: '192.0.2.0/32' }).success,
    ).toBe(false);
    expect(
      CreateIpv4NetworkBodySchema.safeParse({ ...network, name: `${network.name}R` }).success,
    ).toBe(false);
    expect(
      CreateIpv4NetworkBodySchema.safeParse({ ...network, gateway: '192.0.2.256' }).success,
    ).toBe(false);
    expect(
      CreateIpv4NetworkBodySchema.safeParse({ ...network, cidr: '192.0.2.0/33' }).success,
    ).toBe(false);
    expect(
      CreateIpv4NetworkBodySchema.safeParse({
        ...network,
        excludedIps: Array(257).fill('192.0.2.2'),
      }).success,
    ).toBe(false);
    expect(
      UpdateIpv4NetworkBodySchema.safeParse({ version: 1, assignableFrom: '300.0.0.1' }).success,
    ).toBe(false);
    expect(UpdateIpv4NetworkBodySchema.safeParse({ version: 1, unknown: true }).success).toBe(
      false,
    );
    expect(PutPlanProfileBodySchema.safeParse({ pcqAddressList: 'plan_fibra_300' }).success).toBe(
      true,
    );
    expect(
      PatchNetworkSettingsBodySchema.safeParse({ enforceProvisioningOnInstallClose: true }).success,
    ).toBe(true);
    expect(
      PatchNetworkSettingsBodySchema.safeParse({
        enforceProvisioningOnInstallClose: true,
        extra: true,
      }).success,
    ).toBe(false);
  });
});
