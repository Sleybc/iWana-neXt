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
import { OperatingSitesService } from './services/operating-sites.service';
import { CompanyBusinessHoursService } from './services/company-business-hours.service';
import { SiteBusinessHoursService } from './services/site-business-hours.service';
import { TechnicianBusinessOverridesService } from './services/technician-business-overrides.service';
import { HolidayBlackoutsService } from './services/holiday-blackouts.service';
import { WfmTenantSettingsReadPort } from './ports/wfm-tenant-settings-read.port';
import { OperatingWindowResolverService } from './services/operating-window-resolver.service';
import {
  CreateHolidayBlackoutDto,
  CreateOperatingSiteDto,
  CancelVisitRequestDto,
  CreateTechnicianBusinessOverrideDto,
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
  CreateTechnicianAvailabilityDto,
  RescheduleEventDto,
  TransitionScheduleEventDto,
  TransitionWorkOrderDto,
  UpdateCompanyBusinessHoursDto,
  UpdateHolidayBlackoutDto,
  UpdateOperatingSiteDto,
  ResolveOperatingWindowDto,
  UpdateScheduleEventDto,
  UpdateSiteBusinessHoursDto,
  UpdateTechnicianBusinessOverrideDto,
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
    private readonly operatingSitesService: OperatingSitesService,
    private readonly companyBusinessHoursService: CompanyBusinessHoursService,
    private readonly siteBusinessHoursService: SiteBusinessHoursService,
    private readonly technicianBusinessOverridesService: TechnicianBusinessOverridesService,
    private readonly holidayBlackoutsService: HolidayBlackoutsService,
    @Inject(WfmTenantSettingsReadPort)
    private readonly tenantSettingsReadPort: WfmTenantSettingsReadPort,
    private readonly operatingWindowResolver: OperatingWindowResolverService,
  ) {}

  // ─── Operating Hours Admin ───────────────────────────────────────────────

  @Get('operating-sites')
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT)
  @ApiOperation({ summary: 'Listar sedes operativas WFM del tenant' })
  listOperatingSites(@CurrentUser() actor: JwtPayload) {
    return this.operatingSitesService.list(actor);
  }

  @Post('operating-sites')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Crear una sede operativa WFM' })
  createOperatingSite(@Body() dto: CreateOperatingSiteDto, @CurrentUser() actor: JwtPayload) {
    return this.operatingSitesService.create(dto, actor);
  }

  @Patch('operating-sites/:id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Actualizar una sede operativa WFM' })
  updateOperatingSite(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateOperatingSiteDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.operatingSitesService.update(id, dto, actor);
  }

  @Delete('operating-sites/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Eliminar una sede operativa WFM' })
  async deleteOperatingSite(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: JwtPayload,
  ) {
    await this.operatingSitesService.remove(id, actor);
  }

  @Get('business-hours/company')
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT)
  @ApiOperation({ summary: 'Obtener horario base de empresa por dia de semana' })
  getCompanyBusinessHours(@CurrentUser() actor: JwtPayload) {
    return this.companyBusinessHoursService.getWeek(actor);
  }

  @Put('business-hours/company')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Reemplazar horario base de empresa por dia de semana' })
  replaceCompanyBusinessHours(
    @Body() dto: UpdateCompanyBusinessHoursDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.companyBusinessHoursService.replaceWeek(dto, actor);
  }

  @Get('operating-sites/:siteId/business-hours')
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT)
  @ApiOperation({ summary: 'Obtener horario semanal de una sede operativa' })
  getSiteBusinessHours(
    @Param('siteId', ParseUUIDPipe) siteId: string,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.siteBusinessHoursService.getWeek(siteId, actor);
  }

  @Put('operating-sites/:siteId/business-hours')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Reemplazar horario semanal de una sede operativa' })
  replaceSiteBusinessHours(
    @Param('siteId', ParseUUIDPipe) siteId: string,
    @Body() dto: UpdateSiteBusinessHoursDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.siteBusinessHoursService.replaceWeek(siteId, dto, actor);
  }

  @Get('technician-business-overrides')
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT)
  @ApiOperation({ summary: 'Listar overrides operativos por tecnico' })
  listTechnicianBusinessOverrides(@CurrentUser() actor: JwtPayload) {
    return this.technicianBusinessOverridesService.list(actor);
  }

  @Post('technician-business-overrides')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Crear un override operativo por tecnico' })
  createTechnicianBusinessOverride(
    @Body() dto: CreateTechnicianBusinessOverrideDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.technicianBusinessOverridesService.create(dto, actor);
  }

  @Patch('technician-business-overrides/:id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Actualizar un override operativo por tecnico' })
  updateTechnicianBusinessOverride(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTechnicianBusinessOverrideDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.technicianBusinessOverridesService.update(id, dto, actor);
  }

  @Delete('technician-business-overrides/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Eliminar un override operativo por tecnico' })
  async deleteTechnicianBusinessOverride(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: JwtPayload,
  ) {
    await this.technicianBusinessOverridesService.remove(id, actor);
  }

  @Get('holiday-blackouts')
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT)
  @ApiOperation({ summary: 'Listar festivos y cierres especiales WFM' })
  listHolidayBlackouts(@CurrentUser() actor: JwtPayload) {
    return this.holidayBlackoutsService.list(actor);
  }

  @Post('holiday-blackouts')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Crear un festivo o cierre especial WFM' })
  createHolidayBlackout(@Body() dto: CreateHolidayBlackoutDto, @CurrentUser() actor: JwtPayload) {
    return this.holidayBlackoutsService.create(dto, actor);
  }

  @Patch('holiday-blackouts/:id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Actualizar un festivo o cierre especial WFM' })
  updateHolidayBlackout(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateHolidayBlackoutDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.holidayBlackoutsService.update(id, dto, actor);
  }

  @Delete('holiday-blackouts/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Eliminar un festivo o cierre especial WFM' })
  async deleteHolidayBlackout(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: JwtPayload,
  ) {
    await this.holidayBlackoutsService.remove(id, actor);
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
      siteId: dto.siteId ?? null,
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
  @ApiOperation({ summary: 'Listar disponibilidad y bloqueos de tecnicos' })
  listAvailability(@Query() query: ListTechnicianAvailabilityQueryDto) {
    return this.technicianAvailabilityService.list(query);
  }

  @Post('technicians/availability')
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT)
  @ApiOperation({ summary: 'Registrar disponibilidad o bloqueo de tecnico' })
  @ApiResponse({ status: 201, description: 'Registro creado' })
  createAvailability(
    @Body() dto: CreateTechnicianAvailabilityDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.technicianAvailabilityService.create(dto, actor);
  }
}
