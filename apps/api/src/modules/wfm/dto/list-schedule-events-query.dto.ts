import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { ScheduleEventStatus, WfmWorkType } from '@iwana/shared';

/** DTO de query params para listar eventos de agenda con filtros. */
export class ListScheduleEventsQueryDto {
  @ApiPropertyOptional({
    example: '2026-06-01T00:00:00Z',
    description: 'Inicio del rango de busqueda',
  })
  @IsOptional()
  @IsDateString({ strict: false })
  from?: string;

  @ApiPropertyOptional({
    example: '2026-06-07T23:59:59Z',
    description: 'Fin del rango de busqueda',
  })
  @IsOptional()
  @IsDateString({ strict: false })
  to?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Filtrar por usuario responsable asignado' })
  @IsOptional()
  @IsUUID()
  assignedUserId?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Filtrar por expediente CRM vinculado' })
  @IsOptional()
  @IsUUID()
  expedienteId?: string;

  @ApiPropertyOptional({ enum: WfmWorkType, description: 'Filtrar por tipo de trabajo' })
  @IsOptional()
  @IsEnum(WfmWorkType)
  type?: WfmWorkType;

  @ApiPropertyOptional({ enum: ScheduleEventStatus, description: 'Filtrar por estado del evento' })
  @IsOptional()
  @IsEnum(ScheduleEventStatus)
  status?: ScheduleEventStatus;

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

  @ApiPropertyOptional({ minimum: 1, example: 1, description: 'Número de página (≥ 1)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({
    minimum: 1,
    maximum: 100,
    example: 20,
    description: 'Tamaño de página (1–100)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
