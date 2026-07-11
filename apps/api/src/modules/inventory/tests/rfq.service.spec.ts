import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
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
  UserRole,
} from '@iwana/shared';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { RfqService } from '../services/rfq.service';

jest.mock('@iwana/db', () => ({
  PurchaseRequest: class PurchaseRequest {},
  PurchaseRequestLine: class PurchaseRequestLine {},
  PurchaseRfq: class PurchaseRfq {},
  PurchaseRfqInvitation: class PurchaseRfqInvitation {},
  SupplierQuote: class SupplierQuote {},
  TenantContext: {
    getOrThrow: jest.fn().mockReturnValue({
      tenantId: 'tenant-001',
      schemaName: 'tenant_001',
    }),
  },
  runInTenantSchema: jest.fn(),
}));

const actor: JwtPayload = {
  sub: 'support-001',
  email: 'support@example.test',
  role: UserRole.SUPPORT,
  tenantId: 'tenant-001',
  schemaName: 'tenant_001',
  jti: 'jti-support',
  type: 'tenant',
};

const REQUEST_ID = '11111111-1111-4111-8111-111111111111';
const RFQ_ID = '22222222-2222-4222-8222-222222222222';
const INVITATION_ID = '33333333-3333-4333-8333-333333333333';
const PARTY_REF_ID = '44444444-4444-4444-8444-444444444444';

