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
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { isFQDN, isIP } from 'class-validator';
import { CONTROL_METHODS, type ControlMethod } from '@iwana/shared';

const IPV4_OCTET = '(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)';
const IPV4_CIDR_PATTERN = new RegExp(
  `^(?:${IPV4_OCTET}\\.){3}${IPV4_OCTET}\\/(?:1[6-9]|2\\d|30)$`,
  'u',
);

const whenProvided = () => ValidateIf((_object, value: unknown) => value !== undefined);

@ValidatorConstraint({ name: 'isIpv4OrFqdn', async: false })
class IsIpv4OrFqdnConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return (
      typeof value === 'string' &&
      (isIP(value, '4') || isFQDN(value, { require_tld: true, allow_trailing_dot: true }))
    );
  }

  defaultMessage(): string {
    return 'Debe ser una dirección IPv4 o un FQDN válido.';
  }
}

export class CreateRouterDto {
  @ApiProperty({ minLength: 1, maxLength: 120 })
  @IsString()
  @Matches(/\S/u)
  @MaxLength(120)
  name!: string;

  @ApiProperty({ description: 'Dirección IPv4 o nombre de dominio completo.' })
  @IsString()
  @Validate(IsIpv4OrFqdnConstraint)
  @MaxLength(255)
  managementHost!: string;

  @ApiPropertyOptional({ maxLength: 64 })
  @whenProvided()
  @IsString()
  @MaxLength(64)
  lanInterface?: string;

  @ApiProperty({ enum: CONTROL_METHODS, isArray: true, minItems: 1 })
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

export class RouterStatusDto {
  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  version!: number;
}

export class CreateIpv4NetworkDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  routerId!: string;

  @ApiProperty({ minLength: 1, maxLength: 120 })
  @IsString()
  @Matches(/\S/u)
  @MaxLength(120)
  name!: string;

  @ApiProperty({ example: '192.168.10.0/24' })
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

export class PutPlanProfileDto {
  @ApiProperty({ maxLength: 64, pattern: '^[A-Za-z0-9._-]{1,64}$' })
  @IsString()
  @Matches(/^[A-Za-z0-9._-]{1,64}$/u)
  pcqAddressList!: string;
}

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

  @ApiPropertyOptional({ format: 'uuid' })
  @whenProvided()
  @IsUUID()
  routerId?: string;

  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 20 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;
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
  @ApiProperty({ nullable: true })
  lanInterface!: string | null;
  @ApiProperty({ enum: CONTROL_METHODS, isArray: true })
  supportedControlMethods!: ControlMethod[];
  @ApiProperty({ format: 'uuid', nullable: true })
  organizationSiteId!: string | null;
  @ApiProperty({ format: 'uuid', nullable: true })
  commercialNodeId!: string | null;
  @ApiProperty({ enum: ['ACTIVE', 'INACTIVE'] })
  status!: 'ACTIVE' | 'INACTIVE';
  @ApiProperty({ nullable: true })
  notes!: string | null;
  @ApiProperty({ minimum: 0 })
  networkCount!: number;
  @ApiProperty({ minimum: 1 })
  version!: number;
  @ApiProperty({ format: 'date-time' })
  createdAt!: string;
  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;
}

export class NetworkOccupancyResponseDto {
  @ApiProperty({ minimum: 0 })
  total!: number;
  @ApiProperty({ minimum: 0 })
  reserved!: number;
  @ApiProperty({ minimum: 0 })
  active!: number;
  @ApiProperty({ minimum: 0 })
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
  @ApiProperty({ example: '192.168.10.0/24' })
  cidr!: string;
  @ApiProperty({ format: 'ipv4' })
  gateway!: string;
  @ApiProperty({ format: 'ipv4' })
  assignableFrom!: string;
  @ApiProperty({ format: 'ipv4' })
  assignableTo!: string;
  @ApiProperty({ type: String, isArray: true, format: 'ipv4' })
  excludedIps!: string[];
  @ApiProperty({ enum: CONTROL_METHODS })
  defaultControlMethod!: ControlMethod;
  @ApiProperty({ enum: ['ACTIVE', 'INACTIVE'] })
  status!: 'ACTIVE' | 'INACTIVE';
  @ApiProperty({ type: NetworkOccupancyResponseDto })
  occupancy!: NetworkOccupancyResponseDto;
  @ApiProperty({ minimum: 1 })
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
