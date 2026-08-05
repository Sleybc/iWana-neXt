import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { z } from 'zod';

/**
 * Destino operativo tras revisar un evento no realizado / vencido (vista E2).
 * Obligatorio para eventos EXPIRED (ADR-077 D7: el barrido no decide).
 */
export const ReviewNonRealizationDecision = z.enum(['RESCHEDULE', 'CLOSE_CASE']);
export type ReviewNonRealizationDecisionType = z.infer<typeof ReviewNonRealizationDecision>;

/**
 * Schema Zod para la revisión del coordinador de una causa de no realización.
 *
 * El coordinador confirma la causa del técnico o la reclasifica.
 * Su clasificación es la autoritativa para SLA, intentos y métricas.
 * La clasificación original del técnico se conserva (ADR-077 D2).
 */
export const ReviewNonRealizationSchema = z.object({
  nonRealizationCauseId: z.string().uuid(),
  notes: z.string().trim().max(500).optional().nullable(),
  decision: ReviewNonRealizationDecision.optional(),
});

export type ReviewNonRealizationInput = z.infer<typeof ReviewNonRealizationSchema>;

/** DTO para la revisión del coordinador de una causa de no realización. */
export class ReviewNonRealizationDto {
  @ApiProperty({
    format: 'uuid',
    description: 'ID de la causa de no realización (taxonomía autoritativa)',
  })
  @IsUUID()
  @IsNotEmpty()
  nonRealizationCauseId: string;

  @ApiPropertyOptional({
    example: 'Confirmado por el cliente vía telefónica.',
    description: 'Notas del coordinador sobre la reclasificación',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string | null;

  @ApiPropertyOptional({
    enum: ['RESCHEDULE', 'CLOSE_CASE'],
    description:
      'Destino de la VisitRequest. Obligatorio si el evento está EXPIRED: RESCHEDULE → REQUIRES_RESCHEDULE; CLOSE_CASE → CANCELLED.',
  })
  @IsOptional()
  @IsEnum(['RESCHEDULE', 'CLOSE_CASE'] as const)
  decision?: ReviewNonRealizationDecisionType;
}
