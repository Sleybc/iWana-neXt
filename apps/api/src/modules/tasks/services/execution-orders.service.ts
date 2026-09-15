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
import { createHash, randomUUID } from 'node:crypto';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, DeepPartial, EntityManager, QueryFailedError } from 'typeorm';
import {
  ExecutionOrder,
  ExecutionOrderActivity,
  ExecutionOrderEvidence,
  ExecutionOrderEvidenceUploadIntent,
  ExecutionOrderInboxEvent,
  ExecutionOrderItemUsage,
  ExecutionOrderOutboxEvent,
  ExecutionOrderStatusTransition,
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
  WorkOrderSourceContext,
  UserRole,
  OperationalEventTypeV1,
  type DispatchExecutionOrderReceipt,
  type ExecutionOrderAllowedAction,
  type ExecutionOrderCompletionView,
  type ExecutionOrderRequirementStatus,
  type ExecutionOrderTemplateRequirement,
  type EvidenceAssetReceipt,
  type ExecutionOrderEvidence as ExecutionOrderEvidenceContract,
  type ExecutionOrderActivity as ExecutionOrderActivityContract,
  type ExecutionOrderItemUsage as ExecutionOrderItemUsageContract,
  type ExecutionOrderListItem,
  type ListExecutionOrdersResponse,
  type Page,
} from '@iwana/shared';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { applySort, buildPageMeta, clampPage } from '../../../common/pagination';
import {
  CloseExecutionOrderInput,
  CloseExecutionOrderSchema,
  DispatchExecutionOrderInput,
  ListExecutionOrdersQueryInput,
  ListExecutionOrdersQuerySchema,
  RegisterExecutionOrderItemUsageInput,
  RegisterExecutionOrderItemUsageSchema,
  RegisterFieldWorkInput,
  RegisterFieldWorkSchema,
  StartExecutionOrderInput,
  StartExecutionOrderSchema,
  RedriveExecutionOrderEventInput,
} from '../dto/execution-orders.dto';
import { ExecutionOrderInventoryService } from './execution-order-inventory.service';
import { ExecutionOrderTemplatesService } from './execution-order-templates.service';
import { ClosureGateEvaluatorService } from './closure-gate-evaluator.service';
import {
  ASSURANCE_EXECUTION_ORDER_NOTIFIER_PORT,
  AssuranceExecutionOrderNotifierPort,
} from '../ports/assurance-execution-order-notifier.port';
import { TasksService } from './tasks.service';
import { UsersService } from '../../users/users.service';
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
import { OrganizationOperationalAccessPort } from '../../organization/ports/organization-operational-access.port';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CUSTOMER_SIGNATURE_REQUIREMENT_KEY = 'CUSTOMER_SIGNATURE';
const EXECUTION_ORDER_NUMBER_RETRY_LIMIT = 3;
const EXECUTION_ORDER_UNIQUE_CONSTRAINTS = new Set([
  'uq_execution_orders_tenant_number',
  'uq_execution_orders_tenant_schedule_event',
]);
/**
 * MOD11 E1 (ADR-091 §D2 / ADR-076 §D1): la unicidad activa por eje de origen
 * vive en `uq_execution_orders_active_origin_unique` (migración 135), réplica
 * del patrón `idx_visit_requests_active_origin_unique` (035). Se mantiene
 * FUERA de `EXECUTION_ORDER_UNIQUE_CONSTRAINTS` a propósito: una violación de
 * este índice nunca es una colisión de consecutivo y jamás debe entrar al
 * reintento de número de `createFromScheduling` — es un 409 de trabajo
 * duplicado con su propio camino (`isExecutionOrderOriginUniqueViolation`).
 */
const EXECUTION_ORDER_ACTIVE_ORIGIN_UNIQUE = 'uq_execution_orders_active_origin_unique';

/**
 * MOD11 E1: estados que la guarda de origen considera terminales. Es el mismo
 * conjunto del predicado del índice parcial de la migración 135: una OT en
 * cualquiera de ellos libera su tupla de origen para trabajo futuro
 * (reinstalación tras cancelar/cerrar, ADR-076 regla 9). BLOCKED es trabajo
 * vivo —se puede desbloquear— y sigue deduplicando.
 */
const TERMINAL_ORIGIN_STATUSES = new Set([
  ExecutionOrderStatus.CANCELLED,
  ExecutionOrderStatus.COMPLETED,
  ExecutionOrderStatus.COMPLETED_WITH_OBSERVATIONS,
  ExecutionOrderStatus.NOT_EXECUTED,
]);
/**
 * Roles con alcance restringido en el listado de OT (réplica de
 * `RESTRICTED_ROLES` de `TasksService.list()`).
 */
const LIST_RESTRICTED_ROLES: UserRole[] = [UserRole.TECHNICIAN, UserRole.CONTRACTOR];

/**
 * Campos ordenables del listado de OT. Vacío en v1 (ADR-065 §22-bis punto 1:
 * la lista vacía es estado conforme); poblarla exige medición de p95 y
 * autorización de AI-EM-ARCH. Con la lista vacía, `applySort` ignora
 * `sortBy`/`sortDir` y se conserva el orden por defecto.
 */
const EXECUTION_ORDER_LIST_SORTABLE_FIELDS: string[] = [];

const EXECUTION_ORDER_LIST_DEFAULT_LIMIT = 20;

/** ADR-068 §Eventos mínimos: solo eventos cuyo owner es MOD11 son redriveables. */
const REDRIVE_ALLOWED_EVENT_TYPES = new Set<OperationalEventTypeV1>([
  'ExecutionOrderStartedV1',
  'ExecutionOrderBlockedV1',
  'InventoryConsumptionRequestedV1',
  'ExecutionOrderClosedV1',
  // MOD11 T2: cancelación y anulación son de la misma familia que el cierre
  // (hechos terminales de MOD11 con idempotencia por inbox del consumidor).
  'ExecutionOrderCancelledV1',
  'ExecutionOrderAnnulledV1',
  'ExecutionOrderFollowUpRequiredV1',
]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

const isOneOf = <T extends string>(value: unknown, values: readonly T[]): value is T =>
  typeof value === 'string' && values.some((candidate) => candidate === value);

function isTemplateRequirement(value: unknown): value is ExecutionOrderTemplateRequirement {
  if (
    !isRecord(value) ||
    !isNonEmptyString(value.key) ||
    typeof value.label !== 'string' ||
    typeof value.required !== 'boolean' ||
    typeof value.kind !== 'string'
  ) {
    return false;
  }

  switch (value.kind) {
    case 'FIELD':
      return (
        isOneOf(value.fieldType, ['TEXT', 'NUMBER', 'BOOLEAN', 'SELECT'] as const) &&
        (value.options === undefined ||
          (Array.isArray(value.options) && value.options.every((item) => typeof item === 'string')))
      );
    case 'ACTIVITY':
      return isNonEmptyString(value.activityType);
    case 'MEASUREMENT':
      return (
        isOneOf(value.measurement, ['NUMBER', 'TEXT'] as const) &&
        (value.unit === undefined || typeof value.unit === 'string')
      );
    case 'EVIDENCE':
      return isOneOf(value.evidenceType, ['PHOTO', 'DOCUMENT', 'SIGNATURE'] as const);
    case 'MATERIAL': {
      if (!isNonEmptyString(value.itemCategory)) return false;
      // Aditivo v1.2 (MOD11 T1 B1, spec §4.3): la disposición declarada es
      // opcional. Si está presente debe ser un valor conocido del enum; un
      // valor desconocido invalida el requisito y el snapshot entero se
      // rechaza (fail-closed: la OT queda incerrable, nunca mal cerrable).
      // Ausente = comportamiento v1.1 (retrocompatible).
      if (value.finalDisposition === undefined) return true;
      return (
        typeof value.finalDisposition === 'string' &&
        (Object.values(InventoryDisposition) as string[]).includes(value.finalDisposition)
      );
    }
    case 'COMPLIANCE':
      return isNonEmptyString(value.policyKey);
    default:
      return false;
  }
}

export function readTemplateRequirementsSnapshot(
  value: unknown,
): ExecutionOrderTemplateRequirement[] | null {
  return Array.isArray(value) && value.every(isTemplateRequirement) ? value : null;
}

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

/**
 * MOD11 E1: detecta la violación del índice único parcial de origen
 * (`uq_execution_orders_active_origin_unique`, migración 135) en cualquiera
 * de las dos formas en que TypeORM la expone —`error.code/constraint` o
 * `error.driverError.code/constraint`—, igual que `createVisitRequest` lo
 * hace con `idx_visit_requests_active_origin_unique`.
 */
function isExecutionOrderOriginUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const candidate = error as { code?: string; constraint?: string; driverError?: unknown };
  const driverError = candidate.driverError as { code?: string; constraint?: string } | undefined;

  return (
    (candidate.code === '23505' || driverError?.code === '23505') &&
    (candidate.constraint === EXECUTION_ORDER_ACTIVE_ORIGIN_UNIQUE ||
      driverError?.constraint === EXECUTION_ORDER_ACTIVE_ORIGIN_UNIQUE)
  );
}

export interface CreateExecutionOrderFromSchedulingInput {
  visitRequestId?: string | null;
  /**
   * MOD11 E2: el vínculo de agenda deja de ser obligatorio en el input del
   * puerto. El camino de agenda sigue pasándolo siempre (comportamiento
   * intacto, incluida la idempotencia por evento); el despacho pasa nulo y la
   * deduplicación vive solo en la guarda de origen.
   */
  scheduleEventId?: string | null;
  organizationSiteId?: string | null;
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
  plannedWindowStartAt?: string | null;
  plannedWindowEndAt?: string | null;
}

