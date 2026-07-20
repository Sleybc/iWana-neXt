import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsISO8601, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { AuditAction } from '@iwana/shared';

/**
 * DTO de filtros para consulta de platform_audit_logs.
 * Paridad con QueryAuditLogsDto (fromDate/toDate ISO) — RF-AUD-03 / Fase WEB-UIUX-04.
 */
export class QueryPlatformAuditLogsDto {
  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Cursor UUID para paginación (id del último registro de la página anterior)',
  })
  @IsOptional()
  @IsUUID()
  cursor?: string;

  @ApiPropertyOptional({
    minimum: 1,
    maximum: 100,
    default: 50,
    description: 'Límite de registros por página (default 50, max 100)',
  })
  @IsOptional()
  @Type(() => Number)
  @Min(1)
  @Max(100)
  limit?: number = 50;

  @ApiPropertyOptional({ enum: AuditAction, description: 'Filtrar por acción de auditoría' })
  @IsOptional()
  @IsEnum(AuditAction)
  action?: AuditAction;

  @ApiPropertyOptional({
    example: 'Tenant',
    description: 'Filtrar por tipo de entidad (ej. Tenant, PlatformUser)',
  })
  @IsOptional()
  @IsString()
  entityType?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Filtrar por usuario de plataforma que realizó la acción',
  })
  @IsOptional()
  @IsUUID()
  userId?: string;

  @ApiPropertyOptional({
    example: '2026-01-01T00:00:00.000Z',
    description: 'Fecha inicial del rango (ISO 8601, inclusiva)',
  })
  @IsOptional()
  @IsISO8601()
  fromDate?: string;

  @ApiPropertyOptional({
    example: '2026-12-31T23:59:59.999Z',
    description: 'Fecha final del rango (ISO 8601, inclusiva)',
  })
  @IsOptional()
  @IsISO8601()
  toDate?: string;
}
