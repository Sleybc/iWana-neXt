import { Controller, Get, Header, Query, Res, StreamableFile, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProduces, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { PlatformAuditService } from './platform-audit.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { SkipAudit } from './decorators/skip-audit.decorator';
import { PlatformRole } from '@iwana/shared';
import { PlatformAuditLogListResponseDto } from './dto/audit-log-response.dto';
import { QueryPlatformAuditLogsDto } from './dto/query-platform-audit-logs.dto';
import { AUDIT_EXPORT_TRUNCATED_HEADER } from './helpers/audit-export.helper';

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
    description:
      'Filtros: action, entityType, userId, fromDate, toDate (ISO 8601). Paginación cursor-based.',
  })
  @ApiResponse({
    status: 200,
    description: 'Lista de entradas de audit de plataforma.',
    type: PlatformAuditLogListResponseDto,
  })
  async findAll(@Query() dto: QueryPlatformAuditLogsDto): Promise<PlatformAuditLogListResponseDto> {
    return this.platformAuditService.query(dto);
  }

  @Get('export')
  @ApiOperation({
    summary: 'Exportar audit log de plataforma a CSV',
    description:
      'Mismos filtros que el listado (sin cursor/limit). Máximo 5000 filas. ' +
      'Si se trunca, responde con header X-Export-Truncated: true y una fila comentario en el CSV.',
  })
  @ApiProduces('text/csv')
  @ApiResponse({
    status: 200,
    description: 'Archivo CSV (text/csv). Header X-Export-Truncated si aplica.',
  })
  @Header('Content-Type', 'text/csv; charset=utf-8')
  async export(
    @Query() dto: QueryPlatformAuditLogsDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const result = await this.platformAuditService.exportCsv(dto);
    const filename = `platform-audit-logs-${new Date().toISOString().slice(0, 10)}.csv`;
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
