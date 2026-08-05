import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { runInTenantSchema, ScheduleEvent, TenantContext, VisitRequest } from '@iwana/db';
import {
  isPlatformOnlyRole,
  ScheduleEventStatus,
  UserStatus,
  UserRole,
  VisitRequestStatus,
  WorkOrderPriority,
  WorkOrderSourceContext,
  WfmWorkType,
} from '@iwana/shared';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { UsersService } from '../../users/users.service';
import {
  CancelVisitRequestInput,
  CancelVisitRequestSchema,
  CreateVisitRequestInput,
  CreateVisitRequestSchema,
  CreateWorkOrderEmbeddedInput,
  ListVisitRequestsQueryDto,
  ListVisitRequestsQuerySchema,
  RecommendVisitRequestInput,
  RecommendVisitRequestSchema,
  RejectVisitRequestInput,
  RejectVisitRequestSchema,
  ScheduleRecommendationRequest,
  ScheduleVisitRequestInput,
  ScheduleVisitRequestSchema,
  UpdateVisitRequestContextInput,
  UpdateVisitRequestContextSchema,
  VISIT_REQUEST_MISSING_FILTER_VALUE,
  VisitRequestFilterOption,
  VisitRequestFilterOptionsQueryDto,
  VisitRequestFilterOptionsQuerySchema,
  VisitRequestFilterOptionsResponse,
  WfmEligibleAssigneeDto,
} from '../dto';
import { WfmTenantSettingsReadPort } from '../ports/wfm-tenant-settings-read.port';
import {
  getLocalDateString,
  isScheduleRangeWithinOperatingWindow,
} from './installation-schedule-window';
import { OperatingWindowResolverService } from './operating-window-resolver.service';
import { ScheduleConflictService } from './schedule-conflict.service';
import { assertScheduleStartNotInPast } from './schedule-past-guard';
import { WorkOrdersService } from './work-orders.service';
import { ExpedienteService } from '../../crm/expedientes/expediente.service';
import {
  EXECUTION_ORDER_SCHEDULING_PORT,
  ExecutionOrderSchedulingPort,
} from '../../tasks/ports/execution-order-scheduling.port';
import { clampPage } from '../../../common/pagination/clamp-page';

const RESTRICTED_ROLES: UserRole[] = [UserRole.TECHNICIAN, UserRole.CONTRACTOR];

const TERMINAL_VISIT_REQUEST_STATUSES = new Set<VisitRequestStatus>([
  VisitRequestStatus.SCHEDULED,
  VisitRequestStatus.CANCELLED,
  VisitRequestStatus.REJECTED,
  VisitRequestStatus.EXPIRED,
]);

const MIN_DURATION_MS = 15 * 60 * 1000;
const VISIT_REQUEST_ACTIVE_ORIGIN_UNIQUE = 'idx_visit_requests_active_origin_unique';

