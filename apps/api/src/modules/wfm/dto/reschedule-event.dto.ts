import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { z } from 'zod';

/** Schema Zod para reagendar un evento con motivo obligatorio. SPEC-MOD09 §10 regla 3. */
export const RescheduleEventSchema = z.object({
  scheduledStartAt: z.string().datetime({ offset: true }),
  scheduledEndAt: z.string().datetime({ offset: true }),
  reason: z.string().min(1).max(120),
  notes: z.string().optional().nullable(),
});

export type RescheduleEventInput = z.infer<typeof RescheduleEventSchema>;

/** DTO para reagendar un evento con nuevo horario y motivo obligatorio. */
export class RescheduleEventDto {
  @ApiProperty({
    example: '2026-06-02T09:00:00Z',
    description: 'Nuevo inicio programado (ISO 8601)',
  })
  @IsDateString({ strict: false })
  scheduledStartAt: string;

  @ApiProperty({ example: '2026-06-02T11:00:00Z', description: 'Nuevo fin programado (ISO 8601)' })
  @IsDateString({ strict: false })
  scheduledEndAt: string;

  @ApiProperty({
    example: 'Solicitud del cliente por indisponibilidad',
    maxLength: 120,
    description: 'Motivo del reagendamiento — obligatorio',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  reason: string;

  @ApiPropertyOptional({ description: 'Notas adicionales del reagendamiento' })
  @IsOptional()
  @IsString()
  notes?: string | null;
}
