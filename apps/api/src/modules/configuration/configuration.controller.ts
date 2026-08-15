import { Controller, Get, UnauthorizedException, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { AccessPermissionKey, type SettingsPriorityResponse, UserRole } from '@iwana/shared';
import { Permissions } from '../access-control/decorators/permissions.decorator';
import { PermissionsGuard } from '../access-control/guards/permissions.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { SettingsPriorityApiResponseDto } from './dto/settings-priority.dto';
import { SettingsRegistryService } from './services/settings-registry.service';
import { SettingsPriorityService } from './services/settings-priority.service';

@ApiTags('configuration')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('configuration')
export class ConfigurationController {
  constructor(
    private readonly settingsRegistryService: SettingsRegistryService,
    private readonly settingsPriorityService: SettingsPriorityService,
  ) {}

  @Get('settings-sections')
  @Roles(
    UserRole.ADMIN,
    UserRole.NOC,
    UserRole.SUPPORT,
    UserRole.SALES,
    UserRole.TECHNICIAN,
    UserRole.ACCOUNTANT,
    UserRole.HR,
    UserRole.AUDITOR,
    UserRole.CONTRACTOR,
  )
  @ApiOperation({ summary: 'Listar secciones federadas del centro de settings' })
  @ApiResponse({ status: 200, description: 'Metadata visible del shell de settings.' })
  async listSettingsSections() {
    const data = this.settingsRegistryService.listSections();
    return { data };
  }

  @Get('settings-priority')
  @UseGuards(PermissionsGuard)
  @Roles(UserRole.ADMIN)
  @Permissions(AccessPermissionKey.SETTINGS_READ)
  @ApiOperation({ summary: 'Obtener la prioridad actual del centro de configuración' })
  @ApiOkResponse({
    description: 'Prioridad calculada desde fuentes federadas del tenant autenticado.',
    type: SettingsPriorityApiResponseDto,
  })
  @ApiUnauthorizedResponse({ description: 'Token ausente, inválido o expirado.' })
  @ApiForbiddenResponse({ description: 'Rol o permiso insuficiente.' })
  async getSettingsPriority(
    @CurrentUser() user: JwtPayload,
  ): Promise<{ data: SettingsPriorityResponse }> {
    if (user.type !== 'tenant' || !user.tenantId || !user.schemaName) {
      throw new UnauthorizedException({
        code: 'UNAUTHORIZED',
        message: 'La sesión no contiene un contexto de empresa válido.',
      });
    }

    const data = await this.settingsPriorityService.getPriority({
      tenantId: user.tenantId,
      schemaName: user.schemaName,
    });
    return { data };
  }
}
