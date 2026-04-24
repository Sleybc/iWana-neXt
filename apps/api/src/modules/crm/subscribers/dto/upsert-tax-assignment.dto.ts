import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Allow } from 'class-validator';
import { TaxAssignmentRateSource, TaxAssignmentStatus, TaxTreatment } from '@iwana/shared';

/**
 * DTO para crear o actualizar una asignación tributaria individual.
 * Usado en el endpoint de bulk-upsert y en el PATCH individual.
 *
 * Ref: spec-2026-04-22 §9.1, §9.2, BT-TAXMVP-07
 */
export class UpsertTaxAssignmentDto {
  @ApiProperty({ description: 'UUID de la definición tributaria del catálogo (TaxDefinition)' })
  @Allow()
  taxDefinitionId!: string;

  @ApiPropertyOptional({
    description: 'Tasa efectiva (porcentaje). Requerida para tributos variables.',
  })
  @Allow()
  effectiveRate?: number | null;

  @ApiPropertyOptional({ enum: TaxAssignmentRateSource, description: 'Origen de la tasa' })
  @Allow()
  rateSource?: TaxAssignmentRateSource;

  @ApiPropertyOptional({ enum: TaxTreatment, description: 'Tratamiento tributario efectivo' })
  @Allow()
  treatment?: TaxTreatment | null;

  @ApiPropertyOptional({ enum: TaxAssignmentStatus, description: 'Estado de la asignación' })
  @Allow()
  status?: TaxAssignmentStatus;

  @ApiPropertyOptional({ description: 'Motivo auditable del ajuste (máx 300 caracteres)' })
  @Allow()
  reason?: string | null;
}
