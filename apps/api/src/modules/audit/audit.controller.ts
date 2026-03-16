import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuditQueryService } from './audit-query.service';
import { QueryAuditLogsDto } from './dto/query-audit-logs.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { SkipAudit } from './decorators/skip-audit.decorator';
import { AuditLog } from '@iwana/db';
import { UserRole } from '@iwana/shared';

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
  @ApiOperation({ summary: 'Consultar audit log del tenant con filtros y paginacion cursor-based' })
  @ApiResponse({ status: 200, description: 'Lista de entradas de audit.' })
  async findAll(
    @Query() dto: QueryAuditLogsDto,
  ): Promise<{ data: AuditLog[]; meta: { nextCursor: string | null; total: number } }> {
    return this.auditQueryService.query(dto);
  }
}
