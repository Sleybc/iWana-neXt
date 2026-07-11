import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
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
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';

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
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

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

        const rfqNumber = await this.generateRfqNumber(manager, tenantId);

        return manager.save(
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

        const created: PurchaseRfqInvitation[] = [];

        for (const partyRefId of validated.partyRefIds) {
          const existing = await manager.findOne(PurchaseRfqInvitation, {
            where: { tenantId, rfqId, partyRefId },
          });

          if (existing) {
            created.push(existing);
            continue;
          }

          const invitation = await manager.save(
            PurchaseRfqInvitation,
            manager.create(PurchaseRfqInvitation, {
              tenantId,
              rfqId,
              partyRefId,
              status: PurchaseRfqInvitationStatus.INVITED,
              invitedAt: rfq.status === PurchaseRfqStatus.DRAFT ? null : new Date(),
            }),
          );
          created.push(invitation);
        }

        void actor;
        return created;
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
        await manager.save(PurchaseRfq, rfq);

        request.status = PurchaseRequestStatus.PENDING_QUOTES;
        await manager.save(PurchaseRequest, request);

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

        void actor;
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
        void actor;
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
        await manager.save(PurchaseRfq, rfq);

        for (const invitation of invitations) {
          if (invitation.status === PurchaseRfqInvitationStatus.INVITED) {
            invitation.status = PurchaseRfqInvitationStatus.EXPIRED;
            await manager.save(PurchaseRfqInvitation, invitation);
          }
        }

        request.status = PurchaseRequestStatus.PENDING_APPROVAL;
        await manager.save(PurchaseRequest, request);

        void actor;
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

  private async generateRfqNumber(
    manager: Pick<EntityManager, 'createQueryBuilder'>,
    tenantId: string,
  ): Promise<string> {
    const result = await manager
      .createQueryBuilder(PurchaseRfq, 'rfq')
      .select('MAX(rfq.rfq_number)', 'maxValue')
      .where('rfq.tenant_id = :tenantId', { tenantId })
      .getRawOne<{ maxValue?: string | null }>();

    const latestNumber = result?.maxValue ?? 'RFQ-000000';
    const latestSequence = latestNumber.slice('RFQ-'.length);
    const nextSequence = (Number.parseInt(latestSequence || '0', 10) + 1)
      .toString()
      .padStart(6, '0');
    return `RFQ-${nextSequence}`;
  }
}
