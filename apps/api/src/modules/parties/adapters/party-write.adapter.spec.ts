import { EntityManager } from 'typeorm';
import {
  DocumentTypeParty,
  PartyContactType,
  PartyRoleStatus,
  PartyRoleType,
  PartyStatus,
  PartyType,
} from '@iwana/shared';
import { Party } from '../entities/party.entity';
import { PartyContact } from '../entities/party-contact.entity';
import { PartyRole } from '../entities/party-role.entity';
import { PartyWriteAdapter } from './party-write.adapter';
import { EnsurePartyInput, PartyWriteContext } from '../ports/party-write.port';

describe('PartyWriteAdapter', () => {
  let adapter: PartyWriteAdapter;
  let mockManager: {
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  let ctx: PartyWriteContext;

  const baseInput: EnsurePartyInput = {
    partyType: PartyType.ORGANIZATION,
    documentType: DocumentTypeParty.NIT,
    documentNumber: '9000000001',
    displayName: 'Empresa Ficticia SAS',
    legalName: 'Empresa Ficticia S.A.S.',
  };

  beforeEach(() => {
    mockManager = {
      findOne: jest.fn(),
      create: jest.fn((_entity, data) => ({ id: `gen-${_entity.name}-${Date.now()}`, ...data })),
      save: jest.fn(async (_entity, data) => data),
    };

    ctx = { manager: mockManager as unknown as EntityManager, actorUserId: 'user-uuid-001' };
    adapter = new PartyWriteAdapter();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  /** Factory de Party existente — sin PII real */
  function buildExistingParty(overrides: Partial<Party> = {}): Party {
    return Object.assign(new Party(), {
      id: 'party-uuid-existing',
      partyType: PartyType.ORGANIZATION,
      documentType: DocumentTypeParty.NIT,
      documentNumber: '9000000001',
      displayName: 'Empresa Ficticia SAS',
      legalName: 'Empresa Ficticia S.A.S.',
      status: PartyStatus.ACTIVE,
      deletedAt: null,
      ...overrides,
    });
  }

  /** Factory de PartyRole existente */
  function buildExistingRole(overrides: Partial<PartyRole> = {}): PartyRole {
    return Object.assign(new PartyRole(), {
      id: 'role-uuid-existing',
      partyId: 'party-uuid-existing',
      role: PartyRoleType.SUPPLIER,
      status: PartyRoleStatus.ACTIVE,
      validFrom: new Date('2025-01-01'),
      validTo: null,
      createdBy: null,
      ...overrides,
    });
  }

  // ---------------------------------------------------------------------------
  describe('ensurePartyWithRole — crea Party nuevo + rol SUPPLIER', () => {
    it('crea party y rol cuando no existen', async () => {
      mockManager.findOne
        .mockResolvedValueOnce(null) // party no existe
        .mockResolvedValueOnce(null); // rol no existe

      mockManager.create.mockImplementation((_entity, data) => {
        if (_entity === Party) {
          return { id: 'party-uuid-new', ...data };
        }
        if (_entity === PartyRole) {
          return { id: 'role-uuid-new', ...data };
        }
        return data;
      });

      const result = await adapter.ensurePartyWithRole(baseInput, PartyRoleType.SUPPLIER, ctx);

      expect(mockManager.findOne).toHaveBeenNthCalledWith(1, Party, {
        where: {
          documentType: DocumentTypeParty.NIT,
          documentNumber: '9000000001',
          deletedAt: expect.anything(),
        },
      });
      expect(mockManager.create).toHaveBeenCalledWith(
        Party,
        expect.objectContaining({
          partyType: PartyType.ORGANIZATION,
          documentType: DocumentTypeParty.NIT,
          displayName: 'Empresa Ficticia SAS',
          status: PartyStatus.ACTIVE,
        }),
      );
      expect(mockManager.create).toHaveBeenCalledWith(
        PartyRole,
        expect.objectContaining({
          partyId: 'party-uuid-new',
          role: PartyRoleType.SUPPLIER,
          status: PartyRoleStatus.ACTIVE,
          createdBy: 'user-uuid-001',
        }),
      );
      expect(result).toEqual({
        partyId: 'party-uuid-new',
        partyRoleId: 'role-uuid-new',
        partyCreated: true,
        roleAdded: true,
      });
    });

    it('crea contactos opcionales al dar de alta un party nuevo', async () => {
      mockManager.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce(null);

      mockManager.create.mockImplementation((_entity, data) => {
        if (_entity === Party) return { id: 'party-uuid-new', ...data };
        if (_entity === PartyContact) return { id: 'contact-uuid-001', ...data };
        if (_entity === PartyRole) return { id: 'role-uuid-new', ...data };
        return data;
      });

      const inputWithContacts: EnsurePartyInput = {
        ...baseInput,
        contacts: [
          {
            type: PartyContactType.EMAIL,
            value: 'noreply@example.invalid',
            isPrimary: true,
          },
        ],
      };

      await adapter.ensurePartyWithRole(inputWithContacts, PartyRoleType.SUPPLIER, ctx);

      expect(mockManager.create).toHaveBeenCalledWith(
        PartyContact,
        expect.objectContaining({
          partyId: 'party-uuid-new',
          type: PartyContactType.EMAIL,
          value: 'noreply@example.invalid',
          isPrimary: true,
        }),
      );
      expect(mockManager.save).toHaveBeenCalledWith(PartyContact, expect.any(Object));
    });
  });

  // ---------------------------------------------------------------------------
  describe('ensurePartyWithRole — reutiliza Party existente', () => {
    it('reutiliza party por documento sin crear uno nuevo', async () => {
      const existingParty = buildExistingParty();
      mockManager.findOne.mockResolvedValueOnce(existingParty).mockResolvedValueOnce(null);

      mockManager.create.mockImplementation((_entity, data) => {
        if (_entity === PartyRole) return { id: 'role-uuid-new', ...data };
        return data;
      });

      const result = await adapter.ensurePartyWithRole(baseInput, PartyRoleType.SUPPLIER, ctx);

      expect(mockManager.create).not.toHaveBeenCalledWith(Party, expect.anything());
      expect(result.partyId).toBe('party-uuid-existing');
      expect(result.partyCreated).toBe(false);
      expect(result.roleAdded).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  describe('ensurePartyWithRole — agrega rol si falta', () => {
    it('asigna rol SUPPLIER cuando el party existe pero no tiene ese rol', async () => {
      const existingParty = buildExistingParty();
      mockManager.findOne.mockResolvedValueOnce(existingParty).mockResolvedValueOnce(null);

      mockManager.create.mockImplementation((_entity, data) => {
        if (_entity === PartyRole) return { id: 'role-uuid-new', ...data };
        return data;
      });

      const result = await adapter.ensurePartyWithRole(baseInput, PartyRoleType.SUPPLIER, ctx);

      expect(mockManager.save).toHaveBeenCalledWith(
        PartyRole,
        expect.objectContaining({
          partyId: 'party-uuid-existing',
          role: PartyRoleType.SUPPLIER,
          status: PartyRoleStatus.ACTIVE,
        }),
      );
      expect(result.roleAdded).toBe(true);
      expect(result.partyRoleId).toBe('role-uuid-new');
    });
  });

  // ---------------------------------------------------------------------------
  describe('ensurePartyWithRole — idempotente si rol ya ACTIVE', () => {
    it('no modifica el rol cuando ya está activo', async () => {
      const existingParty = buildExistingParty();
      const activeRole = buildExistingRole({ status: PartyRoleStatus.ACTIVE });

      mockManager.findOne.mockResolvedValueOnce(existingParty).mockResolvedValueOnce(activeRole);

      const result = await adapter.ensurePartyWithRole(baseInput, PartyRoleType.SUPPLIER, ctx);

      expect(mockManager.save).not.toHaveBeenCalledWith(PartyRole, expect.anything());
      expect(result).toEqual({
        partyId: 'party-uuid-existing',
        partyRoleId: 'role-uuid-existing',
        partyCreated: false,
        roleAdded: false,
      });
    });
  });

  // ---------------------------------------------------------------------------
  describe('ensurePartyWithRole — reactiva rol INACTIVE', () => {
    it('reactiva rol inactivo y marca roleAdded=true', async () => {
      const existingParty = buildExistingParty();
      const inactiveRole = buildExistingRole({
        status: PartyRoleStatus.INACTIVE,
        validTo: new Date('2025-06-01'),
      });

      mockManager.findOne.mockResolvedValueOnce(existingParty).mockResolvedValueOnce(inactiveRole);

      const result = await adapter.ensurePartyWithRole(baseInput, PartyRoleType.SUPPLIER, ctx);

      expect(mockManager.save).toHaveBeenCalledWith(
        PartyRole,
        expect.objectContaining({
          id: 'role-uuid-existing',
          status: PartyRoleStatus.ACTIVE,
          validTo: null,
        }),
      );
      expect(result.roleAdded).toBe(true);
      expect(result.partyRoleId).toBe('role-uuid-existing');
    });
  });

  // ---------------------------------------------------------------------------
  describe('ensurePartyWithRole — rollback en transacción del llamante', () => {
    it('propaga el error si falla después de crear el party — sin residuo en transacción', async () => {
      const savedEntities: unknown[] = [];
      let saveCallCount = 0;

      mockManager.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce(null);

      mockManager.create.mockImplementation((_entity, data) => {
        if (_entity === Party) return { id: 'party-uuid-tx', ...data };
        if (_entity === PartyRole) return { id: 'role-uuid-tx', ...data };
        return data;
      });

      mockManager.save.mockImplementation(async (_entity, data) => {
        saveCallCount += 1;
        if (saveCallCount === 2) {
          // Simula fallo al persistir el rol — la transacción del llamante debe revertir
          throw new Error('Simulated DB constraint failure');
        }
        savedEntities.push(data);
        return data;
      });

      await expect(
        adapter.ensurePartyWithRole(baseInput, PartyRoleType.SUPPLIER, ctx),
      ).rejects.toThrow('Simulated DB constraint failure');

      // El party se intentó guardar pero el error impide commit — el llamante hace rollback
      expect(savedEntities).toHaveLength(1);
      expect(savedEntities[0]).toEqual(expect.objectContaining({ id: 'party-uuid-tx' }));
    });
  });

  // ---------------------------------------------------------------------------
  describe('ensurePartyWithRole — multi-tenant via manager del llamante', () => {
    it('opera solo sobre ctx.manager sin invocar runInTenantSchema', async () => {
      jest.mock('@iwana/db', () => ({
        TenantContext: { getOrThrow: jest.fn() },
        runInTenantSchema: jest.fn(),
      }));

      const tenantManager = {
        findOne: jest.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(null),
        create: jest.fn((_entity, data) => {
          if (_entity === Party) return { id: 'party-tenant-a', ...data };
          if (_entity === PartyRole) return { id: 'role-tenant-a', ...data };
          return data;
        }),
        save: jest.fn(async (_entity, data) => data),
        // El manager ya está vinculado al schema del tenant por el llamante
        connection: { options: { schema: 'tenant_a' } },
      };

      const tenantCtx: PartyWriteContext = {
        manager: tenantManager as unknown as EntityManager,
      };

      const result = await adapter.ensurePartyWithRole(
        baseInput,
        PartyRoleType.SUPPLIER,
        tenantCtx,
      );

      expect(tenantManager.findOne).toHaveBeenCalled();
      expect(tenantManager.save).toHaveBeenCalled();
      expect(result.partyId).toBe('party-tenant-a');
      // No hay dependencia de DataSource ni TenantContext en el adapter
      expect(adapter).not.toHaveProperty('dataSource');
    });
  });
});
