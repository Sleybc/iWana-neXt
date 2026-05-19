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
} from 'class-validator';
import { z } from 'zod';
import { WorkOrderSourceContext, WfmWorkType, WorkOrderPriority } from '@iwana/shared';

// --- Zod schema ---

/** Schema Zod para la creacion de una solicitud de visita. SPEC-MOD09 §6.2 */
export const CreateVisitRequestSchema = z.object({
  originContext: z.nativeEnum(WorkOrderSourceContext),
  originRef: z.string().max(160).optional().nullable(),
  originLabel: z.string().max(160).optional().nullable(),
  workType: z.nativeEnum(WfmWorkType),
  priority: z.nativeEnum(WorkOrderPriority).optional().default(WorkOrderPriority.NORMAL),
  title: z.string().min(1).max(160),
  description: z.string().optional().nullable(),
  operatingSiteId: z.string().uuid().optional().nullable(),
  requestedWindowStartAt: z.string().datetime({ offset: true }).optional().nullable(),
  requestedWindowEndAt: z.string().datetime({ offset: true }).optional().nullable(),
  slaDueAt: z.string().datetime({ offset: true }).optional().nullable(),
  address: z.string().max(255).optional().nullable(),
  municipality: z.string().max(120).optional().nullable(),
  sector: z.string().max(120).optional().nullable(),
  latitude: z.number().min(-90).max(90).optional().nullable(),
  longitude: z.number().min(-180).max(180).optional().nullable(),
  expedienteId: z.string().uuid().optional().nullable(),
  subscriberId: z.string().uuid().optional().nullable(),
  ticketId: z.string().max(160).optional().nullable(),
  contractId: z.string().uuid().optional().nullable(),
});

export type CreateVisitRequestInput = z.infer<typeof CreateVisitRequestSchema>;

export function toCreateVisitRequestInput(dto: CreateVisitRequestDto): CreateVisitRequestInput {
  return {
    ...dto,
    priority: dto.priority ?? WorkOrderPriority.NORMAL,
  };
}

// --- DTO class-validator para ValidationPipe + OpenAPI ---

/** DTO para crear una solicitud de visita operativa. */
export class CreateVisitRequestDto {
  @ApiProperty({ enum: WorkOrderSourceContext, description: 'Sistema que solicita la visita' })
  @IsEnum(WorkOrderSourceContext)
  originContext: WorkOrderSourceContext;

  @ApiPropertyOptional({
    example: 'EXP-2026-001',
    maxLength: 160,
    description: 'ID externo o referencia semantica del sistema origen',
  })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  originRef?: string | null;

  @ApiPropertyOptional({
    example: 'Expediente EXP-2026-001',
    maxLength: 160,
    description: 'Etiqueta legible del sistema origen',
  })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  originLabel?: string | null;

  @ApiProperty({ enum: WfmWorkType, description: 'Tipo de trabajo a realizar' })
  @IsEnum(WfmWorkType)
  workType: WfmWorkType;

  @ApiPropertyOptional({
    enum: WorkOrderPriority,
    default: WorkOrderPriority.NORMAL,
    description: 'Prioridad del trabajo',
  })
  @IsOptional()
  @IsEnum(WorkOrderPriority)
  priority?: WorkOrderPriority;

  @ApiProperty({ example: 'Instalacion fibra optica zona norte', maxLength: 160 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  title: string;

  @ApiPropertyOptional({ description: 'Detalle de la solicitud' })
  @IsOptional()
  @IsString()
  description?: string | null;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Sede operativa WFM asociada a la solicitud',
  })
  @IsOptional()
  @IsUUID()
  operatingSiteId?: string | null;

  @ApiPropertyOptional({
    example: '2026-06-01T09:00:00Z',
    description: 'Inicio de la ventana temporal solicitada (ISO 8601)',
  })
  @IsOptional()
  @IsDateString({ strict: false })
  requestedWindowStartAt?: string | null;

  @ApiPropertyOptional({
    example: '2026-06-01T17:00:00Z',
    description: 'Fin de la ventana temporal solicitada (ISO 8601)',
  })
  @IsOptional()
  @IsDateString({ strict: false })
  requestedWindowEndAt?: string | null;

  @ApiPropertyOptional({
    example: '2026-06-05T23:59:59Z',
    description: 'Fecha limite de atencion por SLA (ISO 8601)',
  })
  @IsOptional()
  @IsDateString({ strict: false })
  slaDueAt?: string | null;

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
}
