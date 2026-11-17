import { Controller, Get, Header, Query, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import {
  ASSURANCE_DASHBOARD_SERIES_DAYS,
  AccessPermissionKey,
  AssuranceDashboardSeriesQuerySchema,
  UserRole,
  type AssuranceDashboardSeries,
  type AssuranceDashboardSeriesQuery,
} from '@iwana/shared';
import { Roles } from '../../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Permissions } from '../../access-control/decorators/permissions.decorator';
import { PermissionsGuard } from '../../access-control/guards/permissions.guard';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import { AssuranceDashboardSeriesService } from './assurance-dashboard-series.service';
import { ASSURANCE_DASHBOARD_SERIES_OPENAPI_SCHEMA } from './assurance-dashboard-series.openapi';

/**
 * N3 · Casos creados y resueltos por día para el inicio del portal (HLD-MOD02 v3.0 §3 N3).
 * Endpoint aparte para no tocar el contrato publicado de `assurance/dashboard/summary`.
 */
@ApiTags('assurance')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller('assurance/dashboard')
export class AssuranceDashboardSeriesController {
  constructor(private readonly seriesService: AssuranceDashboardSeriesService) {}

  @Get('series')
  // Conteos del tenant: ni el navegador ni un proxy deben guardarlos (igual que N1).
  @Header('Cache-Control', 'no-store')
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT)
  @Permissions(AccessPermissionKey.ASSURANCE_TICKETS_READ)
  @ApiOperation({
    summary: 'Casos creados y resueltos por día civil del tenant',
    description: 'Serie contigua que termina hoy; excluye los casos importados.',
  })
  @ApiQuery({
    name: 'days',
    required: false,
    type: Number,
    minimum: ASSURANCE_DASHBOARD_SERIES_DAYS.min,
    maximum: ASSURANCE_DASHBOARD_SERIES_DAYS.max,
    example: ASSURANCE_DASHBOARD_SERIES_DAYS.default,
    description: `Días de la serie (${ASSURANCE_DASHBOARD_SERIES_DAYS.min}–${ASSURANCE_DASHBOARD_SERIES_DAYS.max}); ${ASSURANCE_DASHBOARD_SERIES_DAYS.default} si se omite.`,
  })
  @ApiOkResponse({
    description: 'Serie diaria de casos',
    schema: ASSURANCE_DASHBOARD_SERIES_OPENAPI_SCHEMA,
  })
  @ApiBadRequestResponse({ description: '`days` fuera de rango o parámetro desconocido.' })
  @ApiUnauthorizedResponse({ description: 'Sin sesión válida.' })
  @ApiForbiddenResponse({ description: 'Rol o permiso insuficiente.' })
  async getSeries(
    @Query(new ZodValidationPipe(AssuranceDashboardSeriesQuerySchema))
    query: AssuranceDashboardSeriesQuery,
  ): Promise<{ data: AssuranceDashboardSeries }> {
    return { data: await this.seriesService.getSeries(query.days) };
  }
}
