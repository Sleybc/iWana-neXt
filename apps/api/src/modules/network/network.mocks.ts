import { OrganizationSiteType } from '@iwana/shared';
import type {
  AssistedCreateIpv4NetworkBody,
  CatalogMetaDto,
  CommercialNodeSummaryDto,
  ConvertLegacyLanBody,
  CorrectRouterInterfaceIpv4AddressBody,
  CreateIpv4NetworkBody,
  CreateRouterBody,
  CreateRouterInterfaceBaseBody,
  CreateRouterInterfaceIpv4AddressBody,
  Ipv4NetworkExtendedDto,
  OrganizationSiteSummaryDto,
  ProvisioningMetaDto,
  RouterDetailDto,
  RouterInterfaceDto,
  RouterInterfaceIpv4AddressDto,
  RouterSiteOptionDto,
  UpdateIpv4NetworkBody,
} from '@iwana/shared';

const FIXED_DATE = '2026-10-26T12:00:00.000Z';
const ROUTER_ID = '00000000-0000-4000-8000-000000000101';
const INTERFACE_ID = '00000000-0000-4000-8000-000000000106';

export function mockRouterDetail(overrides: Partial<RouterDetailDto> = {}): RouterDetailDto {
  return {
    id: ROUTER_ID,
    name: 'Router de prueba',
    managementHost: 'router.example.test',
    lanInterface: 'bridge-clientes',
    supportedControlMethods: ['SIMPLE_QUEUE_STATIC_IP'],
    organizationSiteId: '00000000-0000-4000-8000-000000000102',
    commercialNodeId: '00000000-0000-4000-8000-000000000103',
    organizationSite: mockOrganizationSiteSummary({ isActive: false }),
    commercialNode: mockCommercialNodeSummary({ isActive: false }),
    status: 'ACTIVE',
    notes: null,
    networkCount: 1,
    interfaceCount: 1,
    legacyLanInterfaceId: null,
    version: 2,
    createdAt: FIXED_DATE,
    updatedAt: FIXED_DATE,
    ...overrides,
  };
}

export function mockRouterWithoutAssociations(): RouterDetailDto {
  return mockRouterDetail({
    organizationSiteId: null,
    commercialNodeId: null,
    organizationSite: null,
    commercialNode: null,
  });
}

/** Representa referencias históricas no resueltas sin exponer sus UUID en labels. */
export function mockRouterWithUnresolvedAssociations(): RouterDetailDto {
  return mockRouterDetail({ organizationSite: null, commercialNode: null });
}

export function mockOrganizationSiteSummary(
  overrides: Partial<OrganizationSiteSummaryDto> = {},
): OrganizationSiteSummaryDto {
  return {
    name: 'Sede de prueba',
    siteType: OrganizationSiteType.OFFICE,
    isActive: true,
    ...overrides,
  };
}

export function mockCommercialNodeSummary(
  overrides: Partial<CommercialNodeSummaryDto> = {},
): CommercialNodeSummaryDto {
  return { name: 'Nodo comercial de prueba', isActive: true, ...overrides };
}

export function mockRouterSiteOption(
  overrides: Partial<RouterSiteOptionDto> = {},
): RouterSiteOptionDto {
  return {
    id: '00000000-0000-4000-8000-000000000104',
    name: 'Sede de opciones',
    siteType: OrganizationSiteType.NOC,
    isActive: false,
    ...overrides,
  };
}

export function mockIpv4Network(
  overrides: Partial<Ipv4NetworkExtendedDto> = {},
): Ipv4NetworkExtendedDto {
  return {
    id: '00000000-0000-4000-8000-000000000105',
    routerId: ROUTER_ID,
    routerName: 'Router de prueba',
    name: 'LAN de prueba',
    cidr: '192.0.2.0/24',
    gateway: '192.0.2.1',
    assignableFrom: '192.0.2.10',
    assignableTo: '192.0.2.240',
    excludedIps: ['192.0.2.20'],
    interfaceId: INTERFACE_ID,
    interface: { id: INTERFACE_ID, name: 'LAN', status: 'INACTIVE' },
    reservationAvailability: { available: false, reason: 'INTERFACE_INACTIVE' },
    defaultControlMethod: 'SIMPLE_QUEUE_STATIC_IP',
    status: 'ACTIVE',
    occupancy: { total: 230, reserved: 10, active: 20, free: 200 },
    version: 3,
    createdAt: FIXED_DATE,
    updatedAt: FIXED_DATE,
    ...overrides,
  };
}

