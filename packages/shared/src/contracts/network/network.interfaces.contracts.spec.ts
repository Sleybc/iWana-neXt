import {
  AssistedCreateIpv4NetworkBodySchema,
  CorrectRouterInterfaceIpv4AddressBodySchema,
  CreateIpv4NetworkBodySchema,
  CreateRouterBodySchema,
  CreateRouterInterfaceBodySchema,
  CreateRouterInterfaceIpv4AddressBodySchema,
  Ipv4AddressWithPrefixSchema,
  NETWORK_ERROR_CODES,
  NETWORK_GLOBAL_ERROR_CODES,
  normalizeIpv4Exclusions,
  ReservationAvailabilitySchema,
  isUsableIpv4Host,
  UpdateIpv4NetworkBodySchema,
  UpdateRouterBodySchema,
  UpdateRouterInterfaceBodySchema,
  UpdateRouterInterfaceIpv4AddressBodySchema,
} from '../..';

const ROUTER_ID = '00000000-0000-4000-8000-000000000001';
const INTERFACE_ID = '00000000-0000-4000-8000-000000000002';
const INTERFACE_ADDRESS_ID = '00000000-0000-4000-8000-000000000003';

describe('MOD13 interfaces IPv4 runtime contracts', () => {
  it('validates usable IPv4 hosts at prefix boundaries', () => {
    expect(isUsableIpv4Host('128.0.0.0', 1)).toBe(false);
    expect(isUsableIpv4Host('128.0.0.1', 1)).toBe(true);
    expect(isUsableIpv4Host('127.255.255.255', 1)).toBe(false);
    expect(isUsableIpv4Host('192.0.2.0', 30)).toBe(false);
    expect(isUsableIpv4Host('192.0.2.1', 30)).toBe(true);
    expect(isUsableIpv4Host('192.0.2.3', 30)).toBe(false);
    expect(isUsableIpv4Host('192.0.2.0', 31)).toBe(true);
    expect(isUsableIpv4Host('192.0.2.1', 31)).toBe(true);
    expect(isUsableIpv4Host('192.0.2.1', 32)).toBe(true);
    expect(isUsableIpv4Host('0.0.0.0', 32)).toBe(false);
    expect(isUsableIpv4Host('255.255.255.255', 32)).toBe(false);
    expect(isUsableIpv4Host('224.0.0.1', 32)).toBe(false);
    expect(isUsableIpv4Host('192.0.2.1', 0)).toBe(false);
    expect(isUsableIpv4Host('192.0.2.1', 33)).toBe(false);
  });

  it('parses address-with-prefix and strict router legacy bodies', () => {
    expect(Ipv4AddressWithPrefixSchema.safeParse('192.0.2.1/24').success).toBe(true);
    expect(Ipv4AddressWithPrefixSchema.safeParse('192.0.2.0/24').success).toBe(false);
    expect(Ipv4AddressWithPrefixSchema.safeParse('192.0.2.1').success).toBe(false);

    const router = {
      name: 'Router legado',
      managementHost: 'router.example.test',
      lanInterface: 'bridge-clientes',
      supportedControlMethods: ['SIMPLE_QUEUE_STATIC_IP'],
    };
    expect(CreateRouterBodySchema.safeParse(router).success).toBe(true);
    expect(CreateRouterBodySchema.safeParse({ ...router, extra: true }).success).toBe(false);
  });

  it('keeps the legacy IPv4 network body valid and strict', () => {
    const body = {
      routerId: ROUTER_ID,
      name: 'Red de clientes',
      cidr: '192.0.2.0/24',
      gateway: '192.0.2.1',
      assignableFrom: '192.0.2.10',
      assignableTo: '192.0.2.240',
      defaultControlMethod: 'SIMPLE_QUEUE_STATIC_IP',
    };

    expect(CreateIpv4NetworkBodySchema.safeParse(body).success).toBe(true);
    expect(
      CreateIpv4NetworkBodySchema.safeParse({ ...body, interfaceId: INTERFACE_ID }).success,
    ).toBe(false);
  });

  it('requires an explicit source branch and rejects mixed root fields', () => {
    const common = {
      assignableFrom: '192.0.2.10',
      assignableTo: '192.0.2.240',
      defaultControlMethod: 'SIMPLE_QUEUE_STATIC_IP',
    };
    const manual = {
      ...common,
      source: { mode: 'MANUAL_CIDR', cidr: '192.0.2.0/24', gateway: '192.0.2.1' },
    };

    expect(AssistedCreateIpv4NetworkBodySchema.safeParse(manual).success).toBe(true);
    expect(
      AssistedCreateIpv4NetworkBodySchema.safeParse({
        ...manual,
        cidr: '192.0.2.0/24',
      }).success,
    ).toBe(false);
    expect(
      AssistedCreateIpv4NetworkBodySchema.safeParse({ ...common, cidr: '192.0.2.0/24' }).success,
    ).toBe(false);
    expect(AssistedCreateIpv4NetworkBodySchema.safeParse({ ...manual, name: '   ' }).success).toBe(
      true,
    );

    const ipPrefix = {
      ...common,
      source: {
        mode: 'IP_PREFIX',
        addressWithPrefix: '192.0.2.1/24',
        confirmedCidr: '192.0.2.0/24',
        confirmedGateway: '192.0.2.1',
      },
    };
    expect(AssistedCreateIpv4NetworkBodySchema.safeParse(ipPrefix).success).toBe(true);

    const interfaceAddress = {
      ...common,
      interfaceId: INTERFACE_ID,
      interfaceVersion: 1,
      source: {
        mode: 'INTERFACE_ADDRESS',
        interfaceAddressId: INTERFACE_ADDRESS_ID,
        interfaceAddressVersion: 2,
        confirmedCidr: '192.0.2.0/24',
        confirmedGateway: '192.0.2.1',
      },
    };
    expect(AssistedCreateIpv4NetworkBodySchema.safeParse(interfaceAddress).success).toBe(true);
    expect(
      AssistedCreateIpv4NetworkBodySchema.safeParse({
        ...interfaceAddress,
        interfaceId: undefined,
        interfaceVersion: undefined,
      }).success,
    ).toBe(false);
  });

  it('requires an interface version for a new association and supports nullable PATCH semantics', () => {
    const update = { version: 2 };

    expect(UpdateIpv4NetworkBodySchema.safeParse(update).success).toBe(true);
    expect(UpdateIpv4NetworkBodySchema.safeParse({ ...update, interfaceId: null }).success).toBe(
      true,
    );
    expect(
      UpdateIpv4NetworkBodySchema.safeParse({ ...update, interfaceId: INTERFACE_ID }).success,
    ).toBe(false);
    expect(
      UpdateIpv4NetworkBodySchema.safeParse({
        ...update,
        interfaceId: INTERFACE_ID,
        interfaceVersion: 1,
      }).success,
    ).toBe(true);
    expect(UpdateIpv4NetworkBodySchema.safeParse({ version: '2' }).success).toBe(false);
    expect(UpdateRouterBodySchema.safeParse({ version: '2' }).success).toBe(false);
  });

  it('rejects string versions and enforces the explicit legacy-conversion variant', () => {
    expect(UpdateRouterInterfaceBodySchema.safeParse({ version: '1' }).success).toBe(false);
    expect(UpdateRouterInterfaceIpv4AddressBodySchema.safeParse({ version: '1' }).success).toBe(
      false,
    );
    expect(
      CorrectRouterInterfaceIpv4AddressBodySchema.safeParse({
        newAddress: '192.0.2.10/24',
        version: '1',
        reason: 'ERROR_DE_REGISTRO',
      }).success,
    ).toBe(false);
    expect(
      CreateRouterInterfaceBodySchema.safeParse({
        convertLegacyLan: true,
        routerVersion: '2',
        name: 'LAN anterior',
        kind: 'BRIDGE',
      }).success,
    ).toBe(false);

    const base = { name: 'WAN', kind: 'PHYSICAL' };
    expect(CreateRouterInterfaceBodySchema.safeParse(base).success).toBe(true);
    expect(CreateRouterInterfaceBodySchema.safeParse({ ...base, routerVersion: 1 }).success).toBe(
      false,
    );
    expect(
      CreateRouterInterfaceBodySchema.safeParse({
        ...base,
        convertLegacyLan: true,
        routerVersion: 2,
      }).success,
    ).toBe(true);
    expect(
      CreateRouterInterfaceBodySchema.safeParse({ ...base, convertLegacyLan: true }).success,
    ).toBe(false);
  });

  it('normalizes exclusions as distinct /32 host values', () => {
    expect(normalizeIpv4Exclusions(['192.0.2.20', '192.0.2.10', '192.0.2.20'])).toEqual([
      '192.0.2.20',
      '192.0.2.10',
    ]);
  });

  it('enforces D-11 and D-19 availability reason consistency', () => {
    expect(ReservationAvailabilitySchema.safeParse({ available: true, reason: null }).success).toBe(
      true,
    );
    expect(
      ReservationAvailabilitySchema.safeParse({ available: false, reason: 'INTERFACE_INACTIVE' })
        .success,
    ).toBe(true);
    expect(
      ReservationAvailabilitySchema.safeParse({ available: true, reason: 'ROUTER_INACTIVE' })
        .success,
    ).toBe(false);
    expect(
      ReservationAvailabilitySchema.safeParse({ available: false, reason: null }).success,
    ).toBe(false);
    expect(
      ReservationAvailabilitySchema.safeParse({ available: false, reason: 'AVAILABLE' }).success,
    ).toBe(false);
  });

  it('accepts only the three closed correction reasons', () => {
    const base = { newAddress: '192.0.2.11/24', version: 2 };
    for (const reason of ['ERROR_DE_REGISTRO', 'CAMBIO_DE_EQUIPO', 'REASIGNACION_PLANIFICADA']) {
      expect(
        CorrectRouterInterfaceIpv4AddressBodySchema.safeParse({ ...base, reason }).success,
      ).toBe(true);
    }
    expect(
      CorrectRouterInterfaceIpv4AddressBodySchema.safeParse({ ...base, reason: 'OTRO' }).success,
    ).toBe(false);
  });

  it('keeps every declared network error code in the shared closed list', () => {
    const requiredCodes = [
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
    ];
    expect(NETWORK_ERROR_CODES).toEqual(expect.arrayContaining(requiredCodes));
    expect(NETWORK_GLOBAL_ERROR_CODES).toEqual(['VALIDATION_ERROR', 'FORBIDDEN']);
  });
});
