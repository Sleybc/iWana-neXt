import {
  ApiExtraModels,
  ApiProperty,
  ApiPropertyOptional,
  ApiSchema,
  getSchemaPath,
} from '@nestjs/swagger';
import { Allow, IsInt, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import {
  CONTROL_METHODS,
  COMMERCIAL_ACTIVATION_STATUSES,
  NETWORK_ERROR_CODES,
  NETWORK_GLOBAL_ERROR_CODES,
  OrganizationSiteType,
  PROVISIONING_RELEASE_REASONS,
  SERVICE_PROVISIONING_STATUSES,
  ExecutionOrderStatus,
  WfmWorkType,
  type ControlMethod,
} from '@iwana/shared';
import type { CorrectionReason, RouterInterfaceKind, RouterInterfaceStatus } from '@iwana/shared';

@ApiSchema(strictApiSchema('UpdateRouterBody'))
export class UpdateRouterBodyDto {
  @ApiPropertyOptional({ minLength: 1, maxLength: 120, pattern: '\\S' })
  @Allow()
  name?: string;

  @ApiPropertyOptional({ description: 'Dirección IPv4 o nombre de dominio completo.' })
  @Allow()
  managementHost?: string;

  @ApiPropertyOptional({ maxLength: 64 })
  @Allow()
  lanInterface?: string;

  @ApiPropertyOptional({ enum: CONTROL_METHODS, isArray: true, minItems: 1, uniqueItems: true })
  @Allow()
  supportedControlMethods?: ControlMethod[];

  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true })
  @Allow()
  organizationSiteId?: string | null;

  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true })
  @Allow()
  commercialNodeId?: string | null;

  @ApiPropertyOptional({ maxLength: 1000 })
  @Allow()
  notes?: string;

  @ApiProperty({ type: 'integer', minimum: 1 })
  @Allow()
  version!: number;
}

@ApiSchema({ name: 'OrganizationSiteSummary' })
export class OrganizationSiteSummaryResponseDto {
  @ApiProperty()
  @Allow()
  name!: string;

  @ApiProperty({ enum: OrganizationSiteType })
  @Allow()
  siteType!: OrganizationSiteType;

  @ApiProperty()
  @Allow()
  isActive!: boolean;
}

@ApiSchema({ name: 'CommercialNodeSummary' })
export class CommercialNodeSummaryResponseDto {
  @ApiProperty()
  @Allow()
  name!: string;

  @ApiProperty()
  @Allow()
  isActive!: boolean;
}

@ApiSchema({ name: 'RouterSiteOptionDto' })
export class RouterSiteOptionResponseDto {
  @ApiProperty({ format: 'uuid' })
  @Allow()
  id!: string;

  @ApiProperty()
  @Allow()
  name!: string;

  @ApiProperty({ enum: OrganizationSiteType })
  @Allow()
  siteType!: OrganizationSiteType;

  @ApiProperty()
  @Allow()
  isActive!: boolean;
}

