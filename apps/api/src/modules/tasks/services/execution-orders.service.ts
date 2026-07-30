import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager, QueryFailedError } from 'typeorm';
import {
  ExecutionOrder,
  ExecutionOrderActivity,
  ExecutionOrderEvidence,
  ExecutionOrderEvidenceUploadIntent,
  ExecutionOrderItemUsage,
  ExecutionOrderOutboxEvent,
  ExecutionOrderTemplateRequirement as DbTemplateRequirement,
  TenantContext,
  runInTenantSchema,
} from '@iwana/db';
import {
  ExecutionOrderResult,
  ExecutionOrderStatus,
  InventoryDisposition,
  TaskStatus,
  WfmWorkType,
  UserRole,
  OperationalEventTypeV1,
  type ExecutionOrderAllowedAction,
  type ExecutionOrderCompletionView,
  type ExecutionOrderTemplateRequirement,
  type EvidenceAssetReceipt,
  type ExecutionOrderEvidence as ExecutionOrderEvidenceContract,
  type ExecutionOrderActivity as ExecutionOrderActivityContract,
  type ExecutionOrderItemUsage as ExecutionOrderItemUsageContract,
  type Page,
} from '@iwana/shared';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { buildPageMeta, clampPage } from '../../../common/pagination';
import {
  CloseExecutionOrderInput,
  CloseExecutionOrderSchema,
  RegisterExecutionOrderItemUsageInput,
  RegisterExecutionOrderItemUsageSchema,
  RegisterFieldWorkInput,
  RegisterFieldWorkSchema,
  StartExecutionOrderInput,
  StartExecutionOrderSchema,
} from '../dto/execution-orders.dto';
import { ExecutionOrderInventoryService } from './execution-order-inventory.service';
import { ExecutionOrderTemplatesService } from './execution-order-templates.service';
import { ClosureGateEvaluatorService } from './closure-gate-evaluator.service';
import {
  ASSURANCE_EXECUTION_ORDER_NOTIFIER_PORT,
  AssuranceExecutionOrderNotifierPort,
} from '../ports/assurance-execution-order-notifier.port';
import { TasksService } from './tasks.service';
import type {
  ExecutionOrderCommandContext,
  IdempotencyReceipt,
} from './execution-order-reliability.service';
import { ExecutionOrderReliabilityService } from './execution-order-reliability.service';
import {
  EVIDENCE_ASSET_PORT,
  type EvidenceUploadResult,
  type IEvidenceAssetPort,
} from '../ports/evidence-asset.port';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CUSTOMER_SIGNATURE_REQUIREMENT_KEY = 'CUSTOMER_SIGNATURE';
const EXECUTION_ORDER_NUMBER_RETRY_LIMIT = 3;
const EXECUTION_ORDER_UNIQUE_CONSTRAINTS = new Set([
  'uq_execution_orders_tenant_number',
  'uq_execution_orders_tenant_schedule_event',
]);

type UniqueConstraintDriverError = { code?: unknown; constraint?: unknown };

function isExecutionOrderUniqueViolation(error: unknown): boolean {
  const driverError =
    error instanceof QueryFailedError
      ? (error.driverError as UniqueConstraintDriverError)
      : typeof error === 'object' && error !== null && 'driverError' in error
        ? ((error as { driverError?: unknown }).driverError as UniqueConstraintDriverError)
        : undefined;

  return (
    driverError?.code === '23505' &&
    (driverError.constraint === undefined ||
      EXECUTION_ORDER_UNIQUE_CONSTRAINTS.has(String(driverError.constraint)))
  );
}

export interface CreateExecutionOrderFromSchedulingInput {
  visitRequestId?: string | null;
  scheduleEventId: string;
  assignedTechnicianId?: string | null;
  assignedCrewId?: string | null;
  originContext: string;
  originRefId?: string | null;
  taskId?: string | null;
  ticketId?: string | null;
  subscriberId?: string | null;
  customerDisplayLabel: string;
  serviceAddress?: string | null;
  municipality?: string | null;
  sector?: string | null;
  workType: WfmWorkType;
  workSummary: string;
  workInstructions?: string | null;
  plannedWindowStartAt: string;
  plannedWindowEndAt: string;
}

@Injectable()
export class ExecutionOrdersService {
  private readonly logger = new Logger(ExecutionOrdersService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @Optional() _inventoryService?: ExecutionOrderInventoryService,
    @Optional() private readonly tasksService?: TasksService,
    @Optional()
    @Inject(ASSURANCE_EXECUTION_ORDER_NOTIFIER_PORT)
    private readonly assuranceNotifier?: AssuranceExecutionOrderNotifierPort,
    @Optional()
    @Inject(ExecutionOrderReliabilityService)
    private readonly reliabilityService?: ExecutionOrderReliabilityService,
    @Optional()
    @Inject(ExecutionOrderTemplatesService)
    private readonly templatesService?: ExecutionOrderTemplatesService,
    @Optional()
    @Inject(ClosureGateEvaluatorService)
    private readonly closureGateEvaluator?: ClosureGateEvaluatorService,
    @Optional()
    @Inject(EVIDENCE_ASSET_PORT)
    private readonly evidenceAssetPort?: IEvidenceAssetPort,
  ) {}

