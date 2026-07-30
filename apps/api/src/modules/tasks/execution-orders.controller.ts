import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Optional,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Redirect,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { randomUUID } from 'node:crypto';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { AccessPermissionKey, UserRole } from '@iwana/shared';
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
  AssignExecutionOrderSchema,
  BlockExecutionOrderDto,
  BlockExecutionOrderSchema,
  UnblockExecutionOrderDto,
  UnblockExecutionOrderSchema,
  RegisterEvidenceDto,
  RegisterEvidenceSchema,
  ListExecutionOrderEvidencesQueryDto,
  ListExecutionOrderEvidencesSchema,
  ExecutionOrderEvidencePageDto,
  ListExecutionOrderEntriesQueryDto,
  ListExecutionOrderEntriesSchema,
  ExecutionOrderActivityPageDto,
  ExecutionOrderItemUsagePageDto,
  FollowUpDto,
  FollowUpSchema,
  StartExecutionOrderSchema,
  RegisterFieldWorkSchema,
  RegisterExecutionOrderItemUsageSchema,
  CloseExecutionOrderSchema,
} from './dto/execution-orders.dto';
import type { ExecutionOrderCommandContext } from './services/execution-order-reliability.service';
import { ExecutionOrdersService } from './services/execution-orders.service';
import { ExecutionOrderInventoryReconciliationService } from './services/execution-order-inventory-reconciliation.service';
import { ExecutionOrderProjectionConvergenceService } from './services/execution-order-projection-convergence.service';
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
  constructor(
    private readonly executionOrdersService: ExecutionOrdersService,
    private readonly projectionConvergenceService: ExecutionOrderProjectionConvergenceService,
    @Optional()
    private readonly inventoryReconciliationService?: ExecutionOrderInventoryReconciliationService,
  ) {}

  @Get(':id/evidences')
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT, UserRole.TECHNICIAN, UserRole.CONTRACTOR)
  @Permissions(AccessPermissionKey.OPERATIONS_EXECUTION_ORDERS_READ)
  @ApiOperation({ summary: 'Listar evidencias autorizadas de la OT' })
  @ApiQuery({ name: 'page', required: false, type: Number, minimum: 1, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, minimum: 1, maximum: 100, example: 25 })
  @ApiOkResponse({ type: ExecutionOrderEvidencePageDto })
  async listEvidences(
    @Param('id', ParseUUIDPipe) id: string,
    @Query(new ZodValidationPipe(ListExecutionOrderEvidencesSchema))
    query: ListExecutionOrderEvidencesQueryDto,
  ) {
    return this.executionOrdersService.listEvidences(id, query);
  }

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
      template: order.templateKey
        ? {
            id: order.templateId,
            key: order.templateKey,
            version: order.templateVersionNumber,
            label: order.templateLabel,
          }
        : null,
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
        ...(await this.executionOrdersService.getCompletion(order.id)),
        startedAt: this.dateOrString(order.startedAt),
        closedAt: this.dateOrString(order.closedAt),
      },
      syncState: await this.executionOrdersService.getSyncState(order.id),
      inventoryReconciliation:
        (await this.inventoryReconciliationService?.getInventoryReconciliation(order.id)) ??
        'NOT_REQUIRED',
      allowedActions: this.executionOrdersService.computeAllowedActions(order, actor),
      createdAt: this.dateOrString(order.createdAt) ?? '',
      updatedAt: this.dateOrString(order.updatedAt) ?? '',
    };
  }

  @Get(':id/activities')
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT, UserRole.TECHNICIAN, UserRole.CONTRACTOR)
  @Permissions(AccessPermissionKey.OPERATIONS_EXECUTION_ORDERS_READ)
  @ApiOperation({ summary: 'Listar actividades registradas en la OT' })
  @ApiQuery({ name: 'page', required: false, type: Number, minimum: 1, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, minimum: 1, maximum: 100, example: 25 })
  @ApiOkResponse({ type: ExecutionOrderActivityPageDto })
  async listActivities(
    @Param('id', ParseUUIDPipe) id: string,
    @Query(new ZodValidationPipe(ListExecutionOrderEntriesSchema))
    query: ListExecutionOrderEntriesQueryDto,
  ) {
    return this.executionOrdersService.listActivities(id, query);
  }

  @Get(':id/item-usage')
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT, UserRole.TECHNICIAN, UserRole.CONTRACTOR)
  @Permissions(AccessPermissionKey.OPERATIONS_EXECUTION_ORDERS_READ)
  @ApiOperation({ summary: 'Listar consumos e instalaciones registradas en la OT' })
  @ApiQuery({ name: 'page', required: false, type: Number, minimum: 1, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, minimum: 1, maximum: 100, example: 25 })
  @ApiOkResponse({ type: ExecutionOrderItemUsagePageDto })
  async listItemUsage(
    @Param('id', ParseUUIDPipe) id: string,
    @Query(new ZodValidationPipe(ListExecutionOrderEntriesSchema))
    query: ListExecutionOrderEntriesQueryDto,
  ) {
    return this.executionOrdersService.listItemUsage(id, query);
  }

  @Post(':id/start')
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT, UserRole.TECHNICIAN, UserRole.CONTRACTOR)
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
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT, UserRole.TECHNICIAN, UserRole.CONTRACTOR)
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
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT, UserRole.TECHNICIAN, UserRole.CONTRACTOR)
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
        quantity: dto.quantity,
        technicianCustodyId: dto.technicianCustodyId,
        serialNumber: dto.serialNumber ?? null,
      },
      actor,
      this.commandContext(ifMatch, idempotencyKey, correlationId),
    );
  }

  @Post(':id/close')
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT, UserRole.TECHNICIAN, UserRole.CONTRACTOR)
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
    @Body(new ZodValidationPipe(AssignExecutionOrderSchema)) dto: AssignExecutionOrderDto,
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
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT, UserRole.TECHNICIAN, UserRole.CONTRACTOR)
  @Permissions(AccessPermissionKey.OPERATIONS_EXECUTION_ORDERS_EXECUTE)
  @HttpCode(HttpStatus.ACCEPTED)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB max
    }),
  )
  @ApiOperation({ summary: 'Subir asset de evidencia con cuarentena' })
  async createEvidenceAsset(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() actor: JwtPayload,
  ) {
    if (!file) {
      throw new BadRequestException({
        code: 'EVIDENCE_FILE_REQUIRED',
        message: 'Se requiere un archivo en el campo multipart "file".',
      });
    }
    // El multipart parser de NestJS ya valida MIME declarado por el cliente,
    // pero la validación real por magic bytes ocurre en el puerto de Media.
    return this.executionOrdersService.createEvidenceAssetReceipt(id, file, actor);
  }

  @Get(':id/evidence-assets/:mediaAssetId')
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT, UserRole.TECHNICIAN, UserRole.CONTRACTOR)
  @Permissions(AccessPermissionKey.OPERATIONS_EXECUTION_ORDERS_READ)
  @ApiOperation({ summary: 'Consultar estado del recibo de asset de evidencia' })
  getEvidenceAsset(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('mediaAssetId') mediaAssetId: string,
  ) {
    return this.executionOrdersService.getEvidenceAssetReceipt(id, mediaAssetId);
  }

  @Get(':id/evidence-assets/:mediaAssetId/content')
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT, UserRole.TECHNICIAN, UserRole.CONTRACTOR)
  @Permissions(AccessPermissionKey.OPERATIONS_EXECUTION_ORDERS_READ)
  @Redirect()
  @ApiOperation({ summary: 'Descargar contenido de asset de evidencia (302 signed URL)' })
  async getEvidenceContent(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('mediaAssetId') mediaAssetId: string,
  ) {
    const signedUrl = await this.executionOrdersService.getEvidenceContentRedirect(
      id,
      mediaAssetId,
    );
    return { url: signedUrl, statusCode: 302 };
  }

  @Post(':id/evidence')
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT, UserRole.TECHNICIAN, UserRole.CONTRACTOR)
  @Permissions(AccessPermissionKey.OPERATIONS_EXECUTION_ORDERS_EXECUTE)
  @ApiOperation({ summary: 'Registrar evidencia vinculando un asset AVAILABLE' })
  registerEvidence(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(RegisterEvidenceSchema)) dto: RegisterEvidenceDto,
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
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT, UserRole.TECHNICIAN, UserRole.CONTRACTOR)
  @Permissions(AccessPermissionKey.OPERATIONS_EXECUTION_ORDERS_EXECUTE)
  @HttpCode(HttpStatus.OK)
  block(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(BlockExecutionOrderSchema)) dto: BlockExecutionOrderDto,
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
    @Body(new ZodValidationPipe(UnblockExecutionOrderSchema)) dto: UnblockExecutionOrderDto,
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
    @Body(new ZodValidationPipe(FollowUpSchema)) dto: FollowUpDto,
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
  redrive(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @CurrentUser() actor: JwtPayload,
    @Headers('idempotency-key') key?: string,
  ) {
    if (!key) {
      throw new BadRequestException({
        code: 'IDEMPOTENCY_KEY_REQUIRED',
        message: 'Idempotency-Key es obligatorio para redrive.',
      });
    }
    return this.executionOrdersService.redriveEvent(eventId, actor);
  }

  /** PLAT-P1-04: Health del relay de eventos outbox. */
  @Get('health/relay')
  @Roles(UserRole.ADMIN, UserRole.NOC)
  @Permissions(AccessPermissionKey.OPERATIONS_EXECUTION_ORDERS_READ)
  @ApiOperation({ summary: 'Estado del relay de eventos outbox' })
  async getRelayHealth() {
    return this.projectionConvergenceService.getRelayHealth();
  }

  /** Reconcilia las proyecciones de una OT. Solo supervisores. */
  @Get(':id/reconciliation')
  @Roles(UserRole.ADMIN, UserRole.NOC)
  @Permissions(AccessPermissionKey.OPERATIONS_EXECUTION_ORDERS_SUPERVISE)
  @ApiOperation({ summary: 'Verificar convergencia de proyecciones de la OT' })
  async reconcileOrder(@Param('id', ParseUUIDPipe) id: string) {
    return this.projectionConvergenceService.reconcileOrder(id);
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

  private dateOrString(value: Date | string | null | undefined): string | undefined {
    if (value == null) return undefined;
    if (value instanceof Date) return value.toISOString();
    return String(value);
  }
}