@ApiSchema({ name: 'RouterSiteOptionsQuery' })
export class RouterSiteOptionsQueryDto {
  @ApiPropertyOptional({ type: 'integer', minimum: 1, default: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({ type: 'integer', minimum: 1, maximum: 100, default: 20 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;
}

@ApiSchema({ name: 'CatalogMetaDto' })
export class CatalogMetaResponseDto {
  @ApiProperty({ enum: ['ACTIVE', 'PENDING'] })
  @Allow()
  ipProtection!: 'ACTIVE' | 'PENDING';
}

@ApiSchema({ name: 'ProvisioningMetaDto' })
export class ProvisioningMetaResponseDto {
  @ApiProperty()
  @Allow()
  reservationsPaused!: boolean;
}

function strictApiSchema(name: string, schema: Record<string, unknown> = {}) {
  return { name, additionalProperties: false, ...schema };
}

@ApiSchema(strictApiSchema('SimpleQueueControlParamsDto'))
export class SimpleQueueControlParamsResponseDto {
  @ApiProperty({ enum: ['SIMPLE_QUEUE_STATIC_IP'] })
  method!: 'SIMPLE_QUEUE_STATIC_IP';

  @ApiProperty({ minLength: 1, maxLength: 64, pattern: '^[A-Za-z0-9._-]+$' })
  queueName!: string;
}

@ApiSchema(strictApiSchema('PcqAddressListControlParamsDto'))
export class PcqAddressListControlParamsResponseDto {
  @ApiProperty({ enum: ['PCQ_ADDRESS_LIST'] })
  method!: 'PCQ_ADDRESS_LIST';

  @ApiProperty({ minLength: 1, maxLength: 64, pattern: '^[A-Za-z0-9._-]+$' })
  addressList!: string;
}

@ApiSchema(strictApiSchema('ManualRouterInstructionDto'))
export class ManualRouterInstructionResponseDto {
  @ApiProperty({ enum: ['MANUAL'] })
  mode!: 'MANUAL';

  @ApiProperty({ type: String, isArray: true })
  steps!: string[];
}

@ApiSchema(strictApiSchema('AppliedRouterInstructionDto'))
export class AppliedRouterInstructionResponseDto {
  @ApiProperty({ enum: ['APPLIED'] })
  mode!: 'APPLIED';

  @ApiProperty()
  reference!: string;
}

@ApiSchema(strictApiSchema('ReserveProvisioningBody'))
export class ReserveProvisioningBodyDto {
  @ApiProperty({ format: 'uuid' })
  executionOrderId!: string;

  @ApiProperty({ format: 'uuid' })
  routerId!: string;

  @ApiProperty({ format: 'uuid' })
  ipv4NetworkId!: string;

  @ApiPropertyOptional({ type: String, format: 'ipv4', example: '192.0.2.21' })
  requestedIp?: string;

  @ApiProperty({
    oneOf: [
      { $ref: getSchemaPath(SimpleQueueControlParamsResponseDto) },
      { $ref: getSchemaPath(PcqAddressListControlParamsResponseDto) },
    ],
    discriminator: {
      propertyName: 'method',
      mapping: {
        SIMPLE_QUEUE_STATIC_IP: getSchemaPath(SimpleQueueControlParamsResponseDto),
        PCQ_ADDRESS_LIST: getSchemaPath(PcqAddressListControlParamsResponseDto),
      },
    },
  })
  controlParams!: object;

  @ApiPropertyOptional({ format: 'uuid' })
  contractId?: string;
}

@ApiSchema(strictApiSchema('RegularizeProvisioningBody'))
export class RegularizeProvisioningBodyDto extends ReserveProvisioningBodyDto {
  @ApiProperty({
    minLength: 10,
    maxLength: 500,
    description: 'Motivo de regularización, sin espacios externos tras normalización.',
  })
  reason!: string;
}

@ApiSchema(strictApiSchema('CertifyProvisioningBody'))
export class CertifyProvisioningBodyDto {
  @ApiProperty({ format: 'uuid' })
  evidenceId!: string;

  @ApiProperty({ minimum: 1, type: 'integer' })
  version!: number;
}

@ApiSchema(strictApiSchema('ReleaseProvisioningBody'))
export class ReleaseProvisioningBodyDto {
  @ApiProperty({ minimum: 1, type: 'integer' })
  version!: number;

  @ApiProperty({ minLength: 10, maxLength: 500 })
  reason!: string;
}

@ApiSchema({ name: 'ProvisioningActorRefDto' })
export class ProvisioningActorRefResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ type: String, nullable: true })
  name!: string | null;
}

@ApiSchema({ name: 'ProvisioningRouterDto' })
export class ProvisioningRouterResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  name!: string;
}

@ApiSchema({ name: 'ProvisioningNetworkDto' })
export class ProvisioningNetworkResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  cidr!: string;
}

@ApiSchema({ name: 'ProvisioningPlanDto' })
export class ProvisioningPlanResponseDto {
  @ApiProperty()
  planId!: string;

  @ApiProperty({ type: Number, nullable: true })
  downloadMbps!: number | null;

  @ApiProperty({ type: Number, nullable: true })
  uploadMbps!: number | null;
}

@ApiSchema({ name: 'ProvisioningCpeDto' })
export class ProvisioningCpeResponseDto {
  @ApiProperty()
  serialNumber!: string;

  @ApiProperty({ type: String, nullable: true })
  macAddress!: string | null;
}

@ApiSchema({ name: 'CommercialActivationDto' })
export class CommercialActivationResponseDto {
  @ApiProperty({ enum: COMMERCIAL_ACTIVATION_STATUSES })
  status!: (typeof COMMERCIAL_ACTIVATION_STATUSES)[number];

  @ApiProperty({
    type: String,
    nullable: true,
    enum: ['CONTACT_REQUIRED', 'FISCAL_INCOMPLETE', 'NO_EXPEDIENTE', null],
  })
  detail!: 'CONTACT_REQUIRED' | 'FISCAL_INCOMPLETE' | 'NO_EXPEDIENTE' | null;
}

