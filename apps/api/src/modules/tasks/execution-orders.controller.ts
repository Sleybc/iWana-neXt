import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Optional,
  Param,
  ParseUUIDPipe,
  Patch,
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
  ExecutionOrderDetailResponseDto,
  RegisterExecutionOrderItemUsageDto,
  RegisterFieldWorkDto,
  UpdateFieldWorkDto,
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
  RedriveExecutionOrderEventDto,
  RedriveExecutionOrderEventSchema,
  FollowUpSchema,
  StartExecutionOrderSchema,
  RegisterFieldWorkSchema,
  UpdateFieldWorkSchema,
  RegisterExecutionOrderItemUsageSchema,
  CloseExecutionOrderSchema,
} from './dto/execution-orders.dto';
import type { ExecutionOrderCommandContext } from './services/execution-order-reliability.service';
import {
  ExecutionOrdersService,
  readTemplateRequirementsSnapshot,
} from './services/execution-orders.service';
import { ExecutionOrderInventoryReconciliationService } from './services/execution-order-inventory-reconciliation.service';
import { ExecutionOrderProjectionConvergenceService } from './services/execution-order-projection-convergence.service';
import { ExecutionOrderAccessGuard } from './guards/execution-order-access.guard';
import { ExecutionOrderTenantScoped } from './guards/execution-order-tenant-scoped.decorator';
import { SkipThrottle } from '@nestjs/throttler';
import { TenantAwareThrottlerGuard } from './guards/tenant-aware-throttler.guard';
import { ExecutionOrderResponseHeadersInterceptor } from './interceptors/execution-order-response-headers.interceptor';

@ApiTags('tasks-execution-orders')
/**
 * Las rutas operativas quedan fuera del `ThrottlerGuard` global (100 req/min) y
 * su autoridad de cuota es `TenantAwareThrottlerGuard`.
 *
 * Los guards globales corren ANTES que los de controlador, así que el techo de
 * 100 cortaba en la petición 101 y volvía inalcanzable el contrato de 120
 * req/min de `eo-lightweight-read`: un cliente con cuota de 120 recibía 429 a
 * partir de la 101, y ese 429 llegaba sin las cabeceras `X-RateLimit-*` porque
 * las emite el guard específico, que ya no se ejecutaba.
 *
 * Saltarse el global aquí NO deja hueco: `resolveBucket` clasifica toda
 * petición de estos controladores en uno de los tres buckets —evidencia (10),
 * comando sensible (20) o lectura ligera (120)—, los tres con límite definido,
 * y el guard falla cerrado si Redis no responde. La protección resultante es
 * más estricta y más fina que la global, no menos.
 */
