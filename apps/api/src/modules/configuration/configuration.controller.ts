import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@iwana/shared';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { SettingsRegistryService } from './services/settings-registry.service';

@ApiTags('configuration')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('configuration')
export class ConfigurationController {
  constructor(private readonly settingsRegistryService: SettingsRegistryService) {}

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
}