@ApiSchema({ name: 'ServiceProvisioningDto' })
@ApiExtraModels(
  ProvisioningActorRefResponseDto,
  ProvisioningRouterResponseDto,
  ProvisioningNetworkResponseDto,
  ProvisioningPlanResponseDto,
  ProvisioningCpeResponseDto,
  CommercialActivationResponseDto,
  SimpleQueueControlParamsResponseDto,
  PcqAddressListControlParamsResponseDto,
  ManualRouterInstructionResponseDto,
  AppliedRouterInstructionResponseDto,
)
export class ServiceProvisioningResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: SERVICE_PROVISIONING_STATUSES })
  status!: (typeof SERVICE_PROVISIONING_STATUSES)[number];

  @ApiProperty({ enum: ['NORMAL', 'REGULARIZED'] })
  origin!: 'NORMAL' | 'REGULARIZED';

  @ApiProperty({ format: 'uuid' })
  executionOrderId!: string;

  @ApiProperty()
  executionOrderNumber!: string;

  @ApiProperty({ format: 'uuid' })
  subscriberId!: string;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  contractId!: string | null;

  @ApiProperty({ type: ProvisioningRouterResponseDto })
  router!: ProvisioningRouterResponseDto;

  @ApiProperty({ type: ProvisioningNetworkResponseDto })
  network!: ProvisioningNetworkResponseDto;

  @ApiProperty({ type: String, format: 'ipv4', nullable: true })
  ip!: string | null;

  @ApiProperty({ enum: CONTROL_METHODS })
  controlMethod!: ControlMethod;

  @ApiProperty({
    oneOf: [
      { $ref: getSchemaPath(SimpleQueueControlParamsResponseDto) },
      { $ref: getSchemaPath(PcqAddressListControlParamsResponseDto) },
    ],
    discriminator: {
      propertyName: 'method',
      mapping: {
        SIMPLE_QUEUE_STATIC_IP: getSchemaPath(SimpleQueueControlParamsResponseDto),
        PCQ_ADDRESS_LIST: getSchemaPath(PcqAddressListControlParamsResponseDto),
      },
    },
  })
  controlParams!: object;

  @ApiProperty({ type: ProvisioningPlanResponseDto, nullable: true })
  plan!: ProvisioningPlanResponseDto | null;

  @ApiProperty({ type: ProvisioningCpeResponseDto, nullable: true })
  cpe!: ProvisioningCpeResponseDto | null;

  @ApiProperty({ type: ProvisioningActorRefResponseDto, nullable: true })
  reservedBy!: ProvisioningActorRefResponseDto | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  reservedAt!: string | null;

  @ApiProperty({ type: ProvisioningActorRefResponseDto, nullable: true })
  certifiedBy!: ProvisioningActorRefResponseDto | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  certifiedAt!: string | null;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  certificationEvidenceId!: string | null;

  @ApiProperty({ type: ProvisioningActorRefResponseDto, nullable: true })
  regularizedBy!: ProvisioningActorRefResponseDto | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  regularizedAt!: string | null;

  @ApiProperty({ type: String, nullable: true })
  regularizationReason!: string | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  activatedAt!: string | null;

  @ApiProperty({ type: ProvisioningActorRefResponseDto, nullable: true })
  releasedBy!: ProvisioningActorRefResponseDto | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  releasedAt!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    enum: [...PROVISIONING_RELEASE_REASONS, null],
  })
  releaseReason!: (typeof PROVISIONING_RELEASE_REASONS)[number] | null;

  @ApiProperty({
    type: String,
    nullable: true,
    enum: ['CLOSED_WITHOUT_CERTIFICATION', null],
  })
  failureReason!: 'CLOSED_WITHOUT_CERTIFICATION' | null;

  @ApiProperty({ type: CommercialActivationResponseDto })
  commercialActivation!: CommercialActivationResponseDto;

  @ApiProperty({
    oneOf: [
      { $ref: getSchemaPath(ManualRouterInstructionResponseDto) },
      { $ref: getSchemaPath(AppliedRouterInstructionResponseDto) },
    ],
    discriminator: { propertyName: 'mode' },
    nullable: true,
  })
  routerInstruction!:
    | ManualRouterInstructionResponseDto
    | AppliedRouterInstructionResponseDto
    | null;

  @ApiProperty({ minimum: 1, type: 'integer' })
  version!: number;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;
}

@ApiSchema({ name: 'ListMetaDto' })
export class ProvisioningListMetaResponseDto {
  @ApiProperty({ type: String, nullable: true })
  nextCursor!: string | null;

  @ApiProperty({ minimum: 0, type: 'integer' })
  total!: number;

  @ApiProperty()
  totalIsEstimate!: boolean;

  @ApiProperty({ minimum: 1, type: 'integer', nullable: true })
  page!: number | null;

  @ApiProperty({ minimum: 1, type: 'integer' })
  limit!: number;

  @ApiProperty({ minimum: 0, type: 'integer', nullable: true })
  totalPages!: number | null;

  @ApiProperty()
  hasMore!: boolean;

  @ApiProperty({ enum: ['page', 'cursor'] })
  mode!: 'page' | 'cursor';

  @ApiProperty({
    allOf: [
      {
        type: 'object',
        properties: {
          randomAccess: { type: 'boolean' },
          sortableFields: { type: 'array', items: { type: 'string' } },
        },
        required: ['randomAccess', 'sortableFields'],
      },
    ],
  })
  capabilities!: { randomAccess: boolean; sortableFields: string[] };