export function mockRouterInterface(
  overrides: Partial<RouterInterfaceDto> = {},
): RouterInterfaceDto {
  return {
    id: INTERFACE_ID,
    routerId: ROUTER_ID,
    name: 'LAN',
    kind: 'BRIDGE',
    notes: null,
    status: 'ACTIVE',
    ipv4AddressCount: 1,
    networkCount: 1,
    version: 1,
    createdAt: FIXED_DATE,
    updatedAt: FIXED_DATE,
    ...overrides,
  };
}

export function mockRouterInterfaceAddress(
  overrides: Partial<RouterInterfaceIpv4AddressDto> = {},
): RouterInterfaceIpv4AddressDto {
  return {
    id: '00000000-0000-4000-8000-000000000107',
    routerId: ROUTER_ID,
    interfaceId: INTERFACE_ID,
    addressWithPrefix: '192.0.2.10/24',
    host: '192.0.2.10',
    prefixLength: 24,
    notes: null,
    version: 1,
    createdAt: FIXED_DATE,
    updatedAt: FIXED_DATE,
    ...overrides,
  };
}

export function mockCatalogMeta(overrides: Partial<CatalogMetaDto> = {}): CatalogMetaDto {
  return { ipProtection: 'PENDING', ...overrides };
}

export function mockProvisioningMeta(
  overrides: Partial<ProvisioningMetaDto> = {},
): ProvisioningMetaDto {
  return { reservationsPaused: false, ...overrides };
}

export function mockLegacyCreateRouterBody(): CreateRouterBody {
  return {
    name: 'Router legado',
    managementHost: 'router.example.test',
    lanInterface: 'bridge-clientes',
    supportedControlMethods: ['SIMPLE_QUEUE_STATIC_IP'],
  };
}

export function mockLegacyCreateIpv4NetworkBody(): CreateIpv4NetworkBody {
  return {
    routerId: ROUTER_ID,
    name: 'Red legada',
    cidr: '192.0.2.0/24',
    gateway: '192.0.2.1',
    assignableFrom: '192.0.2.10',
    assignableTo: '192.0.2.240',
    defaultControlMethod: 'SIMPLE_QUEUE_STATIC_IP',
  };
}

export function mockCreateRouterInterfaceBody(): CreateRouterInterfaceBaseBody {
  return { name: 'WAN', kind: 'PHYSICAL' };
}

export function mockConvertedLegacyLanBody(): ConvertLegacyLanBody {
  return {
    convertLegacyLan: true,
    routerVersion: 2,
    name: 'LAN anterior',
    kind: 'BRIDGE',
    address: { addressWithPrefix: '192.0.2.10/24' },
  };
}

export function mockCreateRouterInterfaceIpv4AddressBody(): CreateRouterInterfaceIpv4AddressBody {
  return { addressWithPrefix: '192.0.2.10/24' };
}

export function mockCorrectRouterInterfaceIpv4AddressBody(): CorrectRouterInterfaceIpv4AddressBody {
  return {
    newAddress: '192.0.2.11/24',
    version: 1,
    reason: 'ERROR_DE_REGISTRO',
    confirmReleasedHost: true,
  };
}

export function mockAssistedCreateIpv4NetworkBody(): AssistedCreateIpv4NetworkBody {
  return {
    interfaceId: INTERFACE_ID,
    interfaceVersion: 1,
    assignableFrom: '192.0.2.10',
    assignableTo: '192.0.2.240',
    excludedIps: ['192.0.2.20'],
    defaultControlMethod: 'SIMPLE_QUEUE_STATIC_IP',
    source: { mode: 'MANUAL_CIDR', cidr: '192.0.2.0/24', gateway: '192.0.2.1' },
  };
}

export function mockUpdateIpv4NetworkBody(): UpdateIpv4NetworkBody {
  return { interfaceId: null, version: 3 };
}
