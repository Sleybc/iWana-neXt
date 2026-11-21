import { ApiProperty } from '@nestjs/swagger';
import type { TenantUsage, TenantUsageItem } from '@iwana/shared';

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
