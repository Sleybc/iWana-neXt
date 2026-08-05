import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { z } from 'zod';

/** Discriminador: REPROGRAM cambia la cita sin intento; FAILED_ATTEMPT cierra tras intento real. */
export const MoveToPendingIntent = z.enum(['REPROGRAM', 'FAILED_ATTEMPT']);
export type MoveToPendingIntent = z.infer<typeof MoveToPendingIntent>;

/** Causa raiz del intento fallido — solo relevante cuando intent = FAILED_ATTEMPT. */
export const FailureCause = z.enum(['CUSTOMER', 'OPERATIONAL', 'FORCE_MAJEURE']);
export type FailureCause = z.infer<typeof FailureCause>;

export const MoveScheduleEventToPendingSchema = z.object({
  intent: MoveToPendingIntent,
  reason: z.string().trim().min(1).max(200).optional().nullable(),
  failureReason: z.string().trim().min(1).max(500).optional().nullable(),
  failureCause: FailureCause.optional().nullable(),
  nonRealizationCauseId: z.string().uuid().optional().nullable(),
  evidenceSubmitted: z.boolean().optional(),
});

export type MoveScheduleEventToPendingInput = z.infer<typeof MoveScheduleEventToPendingSchema>;

/** DTO para devolver un evento agendado a la bandeja pendiente o marcarlo como intento fallido. */
export class MoveScheduleEventToPendingDto {
  @ApiProperty({
    example: 'FAILED_ATTEMPT',
    description:
      'Intencion: REPROGRAM (cambio de cita sin desplazamiento) o FAILED_ATTEMPT (hubo intento real)',
    enum: ['REPROGRAM', 'FAILED_ATTEMPT'],
  })
  @IsEnum(['REPROGRAM', 'FAILED_ATTEMPT'])
  intent!: 'REPROGRAM' | 'FAILED_ATTEMPT';

  @ApiPropertyOptional({
    example: 'Cliente solicito retomar coordinacion desde la bandeja.',
    description: 'Motivo opcional de la operacion',
    maxLength: 200,
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  reason?: string | null;

  @ApiPropertyOptional({
    example: 'El cliente no se encontraba en la direccion.',
    description: 'Descripcion del fallo (solo para FAILED_ATTEMPT)',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  failureReason?: string | null;

  @ApiPropertyOptional({
    example: 'CUSTOMER',
    description:
      'Causa raiz del intento fallido (solo para FAILED_ATTEMPT). CUSTOMER incrementa retry_count.',
    enum: ['CUSTOMER', 'OPERATIONAL', 'FORCE_MAJEURE'],
  })
  @IsOptional()
  @IsEnum(['CUSTOMER', 'OPERATIONAL', 'FORCE_MAJEURE'])
  failureCause?: 'CUSTOMER' | 'OPERATIONAL' | 'FORCE_MAJEURE' | null;

  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'ID de la causa en la taxonomía non_realization_causes. Vincula la causa raíz al evento.',
  })
  @IsOptional()
  @IsUUID()
  nonRealizationCauseId?: string | null;

  @ApiPropertyOptional({
    example: false,
    description: 'Si el técnico adjuntó evidencia del intento fallido. Requisito para pausar SLA.',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  evidenceSubmitted?: boolean;
}
