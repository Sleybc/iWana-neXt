import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsNotEmpty, IsUUID } from 'class-validator';
import { z } from 'zod';

// --- Zod schema ---

/** Schema Zod para agendar una solicitud de visita (status: READY_TO_SCHEDULE → SCHEDULED). SPEC-MOD09 §6.2 */
export const ScheduleVisitRequestSchema = z.object({
  scheduledStartAt: z.string().datetime({ offset: true }),
  scheduledEndAt: z.string().datetime({ offset: true }),
  assignedUserId: z.string().uuid(),
});

export type ScheduleVisitRequestInput = z.infer<typeof ScheduleVisitRequestSchema>;

// --- DTO class-validator para ValidationPipe + OpenAPI ---

/** DTO para agendar una solicitud de visita. Genera ScheduleEvent + WorkOrder. */
export class ScheduleVisitRequestDto {
  @ApiProperty({ example: '2026-06-01T09:00:00Z', description: 'Inicio programado (ISO 8601)' })
  @IsDateString({ strict: false })
  @IsNotEmpty()
  scheduledStartAt: string;

  @ApiProperty({ example: '2026-06-01T11:00:00Z', description: 'Fin programado (ISO 8601)' })
  @IsDateString({ strict: false })
  @IsNotEmpty()
  scheduledEndAt: string;

  @ApiProperty({
    example: '550e8400-e29b-41d4-a716-446655440000',
    format: 'uuid',
    description: 'Tecnico asignado',
  })
  @IsUUID()
  assignedUserId: string;
}
