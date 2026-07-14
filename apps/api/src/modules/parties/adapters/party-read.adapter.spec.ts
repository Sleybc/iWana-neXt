import { DataSource } from 'typeorm';
import { DocumentTypeParty } from '@iwana/shared';
import { Party } from '../entities/party.entity';
import { PartyContact } from '../entities/party-contact.entity';
import { PartyRole } from '../entities/party-role.entity';
import { PartyReadAdapter } from './party-read.adapter';

// Mock @iwana/db antes de importar el adaptador
jest.mock('@iwana/db', () => ({
  TenantContext: {
    getOrThrow: jest.fn().mockReturnValue({ schemaName: 'tenant_test', tenantId: 'tid-001' }),
  },
  runInTenantSchema: jest.fn(),
}));

import { TenantContext, runInTenantSchema } from '@iwana/db';

describe('PartyReadAdapter', () => {
  let adapter: PartyReadAdapter;
  let mockDataSource: jest.Mocked<DataSource>;
  let mockQr: {
    manager: {
      findOne: jest.Mock;
      find: jest.Mock;
    };
  };

  beforeEach(() => {
    mockQr = {
      manager: {
        findOne: jest.fn(),
        find: jest.fn(),
      },
    };

    (runInTenantSchema as jest.Mock).mockImplementation(
      (_ds: unknown, _schema: string, fn: (qr: typeof mockQr) => Promise<unknown>) => fn(mockQr),
    );

    mockDataSource = {} as unknown as jest.Mocked<DataSource>;
    adapter = new PartyReadAdapter(mockDataSource);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ---------------------------------------------------------------------------
  describe('getById', () => {
    const partyId = 'party-uuid-001';

    /** Factory de Party con datos ficticios — sin PII real */
    function buildParty(overrides: Partial<Party> = {}): Party {
      return Object.assign(new Party(), {
        id: partyId,
        partyType: 'NATURAL',
        documentType: DocumentTypeParty.CC,
        documentNumber: 'DOC-FICT-001',
        displayName: 'Nombre Ficticio',
        legalName: null,
        status: 'ACTIVE',
        verificationDigit: null,
        birthDate: null,
        incorporationDate: null,
        notes: null,
        address: null,
        latitude: null,
        longitude: null,
        city: null,
        department: null,
        mergedIntoPartyId: null,
        createdAt: new Date('2025-01-01'),
        updatedAt: new Date('2025-01-01'),
        deletedAt: null,
        contacts: [],
        roles: [],
        ...overrides,
      });
    }

    it('retorna snapshot cuando el party existe', async () => {
      const party = buildParty();
      mockQr.manager.findOne.mockResolvedValue(party);

      const result = await adapter.getById(partyId);

      expect(TenantContext.getOrThrow).toHaveBeenCalled();
      expect(runInTenantSchema).toHaveBeenCalled();
      expect(mockQr.manager.findOne).toHaveBeenCalledWith(Party, { where: { id: partyId } });
      expect(result).not.toBeNull();
      expect(result!.id).toBe(partyId);
      expect(result!.documentType).toBe(DocumentTypeParty.CC);
      expect(result!.status).toBe('ACTIVE');
    });

    it('retorna null cuando el party no existe', async () => {
      mockQr.manager.findOne.mockResolvedValue(null);

      const result = await adapter.getById(partyId);

      expect(result).toBeNull();
    });

    it('el snapshot no expone la entidad TypeORM directamente', async () => {
      const party = buildParty();
      mockQr.manager.findOne.mockResolvedValue(party);

      const result = await adapter.getById(partyId);

      // Snapshot no debe incluir relaciones TypeORM ni campos de entidad
      expect(result).not.toHaveProperty('contacts');
      expect(result).not.toHaveProperty('roles');
      // Debe tener solo los campos del snapshot
      const keys = Object.keys(result!);
      expect(keys).toEqual(
        expect.arrayContaining([
          'id',
          'partyType',
          'documentType',
          'documentNumber',
          'displayName',
          'status',
          'address',
          'latitude',
          'longitude',
          'city',
          'department',
        ]),
      );
    });
  });

  // ---------------------------------------------------------------------------
  describe('findByDocument', () => {
    it('retorna snapshot cuando el documento existe', async () => {
      const party = Object.assign(new Party(), {
        id: 'party-uuid-002',
        partyType: 'JURIDICAL',
        documentType: DocumentTypeParty.NIT,
        documentNumber: '9000000001',
        displayName: 'Empresa Ficticia SAS',
        legalName: 'Empresa Ficticia S.A.S.',
        status: 'ACTIVE',
        verificationDigit: '3',
        notes: null,
        mergedIntoPartyId: null,
        createdAt: new Date('2025-01-01'),
        updatedAt: new Date('2025-01-01'),
        deletedAt: null,
        contacts: [],
        roles: [],
      });
      mockQr.manager.findOne.mockResolvedValue(party);

      const result = await adapter.findByDocument(DocumentTypeParty.NIT, '9000000001');

      expect(mockQr.manager.findOne).toHaveBeenCalledWith(Party, {
        where: { documentType: DocumentTypeParty.NIT, documentNumber: '9000000001' },
      });
      expect(result).not.toBeNull();
      expect(result!.documentType).toBe(DocumentTypeParty.NIT);
    });

    it('retorna null cuando el documento no existe', async () => {
      mockQr.manager.findOne.mockResolvedValue(null);

      const result = await adapter.findByDocument(DocumentTypeParty.CC, 'INEXISTENTE');

      expect(result).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  describe('listRoles', () => {
    it('retorna lista de snapshots de roles del party', async () => {
      const roles = [
        Object.assign(new PartyRole(), {
          id: 'role-uuid-001',
          partyId: 'party-uuid-001',
          role: 'CUSTOMER',
          status: 'ACTIVE',
          validFrom: new Date('2025-01-01'),
          validTo: null,
          createdAt: new Date('2025-01-01'),
          updatedAt: new Date('2025-01-01'),
        }),
        Object.assign(new PartyRole(), {
          id: 'role-uuid-002',
          partyId: 'party-uuid-001',
          role: 'SUPPLIER',
          status: 'INACTIVE',
          validFrom: new Date('2024-01-01'),
          validTo: new Date('2025-01-01'),
          createdAt: new Date('2024-01-01'),
          updatedAt: new Date('2025-01-01'),
        }),
      ];
      mockQr.manager.find.mockResolvedValue(roles);

      const result = await adapter.listRoles('party-uuid-001');

      expect(mockQr.manager.find).toHaveBeenCalledWith(PartyRole, {
        where: { partyId: 'party-uuid-001' },
      });
      expect(result).toHaveLength(2);
      expect(result[0]!.role).toBe('CUSTOMER');
      expect(result[0]!.status).toBe('ACTIVE');
      expect(result[1]!.validTo).toBeInstanceOf(Date);
    });

    it('retorna lista vacía cuando el party no tiene roles', async () => {
      mockQr.manager.find.mockResolvedValue([]);

      const result = await adapter.listRoles('party-uuid-001');

      expect(result).toEqual([]);
    });
  });

  // ---------------------------------------------------------------------------
  describe('getByIds', () => {
    it('retorna lista de snapshots para los ids dados', async () => {
      const parties = [
        Object.assign(new Party(), {
          id: 'party-uuid-001',
          partyType: 'NATURAL',
          documentType: DocumentTypeParty.CC,
          documentNumber: 'DOC-FICT-001',
          displayName: 'Nombre Ficticio',
          legalName: null,
          status: 'ACTIVE',
          contacts: [],
          roles: [],
        }),
        Object.assign(new Party(), {
          id: 'party-uuid-002',
          partyType: 'JURIDICAL',
          documentType: DocumentTypeParty.NIT,
          documentNumber: 'NIT-FICT-001',
          displayName: 'Empresa Ficticia',
          legalName: 'Empresa Ficticia SAS',
          status: 'ACTIVE',
          contacts: [],
          roles: [],
        }),
      ];
      mockQr.manager.find.mockResolvedValue(parties);

      const result = await adapter.getByIds(['party-uuid-001', 'party-uuid-002']);

      expect(mockQr.manager.find).toHaveBeenCalledWith(
        Party,
        expect.objectContaining({ where: expect.anything() }),
      );
      expect(result).toHaveLength(2);
      expect(result[0]!.id).toBe('party-uuid-001');
      expect(result[1]!.id).toBe('party-uuid-002');
    });

    it('retorna lista vacía sin llamar a la BD cuando ids esta vacio', async () => {
      const result = await adapter.getByIds([]);

      expect(mockQr.manager.find).not.toHaveBeenCalled();
      expect(result).toEqual([]);
    });
  });

  // ---------------------------------------------------------------------------
  describe('listContactsForIds', () => {
    it('agrupa contactos por partyId en un Map', async () => {
      const contacts = [
        Object.assign(new PartyContact(), {
          id: 'contact-uuid-001',
          partyId: 'party-uuid-001',
          type: 'EMAIL',
          value: 'noreply@example.invalid',
          isPrimary: true,
          metadata: null,
        }),
        Object.assign(new PartyContact(), {
          id: 'contact-uuid-002',
          partyId: 'party-uuid-002',
          type: 'PHONE',
          value: '3000000000',
          isPrimary: true,
          metadata: null,
        }),
        Object.assign(new PartyContact(), {
          id: 'contact-uuid-003',
          partyId: 'party-uuid-001',
          type: 'PHONE',
          value: '3100000000',
          isPrimary: false,
          metadata: null,
        }),
      ];
      mockQr.manager.find.mockResolvedValue(contacts);

      const result = await adapter.listContactsForIds(['party-uuid-001', 'party-uuid-002']);

      expect(result).toBeInstanceOf(Map);
      expect(result.get('party-uuid-001')).toHaveLength(2);
      expect(result.get('party-uuid-002')).toHaveLength(1);
      expect(result.get('party-uuid-002')![0]!.type).toBe('PHONE');
    });

    it('retorna Map vacio sin llamar a la BD cuando partyIds esta vacio', async () => {
      const result = await adapter.listContactsForIds([]);

      expect(mockQr.manager.find).not.toHaveBeenCalled();
      expect(result.size).toBe(0);
    });

    it('no inserta clave en el Map cuando el party no tiene contactos', async () => {
      mockQr.manager.find.mockResolvedValue([]);

      const result = await adapter.listContactsForIds(['party-uuid-001']);

      expect(result.has('party-uuid-001')).toBe(false);
      expect(result.size).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  describe('listContacts', () => {
    it('retorna lista de snapshots de contactos del party', async () => {
      const contacts = [
        Object.assign(new PartyContact(), {
          id: 'contact-uuid-001',
          partyId: 'party-uuid-001',
          type: 'EMAIL',
          value: 'noreply@example.invalid',
          isPrimary: true,
          verifiedAt: null,
          metadata: null,
          createdAt: new Date('2025-01-01'),
          updatedAt: new Date('2025-01-01'),
        }),
        Object.assign(new PartyContact(), {
          id: 'contact-uuid-002',
          partyId: 'party-uuid-001',
          type: 'PHONE',
          value: '3000000000',
          isPrimary: false,
          verifiedAt: null,
          metadata: null,
          createdAt: new Date('2025-01-01'),
          updatedAt: new Date('2025-01-01'),
        }),
      ];
      mockQr.manager.find.mockResolvedValue(contacts);

      const result = await adapter.listContacts('party-uuid-001');

      expect(mockQr.manager.find).toHaveBeenCalledWith(PartyContact, {
        where: { partyId: 'party-uuid-001' },
      });
      expect(result).toHaveLength(2);
      expect(result[0]!.type).toBe('EMAIL');
      expect(result[0]!.isPrimary).toBe(true);
      expect(result[1]!.isPrimary).toBe(false);
    });

    it('retorna lista vacía cuando el party no tiene contactos', async () => {
      mockQr.manager.find.mockResolvedValue([]);

      const result = await adapter.listContacts('party-uuid-001');

      expect(result).toEqual([]);
    });

    it('snapshot de contacto no expone campos internos de la entidad', async () => {
      const contacts = [
        Object.assign(new PartyContact(), {
          id: 'contact-uuid-001',
          partyId: 'party-uuid-001',
          type: 'EMAIL',
          value: 'noreply@example.invalid',
          isPrimary: false,
          verifiedAt: null,
          metadata: null,
          createdAt: new Date('2025-01-01'),
          updatedAt: new Date('2025-01-01'),
        }),
      ];
      mockQr.manager.find.mockResolvedValue(contacts);

      const result = await adapter.listContacts('party-uuid-001');

      // El snapshot solo expone id, type, value, isPrimary — no el partyId ni campos de auditoría
      const keys = Object.keys(result[0]!);
      expect(keys).toEqual(expect.arrayContaining(['id', 'type', 'value', 'isPrimary']));
      expect(keys).not.toContain('partyId');
      expect(keys).not.toContain('createdAt');
    });
  });
});