  @ApiProperty({
    nullable: true,
    allOf: [
      {
        type: 'object',
        properties: { by: { type: 'string' }, dir: { type: 'string', enum: ['asc', 'desc'] } },
        required: ['by', 'dir'],
      },
    ],
  })
  sort!: { by: string; dir: 'asc' | 'desc' } | null;
}

@ApiSchema({ name: 'ProvisioningInboxRowDto' })
export class ProvisioningInboxRowResponseDto {
  @ApiProperty({ enum: ['IN_EXECUTION', 'FAILED', 'CLOSED_UNPROVISIONED'] })
  queue!: 'IN_EXECUTION' | 'FAILED' | 'CLOSED_UNPROVISIONED';

  @ApiProperty({ format: 'uuid' })
  executionOrderId!: string;

  @ApiProperty()
  executionOrderNumber!: string;

  @ApiProperty({ enum: ExecutionOrderStatus })
  executionOrderStatus!: ExecutionOrderStatus;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  subscriberId!: string | null;

  @ApiProperty()
  subscriberDisplayLabel!: string;

  @ApiProperty({ type: ProvisioningActorRefResponseDto, nullable: true })
  assignedTechnician!: ProvisioningActorRefResponseDto | null;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  serviceProvisioningId!: string | null;

  @ApiProperty({
    type: String,
    enum: [...SERVICE_PROVISIONING_STATUSES, null],
    nullable: true,
  })
  provisioningStatus!: (typeof SERVICE_PROVISIONING_STATUSES)[number] | null;

  @ApiProperty({ type: String, format: 'ipv4', nullable: true })
  ip!: string | null;

  @ApiProperty({ type: String, enum: ['CLOSED_WITHOUT_CERTIFICATION', null], nullable: true })
  failureReason!: 'CLOSED_WITHOUT_CERTIFICATION' | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  closedAt!: string | null;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;
}

@ApiSchema({ name: 'ProvisioningInboxListResponseDto' })
@ApiExtraModels(ProvisioningInboxRowResponseDto, ProvisioningListMetaResponseDto)
export class ProvisioningInboxListResponseDto {
  @ApiProperty({ type: ProvisioningInboxRowResponseDto, isArray: true })
  data!: ProvisioningInboxRowResponseDto[];

  @ApiProperty({ type: ProvisioningListMetaResponseDto })
  meta!: ProvisioningListMetaResponseDto;
}

@ApiSchema({ name: 'ProvisioningOrderContextDto' })
@ApiExtraModels(ServiceProvisioningResponseDto)
export class ProvisioningOrderContextResponseDto {
  @ApiProperty({
    allOf: [
      {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          executionOrderNumber: { type: 'string' },
          status: { type: 'string', enum: Object.values(ExecutionOrderStatus) },
          workType: { type: 'string', enum: Object.values(WfmWorkType) },
          assignedTechnician: {
            nullable: true,
            allOf: [{ $ref: getSchemaPath(ProvisioningActorRefResponseDto) }],
          },
          canCertify: { type: 'boolean' },
        },
        required: [
          'id',
          'executionOrderNumber',
          'status',
          'workType',
          'assignedTechnician',
          'canCertify',
        ],
      },
    ],
  })
  executionOrder!: object;

  @ApiProperty({
    allOf: [
      {
        type: 'object',
        properties: { id: { type: 'string', format: 'uuid' }, displayLabel: { type: 'string' } },
        required: ['id', 'displayLabel'],
      },
    ],
  })
  subscriber!: object;

  @ApiProperty({
    nullable: true,
    allOf: [
      {
        type: 'object',
        properties: {
          planId: { type: 'string' },
          downloadMbps: { type: 'number', nullable: true },
          uploadMbps: { type: 'number', nullable: true },
          pcqAddressList: { type: 'string', nullable: true },
        },
        required: ['planId', 'downloadMbps', 'uploadMbps', 'pcqAddressList'],
      },
    ],
  })
  plan!: object | null;

  @ApiProperty({
    type: 'array',
    items: {
      type: 'object',
      properties: {
        id: { type: 'string', format: 'uuid' },
        alias: { type: 'string', nullable: true },
        status: { type: 'string' },
      },
      required: ['id', 'alias', 'status'],
    },
  })
  contracts!: object[];

  @ApiProperty({
    nullable: true,
    allOf: [
      {
        type: 'object',
        properties: {
          serialNumber: { type: 'string' },
          macAddress: { type: 'string', nullable: true },
          model: { type: 'string', nullable: true },
        },
        required: ['serialNumber', 'macAddress', 'model'],
      },
    ],
  })
  cpe!: object | null;

  @ApiProperty({
    type: 'array',
    items: {
      type: 'object',
      properties: {
        id: { type: 'string', format: 'uuid' },
        evidenceType: { type: 'string', enum: ['PHOTO', 'DOCUMENT'] },
        requirementKey: { type: 'string', nullable: true },
        createdAt: { type: 'string', format: 'date-time' },
      },
      required: ['id', 'evidenceType', 'requirementKey', 'createdAt'],
    },
  })
  evidences!: object[];

  @ApiProperty({ type: ServiceProvisioningResponseDto, nullable: true })
  provisioning!: ServiceProvisioningResponseDto | null;

  @ApiProperty()
  suggestedQueueName!: string;
}

