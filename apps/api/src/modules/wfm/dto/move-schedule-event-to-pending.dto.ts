import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { z } from 'zod';

export const MoveScheduleEventToPendingSchema = z.object({
  reason: z.string().trim().min(1).max(200).optional().nullable(),
});

export type MoveScheduleEventToPendingInput = z.infer<typeof MoveScheduleEventToPendingSchema>;

/** DTO para devolver un evento agendado a la bandeja pendiente. */
export class MoveScheduleEventToPendingDto {
  @ApiPropertyOptional({
    example: 'Cliente solicito retomar coordinacion desde la bandeja.',
    description: 'Motivo opcional de la devolucion a pendiente',
    maxLength: 200,
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  reason?: string | null;
}
