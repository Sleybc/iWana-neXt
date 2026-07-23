import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PlatformRole, UserRole } from '@iwana/shared';
import { Roles } from '../../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { CommercialDashboardSummaryDto } from '../dto/dashboard-summary.dto';
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
    PlatformRole.SYSTEM_ADMIN,
  )
  @ApiOperation({
    summary: 'Obtener KPIs del dashboard comercial',
    description:
      'Resumen operativo H8: conteos legacy + ofertas en riesgo, catálogo vendible, huecos de reglas y lista de atención (máx. 5). Sin PII.',
  })
  @ApiOkResponse({ type: CommercialDashboardSummaryDto })
  getSummary() {
    return this.commercialDashboardService.getSummary();
  }
}
