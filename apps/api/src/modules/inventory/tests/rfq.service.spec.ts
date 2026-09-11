import { randomUUID } from 'node:crypto';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { DataSource, QueryFailedError } from 'typeorm';
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
import { InviteSuppliersSchema } from '../dto';
import { SupplierPartyPort } from '../ports/supplier-party.port';
import { RfqService } from '../services/rfq.service';
import { SupplierProfileService } from '../services/supplier-profile.service';

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

const supplierProfileServiceMock = {
  assertNotBlockedForPurchasingBatch: jest.fn().mockResolvedValue(undefined),
} as unknown as SupplierProfileService;

const supplierPartyPortMock = {
  // Por defecto toda referencia enviada se resuelve como proveedor activo; los tests que
  // ejercitan el rechazo sobrescriben esta implementación puntualmente.
  filterActiveSupplierRefs: jest.fn().mockImplementation(async (partyRefIds: string[]) => {
    return new Set(partyRefIds);
  }),
} as unknown as SupplierPartyPort;

/** Encuentra en el `where` de un find() un valor simple o un FindOperator `In(...)`. */
function whereMatchesPartyRefId(whereValue: unknown, partyRefId: string): boolean {
  if (whereValue === undefined) return true;
  if (typeof whereValue === 'string') return whereValue === partyRefId;
  if (whereValue && typeof whereValue === 'object' && 'value' in (whereValue as object)) {
    const { value } = whereValue as { value: unknown };
    return Array.isArray(value) && value.includes(partyRefId);
  }
  return false;
}

