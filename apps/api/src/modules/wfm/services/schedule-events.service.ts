import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import {
  TenantContext,
  runInTenantSchema,
  ScheduleEvent,
  ScheduleRescheduleLog,
  VisitRequest,
  WorkOrder,
} from '@iwana/db';
import {
  UserRole,
  ScheduleEventStatus,
  VisitRequestStatus,
  WfmWorkType,
  WorkOrderSourceContext,
} from '@iwana/shared';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { ExecutionOrdersService } from '../../tasks/services/execution-orders.service';
import {
  CreateScheduleEventInput,
  CreateScheduleEventSchema,
  MoveScheduleEventToPendingInput,
  MoveScheduleEventToPendingSchema,
  UpdateScheduleEventInput,
  UpdateScheduleEventSchema,
  TransitionScheduleEventInput,
  TransitionScheduleEventSchema,
  RescheduleEventInput,
  RescheduleEventSchema,
  ListScheduleEventsQueryDto,
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

/** Roles restringidos — solo ven sus propios eventos. */
const RESTRICTED_ROLES: UserRole[] = [UserRole.TECHNICIAN, UserRole.CONTRACTOR];

/** Estados terminales — no se puede editar ni transicionar desde aqui. */
const TERMINAL_STATUSES: ScheduleEventStatus[] = [
  ScheduleEventStatus.COMPLETED,
  ScheduleEventStatus.CANCELLED,
  ScheduleEventStatus.NO_SHOW,
];

const MOVE_TO_PENDING_ALLOWED_STATUSES = new Set<ScheduleEventStatus>([
  ScheduleEventStatus.DRAFT,
  ScheduleEventStatus.SCHEDULED,
  ScheduleEventStatus.RESCHEDULED,
]);

/** Duracion minima del evento: 15 minutos en milisegundos. */
const MIN_DURATION_MS = 15 * 60 * 1000;

@Injectable()
export class ScheduleEventsService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @Inject(WfmTenantSettingsReadPort)
    private readonly tenantSettingsReadPort: WfmTenantSettingsReadPort,
    private readonly operatingWindowResolver: OperatingWindowResolverService,
    private readonly conflictService: ScheduleConflictService,
    private readonly workOrdersService: WorkOrdersService,
    @Optional()
    private readonly executionOrdersService?: ExecutionOrdersService,
  ) {}

  /** Lista eventos del tenant con filtros opcionales y control de acceso por rol. */
  async list(query: ListScheduleEventsQueryDto, actor: JwtPayload): Promise<ScheduleEvent[]> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const qb = qr.manager
        .createQueryBuilder(ScheduleEvent, 'se')
        .where('se.tenant_id = :tenantId', { tenantId })
        .andWhere('se.deleted_at IS NULL')
        .orderBy('se.scheduled_start_at', 'ASC');

      if (RESTRICTED_ROLES.includes(actor.role as UserRole)) {
        qb.andWhere('se.assigned_user_id = :uid', { uid: actor.sub });
      }

      if (query.from && query.to) {
        qb.andWhere('se.scheduled_start_at < :to AND se.scheduled_end_at > :from', {
          from: query.from,
          to: query.to,
        });
      } else if (query.from) {
        qb.andWhere('se.scheduled_end_at > :from', { from: query.from });
      } else if (query.to) {
        qb.andWhere('se.scheduled_start_at < :to', { to: query.to });
      }
      if (query.assignedUserId) {
        qb.andWhere('se.assigned_user_id = :assignedUserId', {
          assignedUserId: query.assignedUserId,
        });
      }
      if (query.expedienteId) {
        qb.andWhere('se.expediente_id = :expedienteId', { expedienteId: query.expedienteId });
      }
      if (query.type) {
        qb.andWhere('se.type = :type', { type: query.type });
      }
      if (query.status) {
        qb.andWhere('se.status = :status', { status: query.status });
      }
      if (query.municipality) {
        qb.andWhere('se.municipality ILIKE :mun', { mun: `%${query.municipality}%` });
      }
      if (query.sector) {
        qb.andWhere('se.sector ILIKE :sector', { sector: `%${query.sector}%` });
      }

      return qb.getMany();
    });
  }

  /** Obtiene un evento por id con control de acceso por rol. */
  async getById(id: string, actor: JwtPayload): Promise<ScheduleEvent> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const event = await qr.manager.findOne(ScheduleEvent, { where: { id, tenantId } });

      if (!event) {
        throw new NotFoundException(`Evento ${id} no encontrado`);
      }

      if (RESTRICTED_ROLES.includes(actor.role as UserRole) && event.assignedUserId !== actor.sub) {
        throw new ForbiddenException('No tienes acceso a este evento');
      }

      return event;
    });
  }

  /** Crea un evento de agenda con deteccion de conflictos y Work Order embebida opcional. */
  async create(input: CreateScheduleEventInput, actor: JwtPayload): Promise<ScheduleEvent> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const validated = CreateScheduleEventSchema.parse(input);
    const startAt = new Date(validated.scheduledStartAt);
    const endAt = new Date(validated.scheduledEndAt);
    const organizationSiteId = validated.organizationSiteId ?? null;

    // Validar duracion minima
    const startMs = startAt.getTime();
    const endMs = endAt.getTime();
    if (endMs - startMs < MIN_DURATION_MS) {
      throw new BadRequestException('La duracion minima del evento es de 15 minutos');
    }

    assertScheduleStartNotInPast(startAt);

    await this.assertInstallationScheduleWindow(
      validated.type,
      tenantId,
      organizationSiteId,
      validated.assignedUserId,
      startAt,
      endAt,
    );

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
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

      const event = qr.manager.create(ScheduleEvent, {
        tenantId,
        type: validated.type,
        status: ScheduleEventStatus.DRAFT,
        title: validated.title,
        description: validated.description ?? null,
        scheduledStartAt: startAt,
        scheduledEndAt: endAt,
        assignedUserId: validated.assignedUserId,
        organizationSiteId,
        address: validated.address ?? null,
        municipality: validated.municipality ?? null,
        sector: validated.sector ?? null,
        latitude: validated.latitude !== undefined ? String(validated.latitude) : null,
        longitude: validated.longitude !== undefined ? String(validated.longitude) : null,
        expedienteId: validated.expedienteId ?? null,
        subscriberId: validated.subscriberId ?? null,
        ticketId: validated.ticketId ?? null,
        contractId: validated.contractId ?? null,
        workOrderId: null,
        executionOrderId: null,
        createdBy: actor.sub,
        updatedBy: actor.sub,
      });

      const savedEvent = await qr.manager.save(ScheduleEvent, event);

      if (!validated.workOrder) {
        if (!this.executionOrdersService) {
          return savedEvent;
        }

        const executionOrder = await this.executionOrdersService.createFromSchedulingWithManager(
          qr.manager,
          tenantId,
          {
            visitRequestId: null,
            scheduleEventId: savedEvent.id,
            assignedTechnicianId: validated.assignedUserId,
            originContext: WorkOrderSourceContext.MANUAL,
            originRefId: validated.ticketId ?? validated.expedienteId ?? null,
            customerDisplayLabel: validated.title,
            serviceAddress: validated.address ?? null,
            municipality: validated.municipality ?? null,
            sector: validated.sector ?? null,
            workType: validated.type,
            workSummary: validated.title,
            workInstructions: validated.description ?? null,
            plannedWindowStartAt: validated.scheduledStartAt,
            plannedWindowEndAt: validated.scheduledEndAt,
          },
          actor,
        );

        if (executionOrder?.id) {
          savedEvent.executionOrderId = executionOrder.id;
          savedEvent.updatedBy = actor.sub;
        }
        return qr.manager.save(ScheduleEvent, savedEvent);
      }

      const workOrder = await this.workOrdersService.createWithinManager(
        qr.manager,
        tenantId,
        validated.workOrder,
        validated.assignedUserId,
        actor.sub,
        savedEvent.id,
      );

      savedEvent.workOrderId = workOrder.id;
      if (this.executionOrdersService) {
        const executionOrder = await this.executionOrdersService.createFromSchedulingWithManager(
          qr.manager,
          tenantId,
          {
            visitRequestId: null,
            scheduleEventId: savedEvent.id,
            assignedTechnicianId: validated.assignedUserId,
            originContext: validated.workOrder.sourceContext ?? WorkOrderSourceContext.MANUAL,
            originRefId: validated.workOrder.sourceRef ?? null,
            customerDisplayLabel: validated.title,
            serviceAddress: validated.address ?? null,
            municipality: validated.municipality ?? null,
            sector: validated.sector ?? null,
            workType: validated.type,
            workSummary: validated.workOrder.summary,
            workInstructions: validated.workOrder.notes ?? validated.description ?? null,
            plannedWindowStartAt: validated.scheduledStartAt,
            plannedWindowEndAt: validated.scheduledEndAt,
          },
          actor,
        );

        if (executionOrder?.id) {
          savedEvent.executionOrderId = executionOrder.id;
        }
      }
      savedEvent.updatedBy = actor.sub;
      return qr.manager.save(ScheduleEvent, savedEvent);
    });
  }

  /** Actualiza campos editables de un evento que no este en estado terminal. */
  async update(
    id: string,
    input: UpdateScheduleEventInput,
    actor: JwtPayload,
  ): Promise<ScheduleEvent> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const validated = UpdateScheduleEventSchema.parse(input);

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const event = await qr.manager.findOne(ScheduleEvent, { where: { id, tenantId } });

      if (!event) {
        throw new NotFoundException(`Evento ${id} no encontrado`);
      }

      if (TERMINAL_STATUSES.includes(event.status as ScheduleEventStatus)) {
        throw new BadRequestException(
          `El evento esta en estado terminal (${event.status}) y no puede editarse`,
        );
      }

      const organizationSiteId = validated.organizationSiteId ?? event.organizationSiteId ?? null;

      // Si se cambia el horario, verificar conflictos excluyendo el evento actual
      if (validated.scheduledStartAt || validated.scheduledEndAt) {
        const startAt = validated.scheduledStartAt ?? event.scheduledStartAt.toISOString();
        const endAt = validated.scheduledEndAt ?? event.scheduledEndAt.toISOString();
        const assignedUid = validated.assignedUserId ?? event.assignedUserId;

        const nextStartAt = new Date(startAt);
        const nextEndAt = new Date(endAt);
        const startMs = nextStartAt.getTime();
        const endMs = nextEndAt.getTime();
        if (endMs - startMs < MIN_DURATION_MS) {
          throw new BadRequestException('La duracion minima del evento es de 15 minutos');
        }

        assertScheduleStartNotInPast(nextStartAt);

        await this.assertInstallationScheduleWindow(
          event.type,
          tenantId,
          organizationSiteId,
          assignedUid,
          nextStartAt,
          nextEndAt,
          qr.manager,
        );

        const conflict = await this.conflictService.hasConflict({
          tenantId,
          assignedUserId: assignedUid,
          scheduledStartAt: startAt,
          scheduledEndAt: endAt,
          excludeEventId: id,
        });
        if (conflict) {
          throw new BadRequestException(
            'La persona asignada ya tiene un evento activo en ese rango horario',
          );
        }
      }

      const updates: Partial<ScheduleEvent> = {
        updatedBy: actor.sub,
      };

      // Solo asignar campos definidos (exactOptionalPropertyTypes requiere no incluir undefined)
      if (validated.title !== undefined) updates.title = validated.title;
      if (validated.description !== undefined) updates.description = validated.description;
      if (validated.scheduledStartAt !== undefined)
        updates.scheduledStartAt = new Date(validated.scheduledStartAt);
      if (validated.scheduledEndAt !== undefined)
        updates.scheduledEndAt = new Date(validated.scheduledEndAt);
      if (validated.assignedUserId !== undefined) updates.assignedUserId = validated.assignedUserId;
      if (validated.organizationSiteId !== undefined)
        updates.organizationSiteId = organizationSiteId;
      if (validated.address !== undefined) updates.address = validated.address;
      if (validated.municipality !== undefined) updates.municipality = validated.municipality;
      if (validated.sector !== undefined) updates.sector = validated.sector;
      if (validated.expedienteId !== undefined) updates.expedienteId = validated.expedienteId;
      if (validated.subscriberId !== undefined) updates.subscriberId = validated.subscriberId;
      if (validated.ticketId !== undefined) updates.ticketId = validated.ticketId;
      if (validated.contractId !== undefined) updates.contractId = validated.contractId;

      // Normalizar lat/lon a string para TypeORM (tipo numeric almacenado como string)
      if (validated.latitude !== undefined) {
        updates.latitude = validated.latitude !== null ? String(validated.latitude) : null;
      }
      if (validated.longitude !== undefined) {
        updates.longitude = validated.longitude !== null ? String(validated.longitude) : null;
      }

      await qr.manager.update(ScheduleEvent, { id, tenantId }, updates);
      return { ...event, ...updates } as ScheduleEvent;
    });
  }

  /** Transiciona el estado operativo de un evento de agenda. */
  async transitionStatus(
    id: string,
    input: TransitionScheduleEventInput,
    actor: JwtPayload,
  ): Promise<ScheduleEvent> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const validated = TransitionScheduleEventSchema.parse(input);

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const event = await qr.manager.findOne(ScheduleEvent, { where: { id, tenantId } });

      if (!event) {
        throw new NotFoundException(`Evento ${id} no encontrado`);
      }

      if (RESTRICTED_ROLES.includes(actor.role as UserRole) && event.assignedUserId !== actor.sub) {
        throw new ForbiddenException('No tienes permiso para cambiar este evento');
      }

      if (TERMINAL_STATUSES.includes(event.status as ScheduleEventStatus)) {
        throw new BadRequestException(`El evento esta en estado terminal (${event.status})`);
      }

      await qr.manager.update(
        ScheduleEvent,
        { id, tenantId },
        { status: validated.status, updatedBy: actor.sub },
      );

      return { ...event, status: validated.status, updatedBy: actor.sub } as ScheduleEvent;
    });
  }

  /**
   * Reagenda un evento: actualiza horario, cambia estado a RESCHEDULED
   * y genera entrada de auditoria en schedule_reschedule_logs (append-only).
   */
  async reschedule(
    id: string,
    input: RescheduleEventInput,
    actor: JwtPayload,
  ): Promise<ScheduleEvent> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const validated = RescheduleEventSchema.parse(input);

    const startMs = new Date(validated.scheduledStartAt).getTime();
    const endMs = new Date(validated.scheduledEndAt).getTime();
    if (endMs - startMs < MIN_DURATION_MS) {
      throw new BadRequestException('La duracion minima del evento es de 15 minutos');
    }

    assertScheduleStartNotInPast(validated.scheduledStartAt);

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const event = await qr.manager.findOne(ScheduleEvent, { where: { id, tenantId } });

      if (!event) {
        throw new NotFoundException(`Evento ${id} no encontrado`);
      }

      if (TERMINAL_STATUSES.includes(event.status as ScheduleEventStatus)) {
        throw new BadRequestException(
          `El evento esta en estado terminal (${event.status}) y no puede reagendarse`,
        );
      }

      await this.assertInstallationScheduleWindow(
        event.type,
        tenantId,
        event.organizationSiteId ?? null,
        event.assignedUserId,
        new Date(validated.scheduledStartAt),
        new Date(validated.scheduledEndAt),
        qr.manager,
      );

      // Verificar conflicto real con el usuario asignado
      const hasConflict = await this.conflictService.hasConflict({
        tenantId,
        assignedUserId: event.assignedUserId,
        scheduledStartAt: validated.scheduledStartAt,
        scheduledEndAt: validated.scheduledEndAt,
        excludeEventId: id,
      });
      if (hasConflict) {
        throw new BadRequestException(
          'La persona asignada ya tiene un evento activo en el nuevo rango horario',
        );
      }

      // Registrar log de reagendamiento (append-only)
      const log = qr.manager.create(ScheduleRescheduleLog, {
        tenantId,
        scheduleEventId: id,
        fromStartAt: event.scheduledStartAt,
        fromEndAt: event.scheduledEndAt,
        toStartAt: new Date(validated.scheduledStartAt),
        toEndAt: new Date(validated.scheduledEndAt),
        reason: validated.reason,
        notes: validated.notes ?? null,
        changedBy: actor.sub,
      });
      await qr.manager.save(ScheduleRescheduleLog, log);

      // Actualizar evento
      const updates: Partial<ScheduleEvent> = {
        scheduledStartAt: new Date(validated.scheduledStartAt),
        scheduledEndAt: new Date(validated.scheduledEndAt),
        status: ScheduleEventStatus.RESCHEDULED,
        updatedBy: actor.sub,
      };

      await qr.manager.update(ScheduleEvent, { id, tenantId }, updates);
      return { ...event, ...updates } as ScheduleEvent;
    });
  }

  /**
   * Devuelve un evento de agenda a la bandeja pendiente sin perder la OT ligada.
   * La referencia operativa que sobrevive es VisitRequest.workOrderId.
   */
  async moveToPending(
    id: string,
    input: MoveScheduleEventToPendingInput,
    _actor: JwtPayload,
  ): Promise<VisitRequest> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    MoveScheduleEventToPendingSchema.parse(input);

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const event = await qr.manager.findOne(ScheduleEvent, { where: { id, tenantId } });

      if (!event) {
        throw new NotFoundException(`Evento ${id} no encontrado`);
      }

      if (!MOVE_TO_PENDING_ALLOWED_STATUSES.has(event.status as ScheduleEventStatus)) {
        throw new BadRequestException(
          `El evento esta en estado ${event.status} y no puede devolverse a pendiente`,
        );
      }

      const visitRequest = await qr.manager.findOne(VisitRequest, {
        where: { tenantId, scheduleEventId: id },
      });

      if (!visitRequest) {
        throw new BadRequestException(
          'El evento no tiene una solicitud de visita vinculada para devolver a pendiente',
        );
      }

      const visitRequestUpdates: Partial<VisitRequest> = {
        status: VisitRequestStatus.READY_TO_SCHEDULE,
        scheduleEventId: null,
        workOrderId: visitRequest.workOrderId ?? event.workOrderId ?? null,
        executionOrderId: visitRequest.executionOrderId ?? event.executionOrderId ?? null,
        scheduledByUserId: null,
        scheduledAt: null,
      };

      await qr.manager.update(
        WorkOrder,
        { tenantId, scheduledEventId: id },
        { scheduledEventId: null },
      );
      await qr.manager.update(VisitRequest, { id: visitRequest.id, tenantId }, visitRequestUpdates);
      await qr.manager.softDelete(ScheduleEvent, { id, tenantId });

      return { ...visitRequest, ...visitRequestUpdates } as VisitRequest;
    });
  }

  private async assertInstallationScheduleWindow(
    type: WfmWorkType,
    tenantId: string,
    organizationSiteId: string | null,
    technicianId: string,
    startAt: Date,
    endAt: Date,
    manager?: EntityManager,
  ): Promise<void> {
    if (type !== WfmWorkType.INSTALLATION) {
      return;
    }

    const timezone = await this.tenantSettingsReadPort.getTimezone(tenantId);
    const dateLocal = getLocalDateString(startAt, timezone);

    if (!dateLocal) {
      throw new BadRequestException(
        'La fecha de instalacion no pudo resolverse en el timezone del tenant.',
      );
    }

    const window = manager
      ? await this.operatingWindowResolver.resolveWithManager(manager, {
          tenantId,
          organizationSiteId,
          technicianId,
          dateLocal,
          timezone,
        })
      : await this.operatingWindowResolver.resolve({
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

  /** Soft-delete de un evento que no este en estado terminal. */
  async cancel(id: string, actor: JwtPayload): Promise<void> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const event = await qr.manager.findOne(ScheduleEvent, { where: { id, tenantId } });

      if (!event) {
        throw new NotFoundException(`Evento ${id} no encontrado`);
      }

      await qr.manager.softDelete(ScheduleEvent, { id, tenantId });
    });
  }
}
