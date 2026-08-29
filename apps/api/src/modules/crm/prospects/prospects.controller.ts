import {
  Body,
  Controller,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AccessPermissionKey, PlatformRole, UserRole } from '@iwana/shared';
import { Roles } from '../../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Permissions } from '../../access-control/decorators/permissions.decorator';
import { PermissionsGuard } from '../../access-control/guards/permissions.guard';
import { ZodBodyValidationPipe } from '../pipes/zod-body-validation.pipe';
import { scheduleInstallationSchema } from '../schemas/schedule-installation.schema';
import { rescheduleInstallationSchema } from '../schemas/reschedule-installation.schema';
import { ProspectsService } from './prospects.service';
import { ScheduleInstallationDto } from './dto/schedule-installation.dto';
import { RescheduleInstallationDto } from './dto/reschedule-installation.dto';
import { ProspectResponseDto } from './dto/prospect-response.dto';

@ApiTags('crm')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller('crm/prospects')
export class ProspectsController {
  constructor(private readonly prospectsService: ProspectsService) {}

  @Post(':id/schedule-installation')
  @Roles(UserRole.ADMIN, UserRole.SALES, UserRole.SUPPORT, PlatformRole.SYSTEM_ADMIN)
  @Permissions(AccessPermissionKey.CRM_EXPEDIENTES_MANAGE)
  @ApiOperation({ summary: 'Programar instalacion de prospecto', deprecated: true })
  @UsePipes(new ZodBodyValidationPipe(scheduleInstallationSchema))
  async scheduleInstallation(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ScheduleInstallationDto,
  ): Promise<{ data: ProspectResponseDto }> {
    const data = await this.prospectsService.scheduleInstallation(id, dto);
    return { data };
  }

  @Patch(':id/reschedule')
  @Roles(UserRole.ADMIN, UserRole.SALES, UserRole.SUPPORT, PlatformRole.SYSTEM_ADMIN)
  @Permissions(AccessPermissionKey.CRM_EXPEDIENTES_MANAGE)
  @ApiOperation({ summary: 'Reprogramar instalacion o visita tecnica', deprecated: true })
  @UsePipes(new ZodBodyValidationPipe(rescheduleInstallationSchema))
  async rescheduleInstallation(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RescheduleInstallationDto,
  ): Promise<{ data: ProspectResponseDto }> {
    const data = await this.prospectsService.rescheduleInstallation(id, dto);
    return { data };
  }
}
