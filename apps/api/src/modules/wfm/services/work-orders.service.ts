import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager, QueryFailedError } from 'typeorm';
import { TenantContext, runInTenantSchema, WorkOrder, WorkOrderTask } from '@iwana/db';
import {
  UserRole,
  WorkOrderStatus,
  WorkOrderPriority,
  WorkOrderSourceContext,
  WorkOrderTaskStatus,
  WfmWorkType,
  type ListResponse,
} from '@iwana/shared';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { buildPageMeta, clampLimit } from '../../../common/pagination';
import { clampPage } from '../../../common/pagination/clamp-page';
import {
  CreateWorkOrderEmbeddedInput,
  CreateWorkOrderEmbeddedSchema,
  TransitionWorkOrderInput,
  TransitionWorkOrderSchema,
} from '../dto';

/** Roles con visibilidad restringida (solo ven sus propios registros). */
const RESTRICTED_ROLES: UserRole[] = [UserRole.TECHNICIAN, UserRole.CONTRACTOR];

/** Estados terminales — una WO en este estado no puede avanzar excepto si la regla lo permite. */
const TERMINAL_WO_STATUSES: WorkOrderStatus[] = [WorkOrderStatus.DONE, WorkOrderStatus.CANCELLED];

const WORK_ORDER_CODE_RETRY_LIMIT = 3;

type UniqueConstraintDriverError = {
  code?: string;
  constraint?: string;
};

function isWorkOrderCodeUniqueViolation(
  error: unknown,
): error is QueryFailedError & { driverError: UniqueConstraintDriverError } {
  if (!(error instanceof QueryFailedError)) {
    return false;
  }

  const driverError = error.driverError as UniqueConstraintDriverError;
  return driverError.code === '23505' && driverError.constraint === 'uq_work_orders_tenant_code';
}

