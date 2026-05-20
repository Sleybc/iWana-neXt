import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
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
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
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