@ApiSchema({ name: 'TechnicianProvisioningViewDto' })
export class TechnicianProvisioningViewResponseDto {
  @ApiProperty({ format: 'uuid' })
  executionOrderId!: string;

  @ApiProperty({
    type: String,
    enum: [...SERVICE_PROVISIONING_STATUSES, null],
    nullable: true,
  })
  status!: (typeof SERVICE_PROVISIONING_STATUSES)[number] | null;

  @ApiProperty({ type: String, format: 'ipv4', nullable: true })
  ip!: string | null;

  @ApiProperty()
  certified!: boolean;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  updatedAt!: string | null;
}

@ApiSchema({ name: 'NetworkErrorDto' })
export class NetworkErrorResponseDto {
  @ApiProperty({
    enum: [...NETWORK_ERROR_CODES, ...NETWORK_GLOBAL_ERROR_CODES],
    description: 'Código estable del contrato de red.',
  })
  @Allow()
  code!: (typeof NETWORK_ERROR_CODES)[number] | (typeof NETWORK_GLOBAL_ERROR_CODES)[number];

  @ApiProperty({ description: 'Mensaje uniforme sin identificadores internos.' })
  @Allow()
  message!: string;
}

@ApiSchema({ name: 'UnauthorizedResponseDto' })
export class UnauthorizedResponseDto {
  @ApiProperty()
  @Allow()
  message!: string;

  @ApiPropertyOptional({ type: 'integer', enum: [401] })
  @Allow()
  statusCode?: 401;

  @ApiPropertyOptional({ enum: ['Unauthorized'] })
  @Allow()
  error?: 'Unauthorized';
}

@ApiSchema({ name: 'NestBadRequestDto' })
export class NestBadRequestResponseDto {
  @ApiProperty({ type: 'integer', enum: [400] })
  statusCode!: 400;

  @ApiProperty({ oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }] })
  message!: string | string[];

  @ApiProperty({ enum: ['Bad Request'] })
  error!: 'Bad Request';
}

@ApiSchema({ name: 'ReservationAvailabilityDto' })
export class ReservationAvailabilityResponseDto {
  @ApiProperty()
  @Allow()
  available!: boolean;

  @ApiProperty({
    enum: ['ROUTER_INACTIVE', 'NETWORK_INACTIVE', 'INTERFACE_INACTIVE'],
    nullable: true,
  })
  @Allow()
  reason!: 'ROUTER_INACTIVE' | 'NETWORK_INACTIVE' | 'INTERFACE_INACTIVE' | null;
}

@ApiSchema({ name: 'RouterInterfaceRefDto' })
export class RouterInterfaceRefResponseDto {
  @ApiProperty({ format: 'uuid' })
  @Allow()
  id!: string;

  @ApiProperty()
  @Allow()
  name!: string;

  @ApiProperty({ enum: ['ACTIVE', 'INACTIVE'] })
  @Allow()
  status!: RouterInterfaceStatus;
}

@ApiSchema({ name: 'RouterInterfaceDto' })
export class RouterInterfaceResponseDto {
  @ApiProperty({ format: 'uuid' })
  @Allow()
  id!: string;

  @ApiProperty({ format: 'uuid' })
  @Allow()
  routerId!: string;

  @ApiProperty({ minLength: 1, maxLength: 64 })
  @Allow()
  name!: string;

  @ApiProperty({ enum: ['PHYSICAL', 'BRIDGE', 'VLAN', 'OTHER'] })
  @Allow()
  kind!: RouterInterfaceKind;

  @ApiProperty({ type: String, nullable: true })
  @Allow()
  notes!: string | null;

  @ApiProperty({ enum: ['ACTIVE', 'INACTIVE'] })
  @Allow()
  status!: RouterInterfaceStatus;

  @ApiProperty({ type: 'integer', minimum: 0 })
  @Allow()
  ipv4AddressCount!: number;

  @ApiProperty({ type: 'integer', minimum: 0 })
  @Allow()
  networkCount!: number;

  @ApiProperty({ type: 'integer', minimum: 1 })
  @Allow()
  version!: number;

  @ApiProperty({ format: 'date-time' })
  @Allow()
  createdAt!: string;

  @ApiProperty({ format: 'date-time' })
  @Allow()
  updatedAt!: string;
}

