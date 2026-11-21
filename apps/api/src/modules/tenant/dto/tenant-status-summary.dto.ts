import { ApiProperty } from '@nestjs/swagger';
import { TenantStatus } from '@iwana/shared';
import type { TenantStatusSummary, TenantStatusSummaryAttentionItem } from '@iwana/shared';

/** Documentación OpenAPI de `TenantStatusSummary` v1.0 (el tipo vive en `@iwana/shared`). */
export class TenantStatusSummaryAttentionItemDto implements TenantStatusSummaryAttentionItem {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty({ enum: TenantStatus })
  status: TenantStatus;

  @ApiProperty({ format: 'date-time' })
  updatedAt: string;
}

export class TenantStatusSummaryDto implements TenantStatusSummary {
  @ApiProperty()
  total: number;

  @ApiProperty({
    type: 'object',
    description:
      'Conteo por estado; trae todas las claves de TenantStatus, en 0 si no hay empresas.',
    properties: Object.fromEntries(
      Object.values(TenantStatus).map((status) => [status, { type: 'integer' }]),
    ),
  })
  byStatus: Record<TenantStatus, number>;

  @ApiProperty()
  updatedLast7Days: number;

  @ApiProperty({ type: [TenantStatusSummaryAttentionItemDto], maxItems: 5 })
  attention: TenantStatusSummaryAttentionItemDto[];

  @ApiProperty({ format: 'date-time' })
  generatedAt: string;
}

export class TenantStatusSummaryResponseDto {
  @ApiProperty({ type: TenantStatusSummaryDto })
  data: TenantStatusSummaryDto;
}
