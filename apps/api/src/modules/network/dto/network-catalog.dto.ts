import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsIP,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  Validate,
  ValidateIf,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { ApiExtraModels, ApiProperty, ApiPropertyOptional, ApiSchema } from '@nestjs/swagger';
import { isFQDN, isIP } from 'class-validator';
import { CONTROL_METHODS, type ControlMethod } from '@iwana/shared';
import {
  CommercialNodeSummaryResponseDto,
  OrganizationSiteSummaryResponseDto,
  ReservationAvailabilityResponseDto,
  RouterInterfaceResponseDto,
  RouterInterfaceIpv4AddressResponseDto,
  RouterInterfaceRefResponseDto,
} from './network-interfaces.dto';

const IPV4_OCTET = '(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)';
const IPV4_CIDR_PATTERN = new RegExp(
  `^(?:${IPV4_OCTET}\\.){3}${IPV4_OCTET}\\/(?:1[6-9]|2\\d|30)$`,
  'u',
);

const whenProvided = () => ValidateIf((_object, value: unknown) => value !== undefined);

function strictApiSchema(name: string) {
  return { name, additionalProperties: false };
}

@ValidatorConstraint({ name: 'isIpv4OrFqdn', async: false })
class IsIpv4OrFqdnConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (typeof value !== 'string') return false;
    if (isIP(value, '4')) return true;

    const domain = value.endsWith('.') ? value.slice(0, -1) : value;
    return domain.length <= 253 && isFQDN(value, { require_tld: true, allow_trailing_dot: true });
  }

  defaultMessage(): string {
    return 'Debe ser una dirección IPv4 o un FQDN válido.';
  }
}

@ApiSchema(strictApiSchema('CreateRouterBody'))
export class CreateRouterDto {
  @ApiProperty({ minLength: 1, maxLength: 120, pattern: '\\S' })
  @IsString()
  @Matches(/\S/u)
  @MaxLength(120)
  name!: string;

  @ApiProperty({
    minLength: 1,
    maxLength: 255,
    description: 'Dirección IPv4 válida o FQDN aceptado por CreateRouterBodySchema.',
  })
  @IsString()
  @Validate(IsIpv4OrFqdnConstraint)
  @MaxLength(255)
  managementHost!: string;

  @ApiPropertyOptional({ maxLength: 64 })
  @whenProvided()
  @IsString()
  @MaxLength(64)
  lanInterface?: string;

  @ApiProperty({ enum: CONTROL_METHODS, isArray: true, minItems: 1, uniqueItems: true })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsIn(CONTROL_METHODS, { each: true })
  supportedControlMethods!: ControlMethod[];

  @ApiPropertyOptional({ format: 'uuid' })
  @whenProvided()
  @IsUUID()
  organizationSiteId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @whenProvided()
  @IsUUID()
  commercialNodeId?: string;

  @ApiPropertyOptional({ maxLength: 1000 })
  @whenProvided()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class UpdateRouterDto {
  @ApiPropertyOptional({ minLength: 1, maxLength: 120 })
  @whenProvided()
  @IsString()
  @Matches(/\S/u)
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional({ description: 'Dirección IPv4 o nombre de dominio completo.' })
  @whenProvided()
  @IsString()
  @Validate(IsIpv4OrFqdnConstraint)
  @MaxLength(255)
  managementHost?: string;

  @ApiPropertyOptional({ maxLength: 64 })
  @whenProvided()
  @IsString()
  @MaxLength(64)
  lanInterface?: string;

  @ApiPropertyOptional({ enum: CONTROL_METHODS, isArray: true, minItems: 1 })
  @whenProvided()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsIn(CONTROL_METHODS, { each: true })
  supportedControlMethods?: ControlMethod[];

  @ApiPropertyOptional({ format: 'uuid' })
  @whenProvided()
  @IsUUID()
  organizationSiteId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @whenProvided()
  @IsUUID()
  commercialNodeId?: string;

  @ApiPropertyOptional({ maxLength: 1000 })
  @whenProvided()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  version!: number;
}

@ApiSchema(strictApiSchema('RouterStatusDto'))
export class RouterStatusDto {
  @ApiProperty({ type: 'integer', minimum: 1 })
  @IsInt()
  @Min(1)
  version!: number;
}

@ApiSchema(strictApiSchema('CreateIpv4NetworkBody'))
export class CreateIpv4NetworkDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  routerId!: string;

