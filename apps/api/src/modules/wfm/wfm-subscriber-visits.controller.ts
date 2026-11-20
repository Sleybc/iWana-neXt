import { Controller, Get, Param, ParseUUIDPipe, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  AccessPermissionKey,
  UserRole,
  type SubscriberUpcomingVisitsResponse,
} from '@iwana/shared';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Permissions } from '../access-control/decorators/permissions.decorator';
import { PermissionsGuard } from '../access-control/guards/permissions.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { SubscriberUpcomingVisitsService } from './services/subscriber-upcoming-visits.service';
import { SUBSCRIBER_UPCOMING_VISITS_OPENAPI } from './subscriber-upcoming-visits.openapi';

/** Visitas del suscriptor para la pestaña Soporte (spec 2026-11-20 v1.1, bloque I, H13). */
@ApiTags('wfm')
@ApiBearerAuth('access-token')
@Controller('wfm/subscribers')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class WfmSubscriberVisitsController {
  constructor(private readonly upcomingVisitsService: SubscriberUpcomingVisitsService) {}

  @Get(':subscriberId/upcoming-visits')
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT)
  @Permissions(AccessPermissionKey.WFM_SCHEDULE_READ)
  @ApiOperation({
    summary: 'Listar las visitas activas del suscriptor, de cualquier origen',
    description:
      'Solicitudes y eventos activos vinculados al suscriptor, a su expediente CRM, a sus contratos o a sus tickets (resueltos por puerto de Assurance). Una fila por visita; tope de 50 con `truncated`. Exige wfm.schedule.read; el tenant sale del JWT.',
  })
  @ApiParam({ name: 'subscriberId', format: 'uuid' })
  @ApiOkResponse({ schema: SUBSCRIBER_UPCOMING_VISITS_OPENAPI })
  @ApiResponse({ status: 400, description: 'subscriberId no es UUID' })
  @ApiResponse({ status: 403, description: 'Sin rol o sin permiso wfm.schedule.read' })
  listUpcomingVisits(
    @Param('subscriberId', ParseUUIDPipe) subscriberId: string,
    @CurrentUser() actor: JwtPayload,
  ): Promise<SubscriberUpcomingVisitsResponse> {
    return this.upcomingVisitsService.list(subscriberId, actor);
  }
}
