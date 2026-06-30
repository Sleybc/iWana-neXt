import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { z } from 'zod';
import { ScheduleEventStatus } from '@iwana/shared';

/** Schema Zod para transicion de estado de un evento. */
export const TransitionScheduleEventSchema = z.object({
  status: z.nativeEnum(ScheduleEventStatus),
});

export type TransitionScheduleEventInput = z.infer<typeof TransitionScheduleEventSchema>;

/** DTO para cambiar el estado operativo de un evento de agenda. */
export class TransitionScheduleEventDto {
  @ApiProperty({
    enum: ScheduleEventStatus,
    description:
      'Nuevo estado del evento: DRAFT | SCHEDULED | EN_ROUTE | IN_PROGRESS | COMPLETED | CANCELLED | RESCHEDULED | NO_SHOW',
  })
  @IsEnum(ScheduleEventStatus)
  status: ScheduleEventStatus;
}
