import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@iwana/shared';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { ScheduleEventsService } from './services/schedule-events.service';
import { VisitRequestsService } from './services/visit-requests.service';
import { ScheduleRecommendationsService } from './services/schedule-recommendations.service';
import { WorkOrdersService } from './services/work-orders.service';
import { TechnicianAvailabilityService } from './services/technician-availability.service';
import { WfmDashboardService } from './services/wfm-dashboard.service';
import { OperationalEventualitiesService } from './services/operational-eventualities.service';
import { WfmEligibleAssigneeDto, WfmOrganizationSiteDto } from './dto';
import {
  CreateOperationalEventualityDto,
  UpdateOperationalEventualityStatusDto,
} from './dto/operational-eventuality.dto';
import { WfmOrganizationSitesReadPort } from './ports/wfm-organization-sites-read.port';
import { WfmTenantSettingsReadPort } from './ports/wfm-tenant-settings-read.port';
import { OperatingWindowResolverService } from './services/operating-window-resolver.service';
import {
  CancelVisitRequestDto,
  CreateScheduleEventDto,
  CreateVisitRequestDto,
  ListVisitRequestsQueryDto,
  RecommendVisitRequestDto,
  RejectVisitRequestDto,
  ScheduleRecommendationRequestDto,
  ScheduleVisitRequestDto,
  toCreateVisitRequestInput,
  toCreateScheduleEventInput,
  ListScheduleEventsQueryDto,
  ListTechnicianAvailabilityQueryDto,
  MoveScheduleEventToPendingDto,
  CreateTechnicianAvailabilityDto,
  RescheduleEventDto,
  TransitionScheduleEventDto,
  TransitionWorkOrderDto,
  ResolveOperatingWindowDto,
  UpdateScheduleEventDto,
  UpdateVisitRequestContextDto,
  VisitRequestFilterOptionsQueryDto,
  VisitRequestFilterOptionsResponseDto,
} from './dto';

@ApiTags('wfm')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('wfm')
export class WfmController {
  constructor(
    private readonly scheduleEventsService: ScheduleEventsService,
    private readonly visitRequestsService: VisitRequestsService,
    private readonly scheduleRecommendationsService: ScheduleRecommendationsService,
    private readonly workOrdersService: WorkOrdersService,
    private readonly technicianAvailabilityService: TechnicianAvailabilityService,
    private readonly dashboardService: WfmDashboardService,
    private readonly operationalEventualitiesService: OperationalEventualitiesService,
    @Inject(WfmOrganizationSitesReadPort)
    private readonly organizationSitesReadPort: WfmOrganizationSitesReadPort,
    @Inject(WfmTenantSettingsReadPort)
    private readonly tenantSettingsReadPort: WfmTenantSettingsReadPort,
    private readonly operatingWindowResolver: OperatingWindowResolverService,
  ) {}

  // ─── Operating Hours Admin ───────────────────────────────────────────────

