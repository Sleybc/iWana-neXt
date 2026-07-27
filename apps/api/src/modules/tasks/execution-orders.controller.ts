import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AccessPermissionKey, UserRole, ExecutionOrderStatus } from '@iwana/shared';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Permissions } from '../access-control/decorators/permissions.decorator';
import { PermissionsGuard } from '../access-control/guards/permissions.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import {
  CloseExecutionOrderDto,
  RegisterExecutionOrderItemUsageDto,
  RegisterFieldWorkDto,
  StartExecutionOrderDto,
  AssignExecutionOrderDto,
  BlockExecutionOrderDto,
  UnblockExecutionOrderDto,
  RegisterEvidenceDto,
  EvidenceAssetUploadIntentDto,
  FollowUpDto,
  StartExecutionOrderSchema,
  RegisterFieldWorkSchema,
  RegisterExecutionOrderItemUsageSchema,
  CloseExecutionOrderSchema,
} from './dto/execution-orders.dto';
import type { ExecutionOrderCommandContext } from './services/execution-order-reliability.service';
import { ExecutionOrdersService } from './services/execution-orders.service';
import { ExecutionOrderAccessGuard } from './guards/execution-order-access.guard';
import { TenantAwareThrottlerGuard } from './guards/tenant-aware-throttler.guard';
import { ExecutionOrderResponseHeadersInterceptor } from './interceptors/execution-order-response-headers.interceptor';

