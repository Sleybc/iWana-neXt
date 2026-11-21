import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { PlatformRole } from '@iwana/shared';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PlatformOnlyGuard } from '../auth/guards/platform-only.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PlatformHealthHistoryResponseDto } from './dto/platform-health-history.dto';
import { PlatformHealthHistoryService } from './platform-health-history.service';

/**
 * Historia de salud de la consola de plataforma (contrato P2 v1.0). Mismos guards y roles
 * que `GET /platform-users/summary`; el health público sigue en `HealthController`.
 */
@Controller('platform/health')
@UseGuards(JwtAuthGuard, RolesGuard, PlatformOnlyGuard)
@ApiTags('health')
@ApiBearerAuth('access-token')
export class PlatformHealthController {
  constructor(private readonly history: PlatformHealthHistoryService) {}

  @Get('history')
  @Roles(PlatformRole.SYSTEM_ADMIN, PlatformRole.IWANA_SUPPORT)
  @ApiOperation({ summary: 'Disponibilidad de 30 días y colas de la última muestra' })
  @ApiResponse({ status: 200, type: PlatformHealthHistoryResponseDto })
  @ApiResponse({ status: 401, description: 'Token inválido o expirado.' })
  @ApiResponse({ status: 403, description: 'Requiere un token de plataforma.' })
  async getHistory(): Promise<PlatformHealthHistoryResponseDto> {
    return { data: await this.history.getHistory() };
  }
}
