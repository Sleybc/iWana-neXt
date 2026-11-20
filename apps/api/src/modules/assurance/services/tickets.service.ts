import { ticketTitularReferences } from '../privacy/ticket-titular-references';
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
import { InjectDataSource } from '@nestjs/typeorm';
import { subscriberTicketLinkPredicate } from './subscriber-ticket-link.predicate';
import {
  Brackets,
  DataSource,
  EntityManager,
  In,
  QueryFailedError,
  type QueryRunner,
  type SelectQueryBuilder,
} from 'typeorm';
import {
  SupportTicket,
  TenantContext,
  TicketSlaPolicy,
  TicketWorkOrderLink,
  runInTenantSchema,
  summarizeErrorForLog,
} from '@iwana/db';
import { clampPage } from '../../../common/pagination/clamp-page';
import { applySort } from '../../../common/pagination/apply-sort';
import { buildPageMeta } from '../../../common/pagination/build-page-meta';
import {
  TicketFieldDecision,
  SlaBreachStatus,
  TicketPriority,
  TicketQueue,
  TicketRequesterType,
  TicketSource,
  TicketStatus,
  TicketSubjectType,
  TicketTimelineEventType,
  TicketType,
  UserRole,
  AccessPermissionKey,
  type ExecutionOrderLookupResponse,
  type LinkExecutionOrderResponse,
  type TicketDetailExtension,
  type TicketExecutionOrder,
  type TicketListItemExtension,
  type TicketPartyRef,
  type LinkExecutionOrderBody,
  LinkExecutionOrderBodySchema,
} from '@iwana/shared';
import {
  AssignTicketInput,
  AssignTicketSchema,
  CreateTicketInput,
  CreateTicketSchema,
  FindOrCreateInstallationTicketDto,
  LinkWorkOrderInput,
  LinkWorkOrderSchema,
  ListTicketsQueryInput,
  ListTicketsQuerySchema,
  ListTicketsResponseDto,
  RequestFieldServiceInput,
  RequestFieldServiceSchema,
  TransitionTicketInput,
  TransitionTicketSchema,
  UpdateTicketInput,
  UpdateTicketSchema,
} from '../dto';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { AssuranceFieldServicePort } from '../ports/assurance-field-service.port';
import { FieldServiceWorkPort } from '../ports/field-service-work.port';
import { AssuranceAssigneeNamesPort } from '../ports/assurance-assignee-names.port';
import { PqrService } from './pqr.service';
import {
  escapeLikePattern,
  LIKE_ESCAPE_CLAUSE,
  SLA_BREACH_CASE_SQL,
  WORK_QUEUE_PREDICATE_SQL,
} from './ticket-list-sql';
import { AT_RISK_THRESHOLD_RATIO, SlaService } from './sla.service';
import { TimelineService } from './timeline.service';
import {
  CrmSubscriberReadPort,
  type CrmTicketPartyLookup,
  type CrmTicketPartySnapshot,
} from '../../crm/ports/crm-subscriber-read.port';
import {
  EXECUTION_ORDER_READ_PORT,
  type ExecutionOrderReadPort,
  type TicketExecutionOrderSummary,
} from '../../tasks/ports/execution-order-read.port';
import { EffectivePermissionsService } from '../../access-control/services/effective-permissions.service';
import {
  allowedTicketTransitions,
  isValidTicketTransition,
  needsPqrCompletionCheck,
  requiresPqrCompletion,
  TICKET_OWNERSHIP_RESTRICTED_ROLES,
} from './ticket-transitions';

const RESTRICTED_ROLES: readonly UserRole[] = TICKET_OWNERSHIP_RESTRICTED_ROLES;

/** Tipos de referencia que CRM sabe nombrar, con el permiso de lectura que exige cada uno. */
const CRM_PARTY_READ_PERMISSION: Readonly<
  Record<CrmTicketPartyLookup['type'], AccessPermissionKey>
> = {
  SUBSCRIBER: AccessPermissionKey.CRM_SUBSCRIBERS_READ,
  CONTRACT: AccessPermissionKey.CRM_SUBSCRIBERS_READ,
  EXPEDIENTE: AccessPermissionKey.CRM_EXPEDIENTES_READ,
};

function crmPartyType(type: string | null | undefined): CrmTicketPartyLookup['type'] | null {
  return type === 'SUBSCRIBER' || type === 'CONTRACT' || type === 'EXPEDIENTE' ? type : null;
}

function toExecutionOrderView(order: TicketExecutionOrderSummary): TicketExecutionOrder {
  return {
    id: order.id,
    number: order.executionOrderNumber,
    status: order.status,
    result: order.result,
    closedAt: order.closedAt,
  };
}

export type TicketDetailView = SupportTicket & TicketDetailExtension;

const PRIORITY_RANK_SQL = `CASE st.priority
  WHEN '${TicketPriority.CRITICAL}' THEN 0
  WHEN '${TicketPriority.URGENT}' THEN 1
  WHEN '${TicketPriority.HIGH}' THEN 2
  WHEN '${TicketPriority.NORMAL}' THEN 3
  WHEN '${TicketPriority.LOW}' THEN 4
  ELSE 5 END`;

/** Resuelto, cerrado o cancelado: fuera de «abiertos» (spec MOD05 Soporte §5.2, D1). */
const LIST_CLOSED_STATUSES_SQL = [
  TicketStatus.RESOLVED,
  TicketStatus.CLOSED,
  TicketStatus.CANCELLED,
]
  .map((status) => `'${status}'`)
  .join(', ');

/**
 * Orden por urgencia (spec MOD05 Soporte §5.1, §16 B-3), espejo de `compareTickets` del portal.
 * Abiertos: vencido → en riesgo → prioridad → plazo pendiente más próximo (sin plazo al final)
 * → más antiguo. Luego resueltos y cerrados, el más reciente primero. `id` desempata para que
 * la paginación sea estable. Solo literales de enums y columnas propias: sin entrada del usuario.
 */
