import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { z } from 'zod';
import { WfmWorkType, WorkOrderPriority, WorkOrderSourceContext } from '@iwana/shared';

// --- Zod schemas ---

/** Schema Zod para la Work Order embebida en la creacion del evento. */
export const CreateWorkOrderEmbeddedSchema = z.object({
  type: z.nativeEnum(WfmWorkType).optional(),
  priority: z.nativeEnum(WorkOrderPriority).optional().default(WorkOrderPriority.NORMAL),
  sourceContext: z
    .nativeEnum(WorkOrderSourceContext)
    .optional()
    .default(WorkOrderSourceContext.MANUAL),
  sourceRef: z.string().max(160).optional().nullable(),
  summary: z.string().min(1).max(200),
  notes: z.string().optional().nullable(),
});

/** Schema Zod para la creacion de un evento de agenda. SPEC-MOD09 §10. */
export const CreateScheduleEventSchema = z.object({
  type: z.nativeEnum(WfmWorkType),
  title: z.string().min(1).max(160),
  description: z.string().optional().nullable(),
  scheduledStartAt: z.string().datetime({ offset: true }),
  scheduledEndAt: z.string().datetime({ offset: true }),
  assignedUserId: z.string().uuid(),
  operatingSiteId: z.string().uuid().optional().nullable(),
  organizationSiteId: z.string().uuid().optional().nullable(),
  address: z.string().max(255).optional().nullable(),
  municipality: z.string().max(120).optional().nullable(),
  sector: z.string().max(120).optional().nullable(),
  latitude: z.number().min(-90).max(90).optional().nullable(),
  longitude: z.number().min(-180).max(180).optional().nullable(),
  expedienteId: z.string().uuid().optional().nullable(),
  subscriberId: z.string().uuid().optional().nullable(),
  ticketId: z.string().max(160).optional().nullable(),
  contractId: z.string().uuid().optional().nullable(),
  workOrder: CreateWorkOrderEmbeddedSchema.optional(),
});

export type CreateScheduleEventInput = z.infer<typeof CreateScheduleEventSchema>;
export type CreateWorkOrderEmbeddedInput = z.infer<typeof CreateWorkOrderEmbeddedSchema>;

export function toCreateScheduleEventInput(dto: CreateScheduleEventDto): CreateScheduleEventInput {
  return {
    ...dto,
    workOrder: dto.workOrder
      ? {
          ...dto.workOrder,
          priority: dto.workOrder.priority ?? WorkOrderPriority.NORMAL,
          sourceContext: dto.workOrder.sourceContext ?? WorkOrderSourceContext.MANUAL,
        }
      : undefined,
  };
}

// --- DTOs class-validator para ValidationPipe + OpenAPI ---

/** DTO para la Work Order ligera embebida en la creacion del evento. */
export class CreateWorkOrderEmbeddedDto {
  @ApiPropertyOptional({
    enum: WfmWorkType,
    description: 'Tipo de trabajo (hereda del evento si se omite)',
  })
  @IsOptional()
  @IsEnum(WfmWorkType)
  type?: WfmWorkType;

  @ApiPropertyOptional({ enum: WorkOrderPriority, default: WorkOrderPriority.NORMAL })
  @IsOptional()
  @IsEnum(WorkOrderPriority)
  priority?: WorkOrderPriority;

  @ApiPropertyOptional({ enum: WorkOrderSourceContext, default: WorkOrderSourceContext.MANUAL })
  @IsOptional()
  @IsEnum(WorkOrderSourceContext)
  sourceContext?: WorkOrderSourceContext;

  @ApiPropertyOptional({ example: 'EXP-2026-001', maxLength: 160 })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  sourceRef?: string | null;

  @ApiProperty({ example: 'Instalacion fibra optica zona norte', maxLength: 200 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  summary: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string | null;
}

/** DTO para crear un evento de agenda operativa. */
export class CreateScheduleEventDto {
  @ApiProperty({ enum: WfmWorkType, description: 'Tipo de trabajo a realizar' })
  @IsEnum(WfmWorkType)
  type: WfmWorkType;

  @ApiProperty({ example: 'Instalacion fibra - zona norte', maxLength: 160 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  title: string;

  @ApiPropertyOptional({ description: 'Detalle interno del evento' })
  @IsOptional()
  @IsString()
  description?: string | null;

  @ApiProperty({ example: '2026-06-01T09:00:00Z', description: 'Inicio programado (ISO 8601)' })
  @IsDateString({ strict: false })
  scheduledStartAt: string;

  @ApiProperty({ example: '2026-06-01T11:00:00Z', description: 'Fin programado (ISO 8601)' })
  @IsDateString({ strict: false })
  scheduledEndAt: string;

  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000', format: 'uuid' })
  @IsUUID()
  assignedUserId: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Sede operativa WFM asociada al evento' })
  @IsOptional()
  @IsUUID()
  operatingSiteId?: string | null;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Sede Organization a resolver a una sede operativa WFM efectiva',
  })
  @IsOptional()
  @IsUUID()
  organizationSiteId?: string | null;

  @ApiPropertyOptional({ maxLength: 255 })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  address?: string | null;

  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  municipality?: string | null;

  @ApiPropertyOptional({ maxLength: 120, description: 'Sector, barrio o vereda operativa' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  sector?: string | null;

  @ApiPropertyOptional({ example: 4.711 })
  @IsOptional()
  @IsNumber()
  latitude?: number | null;

  @ApiPropertyOptional({ example: -74.0721 })
  @IsOptional()
  @IsNumber()
  longitude?: number | null;

  @ApiPropertyOptional({ format: 'uuid', description: 'Vinculo CRM — expediente_records.id' })
  @IsOptional()
  @IsUUID()
  expedienteId?: string | null;

  @ApiPropertyOptional({ format: 'uuid', description: 'Vinculo suscriptor' })
  @IsOptional()
  @IsUUID()
  subscriberId?: string | null;

  @ApiPropertyOptional({ maxLength: 160, description: 'Vinculo ticket o referencia externa' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  ticketId?: string | null;

  @ApiPropertyOptional({ format: 'uuid', description: 'Vinculo contrato' })
  @IsOptional()
  @IsUUID()
  contractId?: string | null;

  @ApiPropertyOptional({
    type: () => CreateWorkOrderEmbeddedDto,
    description: 'Work Order ligera embebida',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => CreateWorkOrderEmbeddedDto)
  workOrder?: CreateWorkOrderEmbeddedDto;
}
