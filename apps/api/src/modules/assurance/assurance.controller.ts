import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AccessPermissionKey, UserRole } from '@iwana/shared';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Permissions } from '../access-control/decorators/permissions.decorator';
import { PermissionsGuard } from '../access-control/guards/permissions.guard';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import {
  AddCommentDto,
  AddCommentSchema,
  AssignTicketDto,
  AssignTicketSchema,
  CreateSlaPolicyDto,
  CreateSlaPolicySchema,
  CreateTicketDto,
  CreateTicketSchema,
  FindOrCreateInstallationTicketSchema,
  LinkWorkOrderDto,
  LinkWorkOrderSchema,
  ListTicketsQueryDto,
  ListTicketsQuerySchema,
  ListTicketsResponseDto,
  RequestFieldServiceDto,
  RequestFieldServiceSchema,
  TransitionTicketDto,
  TransitionTicketSchema,
  UpdateTicketDto,
  UpdateTicketSchema,
} from './dto';
import { ListMetaDto } from '../../common/pagination';
import { AssuranceDashboardService } from './services/assurance-dashboard.service';
import { CommentsService } from './services/comments.service';
import { SlaService } from './services/sla.service';
import { TicketsService } from './services/tickets.service';
import { TimelineService } from './services/timeline.service';

const dashboardSummarySchema = {
  type: 'object',
  properties: {
    openCount: { type: 'number' },
    assignedCount: { type: 'number' },
    inProgressCount: { type: 'number' },
    atRiskCount: { type: 'number' },
    breachedCount: { type: 'number' },
    resolvedTodayCount: { type: 'number' },
    fieldServicePendingCount: { type: 'number' },
    byPriority: {
      type: 'object',
      additionalProperties: { type: 'number' },
    },
    byType: {
      type: 'object',
      additionalProperties: { type: 'number' },
    },
    byQueue: {
      type: 'object',
      additionalProperties: { type: 'number' },
    },
  },
  required: [
    'openCount',
    'assignedCount',
    'inProgressCount',
    'atRiskCount',
    'breachedCount',
    'resolvedTodayCount',
    'fieldServicePendingCount',
    'byPriority',
    'byType',
    'byQueue',
  ],
};

/**
 * Assurance — tickets, comentarios, timeline y SLA.
 *
 * Nota (DEF-2 D-6): la validación efectiva de query/body en este controller
 * la hace `ZodValidationPipe` + schemas Zod (p. ej. `ListTicketsQuerySchema`),
 * no el `ValidationPipe` global de class-validator. Los DTO clase con `@Allow()`
 * existen solo para OpenAPI / tipado Nest; no son la fuente de verdad de cotas.
 */
@ApiTags('assurance')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller('assurance')
export class AssuranceController {
  constructor(
    private readonly ticketsService: TicketsService,
    private readonly commentsService: CommentsService,
    private readonly timelineService: TimelineService,
    private readonly slaService: SlaService,
    private readonly dashboardService: AssuranceDashboardService,
  ) {}

  @Get('tickets')
  @Roles(
    UserRole.ADMIN,
    UserRole.NOC,
    UserRole.SUPPORT,
    UserRole.TECHNICIAN,
    UserRole.CONTRACTOR,
    UserRole.AUDITOR,
  )
  @Permissions(AccessPermissionKey.ASSURANCE_TICKETS_READ)
  @ApiOperation({ summary: 'Listar tickets del tenant' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1, minimum: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20 })
  listTickets(
    @Query(new ZodValidationPipe(ListTicketsQuerySchema)) query: ListTicketsQueryDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.ticketsService.list(query, actor);
  }

