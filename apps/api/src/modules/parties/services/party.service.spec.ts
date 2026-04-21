import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { DataSource, IsNull } from 'typeorm';
import {
  PartyType,
  DocumentTypeParty,
  PartyStatus,
  PartyRoleStatus,
  PartyRoleType,
} from '@iwana/shared';
import { PartyService } from './party.service';
import { Party } from '../entities/party.entity';
import { PartyRole } from '../entities/party-role.entity';
import { CreatePartyDto } from '../dto/create-party.dto';
import { UpdatePartyDto } from '../dto/update-party.dto';
import { ListPartiesDto } from '../dto/list-parties.dto';

// Mock TenantContext y runInTenantSchema antes de importar el servicio
jest.mock('@iwana/db', () => ({
  TenantContext: {
    getOrThrow: jest.fn().mockReturnValue({ schemaName: 'tenant_test', tenantId: 'tid-001' }),
  },
  runInTenantSchema: jest.fn(),
}));

import { TenantContext, runInTenantSchema } from '@iwana/db';

describe('PartyService', () => {
  let service: PartyService;
  let mockDataSource: jest.Mocked<DataSource>;
  let mockQr: any;
  let mockQb: any;

  beforeEach(() => {
    // Mock del QueryBuilder para findAll
    mockQb = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      innerJoin: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
    };

    mockQr = {
      manager: {
        findOne: jest.fn(),
        create: jest.fn(),
        save: jest.fn(),
        count: jest.fn(),
        createQueryBuilder: jest.fn().mockReturnValue(mockQb),
      },
    };

    (runInTenantSchema as jest.Mock).mockImplementation(
      (_ds: unknown, _schema: string, fn: (qr: typeof mockQr) => Promise<unknown>) => fn(mockQr),
    );

    mockDataSource = {
      createQueryRunner: jest.fn().mockReturnValue(mockQr),
    } as unknown as jest.Mocked<DataSource>;

    service = new PartyService(mockDataSource);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  /**
   * Factory para Party — usa datos ficticios, sin PII real.
   */
  function buildParty(overrides: Partial<Party> = {}): Party {
    return Object.assign(new Party(), {
      id: 'party-uuid-001',
      partyType: PartyType.NATURAL,
      documentType: DocumentTypeParty.CC,
      documentNumber: '10000001',
      verificationDigit: null,
      displayName: 'Nombre Ficticio',
      legalName: null,
      birthDate: null,
      incorporationDate: null,
      status: PartyStatus.ACTIVE,
      mergedIntoPartyId: null,
      mergedIntoParty: null,
      notes: null,
      createdAt: new Date('2025-01-01'),
      updatedAt: new Date('2025-01-01'),
      deletedAt: null,
      contacts: [],
      roles: [],
      ...overrides,
    });
  }

  // ---------------------------------------------------------------------------
  describe('create', () => {
    const validDto: CreatePartyDto = {
      partyType: PartyType.NATURAL,
      documentType: DocumentTypeParty.CC,
      documentNumber: '10000001',
      displayName: 'Nombre Ficticio',
    };

    it('crea party con datos válidos y retorna la entidad', async () => {
      const expected = buildParty();
      mockQr.manager.findOne.mockResolvedValue(null);
      mockQr.manager.create.mockReturnValue(expected);
      mockQr.manager.save.mockResolvedValue(expected);

      const result = await service.create(validDto);

      expect(TenantContext.getOrThrow).toHaveBeenCalled();
      expect(runInTenantSchema).toHaveBeenCalled();
      expect(mockQr.manager.findOne).toHaveBeenCalledWith(
        Party,
        expect.objectContaining({
          where: expect.objectContaining({
            documentType: DocumentTypeParty.CC,
            documentNumber: '10000001',
          }),
        }),
      );
      expect(mockQr.manager.create).toHaveBeenCalledWith(
        Party,
        expect.objectContaining({
          partyType: PartyType.NATURAL,
          documentType: DocumentTypeParty.CC,
          status: PartyStatus.ACTIVE,
        }),
      );
      expect(mockQr.manager.save).toHaveBeenCalledWith(Party, expected);
      expect(result).toEqual(expected);
    });

    it('lanza ConflictException si ya existe party activo con mismo documento', async () => {
      const existing = buildParty();
      mockQr.manager.findOne.mockResolvedValue(existing);

      await expect(service.create(validDto)).rejects.toThrow(ConflictException);
      await expect(service.create(validDto)).rejects.toThrow('CC');

      expect(mockQr.manager.create).not.toHaveBeenCalled();
      expect(mockQr.manager.save).not.toHaveBeenCalled();
    });

    it('crea party de tipo ORGANIZATION con NIT y dígito de verificación', async () => {
      const orgDto: CreatePartyDto = {
        partyType: PartyType.ORGANIZATION,
        documentType: DocumentTypeParty.NIT,
        documentNumber: '900000001',
        verificationDigit: '9',
        displayName: 'Empresa Ficticia SAS',
        legalName: 'Empresa Ficticia S.A.S.',
      };

      const expected = buildParty({
        partyType: PartyType.ORGANIZATION,
        documentType: DocumentTypeParty.NIT,
        documentNumber: '900000001',
        verificationDigit: '9',
        displayName: 'Empresa Ficticia SAS',
        legalName: 'Empresa Ficticia S.A.S.',
      });

      mockQr.manager.findOne.mockResolvedValue(null);
      mockQr.manager.create.mockReturnValue(expected);
      mockQr.manager.save.mockResolvedValue(expected);

      const result = await service.create(orgDto);

      expect(mockQr.manager.create).toHaveBeenCalledWith(
        Party,
        expect.objectContaining({
          partyType: PartyType.ORGANIZATION,
          verificationDigit: '9',
          legalName: 'Empresa Ficticia S.A.S.',
        }),
      );
      expect(result.partyType).toBe(PartyType.ORGANIZATION);
    });

    it('crea party con birthDate e incorporationDate (cubre ramas de Date)', async () => {
      const dtoWithDates: CreatePartyDto = {
        partyType: PartyType.NATURAL,
        documentType: DocumentTypeParty.CC,
        documentNumber: '10000099',
        displayName: 'Persona con Fechas',
        birthDate: '2000-01-01T00:00:00.000Z',
        notes: 'Notas de prueba',
      };

      const expected = buildParty({
        documentNumber: '10000099',
        birthDate: new Date('2000-01-01T00:00:00.000Z'),
        notes: 'Notas de prueba',
      });

      mockQr.manager.findOne.mockResolvedValue(null);
      mockQr.manager.create.mockReturnValue(expected);
      mockQr.manager.save.mockResolvedValue(expected);

      const result = await service.create(dtoWithDates);

      expect(mockQr.manager.create).toHaveBeenCalledWith(
        Party,
        expect.objectContaining({ notes: 'Notas de prueba' }),
      );
      expect(result).toEqual(expected);
    });
  });

  // ---------------------------------------------------------------------------
  describe('findAll', () => {
    it('retorna paginado con items y total cuando hay resultados', async () => {
      const parties = [buildParty(), buildParty({ id: 'party-uuid-002' })];
      mockQb.getManyAndCount.mockResolvedValue([parties, 2]);

      const dto: ListPartiesDto = { page: 1, limit: 20 };
      const result = await service.findAll(dto);

      expect(TenantContext.getOrThrow).toHaveBeenCalled();
      expect(runInTenantSchema).toHaveBeenCalled();
      expect(mockQr.manager.createQueryBuilder).toHaveBeenCalledWith(Party, 'p');
      expect(mockQb.where).toHaveBeenCalledWith('p.deleted_at IS NULL');
      expect(mockQb.skip).toHaveBeenCalledWith(0);
      expect(mockQb.take).toHaveBeenCalledWith(20);
      expect(result.data).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
    });

    it('retorna lista vacía cuando no hay parties', async () => {
      mockQb.getManyAndCount.mockResolvedValue([[], 0]);

      const dto: ListPartiesDto = {};
      const result = await service.findAll(dto);

      expect(result.data).toEqual([]);
      expect(result.total).toBe(0);
    });

    it('aplica filtro de status cuando se proporciona', async () => {
      mockQb.getManyAndCount.mockResolvedValue([[], 0]);

      const dto: ListPartiesDto = { status: PartyStatus.ACTIVE };
      await service.findAll(dto);

      expect(mockQb.andWhere).toHaveBeenCalledWith('p.status = :status', {
        status: PartyStatus.ACTIVE,
      });
    });

    it('aplica filtro de documentType cuando se proporciona', async () => {
      mockQb.getManyAndCount.mockResolvedValue([[], 0]);

      const dto: ListPartiesDto = { documentType: DocumentTypeParty.NIT };
      await service.findAll(dto);

      expect(mockQb.andWhere).toHaveBeenCalledWith('p.document_type = :docType', {
        docType: DocumentTypeParty.NIT,
      });
    });

    it('aplica filtro de búsqueda por displayName cuando se proporciona', async () => {
      mockQb.getManyAndCount.mockResolvedValue([[], 0]);

      const dto: ListPartiesDto = { search: 'ficticio' };
      await service.findAll(dto);

      expect(mockQb.andWhere).toHaveBeenCalledWith('p.display_name ILIKE :search', {
        search: '%ficticio%',
      });
    });

    it('aplica innerJoin de party_role cuando se filtra por rol', async () => {
      mockQb.getManyAndCount.mockResolvedValue([[], 0]);

      const dto: ListPartiesDto = { role: PartyRoleType.CUSTOMER };
      await service.findAll(dto);

      expect(mockQb.innerJoin).toHaveBeenCalledWith(
        'party_role',
        'pr',
        expect.stringContaining('party_id'),
        expect.objectContaining({ role: PartyRoleType.CUSTOMER }),
      );
    });

    it('calcula skip correctamente para página 2', async () => {
      mockQb.getManyAndCount.mockResolvedValue([[], 0]);

      const dto: ListPartiesDto = { page: 2, limit: 10 };
      await service.findAll(dto);

      expect(mockQb.skip).toHaveBeenCalledWith(10);
      expect(mockQb.take).toHaveBeenCalledWith(10);
    });
  });

  // ---------------------------------------------------------------------------
  describe('findOne', () => {
    it('retorna party cuando existe', async () => {
      const party = buildParty({ contacts: [], roles: [] });
      mockQr.manager.findOne.mockResolvedValue(party);

      const result = await service.findOne('party-uuid-001');

      expect(TenantContext.getOrThrow).toHaveBeenCalled();
      expect(mockQr.manager.findOne).toHaveBeenCalledWith(Party, {
        where: { id: 'party-uuid-001', deletedAt: IsNull() },
        relations: ['contacts', 'roles'],
      });
      expect(result).toEqual(party);
    });

    it('lanza NotFoundException cuando no existe el party', async () => {
      mockQr.manager.findOne.mockResolvedValue(null);

      await expect(service.findOne('nonexistent-id')).rejects.toThrow(NotFoundException);
      await expect(service.findOne('nonexistent-id')).rejects.toThrow('nonexistent-id');
    });
  });

  // ---------------------------------------------------------------------------
  describe('update', () => {
    const updateDto: UpdatePartyDto = { displayName: 'Nombre Actualizado' };

    it('actualiza party existente sin roles activos', async () => {
      const party = buildParty();
      const updated = buildParty({ displayName: 'Nombre Actualizado' });

      mockQr.manager.findOne.mockResolvedValue(party);
      mockQr.manager.count.mockResolvedValue(0);
      mockQr.manager.save.mockResolvedValue(updated);

      const result = await service.update('party-uuid-001', updateDto);

      expect(TenantContext.getOrThrow).toHaveBeenCalled();
      expect(mockQr.manager.findOne).toHaveBeenCalledWith(Party, {
        where: { id: 'party-uuid-001', deletedAt: IsNull() },
      });
      expect(mockQr.manager.save).toHaveBeenCalledWith(Party, expect.any(Object));
      expect(result).toEqual(updated);
    });

    it('lanza NotFoundException si el party no existe', async () => {
      mockQr.manager.findOne.mockResolvedValue(null);

      await expect(service.update('nonexistent-id', updateDto)).rejects.toThrow(NotFoundException);
      await expect(service.update('nonexistent-id', updateDto)).rejects.toThrow('nonexistent-id');

      expect(mockQr.manager.save).not.toHaveBeenCalled();
    });

    it('lanza ForbiddenException al cambiar documento con roles activos', async () => {
      const party = buildParty();
      mockQr.manager.findOne.mockResolvedValue(party);
      mockQr.manager.count.mockResolvedValue(1); // Tiene roles activos

      const dtoWithDocument: UpdatePartyDto = { documentNumber: '20000002' };

      await expect(service.update('party-uuid-001', dtoWithDocument)).rejects.toThrow(
        ForbiddenException,
      );
      await expect(service.update('party-uuid-001', dtoWithDocument)).rejects.toThrow('documento');

      expect(mockQr.manager.save).not.toHaveBeenCalled();
    });

    it('permite actualizar displayName aunque haya roles activos', async () => {
      const party = buildParty();
      mockQr.manager.findOne.mockResolvedValue(party);
      mockQr.manager.count.mockResolvedValue(2); // Tiene roles activos
      mockQr.manager.save.mockResolvedValue(party);

      // Solo actualiza displayName, no documento
      const result = await service.update('party-uuid-001', { displayName: 'Nuevo Nombre' });

      expect(mockQr.manager.save).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('verifica count de roles con el parámetro correcto', async () => {
      const party = buildParty();
      mockQr.manager.findOne.mockResolvedValue(party);
      mockQr.manager.count.mockResolvedValue(0);
      mockQr.manager.save.mockResolvedValue(party);

      await service.update('party-uuid-001', updateDto);

      expect(mockQr.manager.count).toHaveBeenCalledWith(
        PartyRole,
        expect.objectContaining({
          where: { partyId: 'party-uuid-001', status: PartyRoleStatus.ACTIVE },
        }),
      );
    });

    it('actualiza birthDate, incorporationDate, legalName, notes y verificationDigit', async () => {
      const party = buildParty();
      mockQr.manager.findOne.mockResolvedValue(party);
      mockQr.manager.count.mockResolvedValue(0);
      mockQr.manager.save.mockResolvedValue(party);

      // Cubre ramas: birthDate !== undefined (true) + ternario truthy,
      // incorporationDate !== undefined (true) + ternario truthy
      const dtoFull: UpdatePartyDto = {
        birthDate: '2000-06-15T00:00:00.000Z',
        incorporationDate: '2010-03-01T00:00:00.000Z',
        legalName: 'Razón Social Ficticia',
        notes: 'Notas actualizadas',
        verificationDigit: '5',
      };

      await service.update('party-uuid-001', dtoFull);

      expect(mockQr.manager.save).toHaveBeenCalledWith(Party, expect.any(Object));
      expect(party.legalName).toBe('Razón Social Ficticia');
      expect(party.notes).toBe('Notas actualizadas');
      expect(party.verificationDigit).toBe('5');
    });

    it('actualiza documento cuando no hay roles activos', async () => {
      const party = buildParty();
      mockQr.manager.findOne.mockResolvedValue(party);
      mockQr.manager.count.mockResolvedValue(0);
      mockQr.manager.save.mockResolvedValue(party);

      const dtoDoc: UpdatePartyDto = {
        documentType: DocumentTypeParty.CE,
        documentNumber: '20000099',
      };

      await service.update('party-uuid-001', dtoDoc);

      expect(mockQr.manager.save).toHaveBeenCalled();
      expect(party.documentType).toBe(DocumentTypeParty.CE);
      expect(party.documentNumber).toBe('20000099');
    });
  });

  // ---------------------------------------------------------------------------
  describe('softDelete', () => {
    it('soft-delete exitoso: marca deletedAt e inactiva el party', async () => {
      const party = buildParty();
      mockQr.manager.findOne.mockResolvedValue(party);
      mockQr.manager.save.mockResolvedValue(undefined);

      await service.softDelete('party-uuid-001');

      expect(TenantContext.getOrThrow).toHaveBeenCalled();
      expect(mockQr.manager.findOne).toHaveBeenCalledWith(Party, {
        where: { id: 'party-uuid-001', deletedAt: IsNull() },
      });
      expect(party.status).toBe(PartyStatus.INACTIVE);
      expect(party.deletedAt).toBeInstanceOf(Date);
      expect(mockQr.manager.save).toHaveBeenCalledWith(Party, party);
    });

    it('lanza NotFoundException si el party no existe', async () => {
      mockQr.manager.findOne.mockResolvedValue(null);

      await expect(service.softDelete('nonexistent-id')).rejects.toThrow(NotFoundException);
      await expect(service.softDelete('nonexistent-id')).rejects.toThrow('nonexistent-id');

      expect(mockQr.manager.save).not.toHaveBeenCalled();
    });
  });
});