type VisitRequestListResponse = {
  items: VisitRequestResponse[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
};

type VisitRequestResponse = VisitRequest & { customerDisplayName: string | null };

type VisitRequestSchedulingContext = {
  address?: string | null | undefined;
  municipality?: string | null | undefined;
  requestedWindowStartAt?: Date | string | null | undefined;
  requestedWindowEndAt?: Date | string | null | undefined;
};

type TenantUserSummary = Awaited<ReturnType<UsersService['findAll']>>['data'][number];

@Injectable()
export class VisitRequestsService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @Inject(WfmTenantSettingsReadPort)
    private readonly tenantSettingsReadPort: WfmTenantSettingsReadPort,
    private readonly operatingWindowResolver: OperatingWindowResolverService,
    private readonly conflictService: ScheduleConflictService,
    private readonly workOrdersService: WorkOrdersService,
    private readonly expedienteService: ExpedienteService,
    private readonly usersService: UsersService,
    @Optional()
    @Inject(EXECUTION_ORDER_SCHEDULING_PORT)
    private readonly executionOrdersService?: ExecutionOrderSchedulingPort,
  ) {}

  async listEligibleOperationalAssignees(actor: JwtPayload): Promise<WfmEligibleAssigneeDto[]> {
    this.ensureActorCanAccessEligibleAssignees(actor);

    const users = await this.loadSchedulableAssignees();
    return users.map((user) => ({
      id: user.id,
      email: user.email,
      firstName: user.firstName ?? null,
      lastName: user.lastName ?? null,
      role: user.role,
      status: user.status,
      tenantId: user.tenantId,
      isOperationalResource: user.isOperationalResource,
      jobTitle: user.jobTitle ?? null,
      deletedAt: user.deletedAt?.toISOString() ?? null,
    }));
  }

  async listVisitRequests(
    query: ListVisitRequestsQueryDto,
    actor: JwtPayload,
  ): Promise<VisitRequestListResponse> {
    this.ensureActorCanAccessGlobalVisitRequests(actor);

    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const validated = ListVisitRequestsQuerySchema.parse({
      ...query,
      page: query.page ?? 1,
      limit: query.limit ?? 20,
    });
    // D-5 / R-4: validar paginación antes de ocupar conexión del pool.
    const { page, limit } = clampPage(validated.page, validated.limit);

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      await this.reconcileOpenVisitRequestStatuses(qr.manager, tenantId);

      const qb = qr.manager
        .createQueryBuilder(VisitRequest, 'vr')
        .where('vr.tenant_id = :tenantId', { tenantId })
        .andWhere('vr.deleted_at IS NULL');

      if (validated.status) {
        this.applyVisitRequestStatusFilter(qb, validated.status);
      }
      if (validated.originContext) {
        qb.andWhere('vr.origin_context = :originContext', {
          originContext: validated.originContext,
        });
      }
      if (validated.workType) {
        qb.andWhere('vr.work_type = :workType', { workType: validated.workType });
      }
      if (validated.priority) {
        qb.andWhere('vr.priority = :priority', { priority: validated.priority });
      }
      if (validated.municipality) {
        this.applyMunicipalityFilter(qb, validated.municipality);
      }
      if (validated.sector) {
        this.applySectorFilter(qb, validated.sector);
      }
      if (validated.from) {
        qb.andWhere('vr.created_at >= :from', { from: validated.from });
      }
      if (validated.to) {
        qb.andWhere('vr.created_at <= :to', { to: validated.to });
      }

      qb.orderBy('CASE WHEN vr.sla_due_at IS NULL THEN 1 ELSE 0 END', 'ASC')
        .addOrderBy('vr.sla_due_at', 'ASC')
        .addOrderBy('vr.created_at', 'DESC')
        .addOrderBy('vr.id', 'ASC')
        .skip((page - 1) * limit)
        .take(limit);

      const [items, total] = await qb.getManyAndCount();
      const enrichedItems = await this.enrichVisitRequests(items, qr.manager);

      return {
        items: enrichedItems,
        meta: {
          total,
          page,
          limit,
          totalPages: total === 0 ? 0 : Math.ceil(total / limit),
        },
      };
    });
  }

  async getFilterOptions(
    query: VisitRequestFilterOptionsQueryDto,
    actor: JwtPayload,
  ): Promise<VisitRequestFilterOptionsResponse> {
    this.ensureActorCanAccessGlobalVisitRequests(actor);

    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const validated = VisitRequestFilterOptionsQuerySchema.parse({
      ...query,
      includeScheduled: query.includeScheduled ?? false,
    });

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      await this.reconcileOpenVisitRequestStatuses(qr.manager, tenantId);

      const municipalityQb = qr.manager
        .createQueryBuilder(VisitRequest, 'vr')
        .select(
          `COALESCE(NULLIF(TRIM(vr.municipality), ''), '${VISIT_REQUEST_MISSING_FILTER_VALUE}')`,
          'value',
        )
        .addSelect('COUNT(*)::int', 'count')
        .where('vr.tenant_id = :tenantId', { tenantId })
        .andWhere('vr.deleted_at IS NULL')
        .groupBy('value')
        .orderBy('value', 'ASC');

      this.applyFilterOptionsStatusScope(municipalityQb, validated.includeScheduled);

      const sectorQb = qr.manager
        .createQueryBuilder(VisitRequest, 'vr')
        .select(
          `COALESCE(NULLIF(TRIM(vr.sector), ''), '${VISIT_REQUEST_MISSING_FILTER_VALUE}')`,
          'value',
        )
        .addSelect(
          `COALESCE(NULLIF(TRIM(vr.municipality), ''), '${VISIT_REQUEST_MISSING_FILTER_VALUE}')`,
          'municipality',
        )
        .addSelect('COUNT(*)::int', 'count')
        .where('vr.tenant_id = :tenantId', { tenantId })
        .andWhere('vr.deleted_at IS NULL')
        .groupBy('value')
        .addGroupBy('municipality')
        .orderBy('municipality', 'ASC')
        .addOrderBy('value', 'ASC');

      this.applyFilterOptionsStatusScope(sectorQb, validated.includeScheduled);
      if (validated.municipality) {
        this.applyMunicipalityFilter(sectorQb, validated.municipality);
      }

      const [municipalityRows, sectorRows] = await Promise.all([
        municipalityQb.getRawMany<RawFilterOptionRow>(),
        sectorQb.getRawMany<RawFilterOptionRow>(),
      ]);

      return {
        municipalities: municipalityRows.map((row) => this.toFilterOption(row)),
        sectors: sectorRows.map((row) => this.toFilterOption(row, row.municipality)),
      };
    });
  }

  async getVisitRequestById(id: string, actor: JwtPayload): Promise<VisitRequestResponse> {
    this.ensureActorCanAccessGlobalVisitRequests(actor);

    const { tenantId, schemaName } = TenantContext.getOrThrow();

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      await this.reconcileOpenVisitRequestStatuses(qr.manager, tenantId);

      const visitRequest = await qr.manager.findOne(VisitRequest, {
        where: { id, tenantId },
      });

      if (!visitRequest) {
        throw new NotFoundException('Visit request not found');
      }

      this.ensureActorCanAccessVisitRequest(actor, visitRequest);

      return this.enrichVisitRequest(visitRequest, qr.manager);
    });
  }

  async createVisitRequest(
    input: CreateVisitRequestInput,
    actor: JwtPayload,
  ): Promise<VisitRequestResponse> {
    this.ensureActorCanAccessGlobalVisitRequests(actor);

    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const validated = CreateVisitRequestSchema.parse(input);
    this.ensureActorCanCreateVisitRequest(actor, validated.originContext);

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const organizationSiteId = validated.organizationSiteId ?? null;

      // F3.4: normalizar originRef antes de cualquier comparación o persistencia
      const normalizedOriginRef = validated.originRef?.trim() ?? null;

      // F3.3 & F3.1: Guarda de unicidad con advisory lock al inicio de la transacción.
      // Si isAdditional=true, la guarda no aplica (ADR-076 D3: la segunda visita
      // legítima es un acto humano explícito con motivo obligatorio).
      if (!validated.isAdditional && normalizedOriginRef) {
        // F3.1: pg_advisory_xact_lock con clave derivada de la unidad de origen.
        // Previene carreras bajo READ COMMITTED serializando el check + create
        // para la misma tupla (tenantId, originContext, originRef, workType).
        await qr.manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
          `${tenantId}|${validated.originContext}|${normalizedOriginRef}|${validated.workType}`,
        ]);

        const duplicate = await this.findActiveDuplicateByOrigin(
          qr.manager,
          tenantId,
          validated.originContext,
          normalizedOriginRef,
          validated.workType,
        );

        if (duplicate) {
          throw new ConflictException({
            error: 'DUPLICATE_ACTIVE_WORK',
            originRef: normalizedOriginRef,
            activeVisitRequestId: duplicate.id,
          });
        }
      }

      const visitRequest = qr.manager.create(VisitRequest, {
        tenantId,
        status: this.deriveStatusFromContext(validated),
        originContext: validated.originContext,
        // F3.4: persistir originRef normalizado
        originRef: normalizedOriginRef,
        originLabel: validated.originLabel ?? null,
        workType: validated.workType,
        priority: validated.priority ?? WorkOrderPriority.NORMAL,
        title: validated.title,
        description: validated.description ?? null,
        organizationSiteId,
        requestedWindowStartAt: validated.requestedWindowStartAt
          ? new Date(validated.requestedWindowStartAt)
          : null,
        requestedWindowEndAt: validated.requestedWindowEndAt
          ? new Date(validated.requestedWindowEndAt)
          : null,
        slaDueAt: validated.slaDueAt ? new Date(validated.slaDueAt) : null,
        address: validated.address ?? null,
        municipality: validated.municipality ?? null,
        sector: validated.sector ?? null,
        latitude: validated.latitude ?? null,
        longitude: validated.longitude ?? null,
        expedienteId: validated.expedienteId ?? null,
        subscriberId: validated.subscriberId ?? null,
        ticketId: validated.ticketId ?? null,
        contractId: validated.contractId ?? null,
        scheduleEventId: null,
        workOrderId: null,
        executionOrderId: null,
        requestedByUserId: actor.sub,
        scheduledByUserId: null,
        scheduledAt: null,
        cancelledAt: null,
        cancelledByUserId: null,
        cancelReason: null,
        // F3.3: persistir motivo de visita adicional
        additionalReason: validated.isAdditional ? (validated.additionalReason ?? null) : null,
      });

      try {
        const savedVisitRequest = await qr.manager.save(VisitRequest, visitRequest);
        return this.enrichVisitRequest(savedVisitRequest, qr.manager);
      } catch (error) {
        if (this.isActiveOriginUniqueViolation(error)) {
          // Safety net: el índice único de BD detectó una carrera residual.
          // Con el advisory lock esto no debería ocurrir, pero se conserva
          // la defensa para escenarios con escritura directa en BD.
          const existing = await this.findActiveDuplicateByOrigin(
            qr.manager,
            tenantId,
            validated.originContext,
            normalizedOriginRef,
            validated.workType,
          );

          if (existing) {
            throw new ConflictException({
              error: 'DUPLICATE_ACTIVE_WORK',
              originRef: normalizedOriginRef,
              activeVisitRequestId: existing.id,
            });
          }
        }

        throw error;
      }
    });
  }

  /**
   * Versión idempotente de createVisitRequest.
   *
   * Si ya existe una visita activa (no-terminal) para el mismo origen,
   * retorna la visita existente en vez de lanzar ConflictException.
   * Esto evita que callers como el flujo de tickets tengan que manejar
   * el error — simplemente obtienen la visita que ya existe.
   *
   * F4.3 — requestFieldService idempotente (V8).
   */
  async requestFieldService(
    input: CreateVisitRequestInput,
    actor: JwtPayload,
  ): Promise<VisitRequestResponse> {
    try {
      return await this.createVisitRequest(input, actor);
    } catch (error) {
      if (error instanceof ConflictException) {
        const body = error.getResponse() as {
          error?: string;
          activeVisitRequestId?: string;
        };
        if (body?.error === 'DUPLICATE_ACTIVE_WORK' && body?.activeVisitRequestId) {
          // Idempotente: retornar la visita existente en vez de propagar el error.
          return this.getVisitRequestById(body.activeVisitRequestId, actor);
        }
      }
      throw error;
    }
  }

  async updateVisitRequestContext(
    id: string,
    input: UpdateVisitRequestContextInput,
    actor: JwtPayload,
  ): Promise<VisitRequestResponse> {
    this.ensureActorCanAccessGlobalVisitRequests(actor);

    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const validated = UpdateVisitRequestContextSchema.parse(input);

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const visitRequest = await qr.manager.findOne(VisitRequest, {
        where: { id, tenantId },
      });

      if (!visitRequest) {
        throw new NotFoundException('Visit request not found');
      }

      this.ensureActorCanAccessVisitRequest(actor, visitRequest);

      if (
        visitRequest.status !== VisitRequestStatus.PENDING &&
        visitRequest.status !== VisitRequestStatus.NEEDS_CONTEXT &&
        visitRequest.status !== VisitRequestStatus.READY_TO_SCHEDULE &&
        visitRequest.status !== VisitRequestStatus.REQUIRES_RESCHEDULE
      ) {
        throw new BadRequestException(
          `La solicitud esta en estado ${visitRequest.status} y no permite completar contexto`,
        );
      }

      const hasField = (field: keyof UpdateVisitRequestContextInput): boolean =>
        Object.prototype.hasOwnProperty.call(validated, field);

      const organizationSiteId = hasField('organizationSiteId')
        ? (validated.organizationSiteId ?? null)
        : (visitRequest.organizationSiteId ?? null);

      const mergedContext = {
        ...visitRequest,
        ...validated,
        organizationSiteId,
      };

      const updates: Partial<VisitRequest> = {
        description: hasField('description')
          ? (validated.description ?? null)
          : visitRequest.description,
        organizationSiteId,
        requestedWindowStartAt: hasField('requestedWindowStartAt')
          ? validated.requestedWindowStartAt
            ? new Date(validated.requestedWindowStartAt)
            : null
          : visitRequest.requestedWindowStartAt,
        requestedWindowEndAt: hasField('requestedWindowEndAt')
          ? validated.requestedWindowEndAt
            ? new Date(validated.requestedWindowEndAt)
            : null
          : visitRequest.requestedWindowEndAt,
        slaDueAt: hasField('slaDueAt')
          ? validated.slaDueAt
            ? new Date(validated.slaDueAt)
            : null
          : visitRequest.slaDueAt,
        address: hasField('address') ? (validated.address ?? null) : visitRequest.address,
        municipality: hasField('municipality')
          ? (validated.municipality ?? null)
          : visitRequest.municipality,
        sector: hasField('sector') ? (validated.sector ?? null) : visitRequest.sector,
        latitude: hasField('latitude') ? (validated.latitude ?? null) : visitRequest.latitude,
        longitude: hasField('longitude') ? (validated.longitude ?? null) : visitRequest.longitude,
        expedienteId: hasField('expedienteId')
          ? (validated.expedienteId ?? null)
          : visitRequest.expedienteId,
        subscriberId: hasField('subscriberId')
          ? (validated.subscriberId ?? null)
          : visitRequest.subscriberId,
        ticketId: hasField('ticketId') ? (validated.ticketId ?? null) : visitRequest.ticketId,
        contractId: hasField('contractId')
          ? (validated.contractId ?? null)
          : visitRequest.contractId,
        // ADR-077 D3: al corregir contexto no se degrada REQUIRES_RESCHEDULE.
        status:
          visitRequest.status === VisitRequestStatus.REQUIRES_RESCHEDULE
            ? VisitRequestStatus.REQUIRES_RESCHEDULE
            : this.deriveStatusFromContext(mergedContext, visitRequest.status),
      };

      await qr.manager.update(VisitRequest, { id, tenantId }, updates);
      return this.enrichVisitRequest({ ...visitRequest, ...updates } as VisitRequest, qr.manager);
    });
  }

  async prepareVisitRequestRecommendation(
    id: string,
    input: RecommendVisitRequestInput,
    actor: JwtPayload,
  ): Promise<ScheduleRecommendationRequest> {
    this.ensureActorCanAccessGlobalVisitRequests(actor);

    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const validated = RecommendVisitRequestSchema.parse(input);
    const timezone = await this.tenantSettingsReadPort.getTimezone(tenantId);

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const visitRequest = await qr.manager.findOne(VisitRequest, {
        where: { id, tenantId },
      });

      if (!visitRequest) {
        throw new NotFoundException('Visit request not found');
      }

      this.ensureActorCanAccessVisitRequest(actor, visitRequest);

      const horizonWindow = this.resolveSearchHorizonWindow(validated.searchHorizonDays, timezone);
      const hasExplicitWindow = Boolean(validated.windowStartAt || validated.windowEndAt);
      const shouldPrioritizeHorizon =
        !hasExplicitWindow && validated.searchHorizonDays !== undefined;
      const persistedWindowStartAt = visitRequest.requestedWindowStartAt?.toISOString();
      const persistedWindowEndAt = visitRequest.requestedWindowEndAt?.toISOString();
      const effectiveWindowStartAt = shouldPrioritizeHorizon
        ? (horizonWindow?.windowStartAt ?? null)
        : (validated.windowStartAt ??
          persistedWindowStartAt ??
          horizonWindow?.windowStartAt ??
          null);
      const effectiveWindowEndAt = shouldPrioritizeHorizon
        ? (horizonWindow?.windowEndAt ?? null)
        : (validated.windowEndAt ?? persistedWindowEndAt ?? horizonWindow?.windowEndAt ?? null);
      const resolvedMunicipality = validated.municipality ?? visitRequest.municipality;
      const resolvedSector = validated.sector ?? visitRequest.sector;
      const resolvedLatitude = validated.latitude ?? visitRequest.latitude;
      const resolvedLongitude = validated.longitude ?? visitRequest.longitude;

      if (TERMINAL_VISIT_REQUEST_STATUSES.has(visitRequest.status)) {
        throw new BadRequestException('La solicitud esta cerrada y no permite recomendaciones.');
      }

      const missingFields = [
        !(visitRequest.address && visitRequest.address.trim().length > 0)
          ? 'direccion operativa'
          : null,
        !resolvedMunicipality ? 'municipio' : null,
        !(effectiveWindowStartAt && effectiveWindowEndAt) ? 'horizonte de busqueda' : null,
      ].filter((value): value is string => value !== null);

      if (missingFields.length > 0) {
        throw new BadRequestException(
          `La solicitud no esta lista para recomendar agenda. Completa: ${missingFields.join(', ')}.`,
        );
      }

      if (!effectiveWindowStartAt || !effectiveWindowEndAt || !resolvedMunicipality) {
        throw new BadRequestException(
          'La solicitud no tiene contexto suficiente para recomendar agenda.',
        );
      }

      const organizationSiteId =
        validated.organizationSiteId ?? visitRequest.organizationSiteId ?? null;
      await this.assertEligibleOperationalCandidates(validated.candidateUserIds);

      return {
        workType: visitRequest.workType,
        durationMinutes: validated.durationMinutes,
        candidateUserIds: validated.candidateUserIds,
        organizationSiteId: organizationSiteId ?? undefined,
        windowStartAt: effectiveWindowStartAt,
        windowEndAt: effectiveWindowEndAt,
        municipality: resolvedMunicipality,
        sector: resolvedSector,
        latitude: resolvedLatitude,
        longitude: resolvedLongitude,
        maxResults: validated.maxResults,
      };
    });
  }

  async scheduleVisitRequest(
    id: string,
    input: ScheduleVisitRequestInput,
    actor: JwtPayload,
  ): Promise<VisitRequestResponse> {
    this.ensureActorCanAccessGlobalVisitRequests(actor);

    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const validated = ScheduleVisitRequestSchema.parse(input);

    const startAt = new Date(validated.scheduledStartAt);
    const endAt = new Date(validated.scheduledEndAt);
    if (endAt.getTime() - startAt.getTime() < MIN_DURATION_MS) {
      throw new BadRequestException('La duracion minima de la agenda es de 15 minutos');
    }

    assertScheduleStartNotInPast(startAt);

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      // F3.2: SELECT ... FOR UPDATE — bloqueo pesimista sobre la VisitRequest.
      // Previene que dos schedulers concurrentes agenden la misma solicitud.
      const visitRequest = await qr.manager.findOne(VisitRequest, {
        where: { id, tenantId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!visitRequest) {
        throw new NotFoundException('Visit request not found');
      }

      this.ensureActorCanAccessVisitRequest(actor, visitRequest);

      // F3.5: Reagendar tras no ejecución NO activa la guarda de unicidad.
      // REQUIRES_RESCHEDULE viene de un intento fallido previo (ADR-077 D8):
      // es el MISMO trabajo que vuelve, no uno nuevo. No se aplica advisory
      // lock ni verificación de duplicados.
      if (visitRequest.status !== VisitRequestStatus.REQUIRES_RESCHEDULE) {
        // F3.1: Advisory lock por unidad de origen para prevenir carreras
        // entre scheduleVisitRequest y createVisitRequest concurrentes.
        const normalizedOriginRef = visitRequest.originRef?.trim() ?? null;
        if (normalizedOriginRef) {
          await qr.manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
            `${tenantId}|${visitRequest.originContext}|${normalizedOriginRef}|${visitRequest.workType}`,
          ]);
        }
      }

      if (visitRequest.status === VisitRequestStatus.SCHEDULED && visitRequest.scheduleEventId) {
        const linkedEvent = await qr.manager.findOne(ScheduleEvent, {
          where: { id: visitRequest.scheduleEventId, tenantId },
        });

        // Evento vencido por barrido (D7): no hay early-return silencioso.
        // El coordinador debe decidir en la vista de revisión (Reprogramar / Cerrar).
        if (linkedEvent?.status === ScheduleEventStatus.EXPIRED) {
          throw new BadRequestException(
            'El evento vinculado está vencido. Debe pasar por la revisión de visitas sin realizar (Reprogramar o Cerrar) antes de agendar.',
          );
        }

        return this.enrichVisitRequest(visitRequest, qr.manager);
      }

      if (TERMINAL_VISIT_REQUEST_STATUSES.has(visitRequest.status)) {
        throw new BadRequestException(
          `La solicitud esta en estado terminal (${visitRequest.status}) y no puede agendarse`,
        );
      }

      if (!this.isSchedulableVisitRequestStatus(visitRequest)) {
        throw new BadRequestException('La solicitud no esta lista para agendar');
      }

      // ADR-077 D4: con retryCount >= 3 exige decisión explícita (no muro ciego).
      // El contador solo se incrementa con causas CUSTOMER.
      if ((visitRequest.retryCount ?? 0) >= 3) {
        if (!validated.attemptDecision) {
          throw new BadRequestException(
            "Se alcanzó el límite de 3 intentos imputables al cliente. Indique attemptDecision: 'FORCE_RESCHEDULE' para forzar reprogramación o 'CLOSE_CASE' para cerrar el caso.",
          );
        }

        if (validated.attemptDecision === 'CLOSE_CASE') {
          const closeReason = validated.closeReason?.trim();
          if (!closeReason) {
            throw new BadRequestException(
              'Al cerrar el caso tras el límite de intentos debes indicar closeReason (motivo del cierre).',
            );
          }
          const closeUpdates: Partial<VisitRequest> = {
            status: VisitRequestStatus.CANCELLED,
            cancelReason: closeReason,
            cancelledAt: new Date(),
            cancelledByUserId: actor.sub,
          };
          await qr.manager.update(VisitRequest, { id, tenantId }, closeUpdates);
          return this.enrichVisitRequest(
            { ...visitRequest, ...closeUpdates } as VisitRequest,
            qr.manager,
          );
        }
        // FORCE_RESCHEDULE → continúa el agendamiento
      }

      await this.assertEligibleOperationalAssignee(validated.assignedUserId);

      const organizationSiteId =
        validated.organizationSiteId ?? visitRequest.organizationSiteId ?? null;

      await this.assertInstallationScheduleWindow(
        qr.manager,
        visitRequest.workType,
        tenantId,
        organizationSiteId,
        validated.assignedUserId,
        startAt,
        endAt,
      );

      const hasConflict = await this.conflictService.hasConflictWithManager(qr.manager, {
        tenantId,
        assignedUserId: validated.assignedUserId,
        scheduledStartAt: validated.scheduledStartAt,
        scheduledEndAt: validated.scheduledEndAt,
      });

      if (hasConflict) {
        throw new BadRequestException(
          'La persona asignada ya tiene un evento activo en ese rango horario',
        );
      }

      const resolvedExpedienteId = this.resolveCrmExpedienteId(visitRequest);

      const scheduleEvent = qr.manager.create(ScheduleEvent, {
        tenantId,
        type: visitRequest.workType,
        status: ScheduleEventStatus.SCHEDULED,
        title: visitRequest.title,
        description: visitRequest.description ?? null,
        scheduledStartAt: startAt,
        scheduledEndAt: endAt,
        assignedUserId: validated.assignedUserId,
        organizationSiteId,
        address: visitRequest.address ?? null,
        municipality: visitRequest.municipality ?? null,
        sector: visitRequest.sector ?? null,
        latitude:
          visitRequest.latitude !== null && visitRequest.latitude !== undefined
            ? String(visitRequest.latitude)
            : null,
        longitude:
          visitRequest.longitude !== null && visitRequest.longitude !== undefined
            ? String(visitRequest.longitude)
            : null,
        expedienteId: resolvedExpedienteId,
        subscriberId: visitRequest.subscriberId ?? null,
        ticketId: visitRequest.ticketId ?? null,
        contractId: visitRequest.contractId ?? null,
        workOrderId: null,
        executionOrderId: null,
        createdBy: actor.sub,
        updatedBy: actor.sub,
      });

      const savedEvent = await qr.manager.save(ScheduleEvent, scheduleEvent);

      let workOrderId: string | null = null;
      let executionOrderId: string | null = null;

      if (validated.createWorkOrder !== false) {
        const workOrderInput: CreateWorkOrderEmbeddedInput = {
          type: visitRequest.workType,
          priority: visitRequest.priority,
          sourceContext: visitRequest.originContext,
          sourceRef: visitRequest.originRef,
          summary: validated.workOrderSummary?.trim() || visitRequest.title,
          notes: validated.workOrderNotes ?? visitRequest.description,
        };

        const workOrder = await this.workOrdersService.createWithinManager(
          qr.manager,
          tenantId,
          workOrderInput,
          validated.assignedUserId,
          actor.sub,
          savedEvent.id,
        );

        workOrderId = workOrder.id;
        savedEvent.workOrderId = workOrder.id;
      }

      if (this.executionOrdersService) {
        const customerDisplayLabel =
          (await this.resolveCustomerDisplayName(visitRequest)) ??
          visitRequest.originLabel ??
          visitRequest.title;

        const executionOrder = await this.executionOrdersService.createFromSchedulingWithManager(
          qr.manager,
          tenantId,
          {
            visitRequestId: visitRequest.id,
            scheduleEventId: savedEvent.id,
            organizationSiteId: savedEvent.organizationSiteId,
            assignedTechnicianId: validated.assignedUserId,
            originContext: visitRequest.originContext,
            originRefId: visitRequest.originRef,
            taskId:
              visitRequest.originContext === WorkOrderSourceContext.TASKS
                ? visitRequest.originRef
                : null,
            ticketId: visitRequest.ticketId ?? null,
            subscriberId: visitRequest.subscriberId ?? null,
            customerDisplayLabel,
            serviceAddress: visitRequest.address ?? null,
            municipality: visitRequest.municipality ?? null,
            sector: visitRequest.sector ?? null,
            workType: visitRequest.workType,
            workSummary: validated.workOrderSummary?.trim() || visitRequest.title,
            workInstructions: validated.workOrderNotes ?? visitRequest.description,
            plannedWindowStartAt: validated.scheduledStartAt,
            plannedWindowEndAt: validated.scheduledEndAt,
          },
          actor,
        );

        if (executionOrder?.id) {
          executionOrderId = executionOrder.id;
          savedEvent.executionOrderId = executionOrder.id;
        }
      }

      await qr.manager.save(ScheduleEvent, savedEvent);

      // Al reagendar, se reanuda el SLA (limpiar pausa si existía).
      // ADR-077 D5: el SLA nunca se reinicia; la pausa descuenta el tiempo acumulado.
      const shouldResumeSla = visitRequest.slaPausedAt !== null;

      const updates: Partial<VisitRequest> = {
        status: VisitRequestStatus.SCHEDULED,
        scheduleEventId: savedEvent.id,
        workOrderId,
        executionOrderId,
        organizationSiteId,
        scheduledByUserId: actor.sub,
        scheduledAt: new Date(),
        ...(shouldResumeSla ? { slaPausedAt: null } : {}),
        ...(resolvedExpedienteId && !visitRequest.expedienteId
          ? { expedienteId: resolvedExpedienteId }
          : {}),
      };

      await qr.manager.update(VisitRequest, { id, tenantId }, updates);
      return this.enrichVisitRequest({ ...visitRequest, ...updates } as VisitRequest, qr.manager);
    });
  }

  private async assertInstallationScheduleWindow(
    manager: EntityManager,
    workType: WfmWorkType,
    tenantId: string,
    organizationSiteId: string | null,
    technicianId: string,
    startAt: Date,
    endAt: Date,
  ): Promise<void> {
    if (workType !== WfmWorkType.INSTALLATION) {
      return;
    }

    const timezone = await this.tenantSettingsReadPort.getTimezone(tenantId);
    const dateLocal = getLocalDateString(startAt, timezone);

    if (!dateLocal) {
      throw new BadRequestException(
        'La fecha de instalacion no pudo resolverse en el timezone del tenant.',
      );
    }

    const window = await this.operatingWindowResolver.resolveWithManager(manager, {
      tenantId,
      organizationSiteId,
      technicianId,
      dateLocal,
      timezone,
    });

    if (
      window.status !== 'OPEN' ||
      !window.startTime ||
      !window.endTime ||
      !isScheduleRangeWithinOperatingWindow(startAt, endAt, timezone, {
        startTime: window.startTime,
        endTime: window.endTime,
      })
    ) {
      throw new BadRequestException(
        'La instalacion debe quedar dentro del horario operativo configurado.',
      );
    }
  }

  async cancelVisitRequest(
    id: string,
    input: CancelVisitRequestInput,
    actor: JwtPayload,
  ): Promise<VisitRequestResponse> {
    this.ensureActorCanAccessGlobalVisitRequests(actor);

    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const validated = CancelVisitRequestSchema.parse(input);

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const visitRequest = await qr.manager.findOne(VisitRequest, {
        where: { id, tenantId },
      });

      if (!visitRequest) {
        throw new NotFoundException('Visit request not found');
      }

      this.ensureActorCanAccessVisitRequest(actor, visitRequest);

      if (visitRequest.status === VisitRequestStatus.CANCELLED) {
        return this.enrichVisitRequest(visitRequest, qr.manager);
      }

      if (visitRequest.status === VisitRequestStatus.SCHEDULED) {
        throw new BadRequestException('La solicitud ya fue agendada y no puede cancelarse aqui');
      }

      if (visitRequest.status === VisitRequestStatus.REJECTED) {
        throw new BadRequestException('La solicitud ya fue rechazada');
      }

      const updates: Partial<VisitRequest> = {
        status: VisitRequestStatus.CANCELLED,
        cancelReason: validated.cancelReason,
        cancelledAt: new Date(),
        cancelledByUserId: actor.sub,
      };

      await qr.manager.update(VisitRequest, { id, tenantId }, updates);
      return this.enrichVisitRequest({ ...visitRequest, ...updates } as VisitRequest, qr.manager);
    });
  }

  async rejectVisitRequest(
    id: string,
    input: RejectVisitRequestInput,
    actor: JwtPayload,
  ): Promise<VisitRequestResponse & { rejectReason?: string | undefined }> {
    this.ensureActorCanAccessGlobalVisitRequests(actor);

    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const validated = RejectVisitRequestSchema.parse(input);

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const visitRequest = await qr.manager.findOne(VisitRequest, {
        where: { id, tenantId },
      });

      if (!visitRequest) {
        throw new NotFoundException('Visit request not found');
      }

      this.ensureActorCanAccessVisitRequest(actor, visitRequest);

      if (visitRequest.status === VisitRequestStatus.REJECTED) {
        return this.enrichVisitRequest(
          { ...visitRequest, rejectReason: visitRequest.cancelReason ?? undefined },
          qr.manager,
        );
      }

      if (visitRequest.status === VisitRequestStatus.SCHEDULED) {
        throw new BadRequestException('La solicitud ya fue agendada y no puede rechazarse');
      }

      const updates: Partial<VisitRequest> = {
        status: VisitRequestStatus.REJECTED,
        cancelReason: validated.rejectReason,
        cancelledAt: new Date(),
        cancelledByUserId: actor.sub,
      };

      await qr.manager.update(VisitRequest, { id, tenantId }, updates);
      return this.enrichVisitRequest(
        {
          ...visitRequest,
          ...updates,
          rejectReason: validated.rejectReason,
        } as VisitRequest & { rejectReason: string },
        qr.manager,
      );
    });
  }

  private async enrichVisitRequest<T extends VisitRequest>(
    visitRequest: T,
    _manager: EntityManager,
  ): Promise<T & { customerDisplayName: string | null }> {
    const normalizedVisitRequest = this.normalizeVisitRequestStatus(visitRequest);
    const customerDisplayName = await this.resolveCustomerDisplayName(normalizedVisitRequest);
    return { ...normalizedVisitRequest, customerDisplayName };
  }

  /**
   * Enriquecimiento batch de visit requests con display names del CRM.
   *
   * Resuelve todos los expedienteId en una sola consulta usando el EntityManager
   * pasado por parámetro (sin abrir nuevas conexiones a la pool). Evita el deadlock
   * N+1 que ocurría cuando cada fila llamaba a findDisplayNameById() por separado.
   */
  private async enrichVisitRequests<T extends VisitRequest>(
    visitRequests: T[],
    manager: EntityManager,
  ): Promise<Array<T & { customerDisplayName: string | null }>> {
    const crmIds: string[] = [];
    const idIndexMap = new Map<number, string>(); // index -> expedienteId

    let index = 0;
    for (const vr of visitRequests) {
      if (vr.originContext === WorkOrderSourceContext.CRM) {
        const expedienteId = this.resolveCrmExpedienteId(vr);
        if (expedienteId) {
          crmIds.push(expedienteId);
          idIndexMap.set(index, expedienteId);
        }
      }
      index++;
    }

    const displayNameMap =
      crmIds.length > 0
        ? await this.expedienteService.findDisplayNamesByIds(manager, crmIds)
        : new Map<string, string | null>();

    return visitRequests.map((vr, i) => {
      const normalized = this.normalizeVisitRequestStatus(vr);
      const expedienteId = idIndexMap.get(i);
      const customerDisplayName = expedienteId ? (displayNameMap.get(expedienteId) ?? null) : null;
      return { ...normalized, customerDisplayName };
    });
  }

  private async resolveCustomerDisplayName(visitRequest: VisitRequest): Promise<string | null> {
    if (visitRequest.originContext !== WorkOrderSourceContext.CRM) {
      return null;
    }

    const expedienteId = this.resolveCrmExpedienteId(visitRequest);
    if (expedienteId) {
      return this.expedienteService.findDisplayNameById(expedienteId);
    }

    const opportunityCode = this.resolveCrmOpportunityCode(visitRequest.originLabel);
    if (!opportunityCode) {
      return null;
    }

    const match = await this.expedienteService.findDisplayNameByShortCode(opportunityCode);
    return match?.displayName ?? null;
  }

  private async assertEligibleOperationalCandidates(candidateUserIds: string[]): Promise<void> {
    const eligibleAssignees = await this.loadSchedulableAssignees();
    const eligibleUserIds = new Set(eligibleAssignees.map((user) => user.id));
    const invalidCandidateUserIds = candidateUserIds.filter(
      (userId) => !eligibleUserIds.has(userId),
    );

    if (invalidCandidateUserIds.length > 0) {
      throw new BadRequestException(
        `Los candidatos seleccionados deben ser personas activas y agendables del tenant: ${invalidCandidateUserIds.join(', ')}.`,
      );
    }
  }

  private async assertEligibleOperationalAssignee(assignedUserId: string): Promise<void> {
    const eligibleAssignees = await this.loadSchedulableAssignees();
    const eligibleUserIds = new Set(eligibleAssignees.map((user) => user.id));

    if (!eligibleUserIds.has(assignedUserId)) {
      throw new BadRequestException(
        'La persona asignada debe ser una persona activa y agendable del tenant.',
      );
    }
  }

  private async loadSchedulableAssignees(): Promise<TenantUserSummary[]> {
    const schedulableUsers: TenantUserSummary[] = [];
    let cursor: string | undefined;

    do {
      const params: Parameters<UsersService['findAll']>[0] = {
        limit: 100,
        status: UserStatus.ACTIVE,
      };
      if (cursor) {
        params.cursor = cursor;
      }

      const result = await this.usersService.findAll(params);

      schedulableUsers.push(...result.data.filter((user) => this.isSchedulableAssignee(user)));
      cursor = result.meta.nextCursor ?? undefined;
    } while (cursor);

    return schedulableUsers;
  }

  private isSchedulableAssignee(user: TenantUserSummary): boolean {
    return (
      user.status === UserStatus.ACTIVE &&
      user.deletedAt === null &&
      // Frontera de procedencia (ADR-061 §4): la fila puede ser anterior al
      // estrechamiento del dominio, asi que se comprueba el literal persistido.
      !isPlatformOnlyRole(user.role)
    );
  }

  private resolveCrmExpedienteId(visitRequest: VisitRequest): string | null {
    const idPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    if (visitRequest.expedienteId && idPattern.test(visitRequest.expedienteId)) {
      return visitRequest.expedienteId;
    }

    if (visitRequest.originRef && idPattern.test(visitRequest.originRef)) {
      return visitRequest.originRef;
    }

    return null;
  }

  private resolveCrmOpportunityCode(originLabel: string | null): string | null {
    const match = originLabel?.trim().match(/^Oportunidad\s+([A-Za-z0-9-]+)/i);
    return match?.[1] ? match[1].toUpperCase() : null;
  }

  private ensureActorCanAccessGlobalVisitRequests(actor: JwtPayload): void {
    if (RESTRICTED_ROLES.includes(actor.role as UserRole)) {
      throw new ForbiddenException('No tienes permisos para acceder a la bandeja global');
    }
  }

  private ensureActorCanAccessEligibleAssignees(actor: JwtPayload): void {
    if (
      [
        UserRole.ADMIN,
        UserRole.NOC,
        UserRole.SUPPORT,
        UserRole.SALES,
        UserRole.TECHNICIAN,
        UserRole.CONTRACTOR,
      ].includes(actor.role as UserRole)
    ) {
      return;
    }

    throw new ForbiddenException('No tienes permisos para consultar responsables operativos');
  }

  private ensureActorCanCreateVisitRequest(
    actor: JwtPayload,
    originContext: WorkOrderSourceContext,
  ): void {
    const role = actor.role as UserRole;

    if (role === UserRole.SALES && originContext !== WorkOrderSourceContext.CRM) {
      throw new ForbiddenException('SALES solo puede crear solicitudes originadas desde CRM');
    }

    if (
      originContext === WorkOrderSourceContext.TASKS &&
      ![UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT, UserRole.SALES].includes(role)
    ) {
      throw new ForbiddenException('Tu rol no puede crear solicitudes derivadas de tareas.');
    }
  }

  private ensureActorCanAccessVisitRequest(actor: JwtPayload, visitRequest: VisitRequest): void {
    if (
      actor.role === UserRole.SALES &&
      visitRequest.originContext !== WorkOrderSourceContext.CRM
    ) {
      throw new ForbiddenException('SALES solo puede operar solicitudes originadas desde CRM');
    }
  }

  private async findActiveDuplicateByOrigin(
    manager: EntityManager,
    tenantId: string,
    originContext: WorkOrderSourceContext,
    originRef: string | null,
    workType: CreateVisitRequestInput['workType'],
  ): Promise<VisitRequest | null> {
    // F3.4: originRef sin origen o vacío tras trim no es comparable
    const normalizedRef = originRef?.trim();
    if (!normalizedRef) {
      return null;
    }

    return (
      manager
        .createQueryBuilder(VisitRequest, 'vr')
        .where('vr.tenant_id = :tenantId', { tenantId })
        .andWhere('vr.origin_context = :originContext', { originContext })
        // F3.4: comparar con origen normalizado
        .andWhere('TRIM(vr.origin_ref) = :originRef', { originRef: normalizedRef })
        .andWhere('vr.work_type = :workType', { workType })
        .andWhere('vr.deleted_at IS NULL')
        .andWhere('vr.status NOT IN (:...terminalStatuses)', {
          terminalStatuses: Array.from(TERMINAL_VISIT_REQUEST_STATUSES),
        })
        .orderBy('vr.created_at', 'DESC')
        .getOne()
    );
  }

  private isActiveOriginUniqueViolation(error: unknown): boolean {
    if (!error || typeof error !== 'object') {
      return false;
    }

    const candidate = error as { code?: string; constraint?: string; driverError?: unknown };
    const driverError = candidate.driverError as { code?: string; constraint?: string } | undefined;

    return (
      (candidate.code === '23505' || driverError?.code === '23505') &&
      (candidate.constraint === VISIT_REQUEST_ACTIVE_ORIGIN_UNIQUE ||
        driverError?.constraint === VISIT_REQUEST_ACTIVE_ORIGIN_UNIQUE)
    );
  }

  private deriveStatusFromContext(
    input: VisitRequestSchedulingContext,
    currentStatus?: VisitRequestStatus,
  ): VisitRequestStatus {
    const hasAddress = Boolean(input.address && input.address.trim().length > 0);
    const hasMunicipality = Boolean(input.municipality && input.municipality.trim().length > 0);

    if (hasAddress && hasMunicipality) {
      return VisitRequestStatus.READY_TO_SCHEDULE;
    }

    if (!hasAddress && !hasMunicipality) {
      return VisitRequestStatus.NEEDS_CONTEXT;
    }

    return VisitRequestStatus.NEEDS_CONTEXT;
  }

  /**
   * Proyección de lectura para READY_TO_SCHEDULE / NEEDS_CONTEXT (contexto incompleto).
   * No degrada REQUIRES_RESCHEDULE ni otros estados persistidos (ADR-077 D3).
   */
  private getEffectiveVisitRequestStatus(
    visitRequest: Pick<VisitRequest, 'status' | 'address' | 'municipality'>,
  ): VisitRequestStatus {
    if (
      visitRequest.status === VisitRequestStatus.READY_TO_SCHEDULE ||
      visitRequest.status === VisitRequestStatus.NEEDS_CONTEXT
    ) {
      return this.deriveStatusFromContext(visitRequest, visitRequest.status);
    }

    return visitRequest.status;
  }

  /**
   * Agendabilidad separada de la proyección de status (ADR-077 D3).
   * REQUIRES_RESCHEDULE es agendable sin degradarse a READY_TO_SCHEDULE.
   */
  private isSchedulableVisitRequestStatus(
    visitRequest: Pick<VisitRequest, 'status' | 'address' | 'municipality'>,
  ): boolean {
    if (visitRequest.status === VisitRequestStatus.REQUIRES_RESCHEDULE) {
      return true;
    }

    return (
      this.getEffectiveVisitRequestStatus(visitRequest) === VisitRequestStatus.READY_TO_SCHEDULE
    );
  }

  private normalizeVisitRequestStatus<T extends VisitRequest>(visitRequest: T): T {
    const effectiveStatus = this.getEffectiveVisitRequestStatus(visitRequest);

    if (effectiveStatus === visitRequest.status) {
      return visitRequest;
    }

    return {
      ...visitRequest,
      status: effectiveStatus,
    } as T;
  }

  /**
   * SQL de filtro para READY_TO_SCHEDULE / NEEDS_CONTEXT por contexto.
   * No convierte REQUIRES_RESCHEDULE → READY_TO_SCHEDULE (ADR-077 D3).
   */
  private buildEffectiveStatusSql(alias: string): string {
    return `CASE
      WHEN ${alias}.status IN ('${VisitRequestStatus.READY_TO_SCHEDULE}', '${VisitRequestStatus.NEEDS_CONTEXT}')
      THEN CASE
        WHEN NULLIF(TRIM(${alias}.address), '') IS NOT NULL
         AND NULLIF(TRIM(${alias}.municipality), '') IS NOT NULL
        THEN '${VisitRequestStatus.READY_TO_SCHEDULE}'::visit_request_status
        ELSE '${VisitRequestStatus.NEEDS_CONTEXT}'::visit_request_status
      END
      ELSE ${alias}.status
    END`;
  }

  private buildStatusReconciliationSql(alias: string): string {
    return `CASE
      WHEN NULLIF(TRIM(${alias}.address), '') IS NOT NULL
       AND NULLIF(TRIM(${alias}.municipality), '') IS NOT NULL
      THEN '${VisitRequestStatus.READY_TO_SCHEDULE}'::visit_request_status
      ELSE '${VisitRequestStatus.NEEDS_CONTEXT}'::visit_request_status
    END`;
  }

  private async reconcileOpenVisitRequestStatuses(
    manager: EntityManager,
    tenantId: string,
  ): Promise<void> {
    const nextStatusSql = this.buildStatusReconciliationSql('vr');

    await manager.query(
      `UPDATE visit_requests vr
       SET status = ${nextStatusSql},
           updated_at = NOW()
       WHERE vr.tenant_id = $1
         AND vr.deleted_at IS NULL
         AND vr.status IN ('${VisitRequestStatus.READY_TO_SCHEDULE}'::visit_request_status, '${VisitRequestStatus.NEEDS_CONTEXT}'::visit_request_status)
         AND vr.status IS DISTINCT FROM ${nextStatusSql}`,
      [tenantId],
    );
  }

  private applyVisitRequestStatusFilter(
    qb: ReturnType<EntityManager['createQueryBuilder']>,
    status: VisitRequestStatus,
  ): void {
    if (
      status === VisitRequestStatus.READY_TO_SCHEDULE ||
      status === VisitRequestStatus.NEEDS_CONTEXT
    ) {
      qb.andWhere(`${this.buildEffectiveStatusSql('vr')} = :status`, { status });
      return;
    }

    qb.andWhere('vr.status = :status', { status });
  }

  private applyFilterOptionsStatusScope(
    qb: ReturnType<EntityManager['createQueryBuilder']>,
    includeScheduled: boolean,
  ): void {
    const excludedStatuses = includeScheduled
      ? [VisitRequestStatus.CANCELLED, VisitRequestStatus.REJECTED, VisitRequestStatus.EXPIRED]
      : Array.from(TERMINAL_VISIT_REQUEST_STATUSES);

    qb.andWhere('vr.status NOT IN (:...excludedStatuses)', { excludedStatuses });
  }

  private applyMunicipalityFilter(
    qb: ReturnType<EntityManager['createQueryBuilder']>,
    municipality: string,
  ): void {
    if (municipality === VISIT_REQUEST_MISSING_FILTER_VALUE) {
      qb.andWhere("(vr.municipality IS NULL OR TRIM(vr.municipality) = '')");
      return;
    }

    qb.andWhere('vr.municipality ILIKE :municipality', {
      municipality: `%${municipality}%`,
    });
  }

  private applySectorFilter(
    qb: ReturnType<EntityManager['createQueryBuilder']>,
    sector: string,
  ): void {
    if (sector === VISIT_REQUEST_MISSING_FILTER_VALUE) {
      qb.andWhere("(vr.sector IS NULL OR TRIM(vr.sector) = '')");
      return;
    }

    qb.andWhere('vr.sector ILIKE :sector', { sector: `%${sector}%` });
  }

  private toFilterOption(row: RawFilterOptionRow, municipality?: string): VisitRequestFilterOption {
    const isMissing = row.value === VISIT_REQUEST_MISSING_FILTER_VALUE;
    const option: VisitRequestFilterOption = {
      value: row.value,
      label: isMissing ? 'Sin dato' : row.value,
      count: Number(row.count),
    };

    if (municipality) {
      option.municipality = municipality;
    }

    return option;
  }

  private resolveSearchHorizonWindow(
    searchHorizonDays?: number,
    timezone = 'UTC',
  ): { windowStartAt: string; windowEndAt: string } | null {
    if (!searchHorizonDays) {
      return null;
    }

    const now = new Date();
    const currentLocalDate = getLocalDateString(now, timezone);

    if (!currentLocalDate) {
      return null;
    }

    const [yearPart, monthPart, dayPart] = currentLocalDate.split('-');
    const year = Number(yearPart);
    const month = Number(monthPart);
    const day = Number(dayPart);

    if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
      return null;
    }

    const targetLocalDate = new Date(Date.UTC(year, month - 1, day + searchHorizonDays - 1));
    const end = this.toUtcInstantFromLocalDateTime(
      timezone,
      targetLocalDate.getUTCFullYear(),
      targetLocalDate.getUTCMonth() + 1,
      targetLocalDate.getUTCDate(),
      23,
      59,
      59,
      999,
    );

    return {
      windowStartAt: now.toISOString(),
      windowEndAt: end.toISOString(),
    };
  }

  private toUtcInstantFromLocalDateTime(
    timezone: string,
    year: number,
    month: number,
    day: number,
    hour: number,
    minute: number,
    second: number,
    millisecond: number,
  ): Date {
    const localAsUtc = Date.UTC(year, month - 1, day, hour, minute, second, millisecond);
    const firstOffset = this.getTimeZoneOffsetMs(new Date(localAsUtc), timezone);
    const firstResult = new Date(localAsUtc - firstOffset);
    const secondOffset = this.getTimeZoneOffsetMs(firstResult, timezone);

    return new Date(localAsUtc - secondOffset);
  }

  private getTimeZoneOffsetMs(date: Date, timezone: string): number {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    });
    const parts = formatter.formatToParts(date);
    const values = Object.fromEntries(
      parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]),
    );

    const localAsUtc = Date.UTC(
      Number(values.year),
      Number(values.month) - 1,
      Number(values.day),
      Number(values.hour),
      Number(values.minute),
      Number(values.second),
      date.getUTCMilliseconds(),
    );

    return localAsUtc - date.getTime();
  }
}

type RawFilterOptionRow = {
  value: string;
  count: string | number;
  municipality?: string;
};