function applyUrgencyOrder(qb: SelectQueryBuilder<SupportTicket>, slaCaseExpr: string): void {
  const isClosed = `(st.status IN (${LIST_CLOSED_STATUSES_SQL}))`;
  qb.addSelect(`CASE WHEN ${isClosed} THEN 1 ELSE 0 END`, 'urgency_closed')
    .addSelect(
      `CASE WHEN ${isClosed} THEN 2 ELSE CASE (${slaCaseExpr})
         WHEN '${SlaBreachStatus.RESOLUTION_BREACHED}' THEN 0
         WHEN '${SlaBreachStatus.FIRST_RESPONSE_BREACHED}' THEN 0
         WHEN '${SlaBreachStatus.AT_RISK}' THEN 1
         ELSE 2 END END`,
      'urgency_deadline_state',
    )
    .addSelect(`CASE WHEN ${isClosed} THEN 5 ELSE ${PRIORITY_RANK_SQL} END`, 'urgency_priority')
    .addSelect(
      `CASE WHEN ${isClosed} THEN NULL ELSE LEAST(
         CASE WHEN st.first_responded_at IS NULL THEN st.sla_first_response_at END,
         CASE WHEN st.resolved_at IS NULL AND st.closed_at IS NULL THEN st.sla_resolve_by_at END
       ) END`,
      'urgency_deadline',
    )
    .addSelect(`CASE WHEN ${isClosed} THEN NULL ELSE st.created_at END`, 'urgency_opened_at')
    .addSelect(
      `CASE WHEN ${isClosed} THEN COALESCE(st.closed_at, st.resolved_at, st.updated_at) END`,
      'urgency_closed_at',
    )
    .orderBy('urgency_closed', 'ASC')
    .addOrderBy('urgency_deadline_state', 'ASC')
    .addOrderBy('urgency_priority', 'ASC')
    .addOrderBy('urgency_deadline', 'ASC', 'NULLS LAST')
    .addOrderBy('urgency_opened_at', 'ASC')
    .addOrderBy('urgency_closed_at', 'DESC', 'NULLS LAST')
    .addOrderBy('st.id', 'DESC');
}
const TICKET_NUMBER_RETRY_LIMIT = 3;

/**
 * Campos ordenables del recurso SupportTicket.
 * Vacío hasta Ola 2 (creación de índices compuestos).
 * ADR-065 Ola 1.
 */
const SORTABLE_FIELDS: string[] = [];

const INSTALLATION_OPEN_STATUSES = [
  TicketStatus.OPEN,
  TicketStatus.ASSIGNED,
  TicketStatus.IN_PROGRESS,
  TicketStatus.PENDING_INTERNAL,
  TicketStatus.FIELD_SERVICE_REQUESTED,
];

type UniqueConstraintDriverError = {
  code?: string;
  constraint?: string;
};

function isTicketNumberUniqueViolation(
  error: unknown,
): error is QueryFailedError & { driverError: UniqueConstraintDriverError } {
  if (!(error instanceof QueryFailedError)) {
    return false;
  }

  const driverError = error.driverError as UniqueConstraintDriverError;
  return (
    driverError.code === '23505' && driverError.constraint === 'uq_support_tickets_tenant_number'
  );
}

@Injectable()
export class TicketsService {
  private readonly logger = new Logger(TicketsService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly slaService: SlaService,
    private readonly pqrService: PqrService,
    private readonly timelineService: TimelineService,
    private readonly fieldServicePort: AssuranceFieldServicePort,
    @Inject(CrmSubscriberReadPort)
    private readonly crmSubscriberReadPort: CrmSubscriberReadPort,
    @Optional()
    @Inject(FieldServiceWorkPort)
    private readonly fieldServiceWorkPort?: FieldServiceWorkPort,
    @Optional()
    @Inject(EXECUTION_ORDER_READ_PORT)
    private readonly executionOrderReadPort?: ExecutionOrderReadPort,
    @Optional()
    private readonly effectivePermissionsService?: EffectivePermissionsService,
    @Optional()
    @Inject(AssuranceAssigneeNamesPort)
    private readonly assigneeNamesPort?: AssuranceAssigneeNamesPort,
  ) {}

  async generateTicketNumber(
    manager: Pick<EntityManager, 'createQueryBuilder'>,
    tenantId: string,
  ): Promise<string> {
    const now = new Date();
    const datePart = now.toISOString().slice(0, 10).replace(/-/g, '');
    const prefix = `TK-${datePart}-`;

    const countResult = await manager
      .createQueryBuilder()
      .select('COUNT(*)', 'count')
      .from('support_tickets', 'st')
      .where('st.ticket_number LIKE :prefix', { prefix: `${prefix}%` })
      .andWhere('st.tenant_id = :tenantId', { tenantId })
      .getRawOne<{ count: string }>();

    const seq = (Number.parseInt(countResult?.count ?? '0', 10) + 1).toString().padStart(3, '0');
    return `${prefix}${seq}`;
  }

  async create(input: CreateTicketInput, actor: JwtPayload): Promise<SupportTicket> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const validated = CreateTicketSchema.parse(input);

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      await this.crmSubscriberReadPort.assertWritableReferences(
        ticketTitularReferences(validated),
        qr,
      );
      const createdAt = new Date();
      const isPqr = validated.type === TicketType.PQR;
      const initialStatus = validated.assignedUserId ? TicketStatus.ASSIGNED : TicketStatus.OPEN;

      let appliedPolicy: TicketSlaPolicy | null = null;
      if (!isPqr) {
        appliedPolicy = validated.slaPolicyId
          ? await qr.manager.findOne(TicketSlaPolicy, {
              where: { id: validated.slaPolicyId, tenantId, isActive: true },
            })
          : await this.slaService.findApplicablePolicy(
              qr.manager,
              tenantId,
              validated.type,
              validated.priority ?? TicketPriority.NORMAL,
            );
      }

