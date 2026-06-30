import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@iwana/shared';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import {
  CloseExecutionOrderDto,
  RegisterExecutionOrderItemUsageDto,
  RegisterFieldWorkDto,
  StartExecutionOrderDto,
} from './dto/execution-orders.dto';
import { ExecutionOrdersService } from './services/execution-orders.service';

@ApiTags('tasks-execution-orders')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('tasks/execution-orders')
export class ExecutionOrdersController {
  constructor(private readonly executionOrdersService: ExecutionOrdersService) {}

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT, UserRole.TECHNICIAN, UserRole.CONTRACTOR)
  @ApiOperation({ summary: 'Obtener OT de ejecución por id' })
  getById(@Param('id', ParseUUIDPipe) id: string) {
    return this.executionOrdersService.getById(id);
  }

  @Get(':id/activities')
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT, UserRole.TECHNICIAN, UserRole.CONTRACTOR)
  @ApiOperation({ summary: 'Listar actividades registradas en la OT' })
  listActivities(@Param('id', ParseUUIDPipe) id: string) {
    return this.executionOrdersService.listActivities(id);
  }

  @Get(':id/item-usage')
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT, UserRole.TECHNICIAN, UserRole.CONTRACTOR)
  @ApiOperation({ summary: 'Listar consumos e instalaciones registradas en la OT' })
  listItemUsage(@Param('id', ParseUUIDPipe) id: string) {
    return this.executionOrdersService.listItemUsage(id);
  }

  @Post(':id/start')
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT, UserRole.TECHNICIAN)
  @ApiOperation({ summary: 'Iniciar OT de ejecución' })
  start(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: StartExecutionOrderDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.executionOrdersService.start(id, dto, actor);
  }

  @Post(':id/field-work')
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT, UserRole.TECHNICIAN)
  @ApiOperation({ summary: 'Registrar trabajo realizado en campo' })
  registerFieldWork(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RegisterFieldWorkDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.executionOrdersService.registerFieldWork(id, dto, actor);
  }

  @Post(':id/item-usage')
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT, UserRole.TECHNICIAN)
  @ApiOperation({ summary: 'Registrar consumo o instalación desde custodia técnica' })
  registerItemUsage(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RegisterExecutionOrderItemUsageDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.executionOrdersService.registerItemUsage(
      id,
      {
        ...dto,
        quantity: dto.quantity ?? 1,
      },
      actor,
    );
  }

  @Post(':id/close')
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT, UserRole.TECHNICIAN)
  @ApiOperation({ summary: 'Cerrar OT de ejecución' })
  close(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CloseExecutionOrderDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.executionOrdersService.close(id, dto, actor);
  }
}