describe('RfqService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (TenantContext.getOrThrow as jest.Mock).mockReturnValue({
      tenantId: 'tenant-001',
      schemaName: 'tenant_001',
    });
  });

  function buildManager(options?: {
    request?: Partial<PurchaseRequest> | null;
    rfq?: Partial<PurchaseRfq> | null;
    activeRfq?: Partial<PurchaseRfq> | null;
    invitation?: Partial<PurchaseRfqInvitation> | null;
    invitations?: Partial<PurchaseRfqInvitation>[];
    lines?: Partial<PurchaseRequestLine>[];
    duplicateQuote?: Partial<SupplierQuote> | null;
  }) {
    const request =
      options?.request === null
        ? null
        : {
            id: REQUEST_ID,
            tenantId: 'tenant-001',
            status: PurchaseRequestStatus.DRAFT,
            requestNumber: 'PR-000001',
            title: 'Solicitud demo',
            ...(options?.request ?? {}),
          };

    const rfq =
      options?.rfq === null
        ? null
        : {
            id: RFQ_ID,
            tenantId: 'tenant-001',
            purchaseRequestId: REQUEST_ID,
            rfqNumber: 'RFQ-000001',
            status: PurchaseRfqStatus.DRAFT,
            currency: 'COP',
            responseDeadline: null,
            sentAt: null,
            closedAt: null,
            notes: null,
            ...(options?.rfq ?? {}),
          };

    const invitation =
      options?.invitation === null
        ? null
        : {
            id: INVITATION_ID,
            tenantId: 'tenant-001',
            rfqId: RFQ_ID,
            partyRefId: PARTY_REF_ID,
            status: PurchaseRfqInvitationStatus.INVITED,
            invitedAt: null,
            respondedAt: null,
            declinedAt: null,
            declineReason: null,
            ...(options?.invitation ?? {}),
          };

    const save = jest.fn().mockImplementation(async (_entity, payload) => ({
      id: 'generated-id',
      ...payload,
    }));

    const createQueryBuilder = jest.fn().mockReturnValue({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(options?.activeRfq ?? null),
      getRawOne: jest.fn().mockResolvedValue({ maxValue: 'RFQ-000001' }),
    });

    const manager = {
      transaction: jest.fn().mockImplementation(async (work) => work(manager)),
      findOne: jest.fn().mockImplementation(async (entity, query) => {
        if (entity === PurchaseRequest) {
          return query.where.id === request?.id ? request : null;
        }
        if (entity === PurchaseRfq) {
          return query.where.id === rfq?.id ? rfq : null;
        }
        if (entity === PurchaseRfqInvitation) {
          if (query.where.id === invitation?.id) {
            return invitation;
          }
          if (query.where.rfqId && query.where.partyRefId === PARTY_REF_ID) {
            return invitation;
          }
          return null;
        }
        if (entity === SupplierQuote) {
          return options?.duplicateQuote ?? null;
        }
        return null;
      }),
      find: jest.fn().mockImplementation(async (entity) => {
        if (entity === PurchaseRfqInvitation) {
          return options?.invitations ?? (invitation ? [invitation] : []);
        }
        if (entity === PurchaseRequestLine) {
          return (
            options?.lines ?? [
              {
                id: 'line-001',
                tenantId: 'tenant-001',
                purchaseRequestId: REQUEST_ID,
                lineStatus: PurchaseRequestLineStatus.OPEN,
              },
            ]
          );
        }
        return [];
      }),
      save,
      create: jest.fn().mockImplementation((_entity, payload) => payload),
      createQueryBuilder,
    };

    return { manager, save, createQueryBuilder };
  }

  it('createFromRequest crea RFQ en borrador', async () => {
    const { manager } = buildManager();
    (runInTenantSchema as jest.Mock).mockImplementation(async (_ds, _schema, fn) =>
      fn({ manager } as never),
    );

    const service = new RfqService({} as DataSource);
    const result = await service.createFromRequest(REQUEST_ID, { currency: 'COP' }, actor);

    expect(result.status).toBe(PurchaseRfqStatus.DRAFT);
    expect(result.rfqNumber).toBe('RFQ-000002');
  });

  it('createFromRequest rechaza RFQ activa duplicada', async () => {
    const { manager } = buildManager({
      activeRfq: { id: RFQ_ID, status: PurchaseRfqStatus.SENT },
    });
    (runInTenantSchema as jest.Mock).mockImplementation(async (_ds, _schema, fn) =>
      fn({ manager } as never),
    );

    const service = new RfqService({} as DataSource);
    await expect(
      service.createFromRequest(REQUEST_ID, { currency: 'COP' }, actor),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('send es idempotente cuando ya está enviada', async () => {
    const { manager, save } = buildManager({
      rfq: { status: PurchaseRfqStatus.SENT, sentAt: new Date() },
      invitations: [{ id: INVITATION_ID, status: PurchaseRfqInvitationStatus.INVITED }],
    });
    (runInTenantSchema as jest.Mock).mockImplementation(async (_ds, _schema, fn) =>
      fn({ manager } as never),
    );

    const service = new RfqService({} as DataSource);
    const result = await service.send(RFQ_ID, actor);

    expect(result.status).toBe(PurchaseRfqStatus.SENT);
    expect(save).not.toHaveBeenCalled();
  });

  it('send mueve solicitud a pendiente de cotizaciones', async () => {
    const { manager, save } = buildManager({
      invitations: [{ id: INVITATION_ID, status: PurchaseRfqInvitationStatus.INVITED }],
    });
    (runInTenantSchema as jest.Mock).mockImplementation(async (_ds, _schema, fn) =>
      fn({ manager } as never),
    );

    const service = new RfqService({} as DataSource);
    const result = await service.send(RFQ_ID, actor);

    expect(result.status).toBe(PurchaseRfqStatus.SENT);
    expect(save).toHaveBeenCalledWith(
      PurchaseRequest,
      expect.objectContaining({ status: PurchaseRequestStatus.PENDING_QUOTES }),
    );
  });

  it('close expira invitaciones pendientes y mueve solicitud a aprobación', async () => {
    const { manager, save } = buildManager({
      rfq: { status: PurchaseRfqStatus.RECEIVING },
      invitations: [
        { id: INVITATION_ID, status: PurchaseRfqInvitationStatus.INVITED },
        { id: 'inv-002', status: PurchaseRfqInvitationStatus.RESPONDED },
      ],
    });
    (runInTenantSchema as jest.Mock).mockImplementation(async (_ds, _schema, fn) =>
      fn({ manager } as never),
    );

    const service = new RfqService({} as DataSource);
    const result = await service.close(RFQ_ID, actor);

    expect(result.status).toBe(PurchaseRfqStatus.CLOSED);
    expect(save).toHaveBeenCalledWith(
      PurchaseRfqInvitation,
      expect.objectContaining({ status: PurchaseRfqInvitationStatus.EXPIRED }),
    );
    expect(save).toHaveBeenCalledWith(
      PurchaseRequest,
      expect.objectContaining({ status: PurchaseRequestStatus.PENDING_APPROVAL }),
    );
  });

  it('decline es idempotente', async () => {
    const { manager, save } = buildManager({
      invitation: {
        status: PurchaseRfqInvitationStatus.DECLINED,
        declinedAt: new Date(),
      },
    });
    (runInTenantSchema as jest.Mock).mockImplementation(async (_ds, _schema, fn) =>
      fn({ manager } as never),
    );

    const service = new RfqService({} as DataSource);
    const result = await service.decline(RFQ_ID, INVITATION_ID, {}, actor);

    expect(result.status).toBe(PurchaseRfqInvitationStatus.DECLINED);
    expect(save).not.toHaveBeenCalled();
  });

  it('applyQuoteToInvitation vincula cotización y mueve RFQ a recepción', async () => {
    const { manager, save } = buildManager({
      rfq: { status: PurchaseRfqStatus.SENT },
      invitation: { status: PurchaseRfqInvitationStatus.INVITED, partyRefId: PARTY_REF_ID },
    });

    const service = new RfqService({} as DataSource);
    const quote = {
      id: 'quote-001',
      tenantId: 'tenant-001',
      purchaseRequestId: REQUEST_ID,
      partyRefId: PARTY_REF_ID,
      rfqId: null,
      rfqInvitationId: null,
    } as SupplierQuote;

    await service.applyQuoteToInvitation(manager as never, 'tenant-001', {
      rfqInvitationId: INVITATION_ID,
      partyRefId: PARTY_REF_ID,
      quote,
    });

    expect(save).toHaveBeenCalledWith(
      SupplierQuote,
      expect.objectContaining({
        rfqId: RFQ_ID,
        rfqInvitationId: INVITATION_ID,
      }),
    );
    expect(save).toHaveBeenCalledWith(
      PurchaseRfq,
      expect.objectContaining({ status: PurchaseRfqStatus.RECEIVING }),
    );
  });

  it('applyQuoteToInvitation valida proveedor invitado', async () => {
    const { manager } = buildManager({
      rfq: { status: PurchaseRfqStatus.SENT },
      invitation: { partyRefId: PARTY_REF_ID },
    });

    const service = new RfqService({} as DataSource);
    await expect(
      service.applyQuoteToInvitation(manager as never, 'tenant-001', {
        rfqInvitationId: INVITATION_ID,
        partyRefId: '99999999-9999-4999-8999-999999999999',
        quote: { id: 'quote-001' } as SupplierQuote,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('getById lanza 404 si no existe', async () => {
    const { manager } = buildManager({ rfq: null });
    (runInTenantSchema as jest.Mock).mockImplementation(async (_ds, _schema, fn) =>
      fn({ manager } as never),
    );

    const service = new RfqService({} as DataSource);
    await expect(service.getById(RFQ_ID)).rejects.toBeInstanceOf(NotFoundException);
  });
});
