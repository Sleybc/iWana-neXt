import { Controller, Get, Header, Query, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import {
  AccessPermissionKey,
  SubscribersDashboardSummaryQuerySchema,
  UserRole,
  type SubscribersDashboardSummary,
} from '@iwana/shared';
import { Roles } from '../../../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../../auth/guards/roles.guard';
import { Permissions } from '../../../access-control/decorators/permissions.decorator';
import { PermissionsGuard } from '../../../access-control/guards/permissions.guard';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe';
import { SubscribersDashboardService } from './subscribers-dashboard.service';
import { SUBSCRIBERS_DASHBOARD_SUMMARY_OPENAPI_SCHEMA } from './subscribers-dashboard.openapi';

/**
 * N2 · Altas y bajas del inicio del portal (HLD-MOD02 v3.0 §3 N2 y §8.5).
 *
 * Se registra en `SubscribersModule` antes que `SubscribersController` para que la ruta
 * `crm/subscribers/:id` nunca la capture.
 */
@ApiTags('crm')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller('crm/subscribers/dashboard')
export class SubscribersDashboardController {
  constructor(private readonly dashboardService: SubscribersDashboardService) {}

  @Get('summary')
  // Conteos del tenant: ni el navegador ni un proxy deben guardarlos (igual que N1).
  @Header('Cache-Control', 'no-store')
  @Roles(UserRole.ADMIN, UserRole.SALES, UserRole.ACCOUNTANT)
  @Permissions(AccessPermissionKey.CRM_SUBSCRIBERS_READ)
  @ApiOperation({
    summary: 'Altas y bajas de suscriptores del mes en curso y de los últimos doce meses',
    description:
      'Conteos por mes civil del tenant. No acepta parámetros: el horizonte de doce meses lo fija el servidor.',
  })
  @ApiOkResponse({
    description: 'Resumen de altas y bajas',
    schema: SUBSCRIBERS_DASHBOARD_SUMMARY_OPENAPI_SCHEMA,
  })
  @ApiBadRequestResponse({ description: 'La consulta no admite parámetros.' })
  @ApiUnauthorizedResponse({ description: 'Sin sesión válida.' })
  @ApiForbiddenResponse({ description: 'Rol o permiso insuficiente.' })
  async getSummary(
    @Query(new ZodValidationPipe(SubscribersDashboardSummaryQuerySchema)) _query: unknown,
  ): Promise<{ data: SubscribersDashboardSummary }> {
    return { data: await this.dashboardService.getSummary() };
  }
}
