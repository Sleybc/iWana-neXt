import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager, In } from 'typeorm';
import {
  PurchaseRequest,
  PurchaseRequestLine,
  PurchaseRfq,
  PurchaseRfqInvitation,
  SupplierQuote,
  TenantContext,
  runInTenantSchema,
} from '@iwana/db';
import {
  PurchaseRequestLineStatus,
  PurchaseRequestStatus,
  PurchaseRfqInvitationStatus,
  PurchaseRfqStatus,
} from '@iwana/shared';
import {
  CreateRfqInput,
  CreateRfqSchema,
  DeclineInvitationInput,
  DeclineInvitationSchema,
  InviteSuppliersInput,
  InviteSuppliersSchema,
} from '../dto';
import { generateSequentialNumber } from '../utils/sequential-number';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { isPostgresUniqueViolation } from './inventory-postgres.util';
import { SupplierPartyPort } from '../ports/supplier-party.port';
import { SupplierProfileService } from './supplier-profile.service';

export interface PurchaseRfqDetail {
  rfq: PurchaseRfq;
  invitations: PurchaseRfqInvitation[];
  request: PurchaseRequest;
  lines: PurchaseRequestLine[];
}

const ACTIVE_RFQ_STATUSES = [
  PurchaseRfqStatus.DRAFT,
  PurchaseRfqStatus.SENT,
  PurchaseRfqStatus.RECEIVING,
];

async function withTransaction<T>(
  manager: EntityManager,
  work: (transactionManager: EntityManager) => Promise<T>,
): Promise<T> {
  if (typeof manager.transaction === 'function') {
    return manager.transaction(work);
  }

  return work(manager);
}