  @Post('tickets')
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT)
  @Permissions(AccessPermissionKey.ASSURANCE_TICKETS_MANAGE)
  @ApiOperation({ summary: 'Crear ticket de service assurance' })
  @ApiResponse({ status: 201, description: 'Ticket creado' })
  createTicket(
    @Body(new ZodValidationPipe(CreateTicketSchema)) dto: CreateTicketDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.ticketsService.create(dto, actor);
  }

  @Post('tickets/find-or-create-installation')
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT)
  @Permissions(AccessPermissionKey.ASSURANCE_TICKETS_MANAGE)
  @ApiOperation({ summary: 'Buscar o crear ticket de instalación para expediente' })
  @ApiResponse({ status: 200, description: 'Ticket encontrado o creado' })
  async findOrCreateInstallationTicket(@Body() body: unknown, @CurrentUser() actor: JwtPayload) {
    const dto = FindOrCreateInstallationTicketSchema.parse(body);
    return this.ticketsService.findOrCreateInstallationTicket(dto, actor.sub);
  }

  @Patch('tickets/:id/status')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT, UserRole.TECHNICIAN, UserRole.CONTRACTOR)
  @Permissions(AccessPermissionKey.ASSURANCE_TICKETS_MANAGE)
  @ApiOperation({ summary: 'Transicionar estado del ticket' })
  transitionTicketStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(TransitionTicketSchema)) dto: TransitionTicketDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.ticketsService.transitionStatus(id, dto, actor);
  }

  @Post('tickets/:id/comments')
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT, UserRole.TECHNICIAN, UserRole.CONTRACTOR)
  @Permissions(AccessPermissionKey.ASSURANCE_TICKETS_MANAGE)
  @ApiOperation({ summary: 'Agregar comentario al ticket' })
  async addComment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(AddCommentSchema)) dto: AddCommentDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    await this.ticketsService.getById(id, actor);
    return this.commentsService.addComment(id, dto, actor);
  }

  @Get('tickets/:id/comments')
  @Roles(
    UserRole.ADMIN,
    UserRole.NOC,
    UserRole.SUPPORT,
    UserRole.TECHNICIAN,
    UserRole.CONTRACTOR,
    UserRole.AUDITOR,
  )
  @Permissions(AccessPermissionKey.ASSURANCE_TICKETS_READ)
  @ApiOperation({ summary: 'Listar comentarios del ticket' })
  async listComments(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: JwtPayload) {
    await this.ticketsService.getById(id, actor);
    return this.commentsService.listComments(id, actor);
  }

  @Post('tickets/:id/assign')
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT)
  @Permissions(AccessPermissionKey.ASSURANCE_TICKETS_MANAGE)
  @ApiOperation({ summary: 'Asignar responsable o cola del ticket' })
  assignTicket(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(AssignTicketSchema)) dto: AssignTicketDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.ticketsService.assign(id, dto, actor);
  }

  @Get('tickets/:id/timeline')
  @Roles(
    UserRole.ADMIN,
    UserRole.NOC,
    UserRole.SUPPORT,
    UserRole.TECHNICIAN,
    UserRole.CONTRACTOR,
    UserRole.AUDITOR,
  )
  @Permissions(AccessPermissionKey.ASSURANCE_TICKETS_READ)
  @ApiOperation({ summary: 'Listar timeline del ticket' })
  async listTimeline(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: JwtPayload) {
    await this.ticketsService.getById(id, actor);
    return this.timelineService.listTimeline(id);
  }

  @Post('tickets/:id/field-service')
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT, UserRole.TECHNICIAN, UserRole.CONTRACTOR)
  @Permissions(AccessPermissionKey.ASSURANCE_TICKETS_MANAGE)
  @ApiOperation({ summary: 'Solicitar trabajo de campo hacia WFM' })
  requestFieldService(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(RequestFieldServiceSchema)) dto: RequestFieldServiceDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.ticketsService.requestFieldService(id, dto, actor);
  }

  @Post('tickets/:id/request-field-service')
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT, UserRole.TECHNICIAN, UserRole.CONTRACTOR)
  @Permissions(AccessPermissionKey.ASSURANCE_TICKETS_MANAGE)
  @ApiOperation({ summary: 'Solicitar trabajo de campo hacia WFM (alias REST de fase 01)' })
  requestFieldServiceAlias(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(RequestFieldServiceSchema)) dto: RequestFieldServiceDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.ticketsService.requestFieldService(id, dto, actor);
  }

  @Post('tickets/:id/link-work-order')
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT)
  @Permissions(AccessPermissionKey.ASSURANCE_TICKETS_MANAGE)
  @ApiOperation({ summary: 'Asociar una Work Order existente al ticket' })
  linkWorkOrder(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(LinkWorkOrderSchema)) dto: LinkWorkOrderDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.ticketsService.linkWorkOrder(id, dto, actor);
  }

  @Get('tickets/:id')
  @Roles(
    UserRole.ADMIN,
    UserRole.NOC,
    UserRole.SUPPORT,
    UserRole.TECHNICIAN,
    UserRole.CONTRACTOR,
    UserRole.AUDITOR,
  )
  @Permissions(AccessPermissionKey.ASSURANCE_TICKETS_READ)
  @ApiOperation({ summary: 'Obtener detalle de ticket' })
  getTicket(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: JwtPayload) {
    return this.ticketsService.getById(id, actor);
  }

  @Patch('tickets/:id')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT, UserRole.TECHNICIAN, UserRole.CONTRACTOR)
  @Permissions(AccessPermissionKey.ASSURANCE_TICKETS_MANAGE)
  @ApiOperation({ summary: 'Actualizar campos editables del ticket' })
  updateTicket(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdateTicketSchema)) dto: UpdateTicketDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.ticketsService.update(id, dto, actor);
  }

  @Get('sla-policies')
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT, UserRole.AUDITOR)
  @Permissions(AccessPermissionKey.ASSURANCE_TICKETS_READ)
  @ApiOperation({ summary: 'Listar políticas SLA del tenant' })
  listSlaPolicies() {
    return this.slaService.listPolicies();
  }

  @Post('sla-policies')
  @Roles(UserRole.ADMIN)
  @Permissions(AccessPermissionKey.ASSURANCE_TICKETS_MANAGE)
  @ApiOperation({ summary: 'Crear política SLA del tenant' })
  createSlaPolicy(@Body(new ZodValidationPipe(CreateSlaPolicySchema)) dto: CreateSlaPolicyDto) {
    return this.slaService.createPolicy(dto);
  }

  @Get('dashboard')
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT, UserRole.AUDITOR)
  @Permissions(AccessPermissionKey.ASSURANCE_TICKETS_READ)
  @ApiOperation({ summary: 'Resumen operativo de assurance' })
  @ApiOkResponse({ description: 'Resumen operativo de assurance', schema: dashboardSummarySchema })
  getDashboard() {
    return this.dashboardService.getSummary();
  }

  @Get('dashboard/summary')
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT, UserRole.AUDITOR)
  @Permissions(AccessPermissionKey.ASSURANCE_TICKETS_READ)
  @ApiOperation({ summary: 'Resumen operativo de assurance para dashboard' })
  @ApiOkResponse({
    description: 'Resumen operativo de assurance para dashboard',
    schema: dashboardSummarySchema,
  })
  getDashboardSummary() {
    return this.dashboardService.getSummary();
  }
}