@Injectable()
export class WorkOrdersService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  /**
   * Genera un codigo unico para la Work Order en formato WO-YYYYMMDD-NNN.
   *
   * Concurrencia (defecto 8b): el consecutivo se calcula bajo un advisory lock
   * transaccional `pg_advisory_xact_lock` con clave derivada de (tenantId, fecha).
   * Serializa el COUNT+1 de creaciones concurrentes del mismo tenant y dia dentro
   * de la transaccion del llamador, eliminando la race sobre
   * `uq_work_orders_tenant_code`. El lock se libera al commit/rollback de la
   * transaccion, por lo que es compatible con pgBouncer transaction pooling.
   */
  async generateCode(
    manager: Pick<EntityManager, 'createQueryBuilder' | 'query'>,
    tenantId: string,
  ): Promise<string> {
    const now = new Date();
    const datePart = now.toISOString().slice(0, 10).replace(/-/g, '');
    const prefix = `WO-${datePart}-`;

    // Advisory lock transaccional por (tenant, dia) — serializa COUNT+1 + INSERT.
    await manager.query('SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))', [
      tenantId,
      datePart,
    ]);

    const { count } = await manager
      .createQueryBuilder()
      .select('COUNT(*)', 'count')
      .from('work_orders', 'wo')
      .where('wo.code LIKE :prefix', { prefix: `${prefix}%` })
      .andWhere('wo.tenant_id = :tenantId', { tenantId })
      .getRawOne();

    const seq = (parseInt(count, 10) + 1).toString().padStart(3, '0');
    return `${prefix}${seq}`;
  }

  /**
   * Crea una Work Order ligera con una tarea por defecto.
   * Se invoca desde ScheduleEventsService cuando el evento trae workOrder embebida.
   */
  async create(
    input: CreateWorkOrderEmbeddedInput,
    assignedUserId: string,
    createdBy: string,
  ): Promise<WorkOrder> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const validated = CreateWorkOrderEmbeddedSchema.parse(input);

    return runInTenantSchema(this.dataSource, schemaName, async (qr) =>
      this.createWithinManager(qr.manager, tenantId, validated, assignedUserId, createdBy),
    );
  }

  async createWithinManager(
    manager: EntityManager,
    tenantId: string,
    input: CreateWorkOrderEmbeddedInput,
    assignedUserId: string,
    createdBy: string,
    scheduledEventId?: string,
  ): Promise<WorkOrder> {
    // Defecto 8b: el 23505 aborta la transaccion PostgreSQL; reintentar sobre el
    // mismo EntityManager muere con "current transaction is aborted". Se usa un
    // savepoint por intento (patron MOD12 M2, supplier-profile.service.ts) para
    // restaurar un estado valido antes del siguiente consecutivo.
    const canSavepoint = typeof manager.query === 'function';

    for (let attempt = 0; attempt < WORK_ORDER_CODE_RETRY_LIMIT; attempt += 1) {
      const code = await this.generateCode(manager, tenantId);

      const wo = manager.create(WorkOrder, {
        tenantId,
        code,
        type: input.type ?? WfmWorkType.TECHNICAL_VISIT,
        status: WorkOrderStatus.OPEN,
        priority: input.priority ?? WorkOrderPriority.NORMAL,
        assignedUserId,
        scheduledEventId: scheduledEventId ?? null,
        sourceContext: input.sourceContext ?? WorkOrderSourceContext.MANUAL,
        sourceRef: input.sourceRef ?? null,
        summary: input.summary,
        notes: input.notes ?? null,
        createdBy,
      });

      if (canSavepoint) {
        await manager.query('SAVEPOINT work_order_code_attempt');
      }

      try {
        const saved = await manager.save(WorkOrder, wo);

        const task = manager.create(WorkOrderTask, {
          tenantId,
          workOrderId: saved.id,
          title: input.summary,
          status: WorkOrderTaskStatus.PENDING,
        });
        await manager.save(WorkOrderTask, task);

        if (canSavepoint) {
          await manager.query('RELEASE SAVEPOINT work_order_code_attempt');
        }

        return saved;
      } catch (error) {
        // Si dos transacciones compiten por el mismo consecutivo, reintentar con el siguiente.
        if (isWorkOrderCodeUniqueViolation(error)) {
          // Restaurar la transaccion del llamador antes de reintentar (solo 23505
          // por colision de consecutivo; el resto se propaga intacto).
          if (canSavepoint) {
            await manager.query('ROLLBACK TO SAVEPOINT work_order_code_attempt');
          }

          if (attempt === WORK_ORDER_CODE_RETRY_LIMIT - 1) {
            throw new ConflictException(
              'No fue posible generar un consecutivo unico para la Work Order',
            );
          }

          continue;
        }

        throw error;
      }
    }

    throw new ConflictException('No fue posible generar un consecutivo unico para la Work Order');
  }

  /** Lista Work Orders del tenant con filtro de propiedad para roles restringidos. */
  async list(
    actor: JwtPayload,
    filters: { page?: number; limit?: number } = {},
  ): Promise<ListResponse<WorkOrder>> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const cappedLimit = clampLimit(filters.limit);
    const { page, limit } = clampPage(filters.page ?? 1, cappedLimit);

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const qb = qr.manager
        .createQueryBuilder(WorkOrder, 'wo')
        .where('wo.tenant_id = :tenantId', { tenantId })
        .andWhere('wo.deleted_at IS NULL')
        .orderBy('wo.created_at', 'DESC')
        .addOrderBy('wo.id', 'DESC')
        .skip((page - 1) * limit)
        .take(limit);

      // Tecnicos y contratistas solo ven sus propias WO
      if (RESTRICTED_ROLES.includes(actor.role as UserRole)) {
        qb.andWhere('wo.assigned_user_id = :uid', { uid: actor.sub });
      }

      const [data, total] = await qb.getManyAndCount();
      return {
        data,
        meta: buildPageMeta({
          total,
          page,
          limit,
          randomAccess: true,
          sortableFields: [],
        }),
      };
    });
  }

  /** Obtiene una Work Order por id con verificacion de propiedad para roles restringidos. */
  async getById(id: string, actor: JwtPayload): Promise<WorkOrder> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const wo = await qr.manager.findOne(WorkOrder, {
        where: { id, tenantId },
      });

      if (!wo) {
        throw new NotFoundException(`Work Order ${id} no encontrada`);
      }

      if (RESTRICTED_ROLES.includes(actor.role as UserRole) && wo.assignedUserId !== actor.sub) {
        throw new ForbiddenException('No tienes acceso a esta Work Order');
      }

      return wo;
    });
  }

  /** Transiciona el estado de una Work Order, registrando cierre si aplica. */
  async transitionStatus(
    id: string,
    input: TransitionWorkOrderInput,
    actor: JwtPayload,
  ): Promise<WorkOrder> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const validated = TransitionWorkOrderSchema.parse(input);

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const wo = await qr.manager.findOne(WorkOrder, { where: { id, tenantId } });

      if (!wo) {
        throw new NotFoundException(`Work Order ${id} no encontrada`);
      }

      if (RESTRICTED_ROLES.includes(actor.role as UserRole) && wo.assignedUserId !== actor.sub) {
        throw new ForbiddenException('No tienes acceso a esta Work Order');
      }

      if (TERMINAL_WO_STATUSES.includes(wo.status as WorkOrderStatus)) {
        throw new BadRequestException(
          `La Work Order esta en estado terminal (${wo.status}) y no puede cambiar`,
        );
      }

      const updates: Partial<WorkOrder> = { status: validated.status };

      // Registrar cierre cuando la WO llega a estado terminal
      if (
        validated.status === WorkOrderStatus.DONE ||
        validated.status === WorkOrderStatus.CANCELLED
      ) {
        updates.closedBy = actor.sub;
        updates.closedAt = new Date();
      }

      await qr.manager.update(WorkOrder, { id, tenantId }, updates);
      return { ...wo, ...updates };
    });
  }
}
