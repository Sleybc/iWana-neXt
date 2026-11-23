import { ApiProperty } from '@nestjs/swagger';
import {
  TENANT_USAGE_GRANTABLE_ROLES,
  type TenantUsage,
  type TenantUsageGrantableRole,
  type TenantUsageItem,
  type TenantUsageVisibility,
  type UpdateTenantUsageVisibility,
} from '@iwana/shared';

/** Documentación OpenAPI de `TenantUsage` v1.0 (el tipo vive en `@iwana/shared`, ADR-114 D4). */
export class TenantUsageItemDto implements TenantUsageItem {
  @ApiProperty({ format: 'uuid' })
  tenantId: string;

  @ApiProperty()
  name: string;

  @ApiProperty({ type: 'integer', nullable: true, description: '`null` = sin medición, nunca 0.' })
  activeSubscribers: number | null;

  @ApiProperty({ type: 'integer', nullable: true, description: '`null` = sin cupo.' })
  maxSubscribers: number | null;

  @ApiProperty({ format: 'date-time', nullable: true, type: String })
  measuredAt: string | null;
}

export class TenantUsageDto implements TenantUsage {
  @ApiProperty({ type: [TenantUsageItemDto] })
  items: TenantUsageItemDto[];

  @ApiProperty({ format: 'date-time' })
  generatedAt: string;
}

export class TenantUsageResponseDto {
  @ApiProperty({ type: TenantUsageDto })
  data: TenantUsageDto;
}

/** OpenAPI de `TenantUsageVisibility` (ADR-114 v1.3 §9; el esquema Zod vive en `@iwana/shared`). */
export class TenantUsageVisibilityDto implements TenantUsageVisibility {
  @ApiProperty({
    enum: TENANT_USAGE_GRANTABLE_ROLES,
    isArray: true,
    description: 'Roles concedidos además del administrador de plataforma, que lo ve siempre.',
  })
  grantedRoles: TenantUsageGrantableRole[];

  @ApiProperty({ description: 'Si el usuario que pregunta ve el uso por empresa.' })
  canView: boolean;
}

export class TenantUsageVisibilityResponseDto {
  @ApiProperty({ type: TenantUsageVisibilityDto })
  data: TenantUsageVisibilityDto;
}

export class UpdateTenantUsageVisibilityDto implements UpdateTenantUsageVisibility {
  @ApiProperty({ enum: TENANT_USAGE_GRANTABLE_ROLES, isArray: true, uniqueItems: true })
  grantedRoles: TenantUsageGrantableRole[];
}
