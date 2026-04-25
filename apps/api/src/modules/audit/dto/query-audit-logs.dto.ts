import { IsEnum, IsISO8601, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { AuditAction } from '@iwana/shared';

/**
 * DTO de filtros para consulta de audit logs.
 * Todos los campos son opcionales — sin filtros retorna los ultimos registros.
 *
 * HLD-MOD01-ARQUITECTURA-v1.0 Seccion 4 (GET /api/v1/audit-logs)
 */
export class QueryAuditLogsDto {
  /** Cursor UUID para paginacion (id del ultimo registro de la pagina anterior) */
  @IsOptional()
  @IsUUID()
  cursor?: string;

  /** Limite de registros por pagina (default 50, max 100) */
  @IsOptional()
  @Type(() => Number)
  @Min(1)
  @Max(100)
  limit?: number = 50;

  /** Filtrar por accion */
  @IsOptional()
  @IsEnum(AuditAction)
  action?: AuditAction;

  /** Filtrar por tipo de entidad. Ejemplo: 'User', 'Subscriber' */
  @IsOptional()
  @IsString()
  entityType?: string;

  /** Filtrar por ID de entidad especifica */
  @IsOptional()
  @IsString()
  entityId?: string;

  /** Filtrar por usuario que realizo la accion */
  @IsOptional()
  @IsUUID()
  userId?: string;

  /** Fecha inicial del rango (ISO 8601) */
  @IsOptional()
  @IsISO8601()
  fromDate?: string;

  /** Fecha final del rango (ISO 8601) */
  @IsOptional()
  @IsISO8601()
  toDate?: string;
}