      const deadlines = isPqr
        ? { slaFirstResponseAt: null, slaResolveByAt: null }
        : this.slaService.calculateDeadlines(appliedPolicy, createdAt);

      let saved: SupportTicket | null = null;

      for (let attempt = 0; attempt < TICKET_NUMBER_RETRY_LIMIT; attempt += 1) {
        const ticketNumber = await this.generateTicketNumber(qr.manager, tenantId);

        const ticket = qr.manager.create(SupportTicket, {
          tenantId,
          ticketNumber,
          type: validated.type,
          status: initialStatus,
          priority: validated.priority ?? TicketPriority.NORMAL,
          source: validated.source,
          subject: validated.subject,
          description: validated.description ?? null,
          requesterType: validated.requesterType,
          requesterRefId: validated.requesterRefId ?? null,
          subjectType: validated.subjectType ?? null,
          subjectRefId: validated.subjectRefId ?? null,
          assignedUserId: validated.assignedUserId ?? null,
          queueName: validated.queueName ?? null,
          slaPolicyId: appliedPolicy?.id ?? validated.slaPolicyId ?? null,
          slaFirstResponseAt: deadlines.slaFirstResponseAt,
          slaResolveByAt: deadlines.slaResolveByAt,
          firstRespondedAt: null,
          resolvedAt: null,
          closedAt: null,
          slaBreachStatus: SlaBreachStatus.OK,
          fieldDecision: validated.fieldDecision,
          workOrderId: null,
          createdByUserId: actor.sub,
          createdAt,
        });

        try {
          saved = await qr.manager.save(SupportTicket, ticket);
          break;
        } catch (error) {
          if (!isTicketNumberUniqueViolation(error) || attempt === TICKET_NUMBER_RETRY_LIMIT - 1) {
            if (attempt === TICKET_NUMBER_RETRY_LIMIT - 1 && isTicketNumberUniqueViolation(error)) {
              throw new ConflictException('No fue posible generar un número único para el ticket');
            }
            throw error;
          }
        }
      }

      if (!saved) {
        throw new ConflictException('No fue posible crear el ticket');
      }

      const derivedStatus = this.slaService.deriveBreachStatus(saved);
      if (derivedStatus !== saved.slaBreachStatus) {
        saved.slaBreachStatus = derivedStatus;
        await qr.manager.update(
          SupportTicket,
          { id: saved.id, tenantId },
          { slaBreachStatus: derivedStatus },
        );
      }

      await this.timelineService.recordWithManager(qr.manager, {
        ticketId: saved.id,
        tenantId,
        eventType: TicketTimelineEventType.CREATED,
        payload: { ticketNumber: saved.ticketNumber, type: saved.type },
        actorUserId: actor.sub,
      });

      if (saved.assignedUserId) {
        await this.timelineService.recordWithManager(qr.manager, {
          ticketId: saved.id,
          tenantId,
          eventType: TicketTimelineEventType.ASSIGNED,
          payload: { assignedUserId: saved.assignedUserId },
          actorUserId: actor.sub,
        });
      }

      if (isPqr) {
        await this.pqrService.createInitialPqrRecord(
          qr.manager,
          saved.id,
          tenantId,
          this.slaService.calculatePqrDeadline(createdAt),
        );
      }