@ApiSchema({ name: 'RouterInterfaceIpv4AddressDto' })
export class RouterInterfaceIpv4AddressResponseDto {
  @ApiProperty({ format: 'uuid' })
  @Allow()
  id!: string;

  @ApiProperty({ format: 'uuid' })
  @Allow()
  routerId!: string;

  @ApiProperty({ format: 'uuid' })
  @Allow()
  interfaceId!: string;

  @ApiProperty({ example: '192.0.2.10/24' })
  @Allow()
  addressWithPrefix!: string;

  @ApiProperty({ format: 'ipv4' })
  @Allow()
  host!: string;

  @ApiProperty({ type: 'integer', minimum: 1, maximum: 32 })
  @Allow()
  prefixLength!: number;

  @ApiProperty({ type: String, nullable: true })
  @Allow()
  notes!: string | null;

  @ApiProperty({ type: 'integer', minimum: 1 })
  @Allow()
  version!: number;

  @ApiProperty({ format: 'date-time' })
  @Allow()
  createdAt!: string;

  @ApiProperty({ format: 'date-time' })
  @Allow()
  updatedAt!: string;
}

@ApiSchema({ name: 'CorrectRouterInterfaceIpv4AddressResponseDto' })
@ApiExtraModels(RouterInterfaceIpv4AddressResponseDto)
export class CorrectRouterInterfaceIpv4AddressResponseDto {
  @ApiProperty({ type: RouterInterfaceIpv4AddressResponseDto })
  @Allow()
  address!: RouterInterfaceIpv4AddressResponseDto;

  @ApiProperty({ type: String, format: 'ipv4', nullable: true })
  @Allow()
  releasedHost!: string | null;
}

@ApiSchema(strictApiSchema('CreateRouterInterfaceBaseBody'))
export class CreateRouterInterfaceBaseBodyDto {
  @ApiProperty({ minLength: 1, maxLength: 64, pattern: '\\S' })
  @Allow()
  name!: string;

  @ApiProperty({ enum: ['PHYSICAL', 'BRIDGE', 'VLAN', 'OTHER'] })
  @Allow()
  kind!: RouterInterfaceKind;

  @ApiPropertyOptional({ maxLength: 1000 })
  @Allow()
  notes?: string;
}

@ApiSchema(strictApiSchema('ConvertLegacyLanAddressBody'))
export class ConvertLegacyLanAddressBodyDto {
  @ApiProperty({
    description: 'Dirección IPv4 y prefijo explícito /1–/32.',
    example: '192.0.2.7/24',
  })
  @Allow()
  addressWithPrefix!: string;
}

@ApiSchema(strictApiSchema('ConvertLegacyLanBody'))
@ApiExtraModels(ConvertLegacyLanAddressBodyDto)
export class ConvertLegacyLanBodyDto {
  @ApiProperty({ type: Boolean })
  @Allow()
  convertLegacyLan!: true;

  @ApiProperty({ type: 'integer', minimum: 1 })
  @Allow()
  routerVersion!: number;

  @ApiProperty({ minLength: 1, maxLength: 64, pattern: '\\S' })
  @Allow()
  name!: string;

  @ApiProperty({ enum: ['PHYSICAL', 'BRIDGE', 'VLAN', 'OTHER'] })
  @Allow()
  kind!: RouterInterfaceKind;

  @ApiPropertyOptional({ maxLength: 1000 })
  @Allow()
  notes?: string;

  @ApiPropertyOptional({ type: ConvertLegacyLanAddressBodyDto })
  @Allow()
  address?: ConvertLegacyLanAddressBodyDto;
}

@ApiSchema(strictApiSchema('UpdateRouterInterfaceBody'))
export class UpdateRouterInterfaceBodyDto {
  @ApiPropertyOptional({ minLength: 1, maxLength: 64, pattern: '\\S' })
  @Allow()
  name?: string;

  @ApiPropertyOptional({ enum: ['PHYSICAL', 'BRIDGE', 'VLAN', 'OTHER'] })
  @Allow()
  kind?: RouterInterfaceKind;

  @ApiPropertyOptional({ type: String, maxLength: 1000, nullable: true })
  @Allow()
  notes?: string | null;

  @ApiProperty({ type: 'integer', minimum: 1 })
  @Allow()
  version!: number;
}

@ApiSchema(strictApiSchema('CreateRouterInterfaceIpv4AddressBody'))
export class CreateRouterInterfaceIpv4AddressBodyDto {
  @ApiProperty({ example: '192.0.2.10/24' })
  @Allow()
  addressWithPrefix!: string;

  @ApiPropertyOptional({ maxLength: 1000 })
  @Allow()
  notes?: string;
}

@ApiSchema(strictApiSchema('UpdateRouterInterfaceIpv4AddressBody'))
export class UpdateRouterInterfaceIpv4AddressBodyDto {
  @ApiPropertyOptional({ type: String, maxLength: 1000, nullable: true })
  @Allow()
  notes?: string | null;

