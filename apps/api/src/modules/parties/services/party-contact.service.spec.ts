import { Logger, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { PartyContactType } from '@iwana/shared';
import { PartyContactService } from './party-contact.service';
import { PartyContact } from '../entities/party-contact.entity';
import { UpsertContactDto } from '../dto/upsert-contact.dto';

// Mock TenantContext y runInTenantSchema antes de importar el servicio
jest.mock('@iwana/db', () => ({
  TenantContext: {
    getOrThrow: jest.fn().mockReturnValue({ schemaName: 'tenant_test', tenantId: 'tid-001' }),
  },
  runInTenantSchema: jest.fn(),
}));

import { TenantContext, runInTenantSchema } from '@iwana/db';

describe('PartyContactService', () => {
  let service: PartyContactService;
  let mockDataSource: jest.Mocked<DataSource>;
  let mockQr: any;

  beforeEach(() => {
    mockQr = {
      manager: {
        findOne: jest.fn(),
        find: jest.fn(),
        create: jest.fn(),
        save: jest.fn(),
        update: jest.fn(),
        remove: jest.fn(),
      },
    };

    (runInTenantSchema as jest.Mock).mockImplementation(
      (_ds: unknown, _schema: string, fn: (qr: typeof mockQr) => Promise<unknown>) => fn(mockQr),
    );

    mockDataSource = {
      createQueryRunner: jest.fn().mockReturnValue(mockQr),
    } as unknown as jest.Mocked<DataSource>;

    service = new PartyContactService(mockDataSource);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  /** Factory para PartyContact con datos ficticios — sin PII real. */
  function buildContact(overrides: Partial<PartyContact> = {}): PartyContact {
    return Object.assign(new PartyContact(), {
      id: 'contact-uuid-001',
      partyId: 'party-uuid-001',
      type: PartyContactType.EMAIL,
      value: 'test@example.invalid', // dominio .invalid — no es PII real
      isPrimary: false,
      verifiedAt: null,
      metadata: null,
      createdAt: new Date('2025-01-01'),
      updatedAt: new Date('2025-01-01'),
      ...overrides,
    });
  }

  // ---------------------------------------------------------------------------
  describe('upsert', () => {
    const partyId = 'party-uuid-001';
    const dtoEmail: UpsertContactDto = {
      type: PartyContactType.EMAIL,
      value: 'nuevo@example.invalid',
      isPrimary: false,
    };

    it('crea contacto nuevo cuando no existe previo del mismo tipo', async () => {
      const newContact = buildContact({ value: 'nuevo@example.invalid' });
      mockQr.manager.update.mockResolvedValue(undefined);
      mockQr.manager.findOne.mockResolvedValue(null); // No existe previo
      mockQr.manager.create.mockReturnValue(newContact);
      mockQr.manager.save.mockResolvedValue(newContact);

      const result = await service.upsert(partyId, dtoEmail);

      expect(TenantContext.getOrThrow).toHaveBeenCalled();
      expect(runInTenantSchema).toHaveBeenCalled();
      expect(mockQr.manager.findOne).toHaveBeenCalledWith(PartyContact, {
        where: { partyId, type: PartyContactType.EMAIL },
      });
      expect(mockQr.manager.create).toHaveBeenCalledWith(
        PartyContact,
        expect.objectContaining({
          partyId,
          type: PartyContactType.EMAIL,
          value: 'nuevo@example.invalid',
          isPrimary: false,
        }),
      );
      expect(mockQr.manager.save).toHaveBeenCalledWith(PartyContact, newContact);
      expect(result).toEqual(newContact);
    });

    it('actualiza contacto existente del mismo tipo (upsert real)', async () => {
      const existing = buildContact({ value: 'viejo@example.invalid' });
      mockQr.manager.update.mockResolvedValue(undefined);
      mockQr.manager.findOne.mockResolvedValue(existing);
      mockQr.manager.save.mockResolvedValue({ ...existing, value: 'nuevo@example.invalid' });

      const result = await service.upsert(partyId, dtoEmail);

      expect(mockQr.manager.create).not.toHaveBeenCalled();
      expect(mockQr.manager.save).toHaveBeenCalledWith(PartyContact, existing);
      expect(existing.value).toBe('nuevo@example.invalid');
      expect(result.value).toBe('nuevo@example.invalid');
    });

    it('limpia isPrimary previo del mismo tipo cuando isPrimary=true', async () => {
      const newContact = buildContact({ isPrimary: true });
      mockQr.manager.update.mockResolvedValue(undefined);
      mockQr.manager.findOne.mockResolvedValue(null);
      mockQr.manager.create.mockReturnValue(newContact);
      mockQr.manager.save.mockResolvedValue(newContact);

      const dtoPrimary: UpsertContactDto = {
        type: PartyContactType.PHONE,
        value: '3001234567',
        isPrimary: true,
      };

      await service.upsert(partyId, dtoPrimary);

      // Debe limpiar isPrimary previo antes del upsert
      expect(mockQr.manager.update).toHaveBeenCalledWith(
        PartyContact,
        { partyId, type: PartyContactType.PHONE, isPrimary: true },
        { isPrimary: false },
      );
    });

    it('NO llama update cuando isPrimary=false', async () => {
      const newContact = buildContact();
      mockQr.manager.findOne.mockResolvedValue(null);
      mockQr.manager.create.mockReturnValue(newContact);
      mockQr.manager.save.mockResolvedValue(newContact);

      await service.upsert(partyId, dtoEmail); // isPrimary: false

      expect(mockQr.manager.update).not.toHaveBeenCalled();
    });

    it('actualiza metadata cuando se proporciona', async () => {
      const existing = buildContact({ metadata: null });
      mockQr.manager.update.mockResolvedValue(undefined);
      mockQr.manager.findOne.mockResolvedValue(existing);
      mockQr.manager.save.mockResolvedValue(existing);

      const dtoWithMeta: UpsertContactDto = {
        type: PartyContactType.EMAIL,
        value: 'test@example.invalid',
        isPrimary: false,
        metadata: { verified: false },
      };

      await service.upsert(partyId, dtoWithMeta);

      expect(existing.metadata).toEqual({ verified: false });
    });
  });

  // ---------------------------------------------------------------------------
  describe('list', () => {
    it('retorna lista de contactos del party', async () => {
      const contacts = [
        buildContact({ type: PartyContactType.EMAIL }),
        buildContact({ id: 'contact-uuid-002', type: PartyContactType.PHONE }),
      ];
      mockQr.manager.find.mockResolvedValue(contacts);

      const result = await service.list('party-uuid-001');

      expect(TenantContext.getOrThrow).toHaveBeenCalled();
      expect(runInTenantSchema).toHaveBeenCalled();
      expect(mockQr.manager.find).toHaveBeenCalledWith(PartyContact, {
        where: { partyId: 'party-uuid-001' },
      });
      expect(result).toHaveLength(2);
    });

    it('retorna lista vacía cuando no hay contactos', async () => {
      mockQr.manager.find.mockResolvedValue([]);

      const result = await service.list('party-uuid-001');

      expect(result).toEqual([]);
    });
  });

  // ---------------------------------------------------------------------------
  describe('delete', () => {
    it('elimina contacto existente (hard delete)', async () => {
      const contact = buildContact();
      mockQr.manager.findOne.mockResolvedValue(contact);
      mockQr.manager.remove.mockResolvedValue(undefined);

      await service.delete('party-uuid-001', 'contact-uuid-001');

      expect(TenantContext.getOrThrow).toHaveBeenCalled();
      expect(mockQr.manager.findOne).toHaveBeenCalledWith(PartyContact, {
        where: { id: 'contact-uuid-001', partyId: 'party-uuid-001' },
      });
      expect(mockQr.manager.remove).toHaveBeenCalledWith(PartyContact, contact);
    });

    it('lanza NotFoundException si el contacto no existe para ese party', async () => {
      mockQr.manager.findOne.mockResolvedValue(null);

      await expect(service.delete('party-uuid-001', 'nonexistent-contact')).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.delete('party-uuid-001', 'nonexistent-contact')).rejects.toThrow(
        'nonexistent-contact',
      );

      expect(mockQr.manager.remove).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // D2 — Guardia PII: verificar que contact.value no aparece en logs
  // ---------------------------------------------------------------------------
  describe('PII — value de contacto no aparece en logs', () => {
    it('logger.log en upsert (creación) NO incluye el value del contacto', async () => {
      const logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);

      const newContact = buildContact({ value: 'VALOR-SECRETO-PII@example.invalid' });
      mockQr.manager.update.mockResolvedValue(undefined);
      mockQr.manager.findOne.mockResolvedValue(null);
      mockQr.manager.create.mockReturnValue(newContact);
      mockQr.manager.save.mockResolvedValue(newContact);

      await service.upsert('party-uuid-001', {
        type: PartyContactType.EMAIL,
        value: 'VALOR-SECRETO-PII@example.invalid',
        isPrimary: false,
      });

      const logCalls = logSpy.mock.calls.map((args) => args.join(' '));
      for (const call of logCalls) {
        expect(call).not.toContain('VALOR-SECRETO-PII');
      }

      logSpy.mockRestore();
    });

    it('logger.log en upsert (actualización) NO incluye el value del contacto', async () => {
      const logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);

      const existing = buildContact({ value: 'VALOR-VIEJO-PII@example.invalid' });
      mockQr.manager.update.mockResolvedValue(undefined);
      mockQr.manager.findOne.mockResolvedValue(existing);
      mockQr.manager.save.mockResolvedValue(existing);

      await service.upsert('party-uuid-001', {
        type: PartyContactType.EMAIL,
        value: 'VALOR-NUEVO-PII@example.invalid',
        isPrimary: false,
      });

      const logCalls = logSpy.mock.calls.map((args) => args.join(' '));
      for (const call of logCalls) {
        expect(call).not.toContain('VALOR-NUEVO-PII');
        expect(call).not.toContain('VALOR-VIEJO-PII');
      }

      logSpy.mockRestore();
    });
  });
});