@Injectable()
export class ExecutionOrdersService {
  private readonly logger = new Logger(ExecutionOrdersService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @Optional() private readonly inventoryService?: ExecutionOrderInventoryService,
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
    @Optional()
    @Inject(OrganizationOperationalAccessPort)
    private readonly organizationOperationalAccessPort?: OrganizationOperationalAccessPort,
    // SEC-D4: etiqueta del técnico asignado en la bandeja. Opcional para los
    // specs que construyen el servicio sin el módulo de usuarios; con el
    // provider real disponible (TasksModule importa UsersModule) se resuelve
    // con un lookup batch por página.
    @Optional()
    private readonly usersService?: UsersService,
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
      const snapshot = readTemplateRequirementsSnapshot(order.templateRequirementsSnapshot);

      if (!snapshot || !this.closureGateEvaluator) {
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
          .select(['evidence.evidenceType', 'evidence.requirementKey', 'evidence.assetStatus'])
          .where('evidence.execution_order_id = :executionOrderId', { executionOrderId })
          .andWhere('evidence.tenant_id = :tenantId', { tenantId })
          .getMany(),
        qr.manager
          .createQueryBuilder(ExecutionOrderItemUsage, 'usage')
          // Proyección explícita (MOD11 T1 B1, trampa §3): `finalDisposition`
          // debe viajar al contexto del evaluador; sin ella el predicado de
          // disposición sería siempre falso y el requisito quedaría
          // permanentemente pendiente (defecto invertido).
          .select(['usage.itemId', 'usage.finalDisposition'])
          .where('usage.execution_order_id = :executionOrderId', { executionOrderId })
          .andWhere('usage.tenant_id = :tenantId', { tenantId })
          .getMany(),
      ]);

      const evaluation = this.closureGateEvaluator.evaluate(snapshot, {
        activities: activities.map((activity) => ({ activityType: activity.activityType })),
        evidences: evidences.map((evidence) => ({
          evidenceType: evidence.evidenceType,
          requirementKey: evidence.requirementKey ?? '',
        })),
        itemUsages: await this.buildMaterialEvaluationUsages(snapshot, itemUsages),
        // A4-bis (spec §2.1): el contexto se completa con todo lo persistido.
        // `fieldData` y `measurements` no tienen fuente persistida —deuda activa
        // spec §10.1/§10.2 (`RegisterFieldWorkSchema` es estricto y la actividad
        // no guarda mediciones)—: se pasan vacíos para que FIELD/MEASUREMENT
        // muestren su estado real (pendiente + razón) en vez de indeterminado.
        fieldData: {},
        measurements: [],
        // La misma fuente que el cierre considera aceptación válida
        // (`assertCustomerAcceptanceArtifactLinked`): evidencia SIGNATURE con
        // requirementKey CUSTOMER_SIGNATURE y assetStatus AVAILABLE vinculada
        // a la OT. La comparación estricta contra 'AVAILABLE' es fail-closed
        // (assetStatus puede ser null): coincide con el cierre.
        hasCustomerAcceptance: evidences.some(
          (evidence) =>
            evidence.evidenceType === 'SIGNATURE' &&
            (evidence.requirementKey ?? '') === CUSTOMER_SIGNATURE_REQUIREMENT_KEY &&
            evidence.assetStatus === 'AVAILABLE',
        ),
        // Sin fuente persistida de artefactos de política; el evaluador lo
        // trata como ausente (COMPLIANCE puede satisfacerse vía aceptación).
        complianceArtifacts: [],
      });
      const total = evaluation.totalRequired;
      const completed = evaluation.satisfiedRequired;
      const progress = total === 0 ? 0 : Math.round((completed / total) * 100);
      const requirements: ExecutionOrderRequirementStatus[] = evaluation.allEvaluations.map(
        (item) => ({
          requirementId: item.requirementId,
          label: item.label,
          kind: item.kind,
          satisfied: item.satisfied,
          ...(item.reason !== undefined ? { reason: item.reason } : {}),
        }),
      );