// El nombre importa: `ThrottlerModule.forRoot` declara el throttler como
// `global`, y el guard busca el metadato `THROTTLER:SKIP` + ese nombre. Un
// `@SkipThrottle()` sin argumentos marca `default` y NO surtiría efecto.
@SkipThrottle({ global: true })
@ApiBearerAuth('access-token')
@UseGuards(
  JwtAuthGuard,
  // JWT debe ejecutarse primero para poblar actor y tenant; este guard queda
  // antes de los guards de permisos/ABAC que pueden consultar la base de datos.
  TenantAwareThrottlerGuard,
  RolesGuard,
  PermissionsGuard,
  ExecutionOrderAccessGuard,
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
  @ApiOkResponse({ type: ExecutionOrderDetailResponseDto })
  async getById(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: JwtPayload,
  ): Promise<ExecutionOrderDetailResponseDto> {
    const order = await this.executionOrdersService.getById(id);
    const snapshotRequirements = readTemplateRequirementsSnapshot(
      order.templateRequirementsSnapshot,
    );
    const template =
      order.templateId !== null &&
      order.templateKey !== null &&
      order.templateVersionNumber !== null &&
      order.templateLabel !== null
        ? {
            id: order.templateId,
            key: order.templateKey,
            version: order.templateVersionNumber,
            label: order.templateLabel,
            // Snapshot inmutable (DATA-P1-3): el checklist de la OT se sirve
            // congelado, sin depender del catálogo vivo de plantillas.
            ...(snapshotRequirements !== null ? { requirements: snapshotRequirements } : {}),
          }
        : null;
    const completion = await this.executionOrdersService.getCompletion(order.id);
    const startedAt = this.dateOrString(order.startedAt);
    const closedAt = this.dateOrString(order.closedAt);
    return {
      id: order.id,
      number: order.executionOrderNumber,
      version: order.version,
      status: order.status,
      ...(order.result ? { result: order.result } : {}),
      workType: order.workType,
      template,
      schedule: {
        eventId: order.scheduleEventId,
        window: {
          startAt: this.dateOrString(order.plannedWindowStartAt) ?? '',
          endAt: this.dateOrString(order.plannedWindowEndAt) ?? '',
        },
      },
      ...(order.assignedTechnicianId
        ? { assignee: { type: 'TECHNICIAN' as const, id: order.assignedTechnicianId } }
        : {}),
      site: { id: order.id, label: order.municipality ?? order.customerDisplayLabel },
      completion: {
        progress: completion.progress,
        completed: completion.completed ?? 0,
        total: completion.total ?? 0,
        ...(startedAt ? { startedAt } : {}),
        ...(closedAt ? { closedAt } : {}),
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

  @Patch(':id/activities/:activityId')
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT, UserRole.TECHNICIAN, UserRole.CONTRACTOR)
  @Permissions(AccessPermissionKey.OPERATIONS_EXECUTION_ORDERS_EXECUTE)
  @ApiOperation({ summary: 'Modificar trabajo realizado registrado' })
  async updateFieldWork(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('activityId', ParseUUIDPipe) activityId: string,
    @Body(new ZodValidationPipe(UpdateFieldWorkSchema)) dto: UpdateFieldWorkDto,
    @CurrentUser() actor: JwtPayload,
    @Headers('if-match') ifMatch?: string,
  ) {
    return this.executionOrdersService.updateFieldWorkActivity(
      id,
      activityId,
      dto,
      actor,
      this.commandContext(ifMatch, undefined, undefined),
    );
  }

  @Delete(':id/activities/:activityId')
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT, UserRole.TECHNICIAN, UserRole.CONTRACTOR)
  @Permissions(AccessPermissionKey.OPERATIONS_EXECUTION_ORDERS_EXECUTE)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Eliminar trabajo realizado registrado' })
  async deleteFieldWork(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('activityId', ParseUUIDPipe) activityId: string,
    @CurrentUser() actor: JwtPayload,
    @Headers('if-match') ifMatch?: string,
  ) {
    await this.executionOrdersService.deleteFieldWorkActivity(
      id,
      activityId,
      actor,
      this.commandContext(ifMatch, undefined, undefined),
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
    @Headers('if-match') ifMatch?: string,
    @Headers('idempotency-key') idempotencyKey?: string,
    @Headers('x-correlation-id') correlationId?: string,
  ) {
    if (!file) {
      throw new BadRequestException({
        code: 'EVIDENCE_FILE_REQUIRED',
        message: 'Se requiere un archivo en el campo multipart "file".',
      });
    }
    // El multipart parser de NestJS ya valida MIME declarado por el cliente,
    // pero la validación real por magic bytes ocurre en el puerto de Media.
    return this.executionOrdersService.createEvidenceAssetReceipt(
      id,
      file,
      actor,
      this.commandContext(ifMatch, idempotencyKey, correlationId),
    );
  }

  @Get(':id/evidence-assets/:mediaAssetId')
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT, UserRole.TECHNICIAN, UserRole.CONTRACTOR)
  @Permissions(AccessPermissionKey.OPERATIONS_EXECUTION_ORDERS_READ)
  @ApiOperation({ summary: 'Consultar estado del recibo de asset de evidencia' })
  getEvidenceAsset(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('mediaAssetId', ParseUUIDPipe) mediaAssetId: string,
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
    @Param('mediaAssetId', ParseUUIDPipe) mediaAssetId: string,
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
      this.commandContext(undefined, key, correlationId, false),
    );
  }

  @Post('events/:eventId/redrive')
  @Roles(UserRole.ADMIN, UserRole.NOC)
  @Permissions(AccessPermissionKey.OPERATIONS_EXECUTION_EVENTS_REDRIVE)
  @HttpCode(HttpStatus.ACCEPTED)
  redrive(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Body(new ZodValidationPipe(RedriveExecutionOrderEventSchema))
    dto: RedriveExecutionOrderEventDto,
    @CurrentUser() actor: JwtPayload,
    @Headers('idempotency-key') key?: string,
    @Headers('x-correlation-id') correlationId?: string,
  ) {
    if (!key) {
      throw new BadRequestException({
        code: 'IDEMPOTENCY_KEY_REQUIRED',
        message: 'Idempotency-Key es obligatorio para redrive.',
      });
    }
    return this.executionOrdersService.redriveEvent(
      eventId,
      dto,
      actor,
      this.commandContext(undefined, key, correlationId, false),
    );
  }

  /** PLAT-P1-04: Health del relay de eventos outbox. */
  @Get('health/relay')
  @ExecutionOrderTenantScoped()
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
    requireIfMatch = true,
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
      requireIfMatch,
      correlationId: validCorrelation,
    };
  }

  private dateOrString(value: Date | string | null | undefined): string | undefined {
    if (value == null) return undefined;
    if (value instanceof Date) return value.toISOString();
    return String(value);
  }
}