  @ApiProperty({ type: 'integer', minimum: 1 })
  @Allow()
  version!: number;
}

@ApiSchema(strictApiSchema('CorrectRouterInterfaceIpv4AddressBody'))
export class CorrectRouterInterfaceIpv4AddressBodyDto {
  @ApiProperty({ example: '192.0.2.11/24' })
  @Allow()
  newAddress!: string;

  @ApiProperty({ type: 'integer', minimum: 1 })
  @Allow()
  version!: number;

  @ApiProperty({ enum: ['ERROR_DE_REGISTRO', 'CAMBIO_DE_EQUIPO', 'REASIGNACION_PLANIFICADA'] })
  @Allow()
  reason!: CorrectionReason;

  @ApiPropertyOptional()
  @Allow()
  confirmReleasedHost?: boolean;
}

@ApiSchema(strictApiSchema('ManualCidrSource'))
export class ManualCidrSourceDto {
  @ApiProperty({ enum: ['MANUAL_CIDR'] })
  @Allow()
  mode!: 'MANUAL_CIDR';

  @ApiProperty({ example: '192.0.2.0/24' })
  @Allow()
  cidr!: string;

  @ApiProperty({ format: 'ipv4', example: '192.0.2.1' })
  @Allow()
  gateway!: string;
}

@ApiSchema(strictApiSchema('IpPrefixSource'))
export class IpPrefixSourceDto {
  @ApiProperty({ enum: ['IP_PREFIX'] })
  @Allow()
  mode!: 'IP_PREFIX';

  @ApiProperty({ example: '192.0.2.10/24' })
  @Allow()
  addressWithPrefix!: string;

  @ApiProperty({ example: '192.0.2.0/24' })
  @Allow()
  confirmedCidr!: string;

  @ApiProperty({
    format: 'ipv4',
    example: '192.0.2.1',
    description:
      'Gateway confirmado editable e independiente de la dirección fuente, dentro del CIDR confirmado.',
  })
  @Allow()
  confirmedGateway!: string;
}

@ApiSchema(strictApiSchema('InterfaceAddressSource'))
export class InterfaceAddressSourceDto {
  @ApiProperty({ enum: ['INTERFACE_ADDRESS'] })
  @Allow()
  mode!: 'INTERFACE_ADDRESS';

  @ApiProperty({ format: 'uuid' })
  @Allow()
  interfaceAddressId!: string;

  @ApiProperty({ type: 'integer', minimum: 1 })
  @Allow()
  interfaceAddressVersion!: number;

  @ApiProperty({ example: '192.0.2.0/24' })
  @Allow()
  confirmedCidr!: string;

  @ApiProperty({
    format: 'ipv4',
    example: '192.0.2.1',
    description:
      'Gateway confirmado editable e independiente de la dirección candidata, dentro del CIDR confirmado.',
  })
  @Allow()
  confirmedGateway!: string;
}

@ApiSchema(
  strictApiSchema('AssistedCreateIpv4NetworkBody', {
    allOf: [
      {
        oneOf: [
          {
            not: {
              anyOf: [{ required: ['interfaceId'] }, { required: ['interfaceVersion'] }],
            },
          },
          {
            type: 'object',
            properties: {
              interfaceId: { type: 'string', nullable: true, enum: [null] },
            },
            required: ['interfaceId'],
            not: { required: ['interfaceVersion'] },
          },
          {
            type: 'object',
            properties: {
              interfaceId: { type: 'string', format: 'uuid' },
              interfaceVersion: { type: 'integer', minimum: 1 },
            },
            required: ['interfaceId', 'interfaceVersion'],
          },
        ],
      },
      {
        oneOf: [
          {
            required: ['source'],
            properties: {
              source: {
                not: {
                  required: ['mode'],
                  properties: { mode: { enum: ['INTERFACE_ADDRESS'] } },
                },
              },
            },
          },
          {
            required: ['source', 'interfaceId'],
            properties: {
              source: {
                required: ['mode'],
                properties: { mode: { enum: ['INTERFACE_ADDRESS'] } },
              },
              interfaceId: { type: 'string', format: 'uuid' },
            },
          },
        ],
      },
    ],
  }),
)
@ApiExtraModels(ManualCidrSourceDto, IpPrefixSourceDto, InterfaceAddressSourceDto)
export class AssistedCreateIpv4NetworkBodyDto {
  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true })
  @Allow()
  interfaceId?: string | null;

  @ApiPropertyOptional({ type: 'integer', minimum: 1 })
  @Allow()
  interfaceVersion?: number;

  @ApiPropertyOptional({ maxLength: 120 })
  @Allow()
  name?: string;

  @ApiProperty({ format: 'ipv4' })
  @Allow()
  assignableFrom!: string;

  @ApiProperty({ format: 'ipv4' })
  @Allow()
  assignableTo!: string;

  @ApiPropertyOptional({ type: String, isArray: true, maxItems: 256, format: 'ipv4' })
  @Allow()
  excludedIps?: string[];

  @ApiProperty({ enum: CONTROL_METHODS })
  @Allow()
  defaultControlMethod!: ControlMethod;

  @ApiProperty({
    oneOf: [
      { $ref: getSchemaPath(ManualCidrSourceDto) },
      { $ref: getSchemaPath(IpPrefixSourceDto) },
      { $ref: getSchemaPath(InterfaceAddressSourceDto) },
    ],
    discriminator: {
      propertyName: 'mode',
      mapping: {
        MANUAL_CIDR: getSchemaPath(ManualCidrSourceDto),
        IP_PREFIX: getSchemaPath(IpPrefixSourceDto),
        INTERFACE_ADDRESS: getSchemaPath(InterfaceAddressSourceDto),
      },
    },
  })
  @Allow()
  source!: ManualCidrSourceDto | IpPrefixSourceDto | InterfaceAddressSourceDto;
}