  @ApiProperty({ minLength: 1, maxLength: 120, pattern: '\\S' })
  @IsString()
  @Matches(/\S/u)
  @MaxLength(120)
  name!: string;

  @ApiProperty({
    example: '192.0.2.0/24',
    description: 'Bloque IPv4 en CIDR; el servicio valida dirección, prefijo y coherencia.',
  })
  @Matches(IPV4_CIDR_PATTERN)
  cidr!: string;

  @ApiProperty({ format: 'ipv4' })
  @IsIP('4')
  gateway!: string;

  @ApiProperty({ format: 'ipv4' })
  @IsIP('4')
  assignableFrom!: string;

  @ApiProperty({ format: 'ipv4' })
  @IsIP('4')
  assignableTo!: string;

  @ApiPropertyOptional({ type: String, isArray: true, maxItems: 256, format: 'ipv4' })
  @whenProvided()
  @IsArray()
  @ArrayMaxSize(256)
  @IsIP('4', { each: true })
  excludedIps?: string[];

  @ApiProperty({ enum: CONTROL_METHODS })
  @IsIn(CONTROL_METHODS)
  defaultControlMethod!: ControlMethod;
}

export class UpdateIpv4NetworkDto {
  @ApiPropertyOptional({ minLength: 1, maxLength: 120 })
  @whenProvided()
  @IsString()
  @Matches(/\S/u)
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional({ format: 'ipv4' })
  @whenProvided()
  @IsIP('4')
  assignableFrom?: string;

  @ApiPropertyOptional({ format: 'ipv4' })
  @whenProvided()
  @IsIP('4')
  assignableTo?: string;

  @ApiPropertyOptional({ type: String, isArray: true, maxItems: 256, format: 'ipv4' })
  @whenProvided()
  @IsArray()
  @ArrayMaxSize(256)
  @IsIP('4', { each: true })
  excludedIps?: string[];

  @ApiPropertyOptional({ enum: CONTROL_METHODS })
  @whenProvided()
  @IsIn(CONTROL_METHODS)
  defaultControlMethod?: ControlMethod;

  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  version!: number;
}

@ApiSchema(strictApiSchema('PutPlanProfileDto'))
export class PutPlanProfileDto {
  @ApiProperty({ maxLength: 64, pattern: '^[A-Za-z0-9._-]{1,64}$' })
  @IsString()
  @Matches(/^[A-Za-z0-9._-]{1,64}$/u)
  pcqAddressList!: string;
}

@ApiSchema(strictApiSchema('PatchNetworkSettingsDto'))
export class PatchNetworkSettingsDto {
  @ApiProperty()
  @IsBoolean()
  enforceProvisioningOnInstallClose!: boolean;
}

export class NetworkCatalogListQueryDto {
  @ApiPropertyOptional({ enum: ['ACTIVE', 'INACTIVE'] })
  @whenProvided()
  @IsIn(['ACTIVE', 'INACTIVE'])
  status?: 'ACTIVE' | 'INACTIVE';

  @ApiPropertyOptional({ maxLength: 120 })
  @whenProvided()
  @IsString()
  @MaxLength(120)
  q?: string;

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

export class Ipv4NetworkCatalogListQueryDto extends NetworkCatalogListQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @whenProvided()
  @IsUUID()
  routerId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @whenProvided()
  @IsUUID()
  interfaceId?: string;
}

export class ActorRefResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ nullable: true })
  name!: string | null;
}

