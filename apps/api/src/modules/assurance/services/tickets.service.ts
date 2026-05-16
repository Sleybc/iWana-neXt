import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, QueryFailedError } from 'typeorm';
import {
  SupportTicket,
  TenantContext,
  TicketSlaPolicy,
  TicketWorkOrderLink,
  runInTenantSchema,
} from '@iwana/db';
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
import { PqrService } from './pqr.service';
import { SlaService } from './sla.service';
import { TimelineService } from './timeline.service';

const RESTRICTED_ROLES: UserRole[] = [UserRole.TECHNICIAN, UserRole.CONTRACTOR];
const TICKET_NUMBER_RETRY_LIMIT = 3;

const INSTALLATION_OPEN_STATUSES = [
  TicketStatus.OPEN,
  TicketStatus.ASSIGNED,
  TicketStatus.IN_PROGRESS,
  TicketStatus.PENDING_INTERNAL,
  TicketStatus.FIELD_SERVICE_REQUESTED,
];

const VALID_TRANSITIONS: Record<TicketStatus, TicketStatus[]> = {
  [TicketStatus.OPEN]: [TicketStatus.ASSIGNED, TicketStatus.IN_PROGRESS, TicketStatus.CANCELLED],
  [TicketStatus.ASSIGNED]: [
    TicketStatus.IN_PROGRESS,
    TicketStatus.PENDING_CUSTOMER,
    TicketStatus.PENDING_INTERNAL,
    TicketStatus.CANCELLED,
  ],
  [TicketStatus.IN_PROGRESS]: [
    TicketStatus.PENDING_CUSTOMER,
    TicketStatus.PENDING_INTERNAL,
    TicketStatus.FIELD_SERVICE_REQUESTED,
    TicketStatus.RESOLVED,
    TicketStatus.CANCELLED,
  ],
  [TicketStatus.PENDING_CUSTOMER]: [
    TicketStatus.IN_PROGRESS,
    TicketStatus.RESOLVED,
    TicketStatus.CANCELLED,
  ],
  [TicketStatus.PENDING_INTERNAL]: [
    TicketStatus.IN_PROGRESS,
    TicketStatus.FIELD_SERVICE_REQUESTED,
    TicketStatus.CANCELLED,
  ],
  [TicketStatus.FIELD_SERVICE_REQUESTED]: [
    TicketStatus.IN_PROGRESS,
    TicketStatus.RESOLVED,
    TicketStatus.CANCELLED,
  ],
  [TicketStatus.RESOLVED]: [TicketStatus.CLOSED, TicketStatus.IN_PROGRESS],
  [TicketStatus.CLOSED]: [],
  [TicketStatus.CANCELLED]: [],
};

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
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly slaService: SlaService,
    private readonly pqrService: PqrService,
    private readonly timelineService: TimelineService,
    private readonly fieldServicePort: AssuranceFieldServicePort,
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

    const tickets = await runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const qb = qr.manager
        .createQueryBuilder(SupportTicket, 'st')
        .where('st.tenant_id = :tenantId', { tenantId })
        .orderBy('st.created_at', 'DESC');

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

      return qb.getMany();
    });

    const withDerivedSla = tickets.map((ticket) => ({
      ...ticket,
      slaBreachStatus: this.slaService.deriveBreachStatus(ticket),
    }));

    const filtered = validated.slaBreachStatus
      ? withDerivedSla.filter((ticket) => ticket.slaBreachStatus === validated.slaBreachStatus)
      : withDerivedSla;

    const start = (validated.page - 1) * validated.limit;
    const data = filtered.slice(start, start + validated.limit);

    return {
      data,
      total: filtered.length,
      page: validated.page,
      limit: validated.limit,
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

  async update(id: string, input: UpdateTicketInput, actor: JwtPayload): Promise<SupportTicket> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const validated = UpdateTicketSchema.parse(input);

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const ticket = await qr.manager.findOne(SupportTicket, { where: { id, tenantId } });

      if (!ticket) {
        throw new NotFoundException(`Ticket ${id} no encontrado`);
      }

      this._ensureOwnership(ticket, actor);

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

      const allowedTransitions = VALID_TRANSITIONS[ticket.status] ?? [];
      if (!allowedTransitions.includes(validated.status)) {
        throw new BadRequestException(
          `Transición inválida: ${ticket.status} -> ${validated.status}`,
        );
      }

      // Verificar completitud regulatoria PQR para transiciones a RESOLVED o CLOSED
      if (
        ticket.type === TicketType.PQR &&
        (validated.status === TicketStatus.RESOLVED || validated.status === TicketStatus.CLOSED)
      ) {
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
        description: `Ticket operativo de instalación generado automáticamente para el expediente ${dto.expedienteId}.`,
        createdByUserId: actorUserId,
      });

      const saved = await qr.manager.save(SupportTicket, ticket);
      return { ticket: saved, created: true };
    });
  }
}
