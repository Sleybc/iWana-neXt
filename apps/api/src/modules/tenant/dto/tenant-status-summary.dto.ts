import { ApiProperty } from '@nestjs/swagger';
import { TENANT_STATUS_SUMMARY_PERIOD_MONTHS, TenantStatus } from '@iwana/shared';
import type {
  TenantStatusSummary,
  TenantStatusSummaryAttentionItem,
  TenantStatusSummaryMonth,
} from '@iwana/shared';

/** Documentación OpenAPI de `TenantStatusSummary` v1.2 (el tipo vive en `@iwana/shared`). */
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

export class TenantStatusSummaryMonthDto implements TenantStatusSummaryMonth {
  @ApiProperty({ example: '2026-11', pattern: '^[0-9]{4}-[0-9]{2}$' })
  month: string;

  @ApiProperty({
    description:
      'Altas del mes (primer CREATE de cada Tenant), America/Bogota. Un CREATE posterior de la misma empresa (p. ej. de branding) no es un alta.',
  })
  created: number;

  @ApiProperty({ description: 'Bajas (DELETE de Tenant, empresa distinta) del mes.' })
  removed: number;

  @ApiProperty({
    type: Number,
    nullable: true,
    description:
      'v1.2 — empresas ACTIVE al último instante del mes (America/Bogota); en el mes en curso, ' +
      'las de hoy (= byStatus.ACTIVE). null (nunca 0) si el estado al cierre de alguna empresa ' +
      'no se puede reconstruir con certeza desde los cambios de estado auditados.',
  })
  activeAtClose: number | null;
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

  @ApiProperty({
    type: TenantStatusSummaryMonthDto,
    description: 'Mes en curso; igual al último de monthly.',
  })
  period: TenantStatusSummaryMonthDto;

  @ApiProperty({
    type: [TenantStatusSummaryMonthDto],
    minItems: Math.min(...TENANT_STATUS_SUMMARY_PERIOD_MONTHS),
    maxItems: Math.max(...TENANT_STATUS_SUMMARY_PERIOD_MONTHS),
    description:
      'v1.2 — `months` meses (6, 12 o 24; 12 por defecto), del más antiguo al actual; ' +
      'meses sin eventos en 0.',
  })
  monthly: TenantStatusSummaryMonthDto[];

  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    description: 'createdAt de la empresa más antigua en PROVISIONING; null si no hay.',
  })
  oldestProvisioningAt: string | null;
}

export class TenantStatusSummaryResponseDto {
  @ApiProperty({ type: TenantStatusSummaryDto })
  data: TenantStatusSummaryDto;
}