export class RouterResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;
  @ApiProperty()
  name!: string;
  @ApiProperty()
  managementHost!: string;
  @ApiProperty({ type: String, nullable: true })
  lanInterface!: string | null;
  @ApiProperty({ enum: CONTROL_METHODS, isArray: true })
  supportedControlMethods!: ControlMethod[];
  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  organizationSiteId!: string | null;
  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  commercialNodeId!: string | null;
  @ApiProperty({ enum: ['ACTIVE', 'INACTIVE'] })
  status!: 'ACTIVE' | 'INACTIVE';
  @ApiProperty({ type: String, nullable: true })
  notes!: string | null;
  @ApiProperty({ type: 'integer', minimum: 0 })
  networkCount!: number;
  @ApiPropertyOptional({ type: 'integer', minimum: 0 })
  interfaceCount?: number;
  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true })
  legacyLanInterfaceId?: string | null;
  @ApiProperty({ type: 'integer', minimum: 1 })
  version!: number;
  @ApiProperty({ format: 'date-time' })
  createdAt!: string;
  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;
}

@ApiSchema({
  name: 'RouterDto',
  description:
    'Proyección legacy de router; los campos de interfaz y resúmenes extendidos siguen siendo opcionales.',
})
@ApiExtraModels(OrganizationSiteSummaryResponseDto, CommercialNodeSummaryResponseDto)
export class RouterDtoResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  managementHost!: string;

  @ApiProperty({ type: String, nullable: true })
  lanInterface!: string | null;

  @ApiProperty({ enum: CONTROL_METHODS, isArray: true })
  supportedControlMethods!: ControlMethod[];

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  organizationSiteId!: string | null;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  commercialNodeId!: string | null;

  @ApiPropertyOptional({ type: OrganizationSiteSummaryResponseDto, nullable: true })
  organizationSite?: OrganizationSiteSummaryResponseDto | null;

  @ApiPropertyOptional({ type: CommercialNodeSummaryResponseDto, nullable: true })
  commercialNode?: CommercialNodeSummaryResponseDto | null;

  @ApiProperty({ enum: ['ACTIVE', 'INACTIVE'] })
  status!: 'ACTIVE' | 'INACTIVE';

  @ApiProperty({ type: String, nullable: true })
  notes!: string | null;

  @ApiProperty({ type: 'integer', minimum: 0 })
  networkCount!: number;

  @ApiPropertyOptional({ type: 'integer', minimum: 0 })
  interfaceCount?: number;

  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true })
  legacyLanInterfaceId?: string | null;

  @ApiProperty({ type: 'integer', minimum: 1 })
  version!: number;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;
}

@ApiSchema({
  name: 'RouterListDto',
  description: 'Fila de listado extendida con ambos campos de interfaz siempre presentes.',
})
export class RouterListResponseDto extends RouterDtoResponseDto {
  @ApiProperty({ type: 'integer', minimum: 0, required: true })
  declare interfaceCount: number;

  @ApiProperty({ type: String, format: 'uuid', nullable: true, required: true })
  declare legacyLanInterfaceId: string | null;
}

@ApiSchema({ name: 'CreateRouterInterfaceConversionResponseDto' })
@ApiExtraModels(
  RouterInterfaceResponseDto,
  RouterInterfaceIpv4AddressResponseDto,
  RouterDtoResponseDto,
)
export class CreateRouterInterfaceConversionResponseDto {
  @ApiProperty({ type: RouterInterfaceResponseDto })
  interface!: RouterInterfaceResponseDto;

  @ApiProperty({ type: RouterInterfaceIpv4AddressResponseDto, nullable: true })
  address!: RouterInterfaceIpv4AddressResponseDto | null;

  @ApiProperty({ type: RouterDtoResponseDto })
  router!: RouterDtoResponseDto;
}

export class NetworkOccupancyResponseDto {
  @ApiProperty({ type: 'integer', minimum: 0 })
  total!: number;
  @ApiProperty({ type: 'integer', minimum: 0 })
  reserved!: number;
  @ApiProperty({ type: 'integer', minimum: 0 })
  active!: number;
  @ApiProperty({ type: 'integer', minimum: 0 })
  free!: number;
}

