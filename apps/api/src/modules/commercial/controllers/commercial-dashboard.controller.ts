import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@iwana/shared';
import { Roles } from '../../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { CommercialDashboardService } from '../services/commercial-dashboard.service';

@ApiTags('commercial-dashboard')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('commercial/dashboard')
export class CommercialDashboardController {
  constructor(private readonly commercialDashboardService: CommercialDashboardService) {}

  @Get('summary')
  @Roles(
    UserRole.ADMIN,
    UserRole.SALES,
    UserRole.SUPPORT,
    UserRole.NOC,
    UserRole.ACCOUNTANT,
    UserRole.SYSTEM_ADMIN,
  )
  @ApiOperation({ summary: 'Obtener KPIs del dashboard comercial' })
  getSummary() {
    return this.commercialDashboardService.getSummary();
  }
}