      return { progress, completed, total, requirements };
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
    requiresSupervisionScope = false,
  ): Promise<void> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    await runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const order = await this.requireOrder(qr.manager, tenantId, id);
      // La membresía/vigencia de una cuadrilla pertenece a WFM y no se puede
      // inferir comparando crewId con userId. Hasta disponer del port tipado,
      // una OT asignada a CREW queda fuera del alcance de ejecución.
      const assigned = order.assignedTechnicianId === actor.sub;
      const isUnassigned = !order.assignedTechnicianId && !order.assignedCrewId;
      const isTechnician = [UserRole.TECHNICIAN, UserRole.CONTRACTOR].includes(
        actor.role as UserRole,
      );
      const isUnassignedPool =
        isUnassigned && isTechnician && order.status !== ExecutionOrderStatus.CREATED;
      const supervisor = [UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT].includes(
        actor.role as UserRole,
      );
      if (requiresSupervisionScope) {
        await this.assertSupervisionScope(qr.manager, tenantId, order, actor);
        return;
      }
      // Supervisores pueden leer y ejecutar operaciones de coordinación, pero
      // nunca escribir sobre la ejecución técnica, aunque estén asignados.
      if (requiresTechnicalExecution) {
        const canExecuteTechnically = (assigned && !supervisor) || isUnassignedPool;
        if (!canExecuteTechnically) {
          throw new NotFoundException('OT de ejecución no encontrada');
        }
        return;
      }

      // Contractors/technicians only act when explicitly assigned. Supervisors
      // may read and coordinate without estar asignados a la OT.
      // Permitir a técnicos leer el pool sin asignar (excepto CREATED) para poder reclamarla.
      if (!assigned && !supervisor) {
        if (!isUnassignedPool) {
          throw new NotFoundException('OT de ejecución no encontrada');
        }
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

  /**
   * Bandeja de OT de ejecución (MOD11 F1, spec §4.7.1).
   *
   * - Una sola query + count sobre el QB ya scopeado: el `total` del pie
   *   refleja el alcance del actor (ADR-065 §15).
   * - Orden por defecto `planned_window_start_at DESC, id DESC`; el desempate
   *   por `id` es obligatorio (ADR-065 §12). Índice 130.
   * - Proyección mínima ADR-067: NUNCA invoca `getCompletion`, `getSyncState`
   *   ni `getInventoryReconciliation` (N+1 por fila; causa de rechazo).
   * - Scoping D1 (v1 sin cuadrilla): réplica exacta de la semántica de lectura
   *   de `assertActorAccess` — asignada al técnico o pool sin asignar distinto
   *   de `CREATED`. Ninguna fila listada da 404 al abrirse.
   * - SEC-D4: `assignee.displayLabel` (opcional en el contrato v1) se resuelve
   *   con UN lookup batch por página sobre los IDs de técnicos de la página,
   *   nunca por fila (mismo patrón que `responsibleLabel` en `TasksService`).
   */
  async list(
    query: ListExecutionOrdersQueryInput,
    actor: JwtPayload,
  ): Promise<ListExecutionOrdersResponse> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const validated = ListExecutionOrdersQuerySchema.parse(query);
    const { page, limit } = clampPage(
      validated.page ?? 1,
      validated.limit ?? EXECUTION_ORDER_LIST_DEFAULT_LIMIT,
    );

    const result = await runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const qb = qr.manager
        .createQueryBuilder(ExecutionOrder, 'order')
        .where('order.tenant_id = :tenantId', { tenantId })
        // DEF-1: orden por defecto + desempate por id para offset estable.
        .orderBy('order.planned_window_start_at', 'DESC')
        .addOrderBy('order.id', 'DESC');

      if (LIST_RESTRICTED_ROLES.includes(actor.role as UserRole)) {
        qb.andWhere(
          '(order.assigned_technician_id = :actorSub OR ' +
            '(order.assigned_technician_id IS NULL AND order.assigned_crew_id IS NULL ' +
            'AND order.status <> :poolExcludedStatus))',
          { actorSub: actor.sub, poolExcludedStatus: ExecutionOrderStatus.CREATED },
        );
      }

      // MOD11 T2 (ADR-090 §D3): la OT anulada sale de la bandeja operativa
      // para todos los roles y permanece consultable por id. No es scoping
      // del pool reclamable (que ya la excluía por estado): es la salida
      // de bandeja de un registro que no debió existir.
      qb.andWhere('order.is_annulled = :annulledExcluded', { annulledExcluded: false });

      if (validated.status) {
        qb.andWhere('order.status = :status', { status: validated.status });
      }
      if (validated.result) {
        qb.andWhere('order.result = :result', { result: validated.result });
      }
      if (validated.workType) {
        qb.andWhere('order.work_type = :workType', { workType: validated.workType });
      }
      if (validated.assigneeId) {
        qb.andWhere(
          '(order.assigned_technician_id = :assigneeId OR order.assigned_crew_id = :assigneeId)',
          { assigneeId: validated.assigneeId },
        );
      }
      if (validated.organizationSiteId) {
        qb.andWhere('order.organization_site_id = :organizationSiteId', {
          organizationSiteId: validated.organizationSiteId,
        });
      }
      if (validated.ticketId) {
        qb.andWhere('order.ticket_id = :ticketId', { ticketId: validated.ticketId });
      }
      if (validated.taskId) {
        qb.andWhere('order.task_id = :taskId', { taskId: validated.taskId });
      }
      if (validated.visitRequestId) {
        qb.andWhere('order.visit_request_id = :visitRequestId', {
          visitRequestId: validated.visitRequestId,
        });
      }
      if (validated.windowFrom) {
        qb.andWhere('order.planned_window_start_at >= :windowFrom', {
          windowFrom: validated.windowFrom,
        });
      }
      if (validated.windowTo) {
        qb.andWhere('order.planned_window_start_at <= :windowTo', {
          windowTo: validated.windowTo,
        });
      }

      qb.skip((page - 1) * limit).take(limit);

      // Orden dinámico tras el default; con la lista blanca vacía conserva el
      // default y reporta sort null (ADR-065 §22-bis).
      const sortResult = applySort(
        qb,
        EXECUTION_ORDER_LIST_SORTABLE_FIELDS,
        validated.sortBy,
        validated.sortDir,
      );

      const [orders, total] = await qb.getManyAndCount();
      return { orders, total, sortResult };
    });

    // SEC-D4: una sola query de etiquetas por página (nunca una por fila).
    const assigneeLabels = await this.resolveAssigneeLabels(result.orders);

    return {
      data: result.orders.map((order) => this.toListItem(order, assigneeLabels)),
      meta: buildPageMeta({
        total: result.total,
        page,
        limit,
        randomAccess: true,
        sortableFields: EXECUTION_ORDER_LIST_SORTABLE_FIELDS,
        sortBy: result.sortResult.appliedSortBy ?? undefined,
        sortDir: result.sortResult.appliedSortDir ?? undefined,
      }),
    };
  }

  /**
   * Lookup batch de etiquetas de los técnicos asignados de la página (SEC-D4).
   *
   * - Solo IDs de técnicos: los IDs de cuadrilla pertenecen a WFM y no son
   *   usuarios del directorio; su fila queda sin `displayLabel`.
   * - Una única query por página vía `UsersService.findDisplayLabelsByIds`
   *   (servicio del módulo de usuarios ya importado por TasksModule), que
   *   además filtra IDs no-UUID legacy. Nunca una query por fila.
   * - Sin `UsersService` inyectado (specs aislados) el mapa queda vacío y el
   *   campo opcional se omite; el listado no depende de este lookup.
   */
  private async resolveAssigneeLabels(orders: ExecutionOrder[]): Promise<Map<string, string>> {
    const technicianIds = [
      ...new Set(
        orders
          .map((order) => order.assignedTechnicianId)
          .filter((id): id is string => typeof id === 'string' && id.length > 0),
      ),
    ];

    if (technicianIds.length === 0 || !this.usersService) {
      return new Map();
    }

    return this.usersService.findDisplayLabelsByIds(technicianIds);
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
        // MOD11 E1: una violación del índice de origen que escape hasta aquí
        // (escritura directa en base evadiendo la guarda de servicio) nunca es
        // colisión de consecutivo: se traduce a 409 de trabajo duplicado y no
        // entra al reintento de número. El ConflictException de la guarda
        // interna pasa intacto (no es QueryFailedError).
        if (isExecutionOrderOriginUniqueViolation(error)) {
          throw new ConflictException({
            error: 'DUPLICATE_ACTIVE_WORK',
            message: 'Ya existe una OT activa para el mismo origen y tipo de trabajo.',
          });
        }
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

  /**
   * MOD11 E2 — puerta de despacho (ADR-091 §D1, spec §3.1/§3.6.1/§3.8).
   *
   * La OT nace de origen + tipo de trabajo + sitio, sin cita ni técnico, en
   * `CREATED`. Delega en `createFromSchedulingWithManager` con evento y
   * ventana nulos: despacho y agenda comparten núcleo, guarda de unicidad y
   * orden de locks (número → origen). No crea `ScheduleEvent` ni reserva
   * capacidad —el chequeo de conflicto de MOD09 corre en E3, sin excepción—.
   *
   * Defensa en el boundary HTTP (`DispatchExecutionOrderSchema`, strict):
   * ventana, evento y responsable no existen en el input del despacho, así
   * que el despacho no puede usarse como agenda por otra puerta (riesgo R1).
   *
   * Decisiones §3.8 (ver informe E2):
   * - `PROVISIONING` se retira: sin camino, se rechaza con
   *   `ORIGIN_WITHOUT_PATH`. El valor sigue en el enum por compatibilidad
   *   (sin DDL en E2); su baja del enum y de la UI es deuda de producto.
   * - Salto `BILLING`/`SYSTEM`→`TASKS`: se acepta la pérdida a un salto. La
   *   trazabilidad vive en `taskId` (= `originRefId` cuando el origen es
   *   `TASKS`) hacia la tarea, que conserva su propio `originContext` de
   *   primer nivel. Extender el enum de origen habría exigido DDL y reabierto
   *   ADR-076 sin necesidad operativa: la unidad de deduplicación del campo
   *   es la tarea, no el documento aguas arriba.
   *
   * MOD11 H1 — alcance de supervisión (spec §3.6.1, ADR-091 §D6 c.3): el
   * despacho valida con `assertSupervisionScope` que el actor supervisa la
   * sede declarada, con el mismo mecanismo fail-closed (404) de los otros
   * comandos de coordinación. La comprobación corre ANTES de delegar en el
   * núcleo: un rechazo nunca inserta, así que el origen nunca queda quemado
   * (el índice de E1 no lleva sede y un inserto denegado bloquearía el
   * despacho legítimo con `DUPLICATE_ACTIVE_WORK`).
   */
  async dispatchFromCoordination(
    input: DispatchExecutionOrderInput,
    actor: JwtPayload,
  ): Promise<DispatchExecutionOrderReceipt> {
    // Cinturón además del schema: el servicio nunca despacha un origen sin
    // camino aunque el boundary se eluda en llamadas internas. El cast cubre
    // al llamante interno que eluda el schema con un contexto fuera de vía.
    const declaredContext = input.originContext as WorkOrderSourceContext;
    if (declaredContext === WorkOrderSourceContext.PROVISIONING) {
      throw new BadRequestException({
        code: 'ORIGIN_WITHOUT_PATH',
        message:
          'PROVISIONING no tiene camino de despacho: retire la etiqueta o abra consulta de producto (MOD11-ORIGEN-OT §3.8).',
      });
    }
    if (input.originContext !== WorkOrderSourceContext.MANUAL) {
      const ref = input.originRefId?.trim() ?? '';
      if (!ref) {
        throw new BadRequestException({
          code: 'ORIGIN_REF_REQUIRED',
          message: `El origen ${input.originContext} exige originRefId: sin referencia la trazabilidad se pierde.`,
        });
      }
    }

    // MOD11 H1: la sede la aporta el cliente y la ruta no lleva `:id`, así
    // que el guard no comprueba nada (retorna por `@ExecutionOrderTenantScoped`).
    // El servicio valida el alcance aquí, antes de insertar: sin alcance (o
    // sin puerto que lo acredite) se rechaza con el mismo 404 fail-closed de
    // `assign`/`follow-ups`/reconciliación —uniformidad y mínima información
    // sobre la topología de alcances—. La OT aún no existe, así que la
    // comprobación se hace sobre la sede declarada, no sobre una fila.
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    await runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      await this.assertSupervisionScope(
        qr.manager,
        tenantId,
        { organizationSiteId: input.organizationSiteId } as ExecutionOrder,
        actor,
      );
    });

    const normalizedRef = input.originRefId?.trim() ? input.originRefId.trim() : null;
    const order = await this.createFromScheduling(
      {
        visitRequestId: null,
        scheduleEventId: null,
        organizationSiteId: input.organizationSiteId,
        assignedTechnicianId: null,
        assignedCrewId: null,
        originContext: input.originContext,
        originRefId: normalizedRef,
        // Precedente del camino por agenda (visit-requests/schedule-events):
        // con origen TASKS, `task_id` espeja la referencia de la tarea.
        taskId:
          input.originContext === WorkOrderSourceContext.TASKS
            ? normalizedRef
            : (input.taskId?.trim() ?? null),
        ticketId: input.ticketId?.trim() ?? null,
        subscriberId: input.subscriberId ?? null,
        customerDisplayLabel: input.customerDisplayLabel.trim(),
        serviceAddress: input.serviceAddress?.trim() ?? null,
        municipality: input.municipality?.trim() ?? null,
        sector: input.sector?.trim() ?? null,
        workType: input.workType,
        workSummary: input.workSummary.trim(),
        workInstructions: input.workInstructions?.trim() ?? null,
        plannedWindowStartAt: null,
        plannedWindowEndAt: null,
      },
      actor,
    );

    const toIso = (value: Date | string): string =>
      value instanceof Date ? value.toISOString() : String(value);
    return {
      id: order.id,
      number: order.executionOrderNumber,
      status: order.status,
      originContext: order.originContext as WorkOrderSourceContext,
      originRefId: order.originRefId ?? null,
      workType: order.workType,
      organizationSiteId: order.organizationSiteId as string,
      createdAt: toIso(order.createdAt),
      updatedAt: toIso(order.updatedAt),
    };
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

    // MOD11 E1 (ADR-091 §D2): guarda única de unicidad por eje de origen
    // (tenant_id, origin_context, origin_ref, work_type), réplica de lo que
    // `createVisitRequest` hace: advisory lock con clave derivada de la tupla
    // al inicio, `origin_ref` normalizado con trim antes de comparar y de
    // persistir. `origin_ref IS NULL` (o vacío tras trim) queda fuera de
    // deduplicación por ADR-076 §D4, sin ampliar la excepción. Ambos caminos
    // de nacimiento —agenda (aquí) y despacho (E2)— pasan por esta guarda vía
    // `findActiveExecutionOrderByOrigin`; E2 la reutiliza sin duplicarla.
    // Orden de locks fijo (número → origen): el despacho futuro debe tomarlos
    // en el mismo orden para no invertir la jerarquía.
    const normalizedOriginRefId =
      typeof input.originRefId === 'string' && input.originRefId.trim().length > 0
        ? input.originRefId.trim()
        : null;

    if (normalizedOriginRefId) {
      await manager.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
        `execution-order-origin:${tenantId}|${input.originContext}|${normalizedOriginRefId}|${input.workType}`,
      ]);

      const duplicateOrigin = await this.findActiveExecutionOrderByOrigin(
        manager,
        tenantId,
        input.originContext,
        normalizedOriginRefId,
        input.workType,
      );

      if (duplicateOrigin) {
        throw new ConflictException({
          error: 'DUPLICATE_ACTIVE_WORK',
          originRef: normalizedOriginRefId,
          activeExecutionOrderId: duplicateOrigin.id,
          executionOrderNumber: duplicateOrigin.executionOrderNumber,
        });
      }
    }

    // MOD11 E2: sin evento no hay idempotencia por evento que evaluar. Cada
    // despacho con `origin_ref` pasa por la guarda de origen de arriba; con
    // `origin_ref` nulo (MANUAL sin referencia, ADR-076 §D4) cada despacho es
    // una OT nueva, igual que cada evento de agenda era una OT nueva.
    if (input.scheduleEventId) {
      const existing = await manager.findOne(ExecutionOrder, {
        where: {
          tenantId,
          scheduleEventId: input.scheduleEventId,
        },
      });

      if (existing) {
        return existing;
      }
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
      scheduleEventId: input.scheduleEventId ?? null,
      organizationSiteId: input.organizationSiteId ?? null,
      assignedTechnicianId: input.assignedTechnicianId ?? null,
      assignedCrewId: input.assignedCrewId ?? null,
      originContext: input.originContext,
      // MOD11 E1: persistir el ref normalizado (trim), igual que la guarda
      // compara. Sin esto, 'ABC ' y 'ABC' serían la misma unidad con filas
      // distintas bajo el índice.
      originRefId: normalizedOriginRefId,
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
      plannedWindowStartAt: input.plannedWindowStartAt
        ? new Date(input.plannedWindowStartAt)
        : null,
      plannedWindowEndAt: input.plannedWindowEndAt ? new Date(input.plannedWindowEndAt) : null,
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

    try {
      return await manager.save(ExecutionOrder, entity);
    } catch (error) {
      // Safety net: el índice único de BD detectó una carrera residual (o una
      // escritura directa que evadió la guarda). Con el advisory lock esto no
      // debería ocurrir; se traduce a 409 igual que `createVisitRequest` hace
      // con su constraint. Sin re-lookup aquí: la violación deja la
      // transacción abortada en PostgreSQL y el SELECT fallaría.
      if (isExecutionOrderOriginUniqueViolation(error)) {
        throw new ConflictException({
          error: 'DUPLICATE_ACTIVE_WORK',
          originRef: normalizedOriginRefId,
        });
      }
      throw error;
    }
  }

  /**
   * MOD11 E1: busca la OT activa para la misma unidad de origen. Guarda común
   * a los dos caminos de nacimiento (agenda hoy, despacho en E2): E2 la llama
   * antes de crear, sin reimplementar el predicado.
   *
   * Activo = estado no terminal (mismo conjunto que el índice parcial de la
   * migración 135). `origin_ref` nulo o vacío tras trim no es comparable y
   * retorna null —fuera de deduplicación, ADR-076 §D4—.
   */
  private async findActiveExecutionOrderByOrigin(
    manager: EntityManager,
    tenantId: string,
    originContext: string,
    originRefId: string | null,
    workType: WfmWorkType,
  ): Promise<ExecutionOrder | null> {
    const normalizedRef = originRefId?.trim();
    if (!normalizedRef) {
      return null;
    }

    return manager
      .createQueryBuilder(ExecutionOrder, 'eo')
      .where('eo.tenant_id = :tenantId', { tenantId })
      .andWhere('eo.origin_context = :originContext', { originContext })
      .andWhere('TRIM(eo.origin_ref_id) = :originRef', { originRef: normalizedRef })
      .andWhere('eo.work_type = :workType', { workType })
      .andWhere('eo.status NOT IN (:...activeOriginTerminalStatuses)', {
        activeOriginTerminalStatuses: Array.from(TERMINAL_ORIGIN_STATUSES),
      })
      .orderBy('eo.created_at', 'DESC')
      .getOne();
  }

  /**
   * Cancela una OT desde la agenda de WFM usando el manager transaccional
   * activo que estableció `runInTenantSchema`. No abre una nueva transacción
   * ni resuelve el schema por su cuenta.
   *
   * Guarda el motivo en `closeNotes` porque la entidad ExecutionOrder no
   * tiene una columna dedicada `cancellationReason` (ver F1.4 PRD).
   */
  async cancelFromSchedulingWithManager(
    manager: EntityManager,
    tenantId: string,
    executionOrderId: string,
    scheduleEventId: string,
    reason: string,
    actor: JwtPayload,
  ): Promise<{ id: string; status: string }> {
    const order = await manager.findOne(ExecutionOrder, {
      where: { id: executionOrderId, tenantId },
    });

    if (!order) {
      throw new NotFoundException('OT de ejecución no encontrada');
    }

    // Integridad: el scheduleEventId debe coincidir con el que se pasa
    // desde WFM para evitar cancelar una OT que fue reasignada a otro evento.
    if (order.scheduleEventId !== scheduleEventId) {
      throw new ConflictException({
        code: 'EXECUTION_ORDER_EVENT_MISMATCH',
        message: 'La OT no pertenece al evento de agenda indicado; ¿fue reasignada mientras tanto?',
      });
    }

    // MOD11 T2 (CA-12): la cancelación no reescribe un cierre. Sin esta
    // guarda, una OT COMPLETED podía pasar a CANCELLED pisando su resultado.
    this.assertMutable(order);

    const fromStatus = order.status;
    const now = new Date();
    order.status = ExecutionOrderStatus.CANCELLED;
    order.closeNotes = reason;
    order.closedAt = now;
    order.updatedByUserId = actor.sub ?? null;
    (order as { version: number }).version = (order.version ?? 0) + 1;

    const saved = await manager.save(ExecutionOrder, order);

    // MOD11 T1 B1 (ADR-089 §D1): el asiento vive en la misma transacción que
    // el cambio; fuera de ella podría divergir del estado real.
    await this.recordStatusTransition(manager, tenantId, {
      executionOrderId: order.id,
      fromStatus,
      toStatus: ExecutionOrderStatus.CANCELLED,
      changedAt: now,
      actorUserId: actor.sub,
      reason,
    });

    // MOD11 T2 (CA-13): la cancelación emite hecho de dominio. Este camino
    // corre dentro de la transacción de WFM sin contexto de comando, así que
    // el outbox se inserta directo (mismos campos que `appendOutbox`): la
    // alternativa sería no emitir, que es el defecto que se cierra.
    await manager.save(
      ExecutionOrderOutboxEvent,
      manager.create(ExecutionOrderOutboxEvent, {
        eventId: randomUUID(),
        tenantId,
        aggregateId: order.id,
        aggregateVersion: saved.version,
        eventType: 'ExecutionOrderCancelledV1',
        payload: {
          executionOrderId: order.id,
          reason: reason.slice(0, 255),
        },
        correlationId: randomUUID(),
        attemptCount: 0,
        occurredAt: now,
        availableAt: now,
        leaseUntil: null,
        publishedAt: null,
        lastError: null,
      }),
    );

    this.logger.log(
      `OT ${saved.id} cancelada desde agenda. Evento: ${scheduleEventId}. Razón: ${reason.slice(0, 100)}${reason.length > 100 ? '…' : ''}. Actor: ${actor.sub}`,
    );

    return { id: saved.id, status: saved.status };
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
      const fromStatus = order.status;
      order.status = ExecutionOrderStatus.IN_PROGRESS;
      order.version = expectedVersion + 1;
      // MOD11 T1 B1 (CA-05): `startedAt` conserva su semántica idempotente y
      // el asiento comparte el MISMO instante (sin sesgo de milisegundos).
      const now = order.startedAt ?? new Date();
      order.startedAt = now;
      order.updatedByUserId = actor.sub;
      const saved = await this.persistOrderOptimistically(qr.manager, order, expectedVersion);

      await this.recordStatusTransition(qr.manager, tenantId, {
        executionOrderId: order.id,
        fromStatus,
        toStatus: ExecutionOrderStatus.IN_PROGRESS,
        changedAt: now,
        actorUserId: actor.sub,
        reason: validated.note,
      });

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
      this.assertRegistrationActive(order);
      const expectedVersion = order.version ?? 1;
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

  async updateFieldWorkActivity(
    id: string,
    activityId: string,
    input: import('../dto/execution-orders.dto').UpdateFieldWorkInput,
    actor: JwtPayload,
    context?: ExecutionOrderCommandContext,
  ): Promise<ExecutionOrderActivity> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const validated = (await import('../dto/execution-orders.dto')).UpdateFieldWorkSchema.parse(
      input,
    );

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const order = await this.requireOrder(qr.manager, tenantId, id);
      this.assertVersion(order, context?.ifMatch);
      this.assertMutable(order);

      const activity = await qr.manager.findOne(ExecutionOrderActivity, {
        where: { id: activityId, executionOrderId: id, tenantId },
      });
      if (!activity) {
        throw new (await import('@nestjs/common')).NotFoundException(
          'Actividad no encontrada para esta OT.',
        );
      }

      if (validated.activityType !== undefined) {
        activity.activityType = validated.activityType;
      }
      if (validated.description !== undefined) {
        activity.description = validated.description;
      }

      const expectedVersion = order.version ?? 1;
      order.version = expectedVersion + 1;
      order.updatedByUserId = actor.sub;
      await this.persistOrderOptimistically(qr.manager, order, expectedVersion);
      return qr.manager.save(ExecutionOrderActivity, activity);
    });
  }

  async deleteFieldWorkActivity(
    id: string,
    activityId: string,
    actor: JwtPayload,
    context?: ExecutionOrderCommandContext,
  ): Promise<void> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const order = await this.requireOrder(qr.manager, tenantId, id);
      this.assertVersion(order, context?.ifMatch);
      this.assertMutable(order);

      const activity = await qr.manager.findOne(ExecutionOrderActivity, {
        where: { id: activityId, executionOrderId: id, tenantId },
      });
      if (!activity) {
        throw new (await import('@nestjs/common')).NotFoundException(
          'Actividad no encontrada para esta OT.',
        );
      }

      await qr.manager.remove(ExecutionOrderActivity, activity);

      const expectedVersion = order.version ?? 1;
      order.version = expectedVersion + 1;
      order.updatedByUserId = actor.sub;
      await this.persistOrderOptimistically(qr.manager, order, expectedVersion);
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
      this.assertRegistrationActive(order);

      // ── Custodia: validar que el actor está asignado a la OT ────────
      this.assertCustodyAssignment(order, actor.sub, validated.technicianCustodyId);

      const expectedVersion = order.version ?? 1;
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

    // MOD11 T2 (CA-11): `close` con `result = CANCELLED` deja de ser vía de
    // cancelación. Era puerta trasera abierta al campo que además dejaba la
    // tarea vinculada sin transicionar (`mapCloseResultToTaskStatus` devuelve
    // null para CANCELLED). Vías honestas: anulación por error (supervisión +
    // motivo, `POST :id/annul`) o cancelación desde la agenda. Falla antes de
    // abrir transacción o recibo: no hay nada que idempotar en un camino
    // que ya no existe.
    if (validated.result === ExecutionOrderResult.CANCELLED) {
      throw new UnprocessableEntityException({
        code: 'CLOSE_RESULT_CANCELLED_REMOVED',
        message:
          'Cerrar con resultado CANCELLED ya no cancela la OT. Para un error de creación use la anulación por error (supervisión + motivo); para deshacer trabajo comprometido, cancele desde la agenda.',
      });
    }

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
      const snapshot = readTemplateRequirementsSnapshot(order.templateRequirementsSnapshot);
      if (!snapshot) {
        throw new UnprocessableEntityException({
          code: 'CLOSURE_GATE_SNAPSHOT_MISSING',
          message: 'No se puede cerrar la OT porque no tiene una plantilla de cierre congelada.',
          missingRequirements: ['Plantilla de cierre'],
        });
      }
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
          // La categoría procede del catálogo real de Inventario. Si no puede
          // resolverse, el evaluador falla cerrado y no infiere desde itemId.
          itemUsages: await this.buildMaterialEvaluationUsages(snapshot, itemUsages),
          hasCustomerAcceptance: !!validated.customerAcceptance,
          closeCommand: { customerAcceptance: validated.customerAcceptance },
        });

        if (!evaluation.passed) {
          throw new UnprocessableEntityException({
            code: 'CLOSURE_GATE_INCOMPLETE',
            message: 'No se puede cerrar la OT: requisitos pendientes.',
            missingRequirements: evaluation.missingRequirements.map((m) => m.label),
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
      const fromStatus = order.status;
      // MOD11 T1 B1 (CA-05): `closedAt` conserva su comportamiento y el
      // asiento comparte el MISMO instante (sin sesgo de milisegundos).
      const now = new Date();
      order.result = validated.result;
      order.status = this.mapResultToStatus(validated.result);
      order.version = expectedVersion + 1;
      order.closedAt = now;
      order.closeNotes = validated.closeNotes ?? validated.summary ?? null;
      order.updatedByUserId = actor.sub;
      const saved = await this.persistOrderOptimistically(qr.manager, order, expectedVersion);

      await this.recordStatusTransition(qr.manager, tenantId, {
        executionOrderId: order.id,
        fromStatus,
        toStatus: order.status,
        changedAt: now,
        actorUserId: actor.sub,
        reason: validated.summary ?? validated.result,
      });

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
      const fromStatus = order.status;
      if (input.assigneeType === 'TECHNICIAN') order.assignedTechnicianId = input.assigneeId;
      else order.assignedCrewId = input.assigneeId;
      order.status = ExecutionOrderStatus.ASSIGNED;
      order.version = expectedVersion + 1;
      order.updatedByUserId = actor.sub;
      // T0 (CA-01): la asignación se declara como campo persistible. Sin esta
      // declaración el UPDATE escribía solo el núcleo y la base conservaba el
      // técnico anterior mientras la respuesta mostraba el nuevo.
      const saved = await this.persistOrderOptimistically(qr.manager, order, expectedVersion, {
        assignment: true,
      });
      // MOD11 T1 B1 (CA-01): la asignación es una transición y deja asiento
      // en la misma transacción que el cambio.
      await this.recordStatusTransition(qr.manager, tenantId, {
        executionOrderId: order.id,
        fromStatus,
        toStatus: ExecutionOrderStatus.ASSIGNED,
        actorUserId: actor.sub,
        reason: input.reason,
      });
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

  /**
   * MOD11 T2 — anulación por error (ADR-090 §D3, CA-09/CA-10).
   *
   * Mecanismo (ver informe T2): `status = CANCELLED` + `is_annulled = true`
   * (migración 136), sin estado terminal nuevo. De ahí sale todo lo demás
   * sin tocar ninguna lista de terminalidad: la anulada libera su origen
   * (135, por estado), entra en la purga de retención (134, por estado),
   * sale del pool y de la bandeja, y ningún comando de ejecución la toca
   * (`assertMutable` ya rechaza `CANCELLED`).
   *
   * - Exige motivo no vacío y rol de supervisión (el guard lo impone por
   *   `@Roles` + `SUPERVISE`; aquí se revalida el alcance como en
   *   `createFollowUp`, para que el servicio sea seguro ante llamantes
   *   internos).
   * - Alcanza a la OT despachada sin cita: no exige evento ni asignación.
   * - No destruye rastro (D5): la fila permanece, con asiento de transición
   *   y hecho de dominio `ExecutionOrderAnnulledV1`.
   * - `result` queda intacto (normalmente null): la anulación no es un
   *   desenlace de ejecución y no debe alimentar lecturas de resultado.
   */
  async annul(
    id: string,
    input: { reason: string },
    actor: JwtPayload,
    context?: ExecutionOrderCommandContext,
  ): Promise<ExecutionOrder> {
    const motive = typeof input?.reason === 'string' ? input.reason.trim() : '';
    if (!motive) {
      throw new BadRequestException({
        code: 'ANNULMENT_REASON_REQUIRED',
        message: 'La anulación por error exige el motivo.',
      });
    }
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const order = await this.requireOrder(qr.manager, tenantId, id);
      await this.assertSupervisionScope(qr.manager, tenantId, order, actor);
      const receipt = await this.beginCommand(
        qr.manager,
        tenantId,
        actor,
        'execution_order.annul',
        { executionOrderId: id, input: { reason: motive } },
        context,
      );
      if (receipt?.replay) return order;
      this.assertVersion(order, context?.ifMatch);
      // Terminal (incluida una OT ya cancelada o ya anulada) no se anula:
      // reescribir un cierre es el defecto CA-12 en otra puerta.
      this.assertMutable(order);
      const expectedVersion = order.version ?? 1;
      const fromStatus = order.status;
      const now = new Date();
      order.status = ExecutionOrderStatus.CANCELLED;
      order.isAnnulled = true;
      order.closedAt = now;
      order.closeNotes = motive;
      order.version = expectedVersion + 1;
      order.updatedByUserId = actor.sub;
      // T0 (doctrina opt-in): la anulación declara su columna; ningún otro
      // comando la persiste.
      const saved = await this.persistOrderOptimistically(qr.manager, order, expectedVersion, {
        annulment: true,
      });
      // MOD11 T1 B1 (CA-01): la anulación es una transición y deja asiento
      // en la misma transacción que el cambio (D5: sin excepción al rastro).
      await this.recordStatusTransition(qr.manager, tenantId, {
        executionOrderId: order.id,
        fromStatus,
        toStatus: ExecutionOrderStatus.CANCELLED,
        changedAt: now,
        actorUserId: actor.sub,
        reason: motive,
      });
      await this.finishCommand(
        qr.manager,
        tenantId,
        actor,
        'execution_order.annul',
        id,
        saved.version,
        context,
        receipt,
        'ExecutionOrderAnnulledV1',
        { reason: motive },
      );
      this.logger.log(`OT ${id} anulada por error. Motivo registrado. Actor: ${actor.sub}`);
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

  /**
   * Corrección aditiva de un asiento de transición (MOD11 T1 B2, ADR-089 §D3,
   * spec §4.3, CA-04).
   *
   * Un asiento nunca se edita ni se borra: la corrección es un asiento NUEVO
   * que referencia al corregido con `correctionOfId`, con su actor
   * (`changedBy`) y su motivo (`reason`). El original permanece visible.
   *
   * Decisiones de alcance T1:
   * - No muta la OT (sin cambio de estado, versión, `startedAt`/`closedAt`):
   *   la corrección documenta el hecho, no re-ejecuta la transición (CA-05).
   * - El asiento nuevo repite el destino del corregido como auto-transición
   *   (`fromStatus = toStatus = original.toStatus`): es neutro para la
   *   derivación de tiempos (ADR-089 §D2) y conserva el contexto del hecho
   *   corregido. La referencia vive en `correctionOfId`, nunca en `reason`
   *   (dictamen B3 §2: `reason` mantiene finalidad operativa).
   * - Sin recibo de comando ni evento de outbox: no hay cambio de estado que
   *   idempotar ni que publicar; el asiento es el hecho auditable.
   * - Sin superficie HTTP en T1: no se amplían `@Roles` ni `@Permissions`;
   *   la consulta paginada es T3 con dictamen sec-eng.
   */
  async correctStatusTransition(
    executionOrderId: string,
    transitionId: string,
    input: { reason: string },
    actor: JwtPayload,
  ): Promise<ExecutionOrderStatusTransition> {
    if (!UUID_PATTERN.test(transitionId)) {
      throw new BadRequestException({
        code: 'TRANSITION_CORRECTION_INVALID_ID',
        message: 'El identificador del asiento a corregir no es válido.',
      });
    }
    const motive = this.toTransitionReason(input?.reason);
    if (!motive) {
      throw new BadRequestException({
        code: 'TRANSITION_CORRECTION_REASON_REQUIRED',
        message: 'La corrección exige el motivo de la enmienda.',
      });
    }
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      await this.requireOrder(qr.manager, tenantId, executionOrderId);
      const original = await qr.manager.findOne(ExecutionOrderStatusTransition, {
        where: { id: transitionId, executionOrderId, tenantId },
      });
      if (!original) {
        throw new NotFoundException('Asiento de transición no encontrado');
      }
      const seat: DeepPartial<ExecutionOrderStatusTransition> = {
        tenantId,
        executionOrderId,
        fromStatus: original.toStatus,
        toStatus: original.toStatus,
        changedAt: new Date(),
        changedBy: actor.sub,
        reason: motive,
        correctionOfId: original.id,
      };
      const saved = await qr.manager.save(ExecutionOrderStatusTransition, seat);
      // B3 §3.4: el log lleva identificadores operativos, nunca `reason` en
      // claro ni volcado del asiento.
      this.logger.log(
        `OT ${executionOrderId} asiento ${original.id} corregido con asiento ${saved.id}. Actor: ${actor.sub}`,
      );
      return saved;
    });
  }

  async registerEvidence(
    id: string,
    input: {
      mediaAssetId: string;
      evidenceType: string;
      requirementKey: string;
      expiresAt: string;
      capturedAt?: string | null;
    },
    actor: JwtPayload,
    context?: ExecutionOrderCommandContext,
  ): Promise<ExecutionOrderEvidenceContract> {
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
          return this.toEvidenceContract(existing);
        }
      }
      this.assertVersion(order, context?.ifMatch);
      this.assertMutable(order);
      this.assertRegistrationActive(order);

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

      return this.toEvidenceContract({ ...evidence, assetStatus: 'AVAILABLE' });
    });
  }

  async createEvidenceAssetReceipt(
    id: string,
    file: Express.Multer.File,
    actor: JwtPayload,
    context?: ExecutionOrderCommandContext,
  ): Promise<EvidenceAssetReceipt> {
    const port = this.evidenceAssetPort;
    if (!port) {
      throw new ServiceUnavailableException({
        code: 'MEDIA_ASSET_BOUNDARY_UNAVAILABLE',
        message: 'La carga de evidencia no está disponible hasta validar el asset en Media.',
      });
    }

    const { tenantId, schemaName } = TenantContext.getOrThrow();

    const fileFingerprint = this.createEvidenceUploadFingerprint(file);

    // ── Paso 1: Reservar la clave y crear el intent durable ───────────────
    // El intent sobrevive al upload de Media para autorizar polling y
    // reconciliación. Si el upload falla, el intent queda FAILED y es visible
    // en el recibo.
    const intent = await runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const order = await this.requireOrder(qr.manager, tenantId, id);
      const receipt = await this.beginCommand(
        qr.manager,
        tenantId,
        actor,
        'execution_order.evidence_asset',
        { executionOrderId: id, fileFingerprint },
        context,
      );

      if (receipt?.replay) {
        // La relación tipada evidenceUploadIntentId es la fuente autoritativa;
        // resourceRef es el fallback de compatibilidad para registros
        // anteriores a la migración (columna null).
        const intentId = receipt.evidenceUploadIntentId ?? receipt.resourceRef;
        if (!intentId) {
          throw new ConflictException({
            code: 'EVIDENCE_UPLOAD_INTENT_PURGED',
            message:
              'La carga original de evidencia no puede reanudarse (no existe un intento de carga asociado). Usa una clave de idempotencia nueva.',
          });
        }

        const replayIntent = await qr.manager.findOne(ExecutionOrderEvidenceUploadIntent, {
          where: {
            id: intentId,
            executionOrderId: id,
            tenantId,
          },
        });
        if (!replayIntent) {
          // Intent purgado (o referencia legacy caducada) con registro vivo:
          // desenlace terminal, no un EVIDENCE_UPLOAD_IN_PROGRESS permanente.
          throw new ConflictException({
            code: 'EVIDENCE_UPLOAD_INTENT_PURGED',
            message:
              'La carga original de evidencia no puede reanudarse (intento purgado o expirado). Usa una clave de idempotencia nueva.',
          });
        }
        if (replayIntent.status === 'FAILED') {
          throw new ConflictException({
            code: 'EVIDENCE_UPLOAD_FAILED',
            message: 'La carga original de evidencia no pudo completarse.',
          });
        }
        if (replayIntent.status === 'REJECTED') {
          throw new ConflictException({
            code: 'EVIDENCE_UPLOAD_REJECTED',
            message: 'La carga original de evidencia fue rechazada por el análisis.',
          });
        }
        if (replayIntent.status === 'EXPIRED') {
          throw new ConflictException({
            code: 'EVIDENCE_UPLOAD_EXPIRED',
            message: 'La carga original de evidencia venció antes de completarse.',
          });
        }
        if (replayIntent.expiresAt !== null && replayIntent.expiresAt.getTime() <= Date.now()) {
          throw new ConflictException({
            code: 'EVIDENCE_UPLOAD_EXPIRED',
            message: 'La carga original de evidencia venció antes de completarse.',
          });
        }
        if (!replayIntent.mediaAssetId) {
          // Único caso legítimo de "en proceso": intent PENDING con la subida
          // realmente en curso. Todo estado terminal ya se resolvió arriba.
          throw new ConflictException({
            code: 'EVIDENCE_UPLOAD_IN_PROGRESS',
            message: 'La carga de evidencia todavía está en proceso.',
          });
        }

        return {
          intent: replayIntent,
          receipt,
          orderVersion: order.version ?? 1,
        };
      }

      this.assertVersion(order, context?.ifMatch);
      this.assertMutable(order);

      const expiresAt = new Date(
        Date.now() + 24 * 60 * 60 * 1000, // 24h TTL
      );

      const createdIntent = await qr.manager.save(
        qr.manager.create(ExecutionOrderEvidenceUploadIntent, {
          executionOrderId: id,
          tenantId,
          mediaAssetId: null,
          status: 'PENDING',
          expiresAt,
          actorUserId: actor.sub,
        }),
      );

      // Vincular la reserva al intent antes de salir de la transacción evita
      // que un retry concurrente pueda reservar un segundo intent mientras
      // Media procesa el binario. La relación tipada evidenceUploadIntentId es
      // la fuente autoritativa del replay; resourceRef se conserva como
      // referencia genérica de compatibilidad con registros legacy.
      if (receipt && this.reliabilityService) {
        await this.reliabilityService.completeIdempotency(qr.manager, receipt.intentId, {
          resourceRef: createdIntent.id,
          evidenceUploadIntentId: createdIntent.id,
          resultCode: 'UPLOAD_INTENT_CREATED',
          resultStatus: 'PENDING',
          resourceVersion: order.version ?? 1,
        });
      }

      return { intent: createdIntent, receipt, orderVersion: order.version ?? 1 };
    });

    if (intent.receipt?.replay) {
      return this.toEvidenceAssetReceipt(intent.intent);
    }

    // ── Paso 2: Subir asset a Media (bounded context independiente) ─────
    let uploadResult: EvidenceUploadResult;
    try {
      uploadResult = await port.createUploadIntent(schemaName, file, actor.sub);
    } catch (err: unknown) {
      // Compensación best-effort: marcar el intent como FAILED no puede
      // sustituir al error real de la subida. Si el UPDATE falla, el
      // diagnóstico que importa es el de Media, no el de la compensación, así
      // que este catch anidado lo aísla y siempre se relanza `err`.
      try {
        await runInTenantSchema(this.dataSource, schemaName, async (qr) => {
          await qr.manager.update(ExecutionOrderEvidenceUploadIntent, intent.intent.id, {
            status: 'FAILED',
            mediaAssetId: null,
          });
        });
      } catch (compensationError: unknown) {
        // Sin `message`: los QueryFailedError de TypeORM incluyen el volcado de
        // parámetros de la sentencia y eso no puede acabar en un log.
        this.logger.warn(
          `No se pudo marcar el intent de evidencia ${intent.intent.id} como FAILED ` +
            `(${compensationError instanceof Error ? compensationError.name : 'unknown'}); ` +
            `queda para reconciliación por expiración.`,
        );
      }
      throw err;
    }

    // ── Paso 3: Vincular intent con el asset creado ─────────────────────
    await runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      await qr.manager.update(ExecutionOrderEvidenceUploadIntent, intent.intent.id, {
        mediaAssetId: uploadResult.mediaAssetId,
        status: 'PENDING_ANALYSIS',
        // El asset quedó vinculado al intent: la reserva de 24h deja de
        // gobernar la retención. A partir de aquí manda el horizonte del
        // registro de idempotencia (90 días), no la reserva original.
        expiresAt: null,
      });

      if (intent.receipt) {
        await this.finishCommand(
          qr.manager,
          tenantId,
          actor,
          'execution_order.evidence_asset',
          id,
          intent.orderVersion,
          context,
          intent.receipt,
          undefined,
          {},
          intent.intent.id,
        );
      }
    });

    return this.toEvidenceAssetReceipt(
      {
        ...intent.intent,
        mediaAssetId: uploadResult.mediaAssetId,
        status: 'PENDING_ANALYSIS',
      },
      uploadResult.uploadedAt,
    );
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
    input: { reasonCode: string; dueAt?: string | null },
    actor: JwtPayload,
    context?: ExecutionOrderCommandContext,
  ): Promise<{ intentId: string; resourceRef: string; status: 'ACCEPTED'; version: number }> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const order = await this.requireOrder(qr.manager, tenantId, id);
      await this.assertSupervisionScope(qr.manager, tenantId, order, actor);
      const receipt = await this.beginCommand(
        qr.manager,
        tenantId,
        actor,
        'execution_order.follow_up',
        { executionOrderId: id, input },
        context,
      );

      if (receipt?.replay && receipt.resourceRef && receipt.resourceVersion !== null) {
        return {
          intentId: receipt.intentId,
          resourceRef: receipt.resourceRef,
          status: 'ACCEPTED',
          version: receipt.resourceVersion,
        };
      }

      const isTerminal = [
        ExecutionOrderStatus.COMPLETED,
        ExecutionOrderStatus.COMPLETED_WITH_OBSERVATIONS,
        ExecutionOrderStatus.NOT_EXECUTED,
        ExecutionOrderStatus.CANCELLED,
      ].includes(order.status);
      if (!isTerminal && order.status !== ExecutionOrderStatus.BLOCKED) {
        throw new ConflictException({
          code: 'FOLLOW_UP_NOT_ALLOWED',
          message: 'La OT solo admite seguimiento cuando está bloqueada o cerrada.',
        });
      }
      // MOD11 T2: la OT anulada es inerte —no debió existir y no admite
      // seguimiento— aunque su estado sea terminal. Sin esto, el supervisor
      // podría abrir rastro nuevo sobre un registro muerto.
      if (order.isAnnulled === true) {
        throw new ConflictException({
          code: 'FOLLOW_UP_NOT_ALLOWED',
          message: 'La OT anulada por error no admite seguimiento.',
        });
      }

      const followUpId = randomUUID();
      const expectedVersion = order.version ?? 1;
      order.version = expectedVersion + 1;
      order.updatedByUserId = actor.sub;
      const saved = await this.persistOrderOptimistically(qr.manager, order, expectedVersion);

      await this.finishCommand(
        qr.manager,
        tenantId,
        actor,
        'execution_order.follow_up',
        id,
        saved.version,
        context,
        receipt,
        'ExecutionOrderFollowUpRequiredV1',
        { followUpId, reasonCode: input.reasonCode },
        followUpId,
      );

      return {
        intentId: receipt?.intentId ?? followUpId,
        resourceRef: followUpId,
        status: 'ACCEPTED',
        version: saved.version,
      };
    });
  }

  async redriveEvent(
    eventId: string,
    input: RedriveExecutionOrderEventInput,
    actor: JwtPayload,
    context?: ExecutionOrderCommandContext,
  ): Promise<{ eventId: string; correlationId: string; status: 'QUEUED' }> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const event = await qr.manager.findOne(ExecutionOrderOutboxEvent, {
        where: { tenantId, eventId },
      });
      if (!event) {
        throw new NotFoundException('Evento operativo no encontrado');
      }

      this.assertRedriveEventShape(event);
      if (!event.lastError) {
        throw new ConflictException({
          code: 'EVENT_NOT_IN_DLQ',
          message: 'El evento no está disponible en la cola de intervención.',
        });
      }

      const order = await this.requireOrder(qr.manager, tenantId, event.aggregateId);
      if (!order.ticketId || order.ticketId !== input.ticketId) {
        throw new NotFoundException('Evento operativo no encontrado');
      }
      await this.assertSupervisionScope(qr.manager, tenantId, order, actor);

      const receipt = await this.beginCommand(
        qr.manager,
        tenantId,
        actor,
        'execution_event.redrive',
        {
          eventId,
          eventType: event.eventType,
          causeCode: input.causeCode,
          ticketId: input.ticketId,
        },
        context,
      );
      if (receipt?.replay) {
        return { eventId, correlationId: event.correlationId, status: 'QUEUED' };
      }

      const result = await qr.manager
        .createQueryBuilder()
        .update(ExecutionOrderOutboxEvent)
        .set({
          publishedAt: null,
          availableAt: new Date(),
          leaseUntil: null,
          lastError: null,
          // Genera un nuevo identificador de job en el relay sin cambiar el
          // eventId del envelope. Los duplicados siguen siendo neutralizados
          // por el inbox del consumidor.
          attemptCount: () => 'attempt_count + 1',
        })
        .where('id = :id AND tenant_id = :tenantId AND last_error IS NOT NULL', {
          id: event.id,
          tenantId,
        })
        .execute();
      if ((result.affected ?? 0) !== 1) {
        throw new ConflictException({
          code: 'EVENT_REDRIVE_CONFLICT',
          message: 'El evento cambió mientras se solicitaba su redrive.',
        });
      }

      // El marcador terminal de DLQ no es el inbox del consumidor: se limpia
      // para que el operador pueda distinguir el redrive en curso del fallo
      // anterior, sin tocar el historial durable de la operación.
      await qr.manager
        .createQueryBuilder()
        .update(ExecutionOrderInboxEvent)
        .set({ processedAt: null, lastError: null })
        .where('tenant_id = :tenantId AND consumer = :consumer AND event_id = :eventId', {
          tenantId,
          consumer: 'mod11-dlq-terminal',
          eventId,
        })
        .execute();

      await this.finishCommand(
        qr.manager,
        tenantId,
        actor,
        'execution_event.redrive',
        eventId,
        event.aggregateVersion,
        context,
        receipt,
      );

      return { eventId, correlationId: event.correlationId, status: 'QUEUED' };
    });
  }

  async assertActorCanRedrive(eventId: string, actor: JwtPayload): Promise<void> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    await runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const event = await qr.manager.findOne(ExecutionOrderOutboxEvent, {
        where: { tenantId, eventId },
      });
      if (!event) throw new NotFoundException('Evento operativo no encontrado');

      this.assertRedriveEventShape(event);
      if (!event.lastError) {
        throw new NotFoundException('Evento operativo no encontrado');
      }
      const order = await this.requireOrder(qr.manager, tenantId, event.aggregateId);
      await this.assertSupervisionScope(qr.manager, tenantId, order, actor);
    });
  }

  /**
   * Computa las acciones permitidas sobre una OT según estado, rol del actor
   * y asignación. Es política pura; no reemplaza autorización por guardas.
   */
  computeAllowedActions(order: ExecutionOrder, actor: JwtPayload): ExecutionOrderAllowedAction[] {
    const isAssigned = order.assignedTechnicianId === actor.sub;
    const isUnassigned = !order.assignedTechnicianId && !order.assignedCrewId;
    const isTechnician = [UserRole.TECHNICIAN, UserRole.CONTRACTOR].includes(
      actor.role as UserRole,
    );
    const isUnassignedPool =
      isUnassigned && isTechnician && order.status !== ExecutionOrderStatus.CREATED;
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
      // MOD11 T2: la anulada no ofrece ni seguimiento (ver `createFollowUp`).
      if (isSupervisor && order.isAnnulled !== true) {
        actions.push('CREATE_FOLLOW_UP');
      }
      return actions;
    }

    // ── Ejecución: técnico/contratista asignado (no supervisor) o pool sin asignar (excepto CREATED) ────
    if ((isAssigned && !isSupervisor) || isUnassignedPool) {
      switch (order.status) {
        case ExecutionOrderStatus.CREATED:
        case ExecutionOrderStatus.ASSIGNED:
        case ExecutionOrderStatus.EN_ROUTE:
          // Pre-inicio: nada se registra en la OT hasta iniciar la ejecución.
          actions.push('START');
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
      const fromStatus = order.status;
      order.status = status;
      order.version = expectedVersion + 1;
      order.updatedByUserId = actor.sub;
      const saved = await this.persistOrderOptimistically(qr.manager, order, expectedVersion);
      // MOD11 T1 B1 (CA-02): bloqueo y reanudación dejan asiento cada vez;
      // varios ciclos en la misma OT quedan todos registrados (A1 descartada).
      await this.recordStatusTransition(qr.manager, tenantId, {
        executionOrderId: order.id,
        fromStatus,
        toStatus: status,
        actorUserId: actor.sub,
        reason: input.reasonCode ?? input.resolutionCode ?? input.note,
      });
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

    // Un intent ya vinculado a un asset (media_asset_id asignado) con la
    // reserva limpia (expires_at null tras completar el enlace) no depende del
    // reloj de 24h: su retención la gobierna el registro de idempotencia.
    if (intent.mediaAssetId && intent.expiresAt === null) {
      return;
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
        case 'MATERIAL': {
          const itemCategory = requireString(config, 'itemCategory');
          // Aditivo v1.2 (MOD11 T1 B1, spec §4.3): la disposición viaja en el
          // config de la fila de plantilla. Ausente = v1.1 (retrocompatible);
          // presente pero desconocida = plantilla inválida (fail-closed).
          const finalDisposition = config.finalDisposition;
          if (finalDisposition !== undefined) {
            if (
              typeof finalDisposition !== 'string' ||
              !(Object.values(InventoryDisposition) as string[]).includes(finalDisposition)
            ) {
              return invalidTemplate();
            }
            return {
              ...base,
              kind: 'MATERIAL' as const,
              itemCategory,
              finalDisposition: finalDisposition as InventoryDisposition,
            };
          }
          return {
            ...base,
            kind: 'MATERIAL' as const,
            itemCategory,
          };
        }
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

  /**
   * Proyección exacta de spec §4.7.1 (`ExecutionOrderListItem`).
   *
   * Solo columnas directas de `execution_orders`, sin joins ni sub-queries.
   * `assignee.displayLabel` llega resuelto en lote por página desde `list()`
   * (SEC-D4); el campo es opcional en el contrato y se omite cuando el ID no
   * resuelve o cuando el asignado es una cuadrilla (sin usuario asociado en
   * el directorio).
   */
  private toListItem(
    order: ExecutionOrder,
    assigneeLabels: Map<string, string>,
  ): ExecutionOrderListItem {
    // MOD11 E2 (contrato shared v1.3): la fila tolera la OT sin cita. Sin
    // vínculo de agenda se emite `eventId: null` y `window: null` y la fila se
    // lista igual (200); la presentación «sin ventana» es de E4. La ventana
    // solo se emite cuando ambos extremos existen: a medio vínculo (dato
    // corrupto) se degrada a nulo antes que romper la consola entera.
    const toIso = (value: Date | string): string =>
      value instanceof Date ? value.toISOString() : String(value);
    const technicianId = order.assignedTechnicianId;
    const technicianLabel = technicianId ? assigneeLabels.get(technicianId) : undefined;
    return {
      id: order.id,
      number: order.executionOrderNumber,
      status: order.status,
      ...(order.result ? { result: order.result } : {}),
      workType: order.workType,
      schedule: {
        eventId: order.scheduleEventId ?? null,
        window:
          order.plannedWindowStartAt != null && order.plannedWindowEndAt != null
            ? {
                startAt: toIso(order.plannedWindowStartAt),
                endAt: toIso(order.plannedWindowEndAt),
              }
            : null,
      },
      ...(technicianId
        ? {
            assignee: {
              type: 'TECHNICIAN' as const,
              id: technicianId,
              ...(technicianLabel ? { displayLabel: technicianLabel } : {}),
            },
          }
        : order.assignedCrewId
          ? { assignee: { type: 'CREW' as const, id: order.assignedCrewId } }
          : {}),
      customerDisplayLabel: order.customerDisplayLabel,
      municipality: order.municipality,
      ticketId: order.ticketId,
      taskId: order.taskId,
      visitRequestId: order.visitRequestId,
      // MOD11 T2 (CA-09): el discriminador viaja en la fila para que ningún
      // consumidor confunda anulación con cancelación. En la bandeja siempre
      // es false (el WHERE excluye anuladas); en el detalle puede ser true.
      annulled: order.isAnnulled ?? false,
      createdAt: toIso(order.createdAt),
      updatedAt: toIso(order.updatedAt),
    };
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

    const createdAt =
      evidence.createdAt instanceof Date ? evidence.createdAt : new Date(evidence.createdAt ?? 0);

    return {
      id: evidence.id,
      mediaAssetId: evidence.mediaAssetId as string,
      evidenceType: evidence.evidenceType as ExecutionOrderEvidenceContract['evidenceType'],
      requirementKey: evidence.requirementKey ?? '',
      capturedAt: evidence.capturedAt ? evidence.capturedAt.toISOString() : null,
      receivedAt: createdAt.toISOString(),
      status,
      assetStatus,
      createdAt: createdAt.toISOString(),
    };
  }

  private toEvidenceAssetReceipt(
    intent: ExecutionOrderEvidenceUploadIntent,
    uploadedAt?: string,
  ): EvidenceAssetReceipt {
    if (!intent.mediaAssetId) {
      throw new ConflictException({
        code: 'EVIDENCE_UPLOAD_IN_PROGRESS',
        message: 'La carga de evidencia todavía está en proceso.',
      });
    }

    const receipt: EvidenceAssetReceipt = {
      intentId: intent.id,
      mediaAssetId: intent.mediaAssetId,
      status: intent.status as EvidenceAssetReceipt['status'],
      ...(uploadedAt
        ? { uploadedAt }
        : intent.createdAt instanceof Date
          ? { uploadedAt: intent.createdAt.toISOString() }
          : {}),
    };
    if (intent.expiresAt) receipt.expiresAt = intent.expiresAt.toISOString();
    return receipt;
  }

  private createEvidenceUploadFingerprint(file: Express.Multer.File): string {
    return createHash('sha256')
      .update(file.buffer)
      .update('\0')
      .update(file.mimetype ?? '')
      .update('\0')
      .update(String(file.size))
      .digest('hex');
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

  /**
   * Revalida el alcance server-owned dentro de la misma transacción que lee la
   * OT. La ausencia de cualquiera de las fuentes canónicas es fail-closed.
   */
  private async assertSupervisionScope(
    manager: EntityManager,
    tenantId: string,
    order: ExecutionOrder,
    actor: JwtPayload,
  ): Promise<void> {
    if (!order.organizationSiteId || !this.organizationOperationalAccessPort) {
      throw new NotFoundException('OT de ejecución no encontrada');
    }

    const allowed = await this.organizationOperationalAccessPort.canSuperviseExecutionOrder(
      manager,
      {
        tenantId,
        userId: actor.sub,
        organizationSiteId: order.organizationSiteId,
      },
    );
    if (!allowed) {
      throw new NotFoundException('OT de ejecución no encontrada');
    }
  }

  private assertRedriveEventShape(
    event: ExecutionOrderOutboxEvent,
  ): asserts event is ExecutionOrderOutboxEvent & { eventType: OperationalEventTypeV1 } {
    if (!REDRIVE_ALLOWED_EVENT_TYPES.has(event.eventType as OperationalEventTypeV1)) {
      throw new NotFoundException('Evento operativo no encontrado');
    }
    if (!isRecord(event.payload) || event.payload.executionOrderId !== event.aggregateId) {
      throw new NotFoundException('Evento operativo no encontrado');
    }
  }

  /**
   * Enriquece el contexto MATERIAL con la categoría canónica del catálogo.
   *
   * El evaluador recibe solo datos autoritativos: el cliente no puede declarar
   * la categoría y el servicio no la infiere desde el identificador del ítem.
   * Si Inventario no puede entregar un recibo, se conserva el itemId sin
   * categoría para que el gate permanezca fail-closed.
   */
  private async buildMaterialEvaluationUsages(
    requirements: ExecutionOrderTemplateRequirement[],
    usages: ExecutionOrderItemUsage[],
  ): Promise<
    Array<{ itemId: string; itemCategory?: string; finalDisposition?: InventoryDisposition }>
  > {
    const hasMaterialRequirement = requirements.some(
      (requirement) => requirement.kind === 'MATERIAL',
    );
    // La disposición viaja siempre al contexto (MOD11 T1 B1, spec §4.3): es el
    // evaluador quien decide si la exige, según lo declarado por el requisito.
    if (!hasMaterialRequirement) {
      return usages.map((usage) => ({
        itemId: usage.itemId,
        ...(usage.finalDisposition === undefined
          ? {}
          : { finalDisposition: usage.finalDisposition }),
      }));
    }

    return Promise.all(
      usages.map(async (usage) => {
        const disposition =
          usage.finalDisposition === undefined ? {} : { finalDisposition: usage.finalDisposition };
        if (!this.inventoryService) {
          return { itemId: usage.itemId, ...disposition };
        }

        try {
          const receipt = await this.inventoryService.getItemCategoryReceipt(usage.itemId);
          const categoryCode = receipt.categoryCode.trim();
          return categoryCode.length > 0
            ? { itemId: usage.itemId, itemCategory: categoryCode, ...disposition }
            : { itemId: usage.itemId, ...disposition };
        } catch {
          return { itemId: usage.itemId, ...disposition };
        }
      }),
    );
  }

  private assertVersion(order: ExecutionOrder, ifMatch?: string): void {
    if (!ifMatch) return;
    // `If-Match` es el número de versión de la orden, NO el ETag. Tras retirar
    // el prefijo débil `W/` y las comillas, debe quedar un entero completo:
    // `Number.parseInt('1.1-7', 10)` devuelve 1 sin error, así que un parseo
    // tolerante convertiría un ETag devuelto como `If-Match` en un
    // `VERSION_CONFLICT` engañoso. El formato inválido es 400 (validación),
    // distinto del 409 de conflicto real (MOD11 hallazgo ETag 2026-09-14).
    const unquoted = ifMatch.replace(/^W\//u, '').replace(/^"|"$/gu, '');
    if (!/^\d+$/u.test(unquoted)) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'El encabezado If-Match debe contener únicamente el número de versión de la OT.',
      });
    }
    const expected = Number.parseInt(unquoted, 10);
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

  /**
   * Precondición de los comandos de registro (trabajo realizado, consumo y
   * evidencia): la ejecución debe estar iniciada. Pre-inicio (CREATED,
   * ASSIGNED, EN_ROUTE) se rechaza con 409; la única transición a
   * IN_PROGRESS es start(), que emite ExecutionOrderStartedV1.
   */
  private assertRegistrationActive(order: ExecutionOrder): void {
    if (
      order.status !== ExecutionOrderStatus.IN_PROGRESS &&
      order.status !== ExecutionOrderStatus.BLOCKED
    ) {
      throw new ConflictException({
        code: 'EXECUTION_ORDER_NOT_STARTED',
        message: 'Inicia la ejecución antes de registrar información en esta orden de trabajo.',
      });
    }
  }

  /**
   * Persiste el asiento de transición DENTRO de la misma transacción que el
   * cambio de estado (MOD11 T1 B1, ADR-089 §D1). El caller aporta el manager
   * transaccional activo (`qr.manager` o el de agenda en cancelación): un
   * asiento fuera de esa transacción podría divergir del estado real y
   * vaciaría de valor el registro.
   *
   * Solo hechos (origen, destino, instante, actor, motivo): nunca duraciones
   * calculadas (ADR-089 §D2/R5) ni lecturas de otros módulos (A3).
   */
  private async recordStatusTransition(
    manager: EntityManager,
    tenantId: string,
    input: {
      executionOrderId: string;
      fromStatus: ExecutionOrderStatus;
      toStatus: ExecutionOrderStatus;
      changedAt?: Date;
      actorUserId: string;
      reason?: string | null | undefined;
    },
  ): Promise<void> {
    const seat: DeepPartial<ExecutionOrderStatusTransition> = {
      tenantId,
      executionOrderId: input.executionOrderId,
      fromStatus: input.fromStatus,
      toStatus: input.toStatus,
      changedAt: input.changedAt ?? new Date(),
      changedBy: input.actorUserId,
      reason: this.toTransitionReason(input.reason),
      // Adenda B1c (spec §4.3): el registro B1 es siempre asiento original,
      // nunca corrección. La lógica de corrección aditiva es B2.
      correctionOfId: null,
    };
    await manager.save(ExecutionOrderStatusTransition, seat);
  }

  /**
   * Normaliza el motivo del asiento a la columna `reason` (varchar 255,
   * nullable): texto recortado o `null` cuando no hay motivo. Nunca inventa
   * un motivo (spec §4.5): ausente es ausente.
   */
  private toTransitionReason(value: string | null | undefined): string | null {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    if (trimmed.length === 0) return null;
    return trimmed.slice(0, 255);
  }

  /**
   * UPDATE condicional para que dos cierres concurrentes no produzcan dos terminales.
   *
   * T0 (CA-01/CA-03): el UPDATE escribe el núcleo que todo comando declara
   * (estado, resultado, versión, instantes, notas y actor) y SOLO además los
   * campos que el comando llamador declara explícitamente en `options`.
   * Ampliar el `.set()` a «todos los campos» sin criterio haría que cualquier
   * mutación accidental en memoria llegara a la base; el mecanismo opt-in por
   * comando conserva la protección del conjunto acotado y hace visible en cada
   * llamada qué persiste. `assignment: true` lo declara únicamente `assign()`.
   */
  private async persistOrderOptimistically(
    manager: EntityManager,
    order: ExecutionOrder,
    expectedVersion: number,
    options?: { assignment?: boolean; annulment?: boolean },
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
        // Solo el comando que declara la asignación la persiste. Ningún otro
        // comando muta estas columnas, así que su valor en memoria es siempre
        // el ya persistido y este spread es neutro para ellos incluso si algún
        // día lo incluyeran por error de llamada: la declaración vive en el
        // llamador, no en el mecanismo.
        ...(options?.assignment === true
          ? {
              assignedTechnicianId: order.assignedTechnicianId,
              assignedCrewId: order.assignedCrewId,
            }
          : {}),
        // MOD11 T2: `annulment: true` lo declara únicamente `annul()`. Misma
        // doctrina que la asignación: la columna discriminadora no viaja en
        // ningún otro UPDATE.
        ...(options?.annulment === true ? { isAnnulled: order.isAnnulled } : {}),
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
    if (context.requireIdempotency && context.requireIfMatch !== false && !context.ifMatch) {
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
    resultResourceRef = aggregateId,
  ): Promise<void> {
    if (!this.reliabilityService || !context || !receipt || receipt.replay) return;
    await this.reliabilityService.completeIdempotency(manager, receipt.intentId, {
      resourceRef: resultResourceRef,
      resultCode: 'ACCEPTED',
      resultStatus: 'COMPLETED',
      resourceVersion: aggregateVersion,
    });
    await this.reliabilityService.appendAuditIntent(manager, {
      tenantId,
      intentId: receipt.intentId,
      actorRef: actor.sub,
      operation,
      resourceRef: resultResourceRef,
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
