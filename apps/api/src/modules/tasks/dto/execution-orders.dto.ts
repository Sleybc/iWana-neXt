import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Allow } from 'class-validator';
import { z } from 'zod';
import {
  ExecutionOrderItemAction,
  ExecutionOrderResult,
  InventoryDisposition,
} from '@iwana/shared';

export const StartExecutionOrderSchema = z.object({
  notes: z.string().trim().max(2000).optional().nullable(),
});

export type StartExecutionOrderInput = z.infer<typeof StartExecutionOrderSchema>;

export class StartExecutionOrderDto {
  @ApiPropertyOptional()
  @Allow()
  notes?: string | null;
}

export const RegisterFieldWorkSchema = z.object({
  activityType: z.string().trim().min(1).max(64),
  description: z.string().trim().min(1).max(4000),
});

export type RegisterFieldWorkInput = z.infer<typeof RegisterFieldWorkSchema>;

export class RegisterFieldWorkDto {
  @ApiProperty()
  @Allow()
  activityType!: string;

  @ApiProperty()
  @Allow()
  description!: string;
}

export const RegisterExecutionOrderItemUsageSchema = z.object({
  itemId: z.string().trim().min(1).max(160),
  technicianCustodyId: z.string().trim().min(1).max(160),
  quantity: z.coerce.number().positive().default(1),
  serialNumber: z.string().trim().max(160).optional().nullable(),
  action: z.nativeEnum(ExecutionOrderItemAction),
  finalDisposition: z.nativeEnum(InventoryDisposition),
  stockMovementId: z.string().trim().max(160).optional().nullable(),
});

export type RegisterExecutionOrderItemUsageInput = z.infer<
  typeof RegisterExecutionOrderItemUsageSchema
>;

export class RegisterExecutionOrderItemUsageDto {
  @ApiProperty()
  @Allow()
  itemId!: string;

  @ApiProperty()
  @Allow()
  technicianCustodyId!: string;

  @ApiPropertyOptional({ default: 1 })
  @Allow()
  quantity?: number;

  @ApiPropertyOptional()
  @Allow()
  serialNumber?: string | null;

  @ApiProperty({ enum: ExecutionOrderItemAction })
  @Allow()
  action!: ExecutionOrderItemAction;

  @ApiProperty({ enum: InventoryDisposition })
  @Allow()
  finalDisposition!: InventoryDisposition;

  @ApiPropertyOptional()
  @Allow()
  stockMovementId?: string | null;
}

export const CloseExecutionOrderSchema = z.object({
  result: z.nativeEnum(ExecutionOrderResult),
  closeNotes: z.string().trim().max(4000).optional().nullable(),
});

export type CloseExecutionOrderInput = z.infer<typeof CloseExecutionOrderSchema>;

export class CloseExecutionOrderDto {
  @ApiProperty({ enum: ExecutionOrderResult })
  @Allow()
  result!: ExecutionOrderResult;

  @ApiPropertyOptional()
  @Allow()
  closeNotes?: string | null;
}
