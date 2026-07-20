import { Controller, Get, Header, Query, Res, StreamableFile, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProduces, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { AuditQueryService } from './audit-query.service';
import { QueryAuditLogsDto } from './dto/query-audit-logs.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { SkipAudit } from './decorators/skip-audit.decorator';
import { UserRole } from '@iwana/shared';
import { AuditLogListResponseDto } from './dto/audit-log-response.dto';
import { AUDIT_EXPORT_TRUNCATED_HEADER } from './helpers/audit-export.helper';

/**
 * Controlador de consulta del audit log del tenant.
 *
 * Accesible para ADMIN del tenant y SYSTEM_ADMIN de plataforma.
 * SYSTEM_ADMIN debe proveer X-Tenant-Slug para que TenantMiddleware
 * establezca el contexto de schema antes de ejecutar la query.
 *
 * Los registros son de solo lectura — la escritura es append-only via AuditService.
 *
 * Prefijo: /api/v1/audit-logs
 * HLD-MOD01-ARQUITECTURA-v1.0 Seccion 4 (GET /api/v1/audit-logs)
 */
@Controller('audit-logs')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SYSTEM_ADMIN)
@SkipAudit()
@ApiTags('audit-logs')
@ApiBearerAuth('access-token')
export class AuditController {
  constructor(private readonly auditQueryService: AuditQueryService) {}

  /**
   * Consulta el audit log del tenant con filtros opcionales y paginacion cursor-based.
   *
   * GET /api/v1/audit-logs?cursor=uuid&limit=50&action=LOGIN&entityType=User
   */
  @Get()
  @ApiOperation({
    summary: 'Consultar audit log del tenant con filtros y paginacion cursor-based',
    description:
      'Filtros: action, entityType, entityId, userId, fromDate, toDate (ISO 8601). Paginación cursor-based.',
  })
  @ApiResponse({
    status: 200,
    description: 'Lista de entradas de audit.',
    type: AuditLogListResponseDto,
  })
  async findAll(@Query() dto: QueryAuditLogsDto): Promise<AuditLogListResponseDto> {
    return this.auditQueryService.query(dto);
  }

  @Get('export')
  @ApiOperation({
    summary: 'Exportar audit log del tenant a CSV',
    description:
      'Mismos filtros que el listado (sin cursor/limit). Máximo 5000 filas. ' +
      'Si se trunca, responde con header X-Export-Truncated: true y una fila comentario en el CSV. ' +
      'SYSTEM_ADMIN debe enviar X-Tenant-Slug.',
  })
  @ApiProduces('text/csv')
  @ApiResponse({
    status: 200,
    description: 'Archivo CSV (text/csv). Header X-Export-Truncated si aplica.',
  })
  @Header('Content-Type', 'text/csv; charset=utf-8')
  async export(
    @Query() dto: QueryAuditLogsDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const result = await this.auditQueryService.exportCsv(dto);
    const filename = `audit-logs-${new Date().toISOString().slice(0, 10)}.csv`;
    const headers: Record<string, string> = {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    };
    if (result.truncated) {
      headers[AUDIT_EXPORT_TRUNCATED_HEADER] = 'true';
    }
    response.set(headers);
    return new StreamableFile(Buffer.from(result.csv, 'utf-8'));
  }
}
