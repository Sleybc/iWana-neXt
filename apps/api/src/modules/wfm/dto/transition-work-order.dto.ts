import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { z } from 'zod';
import { WorkOrderStatus } from '@iwana/shared';

/** Schema Zod para transicion de estado de Work Order. */
export const TransitionWorkOrderSchema = z.object({
  status: z.nativeEnum(WorkOrderStatus),
});

export type TransitionWorkOrderInput = z.infer<typeof TransitionWorkOrderSchema>;

/** DTO para cambiar el estado operativo de una Work Order ligera. */
export class TransitionWorkOrderDto {
  @ApiProperty({
    enum: WorkOrderStatus,
    description: 'Nuevo estado: OPEN | ASSIGNED | IN_PROGRESS | DONE | CANCELLED',
  })
  @IsEnum(WorkOrderStatus)
  status: WorkOrderStatus;
}
