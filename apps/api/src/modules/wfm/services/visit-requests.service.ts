import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { runInTenantSchema, ScheduleEvent, TenantContext, VisitRequest } from '@iwana/db';
import {
  ScheduleEventStatus,
  UserRole,
  VisitRequestStatus,
  WorkOrderPriority,
  WorkOrderSourceContext,
  WfmWorkType,
} from '@iwana/shared';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
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
} from '../dto';
import { WfmTenantSettingsReadPort } from '../ports/wfm-tenant-settings-read.port';
import { isInstallationScheduleWithinBusinessHours } from './installation-schedule-window';
import { ScheduleConflictService } from './schedule-conflict.service';
import { WorkOrdersService } from './work-orders.service';

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
  items: VisitRequest[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
};

type VisitRequestSchedulingContext = {
  address?: string | null | undefined;
  municipality?: string | null | undefined;
  requestedWindowStartAt?: Date | string | null | undefined;
  requestedWindowEndAt?: Date | string | null | undefined;
};

@Injectable()
export class VisitRequestsService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @Inject(WfmTenantSettingsReadPort)
    private readonly tenantSettingsReadPort: WfmTenantSettingsReadPort,
    private readonly conflictService: ScheduleConflictService,
    private readonly workOrdersService: WorkOrdersService,
  ) {}

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

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const qb = qr.manager
        .createQueryBuilder(VisitRequest, 'vr')
        .where('vr.tenant_id = :tenantId', { tenantId })
        .andWhere('vr.deleted_at IS NULL');

      if (validated.status) {
        qb.andWhere('vr.status = :status', { status: validated.status });
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
        .skip((validated.page - 1) * validated.limit)
        .take(validated.limit);

      const [items, total] = await qb.getManyAndCount();

      return {
        items,
        meta: {
          total,
          page: validated.page,
          limit: validated.limit,
          totalPages: total === 0 ? 0 : Math.ceil(total / validated.limit),
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

  async getVisitRequestById(id: string, actor: JwtPayload): Promise<VisitRequest> {
    this.ensureActorCanAccessGlobalVisitRequests(actor);

    const { tenantId, schemaName } = TenantContext.getOrThrow();

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const visitRequest = await qr.manager.findOne(VisitRequest, {
        where: { id, tenantId },
      });

      if (!visitRequest) {
        throw new NotFoundException('Visit request not found');
      }

      this.ensureActorCanAccessVisitRequest(actor, visitRequest);

      return visitRequest;
    });
  }

  async createVisitRequest(
    input: CreateVisitRequestInput,
    actor: JwtPayload,
  ): Promise<VisitRequest> {
    this.ensureActorCanAccessGlobalVisitRequests(actor);

    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const validated = CreateVisitRequestSchema.parse(input);
    this.ensureActorCanCreateVisitRequest(actor, validated.originContext);

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const duplicate = await this.findActiveDuplicateByOrigin(
        qr.manager,
        tenantId,
        validated.originContext,
        validated.originRef ?? null,
        validated.workType,
      );

      if (duplicate) {
        return duplicate;
      }

      const visitRequest = qr.manager.create(VisitRequest, {
        tenantId,
        status: this.deriveStatusFromContext(validated),
        originContext: validated.originContext,
        originRef: validated.originRef ?? null,
        originLabel: validated.originLabel ?? null,
        workType: validated.workType,
        priority: validated.priority ?? WorkOrderPriority.NORMAL,
        title: validated.title,
        description: validated.description ?? null,
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
        requestedByUserId: actor.sub,
        scheduledByUserId: null,
        scheduledAt: null,
        cancelledAt: null,
        cancelledByUserId: null,
        cancelReason: null,
      });

      try {
        return await qr.manager.save(VisitRequest, visitRequest);
      } catch (error) {
        if (this.isActiveOriginUniqueViolation(error)) {
          const existing = await this.findActiveDuplicateByOrigin(
            qr.manager,
            tenantId,
            validated.originContext,
            validated.originRef ?? null,
            validated.workType,
          );

          if (existing) {
            return existing;
          }
        }

        throw error;
      }
    });
  }

  async updateVisitRequestContext(
    id: string,
    input: UpdateVisitRequestContextInput,
    actor: JwtPayload,
  ): Promise<VisitRequest> {
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
        visitRequest.status !== VisitRequestStatus.READY_TO_SCHEDULE
      ) {
        throw new BadRequestException(
          `La solicitud esta en estado ${visitRequest.status} y no permite completar contexto`,
        );
      }

      const mergedContext = {
        ...visitRequest,
        ...validated,
      };

      const updates: Partial<VisitRequest> = {
        description: validated.description ?? visitRequest.description,
        requestedWindowStartAt: validated.requestedWindowStartAt
          ? new Date(validated.requestedWindowStartAt)
          : visitRequest.requestedWindowStartAt,
        requestedWindowEndAt: validated.requestedWindowEndAt
          ? new Date(validated.requestedWindowEndAt)
          : visitRequest.requestedWindowEndAt,
        slaDueAt: validated.slaDueAt ? new Date(validated.slaDueAt) : visitRequest.slaDueAt,
        address: validated.address ?? visitRequest.address,
        municipality: validated.municipality ?? visitRequest.municipality,
        sector: validated.sector ?? visitRequest.sector,
        latitude: validated.latitude ?? visitRequest.latitude,
        longitude: validated.longitude ?? visitRequest.longitude,
        expedienteId: validated.expedienteId ?? visitRequest.expedienteId,
        subscriberId: validated.subscriberId ?? visitRequest.subscriberId,
        ticketId: validated.ticketId ?? visitRequest.ticketId,
        contractId: validated.contractId ?? visitRequest.contractId,
        status: this.deriveStatusFromContext(mergedContext, visitRequest.status),
      };

      await qr.manager.update(VisitRequest, { id, tenantId }, updates);
      return { ...visitRequest, ...updates } as VisitRequest;
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

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const visitRequest = await qr.manager.findOne(VisitRequest, {
        where: { id, tenantId },
      });

      if (!visitRequest) {
        throw new NotFoundException('Visit request not found');
      }

      this.ensureActorCanAccessVisitRequest(actor, visitRequest);

      const resolvedWindowStartAt =
        validated.windowStartAt ?? visitRequest.requestedWindowStartAt?.toISOString();
      const resolvedWindowEndAt =
        validated.windowEndAt ?? visitRequest.requestedWindowEndAt?.toISOString();
      const horizonWindow = this.resolveSearchHorizonWindow(validated.searchHorizonDays);
      const effectiveWindowStartAt = resolvedWindowStartAt ?? horizonWindow?.windowStartAt;
      const effectiveWindowEndAt = resolvedWindowEndAt ?? horizonWindow?.windowEndAt;
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

      return {
        workType: visitRequest.workType,
        durationMinutes: validated.durationMinutes,
        candidateUserIds: validated.candidateUserIds,
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
  ): Promise<VisitRequest> {
    this.ensureActorCanAccessGlobalVisitRequests(actor);

    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const validated = ScheduleVisitRequestSchema.parse(input);

    const startAt = new Date(validated.scheduledStartAt);
    const endAt = new Date(validated.scheduledEndAt);
    if (endAt.getTime() - startAt.getTime() < MIN_DURATION_MS) {
      throw new BadRequestException('La duracion minima de la agenda es de 15 minutos');
    }

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const visitRequest = await qr.manager.findOne(VisitRequest, {
        where: { id, tenantId },
      });

      if (!visitRequest) {
        throw new NotFoundException('Visit request not found');
      }

      this.ensureActorCanAccessVisitRequest(actor, visitRequest);

      if (visitRequest.status === VisitRequestStatus.SCHEDULED && visitRequest.scheduleEventId) {
        return visitRequest;
      }

      if (TERMINAL_VISIT_REQUEST_STATUSES.has(visitRequest.status)) {
        throw new BadRequestException(
          `La solicitud esta en estado terminal (${visitRequest.status}) y no puede agendarse`,
        );
      }

      if (visitRequest.status !== VisitRequestStatus.READY_TO_SCHEDULE) {
        throw new BadRequestException('La solicitud no esta lista para agendar');
      }

      await this.assertInstallationScheduleWindow(visitRequest.workType, tenantId, startAt, endAt);

      const hasConflict = await this.conflictService.hasConflictWithManager(qr.manager, {
        tenantId,
        assignedUserId: validated.assignedUserId,
        scheduledStartAt: validated.scheduledStartAt,
        scheduledEndAt: validated.scheduledEndAt,
      });

      if (hasConflict) {
        throw new BadRequestException('El tecnico ya tiene un evento activo en ese rango horario');
      }

      const scheduleEvent = qr.manager.create(ScheduleEvent, {
        tenantId,
        type: visitRequest.workType,
        status: ScheduleEventStatus.SCHEDULED,
        title: visitRequest.title,
        description: visitRequest.description ?? null,
        scheduledStartAt: startAt,
        scheduledEndAt: endAt,
        assignedUserId: validated.assignedUserId,
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
        expedienteId: visitRequest.expedienteId ?? null,
        subscriberId: visitRequest.subscriberId ?? null,
        ticketId: visitRequest.ticketId ?? null,
        contractId: visitRequest.contractId ?? null,
        workOrderId: null,
        createdBy: actor.sub,
        updatedBy: actor.sub,
      });

      const savedEvent = await qr.manager.save(ScheduleEvent, scheduleEvent);

      let workOrderId: string | null = null;

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
        await qr.manager.save(ScheduleEvent, savedEvent);
      }

      const updates: Partial<VisitRequest> = {
        status: VisitRequestStatus.SCHEDULED,
        scheduleEventId: savedEvent.id,
        workOrderId,
        scheduledByUserId: actor.sub,
        scheduledAt: new Date(),
      };

      await qr.manager.update(VisitRequest, { id, tenantId }, updates);
      return { ...visitRequest, ...updates } as VisitRequest;
    });
  }

  private async assertInstallationScheduleWindow(
    workType: WfmWorkType,
    tenantId: string,
    startAt: Date,
    endAt: Date,
  ): Promise<void> {
    if (workType !== WfmWorkType.INSTALLATION) {
      return;
    }

    const timezone = await this.tenantSettingsReadPort.getTimezone(tenantId);

    if (!isInstallationScheduleWithinBusinessHours(startAt, endAt, timezone)) {
      throw new BadRequestException('Las instalaciones solo pueden agendarse entre 07:00 y 18:00.');
    }
  }

  async cancelVisitRequest(
    id: string,
    input: CancelVisitRequestInput,
    actor: JwtPayload,
  ): Promise<VisitRequest> {
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
        return visitRequest;
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
      return { ...visitRequest, ...updates } as VisitRequest;
    });
  }

  async rejectVisitRequest(
    id: string,
    input: RejectVisitRequestInput,
    actor: JwtPayload,
  ): Promise<VisitRequest & { rejectReason?: string | undefined }> {
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
        return { ...visitRequest, rejectReason: visitRequest.cancelReason ?? undefined };
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
      return {
        ...visitRequest,
        ...updates,
        rejectReason: validated.rejectReason,
      } as VisitRequest & { rejectReason: string };
    });
  }

  private ensureActorCanAccessGlobalVisitRequests(actor: JwtPayload): void {
    if (RESTRICTED_ROLES.includes(actor.role as UserRole)) {
      throw new ForbiddenException('No tienes permisos para acceder a la bandeja global');
    }
  }

  private ensureActorCanCreateVisitRequest(
    actor: JwtPayload,
    originContext: WorkOrderSourceContext,
  ): void {
    if (actor.role === UserRole.SALES && originContext !== WorkOrderSourceContext.CRM) {
      throw new ForbiddenException('SALES solo puede crear solicitudes originadas desde CRM');
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
    if (!originRef) {
      return null;
    }

    return manager
      .createQueryBuilder(VisitRequest, 'vr')
      .where('vr.tenant_id = :tenantId', { tenantId })
      .andWhere('vr.origin_context = :originContext', { originContext })
      .andWhere('vr.origin_ref = :originRef', { originRef })
      .andWhere('vr.work_type = :workType', { workType })
      .andWhere('vr.deleted_at IS NULL')
      .andWhere('vr.status NOT IN (:...terminalStatuses)', {
        terminalStatuses: Array.from(TERMINAL_VISIT_REQUEST_STATUSES),
      })
      .orderBy('vr.created_at', 'DESC')
      .getOne();
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
    const hasWindow = Boolean(input.requestedWindowStartAt && input.requestedWindowEndAt);

    if (hasAddress && hasMunicipality && hasWindow) {
      return VisitRequestStatus.READY_TO_SCHEDULE;
    }

    if (!hasAddress && !hasMunicipality && !hasWindow) {
      return VisitRequestStatus.NEEDS_CONTEXT;
    }

    return VisitRequestStatus.NEEDS_CONTEXT;
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
  ): { windowStartAt: string; windowEndAt: string } | null {
    if (!searchHorizonDays) {
      return null;
    }

    const now = new Date();
    const end = new Date(now);
    end.setUTCDate(end.getUTCDate() + searchHorizonDays);
    end.setUTCHours(23, 59, 59, 999);

    return {
      windowStartAt: now.toISOString(),
      windowEndAt: end.toISOString(),
    };
  }
}

type RawFilterOptionRow = {
  value: string;
  count: string | number;
  municipality?: string;
};
