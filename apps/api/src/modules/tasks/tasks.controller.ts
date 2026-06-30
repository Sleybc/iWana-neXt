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
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@iwana/shared';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { AuditEntity } from '../audit/decorators/audit-entity.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import {
  AssignTaskDto,
  AssignTaskSchema,
  CreateTaskDto,
  CreateTaskSchema,
  LinkScheduleEventDto,
  LinkScheduleEventSchema,
  LinkTaskWorkOrderDto,
  LinkTaskWorkOrderSchema,
  ListTaskQueryDto,
  ListTaskQuerySchema,
  TransitionTaskDto,
  TransitionTaskSchema,
  UpdateTaskDto,
  UpdateTaskSchema,
} from './dto';
import { TaskAssignmentService } from './services/task-assignment.service';
import { TaskTimelineService } from './services/task-timeline.service';
import { TasksService } from './services/tasks.service';

@ApiTags('tasks')
@ApiBearerAuth('access-token')
@AuditEntity('OperationalTask')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('tasks')
export class TasksController {
  constructor(
    private readonly tasksService: TasksService,
    private readonly taskAssignmentService: TaskAssignmentService,
    private readonly timelineService: TaskTimelineService,
  ) {}

  @Get()
  @Roles(
    UserRole.ADMIN,
    UserRole.NOC,
    UserRole.SUPPORT,
    UserRole.TECHNICIAN,
    UserRole.CONTRACTOR,
    UserRole.SALES,
  )
  @ApiOperation({ summary: 'Listar tareas operativas del tenant' })
  list(
    @Query(new ZodValidationPipe(ListTaskQuerySchema)) query: ListTaskQueryDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.tasksService.list(query, actor);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT, UserRole.SALES)
  @ApiOperation({ summary: 'Crear tarea operativa' })
  @ApiResponse({ status: 201, description: 'Tarea creada' })
  create(
    @Body(new ZodValidationPipe(CreateTaskSchema)) body: CreateTaskDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.tasksService.create(body, actor);
  }

  @Get(':id')
  @Roles(
    UserRole.ADMIN,
    UserRole.NOC,
    UserRole.SUPPORT,
    UserRole.TECHNICIAN,
    UserRole.CONTRACTOR,
    UserRole.SALES,
  )
  @ApiOperation({ summary: 'Obtener tarea por ID' })
  getById(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: JwtPayload) {
    return this.tasksService.getById(id, actor);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT)
  @ApiOperation({ summary: 'Actualizar tarea operativa' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdateTaskSchema)) body: UpdateTaskDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.tasksService.update(id, body, actor);
  }

  @Post(':id/assign')
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT)
  @ApiOperation({ summary: 'Reasignar responsable de la tarea' })
  assign(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(AssignTaskSchema)) body: AssignTaskDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.taskAssignmentService.assign(id, body, actor);
  }

  @Post(':id/transition')
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT, UserRole.TECHNICIAN)
  @ApiOperation({ summary: 'Transicionar estado de la tarea' })
  transition(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(TransitionTaskSchema)) body: TransitionTaskDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.tasksService.transitionStatus(id, body, actor);
  }

  @Post(':id/link-schedule-event')
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT)
  @ApiOperation({ summary: 'Vincular evento de agenda como referencia logica' })
  linkScheduleEvent(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(LinkScheduleEventSchema)) body: LinkScheduleEventDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.tasksService.linkScheduleEvent(id, body, actor);
  }

  @Post(':id/link-work-order')
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT)
  @ApiOperation({ summary: 'Vincular orden de trabajo como referencia logica' })
  linkWorkOrder(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(LinkTaskWorkOrderSchema)) body: LinkTaskWorkOrderDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.tasksService.linkWorkOrder(id, body, actor);
  }

  @Get(':id/timeline')
  @Roles(
    UserRole.ADMIN,
    UserRole.NOC,
    UserRole.SUPPORT,
    UserRole.TECHNICIAN,
    UserRole.CONTRACTOR,
    UserRole.SALES,
  )
  @ApiOperation({ summary: 'Listar timeline de la tarea' })
  async listTimeline(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: JwtPayload) {
    await this.tasksService.getById(id, actor);
    return this.timelineService.listTimeline(id);
  }

  @Get(':id/assignment-history')
  @Roles(
    UserRole.ADMIN,
    UserRole.NOC,
    UserRole.SUPPORT,
    UserRole.TECHNICIAN,
    UserRole.CONTRACTOR,
    UserRole.SALES,
  )
  @ApiOperation({ summary: 'Listar historial de reasignaciones' })
  async listAssignmentHistory(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: JwtPayload,
  ) {
    await this.tasksService.getById(id, actor);
    return this.timelineService.listAssignmentHistory(id);
  }
}