  async getById(id: string): Promise<ExecutionOrder> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const order = await qr.manager.findOne(ExecutionOrder, { where: { id, tenantId } });
      if (!order) {
        throw new NotFoundException('OT de ejecución no encontrada');
      }
      return order;
    });
  }

  /**
   * Calcula el avance exclusivamente desde el snapshot de requisitos y el
   * estado persistido de la OT. `progress` es porcentaje (0-100); `completed`
   * y `total` son conteos independientes.
   */
  async getCompletion(executionOrderId: string): Promise<ExecutionOrderCompletionView> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const order = await this.requireOrder(qr.manager, tenantId, executionOrderId);
      const snapshot = order.templateRequirementsSnapshot;

      if (!Array.isArray(snapshot) || !this.closureGateEvaluator) {
        return { progress: 0, completed: 0, total: 0 };
      }

      const [activities, evidences, itemUsages] = await Promise.all([
        qr.manager
          .createQueryBuilder(ExecutionOrderActivity, 'activity')
          .select(['activity.activityType'])
          .where('activity.execution_order_id = :executionOrderId', { executionOrderId })
          .andWhere('activity.tenant_id = :tenantId', { tenantId })
          .getMany(),
        qr.manager
          .createQueryBuilder(ExecutionOrderEvidence, 'evidence')
          .select(['evidence.evidenceType', 'evidence.requirementKey'])
          .where('evidence.execution_order_id = :executionOrderId', { executionOrderId })
          .andWhere('evidence.tenant_id = :tenantId', { tenantId })
          .getMany(),
        qr.manager
          .createQueryBuilder(ExecutionOrderItemUsage, 'usage')
          .select(['usage.itemId'])
          .where('usage.execution_order_id = :executionOrderId', { executionOrderId })
          .andWhere('usage.tenant_id = :tenantId', { tenantId })
          .getMany(),
      ]);

      const evaluation = this.closureGateEvaluator.evaluate(
        snapshot as unknown as ExecutionOrderTemplateRequirement[],
        {
          activities: activities.map((activity) => ({ activityType: activity.activityType })),
          evidences: evidences.map((evidence) => ({
            evidenceType: evidence.evidenceType,
            requirementKey: evidence.requirementKey ?? '',
          })),
          itemUsages: itemUsages.map((usage) => ({ itemId: usage.itemId })),
        },
      );
      const total = evaluation.totalRequired;
      const completed = evaluation.satisfiedRequired;
      const progress = total === 0 ? 0 : Math.round((completed / total) * 100);

      return { progress, completed, total };
    });
  }

  /**
   * ABAC server-side. La OT se carga dentro del schema del JWT; nunca se
   * confía en un site/tenant enviado por el cliente.
   */
  async assertActorAccess(
    id: string,
    actor: JwtPayload,
    write: boolean,
    requiresTechnicalExecution = write,
  ): Promise<void> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    await runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const order = await this.requireOrder(qr.manager, tenantId, id);
      // La membresía/vigencia de una cuadrilla pertenece a WFM y no se puede
      // inferir comparando crewId con userId. Hasta disponer del port tipado,
      // una OT asignada a CREW queda fuera del alcance de ejecución.
      const assigned = order.assignedTechnicianId === actor.sub;
      const supervisor = [UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT].includes(
        actor.role as UserRole,
      );
      // Supervisores pueden leer y ejecutar operaciones de coordinación, pero
      // nunca escribir sobre la ejecución técnica, aunque estén asignados.
      if (requiresTechnicalExecution) {
        if (supervisor || !assigned) {
          throw new NotFoundException('OT de ejecución no encontrada');
        }
        return;
      }

      // Contractors/technicians only act when explicitly assigned. Supervisors
      // may read and coordinate without estar asignados a la OT.
      if (!assigned && !supervisor) {
        throw new NotFoundException('OT de ejecución no encontrada');
      }
    });
  }

  async listActivities(
    executionOrderId: string,
    input: { page?: number; limit?: number },
  ): Promise<Page<ExecutionOrderActivityContract>> {
    const { page, limit } = clampPage(input.page ?? 1, input.limit ?? 25);
    const { tenantId, schemaName } = TenantContext.getOrThrow();

    const result = await runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      await this.requireOrder(qr.manager, tenantId, executionOrderId);

      const [activities, total] = await qr.manager
        .createQueryBuilder(ExecutionOrderActivity, 'activity')
        .select([
          'activity.id',
          'activity.activityType',
          'activity.description',
          'activity.actorUserId',
          'activity.createdAt',
        ])
        .where('activity.execution_order_id = :executionOrderId', { executionOrderId })
        .andWhere('activity.tenant_id = :tenantId', { tenantId })
        .orderBy('activity.created_at', 'ASC')
        .addOrderBy('activity.id', 'ASC')
        .skip((page - 1) * limit)
        .take(limit)
        .getManyAndCount();

      return { activities, total };
    });

    return {
      data: result.activities.map((activity) => this.toActivityContract(activity)),
      meta: buildPageMeta({
        total: result.total,
        page,
        limit,
        randomAccess: true,
        sortableFields: [],
      }),
    };
  }

  async listItemUsage(
    executionOrderId: string,
    input: { page?: number; limit?: number },
  ): Promise<Page<ExecutionOrderItemUsageContract>> {
    const { page, limit } = clampPage(input.page ?? 1, input.limit ?? 25);
    const { tenantId, schemaName } = TenantContext.getOrThrow();

    const result = await runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      await this.requireOrder(qr.manager, tenantId, executionOrderId);

      const [usages, total] = await qr.manager
        .createQueryBuilder(ExecutionOrderItemUsage, 'usage')
        .select([
          'usage.id',
          'usage.itemId',
          'usage.quantity',
          'usage.serialNumber',
          'usage.action',
          'usage.finalDisposition',
          'usage.inventoryRequestId',
          'usage.movementStatus',
          'usage.createdAt',
        ])
        .where('usage.execution_order_id = :executionOrderId', { executionOrderId })
        .andWhere('usage.tenant_id = :tenantId', { tenantId })
        .orderBy('usage.created_at', 'ASC')
        .addOrderBy('usage.id', 'ASC')
        .skip((page - 1) * limit)
        .take(limit)
        .getManyAndCount();

      return { usages, total };
    });

    return {
      data: result.usages.map((usage) => this.toItemUsageContract(usage)),
      meta: buildPageMeta({
        total: result.total,
        page,
        limit,
        randomAccess: true,
        sortableFields: [],
      }),
    };
  }

  async listEvidences(
    executionOrderId: string,
    input: { page?: number; limit?: number },
  ): Promise<Page<ExecutionOrderEvidenceContract>> {
    const { page, limit } = clampPage(input.page ?? 1, input.limit ?? 25);
    const { tenantId, schemaName } = TenantContext.getOrThrow();

    const result = await runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      await this.requireOrder(qr.manager, tenantId, executionOrderId);

      const [evidences, total] = await qr.manager
        .createQueryBuilder(ExecutionOrderEvidence, 'evidence')
        .select([
          'evidence.id',
          'evidence.evidenceType',
          'evidence.mediaAssetId',
          'evidence.requirementKey',
          'evidence.assetStatus',
          'evidence.capturedAt',
          'evidence.createdAt',
        ])
        .where('evidence.execution_order_id = :executionOrderId', { executionOrderId })
        .andWhere('evidence.tenant_id = :tenantId', { tenantId })
        .andWhere('evidence.media_asset_id IS NOT NULL')
        .orderBy('evidence.created_at', 'ASC')
        .addOrderBy('evidence.id', 'ASC')
        .skip((page - 1) * limit)
        .take(limit)
        .getManyAndCount();

      return { evidences, total };
    });

    const data = result.evidences.map((evidence) => this.toEvidenceContract(evidence));
    return {
      data,
      meta: buildPageMeta({
        total: result.total,
        page,
        limit,
        randomAccess: true,
        sortableFields: [],
      }),
    };
  }

  async createFromScheduling(
    input: CreateExecutionOrderFromSchedulingInput,
    actor: JwtPayload,
  ): Promise<ExecutionOrder> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();

    for (let attempt = 0; attempt < EXECUTION_ORDER_NUMBER_RETRY_LIMIT; attempt += 1) {
      try {
        return await runInTenantSchema(this.dataSource, schemaName, async (qr) =>
          this.createFromSchedulingWithManager(qr.manager, tenantId, input, actor),
        );
      } catch (error) {
        // Una violación única deja la transacción abortada en PostgreSQL. El
        // reintento vuelve a entrar por runInTenantSchema para obtener un
        // QueryRunner y un search_path nuevos.
        if (
          !isExecutionOrderUniqueViolation(error) ||
          attempt === EXECUTION_ORDER_NUMBER_RETRY_LIMIT - 1
        ) {
          if (isExecutionOrderUniqueViolation(error)) {
            throw new ConflictException({
              code: 'EXECUTION_ORDER_NUMBER_CONFLICT',
              message: 'No fue posible generar un consecutivo único para la OT.',
            });
          }
          throw error;
        }
      }
    }

    throw new ConflictException({
      code: 'EXECUTION_ORDER_NUMBER_CONFLICT',
      message: 'No fue posible generar un consecutivo único para la OT.',
    });
  }

  async createFromSchedulingWithManager(
    manager: EntityManager,
    tenantId: string,
    input: CreateExecutionOrderFromSchedulingInput,
    actor: JwtPayload,
  ): Promise<ExecutionOrder> {
    // La serialización debe preceder a la lectura idempotente de scheduleEventId:
    // dos transacciones pueden haber leído "no existe" antes de competir por
    // el mismo consecutivo o por la unicidad de la visita.
    await this.acquireExecutionOrderNumberLock(manager, tenantId);

    const existing = await manager.findOne(ExecutionOrder, {
      where: {
        tenantId,
        scheduleEventId: input.scheduleEventId,
      },
    });

    if (existing) {
      return existing;
    }

    // Look up active template version for the work type
    let templateVersion: {
      id: string;
      templateId: string;
      templateKey: string;
      version: number;
      label: string;
      requirements: ExecutionOrderTemplateRequirement[];
    } | null = null;
    if (this.templatesService) {
      try {
        const activeVersion = await this.templatesService.getActiveVersionForWorkType(
          input.workType,
        );
        templateVersion = activeVersion
          ? {
              id: activeVersion.id,
              templateId: activeVersion.templateId,
              templateKey: activeVersion.templateKey,
              version: activeVersion.version,
              label: activeVersion.label,
              requirements: this.mapTemplateRequirements(activeVersion.requirements),
            }
          : null;
      } catch {
        // La ausencia de plantilla se conserva para que el cierre falle cerrado.
      }
    }

    const executionOrderNumber = await this.generateExecutionOrderNumber(manager, tenantId);
    const entity = manager.create(ExecutionOrder, {
      tenantId,
      executionOrderNumber,
      visitRequestId: input.visitRequestId ?? null,
      scheduleEventId: input.scheduleEventId,
      assignedTechnicianId: input.assignedTechnicianId ?? null,
      assignedCrewId: input.assignedCrewId ?? null,
      originContext: input.originContext,
      originRefId: input.originRefId ?? null,
      taskId: input.taskId ?? null,
      ticketId: input.ticketId ?? null,
      subscriberId: input.subscriberId ?? null,
      customerDisplayLabel: input.customerDisplayLabel,
      serviceAddress: input.serviceAddress ?? null,
      municipality: input.municipality ?? null,
      sector: input.sector ?? null,
      workType: input.workType,
      workSummary: input.workSummary,
      workInstructions: input.workInstructions ?? null,
      plannedWindowStartAt: new Date(input.plannedWindowStartAt),
      plannedWindowEndAt: new Date(input.plannedWindowEndAt),
      status:
        input.assignedTechnicianId || input.assignedCrewId
          ? ExecutionOrderStatus.ASSIGNED
          : ExecutionOrderStatus.CREATED,
      result: null,
      startedAt: null,
      closedAt: null,
      closeNotes: null,
      // Template snapshot (frozen at OT creation time)
      templateId: templateVersion?.templateId ?? null,
      templateVersionId: templateVersion?.id ?? null,
      templateKey: templateVersion?.templateKey ?? null,
      templateVersionNumber: templateVersion?.version ?? null,
      templateLabel: templateVersion?.label ?? null,
      templateRequirementsSnapshot: templateVersion?.requirements ?? null,
      createdByUserId: actor.sub,
      updatedByUserId: actor.sub,
    });

    return manager.save(ExecutionOrder, entity);
  }

  async start(
    id: string,
    input: StartExecutionOrderInput,
    actor: JwtPayload,
    context?: ExecutionOrderCommandContext,
  ): Promise<ExecutionOrder> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const validated = StartExecutionOrderSchema.parse(input);

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const order = await this.requireOrder(qr.manager, tenantId, id);
      const receipt = await this.beginCommand(
        qr.manager,
        tenantId,
        actor,
        'execution_order.start',
        { executionOrderId: id, input: validated },
        context,
      );
      if (receipt?.replay) return order;
      this.assertVersion(order, context?.ifMatch);
      this.assertMutable(order);

      const expectedVersion = order.version ?? 1;
      order.status = ExecutionOrderStatus.IN_PROGRESS;
      order.version = expectedVersion + 1;
      order.startedAt = order.startedAt ?? new Date();
      order.updatedByUserId = actor.sub;
      const saved = await this.persistOrderOptimistically(qr.manager, order, expectedVersion);

      if (validated.note) {
        await qr.manager.save(
          ExecutionOrderActivity,
          qr.manager.create(ExecutionOrderActivity, {
            executionOrderId: order.id,
            tenantId,
            activityType: 'START',
            description: validated.note,
            actorUserId: actor.sub,
          }),
        );
      }

      await this.finishCommand(
        qr.manager,
        tenantId,
        actor,
        'execution_order.start',
        id,
        saved.version,
        context,
        receipt,
        'ExecutionOrderStartedV1',
        { startedAt: (saved.startedAt ?? new Date()).toISOString() },
      );

      return saved;
    });
  }

  async registerFieldWork(
    id: string,
    input: RegisterFieldWorkInput,
    actor: JwtPayload,
    context?: ExecutionOrderCommandContext,
  ): Promise<ExecutionOrderActivity> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const validated = RegisterFieldWorkSchema.parse(input);

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const order = await this.requireOrder(qr.manager, tenantId, id);
      const receipt = await this.beginCommand(
        qr.manager,
        tenantId,
        actor,
        'execution_order.activity',
        { executionOrderId: id, input: validated },
        context,
      );
      if (receipt?.replay && receipt.resourceRef) {
        return (await qr.manager.findOne(ExecutionOrderActivity, {
          where: { id: receipt.resourceRef, tenantId },
        })) as ExecutionOrderActivity;
      }
      this.assertVersion(order, context?.ifMatch);
      this.assertMutable(order);
      const expectedVersion = order.version ?? 1;
      if (
        order.status === ExecutionOrderStatus.CREATED ||
        order.status === ExecutionOrderStatus.ASSIGNED
      ) {
        order.status = ExecutionOrderStatus.IN_PROGRESS;
        order.startedAt = order.startedAt ?? new Date();
      }
      order.version = expectedVersion + 1;
      order.updatedByUserId = actor.sub;
      await this.persistOrderOptimistically(qr.manager, order, expectedVersion);

      const activity = await qr.manager.save(
        ExecutionOrderActivity,
        qr.manager.create(ExecutionOrderActivity, {
          executionOrderId: id,
          tenantId,
          activityType: validated.activityType,
          description: validated.description,
          actorUserId: actor.sub,
        }),
      );
      await this.finishCommand(
        qr.manager,
        tenantId,
        actor,
        'execution_order.activity',
        activity.id,
        order.version ?? 1,
        context,
        receipt,
        undefined,
      );
      return activity;
    });
  }

  async registerItemUsage(
    id: string,
    input: RegisterExecutionOrderItemUsageInput,
    actor: JwtPayload,
    context?: ExecutionOrderCommandContext,
  ): Promise<ExecutionOrderItemUsage> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const validated = RegisterExecutionOrderItemUsageSchema.parse(input);

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const order = await this.requireOrder(qr.manager, tenantId, id);
      const receipt = await this.beginCommand(
        qr.manager,
        tenantId,
        actor,
        'execution_order.item_usage',
        { executionOrderId: id, input: validated },
        context,
      );
      if (receipt?.replay && receipt.resourceRef) {
        return (await qr.manager.findOne(ExecutionOrderItemUsage, {
          where: { id: receipt.resourceRef, tenantId },
        })) as ExecutionOrderItemUsage;
      }
      this.assertVersion(order, context?.ifMatch);
      this.assertMutable(order);

      // ── Custodia: validar que el actor está asignado a la OT ────────
      this.assertCustodyAssignment(order, actor.sub, validated.technicianCustodyId);

      const expectedVersion = order.version ?? 1;
      if (
        order.status === ExecutionOrderStatus.CREATED ||
        order.status === ExecutionOrderStatus.ASSIGNED
      ) {
        order.status = ExecutionOrderStatus.IN_PROGRESS;
        order.startedAt = order.startedAt ?? new Date();
      }
      order.version = expectedVersion + 1;
      order.updatedByUserId = actor.sub;
      await this.persistOrderOptimistically(qr.manager, order, expectedVersion);

      const intentId = receipt?.intentId ?? `${id}-${validated.itemId}-${Date.now()}`;
      const usage = await qr.manager.save(
        ExecutionOrderItemUsage,
        qr.manager.create(ExecutionOrderItemUsage, {
          executionOrderId: id,
          tenantId,
          itemId: validated.itemId,
          technicianCustodyId: validated.technicianCustodyId,
          quantity: validated.quantity,
          serialNumber: validated.serialNumber ?? null,
          action: validated.action,
          finalDisposition: validated.finalDisposition,
          stockMovementId: null,
          inventoryRequestId: intentId,
          movementStatus: 'PENDING',
          actorUserId: actor.sub,
        }),
      );
      await this.finishCommand(
        qr.manager,
        tenantId,
        actor,
        'execution_order.item_usage',
        usage.id,
        order.version ?? 1,
        context,
        receipt,
        'InventoryConsumptionRequestedV1',
        {
          inventoryRequestId: intentId,
          itemId: usage.itemId,
          quantity: Number(usage.quantity),
          ...(usage.serialNumber ? { serial: usage.serialNumber } : {}),
        },
      );
      // MOD12 consume la solicitud desde el outbox; no se hace llamada
      // sincrónica que pueda dejar un movimiento externo sin reconciliar.
      return usage;
    });
  }

  async close(
    id: string,
    input: CloseExecutionOrderInput,
    actor: JwtPayload,
    context?: ExecutionOrderCommandContext,
  ): Promise<ExecutionOrder> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const validated = CloseExecutionOrderSchema.parse(input);

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const order = await this.requireOrder(qr.manager, tenantId, id);
      const receipt = await this.beginCommand(
        qr.manager,
        tenantId,
        actor,
        'execution_order.close',
        { executionOrderId: id, input: validated },
        context,
      );
      if (receipt?.replay) return order;
      this.assertVersion(order, context?.ifMatch);
      this.assertMutable(order);

      if (validated.customerAcceptance?.artifactId) {
        if (validated.customerAcceptance.method !== 'SIGNATURE') {
          throw new UnprocessableEntityException({
            code: 'CUSTOMER_ACCEPTANCE_METHOD_INVALID',
            message: 'La aceptación de cliente para una firma debe usar el método SIGNATURE.',
          });
        }
        await this.assertCustomerAcceptanceArtifactLinked(
          qr.manager,
          tenantId,
          id,
          validated.customerAcceptance.artifactId,
        );
      }
      // customerSignatureRef es la forma legacy del mismo dato. No puede
      // convertirse en un bypass de la validación del artefacto vinculado.
      if (validated.customerSignatureRef) {
        await this.assertCustomerAcceptanceArtifactLinked(
          qr.manager,
          tenantId,
          id,
          validated.customerSignatureRef,
        );
      }

      // ── Closure gate evaluation ────────────────────────────────────
      if (!Array.isArray(order.templateRequirementsSnapshot)) {
        throw new UnprocessableEntityException({
          code: 'CLOSURE_GATE_SNAPSHOT_MISSING',
          message: 'No se puede cerrar la OT porque no tiene una plantilla de cierre congelada.',
          missingRequirements: [
            {
              requirementId: 'template-snapshot',
              label: 'Plantilla de cierre',
              kind: 'TEMPLATE',
              reason: 'La OT no tiene un snapshot de requisitos de cierre.',
            },
          ],
        });
      }
      const snapshot =
        order.templateRequirementsSnapshot as unknown as ExecutionOrderTemplateRequirement[];
      if (!this.closureGateEvaluator && snapshot.length > 0) {
        throw new ServiceUnavailableException({
          code: 'CLOSURE_GATE_UNAVAILABLE',
          message: 'El gate de cierre no está disponible temporalmente.',
        });
      }
      if (this.closureGateEvaluator) {
        const activities = await qr.manager
          .createQueryBuilder(ExecutionOrderActivity, 'a')
          .where('a.execution_order_id = :executionOrderId', { executionOrderId: id })
          .andWhere('a.tenant_id = :tenantId', { tenantId })
          .getMany();

        const evidences = await qr.manager
          .createQueryBuilder(ExecutionOrderEvidence, 'e')
          .where('e.execution_order_id = :executionOrderId', { executionOrderId: id })
          .andWhere('e.tenant_id = :tenantId', { tenantId })
          .getMany();

        const itemUsages = await qr.manager
          .createQueryBuilder(ExecutionOrderItemUsage, 'u')
          .where('u.execution_order_id = :executionOrderId', { executionOrderId: id })
          .andWhere('u.tenant_id = :tenantId', { tenantId })
          .getMany();

        const evaluation = this.closureGateEvaluator.evaluate(snapshot, {
          activities: activities.map((a) => ({ activityType: a.activityType })),
          evidences: evidences.map((e) => ({
            evidenceType: e.evidenceType,
            requirementKey: e.requirementKey ?? '',
          })),
          // La categoría no se infiere desde itemId: si el recibo de MOD12 no
          // la aporta, el requisito MATERIAL permanece insatisfecho.
          itemUsages: itemUsages.map((u) => ({ itemId: u.itemId })),
          hasCustomerAcceptance: !!validated.customerAcceptance,
          closeCommand: validated as Record<string, unknown>,
        });

        if (!evaluation.passed) {
          throw new UnprocessableEntityException({
            code: 'CLOSURE_GATE_INCOMPLETE',
            message: 'No se puede cerrar la OT: requisitos pendientes.',
            missingRequirements: evaluation.missingRequirements.map((m) => ({
              requirementId: m.requirementId,
              label: m.label,
              kind: m.kind,
              reason: m.reason,
            })),
          });
        }
      }

      const itemUsage = await qr.manager
        .createQueryBuilder(ExecutionOrderItemUsage, 'usage')
        .where('usage.execution_order_id = :executionOrderId', { executionOrderId: id })
        .andWhere('usage.tenant_id = :tenantId', { tenantId })
        .orderBy('usage.created_at', 'ASC')
        .getMany();

      const requiresCustomerSignature =
        [ExecutionOrderResult.EXECUTED, ExecutionOrderResult.EXECUTED_WITH_OBSERVATIONS].includes(
          validated.result,
        ) &&
        itemUsage.some(
          (usage) => usage.finalDisposition === InventoryDisposition.INSTALLED_AT_CUSTOMER,
        );

      const acceptanceRef =
        validated.customerSignatureRef ?? validated.customerAcceptance?.artifactId ?? null;
      if (requiresCustomerSignature && !acceptanceRef) {
        throw new BadRequestException(
          'Debes registrar la evidencia de firma del cliente para cerrar esta OT.',
        );
      }

      const expectedVersion = order.version ?? 1;
      order.result = validated.result;
      order.status = this.mapResultToStatus(validated.result);
      order.version = expectedVersion + 1;
      order.closedAt = new Date();
      order.closeNotes = validated.closeNotes ?? validated.summary ?? null;
      order.updatedByUserId = actor.sub;
      const saved = await this.persistOrderOptimistically(qr.manager, order, expectedVersion);

      if (acceptanceRef) {
        await this.createEvidenceWithManager(
          qr.manager,
          tenantId,
          order.id,
          'SIGNATURE',
          CUSTOMER_SIGNATURE_REQUIREMENT_KEY,
          acceptanceRef,
          actor,
        );
      }

      if (order.taskId && this.tasksService) {
        const nextTaskStatus = this.mapCloseResultToTaskStatus(validated.result);
        if (nextTaskStatus) {
          await this.tasksService.transitionStatusWithManager(
            qr.manager,
            tenantId,
            order.taskId,
            { status: nextTaskStatus },
            actor,
          );
        }
      }
      if (order.ticketId) {
        if (this.assuranceNotifier) {
          await this.assuranceNotifier.notifyClosedWithManager(qr.manager, {
            ticketId: order.ticketId,
            executionOrderId: order.id,
            result: validated.result,
            tenantId,
            actorUserId: actor.sub,
          });
        } else {
          this.logger.warn(
            `No hay notificador de assurance para ticketId=${order.ticketId} executionOrderId=${order.id}`,
          );
        }
      }

      await this.finishCommand(
        qr.manager,
        tenantId,
        actor,
        'execution_order.close',
        id,
        saved.version,
        context,
        receipt,
        'ExecutionOrderClosedV1',
        { result: validated.result, closedAt: (saved.closedAt ?? new Date()).toISOString() },
      );

      return saved;
    });
  }

  async assign(
    id: string,
    input: { assigneeType: 'TECHNICIAN' | 'CREW'; assigneeId: string; reason?: string },
    actor: JwtPayload,
    context?: ExecutionOrderCommandContext,
  ): Promise<ExecutionOrder> {
    if (input.assigneeType === 'CREW') {
      throw new ForbiddenException({
        code: 'CREW_MEMBERSHIP_RESOLVER_UNAVAILABLE',
        message: 'La ejecución por cuadrilla requiere resolver membresía y vigencia.',
      });
    }
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const order = await this.requireOrder(qr.manager, tenantId, id);
      const receipt = await this.beginCommand(
        qr.manager,
        tenantId,
        actor,
        'execution_order.assign',
        { executionOrderId: id, input },
        context,
      );
      if (receipt?.replay) return order;
      this.assertVersion(order, context?.ifMatch);
      this.assertMutable(order);
      const expectedVersion = order.version ?? 1;
      if (input.assigneeType === 'TECHNICIAN') order.assignedTechnicianId = input.assigneeId;
      else order.assignedCrewId = input.assigneeId;
      order.status = ExecutionOrderStatus.ASSIGNED;
      order.version = expectedVersion + 1;
      order.updatedByUserId = actor.sub;
      const saved = await this.persistOrderOptimistically(qr.manager, order, expectedVersion);
      await this.finishCommand(
        qr.manager,
        tenantId,
        actor,
        'execution_order.assign',
        id,
        saved.version,
        context,
        receipt,
        'VisitResourceChangedV1',
        { resourceType: 'TECHNICIAN', resourceId: input.assigneeId },
      );
      return saved;
    });
  }

  async block(
    id: string,
    input: { reasonCode: string; note?: string },
    actor: JwtPayload,
    context?: ExecutionOrderCommandContext,
  ): Promise<ExecutionOrder> {
    return this.transitionExecutionOrder(
      id,
      ExecutionOrderStatus.BLOCKED,
      actor,
      context,
      'execution_order.block',
      input,
      'ExecutionOrderBlockedV1',
    );
  }

  async unblock(
    id: string,
    input: { resolutionCode: string; note?: string },
    actor: JwtPayload,
    context?: ExecutionOrderCommandContext,
  ): Promise<ExecutionOrder> {
    return this.transitionExecutionOrder(
      id,
      ExecutionOrderStatus.IN_PROGRESS,
      actor,
      context,
      'execution_order.unblock',
      input,
      'ExecutionOrderStartedV1',
    );
  }

  async registerEvidence(
    id: string,
    input: {
      mediaAssetId: string;
      evidenceType: string;
      requirementKey: string;
      expiresAt: string;
      capturedAt?: string;
    },
    actor: JwtPayload,
    context?: ExecutionOrderCommandContext,
  ): Promise<ExecutionOrderEvidence & { assetStatus: string | null }> {
    const port = this.evidenceAssetPort;
    if (!port) {
      throw new ServiceUnavailableException({
        code: 'MEDIA_ASSET_BOUNDARY_UNAVAILABLE',
        message: 'La evidencia requiere validación de Media antes de enlazarse a la OT.',
      });
    }

    this.assertEvidenceExpiresAt(input.expiresAt);

    const { tenantId, schemaName } = TenantContext.getOrThrow();
    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const order = await this.requireOrder(qr.manager, tenantId, id);
      const receipt = await this.beginCommand(
        qr.manager,
        tenantId,
        actor,
        'execution_order.evidence',
        { executionOrderId: id, input },
        context,
      );
      if (receipt?.replay && receipt.resourceRef) {
        const existing = await qr.manager.findOne(ExecutionOrderEvidence, {
          where: { id: receipt.resourceRef, tenantId },
        });
        if (existing) {
          return { ...existing, assetStatus: existing.assetStatus };
        }
      }
      this.assertVersion(order, context?.ifMatch);
      this.assertMutable(order);

      // El asset no puede ser reutilizado por otra OT del mismo tenant aunque
      // todavía esté AVAILABLE y no tenga claim. El upload-intent es la
      // autorización durable que une Media con esta OT; se verifica antes de
      // consultar el asset y, por tanto, antes de cualquier side effect.
      const uploadIntent = await qr.manager.findOne(ExecutionOrderEvidenceUploadIntent, {
        where: {
          mediaAssetId: input.mediaAssetId,
          executionOrderId: id,
          tenantId,
        },
      });
      if (!uploadIntent) {
        throw new ConflictException({
          code: 'EVIDENCE_UPLOAD_INTENT_REQUIRED',
          message: 'El asset no tiene un intento de carga vigente vinculado a esta OT.',
        });
      }
      this.assertEvidenceUploadIntentCurrent(uploadIntent);

      // ── Validación del asset contra Media/Assets ─────────────────────────
      // Verificar que el asset existe y está AVAILABLE
      let assetStatus: { status: string };
      try {
        assetStatus = await port.getAssetStatus(input.mediaAssetId, schemaName);
      } catch (err: unknown) {
        throw new ConflictException({
          code: 'EVIDENCE_ASSET_NOT_FOUND',
          message: 'El asset de evidencia no existe o no pertenece a este tenant.',
        });
      }

      if (assetStatus.status !== 'AVAILABLE') {
        throw new ConflictException({
          code: 'EVIDENCE_ASSET_NOT_AVAILABLE',
          message: `El asset no está disponible (estado: ${assetStatus.status}). Solo assets en estado AVAILABLE pueden registrarse como evidencia.`,
        });
      }

      // ── Crear registro de evidencia PRIMERO (P0-2: compensación) ────────
      // Si el claim falla después, la evidencia queda con assetStatus 'CLAIM_FAILED'
      // y puede ser retomada por un proceso de reconciliación.
      const expectedVersion = order.version ?? 1;
      order.version = expectedVersion + 1;
      order.updatedByUserId = actor.sub;
      await this.persistOrderOptimistically(qr.manager, order, expectedVersion);

      const evidence = await qr.manager.save(
        ExecutionOrderEvidence,
        qr.manager.create(ExecutionOrderEvidence, {
          executionOrderId: id,
          tenantId,
          evidenceType: input.evidenceType,
          mediaAssetId: input.mediaAssetId,
          requirementKey: input.requirementKey,
          assetStatus: 'PENDING', // Evidencia creada pero asset aún no reclamado (P0-2)
          capturedAt: input.capturedAt ? new Date(input.capturedAt) : null,
          fileName: null,
          notes: null,
          actorUserId: actor.sub,
        }),
      );

      // ── Reclamar el asset atómicamente (P0-2: después de crear evidence) ─
      try {
        await port.claimAsset(input.mediaAssetId, schemaName, id);
      } catch (err: unknown) {
        // El claim falló — marcar evidencia como FAILED (no huérfana)
        await qr.manager.update(ExecutionOrderEvidence, evidence.id, {
          assetStatus: 'CLAIM_FAILED',
        } as Partial<ExecutionOrderEvidence>);
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('reclamado') || msg.includes('claim')) {
          throw new ConflictException({
            code: 'EVIDENCE_ASSET_ALREADY_CLAIMED',
            message: 'El asset ya fue vinculado a otra evidencia u OT.',
          });
        }
        throw err;
      }

      // Claim exitoso — actualizar estado del asset
      evidence.assetStatus = 'AVAILABLE';
      await qr.manager.update(ExecutionOrderEvidence, evidence.id, {
        assetStatus: 'AVAILABLE',
      } as Partial<ExecutionOrderEvidence>);

      await this.finishCommand(
        qr.manager,
        tenantId,
        actor,
        'execution_order.evidence',
        evidence.id,
        order.version ?? 1,
        context,
        receipt,
      );

      return { ...evidence, assetStatus: 'AVAILABLE' };
    });
  }

  async createEvidenceAssetReceipt(
    id: string,
    file: Express.Multer.File,
    actor: JwtPayload,
  ): Promise<EvidenceAssetReceipt> {
    const port = this.evidenceAssetPort;
    if (!port) {
      throw new ServiceUnavailableException({
        code: 'MEDIA_ASSET_BOUNDARY_UNAVAILABLE',
        message: 'La carga de evidencia no está disponible hasta validar el asset en Media.',
      });
    }

    const { tenantId, schemaName } = TenantContext.getOrThrow();

    // ── Paso 1: Crear intento durable en schema tenant ──────────────────
    // El intent sobrevive al upload de Media para autorizar polling y
    // reconciliación. Si el upload falla, el intent queda FAILED y es visible
    // en el recibo.
    const intent = await runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const order = await this.requireOrder(qr.manager, tenantId, id);
      this.assertMutable(order);

      const expiresAt = new Date(
        Date.now() + 24 * 60 * 60 * 1000, // 24h TTL
      );

      return qr.manager.save(
        qr.manager.create(ExecutionOrderEvidenceUploadIntent, {
          executionOrderId: id,
          tenantId,
          mediaAssetId: null,
          status: 'PENDING',
          expiresAt,
          actorUserId: actor.sub,
        }),
      );
    });

    // ── Paso 2: Subir asset a Media (bounded context independiente) ─────
    let uploadResult: EvidenceUploadResult;
    try {
      uploadResult = await port.createUploadIntent(schemaName, file, actor.sub);
    } catch (err: unknown) {
      await runInTenantSchema(this.dataSource, schemaName, async (qr) => {
        await qr.manager.update(ExecutionOrderEvidenceUploadIntent, intent.id, {
          status: 'FAILED',
          mediaAssetId: null,
        });
      });
      throw err;
    }

    // ── Paso 3: Vincular intent con el asset creado ─────────────────────
    await runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      await qr.manager.update(ExecutionOrderEvidenceUploadIntent, intent.id, {
        mediaAssetId: uploadResult.mediaAssetId,
        status: 'PENDING_ANALYSIS',
      });
    });

    const receipt: EvidenceAssetReceipt = {
      intentId: intent.id,
      mediaAssetId: uploadResult.mediaAssetId,
      status: 'PENDING_ANALYSIS',
      uploadedAt: uploadResult.uploadedAt,
    };
    if (intent.expiresAt) {
      receipt.expiresAt = intent.expiresAt.toISOString();
    }
    return receipt;
  }

  async getEvidenceAssetReceipt(id: string, mediaAssetId: string): Promise<EvidenceAssetReceipt> {
    const port = this.evidenceAssetPort;
    if (!port) {
      throw new ServiceUnavailableException({
        code: 'MEDIA_ASSET_BOUNDARY_UNAVAILABLE',
        message: 'El asset de evidencia no puede consultarse sin el boundary de Media.',
      });
    }

    const { tenantId, schemaName } = TenantContext.getOrThrow();

    // Verificar que la OT existe y que el asset está vinculado a ella (P0-1: IDOR)
    const result = await runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      await this.requireOrder(qr.manager, tenantId, id);

      // Verificar vinculación OT–asset vía evidence e intent.
      // Sin ningún vínculo, NO consultar Media (P0-1: previene enumeración intra-tenant).
      const evidence = await qr.manager.findOne(ExecutionOrderEvidence, {
        where: { mediaAssetId, executionOrderId: id, tenantId },
      });

      const intent = evidence
        ? null // Si ya hay evidence, no necesitamos el intent
        : await qr.manager.findOne(ExecutionOrderEvidenceUploadIntent, {
            where: { mediaAssetId, executionOrderId: id, tenantId },
          });

      if (!intent && !evidence) {
        throw new NotFoundException('OT de ejecución no encontrada');
      }

      if (intent) {
        this.assertEvidenceUploadIntentCurrent(intent);
      }

      // Vinculo existe — consultar estado real en Media
      const status = await port.getAssetStatus(mediaAssetId, schemaName);

      const receipt: EvidenceAssetReceipt = {
        intentId: intent?.id ?? evidence?.id ?? '',
        mediaAssetId,
        status: status.status as EvidenceAssetReceipt['status'],
        uploadedAt: status.uploadedAt,
      };
      if (status.expiresAt) {
        receipt.expiresAt = status.expiresAt;
      }
      return receipt;
    });

    return result;
  }

  /**
   * Obtiene una URL firmada para descargar el contenido de un asset de evidencia.
   *
   * - TTL máximo de 15 minutos (900s)
   * - Re-autorización por cada request de descarga
   * - No expone objectKey, bucket ni secretos en respuesta o logs
   * - Verifica pertenencia al tenant y existencia de la OT
   *
   * Retorna la URL firmada para que el controller emita un 302 redirect.
   */
  async getEvidenceContentRedirect(id: string, mediaAssetId: string): Promise<string> {
    const port = this.evidenceAssetPort;
    if (!port) {
      throw new ServiceUnavailableException({
        code: 'MEDIA_ASSET_BOUNDARY_UNAVAILABLE',
        message: 'La descarga de evidencia no está disponible.',
      });
    }

    const { tenantId, schemaName } = TenantContext.getOrThrow();

    // Verificar que la OT existe y que el asset está vinculado a ella (P0-1: IDOR)
    await runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      await this.requireOrder(qr.manager, tenantId, id);

      const evidence = await qr.manager.findOne(ExecutionOrderEvidence, {
        where: { mediaAssetId, executionOrderId: id, tenantId },
      });

      if (!evidence) {
        throw new NotFoundException('OT de ejecución no encontrada');
      }
    });

    // Obtener signed URL con TTL máximo de 15 minutos
    return port.getSignedUrl(mediaAssetId, schemaName, 900);
  }

  async createFollowUp(
    id: string,
    _input: { reasonCode: string; dueAt?: string },
    _actor: JwtPayload,
    _context?: ExecutionOrderCommandContext,
  ): Promise<{ intentId: string; resourceRef: string; status: 'ACCEPTED' }> {
    void id;
    void _input;
    void _actor;
    void _context;
    throw new ServiceUnavailableException({
      code: 'FOLLOW_UP_BOUNDARY_UNAVAILABLE',
      message: 'El seguimiento requiere una entidad de necesidad vinculada.',
    });
  }

  async redriveEvent(
    eventId: string,
    _actor: JwtPayload,
  ): Promise<{ eventId: string; status: 'QUEUED' }> {
    void eventId;
    void _actor;
    throw new ServiceUnavailableException({
      code: 'EVENT_REDRIVE_UNAVAILABLE',
      message: 'El redrive requiere un consumidor DLQ y auditoría de eventos disponibles.',
    });
  }

  /**
   * Computa las acciones permitidas sobre una OT según estado, rol del actor
   * y asignación. Es política pura; no reemplaza autorización por guardas.
   */
  computeAllowedActions(order: ExecutionOrder, actor: JwtPayload): ExecutionOrderAllowedAction[] {
    const isAssigned = order.assignedTechnicianId === actor.sub;
    const isSupervisor = [UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT].includes(
      actor.role as UserRole,
    );
    const isTerminal = [
      ExecutionOrderStatus.COMPLETED,
      ExecutionOrderStatus.COMPLETED_WITH_OBSERVATIONS,
      ExecutionOrderStatus.NOT_EXECUTED,
      ExecutionOrderStatus.CANCELLED,
    ].includes(order.status);

    const actions: ExecutionOrderAllowedAction[] = [];

    // ── Estados terminales: solo supervisión puede crear seguimiento ────
    if (isTerminal) {
      if (isSupervisor) {
        actions.push('CREATE_FOLLOW_UP');
      }
      return actions;
    }

    // ── Ejecución: solo técnico/contratista asignado (no supervisor) ────
    if (isAssigned && !isSupervisor) {
      switch (order.status) {
        case ExecutionOrderStatus.CREATED:
        case ExecutionOrderStatus.ASSIGNED:
        case ExecutionOrderStatus.EN_ROUTE:
          actions.push('START', 'REGISTER_ACTIVITY', 'REGISTER_ITEM_USAGE', 'REGISTER_EVIDENCE');
          break;
        case ExecutionOrderStatus.IN_PROGRESS:
          actions.push(
            'REGISTER_ACTIVITY',
            'REGISTER_ITEM_USAGE',
            'REGISTER_EVIDENCE',
            'BLOCK',
            'CLOSE',
          );
          break;
        case ExecutionOrderStatus.BLOCKED:
          actions.push('UNBLOCK');
          break;
      }
    }

    // ── Supervisión ─────────────────────────────────────────────────────
    if (isSupervisor) {
      switch (order.status) {
        case ExecutionOrderStatus.CREATED:
          actions.push('ASSIGN');
          break;
        case ExecutionOrderStatus.ASSIGNED:
        case ExecutionOrderStatus.EN_ROUTE:
          actions.push('REASSIGN', 'CREATE_FOLLOW_UP');
          break;
        case ExecutionOrderStatus.IN_PROGRESS:
        case ExecutionOrderStatus.BLOCKED:
          actions.push('CREATE_FOLLOW_UP');
          break;
      }
    }

    return actions;
  }

  /**
   * Calcula el estado de sincronización de las proyecciones operativas
   * basado en los eventos del outbox asociados a la OT.
   *
   * - IN_SYNC: todos los eventos publicados (publishedAt no null).
   * - PENDING: hay eventos pendientes de publicación sin error.
   * - DIVERGED: reconciliación detectó discrepancia (reservado).
   * - FAILED: al menos un evento tiene lastError (consumer DLQ'd).
   */
  computeSyncState(
    outboxEvents: Array<{ publishedAt: string | Date | null; lastError: string | null }>,
  ): 'IN_SYNC' | 'PENDING' | 'DIVERGED' | 'FAILED' {
    if (outboxEvents.length === 0) {
      return 'IN_SYNC';
    }

    const hasFailed = outboxEvents.some((e) => e.lastError !== null);
    if (hasFailed) {
      return 'FAILED';
    }

    const hasPending = outboxEvents.some((e) => e.publishedAt === null);
    if (hasPending) {
      return 'PENDING';
    }

    return 'IN_SYNC';
  }

  /**
   * Obtiene los eventos de outbox para una OT y calcula syncState.
   */
  async getSyncState(
    executionOrderId: string,
  ): Promise<'IN_SYNC' | 'PENDING' | 'DIVERGED' | 'FAILED'> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const events = await qr.manager
        .createQueryBuilder(ExecutionOrderOutboxEvent, 'outbox')
        .select(['outbox.publishedAt', 'outbox.lastError'])
        .where('outbox.aggregateId = :aggregateId', { aggregateId: executionOrderId })
        .andWhere('outbox.tenantId = :tenantId', { tenantId })
        .getMany();

      return this.computeSyncState(
        events.map((e) => ({
          publishedAt: e.publishedAt,
          lastError: e.lastError,
        })),
      );
    });
  }

  private async transitionExecutionOrder(
    id: string,
    status: ExecutionOrderStatus,
    actor: JwtPayload,
    context: ExecutionOrderCommandContext | undefined,
    operation: string,
    input: { reasonCode?: string; resolutionCode?: string; note?: string },
    eventType: OperationalEventTypeV1,
  ): Promise<ExecutionOrder> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const order = await this.requireOrder(qr.manager, tenantId, id);
      const receipt = await this.beginCommand(
        qr.manager,
        tenantId,
        actor,
        operation,
        { executionOrderId: id, input },
        context,
      );
      if (receipt?.replay) return order;
      this.assertVersion(order, context?.ifMatch);
      this.assertMutable(order);

      const expectedVersion = order.version ?? 1;
      order.status = status;
      order.version = expectedVersion + 1;
      order.updatedByUserId = actor.sub;
      const saved = await this.persistOrderOptimistically(qr.manager, order, expectedVersion);
      const payload =
        eventType === 'ExecutionOrderBlockedV1'
          ? { reasonCode: input.reasonCode ?? 'UNSPECIFIED' }
          : { startedAt: new Date().toISOString() };
      await this.finishCommand(
        qr.manager,
        tenantId,
        actor,
        operation,
        id,
        saved.version,
        context,
        receipt,
        eventType,
        payload,
      );
      return saved;
    });
  }

  private async assertCustomerAcceptanceArtifactLinked(
    manager: EntityManager,
    tenantId: string,
    executionOrderId: string,
    artifactId: string,
  ): Promise<void> {
    // El contrato actual permite texto libre. Fail-closed aquí evita que un
    // valor no UUID llegue a una comparación contra una columna uuid y deja
    // explícita la deuda de contrato para R2.1.
    if (!UUID_PATTERN.test(artifactId)) {
      throw new UnprocessableEntityException({
        code: 'CUSTOMER_ACCEPTANCE_ARTIFACT_NOT_LINKED',
        message:
          'El artefacto de aceptación debe ser un MediaAsset UUID vinculado a una evidencia de esta OT.',
      });
    }

    const linkedEvidence = await manager.findOne(ExecutionOrderEvidence, {
      where: { mediaAssetId: artifactId, executionOrderId, tenantId },
    });
    if (!linkedEvidence) {
      throw new UnprocessableEntityException({
        code: 'CUSTOMER_ACCEPTANCE_ARTIFACT_NOT_LINKED',
        message: 'El artefacto de aceptación no está vinculado a una evidencia de esta OT.',
      });
    }

    if (
      linkedEvidence.evidenceType !== 'SIGNATURE' ||
      linkedEvidence.requirementKey !== CUSTOMER_SIGNATURE_REQUIREMENT_KEY
    ) {
      throw new UnprocessableEntityException({
        code: 'CUSTOMER_ACCEPTANCE_ARTIFACT_INVALID_TYPE',
        message:
          'El artefacto de aceptación debe corresponder a una evidencia SIGNATURE con requirementKey CUSTOMER_SIGNATURE.',
      });
    }

    if (linkedEvidence.assetStatus !== 'AVAILABLE') {
      throw new UnprocessableEntityException({
        code: 'CUSTOMER_ACCEPTANCE_ARTIFACT_NOT_AVAILABLE',
        message: 'El artefacto de aceptación debe tener un asset disponible.',
      });
    }
  }

  private assertEvidenceUploadIntentCurrent(intent: ExecutionOrderEvidenceUploadIntent): void {
    const allowedStatuses = new Set(['PENDING_ANALYSIS', 'AVAILABLE']);
    if (!allowedStatuses.has(intent.status)) {
      throw new ConflictException({
        code: 'EVIDENCE_UPLOAD_INTENT_NOT_ALLOWED',
        message: 'El intento de carga no está en un estado permitido para esta operación.',
      });
    }

    const expiresAt = intent.expiresAt;
    if (
      !(expiresAt instanceof Date) ||
      !Number.isFinite(expiresAt.getTime()) ||
      expiresAt.getTime() <= Date.now()
    ) {
      throw new ConflictException({
        code: 'EVIDENCE_UPLOAD_INTENT_EXPIRED',
        message: 'El intento de carga de evidencia no tiene una expiración futura válida.',
      });
    }
  }

  private assertEvidenceExpiresAt(expiresAt: string): void {
    if (typeof expiresAt !== 'string' || expiresAt.trim().length === 0) {
      throw new BadRequestException({
        code: 'EVIDENCE_EXPIRES_AT_INVALID',
        message: 'La evidencia debe incluir una expiración válida y futura.',
      });
    }

    const parsed = Date.parse(expiresAt);
    if (!Number.isFinite(parsed) || parsed <= Date.now()) {
      throw new BadRequestException({
        code: 'EVIDENCE_EXPIRES_AT_INVALID',
        message: 'La evidencia debe incluir una expiración válida y futura.',
      });
    }
  }

  private mapCloseResultToTaskStatus(result: ExecutionOrderResult): TaskStatus | null {
    switch (result) {
      case ExecutionOrderResult.EXECUTED:
      case ExecutionOrderResult.EXECUTED_WITH_OBSERVATIONS:
      case ExecutionOrderResult.REQUIRES_FOLLOW_UP:
        return TaskStatus.RESOLVED;
      case ExecutionOrderResult.NOT_EXECUTED:
        return TaskStatus.READY;
      case ExecutionOrderResult.CANCELLED:
      default:
        return null;
    }
  }

  /**
   * Reconstruye el requisito compartido desde la fila normalizada de plantilla.
   * La configuración JSONB se valida antes de llegar al snapshot de la OT;
   * nunca se persiste una forma parcialmente tipada para que el gate la adivine.
   */
  private mapTemplateRequirements(
    requirements: DbTemplateRequirement[],
  ): ExecutionOrderTemplateRequirement[] {
    const isOneOf = <T extends string>(value: unknown, values: readonly T[]): value is T =>
      typeof value === 'string' && values.some((candidate) => candidate === value);
    const invalidTemplate = (): never => {
      throw new ConflictException({
        code: 'TEMPLATE_INVALID',
        message: 'La plantilla activa contiene una configuración inválida.',
      });
    };
    const requireString = (config: Record<string, unknown>, key: string): string => {
      const value = config[key];
      return typeof value === 'string' && value.trim().length > 0 ? value : invalidTemplate();
    };

    return requirements.map((requirement) => {
      const config = requirement.config ?? {};
      const base = {
        key: requirement.key,
        label: requirement.label,
        required: requirement.required,
      };

      switch (requirement.kind) {
        case 'FIELD': {
          const fieldType = config.fieldType;
          if (!isOneOf(fieldType, ['TEXT', 'NUMBER', 'BOOLEAN', 'SELECT'] as const)) {
            return invalidTemplate();
          }
          const options = config.options;
          if (
            options !== undefined &&
            (!Array.isArray(options) || !options.every((item) => typeof item === 'string'))
          ) {
            return invalidTemplate();
          }
          return {
            ...base,
            kind: 'FIELD' as const,
            fieldType,
            ...(options === undefined ? {} : { options }),
          };
        }
        case 'ACTIVITY':
          return {
            ...base,
            kind: 'ACTIVITY' as const,
            activityType: requireString(config, 'activityType'),
          };
        case 'MEASUREMENT': {
          const measurement = config.measurement;
          if (!isOneOf(measurement, ['NUMBER', 'TEXT'] as const)) {
            return invalidTemplate();
          }
          const unit = config.unit;
          if (unit !== undefined && typeof unit !== 'string') {
            return invalidTemplate();
          }
          return {
            ...base,
            kind: 'MEASUREMENT' as const,
            measurement,
            ...(unit === undefined ? {} : { unit }),
          };
        }
        case 'EVIDENCE': {
          const evidenceType = config.evidenceType;
          if (!isOneOf(evidenceType, ['PHOTO', 'DOCUMENT', 'SIGNATURE'] as const)) {
            return invalidTemplate();
          }
          return { ...base, kind: 'EVIDENCE' as const, evidenceType };
        }
        case 'MATERIAL':
          return {
            ...base,
            kind: 'MATERIAL' as const,
            itemCategory: requireString(config, 'itemCategory'),
          };
        case 'COMPLIANCE':
          return {
            ...base,
            kind: 'COMPLIANCE' as const,
            policyKey: requireString(config, 'policyKey'),
          };
        default:
          return invalidTemplate();
      }
    });
  }

  async createEvidence(
    executionOrderId: string,
    evidenceType: string,
    notes: string | null,
    actor: JwtPayload,
  ): Promise<ExecutionOrderEvidence> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      return this.createEvidenceWithManager(
        qr.manager,
        tenantId,
        executionOrderId,
        evidenceType,
        null,
        notes,
        actor,
      );
    });
  }

  private async createEvidenceWithManager(
    manager: EntityManager,
    tenantId: string,
    executionOrderId: string,
    evidenceType: string,
    requirementKey: string | null,
    notes: string | null,
    actor: JwtPayload,
  ): Promise<ExecutionOrderEvidence> {
    await this.requireOrder(manager, tenantId, executionOrderId);
    return manager.save(
      ExecutionOrderEvidence,
      manager.create(ExecutionOrderEvidence, {
        executionOrderId,
        tenantId,
        evidenceType,
        requirementKey,
        fileName: null,
        notes,
        actorUserId: actor.sub,
      }),
    );
  }

  private toEvidenceContract(evidence: ExecutionOrderEvidence): ExecutionOrderEvidenceContract {
    const assetStatus = evidence.assetStatus as Exclude<
      ExecutionOrderEvidenceContract['assetStatus'],
      undefined
    >;
    const status: ExecutionOrderEvidenceContract['status'] =
      assetStatus === 'AVAILABLE'
        ? 'AVAILABLE'
        : assetStatus === 'REJECTED' || assetStatus === 'EXPIRED' || assetStatus === 'CLAIM_FAILED'
          ? 'REJECTED'
          : 'PENDING_ANALYSIS';

    return {
      id: evidence.id,
      mediaAssetId: evidence.mediaAssetId as string,
      evidenceType: evidence.evidenceType as ExecutionOrderEvidenceContract['evidenceType'],
      requirementKey: evidence.requirementKey ?? '',
      capturedAt: evidence.capturedAt ? evidence.capturedAt.toISOString() : null,
      receivedAt: evidence.createdAt.toISOString(),
      status,
      assetStatus,
      createdAt: evidence.createdAt.toISOString(),
    };
  }

  private toActivityContract(activity: ExecutionOrderActivity): ExecutionOrderActivityContract {
    return {
      id: activity.id,
      activityType: activity.activityType,
      description: activity.description,
      actorRef: activity.actorUserId
        ? { type: 'USER', id: activity.actorUserId }
        : { type: 'SYSTEM', id: 'system' },
      createdAt: activity.createdAt.toISOString(),
    };
  }

  private toItemUsageContract(usage: ExecutionOrderItemUsage): ExecutionOrderItemUsageContract {
    return {
      id: usage.id,
      itemId: usage.itemId,
      quantity: Number(usage.quantity),
      ...(usage.serialNumber ? { serial: usage.serialNumber } : {}),
      action: usage.action,
      finalDisposition: usage.finalDisposition,
      // Las filas heredadas sin intent conservan su identidad como referencia
      // estable de lectura; las nuevas siempre reciben inventoryRequestId.
      inventoryRequestId: usage.inventoryRequestId ?? usage.id,
      movementStatus: usage.movementStatus ?? 'PENDING',
      createdAt: usage.createdAt.toISOString(),
    };
  }

  private async requireOrder(
    manager: EntityManager,
    tenantId: string,
    id: string,
  ): Promise<ExecutionOrder> {
    const order = await manager.findOne(ExecutionOrder, { where: { id, tenantId } });
    if (!order) {
      throw new NotFoundException('OT de ejecución no encontrada');
    }
    return order;
  }

  private assertVersion(order: ExecutionOrder, ifMatch?: string): void {
    if (!ifMatch) return;
    const expected = Number.parseInt(ifMatch.replace(/^W\//u, '').replace(/^"|"$/gu, ''), 10);
    if (!Number.isInteger(expected) || expected !== (order.version ?? 1)) {
      throw new ConflictException({
        code: 'VERSION_CONFLICT',
        message: 'La OT fue modificada por otro actor.',
      });
    }
  }

  /**
   * Valida que la custodia declarada en un consumo (technicianCustodyId)
   * coincide con el técnico o cuadrilla asignados a la OT.
   *
   * Reglas:
   * - Si la OT tiene assignedTechnicianId, el custodio debe coincidir.
   * - Si la OT tiene assignedCrewId, el custodio debe ser la cuadrilla.
   * - Ninguna de las dos → rechazar (custodia no asignada).
   */
  private assertCustodyAssignment(
    order: ExecutionOrder,
    actorSub: string,
    custodyId: string,
  ): void {
    const assignedTech = order.assignedTechnicianId;
    const assignedCrew = order.assignedCrewId;

    // El custodio debe coincidir con el técnico o cuadrilla asignados
    const isTechCustody = assignedTech && custodyId === assignedTech;
    const isCrewCustody = assignedCrew && custodyId === assignedCrew;

    if (!isTechCustody && !isCrewCustody) {
      throw new ForbiddenException({
        code: 'CUSTODY_MISMATCH',
        message: 'La custodia declarada no corresponde al técnico o cuadrilla asignados a esta OT.',
      });
    }

    // Adicional: el actor debe ser el técnico asignado (o miembro de la cuadrilla)
    // Para técnico: el actor.sub debe coincidir con assignedTechnicianId
    if (assignedTech && actorSub !== assignedTech) {
      throw new ForbiddenException({
        code: 'CUSTODY_NOT_ASSIGNED',
        message: 'Solo el técnico asignado a esta OT puede registrar consumos desde su custodia.',
      });
    }
    // Para cuadrilla: la validación de membresía requiere un port WFM;
    // sin ese port, permitimos el paso pero registramos advertencia.
    if (assignedCrew && !assignedTech) {
      this.logger.warn(
        `Custodia de cuadrilla sin validación de membresía: crew=${assignedCrew} actor=${actorSub}`,
      );
    }
  }

  private assertMutable(order: ExecutionOrder): void {
    if (
      [
        ExecutionOrderStatus.COMPLETED,
        ExecutionOrderStatus.COMPLETED_WITH_OBSERVATIONS,
        ExecutionOrderStatus.NOT_EXECUTED,
        ExecutionOrderStatus.CANCELLED,
      ].includes(order.status)
    ) {
      throw new ConflictException({
        code: 'TERMINAL_EXECUTION_ORDER',
        message: 'La OT está en un estado terminal.',
      });
    }
  }

  /** UPDATE condicional para que dos cierres concurrentes no produzcan dos terminales. */
  private async persistOrderOptimistically(
    manager: EntityManager,
    order: ExecutionOrder,
    expectedVersion: number,
  ): Promise<ExecutionOrder> {
    if (typeof manager.createQueryBuilder !== 'function') {
      return manager.save(ExecutionOrder, order);
    }
    const queryBuilder = manager.createQueryBuilder();
    if (typeof queryBuilder.update !== 'function') {
      return manager.save(ExecutionOrder, order);
    }
    const result = await queryBuilder
      .update(ExecutionOrder)
      .set({
        status: order.status,
        result: order.result,
        version: order.version,
        startedAt: order.startedAt,
        closedAt: order.closedAt,
        closeNotes: order.closeNotes,
        updatedByUserId: order.updatedByUserId,
      })
      .where('id = :id AND tenant_id = :tenantId AND version = :expectedVersion', {
        id: order.id,
        tenantId: order.tenantId,
        expectedVersion,
      })
      .execute();
    if ((result.affected ?? 0) !== 1) {
      throw new ConflictException({
        code: 'VERSION_CONFLICT',
        message: 'La OT fue modificada por otro actor.',
      });
    }
    return order;
  }

  private async beginCommand(
    manager: EntityManager,
    tenantId: string,
    actor: JwtPayload,
    operation: string,
    payload: object,
    context?: ExecutionOrderCommandContext,
  ): Promise<IdempotencyReceipt | null> {
    if (!context?.requireIdempotency && !context?.idempotencyKey) return null;
    if (context.requireIdempotency && !context.idempotencyKey) {
      throw new BadRequestException({
        code: 'IDEMPOTENCY_KEY_REQUIRED',
        message: 'Idempotency-Key es obligatorio.',
      });
    }
    if (context.requireIdempotency && !context.ifMatch) {
      throw new BadRequestException({
        code: 'IF_MATCH_REQUIRED',
        message: 'If-Match es obligatorio.',
      });
    }
    if (!this.reliabilityService || !context.idempotencyKey) return null;
    return this.reliabilityService.beginIdempotent(
      manager,
      tenantId,
      operation,
      context.idempotencyKey,
      {
        tenantId,
        actorId: actor.sub,
        operation,
        payload,
      },
    );
  }

  private async finishCommand(
    manager: EntityManager,
    tenantId: string,
    actor: JwtPayload,
    operation: string,
    aggregateId: string,
    aggregateVersion: number,
    context: ExecutionOrderCommandContext | undefined,
    receipt: IdempotencyReceipt | null,
    eventType?: OperationalEventTypeV1,
    eventPayload: Record<string, unknown> = {},
  ): Promise<void> {
    if (!this.reliabilityService || !context || !receipt || receipt.replay) return;
    await this.reliabilityService.completeIdempotency(manager, receipt.intentId, {
      resourceRef: aggregateId,
      resultCode: 'ACCEPTED',
      resultStatus: 'COMPLETED',
      resourceVersion: aggregateVersion,
    });
    await this.reliabilityService.appendAuditIntent(manager, {
      tenantId,
      intentId: receipt.intentId,
      actorRef: actor.sub,
      operation,
      resourceRef: aggregateId,
      resultCode: 'ACCEPTED',
      correlationId: context.correlationId,
    });
    if (eventType) {
      const eventId = randomUUID();
      await this.reliabilityService.appendOutbox(manager, {
        eventId,
        tenantId,
        aggregateId,
        aggregateVersion,
        eventType,
        correlationId: context.correlationId,
        payload: {
          executionOrderId: aggregateId,
          intentId: receipt.intentId,
          eventId,
          ...eventPayload,
        },
      });
    }
  }

  private async generateExecutionOrderNumber(
    manager: Pick<EntityManager, 'query' | 'createQueryBuilder'>,
    tenantId: string,
  ): Promise<string> {
    const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const prefix = `OTE-${datePart}-`;

    await this.acquireExecutionOrderNumberLock(manager, tenantId, datePart);

    const latestOrder = await manager
      .createQueryBuilder(ExecutionOrder, 'executionOrder')
      .where('executionOrder.tenant_id = :tenantId', { tenantId })
      .andWhere('executionOrder.execution_order_number LIKE :prefix', { prefix: `${prefix}%` })
      .orderBy('executionOrder.execution_order_number', 'DESC')
      .getOne();

    const latestSequence = latestOrder?.executionOrderNumber.split('-').at(-1) ?? '000';
    const seq = (Number.parseInt(latestSequence, 10) + 1).toString().padStart(3, '0');
    return `${prefix}${seq}`;
  }

  private async acquireExecutionOrderNumberLock(
    manager: Pick<EntityManager, 'query'>,
    tenantId: string,
    datePart = new Date().toISOString().slice(0, 10).replace(/-/g, ''),
  ): Promise<void> {
    await manager.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
      `execution-order-number:${tenantId}:${datePart}`,
    ]);
  }

  private mapResultToStatus(result: ExecutionOrderResult): ExecutionOrderStatus {
    switch (result) {
      case ExecutionOrderResult.EXECUTED:
        return ExecutionOrderStatus.COMPLETED;
      case ExecutionOrderResult.EXECUTED_WITH_OBSERVATIONS:
      case ExecutionOrderResult.REQUIRES_FOLLOW_UP:
        return ExecutionOrderStatus.COMPLETED_WITH_OBSERVATIONS;
      case ExecutionOrderResult.NOT_EXECUTED:
        return ExecutionOrderStatus.NOT_EXECUTED;
      case ExecutionOrderResult.CANCELLED:
        return ExecutionOrderStatus.CANCELLED;
      default:
        return ExecutionOrderStatus.COMPLETED;
    }
  }
}
