import { ConflictException, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager, QueryFailedError } from 'typeorm';
import { SupplierProfile, TenantContext, runInTenantSchema } from '@iwana/db';
import {
  DocumentTypeParty,
  IncotermCode,
  PartyRoleType,
  PartyStatus,
  PartyType,
  SupplierProfileStatus,
  UserRole,
} from '@iwana/shared';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { IPartyWritePort } from '../../parties/ports/party-write.port';
import { SupplierPartyPort } from '../ports/supplier-party.port';
import { SupplierProfileService } from '../services/supplier-profile.service';

jest.mock('@iwana/db', () => ({
  SupplierProfile: class SupplierProfile {},
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

const PARTY_REF_ID = '44444444-4444-4444-8444-444444444444';
const PARTY_ROLE_ID = '55555555-5555-4555-8555-555555555555';
const PROFILE_ID = '66666666-6666-4666-8666-666666666666';

const partySummary = {
  partyRefId: PARTY_REF_ID,
  displayName: 'Proveedor ACME',
  primaryContact: 'compras@acme.test',
  phone: '3000000000',
  email: 'compras@acme.test',
  city: 'Bogotá',
  status: PartyStatus.ACTIVE,
};

const partyIdentity = {
  partyId: PARTY_REF_ID,
  displayName: 'Proveedor ACME',
  legalName: 'Proveedor ACME S.A.S.',
  partyType: PartyType.ORGANIZATION,
  documentType: DocumentTypeParty.NIT,
  status: PartyStatus.ACTIVE,
  contacts: [],
};

describe('SupplierProfileService', () => {
  let service: SupplierProfileService;
  let partyWritePort: jest.Mocked<IPartyWritePort>;
  let supplierPartyPort: jest.Mocked<SupplierPartyPort>;
  let profiles: Array<Record<string, unknown>>;
  let nextProfileId: number;

  beforeEach(() => {
    jest.clearAllMocks();
    profiles = [];
    nextProfileId = 1;

    (TenantContext.getOrThrow as jest.Mock).mockReturnValue({
      tenantId: 'tenant-001',
      schemaName: 'tenant_001',
    });

    partyWritePort = {
      ensurePartyWithRole: jest.fn(),
    } as never;

    supplierPartyPort = {
      getSupplierSummary: jest.fn(),
      getSupplierSummariesBatch: jest.fn(),
      searchSuppliers: jest.fn(),
      summaryFromIdentity: jest.fn(),
      findIdentityByDocument: jest.fn(),
    } as never;

    service = new SupplierProfileService({} as DataSource, partyWritePort, supplierPartyPort);

    supplierPartyPort.getSupplierSummary.mockResolvedValue(partySummary);
    supplierPartyPort.getSupplierSummariesBatch.mockResolvedValue(
      new Map([[PARTY_REF_ID, partySummary]]),
    );
    supplierPartyPort.summaryFromIdentity.mockReturnValue(partySummary);
    supplierPartyPort.findIdentityByDocument.mockResolvedValue(null);
    supplierPartyPort.searchSuppliers.mockResolvedValue({
      data: [
        { partyRefId: PARTY_REF_ID, displayName: 'Proveedor ACME', status: PartyStatus.ACTIVE },
      ],
      total: 1,
      page: 1,
      limit: 20,
    });

    (runInTenantSchema as jest.Mock).mockImplementation(async (_ds, _schema, fn) =>
      fn({ manager: createManager() } as never),
    );
  });

  function createManager() {
    return {
      transaction: jest
        .fn()
        .mockImplementation(async (work: (manager: unknown) => Promise<unknown>) =>
          work(createManager()),
        ),
      createQueryBuilder: jest.fn().mockImplementation((_entity, alias) => ({
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getCount: jest.fn().mockResolvedValue(profiles.length),
        getMany: jest.fn().mockResolvedValue([...profiles]),
        getRawOne: jest.fn().mockResolvedValue({ maxValue: 'PROV-000001' }),
        getOne: jest.fn().mockImplementation(async () => null),
      })),
      create: jest.fn((_entity, payload) => payload),
      save: jest.fn().mockImplementation(async (_entity, payload) => {
        if (payload.partyRefId && payload.supplierCode) {
          const saved = {
            id: `66666666-6666-4666-8666-${String(nextProfileId++).padStart(12, '0')}`,
            createdAt: new Date('2026-07-11T12:00:00.000Z'),
            updatedAt: new Date('2026-07-11T12:00:00.000Z'),
            status: SupplierProfileStatus.ACTIVE,
            ...payload,
          };
          profiles.push(saved);
          return saved;
        }

        const index = profiles.findIndex((entry) => entry.id === payload.id);
        if (index >= 0) {
          profiles[index] = {
            ...profiles[index],
            ...payload,
            updatedAt: new Date('2026-07-11T13:00:00.000Z'),
          };
          return profiles[index];
        }

        return payload;
      }),
      findOne: jest.fn().mockImplementation(async (_entity, options) => {
        const partyRefId = options?.where?.partyRefId;
        return profiles.find((entry) => entry.partyRefId === partyRefId) ?? null;
      }),
    };
  }

  const createInput = {
    partyType: PartyType.ORGANIZATION,
    documentType: DocumentTypeParty.NIT,
    documentNumber: '900123456',
    displayName: 'Proveedor ACME',
    paymentTermsDays: 30,
    currency: 'cop',
  };

  it('create registra party nuevo y perfil comercial', async () => {
    partyWritePort.ensurePartyWithRole.mockResolvedValue({
      partyId: PARTY_REF_ID,
      partyRoleId: PARTY_ROLE_ID,
      partyCreated: true,
      roleAdded: true,
      identity: partyIdentity,
    });

    const result = await service.create(createInput, actor);

    expect(partyWritePort.ensurePartyWithRole).toHaveBeenCalledWith(
      expect.objectContaining({
        partyType: PartyType.ORGANIZATION,
        documentType: DocumentTypeParty.NIT,
        documentNumber: '900123456',
        displayName: 'Proveedor ACME',
      }),
      PartyRoleType.SUPPLIER,
      expect.objectContaining({ actorUserId: actor.sub }),
    );
    expect(result.supplierCode).toBe('PROV-000002');
    expect(result.partyRefId).toBe(PARTY_REF_ID);
    expect(result.party?.displayName).toBe('Proveedor ACME');
    expect(result.paymentTermsDays).toBe(30);
    expect(result.currency).toBe('COP');
  });

  it('create reutiliza party existente', async () => {
    partyWritePort.ensurePartyWithRole.mockResolvedValue({
      partyId: PARTY_REF_ID,
      partyRoleId: PARTY_ROLE_ID,
      partyCreated: false,
      roleAdded: true,
      identity: partyIdentity,
    });

    const result = await service.create(createInput, actor);

    expect(result.partyRefId).toBe(PARTY_REF_ID);
    expect(result.party?.displayName).toBe('Proveedor ACME');
    expect(partyWritePort.ensurePartyWithRole).toHaveBeenCalledTimes(1);
  });

  it('create lanza 409 cuando ya existe perfil para el tercero', async () => {
    partyWritePort.ensurePartyWithRole.mockResolvedValue({
      partyId: PARTY_REF_ID,
      partyRoleId: PARTY_ROLE_ID,
      partyCreated: false,
      roleAdded: false,
      identity: partyIdentity,
    });

    const duplicateError = new QueryFailedError('INSERT', [], {
      code: '23505',
      constraint: 'uq_supplier_profiles_tenant_party_ref',
    } as never);

    (runInTenantSchema as jest.Mock).mockImplementation(async (_ds, _schema, fn) => {
      const manager = createManager();
      manager.save = jest.fn().mockRejectedValue(duplicateError);
      manager.transaction = jest
        .fn()
        .mockImplementation(async (work: (transactionManager: unknown) => Promise<unknown>) =>
          work(manager),
        );
      return fn({ manager } as never);
    });

    await expect(service.create(createInput, actor)).rejects.toThrow(
      new ConflictException('Ya existe un perfil de proveedor para este tercero.'),
    );
  });

  it('list devuelve perfiles paginados enriquecidos con party (batch, sin N+1)', async () => {
    profiles.push({
      id: PROFILE_ID,
      tenantId: 'tenant-001',
      partyRefId: PARTY_REF_ID,
      partyRoleId: PARTY_ROLE_ID,
      supplierCode: 'PROV-000001',
      status: SupplierProfileStatus.ACTIVE,
      paymentTermsDays: 30,
      currency: 'COP',
      incoterm: null,
      defaultLeadTimeDays: null,
      purchasingContactName: null,
      purchasingContactEmail: null,
      purchasingContactPhone: null,
      notes: null,
      createdAt: new Date('2026-07-11T12:00:00.000Z'),
      updatedAt: new Date('2026-07-11T12:00:00.000Z'),
    });

    const result = await service.list({ page: 1, limit: 20 });

    expect(result.total).toBe(1);
    expect(result.page).toBe(1);
    expect(result.meta).toMatchObject({
      mode: 'page',
      page: 1,
      total: 1,
      limit: 20,
      totalPages: 1,
      hasMore: false,
      capabilities: { randomAccess: true, sortableFields: [] },
    });
    expect(result.data).toHaveLength(1);
    expect(result.data[0]?.supplierCode).toBe('PROV-000001');
    expect(result.data[0]?.party?.displayName).toBe('Proveedor ACME');
    expect(supplierPartyPort.getSupplierSummariesBatch).toHaveBeenCalledWith([PARTY_REF_ID]);
    expect(supplierPartyPort.getSupplierSummary).not.toHaveBeenCalled();
  });

  it('get devuelve perfil con party summary', async () => {
    profiles.push({
      id: PROFILE_ID,
      tenantId: 'tenant-001',
      partyRefId: PARTY_REF_ID,
      partyRoleId: PARTY_ROLE_ID,
      supplierCode: 'PROV-000001',
      status: SupplierProfileStatus.ACTIVE,
      paymentTermsDays: null,
      currency: null,
      incoterm: null,
      defaultLeadTimeDays: null,
      purchasingContactName: null,
      purchasingContactEmail: null,
      purchasingContactPhone: null,
      notes: null,
      createdAt: new Date('2026-07-11T12:00:00.000Z'),
      updatedAt: new Date('2026-07-11T12:00:00.000Z'),
    });

    const result = await service.get(PARTY_REF_ID);

    expect(result.partyRefId).toBe(PARTY_REF_ID);
    expect(result.party?.displayName).toBe('Proveedor ACME');
  });

  it('get lanza 404 cuando no existe perfil', async () => {
    await expect(service.get(PARTY_REF_ID)).rejects.toThrow(NotFoundException);
  });

  it('update modifica solo campos comerciales', async () => {
    profiles.push({
      id: PROFILE_ID,
      tenantId: 'tenant-001',
      partyRefId: PARTY_REF_ID,
      partyRoleId: PARTY_ROLE_ID,
      supplierCode: 'PROV-000001',
      status: SupplierProfileStatus.ACTIVE,
      paymentTermsDays: 15,
      currency: 'COP',
      incoterm: null,
      defaultLeadTimeDays: null,
      purchasingContactName: null,
      purchasingContactEmail: null,
      purchasingContactPhone: null,
      notes: null,
      createdAt: new Date('2026-07-11T12:00:00.000Z'),
      updatedAt: new Date('2026-07-11T12:00:00.000Z'),
    });

    const result = await service.update(
      PARTY_REF_ID,
      {
        paymentTermsDays: 45,
        incoterm: IncotermCode.FOB,
        notes: 'Condiciones actualizadas',
      },
      actor,
    );

    expect(result.paymentTermsDays).toBe(45);
    expect(result.incoterm).toBe(IncotermCode.FOB);
    expect(result.notes).toBe('Condiciones actualizadas');
    expect(partyWritePort.ensurePartyWithRole).not.toHaveBeenCalled();
  });

  it('setStatus cambia estado de forma idempotente', async () => {
    profiles.push({
      id: PROFILE_ID,
      tenantId: 'tenant-001',
      partyRefId: PARTY_REF_ID,
      partyRoleId: PARTY_ROLE_ID,
      supplierCode: 'PROV-000001',
      status: SupplierProfileStatus.ACTIVE,
      paymentTermsDays: null,
      currency: null,
      incoterm: null,
      defaultLeadTimeDays: null,
      purchasingContactName: null,
      purchasingContactEmail: null,
      purchasingContactPhone: null,
      notes: null,
      createdAt: new Date('2026-07-11T12:00:00.000Z'),
      updatedAt: new Date('2026-07-11T12:00:00.000Z'),
    });

    const blocked = await service.setStatus(
      PARTY_REF_ID,
      { status: SupplierProfileStatus.BLOCKED },
      actor,
    );
    expect(blocked.status).toBe(SupplierProfileStatus.BLOCKED);

    const idempotent = await service.setStatus(
      PARTY_REF_ID,
      { status: SupplierProfileStatus.BLOCKED },
      actor,
    );
    expect(idempotent.status).toBe(SupplierProfileStatus.BLOCKED);
  });

  it('assertEligibleForPurchasing permite ACTIVE y party sin perfil', async () => {
    const manager = {
      findOne: jest.fn().mockResolvedValue(null),
    } as unknown as EntityManager;

    await expect(
      service.assertEligibleForPurchasing(manager, 'tenant-001', PARTY_REF_ID),
    ).resolves.toBeUndefined();

    (manager.findOne as jest.Mock).mockResolvedValue({
      status: SupplierProfileStatus.ACTIVE,
    });

    await expect(
      service.assertEligibleForPurchasing(manager, 'tenant-001', PARTY_REF_ID),
    ).resolves.toBeUndefined();
  });

  it('assertEligibleForPurchasing rechaza proveedor bloqueado o inactivo', async () => {
    const manager = {
      findOne: jest.fn().mockResolvedValue({ status: SupplierProfileStatus.BLOCKED }),
    } as unknown as EntityManager;

    await expect(
      service.assertEligibleForPurchasing(manager, 'tenant-001', PARTY_REF_ID),
    ).rejects.toThrow('bloqueado');

    (manager.findOne as jest.Mock).mockResolvedValue({ status: SupplierProfileStatus.INACTIVE });

    await expect(
      service.assertEligibleForPurchasing(manager, 'tenant-001', PARTY_REF_ID),
    ).rejects.toThrow('inactivo');
  });

  it('update lanza error de validacion si el body esta vacio (B2)', async () => {
    profiles.push({
      id: PROFILE_ID,
      tenantId: 'tenant-001',
      partyRefId: PARTY_REF_ID,
      partyRoleId: PARTY_ROLE_ID,
      supplierCode: 'PROV-000001',
      status: SupplierProfileStatus.ACTIVE,
      paymentTermsDays: null,
      currency: null,
      incoterm: null,
      defaultLeadTimeDays: null,
      purchasingContactName: null,
      purchasingContactEmail: null,
      purchasingContactPhone: null,
      notes: null,
      createdAt: new Date('2026-07-11T12:00:00.000Z'),
      updatedAt: new Date('2026-07-11T12:00:00.000Z'),
    });

    await expect(service.update(PARTY_REF_ID, {}, actor)).rejects.toThrow(
      'Debe enviar al menos un campo',
    );
  });

  it('update acepta incoterm valido del enum (B5)', async () => {
    profiles.push({
      id: PROFILE_ID,
      tenantId: 'tenant-001',
      partyRefId: PARTY_REF_ID,
      partyRoleId: PARTY_ROLE_ID,
      supplierCode: 'PROV-000001',
      status: SupplierProfileStatus.ACTIVE,
      paymentTermsDays: null,
      currency: null,
      incoterm: null,
      defaultLeadTimeDays: null,
      purchasingContactName: null,
      purchasingContactEmail: null,
      purchasingContactPhone: null,
      notes: null,
      createdAt: new Date('2026-07-11T12:00:00.000Z'),
      updatedAt: new Date('2026-07-11T12:00:00.000Z'),
    });

    const result = await service.update(PARTY_REF_ID, { incoterm: IncotermCode.FOB }, actor);

    expect(result.incoterm).toBe(IncotermCode.FOB);
  });

  it('update rechaza incoterm invalido fuera del enum (B5)', async () => {
    profiles.push({
      id: PROFILE_ID,
      tenantId: 'tenant-001',
      partyRefId: PARTY_REF_ID,
      partyRoleId: PARTY_ROLE_ID,
      supplierCode: 'PROV-000001',
      status: SupplierProfileStatus.ACTIVE,
      paymentTermsDays: null,
      currency: null,
      incoterm: null,
      defaultLeadTimeDays: null,
      purchasingContactName: null,
      purchasingContactEmail: null,
      purchasingContactPhone: null,
      notes: null,
      createdAt: new Date('2026-07-11T12:00:00.000Z'),
      updatedAt: new Date('2026-07-11T12:00:00.000Z'),
    });

    await expect(
      service.update(PARTY_REF_ID, { incoterm: 'INVALIDO' as never }, actor),
    ).rejects.toThrow();
  });
});