@ApiTags('tasks-execution-orders')
@ApiBearerAuth('access-token')
@UseGuards(
  JwtAuthGuard,
  RolesGuard,
  PermissionsGuard,
  ExecutionOrderAccessGuard,
  TenantAwareThrottlerGuard,
)
@UseInterceptors(ExecutionOrderResponseHeadersInterceptor)
@Controller('tasks/execution-orders')
export class ExecutionOrdersController {
  constructor(private readonly executionOrdersService: ExecutionOrdersService) {}

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT, UserRole.TECHNICIAN, UserRole.CONTRACTOR)
  @Permissions(AccessPermissionKey.OPERATIONS_EXECUTION_ORDERS_READ)
  @ApiOperation({ summary: 'Obtener OT de ejecución por id' })
  async getById(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: JwtPayload) {
    const order = await this.executionOrdersService.getById(id);
    return {
      id: order.id,
      number: order.executionOrderNumber,
      version: order.version,
      status: order.status,
      result: order.result ?? undefined,
      workType: order.workType,
      template: null,
      schedule: {
        eventId: order.scheduleEventId,
        window: {
          startAt: this.dateOrString(order.plannedWindowStartAt),
          endAt: this.dateOrString(order.plannedWindowEndAt),
        },
      },
      assignee: order.assignedTechnicianId
        ? { type: 'TECHNICIAN' as const, id: order.assignedTechnicianId }
        : undefined,
      site: { id: order.id, label: order.municipality ?? order.customerDisplayLabel },
      completion: {
        progress:
          order.status === ExecutionOrderStatus.COMPLETED ||
          order.status === ExecutionOrderStatus.COMPLETED_WITH_OBSERVATIONS
            ? 1
            : 0,
        startedAt: this.dateOrString(order.startedAt),
        closedAt: this.dateOrString(order.closedAt),
      },
      syncState: await this.executionOrdersService.getSyncState(order.id),
      inventoryReconciliation: 'PENDING' as const,
      allowedActions: this.executionOrdersService.computeAllowedActions(order, actor),
      createdAt: this.dateOrString(order.createdAt) ?? '',
      updatedAt: this.dateOrString(order.updatedAt) ?? '',
    };
  }

  @Get(':id/activities')
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT, UserRole.TECHNICIAN, UserRole.CONTRACTOR)
  @Permissions(AccessPermissionKey.OPERATIONS_EXECUTION_ORDERS_READ)
  @ApiOperation({ summary: 'Listar actividades registradas en la OT' })
  async listActivities(@Param('id', ParseUUIDPipe) id: string) {
    const data = await this.executionOrdersService.listActivities(id);
    return this.page(
      data.map(({ tenantId: _tenantId, actorUserId: _actorUserId, ...safe }) => safe),
    );
  }

  @Get(':id/item-usage')
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT, UserRole.TECHNICIAN, UserRole.CONTRACTOR)
  @Permissions(AccessPermissionKey.OPERATIONS_EXECUTION_ORDERS_READ)
  @ApiOperation({ summary: 'Listar consumos e instalaciones registradas en la OT' })
  async listItemUsage(@Param('id', ParseUUIDPipe) id: string) {
    const data = await this.executionOrdersService.listItemUsage(id);
    return this.page(
      data.map(({ tenantId: _tenantId, actorUserId: _actorUserId, ...safe }) => safe),
    );
  }

  @Post(':id/start')
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT, UserRole.TECHNICIAN)
  @Permissions(AccessPermissionKey.OPERATIONS_EXECUTION_ORDERS_EXECUTE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Iniciar OT de ejecución' })
  start(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(StartExecutionOrderSchema)) dto: StartExecutionOrderDto,
    @CurrentUser() actor: JwtPayload,
    @Headers('if-match') ifMatch?: string,
    @Headers('idempotency-key') idempotencyKey?: string,
    @Headers('x-correlation-id') correlationId?: string,
  ) {
    return this.executionOrdersService.start(
      id,
      dto,
      actor,
      this.commandContext(ifMatch, idempotencyKey, correlationId),
    );
  }

  @Post(':id/field-work')
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT, UserRole.TECHNICIAN)
  @Permissions(AccessPermissionKey.OPERATIONS_EXECUTION_ORDERS_EXECUTE)
  @ApiOperation({ summary: 'Registrar trabajo realizado en campo' })
  registerFieldWork(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(RegisterFieldWorkSchema)) dto: RegisterFieldWorkDto,
    @CurrentUser() actor: JwtPayload,
    @Headers('if-match') ifMatch?: string,
    @Headers('idempotency-key') idempotencyKey?: string,
    @Headers('x-correlation-id') correlationId?: string,
  ) {
    return this.executionOrdersService.registerFieldWork(
      id,
      dto,
      actor,
      this.commandContext(ifMatch, idempotencyKey, correlationId),
    );
  }

  @Post(':id/item-usage')
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT, UserRole.TECHNICIAN)
  @Permissions(AccessPermissionKey.OPERATIONS_EXECUTION_ORDERS_EXECUTE)
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Registrar consumo o instalación desde custodia técnica' })
  registerItemUsage(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(RegisterExecutionOrderItemUsageSchema))
    dto: RegisterExecutionOrderItemUsageDto,
    @CurrentUser() actor: JwtPayload,
    @Headers('if-match') ifMatch?: string,
    @Headers('idempotency-key') idempotencyKey?: string,
    @Headers('x-correlation-id') correlationId?: string,
  ) {
    return this.executionOrdersService.registerItemUsage(
      id,
      {
        ...dto,
        quantity: dto.quantity ?? 1,
        technicianCustodyId: dto.custodySelection?.id ?? '',
        serialNumber: dto.serial ?? null,
      },
      actor,
      this.commandContext(ifMatch, idempotencyKey, correlationId),
    );
  }

  @Post(':id/close')
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT, UserRole.TECHNICIAN)
  @Permissions(AccessPermissionKey.OPERATIONS_EXECUTION_ORDERS_EXECUTE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cerrar OT de ejecución' })
  close(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(CloseExecutionOrderSchema)) dto: CloseExecutionOrderDto,
    @CurrentUser() actor: JwtPayload,
    @Headers('if-match') ifMatch?: string,
    @Headers('idempotency-key') idempotencyKey?: string,
    @Headers('x-correlation-id') correlationId?: string,
  ) {
    return this.executionOrdersService.close(
      id,
      dto,
      actor,
      this.commandContext(ifMatch, idempotencyKey, correlationId),
    );
  }

  @Post(':id/assign')
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT)
  @Permissions(AccessPermissionKey.OPERATIONS_EXECUTION_ORDERS_SUPERVISE)
  @HttpCode(HttpStatus.OK)
  assign(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignExecutionOrderDto,
    @CurrentUser() actor: JwtPayload,
    @Headers('if-match') ifMatch?: string,
    @Headers('idempotency-key') key?: string,
    @Headers('x-correlation-id') correlationId?: string,
  ) {
    return this.executionOrdersService.assign(
      id,
      dto,
      actor,
      this.commandContext(ifMatch, key, correlationId),
    );
  }

  @Post(':id/evidence-assets')
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT, UserRole.TECHNICIAN)
  @Permissions(AccessPermissionKey.OPERATIONS_EXECUTION_ORDERS_EXECUTE)
  @HttpCode(HttpStatus.ACCEPTED)
  createEvidenceAsset(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: EvidenceAssetUploadIntentDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.executionOrdersService.createEvidenceAssetReceipt(id, dto, actor);
  }

  @Get(':id/evidence-assets/:mediaAssetId')
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT, UserRole.TECHNICIAN, UserRole.CONTRACTOR)
  @Permissions(AccessPermissionKey.OPERATIONS_EXECUTION_ORDERS_READ)
  getEvidenceAsset(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('mediaAssetId') mediaAssetId: string,
  ) {
    return this.executionOrdersService.getEvidenceAssetReceipt(id, mediaAssetId);
  }

  @Get(':id/evidence-assets/:mediaAssetId/content')
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT, UserRole.TECHNICIAN, UserRole.CONTRACTOR)
  @Permissions(AccessPermissionKey.OPERATIONS_EXECUTION_ORDERS_READ)
  getEvidenceContent(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('mediaAssetId') mediaAssetId: string,
  ) {
    return this.executionOrdersService.getEvidenceAssetReceipt(id, mediaAssetId);
  }

  @Post(':id/evidence')
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT, UserRole.TECHNICIAN)
  @Permissions(AccessPermissionKey.OPERATIONS_EXECUTION_ORDERS_EXECUTE)
  registerEvidence(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RegisterEvidenceDto,
    @CurrentUser() actor: JwtPayload,
    @Headers('if-match') ifMatch?: string,
    @Headers('idempotency-key') key?: string,
    @Headers('x-correlation-id') correlationId?: string,
  ) {
    return this.executionOrdersService.registerEvidence(
      id,
      dto,
      actor,
      this.commandContext(ifMatch, key, correlationId),
    );
  }

  @Post(':id/block')
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT, UserRole.TECHNICIAN)
  @Permissions(AccessPermissionKey.OPERATIONS_EXECUTION_ORDERS_EXECUTE)
  @HttpCode(HttpStatus.OK)
  block(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: BlockExecutionOrderDto,
    @CurrentUser() actor: JwtPayload,
    @Headers('if-match') ifMatch?: string,
    @Headers('idempotency-key') key?: string,
    @Headers('x-correlation-id') correlationId?: string,
  ) {
    return this.executionOrdersService.block(
      id,
      dto,
      actor,
      this.commandContext(ifMatch, key, correlationId),
    );
  }

  @Post(':id/unblock')
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT, UserRole.TECHNICIAN)
  @Permissions(AccessPermissionKey.OPERATIONS_EXECUTION_ORDERS_EXECUTE)
  @HttpCode(HttpStatus.OK)
  unblock(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UnblockExecutionOrderDto,
    @CurrentUser() actor: JwtPayload,
    @Headers('if-match') ifMatch?: string,
    @Headers('idempotency-key') key?: string,
    @Headers('x-correlation-id') correlationId?: string,
  ) {
    return this.executionOrdersService.unblock(
      id,
      dto,
      actor,
      this.commandContext(ifMatch, key, correlationId),
    );
  }

  @Post(':id/follow-ups')
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT)
  @Permissions(AccessPermissionKey.OPERATIONS_EXECUTION_ORDERS_SUPERVISE)
  @HttpCode(HttpStatus.CREATED)
  createFollowUp(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: FollowUpDto,
    @CurrentUser() actor: JwtPayload,
    @Headers('idempotency-key') key?: string,
    @Headers('x-correlation-id') correlationId?: string,
  ) {
    return this.executionOrdersService.createFollowUp(
      id,
      dto,
      actor,
      this.commandContext(undefined, key, correlationId),
    );
  }

  @Post('events/:eventId/redrive')
  @Roles(UserRole.ADMIN, UserRole.NOC)
  @Permissions(AccessPermissionKey.OPERATIONS_EXECUTION_EVENTS_REDRIVE)
  @HttpCode(HttpStatus.ACCEPTED)
  redrive(@Param('eventId', ParseUUIDPipe) eventId: string, @CurrentUser() actor: JwtPayload) {
    return this.executionOrdersService.redriveEvent(eventId, actor);
  }

  private commandContext(
    ifMatch?: string,
    idempotencyKey?: string,
    correlationId?: string,
  ): ExecutionOrderCommandContext {
    const candidate = correlationId?.trim();
    const validCorrelation =
      candidate &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(candidate)
        ? candidate
        : randomUUID();
    return {
      ...(ifMatch ? { ifMatch } : {}),
      ...(idempotencyKey ? { idempotencyKey } : {}),
      requireIdempotency: true,
      correlationId: validCorrelation,
    };
  }

  private page<T>(data: T[]) {
    return {
      data,
      meta: {
        nextCursor: null,
        total: data.length,
        totalIsEstimate: false,
        page: 1,
        limit: data.length || 25,
        totalPages: 1,
        hasMore: false,
        mode: 'page' as const,
        capabilities: { randomAccess: true, sortableFields: [] },
        sort: null,
      },
    };
  }

  private dateOrString(value: Date | string | null | undefined): string | undefined {
    if (value == null) return undefined;
    if (value instanceof Date) return value.toISOString();
    return String(value);
  }
}