      return saved;
    });
  }

  async list(query: ListTicketsQueryInput, actor: JwtPayload): Promise<ListTicketsResponseDto> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const validated = ListTicketsQuerySchema.parse(query);
    const { page, limit } = clampPage(validated.page, validated.limit);
    const permissions = await this.loadPermissions(actor);
    const subscriberContractIds = validated.subscriberId
      ? await this.crmSubscriberReadPort.listContractIds(
          tenantId,
          schemaName,
          validated.subscriberId,
        )
      : [];
    const subscriberExpedienteId = validated.subscriberId
      ? await this.crmSubscriberReadPort.findExpedienteId(
          tenantId,
          schemaName,
          validated.subscriberId,
        )
      : null;

    const slaCaseExpr = SLA_BREACH_CASE_SQL;
    const canReadSubscribers = permissions.has(AccessPermissionKey.CRM_SUBSCRIBERS_READ);

    const result = await runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const qb = qr.manager
        .createQueryBuilder(SupportTicket, 'st')
        .where('st.tenant_id = :tenantId', { tenantId })
        .addSelect(slaCaseExpr, 'sla_breach_status');

      if (RESTRICTED_ROLES.includes(actor.role as UserRole)) {
        qb.andWhere('st.assigned_user_id = :actorId', { actorId: actor.sub });
      } else if (validated.assignedUserId) {
        qb.andWhere('st.assigned_user_id = :assignedUserId', {
          assignedUserId: validated.assignedUserId,
        });
      }

      if (validated.status) {
        qb.andWhere('st.status = :status', { status: validated.status });
      }

      if (validated.type) {
        qb.andWhere('st.type = :type', { type: validated.type });
      }

      if (validated.priority) {
        qb.andWhere('st.priority = :priority', { priority: validated.priority });
      }

      if (validated.queueName) {
        qb.andWhere('st.queue_name = :queueName', { queueName: validated.queueName });
      }

      if (validated.requesterRefId) {
        qb.andWhere('st.requester_ref_id = :requesterRefId', {
          requesterRefId: validated.requesterRefId,
        });
      }

      if (validated.subscriberId) {
        qb.andWhere(
          subscriberTicketLinkPredicate(
            validated.subscriberId,
            subscriberContractIds,
            subscriberExpedienteId,
          ),
        );
      }

      // Bajar filtro slaBreachStatus al WHERE (DEF-4)
      if (validated.slaBreachStatus) {
        qb.andWhere(`(${slaCaseExpr}) = :slaBreachStatus`, {
          slaBreachStatus: validated.slaBreachStatus,
        });
      }

      // Cola de trabajo (spec MOD10 bandeja §3 J): se combina con los filtros sueltos.
      if (validated.workQueue) {
        qb.andWhere(WORK_QUEUE_PREDICATE_SQL[validated.workQueue], {
          workQueueActorId: actor.sub,
        });
      }

      // Búsqueda (§3 K): número o asunto; cliente solo con crm.subscribers.read y sin titulares
      // protegidos (los filtra el puerto CRM con la regla del detalle).
      if (validated.search) {
        const requesterIds = canReadSubscribers
          ? await this.crmSubscriberReadPort.findTicketRequesterIdsByName(validated.search, qr)
          : [];
        qb.andWhere(
          new Brackets((searchQuery) => {
            searchQuery
              .where(`st.ticket_number ILIKE :searchPattern ${LIKE_ESCAPE_CLAUSE}`)
              .orWhere(`st.subject ILIKE :searchPattern ${LIKE_ESCAPE_CLAUSE}`);
            if (requesterIds.length > 0) {
              searchQuery.orWhere(
                '(st.requester_type = :searchRequesterType AND st.requester_ref_id IN (:...searchRequesterIds))',
                {
                  searchRequesterType: TicketRequesterType.SUBSCRIBER,
                  searchRequesterIds: requesterIds,
                },
              );
            }
          }),
          { searchPattern: `%${escapeLikePattern(validated.search)}%` },
        );
      }

      const totalCount = await qb.getCount();

      // Default primero: TypeORM orderBy() reemplaza el ORDER BY acumulado (O-7(b)).
      if (validated.order === 'urgency') {
        applyUrgencyOrder(qb, slaCaseExpr);
      } else {
        qb.orderBy('st.created_at', 'DESC').addOrderBy('st.id', 'DESC');
      }
      const sortResult = applySort(qb, SORTABLE_FIELDS, validated.sortBy, validated.sortDir);

      const { entities, raw } = await qb
        .skip((page - 1) * limit)
        .take(limit)
        .getRawAndEntities();

      // Merge: el campo derivado sla_breach_status viaja en raw
      const extensions = await this.loadListExtensions(qr, tenantId, entities, permissions);
      const data = entities.map((ticket, idx) => ({
        ...ticket,
        slaBreachStatus: (raw[idx] as Record<string, unknown>)?.sla_breach_status,
        ...extensions(ticket),
      }));

      return { data, total: totalCount, sortResult };
    });

    return {
      data: result.data,
      total: result.total,
      page,
      limit,
      meta: buildPageMeta({
        total: result.total,
        page,
        limit,
        randomAccess: true,
        sortableFields: SORTABLE_FIELDS,
        sortBy: result.sortResult.appliedSortBy ?? undefined,
        sortDir: result.sortResult.appliedSortDir ?? undefined,
      }),
    };
  }

  async getById(id: string, actor: JwtPayload): Promise<SupportTicket> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const ticket = await qr.manager.findOne(SupportTicket, { where: { id, tenantId } });

      if (!ticket) {
        throw new NotFoundException(`Ticket ${id} no encontrado`);
      }

      this._ensureOwnership(ticket, actor);
      return { ...ticket, slaBreachStatus: this.slaService.deriveBreachStatus(ticket) };
    });
  }

  /**
   * Detalle del ticket con nombres, visita, orden de ejecución y destinos de estado (spec
   * MOD10 2026-11-16 §5, D4 = ejecución). Todas las lecturas ajenas van por puertos públicos y
   * con el manager de esta transacción: una conexión por petición. Visita y orden solo con el
   * permiso de lectura de su módulo, como el listado (CA-12): sin él, ni se consultan.
   */
  async getDetail(id: string, actor: JwtPayload): Promise<TicketDetailView> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const permissions = await this.loadPermissions(actor);

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const ticket = await qr.manager.findOne(SupportTicket, { where: { id, tenantId } });
      if (!ticket) {
        throw new NotFoundException(`Ticket ${id} no encontrado`);
      }
      this._ensureOwnership(ticket, actor);

      const { requester, relatedTo } = (
        await this.resolvePartiesForTickets([ticket], qr, permissions, true)
      ).get(ticket.id)!;

      const canReadVisits = permissions.has(AccessPermissionKey.WFM_SCHEDULE_READ);
      const canReadOrders = permissions.has(AccessPermissionKey.OPERATIONS_EXECUTION_ORDERS_READ);

      const activeVisit =
        this.fieldServiceWorkPort && canReadVisits
          ? await this.fieldServiceWorkPort.findActiveForTicket(qr.manager, tenantId, id)
          : null;

      const orders =
        this.executionOrderReadPort && canReadOrders
          ? await this.executionOrderReadPort.findLatestForTicketWithManager(
              qr.manager,
              tenantId,
              id,
            )
          : null;

      const pqrRecordComplete = needsPqrCompletionCheck(ticket.type, ticket.status)
        ? await this.pqrService.isPqrRecordComplete(qr.manager, id, tenantId)
        : true;

      return {
        ...ticket,
        slaBreachStatus: this.slaService.deriveBreachStatus(ticket),
        requester,
        relatedTo,
        activeVisit: activeVisit
          ? {
              id: activeVisit.id,
              status: activeVisit.status,
              windowKind: activeVisit.windowKind,
              windowStartAt: activeVisit.windowStartAt,
              windowEndAt: activeVisit.windowEndAt,
              scheduleEventId: activeVisit.scheduleEventId,
            }
          : null,
        executionOrder: orders ? toExecutionOrderView(orders.latest) : null,
        executionOrderCount: canReadOrders ? (orders?.count ?? 0) : null,
        allowedTransitions: allowedTicketTransitions(ticket, actor, permissions, pqrRecordComplete),
      };
    });
  }

  /**
   * Búsqueda exacta de una orden de ejecución por número (bloque L). 404 si no existe o
   * está anulada. Sin datos del cliente. Además de `assurance.tickets.manage` (controlador)
   * exige `operations.execution_orders.read` con los permisos efectivos, para cubrir perfiles
   * personalizados (S-2): sin él, 403 sin consultar.
   */
  async lookupExecutionOrder(
    executionOrderNumber: string,
    ticketId: string | undefined,
    actor: JwtPayload,
  ): Promise<ExecutionOrderLookupResponse> {
    const permissions = await this.loadPermissions(actor);
    if (!permissions.has(AccessPermissionKey.OPERATIONS_EXECUTION_ORDERS_READ)) {
      throw new ForbiddenException({
        code: 'EXECUTION_ORDERS_READ_REQUIRED',
        message: 'No tienes permiso para consultar órdenes de trabajo.',
      });
    }
    const order = await this.requireExecutionOrderReadPort().findByNumber(executionOrderNumber);
    if (!order || order.isAnnulled) {
      throw new NotFoundException({
        code: 'EXECUTION_ORDER_NOT_FOUND',
        message: 'No hay una orden de trabajo con ese número.',
      });
    }
    return {
      ...toExecutionOrderView(order),
      linkedTicket: !order.ticketId ? 'NONE' : order.ticketId === ticketId ? 'THIS' : 'OTHER',
    };
  }

  /**
   * Vínculo manual ticket → orden de ejecución (D4). MOD11 escribe `ticket_id`; el historial
   * del ticket registra `WORK_ORDER_LINKED` con `executionOrderId`. `work_order_id` no cambia.
   */
  async linkExecutionOrder(
    id: string,
    input: LinkExecutionOrderBody,
    actor: JwtPayload,
  ): Promise<LinkExecutionOrderResponse> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const validated = LinkExecutionOrderBodySchema.parse(input);
    const port = this.requireExecutionOrderReadPort();

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const ticket = await qr.manager.findOne(SupportTicket, { where: { id, tenantId } });
      if (!ticket) {
        throw new NotFoundException(`Ticket ${id} no encontrado`);
      }
      this._ensureOwnership(ticket, actor);
      await this.crmSubscriberReadPort.assertWritableReferences(
        ticketTitularReferences(ticket),
        qr,
      );

      const { order, outcome } = await port.linkTicketWithManager(qr.manager, tenantId, {
        executionOrderId: validated.executionOrderId,
        ticketId: id,
        actorUserId: actor.sub,
      });

      if (outcome === 'LINKED') {
        await this.timelineService.recordWithManager(qr.manager, {
          ticketId: id,
          tenantId,
          eventType: TicketTimelineEventType.WORK_ORDER_LINKED,
          payload: {
            executionOrderId: order.id,
            executionOrderNumber: order.executionOrderNumber,
            notes: validated.notes ?? null,
          },
          actorUserId: actor.sub,
        });
      }

      return { ...toExecutionOrderView(order), outcome };
    });
  }

  private requireExecutionOrderReadPort(): ExecutionOrderReadPort {
    if (!this.executionOrderReadPort) {
      throw new ServiceUnavailableException({
        code: 'EXECUTION_ORDERS_UNAVAILABLE',
        message: 'Las órdenes de trabajo no están disponibles.',
      });
    }
    return this.executionOrderReadPort;
  }

  /**
   * Campos del listado (spec MOD05 pestaña Soporte §16 B-1, B-2): nombre del responsable,
   * visita activa y orden de ejecución, en lote (una consulta por puerto y página) y con el
   * manager de esta transacción. Visita y orden solo con el permiso de lectura de su módulo.
   */
  private async loadListExtensions(
    qr: QueryRunner,
    tenantId: string,
    tickets: readonly SupportTicket[],
    permissions: ReadonlySet<string>,
  ): Promise<(ticket: SupportTicket) => TicketListItemExtension> {
    const ticketIds = tickets.map((ticket) => ticket.id);
    const assigneeIds = tickets
      .map((ticket) => ticket.assignedUserId)
      .filter((id): id is string => typeof id === 'string' && id.length > 0);
    const canReadVisits = permissions.has(AccessPermissionKey.WFM_SCHEDULE_READ);
    const canReadOrders = permissions.has(AccessPermissionKey.OPERATIONS_EXECUTION_ORDERS_READ);
    const empty = new Map<string, never>();
    const manager = qr.manager;

    const names =
      this.assigneeNamesPort && assigneeIds.length > 0
        ? await this.assigneeNamesPort.findDisplayNames(manager, tenantId, assigneeIds)
        : empty;
    const visits =
      this.fieldServiceWorkPort && canReadVisits && ticketIds.length > 0
        ? await this.fieldServiceWorkPort.findActiveForTickets(manager, tenantId, ticketIds)
        : empty;
    const orders =
      this.executionOrderReadPort && canReadOrders && ticketIds.length > 0
        ? await this.executionOrderReadPort.findLatestForTicketsWithManager(
            manager,
            tenantId,
            ticketIds,
          )
        : empty;
    const parties =
      tickets.length > 0
        ? await this.resolvePartiesForTickets(tickets, qr, permissions, false)
        : new Map<string, { requester: TicketPartyRef }>();

    return (ticket) => {
      const visit = visits.get(ticket.id);
      const order = orders.get(ticket.id);
      return {
        assignedUserDisplayName: ticket.assignedUserId
          ? (names.get(ticket.assignedUserId) ?? null)
          : null,
        activeVisit: visit
          ? {
              id: visit.id,
              status: visit.status,
              windowKind: visit.windowKind,
              windowStartAt: visit.windowStartAt,
              windowEndAt: visit.windowEndAt,
              scheduleEventId: visit.scheduleEventId,
            }
          : null,
        executionOrder: order ? toExecutionOrderView(order) : null,
        requesterDisplayName: parties.get(ticket.id)?.requester.displayName ?? null,
      };
    };
  }

  /** Permisos efectivos de quien consulta; sin el servicio, ninguno (fail-closed). */
  private async loadPermissions(actor: JwtPayload): Promise<ReadonlySet<string>> {
    if (!this.effectivePermissionsService) return new Set();
    return new Set(
      await this.effectivePermissionsService.getEffectivePermissionsForUser(actor.sub),
    );
  }

  /**
   * Nombres del solicitante y del relacionado (R4), del detalle y del listado (spec MOD10 bandeja
   * §3 L), en lote: una lectura CRM por llamada. El nombre sale nulo sin permiso de lectura CRM
   * del tipo, con titular protegido, con referencia no resoluble o si CRM falla. La lectura CRM
   * corre en un SAVEPOINT: un error no aborta la transacción del llamante.
   */
  private async resolvePartiesForTickets(
    tickets: readonly SupportTicket[],
    qr: QueryRunner,
    permissions: ReadonlySet<string>,
    includeRelated: boolean,
  ): Promise<Map<string, { requester: TicketPartyRef; relatedTo: TicketPartyRef | null }>> {
    type Slot = { type: string; refId: string | null };
    const slotsOf = (ticket: SupportTicket): [Slot, Slot | null] => [
      { type: ticket.requesterType as string, refId: ticket.requesterRefId ?? null },
      includeRelated && ticket.subjectType
        ? { type: ticket.subjectType as string, refId: ticket.subjectRefId ?? null }
        : null,
    ];

    const lookups: CrmTicketPartyLookup[] = [];
    const seen = new Set<string>();
    for (const ticket of tickets) {
      for (const slot of slotsOf(ticket)) {
        if (!slot) continue;
        const crmType = crmPartyType(slot.type);
        const key = `${crmType}:${slot.refId}`;
        if (
          crmType &&
          slot.refId &&
          permissions.has(CRM_PARTY_READ_PERMISSION[crmType]) &&
          !seen.has(key)
        ) {
          seen.add(key);
          lookups.push({ type: crmType, id: slot.refId });
        }
      }
    }

    let resolved: CrmTicketPartySnapshot[] | null = [];
    if (lookups.length > 0) {
      await qr.query('SAVEPOINT ticket_detail_parties');
      try {
        resolved = await this.crmSubscriberReadPort.resolveTicketParties(lookups, qr);
        await qr.query('RELEASE SAVEPOINT ticket_detail_parties');
      } catch (error) {
        await qr.query('ROLLBACK TO SAVEPOINT ticket_detail_parties');
        resolved = null;
        // Solo clase y sqlstate: ni mensaje, ni nombre, ni referencia del titular (S-7).
        this.logger.warn(
          `Nombres ${tickets.length === 1 ? `del ticket ${tickets[0]!.id}` : `de ${tickets.length} tickets`} no verificados (fail-closed): ${summarizeErrorForLog(error)}`,
        );
      }
    }

    const toRef = (slot: Slot): TicketPartyRef => {
      const base = { type: slot.type as TicketPartyRef['type'], refId: slot.refId };
      const crmType = crmPartyType(slot.type);
      if (!crmType) {
        return { ...base, displayName: null, nameState: 'NOT_APPLICABLE', profile: null };
      }
      if (!slot.refId) {
        return { ...base, displayName: null, nameState: 'NOT_FOUND', profile: null };
      }
      if (!permissions.has(CRM_PARTY_READ_PERMISSION[crmType])) {
        return { ...base, displayName: null, nameState: 'NOT_PERMITTED', profile: null };
      }
      if (resolved === null) {
        return { ...base, displayName: null, nameState: 'UNAVAILABLE', profile: null };
      }
      const match = resolved.find((item) => item.type === crmType && item.id === slot.refId);
      if (!match) {
        return { ...base, displayName: null, nameState: 'UNAVAILABLE', profile: null };
      }
      return {
        ...base,
        displayName: match.state === 'AVAILABLE' ? match.displayName : null,
        nameState: match.state,
        profile: match.profile,
      };
    };

    return new Map(
      tickets.map((ticket) => {
        const [requesterSlot, relatedSlot] = slotsOf(ticket);
        return [
          ticket.id,
          { requester: toRef(requesterSlot), relatedTo: relatedSlot ? toRef(relatedSlot) : null },
        ];
      }),
    );
  }

  async update(id: string, input: UpdateTicketInput, actor: JwtPayload): Promise<SupportTicket> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const validated = UpdateTicketSchema.parse(input);

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const ticket = await qr.manager.findOne(SupportTicket, { where: { id, tenantId } });

      if (!ticket) {
        throw new NotFoundException(`Ticket ${id} no encontrado`);
      }

      this._ensureOwnership(ticket, actor);

      await this.crmSubscriberReadPort.assertWritableReferences(
        ticketTitularReferences(ticket),
        qr,
      );

      const updates: Partial<SupportTicket> = {};
      if (validated.subject !== undefined) updates.subject = validated.subject;
      if (validated.description !== undefined) updates.description = validated.description;
      if (validated.priority !== undefined) updates.priority = validated.priority;
      if (validated.source !== undefined) updates.source = validated.source;
      if (validated.requesterRefId !== undefined) updates.requesterRefId = validated.requesterRefId;
      if (validated.subjectType !== undefined) updates.subjectType = validated.subjectType;
      if (validated.subjectRefId !== undefined) updates.subjectRefId = validated.subjectRefId;
      if (validated.assignedUserId !== undefined) updates.assignedUserId = validated.assignedUserId;
      if (validated.queueName !== undefined) updates.queueName = validated.queueName;
      if (validated.fieldDecision !== undefined) updates.fieldDecision = validated.fieldDecision;

      if (validated.priority !== undefined && ticket.type !== TicketType.PQR) {
        const policy = await this.slaService.findApplicablePolicy(
          qr.manager,
          tenantId,
          ticket.type,
          validated.priority,
        );
        const deadlines = this.slaService.calculateDeadlines(policy, ticket.createdAt);
        updates.slaPolicyId = policy?.id ?? null;
        updates.slaFirstResponseAt = deadlines.slaFirstResponseAt;
        updates.slaResolveByAt = deadlines.slaResolveByAt;
      }

      const nextTicket = Object.assign(new SupportTicket(), ticket, updates);
      updates.slaBreachStatus = this.slaService.deriveBreachStatus(nextTicket);

      await qr.manager.update(SupportTicket, { id, tenantId }, updates);

      if (
        validated.assignedUserId !== undefined &&
        validated.assignedUserId !== ticket.assignedUserId
      ) {
        await this.timelineService.recordWithManager(qr.manager, {
          ticketId: id,
          tenantId,
          eventType: ticket.assignedUserId
            ? TicketTimelineEventType.REASSIGNED
            : TicketTimelineEventType.ASSIGNED,
          payload: {
            previousAssignedUserId: ticket.assignedUserId,
            assignedUserId: validated.assignedUserId,
          },
          actorUserId: actor.sub,
        });
      }

      if (validated.priority !== undefined && validated.priority !== ticket.priority) {
        await this.timelineService.recordWithManager(qr.manager, {
          ticketId: id,
          tenantId,
          eventType: TicketTimelineEventType.PRIORITY_CHANGED,
          payload: { previousPriority: ticket.priority, priority: validated.priority },
          actorUserId: actor.sub,
        });
      }

      return qr.manager.findOneByOrFail(SupportTicket, { id, tenantId });
    });
  }

  async assign(id: string, input: AssignTicketInput, actor: JwtPayload): Promise<SupportTicket> {
    const validated = AssignTicketSchema.parse(input);

    return this.update(
      id,
      {
        assignedUserId: validated.assignedUserId,
        queueName: validated.queueName,
      },
      actor,
    );
  }

  async transitionStatus(
    id: string,
    input: TransitionTicketInput,
    actor: JwtPayload,
  ): Promise<SupportTicket> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const validated = TransitionTicketSchema.parse(input);

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const ticket = await qr.manager.findOne(SupportTicket, { where: { id, tenantId } });

      if (!ticket) {
        throw new NotFoundException(`Ticket ${id} no encontrado`);
      }

      this._ensureOwnership(ticket, actor);

      if (!isValidTicketTransition(ticket.status, validated.status)) {
        throw new BadRequestException(
          `Transición inválida: ${ticket.status} -> ${validated.status}`,
        );
      }

      // D-BT-7 (ampliada): el cambio de estado queda abierto con titular suprimido, con o sin nota.

      // Verificar completitud regulatoria PQR para transiciones a RESOLVED o CLOSED
      if (requiresPqrCompletion(ticket.type, validated.status)) {
        const isComplete = await this.pqrService.isPqrRecordComplete(qr.manager, id, tenantId);
        if (!isComplete) {
          throw new BadRequestException(
            'No se puede cerrar un ticket PQR sin completar el registro regulatorio',
          );
        }
      }

      const now = new Date();
      const updates: Partial<SupportTicket> = { status: validated.status };

      if (
        !ticket.firstRespondedAt &&
        [
          TicketStatus.IN_PROGRESS,
          TicketStatus.PENDING_CUSTOMER,
          TicketStatus.PENDING_INTERNAL,
          TicketStatus.RESOLVED,
        ].includes(validated.status)
      ) {
        updates.firstRespondedAt = now;
      }

      if (validated.status === TicketStatus.RESOLVED) {
        updates.resolvedAt = now;
      }

      if (validated.status === TicketStatus.CLOSED) {
        updates.closedAt = now;
      }

      const nextTicket = Object.assign(new SupportTicket(), ticket, updates);
      updates.slaBreachStatus = this.slaService.deriveBreachStatus(nextTicket);

      await qr.manager.update(SupportTicket, { id, tenantId }, updates);

      // F4.2: Si el ticket se resuelve o cierra sin que se haya ejecutado
      // la visita de campo, cancelar la visita activa asociada (V8).
      if (
        (validated.status === TicketStatus.RESOLVED || validated.status === TicketStatus.CLOSED) &&
        this.fieldServiceWorkPort
      ) {
        await this.fieldServiceWorkPort.cancelActiveForTicket(
          qr.manager,
          tenantId,
          id,
          'Ticket resuelto por canal remoto',
          actor.sub,
        );
      }

      await this.timelineService.recordWithManager(qr.manager, {
        ticketId: id,
        tenantId,
        eventType:
          validated.status === TicketStatus.CLOSED
            ? TicketTimelineEventType.CLOSED
            : TicketTimelineEventType.STATUS_CHANGED,
        payload: {
          from: ticket.status,
          to: validated.status,
          notes: validated.notes ?? null,
        },
        actorUserId: actor.sub,
      });

      return qr.manager.findOneByOrFail(SupportTicket, { id, tenantId });
    });
  }

  async requestFieldService(
    id: string,
    input: RequestFieldServiceInput,
    actor: JwtPayload,
  ): Promise<SupportTicket> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const validated = RequestFieldServiceSchema.parse(input);

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const ticket = await qr.manager.findOne(SupportTicket, { where: { id, tenantId } });

      if (!ticket) {
        throw new NotFoundException(`Ticket ${id} no encontrado`);
      }

      this._ensureOwnership(ticket, actor);

      await this.crmSubscriberReadPort.assertWritableReferences(
        ticketTitularReferences(ticket),
        qr,
      );

      if (![TicketStatus.IN_PROGRESS, TicketStatus.PENDING_INTERNAL].includes(ticket.status)) {
        throw new BadRequestException(
          'Solo se puede solicitar trabajo de campo desde IN_PROGRESS o PENDING_INTERNAL',
        );
      }

      const link = qr.manager.create(TicketWorkOrderLink, {
        ticketId: id,
        tenantId,
        workOrderId: null,
        requestedAt: new Date(),
        requestedByUserId: actor.sub,
        notes: validated.notes ?? null,
      });
      await qr.manager.save(TicketWorkOrderLink, link);

      const updates: Partial<SupportTicket> = {
        status: TicketStatus.FIELD_SERVICE_REQUESTED,
        fieldDecision: TicketFieldDecision.FIELD_SERVICE_REQUIRED,
      };

      if (!ticket.firstRespondedAt) {
        updates.firstRespondedAt = new Date();
      }

      const nextTicket = Object.assign(new SupportTicket(), ticket, updates);
      updates.slaBreachStatus = this.slaService.deriveBreachStatus(nextTicket);

      await qr.manager.update(SupportTicket, { id, tenantId }, updates);

      await this.timelineService.recordWithManager(qr.manager, {
        ticketId: id,
        tenantId,
        eventType: TicketTimelineEventType.FIELD_SERVICE_REQUESTED,
        payload: { notes: validated.notes ?? null },
        actorUserId: actor.sub,
      });

      await this.fieldServicePort.requestFieldService({
        ticketId: id,
        ticketNumber: ticket.ticketNumber ?? null,
        tenantId,
        schemaName,
        priority: ticket.priority,
        subject: ticket.subject,
        requestedByUserId: actor.sub,
        notes: validated.notes ?? null,
      });

      return qr.manager.findOneByOrFail(SupportTicket, { id, tenantId });
    });
  }

  async linkWorkOrder(
    id: string,
    input: LinkWorkOrderInput,
    actor: JwtPayload,
  ): Promise<SupportTicket> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const validated = LinkWorkOrderSchema.parse(input);

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const ticket = await qr.manager.findOne(SupportTicket, { where: { id, tenantId } });

      if (!ticket) {
        throw new NotFoundException(`Ticket ${id} no encontrado`);
      }

      this._ensureOwnership(ticket, actor);

      await this.crmSubscriberReadPort.assertWritableReferences(
        ticketTitularReferences(ticket),
        qr,
      );

      const link = qr.manager.create(TicketWorkOrderLink, {
        ticketId: id,
        tenantId,
        workOrderId: validated.workOrderId,
        requestedAt: new Date(),
        requestedByUserId: actor.sub,
        notes: validated.notes ?? null,
      });
      await qr.manager.save(TicketWorkOrderLink, link);

      await qr.manager.update(
        SupportTicket,
        { id, tenantId },
        {
          workOrderId: validated.workOrderId,
          fieldDecision: TicketFieldDecision.FIELD_SERVICE_REQUIRED,
        },
      );

      await this.timelineService.recordWithManager(qr.manager, {
        ticketId: id,
        tenantId,
        eventType: TicketTimelineEventType.WORK_ORDER_LINKED,
        payload: { workOrderId: validated.workOrderId, notes: validated.notes ?? null },
        actorUserId: actor.sub,
      });

      return qr.manager.findOneByOrFail(SupportTicket, { id, tenantId });
    });
  }

  private _ensureOwnership(ticket: SupportTicket, actor: JwtPayload): void {
    if (RESTRICTED_ROLES.includes(actor.role as UserRole) && ticket.assignedUserId !== actor.sub) {
      throw new ForbiddenException('No tienes acceso a este ticket');
    }
  }

  /**
   * Busca un ticket de instalación abierto para el expediente dado.
   * Si no existe, crea uno nuevo de tipo OPERATIONAL_TASK con cola OPERATIONS.
   * Diseñado para ser idempotente: múltiples llamadas con el mismo expedienteId
   * retornan el mismo ticket mientras haya uno en estado abierto.
   */
  async findOrCreateInstallationTicket(
    dto: FindOrCreateInstallationTicketDto,
    actorUserId: string,
  ): Promise<{ ticket: SupportTicket; created: boolean }> {
    const ctx = TenantContext.getOrThrow();

    return runInTenantSchema(this.dataSource, ctx.schemaName, async (qr) => {
      const existing = await qr.manager.findOne(SupportTicket, {
        where: {
          type: TicketType.OPERATIONAL_TASK,
          subjectType: TicketSubjectType.EXPEDIENTE,
          subjectRefId: dto.expedienteId,
          status: In(INSTALLATION_OPEN_STATUSES),
        },
        order: { createdAt: 'DESC' },
      });

      if (existing) {
        return { ticket: existing, created: false };
      }

      await this.crmSubscriberReadPort.assertWritableReferences(
        [{ type: 'EXPEDIENTE', id: dto.expedienteId }],
        qr,
      );
      const ticketNumber = await this.generateTicketNumber(qr.manager, ctx.tenantId);

      const ticket = qr.manager.create(SupportTicket, {
        tenantId: ctx.tenantId,
        ticketNumber,
        type: TicketType.OPERATIONAL_TASK,
        subjectType: TicketSubjectType.EXPEDIENTE,
        subjectRefId: dto.expedienteId,
        queueName: TicketQueue.OPERATIONS,
        requesterType: TicketRequesterType.INTERNAL_USER,
        status: TicketStatus.OPEN,
        priority: TicketPriority.NORMAL,
        source: TicketSource.INTERNAL,
        subject: `Instalación — ${dto.expedienteFullName}`.slice(0, 200),
        // Sin el identificador del expediente: no se puede leer y ya está en «Relacionado con».
        description: 'Ticket creado automáticamente al programar la visita de instalación.',
        createdByUserId: actorUserId,
      });

      const saved = await qr.manager.save(SupportTicket, ticket);
      return { ticket: saved, created: true };
    });
  }
}
