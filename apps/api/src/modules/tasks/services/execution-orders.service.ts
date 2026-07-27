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
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import {
  ExecutionOrder,
  ExecutionOrderActivity,
  ExecutionOrderEvidence,
  ExecutionOrderItemUsage,
  ExecutionOrderOutboxEvent,
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
} from '@iwana/shared';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
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
   * ABAC server-side. La OT se carga dentro del schema del JWT; nunca se
   * confía en un site/tenant enviado por el cliente.
   */
  async assertActorAccess(id: string, actor: JwtPayload, write: boolean): Promise<void> {
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
      // Contractors/technicians only act when explicitly assigned. Supervisors
      // may read for coordination but never write execution evidence/activities.
      if (!assigned && (write || !supervisor)) {
        throw new NotFoundException('OT de ejecución no encontrada');
      }
    });
  }

  async listActivities(executionOrderId: string): Promise<ExecutionOrderActivity[]> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();

    return runInTenantSchema(this.dataSource, schemaName, async (qr) =>
      qr.manager
        .createQueryBuilder(ExecutionOrderActivity, 'activity')
        .where('activity.execution_order_id = :executionOrderId', { executionOrderId })
        .andWhere('activity.tenant_id = :tenantId', { tenantId })
        .orderBy('activity.created_at', 'ASC')
        .getMany(),
    );
  }

  async listItemUsage(executionOrderId: string): Promise<ExecutionOrderItemUsage[]> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();

    return runInTenantSchema(this.dataSource, schemaName, async (qr) =>
      qr.manager
        .createQueryBuilder(ExecutionOrderItemUsage, 'usage')
        .where('usage.execution_order_id = :executionOrderId', { executionOrderId })
        .andWhere('usage.tenant_id = :tenantId', { tenantId })
        .orderBy('usage.created_at', 'ASC')
        .getMany(),
    );
  }

  async createFromScheduling(
    input: CreateExecutionOrderFromSchedulingInput,
    actor: JwtPayload,
  ): Promise<ExecutionOrder> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();

    return runInTenantSchema(this.dataSource, schemaName, async (qr) =>
      this.createFromSchedulingWithManager(qr.manager, tenantId, input, actor),
    );
  }

  async createFromSchedulingWithManager(
    manager: EntityManager,
    tenantId: string,
    input: CreateExecutionOrderFromSchedulingInput,
    actor: JwtPayload,
  ): Promise<ExecutionOrder> {
    const existing = await manager.findOne(ExecutionOrder, {
      where: {
        tenantId,
        scheduleEventId: input.scheduleEventId,
      },
    });

    if (existing) {
      return existing;
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

      if (validated.notes) {
        await qr.manager.save(
          ExecutionOrderActivity,
          qr.manager.create(ExecutionOrderActivity, {
            executionOrderId: order.id,
            tenantId,
            activityType: 'START',
            description: validated.notes,
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

      const usage = await qr.manager.save(
        ExecutionOrderItemUsage,
        qr.manager.create(ExecutionOrderItemUsage, {
          executionOrderId: id,
          tenantId,
          itemId: validated.itemId,
          technicianCustodyId: validated.technicianCustodyId,
          quantity: String(validated.quantity),
          serialNumber: validated.serialNumber ?? null,
          action: validated.action,
          finalDisposition: validated.finalDisposition,
          stockMovementId: null,
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
          inventoryRequestId: receipt?.intentId ?? usage.id,
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
          'CUSTOMER_SIGNATURE',
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
      capturedAt?: string;
    },
    actor: JwtPayload,
    context?: ExecutionOrderCommandContext,
  ): Promise<ExecutionOrderEvidence> {
    throw new ServiceUnavailableException({
      code: 'MEDIA_ASSET_BOUNDARY_UNAVAILABLE',
      message: 'La evidencia requiere validación de Media antes de enlazarse a la OT.',
    });
    /* istanbul ignore next -- boundary is intentionally fail-closed until MOD34 port exists. */
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const order = await this.requireOrder(qr.manager, tenantId, id);
      this.assertMutable(order);
      const receipt = await this.beginCommand(
        qr.manager,
        tenantId,
        actor,
        'execution_order.evidence',
        { executionOrderId: id, input },
        context,
      );
      if (receipt?.replay && receipt.resourceRef)
        return (await qr.manager.findOne(ExecutionOrderEvidence, {
          where: { id: receipt.resourceRef, tenantId },
        })) as ExecutionOrderEvidence;
      const expectedVersion = order.version ?? 1;
      order.version = expectedVersion + 1;
      order.updatedByUserId = actor.sub;
      await this.persistOrderOptimistically(qr.manager, order, expectedVersion);
      const evidence = await this.createEvidenceWithManager(
        qr.manager,
        tenantId,
        id,
        input.evidenceType,
        input.mediaAssetId,
        actor,
      );
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
      return evidence;
    });
  }

  async createEvidenceAssetReceipt(
    id: string,
    input: { mediaAssetId: string; mimeType?: string },
    _actor: JwtPayload,
  ): Promise<{ intentId: string; mediaAssetId: string; status: 'PENDING_ANALYSIS' }> {
    void id;
    void input;
    throw new ServiceUnavailableException({
      code: 'MEDIA_ASSET_BOUNDARY_UNAVAILABLE',
      message: 'La carga de evidencia no está disponible hasta validar el asset en Media.',
    });
  }

  async getEvidenceAssetReceipt(
    id: string,
    mediaAssetId: string,
  ): Promise<{ mediaAssetId: string; status: 'PENDING_ANALYSIS' }> {
    void id;
    void mediaAssetId;
    throw new ServiceUnavailableException({
      code: 'MEDIA_ASSET_BOUNDARY_UNAVAILABLE',
      message: 'El asset de evidencia no puede consultarse sin el boundary de Media.',
    });
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
        fileName: null,
        notes,
        actorUserId: actor.sub,
      }),
    );
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
    manager: Pick<EntityManager, 'createQueryBuilder'>,
    tenantId: string,
  ): Promise<string> {
    const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const prefix = `OTE-${datePart}-`;

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