  @Get('dispatch-sites')
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT)
  @ApiOperation({ summary: 'Listar sedes organizacionales activas para despacho operativo' })
  @ApiResponse({ status: 200, type: [WfmOrganizationSiteDto] })
  async listDispatchSites(@CurrentUser() actor: JwtPayload) {
    return this.organizationSitesReadPort.listDispatchSites(actor);
  }

  @Post('operating-window/resolve')
  @Roles(
    UserRole.ADMIN,
    UserRole.NOC,
    UserRole.SUPPORT,
    UserRole.SALES,
    UserRole.TECHNICIAN,
    UserRole.CONTRACTOR,
  )
  @ApiOperation({ summary: 'Resolver la ventana operativa efectiva para una fecha local' })
  async resolveOperatingWindow(
    @Body() dto: ResolveOperatingWindowDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    if (!actor.tenantId) {
      throw new BadRequestException('No fue posible resolver el tenant autenticado.');
    }

    const timezone = await this.tenantSettingsReadPort.getTimezone(actor.tenantId);

    return this.operatingWindowResolver.resolve({
      tenantId: actor.tenantId,
      organizationSiteId: dto.organizationSiteId ?? null,
      technicianId: dto.technicianId ?? null,
      dateLocal: dto.dateLocal,
      timezone,
    });
  }

  // ─── Visit Requests ───────────────────────────────────────────────────────

  @Get('visit-requests')
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT)
  @ApiOperation({ summary: 'Listar solicitudes pendientes de visita del tenant' })
  listVisitRequests(@Query() query: ListVisitRequestsQueryDto, @CurrentUser() actor: JwtPayload) {
    return this.visitRequestsService.listVisitRequests(query, actor);
  }

  @Get('eligible-assignees')
  @Roles(
    UserRole.ADMIN,
    UserRole.NOC,
    UserRole.SUPPORT,
    UserRole.SALES,
    UserRole.TECHNICIAN,
    UserRole.CONTRACTOR,
  )
  @ApiOperation({
    summary: 'Listar responsables operativos activos elegibles para recomendaciones y agenda',
  })
  @ApiResponse({ status: 200, type: [WfmEligibleAssigneeDto] })
  listEligibleOperationalAssignees(@CurrentUser() actor: JwtPayload) {
    return this.visitRequestsService.listEligibleOperationalAssignees(actor);
  }

  @Post('visit-requests')
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT, UserRole.SALES)
  @ApiOperation({ summary: 'Crear una solicitud operativa de visita' })
  createVisitRequest(@Body() dto: CreateVisitRequestDto, @CurrentUser() actor: JwtPayload) {
    return this.visitRequestsService.createVisitRequest(toCreateVisitRequestInput(dto), actor);
  }

  @Get('visit-requests/filter-options')
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT)
  @ApiOperation({ summary: 'Listar opciones territoriales disponibles para solicitudes de visita' })
  @ApiResponse({ status: 200, type: VisitRequestFilterOptionsResponseDto })
  getVisitRequestFilterOptions(
    @Query() query: VisitRequestFilterOptionsQueryDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.visitRequestsService.getFilterOptions(query, actor);
  }

  @Get('visit-requests/:id')
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT, UserRole.SALES)
  @ApiOperation({ summary: 'Obtener solicitud operativa de visita por id' })
  getVisitRequest(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: JwtPayload) {
    return this.visitRequestsService.getVisitRequestById(id, actor);
  }

  @Patch('visit-requests/:id/context')
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT, UserRole.SALES)
  @ApiOperation({ summary: 'Completar o corregir contexto de una solicitud de visita' })
  updateVisitRequestContext(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateVisitRequestContextDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.visitRequestsService.updateVisitRequestContext(id, dto, actor);
  }

  @Post('visit-requests/:id/schedule-recommendations')
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT, UserRole.SALES)
  @ApiOperation({ summary: 'Obtener recomendaciones territoriales para una solicitud lista' })
  async recommendVisitRequest(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RecommendVisitRequestDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    const payload = await this.visitRequestsService.prepareVisitRequestRecommendation(
      id,
      dto,
      actor,
    );

    return this.scheduleRecommendationsService.recommend(payload);
  }

  @Post('visit-requests/:id/schedule')
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT, UserRole.SALES)
  @ApiOperation({ summary: 'Agendar una solicitud de visita lista para programar' })
  @ApiResponse({ status: 201, description: 'Solicitud agendada' })
  scheduleVisitRequest(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ScheduleVisitRequestDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.visitRequestsService.scheduleVisitRequest(id, dto, actor);
  }

  @Post('visit-requests/:id/cancel')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT, UserRole.SALES)
  @ApiOperation({ summary: 'Cancelar una solicitud de visita' })
  cancelVisitRequest(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelVisitRequestDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.visitRequestsService.cancelVisitRequest(id, dto, actor);
  }

  @Post('visit-requests/:id/reject')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT, UserRole.SALES)
  @ApiOperation({ summary: 'Rechazar una solicitud de visita' })
  rejectVisitRequest(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RejectVisitRequestDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.visitRequestsService.rejectVisitRequest(id, dto, actor);
  }

  // ─── Schedule Events ──────────────────────────────────────────────────────

  @Post('schedule-recommendations')
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT, UserRole.SALES)
  @ApiOperation({ summary: 'Obtener recomendaciones territoriales de agenda' })
  recommendSchedule(@Body() dto: ScheduleRecommendationRequestDto) {
    return this.scheduleRecommendationsService.recommend(dto);
  }

  @Get('events')
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT, UserRole.TECHNICIAN, UserRole.CONTRACTOR)
  @ApiOperation({ summary: 'Listar eventos de agenda del tenant' })
  @ApiResponse({ status: 200, description: 'Lista de eventos de agenda' })
  listEvents(@Query() query: ListScheduleEventsQueryDto, @CurrentUser() actor: JwtPayload) {
    return this.scheduleEventsService.list(query, actor);
  }

  @Post('events')
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT, UserRole.SALES)
  @ApiOperation({ summary: 'Crear evento de agenda con Work Order embebida opcional' })
  @ApiResponse({ status: 201, description: 'Evento creado' })
  @ApiResponse({ status: 400, description: 'Conflicto de agenda o datos invalidos' })
  createEvent(@Body() dto: CreateScheduleEventDto, @CurrentUser() actor: JwtPayload) {
    return this.scheduleEventsService.create(toCreateScheduleEventInput(dto), actor);
  }

  // IMPORTANTE: las sub-rutas especificas deben declararse ANTES de /:id
  @Patch('events/:id/status')
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT, UserRole.TECHNICIAN, UserRole.CONTRACTOR)
  @ApiOperation({ summary: 'Transicionar estado de un evento de agenda' })
  @ApiParam({ name: 'id', format: 'uuid' })
  transitionEventStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TransitionScheduleEventDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.scheduleEventsService.transitionStatus(id, dto, actor);
  }

  @Post('events/:id/reschedule')
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT)
  @ApiOperation({ summary: 'Reagendar un evento con motivo obligatorio' })
  @ApiParam({ name: 'id', format: 'uuid' })
  rescheduleEvent(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RescheduleEventDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.scheduleEventsService.reschedule(id, dto, actor);
  }

  @Post('events/:id/move-to-pending')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT)
  @ApiOperation({
    summary: 'Retirar un evento de agenda y devolver su solicitud vinculada a pendiente',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  moveEventToPending(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MoveScheduleEventToPendingDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.scheduleEventsService.moveToPending(id, dto, actor);
  }

  @Get('events/:id')
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT, UserRole.TECHNICIAN, UserRole.CONTRACTOR)
  @ApiOperation({ summary: 'Obtener evento de agenda por id' })
  @ApiParam({ name: 'id', format: 'uuid' })
  getEvent(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: JwtPayload) {
    return this.scheduleEventsService.getById(id, actor);
  }

  @Patch('events/:id')
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT)
  @ApiOperation({ summary: 'Actualizar campos editables del evento' })
  @ApiParam({ name: 'id', format: 'uuid' })
  updateEvent(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateScheduleEventDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.scheduleEventsService.update(id, dto, actor);
  }

  @Delete('events/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT)
  @ApiOperation({ summary: 'Eliminar (soft-delete) un evento de agenda' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 204, description: 'Evento eliminado' })
  async deleteEvent(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: JwtPayload) {
    await this.scheduleEventsService.cancel(id, actor);
  }

  // ─── Work Orders ──────────────────────────────────────────────────────────

  @Get('work-orders')
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT, UserRole.TECHNICIAN, UserRole.CONTRACTOR)
  @ApiOperation({ summary: 'Listar Work Orders del tenant' })
  listWorkOrders(@CurrentUser() actor: JwtPayload) {
    return this.workOrdersService.list(actor);
  }

  // Sub-ruta especifica antes de /:id
  @Patch('work-orders/:id/status')
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT, UserRole.TECHNICIAN, UserRole.CONTRACTOR)
  @ApiOperation({ summary: 'Transicionar estado de Work Order' })
  @ApiParam({ name: 'id', format: 'uuid' })
  transitionWorkOrderStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TransitionWorkOrderDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.workOrdersService.transitionStatus(id, dto, actor);
  }

  @Get('work-orders/:id')
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT, UserRole.TECHNICIAN, UserRole.CONTRACTOR)
  @ApiOperation({ summary: 'Obtener Work Order por id' })
  @ApiParam({ name: 'id', format: 'uuid' })
  getWorkOrder(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: JwtPayload) {
    return this.workOrdersService.getById(id, actor);
  }

  // ─── Dashboard ────────────────────────────────────────────────────────────

  @Get('dashboard/summary')
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT)
  @ApiOperation({ summary: 'Resumen del dashboard WFM para el tenant' })
  getDashboardSummary() {
    return this.dashboardService.getSummary();
  }

  // ─── Technician Availability ──────────────────────────────────────────────

  @Get('technicians/availability')
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT)
  @ApiOperation({ summary: 'Listar disponibilidad y bloqueos de responsables operativos' })
  listAvailability(@Query() query: ListTechnicianAvailabilityQueryDto) {
    return this.technicianAvailabilityService.list(query);
  }

  @Post('technicians/availability')
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT)
  @ApiOperation({ summary: 'Registrar disponibilidad o bloqueo de responsable operativo' })
  @ApiResponse({ status: 201, description: 'Registro creado' })
  createAvailability(
    @Body() dto: CreateTechnicianAvailabilityDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.technicianAvailabilityService.create(dto, actor);
  }

  // ─── Operational Eventualities ────────────────────────────────────────────

  @Post('operational-eventualities')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Crear eventualidad operativa puntual' })
  @ApiResponse({ status: 201, description: 'Eventualidad creada' })
  createOperationalEventuality(
    @Body() dto: CreateOperationalEventualityDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.operationalEventualitiesService.create(actor.sub, dto);
  }

  @Get('operational-eventualities')
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT)
  @ApiOperation({ summary: 'Listar eventualidades operativas del tenant' })
  listOperationalEventualities(
    @Query('userId') userId?: string,
    @Query('organizationSiteId') organizationSiteId?: string,
  ) {
    return this.operationalEventualitiesService.findAllByTenant({
      ...(userId ? { userId } : {}),
      ...(organizationSiteId ? { organizationSiteId } : {}),
    });
  }

  @Patch('operational-eventualities/:id/status')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Actualizar estado de eventualidad operativa' })
  @ApiParam({ name: 'id', format: 'uuid' })
  updateOperationalEventualityStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateOperationalEventualityStatusDto,
  ) {
    return this.operationalEventualitiesService.updateStatus(id, dto);
  }

  @Delete('operational-eventualities/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Eliminar (soft-delete) eventualidad operativa' })
  @ApiParam({ name: 'id', format: 'uuid' })
  async deleteOperationalEventuality(@Param('id', ParseUUIDPipe) id: string) {
    await this.operationalEventualitiesService.softDelete(id);
  }
}
