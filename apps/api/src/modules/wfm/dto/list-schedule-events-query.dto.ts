import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
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

  @ApiPropertyOptional({ format: 'uuid', description: 'Filtrar por tecnico asignado' })
  @IsOptional()
  @IsUUID()
  assignedUserId?: string;

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
}
