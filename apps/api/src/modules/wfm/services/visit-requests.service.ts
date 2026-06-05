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
import {
  getLocalDateString,
  isScheduleRangeWithinOperatingWindow,
} from './installation-schedule-window';
import { OperatingWindowResolverService } from './operating-window-resolver.service';
import { ScheduleConflictService } from './schedule-conflict.service';
import { WorkOrdersService } from './work-orders.service';
import { ExpedienteService } from '../../crm/expedientes/expediente.service';

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
        .skip((validated.page - 1) * validated.limit)
        .take(validated.limit);

      const [items, total] = await qb.getManyAndCount();
      const enrichedItems = await this.enrichVisitRequests(items, qr.manager);

      return {
        items: enrichedItems,
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
      const duplicate = await this.findActiveDuplicateByOrigin(
        qr.manager,
        tenantId,
        validated.originContext,
        validated.originRef ?? null,
        validated.workType,
      );

      if (duplicate) {
        return this.enrichVisitRequest(duplicate, qr.manager);
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
        requestedByUserId: actor.sub,
        scheduledByUserId: null,
        scheduledAt: null,
        cancelledAt: null,
        cancelledByUserId: null,
        cancelReason: null,
      });

      try {
        const savedVisitRequest = await qr.manager.save(VisitRequest, visitRequest);
        return this.enrichVisitRequest(savedVisitRequest, qr.manager);
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
            return this.enrichVisitRequest(existing, qr.manager);
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
        visitRequest.status !== VisitRequestStatus.READY_TO_SCHEDULE
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
        status: this.deriveStatusFromContext(mergedContext, visitRequest.status),
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

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const visitRequest = await qr.manager.findOne(VisitRequest, {
        where: { id, tenantId },
      });

      if (!visitRequest) {
        throw new NotFoundException('Visit request not found');
      }

      this.ensureActorCanAccessVisitRequest(actor, visitRequest);

      if (visitRequest.status === VisitRequestStatus.SCHEDULED && visitRequest.scheduleEventId) {
        return this.enrichVisitRequest(visitRequest, qr.manager);
      }

      if (TERMINAL_VISIT_REQUEST_STATUSES.has(visitRequest.status)) {
        throw new BadRequestException(
          `La solicitud esta en estado terminal (${visitRequest.status}) y no puede agendarse`,
        );
      }

      const effectiveStatus = this.getEffectiveVisitRequestStatus(visitRequest);

      if (effectiveStatus !== VisitRequestStatus.READY_TO_SCHEDULE) {
        throw new BadRequestException('La solicitud no esta lista para agendar');
      }

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
        organizationSiteId,
        scheduledByUserId: actor.sub,
        scheduledAt: new Date(),
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

  private async enrichVisitRequests<T extends VisitRequest>(
    visitRequests: T[],
    manager: EntityManager,
  ): Promise<Array<T & { customerDisplayName: string | null }>> {
    return Promise.all(
      visitRequests.map((visitRequest) => this.enrichVisitRequest(visitRequest, manager)),
    );
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

    if (hasAddress && hasMunicipality) {
      return VisitRequestStatus.READY_TO_SCHEDULE;
    }

    if (!hasAddress && !hasMunicipality) {
      return VisitRequestStatus.NEEDS_CONTEXT;
    }

    return VisitRequestStatus.NEEDS_CONTEXT;
  }

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
