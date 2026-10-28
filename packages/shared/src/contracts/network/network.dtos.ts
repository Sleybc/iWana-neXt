import type { ExecutionOrderStatus } from '../../enums/operations';
import type { WfmWorkType } from '../../enums/wfm';
import type {
  CommercialActivationStatus,
  ControlMethod,
  ControlParams,
  ProvisioningReleaseReason,
  ServiceProvisioningStatus,
} from './network.contracts';
import type { ReservationAvailability } from './network.bodies';
import type { OrganizationSiteType } from '../../enums/organization/organization-site-type.enum';
import type { NetworkErrorCode, NetworkGlobalErrorCode } from './network.errors';

export interface ActorRefDto {
  id: string;
  name: string | null;
}

export interface RouterDto {
  id: string;
  name: string;
  managementHost: string;
  lanInterface: string | null;
  supportedControlMethods: ControlMethod[];
  organizationSiteId: string | null;
  commercialNodeId: string | null;
  status: 'ACTIVE' | 'INACTIVE';
  notes: string | null;
  networkCount: number;
  /** Campos opcionales de la proyección legacy; la respuesta extendida se define por separado. */
  interfaceCount?: number;
  legacyLanInterfaceId?: string | null;
  organizationSite?: OrganizationSiteSummaryDto | null;
  commercialNode?: CommercialNodeSummaryDto | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

/** Campos presentes en cada fila del listado extendido de routers. */
export interface RouterListDto extends RouterDto {
  interfaceCount: number;
  legacyLanInterfaceId: string | null;
}

/** Forma extendida requerida para el detalle autorizado de router; no sustituye la proyección legacy. */
export interface RouterDetailDto extends RouterListDto {
  organizationSite: OrganizationSiteSummaryDto | null;
  commercialNode: CommercialNodeSummaryDto | null;
}

export interface OrganizationSiteSummaryDto {
  name: string;
  siteType: OrganizationSiteType;
  isActive: boolean;
}

export interface CommercialNodeSummaryDto {
  name: string;
  isActive: boolean;
}

export interface RouterSiteOptionDto {
  id: string;
  name: string;
  siteType: OrganizationSiteType;
  isActive: boolean;
}

export interface Ipv4NetworkOccupancyDto {
  total: number;
  reserved: number;
  active: number;
  free: number;
}

export interface Ipv4NetworkDto {
  id: string;
  routerId: string;
  routerName: string;
  name: string;
  cidr: string;
  gateway: string;
  assignableFrom: string;
  assignableTo: string;
  excludedIps: string[];
  /** Campos opcionales de la proyección legacy; la respuesta extendida se define por separado. */
  interfaceId?: string | null;
  interface?: { id: string; name: string; status: 'ACTIVE' | 'INACTIVE' } | null;
  reservationAvailability?: ReservationAvailability;
  defaultControlMethod: ControlMethod;
  status: 'ACTIVE' | 'INACTIVE';
  occupancy: Ipv4NetworkOccupancyDto;
  version: number;
  createdAt: string;
  updatedAt: string;
}

/** Forma completa de red con asociación y disponibilidad para contratos extendidos. */
export interface Ipv4NetworkExtendedDto extends Ipv4NetworkDto {
  interfaceId: string | null;
  interface: { id: string; name: string; status: 'ACTIVE' | 'INACTIVE' } | null;
  reservationAvailability: ReservationAvailability;
}

export type RouterInterfaceKind = 'PHYSICAL' | 'BRIDGE' | 'VLAN' | 'OTHER';
export type RouterInterfaceStatus = 'ACTIVE' | 'INACTIVE';

export interface RouterInterfaceDto {
  id: string;
  routerId: string;
  name: string;
  kind: RouterInterfaceKind;
  notes: string | null;
  status: RouterInterfaceStatus;
  ipv4AddressCount: number;
  networkCount: number;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface RouterInterfaceIpv4AddressDto {
  id: string;
  routerId: string;
  interfaceId: string;
  addressWithPrefix: string;
  host: string;
  prefixLength: number;
  notes: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

/** Respuesta compuesta de conversión del LAN legado en interfaz y dirección IPv4. */
export interface CreateRouterInterfaceConversionResponseDto {
  interface: RouterInterfaceDto;
  address: RouterInterfaceIpv4AddressDto | null;
  router: RouterDto;
}

export interface CorrectRouterInterfaceIpv4AddressResponseDto {
  address: RouterInterfaceIpv4AddressDto;
  releasedHost: string | null;
}

export interface CatalogMetaDto {
  ipProtection: 'ACTIVE' | 'PENDING';
}

export interface ProvisioningMetaDto {
  reservationsPaused: boolean;
}

export interface NetworkErrorResponseDto {
  code: NetworkErrorCode | NetworkGlobalErrorCode;
  message: string;
}

export interface PlanProfileDto {
  planId: string;
  pcqAddressList: string;
  updatedAt: string;
  updatedBy: ActorRefDto | null;
}

export interface NetworkSettingsDto {
  enforceProvisioningOnInstallClose: boolean;
  updatedAt: string | null;
  updatedBy: ActorRefDto | null;
}

export type RouterInstruction =
  | { mode: 'MANUAL'; steps: string[] }
  | { mode: 'APPLIED'; reference: string };

export interface ServiceProvisioningDto {
  id: string;
  status: ServiceProvisioningStatus;
  origin: 'NORMAL' | 'REGULARIZED';
  executionOrderId: string;
  executionOrderNumber: string;
  subscriberId: string;
  contractId: string | null;
  router: { id: string; name: string };
  network: { id: string; name: string; cidr: string };
  ip: string | null;
  controlMethod: ControlMethod;
  controlParams: ControlParams;
  plan: { planId: string; downloadMbps: number | null; uploadMbps: number | null } | null;
  cpe: { serialNumber: string; macAddress: string | null } | null;
  reservedBy: ActorRefDto | null;
  reservedAt: string | null;
  certifiedBy: ActorRefDto | null;
  certifiedAt: string | null;
  certificationEvidenceId: string | null;
  regularizedBy: ActorRefDto | null;
  regularizedAt: string | null;
  regularizationReason: string | null;
  activatedAt: string | null;
  releasedBy: ActorRefDto | null;
  releasedAt: string | null;
  releaseReason: ProvisioningReleaseReason | null;
  failureReason: 'CLOSED_WITHOUT_CERTIFICATION' | null;
  commercialActivation: {
    status: CommercialActivationStatus;
    detail: 'CONTACT_REQUIRED' | 'FISCAL_INCOMPLETE' | 'NO_EXPEDIENTE' | null;
  };
  routerInstruction: RouterInstruction | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface ProvisioningOrderContextDto {
  executionOrder: {
    id: string;
    executionOrderNumber: string;
    status: ExecutionOrderStatus;
    workType: WfmWorkType;
    assignedTechnician: ActorRefDto | null;
    canCertify: boolean;
  };
  subscriber: { id: string; displayLabel: string };
  plan: {
    planId: string;
    downloadMbps: number | null;
    uploadMbps: number | null;
    pcqAddressList: string | null;
  } | null;
  contracts: Array<{ id: string; alias: string | null; status: string }>;
  cpe: { serialNumber: string; macAddress: string | null; model: string | null } | null;
  evidences: Array<{
    id: string;
    evidenceType: 'PHOTO' | 'DOCUMENT';
    requirementKey: string | null;
    createdAt: string;
  }>;
  provisioning: ServiceProvisioningDto | null;
  suggestedQueueName: string;
}

export interface TechnicianProvisioningViewDto {
  executionOrderId: string;
  status: ServiceProvisioningStatus | null;
  ip: string | null;
  certified: boolean;
  updatedAt: string | null;
}

export type ProvisioningInboxQueue = 'IN_EXECUTION' | 'FAILED' | 'CLOSED_UNPROVISIONED';

export interface ProvisioningInboxRowDto {
  queue: ProvisioningInboxQueue;
  executionOrderId: string;
  executionOrderNumber: string;
  executionOrderStatus: ExecutionOrderStatus;
  subscriberId: string | null;
  subscriberDisplayLabel: string;
  assignedTechnician: ActorRefDto | null;
  serviceProvisioningId: string | null;
  provisioningStatus: ServiceProvisioningStatus | null;
  ip: string | null;
  failureReason: 'CLOSED_WITHOUT_CERTIFICATION' | null;
  closedAt: string | null;
  updatedAt: string;
}
