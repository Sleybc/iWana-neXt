import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { PlatformAuditService } from './platform-audit.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { SkipAudit } from './decorators/skip-audit.decorator';
import { PlatformRole } from '@iwana/shared';
import { PlatformAuditLog } from '@iwana/db';

@Controller('platform-audit-logs')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(PlatformRole.SYSTEM_ADMIN, PlatformRole.IWANA_SUPPORT)
@SkipAudit()
@ApiTags('platform-audit-logs')
@ApiBearerAuth('access-token')
export class PlatformAuditController {
  constructor(private readonly platformAuditService: PlatformAuditService) {}

  @Get()
  @ApiOperation({
    summary: 'Consultar audit log de plataforma con filtros y paginación cursor-based',
  })
  @ApiResponse({ status: 200, description: 'Lista de entradas de audit de plataforma.' })
  async findAll(
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
    @Query('action') action?: string,
    @Query('entityType') entityType?: string,
  ): Promise<{ data: PlatformAuditLog[]; nextCursor: string | null }> {
    const queryParams: {
      limit: number;
      cursor?: string;
      action?: string;
      entityType?: string;
    } = { limit: limit ? parseInt(limit, 10) : 50 };
    if (cursor) queryParams.cursor = cursor;
    if (action) queryParams.action = action;
    if (entityType) queryParams.entityType = entityType;
    return this.platformAuditService.query(queryParams);
  }
}
