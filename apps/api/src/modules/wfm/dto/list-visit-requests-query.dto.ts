import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { z } from 'zod';
import {
  VisitRequestStatus,
  WorkOrderSourceContext,
  WfmWorkType,
  WorkOrderPriority,
} from '@iwana/shared';

// --- Zod schema ---

/** Schema Zod para query params de listado de solicitudes de visita. SPEC-MOD09 §6.2 */
export const ListVisitRequestsQuerySchema = z.object({
  status: z.nativeEnum(VisitRequestStatus).optional(),
  originContext: z.nativeEnum(WorkOrderSourceContext).optional(),
  workType: z.nativeEnum(WfmWorkType).optional(),
  priority: z.nativeEnum(WorkOrderPriority).optional(),
  municipality: z.string().optional(),
  sector: z.string().optional(),
  /** ADR-076: pre-buscar por unidad de origen antes de POST create. */
  originRef: z.string().max(160).optional(),
  /** Filtro por expediente CRM (columna dedicada; complementa originRef). */
  expedienteId: z.string().uuid().optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  /** Alcance del listado. actionable: bandeja "Pendientes por programar" sin trabajo ya agendado. */
  scope: z.enum(['all', 'actionable']).optional().default('all'),
  page: z.number().int().min(1).optional().default(1),
  limit: z.number().int().min(1).max(100).optional().default(20),
});

export type ListVisitRequestsQueryInput = z.infer<typeof ListVisitRequestsQuerySchema>;

// --- DTO class-validator para ValidationPipe + OpenAPI ---

/** DTO de query params para listar solicitudes de visita con filtros. */
export class ListVisitRequestsQueryDto {
  @ApiPropertyOptional({
    enum: VisitRequestStatus,
    description: 'Filtrar por estado de la solicitud',
  })
  @IsOptional()
  @IsEnum(VisitRequestStatus)
  status?: VisitRequestStatus;

  @ApiPropertyOptional({
    enum: WorkOrderSourceContext,
    description: 'Filtrar por contexto de origen',
  })
  @IsOptional()
  @IsEnum(WorkOrderSourceContext)
  originContext?: WorkOrderSourceContext;

  @ApiPropertyOptional({ enum: WfmWorkType, description: 'Filtrar por tipo de trabajo' })
  @IsOptional()
  @IsEnum(WfmWorkType)
  workType?: WfmWorkType;

  @ApiPropertyOptional({ enum: WorkOrderPriority, description: 'Filtrar por prioridad' })
  @IsOptional()
  @IsEnum(WorkOrderPriority)
  priority?: WorkOrderPriority;

  @ApiPropertyOptional({ description: 'Filtrar por municipio (coincidencia parcial)' })
  @IsOptional()
  @IsString()
  municipality?: string;

  @ApiPropertyOptional({
    description: 'Filtrar por sector, barrio o vereda (coincidencia parcial)',
  })
  @IsOptional()
  @IsString()
  sector?: string;

  @ApiPropertyOptional({
    example: '550e8400-e29b-41d4-a716-446655440000',
    maxLength: 160,
    description:
      'Filtrar por referencia de origen (ADR-076). Comparación exacta tras trim. Útil para pre-buscar visita activa antes de POST create.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  originRef?: string;

  @ApiPropertyOptional({
    example: '550e8400-e29b-41d4-a716-446655440000',
    format: 'uuid',
    description: 'Filtrar por expediente CRM vinculado a la solicitud',
  })
  @IsOptional()
  @IsUUID()
  expedienteId?: string;

  @ApiPropertyOptional({
    example: '2026-06-01T00:00:00Z',
    description: 'Inicio del rango de busqueda por fecha de creacion',
  })
  @IsOptional()
  @IsDateString({ strict: false })
  from?: string;

  @ApiPropertyOptional({
    example: '2026-06-07T23:59:59Z',
    description: 'Fin del rango de busqueda por fecha de creacion',
  })
  @IsOptional()
  @IsDateString({ strict: false })
  to?: string;

  @ApiPropertyOptional({
    enum: ['all', 'actionable'],
    default: 'all',
    description:
      'Alcance del listado. all (default): comportamiento actual. actionable: solo estados programables ' +
      '(PENDING, NEEDS_CONTEXT, READY_TO_SCHEDULE, REQUIRES_RESCHEDULE) y sin trabajo de campo ya agendado ' +
      'para la unidad de origen (ADR-076 D2).',
  })
  @IsOptional()
  @IsIn(['all', 'actionable'])
  scope?: 'all' | 'actionable';

  @ApiPropertyOptional({ example: 1, minimum: 1, default: 1, description: 'Numero de pagina' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({
    example: 20,
    minimum: 1,
    maximum: 100,
    default: 20,
    description: 'Items por pagina',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}
