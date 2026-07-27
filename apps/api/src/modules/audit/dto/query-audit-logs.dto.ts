import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsISO8601, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { AuditAction } from '@iwana/shared';

/**
 * DTO de filtros para consulta de audit logs del tenant.
 * Todos los campos son opcionales — sin filtros retorna los ultimos registros.
 *
 * HLD-MOD01-ARQUITECTURA-v1.0 Seccion 4 (GET /api/v1/audit-logs)
 */
export class QueryAuditLogsDto {
  /**
   * Cursor compuesto base64url para paginación keyset (ADR-065 DEF-3).
   * Codifica `{ d: createdAt ISO, i: id }` del último registro de la página anterior.
   */
  @ApiPropertyOptional({
    description:
      'Cursor compuesto base64url para paginación keyset (createdAt + id del último registro de la página anterior).',
  })
  @IsOptional()
  @IsString()
  cursor?: string;

  /** Limite de registros por pagina (default 50, max 100) */
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

  /** Filtrar por accion */
  @ApiPropertyOptional({ enum: AuditAction, description: 'Filtrar por acción de auditoría' })
  @IsOptional()
  @IsEnum(AuditAction)
  action?: AuditAction;

  /** Filtrar por tipo de entidad. Ejemplo: 'User', 'Subscriber' */
  @ApiPropertyOptional({
    example: 'User',
    description: 'Filtrar por tipo de entidad (ej. User, Subscriber)',
  })
  @IsOptional()
  @IsString()
  entityType?: string;

  /** Filtrar por ID de entidad especifica */
  @ApiPropertyOptional({ description: 'Filtrar por ID de entidad específica' })
  @IsOptional()
  @IsString()
  entityId?: string;

  /** Filtrar por usuario que realizo la accion */
  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Filtrar por usuario que realizó la acción',
  })
  @IsOptional()
  @IsUUID()
  userId?: string;

  /** Fecha inicial del rango (ISO 8601) */
  @ApiPropertyOptional({
    example: '2026-01-01T00:00:00.000Z',
    description: 'Fecha inicial del rango (ISO 8601, inclusiva)',
  })
  @IsOptional()
  @IsISO8601()
  fromDate?: string;

  /** Fecha final del rango (ISO 8601) */
  @ApiPropertyOptional({
    example: '2026-12-31T23:59:59.999Z',
    description: 'Fecha final del rango (ISO 8601, inclusiva)',
  })
  @IsOptional()
  @IsISO8601()
  toDate?: string;
}
