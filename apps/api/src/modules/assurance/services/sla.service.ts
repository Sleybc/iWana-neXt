import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { SupportTicket, TenantContext, TicketSlaPolicy, runInTenantSchema } from '@iwana/db';
import { CreateSlaPolicyInput, CreateSlaPolicySchema } from '../dto';
import { SlaBreachStatus, TicketPriority, TicketStatus, TicketType } from '@iwana/shared';

const PQR_INITIAL_RESPONSE_MINUTES = 15 * 24 * 60;
const AT_RISK_THRESHOLD_RATIO = 0.2;

@Injectable()
export class SlaService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async findApplicablePolicy(
    manager: EntityManager,
    tenantId: string,
    type: TicketType,
    priority: TicketPriority,
  ): Promise<TicketSlaPolicy | null> {
    const byBoth = await manager
      .createQueryBuilder(TicketSlaPolicy, 'p')
      .where('p.tenant_id = :tenantId', { tenantId })
      .andWhere('p.applies_to_type = :type', { type })
      .andWhere('p.applies_to_priority = :priority', { priority })
      .andWhere('p.is_active = TRUE')
      .getOne();

    if (byBoth) {
      return byBoth;
    }

    const byType = await manager
      .createQueryBuilder(TicketSlaPolicy, 'p')
      .where('p.tenant_id = :tenantId', { tenantId })
      .andWhere('p.applies_to_type = :type', { type })
      .andWhere('p.applies_to_priority IS NULL')
      .andWhere('p.is_active = TRUE')
      .getOne();

    if (byType) {
      return byType;
    }

    const byPriority = await manager
      .createQueryBuilder(TicketSlaPolicy, 'p')
      .where('p.tenant_id = :tenantId', { tenantId })
      .andWhere('p.applies_to_type IS NULL')
      .andWhere('p.applies_to_priority = :priority', { priority })
      .andWhere('p.is_active = TRUE')
      .getOne();

    if (byPriority) {
      return byPriority;
    }

    return (
      (await manager
        .createQueryBuilder(TicketSlaPolicy, 'p')
        .where('p.tenant_id = :tenantId', { tenantId })
        .andWhere('p.applies_to_type IS NULL')
        .andWhere('p.applies_to_priority IS NULL')
        .andWhere('p.is_active = TRUE')
        .getOne()) ?? null
    );
  }

  calculateDeadlines(
    policy: TicketSlaPolicy | null,
    createdAt: Date,
  ): { slaFirstResponseAt: Date | null; slaResolveByAt: Date | null } {
    if (!policy) {
      return { slaFirstResponseAt: null, slaResolveByAt: null };
    }

    return {
      slaFirstResponseAt: new Date(createdAt.getTime() + policy.firstResponseMinutes * 60_000),
      slaResolveByAt: new Date(createdAt.getTime() + policy.resolutionMinutes * 60_000),
    };
  }

  /**
   * Calcula el plazo regulatorio PQR de 15 días hábiles (lunes a viernes).
   * No considera festivos nacionales en esta fase inicial.
   * @param createdAt Fecha de creación del ticket PQR
   * @returns Fecha límite tras agregar 15 días hábiles
   */
  calculatePqrDeadline(createdAt: Date): Date {
    let businessDaysRemaining = 15;
    let current = new Date(createdAt);

    while (businessDaysRemaining > 0) {
      current.setDate(current.getDate() + 1);
      const dayOfWeek = current.getDay();
      // 0 = domingo, 6 = sábado — omitir
      if (dayOfWeek !== 0 && dayOfWeek !== 6) {
        businessDaysRemaining -= 1;
      }
    }

    return current;
  }

  deriveBreachStatus(
    ticket: Pick<
      SupportTicket,
      | 'createdAt'
      | 'status'
      | 'slaFirstResponseAt'
      | 'slaResolveByAt'
      | 'firstRespondedAt'
      | 'resolvedAt'
    >,
  ): SlaBreachStatus {
    if (
      ticket.status === TicketStatus.CANCELLED ||
      ticket.status === TicketStatus.CLOSED ||
      ticket.status === TicketStatus.RESOLVED
    ) {
      // Resolution breach takes precedence over first response breach
      if (ticket.resolvedAt && ticket.slaResolveByAt && ticket.resolvedAt > ticket.slaResolveByAt) {
        return SlaBreachStatus.RESOLUTION_BREACHED;
      }
      if (
        ticket.firstRespondedAt &&
        ticket.slaFirstResponseAt &&
        ticket.firstRespondedAt > ticket.slaFirstResponseAt
      ) {
        return SlaBreachStatus.FIRST_RESPONSE_BREACHED;
      }
      return SlaBreachStatus.OK;
    }

    const now = new Date();

    if (!ticket.firstRespondedAt && ticket.slaFirstResponseAt) {
      return this._deriveWindowStatus(
        ticket.createdAt,
        ticket.slaFirstResponseAt,
        now,
        SlaBreachStatus.FIRST_RESPONSE_BREACHED,
      );
    }

    if (!ticket.resolvedAt && ticket.slaResolveByAt) {
      return this._deriveWindowStatus(
        ticket.createdAt,
        ticket.slaResolveByAt,
        now,
        SlaBreachStatus.RESOLUTION_BREACHED,
      );
    }

    return SlaBreachStatus.OK;
  }

  async listPolicies(): Promise<TicketSlaPolicy[]> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();

    return runInTenantSchema(this.dataSource, schemaName, async (qr) =>
      qr.manager
        .createQueryBuilder(TicketSlaPolicy, 'p')
        .where('p.tenant_id = :tenantId', { tenantId })
        .orderBy('p.created_at', 'DESC')
        .getMany(),
    );
  }

  async createPolicy(input: CreateSlaPolicyInput): Promise<TicketSlaPolicy> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const validated = CreateSlaPolicySchema.parse(input);

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const policy = qr.manager.create(TicketSlaPolicy, {
        tenantId,
        name: validated.name,
        appliesToType: validated.appliesToType ?? null,
        appliesToPriority: validated.appliesToPriority ?? null,
        firstResponseMinutes: validated.firstResponseMinutes,
        resolutionMinutes: validated.resolutionMinutes,
        isActive: validated.isActive ?? true,
      });

      return qr.manager.save(TicketSlaPolicy, policy);
    });
  }

  private _deriveWindowStatus(
    createdAt: Date,
    deadlineAt: Date,
    now: Date,
    breachedStatus: SlaBreachStatus,
  ): SlaBreachStatus {
    const totalWindowMs = deadlineAt.getTime() - createdAt.getTime();
    const remainingMs = deadlineAt.getTime() - now.getTime();

    if (remainingMs <= 0) {
      return breachedStatus;
    }

    if (totalWindowMs > 0 && remainingMs <= totalWindowMs * AT_RISK_THRESHOLD_RATIO) {
      return SlaBreachStatus.AT_RISK;
    }

    return SlaBreachStatus.OK;
  }
}
