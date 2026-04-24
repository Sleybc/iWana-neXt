import { ApiProperty } from '@nestjs/swagger';
import { Allow } from 'class-validator';
import { UpsertTaxAssignmentDto } from './upsert-tax-assignment.dto';

/**
 * DTO para el guardado masivo (bulk upsert) de asignaciones tributarias del suscriptor.
 * El servicio hace upsert por (profileId, taxDefinitionId).
 *
 * Ref: spec-2026-04-22 §9.2, BT-TAXMVP-07
 */
export class SaveTaxAssignmentsDto {
  @ApiProperty({
    type: [UpsertTaxAssignmentDto],
    description: 'Lista de asignaciones tributarias a guardar. Se hace upsert por taxDefinitionId.',
  })
  @Allow()
  assignments!: UpsertTaxAssignmentDto[];
}