@ApiSchema(
  strictApiSchema('UpdateIpv4NetworkBody', {
    allOf: [
      {
        oneOf: [
          {
            not: {
              anyOf: [{ required: ['interfaceId'] }, { required: ['interfaceVersion'] }],
            },
          },
          {
            type: 'object',
            properties: { interfaceId: { type: 'string', nullable: true, enum: [null] } },
            required: ['interfaceId'],
            not: { required: ['interfaceVersion'] },
          },
          {
            type: 'object',
            properties: {
              interfaceId: { type: 'string', format: 'uuid' },
              interfaceVersion: { type: 'integer', minimum: 1 },
            },
            required: ['interfaceId', 'interfaceVersion'],
          },
        ],
      },
    ],
  }),
)
export class UpdateIpv4NetworkBodyDto {
  @ApiPropertyOptional({ minLength: 1, maxLength: 120, pattern: '\\S' })
  @Allow()
  name?: string;

  @ApiPropertyOptional({ format: 'ipv4' })
  @Allow()
  assignableFrom?: string;

  @ApiPropertyOptional({ format: 'ipv4' })
  @Allow()
  assignableTo?: string;

  @ApiPropertyOptional({ type: String, isArray: true, maxItems: 256, format: 'ipv4' })
  @Allow()
  excludedIps?: string[];

  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true })
  @Allow()
  interfaceId?: string | null;

  @ApiPropertyOptional({ type: 'integer', minimum: 1 })
  @Allow()
  interfaceVersion?: number;

  @ApiPropertyOptional({ enum: CONTROL_METHODS })
  @Allow()
  defaultControlMethod?: ControlMethod;

  @ApiProperty({ type: 'integer', minimum: 1 })
  @Allow()
  version!: number;
}

@ApiSchema({ name: 'RouterDetailDto' })
@ApiExtraModels(OrganizationSiteSummaryResponseDto, CommercialNodeSummaryResponseDto)
export class RouterDetailResponseDto {
  @ApiProperty({ format: 'uuid' })
  @Allow()
  id!: string;
  @ApiProperty()
  @Allow()
  name!: string;
  @ApiProperty()
  @Allow()
  managementHost!: string;
  @ApiProperty({ type: String, nullable: true })
  @Allow()
  lanInterface!: string | null;
  @ApiProperty({ enum: CONTROL_METHODS, isArray: true })
  @Allow()
  supportedControlMethods!: ControlMethod[];
  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  @Allow()
  organizationSiteId!: string | null;
  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  @Allow()
  commercialNodeId!: string | null;
  @ApiProperty({ type: OrganizationSiteSummaryResponseDto, nullable: true })
  @Allow()
  organizationSite!: OrganizationSiteSummaryResponseDto | null;
  @ApiProperty({ type: CommercialNodeSummaryResponseDto, nullable: true })
  @Allow()
  commercialNode!: CommercialNodeSummaryResponseDto | null;
  @ApiProperty({ enum: ['ACTIVE', 'INACTIVE'] })
  @Allow()
  status!: 'ACTIVE' | 'INACTIVE';
  @ApiProperty({ type: String, nullable: true })
  @Allow()
  notes!: string | null;
  @ApiProperty({ type: 'integer', minimum: 0 })
  @Allow()
  networkCount!: number;
  @ApiProperty({ type: 'integer', minimum: 0 })
  @Allow()
  interfaceCount!: number;
  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  @Allow()
  legacyLanInterfaceId!: string | null;
  @ApiProperty({ type: 'integer', minimum: 1 })
  @Allow()
  version!: number;
  @ApiProperty({ format: 'date-time' })
  @Allow()
  createdAt!: string;
  @ApiProperty({ format: 'date-time' })
  @Allow()
  updatedAt!: string;
}