export class Ipv4NetworkResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;
  @ApiProperty({ format: 'uuid' })
  routerId!: string;
  @ApiProperty()
  routerName!: string;
  @ApiProperty()
  name!: string;
  @ApiProperty({ example: '192.0.2.0/24' })
  cidr!: string;
  @ApiProperty({ format: 'ipv4' })
  gateway!: string;
  @ApiProperty({ format: 'ipv4' })
  assignableFrom!: string;
  @ApiProperty({ format: 'ipv4' })
  assignableTo!: string;
  @ApiProperty({ type: String, isArray: true, format: 'ipv4' })
  excludedIps!: string[];
  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true })
  interfaceId?: string | null;
  @ApiPropertyOptional({ type: RouterInterfaceRefResponseDto, nullable: true })
  interface?: RouterInterfaceRefResponseDto | null;
  @ApiPropertyOptional({ type: ReservationAvailabilityResponseDto })
  reservationAvailability?: ReservationAvailabilityResponseDto;
  @ApiProperty({ enum: CONTROL_METHODS })
  defaultControlMethod!: ControlMethod;
  @ApiProperty({ enum: ['ACTIVE', 'INACTIVE'] })
  status!: 'ACTIVE' | 'INACTIVE';
  @ApiProperty({ type: NetworkOccupancyResponseDto })
  occupancy!: NetworkOccupancyResponseDto;
  @ApiProperty({ type: 'integer', minimum: 1 })
  version!: number;
  @ApiProperty({ format: 'date-time' })
  createdAt!: string;
  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;
}

@ApiSchema({ name: 'Ipv4NetworkExtendedDto' })
@ApiExtraModels(
  NetworkOccupancyResponseDto,
  RouterInterfaceRefResponseDto,
  ReservationAvailabilityResponseDto,
)
export class Ipv4NetworkExtendedResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;
  @ApiProperty({ format: 'uuid' })
  routerId!: string;
  @ApiProperty()
  routerName!: string;
  @ApiProperty()
  name!: string;
  @ApiProperty({ example: '192.0.2.0/24' })
  cidr!: string;
  @ApiProperty({ format: 'ipv4' })
  gateway!: string;
  @ApiProperty({ format: 'ipv4' })
  assignableFrom!: string;
  @ApiProperty({ format: 'ipv4' })
  assignableTo!: string;
  @ApiProperty({ type: String, isArray: true, format: 'ipv4' })
  excludedIps!: string[];
  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  interfaceId!: string | null;
  @ApiProperty({ type: RouterInterfaceRefResponseDto, nullable: true })
  interface!: RouterInterfaceRefResponseDto | null;
  @ApiProperty({ type: ReservationAvailabilityResponseDto })
  reservationAvailability!: ReservationAvailabilityResponseDto;
  @ApiProperty({ enum: CONTROL_METHODS })
  defaultControlMethod!: ControlMethod;
  @ApiProperty({ enum: ['ACTIVE', 'INACTIVE'] })
  status!: 'ACTIVE' | 'INACTIVE';
  @ApiProperty({ type: NetworkOccupancyResponseDto })
  occupancy!: NetworkOccupancyResponseDto;
  @ApiProperty({ type: 'integer', minimum: 1 })
  version!: number;
  @ApiProperty({ format: 'date-time' })
  createdAt!: string;
  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;
}

export class PlanProfileResponseDto {
  @ApiProperty({ format: 'uuid' })
  planId!: string;
  @ApiProperty()
  pcqAddressList!: string;
  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;
  @ApiProperty({ type: ActorRefResponseDto, nullable: true })
  updatedBy!: ActorRefResponseDto | null;
}

export class NetworkSettingsResponseDto {
  @ApiProperty()
  enforceProvisioningOnInstallClose!: boolean;
  @ApiProperty({ format: 'date-time', nullable: true })
  updatedAt!: string | null;
  @ApiProperty({ type: ActorRefResponseDto, nullable: true })
  updatedBy!: ActorRefResponseDto | null;
}
