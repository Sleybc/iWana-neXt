import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import {
  ExecutionOrder,
  ExecutionOrderActivity,
  ExecutionOrderEvidence,
  ExecutionOrderItemUsage,
  TenantContext,
  runInTenantSchema,
} from '@iwana/db';
import {
  ExecutionOrderResult,
  ExecutionOrderStatus,
  InventoryDisposition,
  TaskStatus,
  WfmWorkType,
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
import {
  ConsumeTechnicianCustodyInput,
  ExecutionOrderInventoryService,
} from './execution-order-inventory.service';
import {
  ASSURANCE_EXECUTION_ORDER_NOTIFIER_PORT,
  AssuranceExecutionOrderNotifierPort,
} from '../ports/assurance-execution-order-notifier.port';
import { TasksService } from './tasks.service';

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
    private readonly inventoryService: ExecutionOrderInventoryService,
    @Optional() private readonly tasksService?: TasksService,
    @Optional()
    @Inject(ASSURANCE_EXECUTION_ORDER_NOTIFIER_PORT)
    private readonly assuranceNotifier?: AssuranceExecutionOrderNotifierPort,
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
  ): Promise<ExecutionOrder> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const validated = StartExecutionOrderSchema.parse(input);

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const order = await this.requireOrder(qr.manager, tenantId, id);

      if (
        [
          ExecutionOrderStatus.COMPLETED,
          ExecutionOrderStatus.COMPLETED_WITH_OBSERVATIONS,
          ExecutionOrderStatus.NOT_EXECUTED,
          ExecutionOrderStatus.CANCELLED,
        ].includes(order.status)
      ) {
        throw new BadRequestException('La OT ya está cerrada y no puede iniciarse.');
      }

      order.status = ExecutionOrderStatus.IN_PROGRESS;
      order.startedAt = order.startedAt ?? new Date();
      order.updatedByUserId = actor.sub;
      const saved = await qr.manager.save(ExecutionOrder, order);

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

      return saved;
    });
  }

  async registerFieldWork(
    id: string,
    input: RegisterFieldWorkInput,
    actor: JwtPayload,
  ): Promise<ExecutionOrderActivity> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const validated = RegisterFieldWorkSchema.parse(input);

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const order = await this.requireOrder(qr.manager, tenantId, id);
      if (
        order.status === ExecutionOrderStatus.CREATED ||
        order.status === ExecutionOrderStatus.ASSIGNED
      ) {
        order.status = ExecutionOrderStatus.IN_PROGRESS;
        order.startedAt = order.startedAt ?? new Date();
        order.updatedByUserId = actor.sub;
        await qr.manager.save(ExecutionOrder, order);
      }

      return qr.manager.save(
        ExecutionOrderActivity,
        qr.manager.create(ExecutionOrderActivity, {
          executionOrderId: id,
          tenantId,
          activityType: validated.activityType,
          description: validated.description,
          actorUserId: actor.sub,
        }),
      );
    });
  }

  async registerItemUsage(
    id: string,
    input: RegisterExecutionOrderItemUsageInput,
    actor: JwtPayload,
  ): Promise<ExecutionOrderItemUsage> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const validated = RegisterExecutionOrderItemUsageSchema.parse(input);

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const order = await this.requireOrder(qr.manager, tenantId, id);
      if (
        order.status === ExecutionOrderStatus.CREATED ||
        order.status === ExecutionOrderStatus.ASSIGNED
      ) {
        order.status = ExecutionOrderStatus.IN_PROGRESS;
        order.startedAt = order.startedAt ?? new Date();
        order.updatedByUserId = actor.sub;
        await qr.manager.save(ExecutionOrder, order);
      }

      const movement = await this.inventoryService.consumeTechnicianCustody(
        {
          executionOrderId: id,
          itemId: validated.itemId,
          technicianCustodyId: validated.technicianCustodyId,
          quantity: validated.quantity,
          serialNumber: validated.serialNumber ?? null,
          subscriberId: order.subscriberId ?? null,
          action: validated.action,
          finalDisposition: validated.finalDisposition,
          stockMovementId: validated.stockMovementId ?? null,
        } satisfies ConsumeTechnicianCustodyInput,
        actor,
      );

      return qr.manager.save(
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
          stockMovementId: movement.stockMovementId,
          actorUserId: actor.sub,
        }),
      );
    });
  }

  async close(
    id: string,
    input: CloseExecutionOrderInput,
    actor: JwtPayload,
  ): Promise<ExecutionOrder> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const validated = CloseExecutionOrderSchema.parse(input);

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const order = await this.requireOrder(qr.manager, tenantId, id);
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

      if (requiresCustomerSignature && !validated.customerSignatureRef) {
        throw new BadRequestException(
          'Debes registrar la evidencia de firma del cliente para cerrar esta OT.',
        );
      }

      order.result = validated.result;
      order.status = this.mapResultToStatus(validated.result);
      order.closedAt = new Date();
      order.closeNotes = validated.closeNotes ?? null;
      order.updatedByUserId = actor.sub;
      const saved = await qr.manager.save(ExecutionOrder, order);

      if (validated.customerSignatureRef) {
        await this.createEvidenceWithManager(
          qr.manager,
          tenantId,
          order.id,
          'CUSTOMER_SIGNATURE',
          validated.customerSignatureRef,
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