describe('RfqService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (TenantContext.getOrThrow as jest.Mock).mockReturnValue({
      tenantId: 'tenant-001',
      schemaName: 'tenant_001',
    });
    (supplierProfileServiceMock.assertNotBlockedForPurchasingBatch as jest.Mock).mockResolvedValue(
      undefined,
    );
    (supplierPartyPortMock.filterActiveSupplierRefs as jest.Mock).mockImplementation(
      async (partyRefIds: string[]) => new Set(partyRefIds),
    );
  });

  function buildService() {
    return new RfqService({} as DataSource, supplierProfileServiceMock, supplierPartyPortMock);
  }

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

    // Store en memoria que simula la tabla purchase_rfq_invitations para invite():
    // el INSERT ... ON CONFLICT DO NOTHING mockeado escribe aquí, y el find() final lee de aquí.
    const invitationsStore: Array<Record<string, unknown>> = options?.invitations
      ? [...options.invitations]
      : invitation
        ? [invitation]
        : [];

    const save = jest.fn().mockImplementation(async (_entity, payload) => ({
      id: 'generated-id',
      ...payload,
    }));

    const createQueryBuilder = jest.fn().mockImplementation((...args: unknown[]) => {
      if (args.length === 0) {
        // Query builder de INSERT usado por invite() — ON CONFLICT (rfq_id, party_ref_id) DO NOTHING.
        let rowsToInsert: Array<Record<string, unknown>> = [];
        const insertBuilder = {
          insert: jest.fn().mockReturnThis(),
          into: jest.fn().mockReturnThis(),
          values: jest.fn().mockImplementation((rows: Array<Record<string, unknown>>) => {
            rowsToInsert = rows;
            return insertBuilder;
          }),
          orIgnore: jest.fn().mockReturnThis(),
          execute: jest.fn().mockImplementation(async () => {
            for (const row of rowsToInsert) {
              const alreadyExists = invitationsStore.some(
                (inv) => inv.rfqId === row.rfqId && inv.partyRefId === row.partyRefId,
              );
              if (!alreadyExists) {
                invitationsStore.push({
                  id: `generated-inv-${invitationsStore.length + 1}`,
                  ...row,
                });
              }
            }
            return { identifiers: [], raw: [], generatedMaps: [] };
          }),
        };
        return insertBuilder;
      }

      return {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(options?.activeRfq ?? null),
        getRawOne: jest.fn().mockResolvedValue({ maxValue: 'RFQ-000001' }),
      };
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
      find: jest.fn().mockImplementation(async (entity, query) => {
        if (entity === PurchaseRfqInvitation) {
          if (query?.where?.partyRefId !== undefined) {
            return invitationsStore.filter(
              (inv) =>
                inv.rfqId === query.where.rfqId &&
                whereMatchesPartyRefId(query.where.partyRefId, inv.partyRefId as string),
            );
          }
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

    return { manager, save, createQueryBuilder, invitationsStore };
  }

  it('createFromRequest crea RFQ en borrador', async () => {
    const { manager } = buildManager();
    (runInTenantSchema as jest.Mock).mockImplementation(async (_ds, _schema, fn) =>
      fn({ manager } as never),
    );

    const service = buildService();
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

    const service = buildService();
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

    const service = buildService();
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

    const service = buildService();
    const result = await service.send(RFQ_ID, actor);

    expect(result.status).toBe(PurchaseRfqStatus.SENT);
    expect(save).toHaveBeenCalledWith(
      PurchaseRfq,
      expect.objectContaining({ status: PurchaseRfqStatus.SENT, sentByUserId: actor.sub }),
    );
    expect(save).toHaveBeenCalledWith(
      PurchaseRequest,
      expect.objectContaining({ status: PurchaseRequestStatus.PENDING_QUOTES }),
    );
  });

  it('send rechaza cuando la solicitud ya no está en borrador', async () => {
    const { manager } = buildManager({
      request: { status: PurchaseRequestStatus.PENDING_APPROVAL },
      invitations: [{ id: INVITATION_ID, status: PurchaseRfqInvitationStatus.INVITED }],
    });
    (runInTenantSchema as jest.Mock).mockImplementation(async (_ds, _schema, fn) =>
      fn({ manager } as never),
    );

    const service = buildService();
    await expect(service.send(RFQ_ID, actor)).rejects.toThrow(
      'no admite el envío de la ronda de cotización',
    );
  });

  it('createFromRequest traduce violacion unica concurrente a ConflictException', async () => {
    const { manager, save } = buildManager();
    save.mockRejectedValueOnce(
      new QueryFailedError(
        'INSERT INTO purchase_rfqs',
        [],
        Object.assign(new Error('duplicate key'), {
          code: '23505',
          constraint: 'uq_purchase_rfqs_active_request',
        }),
      ),
    );
    (runInTenantSchema as jest.Mock).mockImplementation(async (_ds, _schema, fn) =>
      fn({ manager } as never),
    );

    const service = buildService();
    await expect(
      service.createFromRequest(REQUEST_ID, { currency: 'COP' }, actor),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  describe('invite', () => {
    it('persiste actor invitador en invitaciones nuevas', async () => {
      const { manager } = buildManager({ invitation: null });
      (runInTenantSchema as jest.Mock).mockImplementation(async (_ds, _schema, fn) =>
        fn({ manager } as never),
      );

      const service = buildService();
      const result = await service.invite(RFQ_ID, { partyRefIds: [PARTY_REF_ID] }, actor);

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        invitedByUserId: actor.sub,
        partyRefId: PARTY_REF_ID,
        rfqId: RFQ_ID,
      });
    });

    it('invitedAt es null en RFQ DRAFT y se fija cuando la ronda ya fue enviada', async () => {
      const { manager } = buildManager({
        invitation: null,
        rfq: { status: PurchaseRfqStatus.SENT },
      });
      (runInTenantSchema as jest.Mock).mockImplementation(async (_ds, _schema, fn) =>
        fn({ manager } as never),
      );

      const service = buildService();
      const result = await service.invite(RFQ_ID, { partyRefIds: [PARTY_REF_ID] }, actor);

      expect(result[0]?.invitedAt).toBeInstanceOf(Date);
    });

    it('rechaza un proveedor sin perfil ni rol SUPPLIER activo', async () => {
      const { manager } = buildManager({ invitation: null });
      (runInTenantSchema as jest.Mock).mockImplementation(async (_ds, _schema, fn) =>
        fn({ manager } as never),
      );
      (supplierPartyPortMock.filterActiveSupplierRefs as jest.Mock).mockResolvedValueOnce(
        new Set(),
      );

      const service = buildService();
      await expect(
        service.invite(RFQ_ID, { partyRefIds: [PARTY_REF_ID] }, actor),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('propaga el rechazo cuando algún proveedor del lote está bloqueado/inactivo', async () => {
      const { manager } = buildManager({ invitation: null });
      (runInTenantSchema as jest.Mock).mockImplementation(async (_ds, _schema, fn) =>
        fn({ manager } as never),
      );
      (
        supplierProfileServiceMock.assertNotBlockedForPurchasingBatch as jest.Mock
      ).mockRejectedValueOnce(new BadRequestException('El proveedor está bloqueado.'));

      const service = buildService();
      await expect(
        service.invite(RFQ_ID, { partyRefIds: [PARTY_REF_ID] }, actor),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('acepta 50 proveedores en un mismo body', async () => {
      const partyRefIds = Array.from({ length: 50 }, () => randomUUID());
      const { manager } = buildManager({ invitation: null });
      (runInTenantSchema as jest.Mock).mockImplementation(async (_ds, _schema, fn) =>
        fn({ manager } as never),
      );

      const service = buildService();
      const result = await service.invite(RFQ_ID, { partyRefIds }, actor);

      expect(result).toHaveLength(50);
    });

    it('deduplica proveedores repetidos en el mismo body (una sola invitación)', async () => {
      const { manager } = buildManager({ invitation: null });
      (runInTenantSchema as jest.Mock).mockImplementation(async (_ds, _schema, fn) =>
        fn({ manager } as never),
      );

      const service = buildService();
      const result = await service.invite(
        RFQ_ID,
        { partyRefIds: [PARTY_REF_ID, PARTY_REF_ID] },
        actor,
      );

      expect(result).toHaveLength(1);
    });

    it('es idempotente si el proveedor ya fue invitado en una llamada anterior', async () => {
      // La invitación ya existe en el store (llamada anterior) — invite() no debe reventar
      // ni duplicarla; el INSERT ... ON CONFLICT DO NOTHING ni siquiera se ejercita para ella.
      const { manager, invitationsStore } = buildManager({
        invitation: { id: INVITATION_ID, partyRefId: PARTY_REF_ID },
      });
      (runInTenantSchema as jest.Mock).mockImplementation(async (_ds, _schema, fn) =>
        fn({ manager } as never),
      );

      const service = buildService();
      const result = await service.invite(RFQ_ID, { partyRefIds: [PARTY_REF_ID] }, actor);

      expect(result).toEqual([expect.objectContaining({ id: INVITATION_ID })]);
      expect(invitationsStore).toHaveLength(1);
    });

    it('rechaza cuando el RFQ no admite nuevas invitaciones', async () => {
      const { manager } = buildManager({
        invitation: null,
        rfq: { status: PurchaseRfqStatus.CLOSED },
      });
      (runInTenantSchema as jest.Mock).mockImplementation(async (_ds, _schema, fn) =>
        fn({ manager } as never),
      );

      const service = buildService();
      await expect(
        service.invite(RFQ_ID, { partyRefIds: [PARTY_REF_ID] }, actor),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('InviteSuppliersSchema (límite de proveedores por invitación)', () => {
    it('acepta hasta 50 proveedores', () => {
      const partyRefIds = Array.from({ length: 50 }, () => randomUUID());
      expect(() => InviteSuppliersSchema.parse({ partyRefIds })).not.toThrow();
    });

    it('rechaza 51 proveedores', () => {
      const partyRefIds = Array.from({ length: 51 }, () => randomUUID());
      expect(() => InviteSuppliersSchema.parse({ partyRefIds })).toThrow();
    });

    it('deduplica proveedores repetidos vía transform', () => {
      const parsed = InviteSuppliersSchema.parse({ partyRefIds: [PARTY_REF_ID, PARTY_REF_ID] });
      expect(parsed.partyRefIds).toEqual([PARTY_REF_ID]);
    });
  });

  describe('close', () => {
    it('DRAFT -> CLOSED expira invitaciones y mueve solicitud a aprobación (no rompe el comportamiento previo)', async () => {
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

      const service = buildService();
      const result = await service.close(RFQ_ID, actor);

      expect(result.status).toBe(PurchaseRfqStatus.CLOSED);
      expect(save).toHaveBeenCalledWith(
        PurchaseRfq,
        expect.objectContaining({ status: PurchaseRfqStatus.CLOSED, closedByUserId: actor.sub }),
      );
      expect(save).toHaveBeenCalledWith(
        PurchaseRfqInvitation,
        expect.objectContaining({ status: PurchaseRfqInvitationStatus.EXPIRED }),
      );
      expect(save).toHaveBeenCalledWith(
        PurchaseRequest,
        expect.objectContaining({ status: PurchaseRequestStatus.PENDING_APPROVAL }),
      );
    });

    it('PENDING_QUOTES -> PENDING_APPROVAL', async () => {
      const { manager, save } = buildManager({
        rfq: { status: PurchaseRfqStatus.SENT },
        request: { status: PurchaseRequestStatus.PENDING_QUOTES },
        invitations: [{ id: INVITATION_ID, status: PurchaseRfqInvitationStatus.INVITED }],
      });
      (runInTenantSchema as jest.Mock).mockImplementation(async (_ds, _schema, fn) =>
        fn({ manager } as never),
      );

      const service = buildService();
      const result = await service.close(RFQ_ID, actor);

      expect(result.status).toBe(PurchaseRfqStatus.CLOSED);
      expect(save).toHaveBeenCalledWith(
        PurchaseRequest,
        expect.objectContaining({ status: PurchaseRequestStatus.PENDING_APPROVAL }),
      );
    });

    it.each([
      PurchaseRequestStatus.APPROVED,
      PurchaseRequestStatus.CONVERTED_TO_PO,
      PurchaseRequestStatus.REJECTED,
      PurchaseRequestStatus.CANCELLED,
    ])('no retrocede una solicitud ya avanzada a %s', async (status) => {
      const { manager, save } = buildManager({
        rfq: { status: PurchaseRfqStatus.SENT },
        request: { status },
        invitations: [{ id: INVITATION_ID, status: PurchaseRfqInvitationStatus.INVITED }],
      });
      (runInTenantSchema as jest.Mock).mockImplementation(async (_ds, _schema, fn) =>
        fn({ manager } as never),
      );

      const service = buildService();
      const result = await service.close(RFQ_ID, actor);

      expect(result.status).toBe(PurchaseRfqStatus.CLOSED);
      expect(save).not.toHaveBeenCalledWith(PurchaseRequest, expect.anything());
    });
  });

  it('decline registra actor y motivo', async () => {
    const { manager, save } = buildManager();
    (runInTenantSchema as jest.Mock).mockImplementation(async (_ds, _schema, fn) =>
      fn({ manager } as never),
    );

    const service = buildService();
    await service.decline(RFQ_ID, INVITATION_ID, { declineReason: 'Sin stock' }, actor);

    expect(save).toHaveBeenCalledWith(
      PurchaseRfqInvitation,
      expect.objectContaining({
        status: PurchaseRfqInvitationStatus.DECLINED,
        declineReason: 'Sin stock',
        declinedByUserId: actor.sub,
      }),
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

    const service = buildService();
    const result = await service.decline(RFQ_ID, INVITATION_ID, {}, actor);

    expect(result.status).toBe(PurchaseRfqInvitationStatus.DECLINED);
    expect(save).not.toHaveBeenCalled();
  });

  describe('applyQuoteToInvitation', () => {
    it('vincula cotización y mueve RFQ a recepción', async () => {
      const { manager, save } = buildManager({
        rfq: { status: PurchaseRfqStatus.SENT },
        invitation: { status: PurchaseRfqInvitationStatus.INVITED, partyRefId: PARTY_REF_ID },
      });

      const service = buildService();
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

    it('CA-25-13: segundo POST a la misma invitación lanza 409', async () => {
      const { manager, save } = buildManager({
        rfq: { status: PurchaseRfqStatus.SENT },
        invitation: { status: PurchaseRfqInvitationStatus.INVITED, partyRefId: PARTY_REF_ID },
        duplicateQuote: { id: 'quote-existing', rfqInvitationId: INVITATION_ID },
      });

      const service = buildService();
      await expect(
        service.applyQuoteToInvitation(manager as never, 'tenant-001', {
          rfqInvitationId: INVITATION_ID,
          partyRefId: PARTY_REF_ID,
          quote: { id: 'quote-new', purchaseRequestId: REQUEST_ID } as SupplierQuote,
        }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(save).not.toHaveBeenCalled();
    });

    it('valida proveedor invitado', async () => {
      const { manager } = buildManager({
        rfq: { status: PurchaseRfqStatus.SENT },
        invitation: { partyRefId: PARTY_REF_ID },
      });

      const service = buildService();
      await expect(
        service.applyQuoteToInvitation(manager as never, 'tenant-001', {
          rfqInvitationId: INVITATION_ID,
          partyRefId: '99999999-9999-4999-8999-999999999999',
          quote: { id: 'quote-001', purchaseRequestId: REQUEST_ID } as SupplierQuote,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rechaza una cotización que no corresponde a la solicitud de esta ronda', async () => {
      // Mismo proveedor invitado en dos rondas distintas (solicitud A y solicitud B): la
      // cotización de la solicitud A no puede aplicarse contra la invitación de la ronda B.
      const OTHER_REQUEST_ID = '66666666-6666-4666-8666-666666666666';
      const { manager } = buildManager({
        rfq: { status: PurchaseRfqStatus.SENT, purchaseRequestId: REQUEST_ID },
        invitation: { status: PurchaseRfqInvitationStatus.INVITED, partyRefId: PARTY_REF_ID },
      });

      const service = buildService();
      await expect(
        service.applyQuoteToInvitation(manager as never, 'tenant-001', {
          rfqInvitationId: INVITATION_ID,
          partyRefId: PARTY_REF_ID,
          quote: {
            id: 'quote-001',
            purchaseRequestId: OTHER_REQUEST_ID,
            partyRefId: PARTY_REF_ID,
          } as SupplierQuote,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  it('getById lanza 404 si no existe', async () => {
    const { manager } = buildManager({ rfq: null });
    (runInTenantSchema as jest.Mock).mockImplementation(async (_ds, _schema, fn) =>
      fn({ manager } as never),
    );

    const service = buildService();
    await expect(service.getById(RFQ_ID)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('cancelActiveForRequest cancela RFQ activa e invitaciones INVITED', async () => {
    const invited = {
      id: INVITATION_ID,
      tenantId: 'tenant-001',
      rfqId: RFQ_ID,
      partyRefId: PARTY_REF_ID,
      status: PurchaseRfqInvitationStatus.INVITED,
    };
    const responded = {
      id: 'inv-responded',
      tenantId: 'tenant-001',
      rfqId: RFQ_ID,
      partyRefId: '55555555-5555-4555-8555-555555555555',
      status: PurchaseRfqInvitationStatus.RESPONDED,
    };
    const activeRfq = {
      id: RFQ_ID,
      tenantId: 'tenant-001',
      purchaseRequestId: REQUEST_ID,
      status: PurchaseRfqStatus.SENT,
      closedAt: null,
      closedByUserId: null,
    };
    const { manager, save } = buildManager({
      activeRfq,
      invitations: [invited, responded],
    });

    const service = buildService();
    await service.cancelActiveForRequest(manager as never, 'tenant-001', REQUEST_ID, actor);

    expect(save).toHaveBeenCalledWith(
      PurchaseRfq,
      expect.objectContaining({
        status: PurchaseRfqStatus.CANCELLED,
        closedByUserId: actor.sub,
      }),
    );
    expect(save).toHaveBeenCalledWith(
      PurchaseRfqInvitation,
      expect.objectContaining({
        id: INVITATION_ID,
        status: PurchaseRfqInvitationStatus.CANCELLED,
      }),
    );
    expect(save).not.toHaveBeenCalledWith(
      PurchaseRfqInvitation,
      expect.objectContaining({
        id: 'inv-responded',
        status: PurchaseRfqInvitationStatus.CANCELLED,
      }),
    );
  });

  it('cancelActiveForRequest no-op si no hay RFQ activa', async () => {
    const { manager, save } = buildManager({ activeRfq: null });
    const service = buildService();

    await service.cancelActiveForRequest(manager as never, 'tenant-001', REQUEST_ID, actor);

    expect(save).not.toHaveBeenCalled();
  });
});