@Injectable()
export class RfqService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly supplierProfileService: SupplierProfileService,
    private readonly supplierPartyPort: SupplierPartyPort,
  ) {}

  async createFromRequest(
    purchaseRequestId: string,
    input: CreateRfqInput,
    actor: JwtPayload,
  ): Promise<PurchaseRfq> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const validated = CreateRfqSchema.parse(input);

    return runInTenantSchema(this.dataSource, schemaName, async (qr) =>
      withTransaction(qr.manager, async (manager) => {
        await this.requirePurchaseRequest(manager, tenantId, purchaseRequestId);

        const existingActive = await manager
          .createQueryBuilder(PurchaseRfq, 'rfq')
          .where('rfq.tenant_id = :tenantId', { tenantId })
          .andWhere('rfq.purchase_request_id = :purchaseRequestId', { purchaseRequestId })
          .andWhere('rfq.status IN (:...statuses)', { statuses: ACTIVE_RFQ_STATUSES })
          .getOne();

        if (existingActive) {
          throw new ConflictException('La solicitud ya tiene una ronda de cotización activa.');
        }

        const rfqNumber = await generateSequentialNumber(manager, {
          entity: PurchaseRfq,
          alias: 'rfq',
          columnName: 'rfq_number',
          prefix: 'RFQ-',
          tenantId,
        });

        try {
          return await manager.save(
            PurchaseRfq,
            manager.create(PurchaseRfq, {
              tenantId,
              purchaseRequestId,
              rfqNumber,
              status: PurchaseRfqStatus.DRAFT,
              currency: validated.currency ?? 'COP',
              responseDeadline: validated.responseDeadline ?? null,
              createdByUserId: actor.sub,
              notes: validated.notes ?? null,
            }),
          );
        } catch (error) {
          if (isPostgresUniqueViolation(error, 'uq_purchase_rfqs_active_request')) {
            throw new ConflictException('La solicitud ya tiene una ronda de cotización activa.');
          }

          throw error;
        }
      }),
    );
  }

  async invite(
    rfqId: string,
    input: InviteSuppliersInput,
    actor: JwtPayload,
  ): Promise<PurchaseRfqInvitation[]> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const validated = InviteSuppliersSchema.parse(input);

    return runInTenantSchema(this.dataSource, schemaName, async (qr) =>
      withTransaction(qr.manager, async (manager) => {
        const rfq = await this.requireRfq(manager, tenantId, rfqId);

        if (
          ![PurchaseRfqStatus.DRAFT, PurchaseRfqStatus.SENT, PurchaseRfqStatus.RECEIVING].includes(
            rfq.status,
          )
        ) {
          throw new BadRequestException(
            'La solicitud de cotización no admite nuevas invitaciones.',
          );
        }

        // Guarda por lote (P0-2/P0-4): perfiles bloqueados/inactivos y existencia + rol
        // SUPPLIER activo se resuelven en una sola consulta cada uno, en vez de un
        // round-trip por partyRefId.
        await this.supplierProfileService.assertNotBlockedForPurchasingBatch(
          manager,
          tenantId,
          validated.partyRefIds,
        );

        const activeRefs = await this.supplierPartyPort.filterActiveSupplierRefs(
          validated.partyRefIds,
        );
        const invalidRefs = validated.partyRefIds.filter(
          (partyRefId) => !activeRefs.has(partyRefId),
        );

        if (invalidRefs.length > 0) {
          throw new BadRequestException(
            'Uno o más proveedores no existen o no tienen rol de proveedor activo.',
          );
        }

        const existingInvitations = await manager.find(PurchaseRfqInvitation, {
          where: { tenantId, rfqId, partyRefId: In(validated.partyRefIds) },
        });
        const existingPartyRefIds = new Set(
          existingInvitations.map((invitation) => invitation.partyRefId),
        );

        const partyRefIdsToInsert = validated.partyRefIds.filter(
          (partyRefId) => !existingPartyRefIds.has(partyRefId),
        );

        if (partyRefIdsToInsert.length > 0) {
          const invitedAt = rfq.status === PurchaseRfqStatus.DRAFT ? null : new Date();

          // P0-3b: sin SAVEPOINT ni try/catch de carrera — ON CONFLICT DO NOTHING resuelve
          // la invitación duplicada dentro del propio INSERT, evitando que un 23505 deje la
          // transacción abortada (25P02) antes de reintentar con otro findOne.
          await manager
            .createQueryBuilder()
            .insert()
            .into(PurchaseRfqInvitation)
            .values(
              partyRefIdsToInsert.map((partyRefId) => ({
                tenantId,
                rfqId,
                partyRefId,
                status: PurchaseRfqInvitationStatus.INVITED,
                invitedAt,
                invitedByUserId: actor.sub,
              })),
            )
            .orIgnore()
            .execute();
        }

        const allInvitations = await manager.find(PurchaseRfqInvitation, {
          where: { tenantId, rfqId, partyRefId: In(validated.partyRefIds) },
        });
        const invitationByPartyRefId = new Map(
          allInvitations.map((invitation) => [invitation.partyRefId, invitation]),
        );

        // Preserva el orden de negocio que ya exponía el método (orden del body deduplicado).
        return validated.partyRefIds
          .map((partyRefId) => invitationByPartyRefId.get(partyRefId))
          .filter((invitation): invitation is PurchaseRfqInvitation => invitation !== undefined);
      }),
    );
  }

  async send(rfqId: string, actor: JwtPayload): Promise<PurchaseRfq> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();

    return runInTenantSchema(this.dataSource, schemaName, async (qr) =>
      withTransaction(qr.manager, async (manager) => {
        const rfq = await this.requireRfq(manager, tenantId, rfqId);

        if (rfq.status === PurchaseRfqStatus.SENT || rfq.status === PurchaseRfqStatus.RECEIVING) {
          return rfq;
        }

        if (rfq.status !== PurchaseRfqStatus.DRAFT) {
          throw new BadRequestException(
            'Solo se puede enviar una solicitud de cotización en borrador.',
          );
        }

        const invitations = await manager.find(PurchaseRfqInvitation, {
          where: { tenantId, rfqId },
        });

        if (invitations.length === 0) {
          throw new BadRequestException('Debes invitar al menos un proveedor antes de enviar.');
        }

        const request = await this.requirePurchaseRequest(manager, tenantId, rfq.purchaseRequestId);
        const lines = await manager.find(PurchaseRequestLine, {
          where: { tenantId, purchaseRequestId: request.id },
        });

        const now = new Date();
        rfq.status = PurchaseRfqStatus.SENT;
        rfq.sentAt = now;
        rfq.sentByUserId = actor.sub;
        await manager.save(PurchaseRfq, rfq);

        // Defensa Fase 10: no retroceder una solicitud ya avanzada (p. ej. PENDING_APPROVAL).
        if (request.status === PurchaseRequestStatus.DRAFT) {
          request.status = PurchaseRequestStatus.PENDING_QUOTES;
          await manager.save(PurchaseRequest, request);
        } else if (request.status !== PurchaseRequestStatus.PENDING_QUOTES) {
          throw new BadRequestException(
            'La solicitud no admite el envío de la ronda de cotización en su estado actual.',
          );
        }

        for (const line of lines) {
          if (line.lineStatus === PurchaseRequestLineStatus.OPEN) {
            line.lineStatus = PurchaseRequestLineStatus.PENDING_QUOTE;
            await manager.save(PurchaseRequestLine, line);
          }
        }

        for (const invitation of invitations) {
          if (invitation.status === PurchaseRfqInvitationStatus.INVITED && !invitation.invitedAt) {
            invitation.invitedAt = now;
            await manager.save(PurchaseRfqInvitation, invitation);
          }
        }

        return rfq;
      }),
    );
  }

  async decline(
    rfqId: string,
    invitationId: string,
    input: DeclineInvitationInput,
    actor: JwtPayload,
  ): Promise<PurchaseRfqInvitation> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const validated = DeclineInvitationSchema.parse(input);

    return runInTenantSchema(this.dataSource, schemaName, async (qr) =>
      withTransaction(qr.manager, async (manager) => {
        await this.requireRfq(manager, tenantId, rfqId);
        const invitation = await this.requireInvitation(manager, tenantId, rfqId, invitationId);

        if (invitation.status === PurchaseRfqInvitationStatus.DECLINED) {
          return invitation;
        }

        if (invitation.status !== PurchaseRfqInvitationStatus.INVITED) {
          throw new BadRequestException('La invitación no admite declinar en su estado actual.');
        }

        invitation.status = PurchaseRfqInvitationStatus.DECLINED;
        invitation.declinedAt = new Date();
        invitation.declineReason = validated.declineReason?.trim() ?? null;
        invitation.declinedByUserId = actor.sub;
        return manager.save(PurchaseRfqInvitation, invitation);
      }),
    );
  }

  async close(rfqId: string, actor: JwtPayload): Promise<PurchaseRfq> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();

    return runInTenantSchema(this.dataSource, schemaName, async (qr) =>
      withTransaction(qr.manager, async (manager) => {
        const rfq = await this.requireRfq(manager, tenantId, rfqId);

        if (rfq.status === PurchaseRfqStatus.CLOSED) {
          return rfq;
        }

        if (![PurchaseRfqStatus.SENT, PurchaseRfqStatus.RECEIVING].includes(rfq.status)) {
          throw new BadRequestException('Solo se puede cerrar una ronda enviada o en recepción.');
        }

        const invitations = await manager.find(PurchaseRfqInvitation, {
          where: { tenantId, rfqId },
        });
        const request = await this.requirePurchaseRequest(manager, tenantId, rfq.purchaseRequestId);
        const now = new Date();

        rfq.status = PurchaseRfqStatus.CLOSED;
        rfq.closedAt = now;
        rfq.closedByUserId = actor.sub;
        await manager.save(PurchaseRfq, rfq);

        for (const invitation of invitations) {
          if (invitation.status === PurchaseRfqInvitationStatus.INVITED) {
            invitation.status = PurchaseRfqInvitationStatus.EXPIRED;
            await manager.save(PurchaseRfqInvitation, invitation);
          }
        }

        // Defensa: no retroceder una solicitud ya avanzada (p. ej. APPROVED/CONVERTED_TO_PO)
        // al cerrar una ronda tardía. Solo se avanza a PENDING_APPROVAL desde los estados que
        // esta ronda pudo haber dejado pendientes (mismo criterio que send()).
        if (
          request.status === PurchaseRequestStatus.PENDING_QUOTES ||
          request.status === PurchaseRequestStatus.DRAFT
        ) {
          request.status = PurchaseRequestStatus.PENDING_APPROVAL;
          await manager.save(PurchaseRequest, request);
        }

        return rfq;
      }),
    );
  }

  async getById(rfqId: string): Promise<PurchaseRfqDetail> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const rfq = await this.requireRfq(qr.manager, tenantId, rfqId);
      const [invitations, request, lines] = await Promise.all([
        qr.manager.find(PurchaseRfqInvitation, {
          where: { tenantId, rfqId },
          order: { createdAt: 'ASC' },
        }),
        this.requirePurchaseRequest(qr.manager, tenantId, rfq.purchaseRequestId),
        qr.manager.find(PurchaseRequestLine, {
          where: { tenantId, purchaseRequestId: rfq.purchaseRequestId },
          order: { createdAt: 'ASC' },
        }),
      ]);

      return { rfq, invitations, request, lines };
    });
  }

  async applyQuoteToInvitation(
    manager: EntityManager,
    tenantId: string,
    input: {
      rfqInvitationId: string;
      partyRefId: string;
      quote: SupplierQuote;
    },
  ): Promise<void> {
    const invitation = await manager.findOne(PurchaseRfqInvitation, {
      where: { id: input.rfqInvitationId, tenantId },
    });

    if (!invitation) {
      throw new NotFoundException('La invitación de cotización no existe.');
    }

    if (invitation.partyRefId !== input.partyRefId) {
      throw new BadRequestException('La cotización no corresponde al proveedor invitado.');
    }

    const rfq = await this.requireRfq(manager, tenantId, invitation.rfqId);

    if (rfq.purchaseRequestId !== input.quote.purchaseRequestId) {
      throw new BadRequestException('La cotización no corresponde a la solicitud de esta ronda.');
    }

    if (![PurchaseRfqStatus.SENT, PurchaseRfqStatus.RECEIVING].includes(rfq.status)) {
      throw new BadRequestException('La ronda de cotización no está recibiendo respuestas.');
    }

    const duplicateQuote = await manager.findOne(SupplierQuote, {
      where: { tenantId, rfqInvitationId: invitation.id },
    });

    if (duplicateQuote && duplicateQuote.id !== input.quote.id) {
      throw new ConflictException('Esta invitación ya tiene una cotización registrada.');
    }

    input.quote.rfqId = rfq.id;
    input.quote.rfqInvitationId = invitation.id;
    await manager.save(SupplierQuote, input.quote);

    if (invitation.status !== PurchaseRfqInvitationStatus.RESPONDED) {
      invitation.status = PurchaseRfqInvitationStatus.RESPONDED;
      invitation.respondedAt = new Date();
      await manager.save(PurchaseRfqInvitation, invitation);
    }

    if (rfq.status === PurchaseRfqStatus.SENT) {
      rfq.status = PurchaseRfqStatus.RECEIVING;
      await manager.save(PurchaseRfq, rfq);
    }
  }

  /**
   * Cancela la ronda de cotización activa de una solicitud (si existe) y marca sus
   * invitaciones pendientes como canceladas. Reutilizable desde el rechazo/cancelación
   * de la solicitud de compra; opera dentro de la transacción del llamador.
   */
  async cancelActiveForRequest(
    manager: EntityManager,
    tenantId: string,
    purchaseRequestId: string,
    actor: JwtPayload,
  ): Promise<void> {
    const activeRfq = await manager
      .createQueryBuilder(PurchaseRfq, 'rfq')
      .where('rfq.tenant_id = :tenantId', { tenantId })
      .andWhere('rfq.purchase_request_id = :purchaseRequestId', { purchaseRequestId })
      .andWhere('rfq.status IN (:...statuses)', { statuses: ACTIVE_RFQ_STATUSES })
      .getOne();

    if (!activeRfq) {
      return;
    }

    const now = new Date();
    activeRfq.status = PurchaseRfqStatus.CANCELLED;
    activeRfq.closedAt = now;
    activeRfq.closedByUserId = actor.sub;
    await manager.save(PurchaseRfq, activeRfq);

    const invitations = await manager.find(PurchaseRfqInvitation, {
      where: { tenantId, rfqId: activeRfq.id },
    });

    for (const invitation of invitations) {
      if (invitation.status === PurchaseRfqInvitationStatus.INVITED) {
        invitation.status = PurchaseRfqInvitationStatus.CANCELLED;
        await manager.save(PurchaseRfqInvitation, invitation);
      }
    }
  }

  private async requireRfq(
    manager: EntityManager,
    tenantId: string,
    rfqId: string,
  ): Promise<PurchaseRfq> {
    const rfq = await manager.findOne(PurchaseRfq, {
      where: { id: rfqId, tenantId },
    });

    if (!rfq) {
      throw new NotFoundException('Solicitud de cotización no encontrada.');
    }

    return rfq;
  }

  private async requireInvitation(
    manager: EntityManager,
    tenantId: string,
    rfqId: string,
    invitationId: string,
  ): Promise<PurchaseRfqInvitation> {
    const invitation = await manager.findOne(PurchaseRfqInvitation, {
      where: { id: invitationId, tenantId, rfqId },
    });

    if (!invitation) {
      throw new NotFoundException('Invitación de cotización no encontrada.');
    }

    return invitation;
  }

  private async requirePurchaseRequest(
    manager: EntityManager,
    tenantId: string,
    purchaseRequestId: string,
  ): Promise<PurchaseRequest> {
    const request = await manager.findOne(PurchaseRequest, {
      where: { id: purchaseRequestId, tenantId },
    });

    if (!request) {
      throw new NotFoundException('Solicitud de compra no encontrada.');
    }

    return request;
  }
}
