import {
  Body,
  Controller,
  Delete,
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
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@iwana/shared';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { ScheduleEventsService } from './services/schedule-events.service';
import { WorkOrdersService } from './services/work-orders.service';
import { TechnicianAvailabilityService } from './services/technician-availability.service';
import { WfmDashboardService } from './services/wfm-dashboard.service';
import {
  CreateScheduleEventDto,
  toCreateScheduleEventInput,
  ListScheduleEventsQueryDto,
  ListTechnicianAvailabilityQueryDto,
  CreateTechnicianAvailabilityDto,
  RescheduleEventDto,
  TransitionScheduleEventDto,
  TransitionWorkOrderDto,
  UpdateScheduleEventDto,
} from './dto';

@ApiTags('wfm')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('wfm')
export class WfmController {
  constructor(
    private readonly scheduleEventsService: ScheduleEventsService,
    private readonly workOrdersService: WorkOrdersService,
    private readonly technicianAvailabilityService: TechnicianAvailabilityService,
    private readonly dashboardService: WfmDashboardService,
  ) {}

  // ─── Schedule Events ──────────────────────────────────────────────────────

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
