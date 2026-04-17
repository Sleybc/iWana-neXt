import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PersonType, CustomerSegment, SubscriberStatus, ExpedienteStatus } from '@iwana/shared';
import { SubscriberCreationService } from '../subscriber-creation.service';
import { SubscribersService } from '../subscribers.service';
import { AuditService } from '../../../audit/audit.service';

// Mocks para multi-tenant
const mockRunInTenantSchema = jest.fn();
const mockTenantContextGetOrThrow = jest.fn();

jest.mock('@iwana/db', () => {
  const actual = jest.requireActual('@iwana/db') as Record<string, unknown>;
  return {
    ...actual,
    runInTenantSchema: (...args: Parameters<typeof mockRunInTenantSchema>) =>
      mockRunInTenantSchema(...args),
    TenantContext: {
      getOrThrow: () => mockTenantContextGetOrThrow(),
    },
  };
});

/**
 * Tests unitarios del SubscriberCreationService.
 * Valida la creación automática de Subscriber a partir de Expediente CLIENTE_ACTIVO.
 */
describe('SubscriberCreationService', () => {
  let service: SubscriberCreationService;
  let subscribersServiceMock: {
    createFromExpediente: jest.Mock;
    findByExpedienteId: jest.Mock;
  };

  // Clave de cifrado de prueba (32 bytes hex = 256 bits)
  const TEST_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

  // Expediente de prueba — persona natural
  const mockExpedienteNatural = {
    id: 'exp-001',
    tenantId: 'tenant-001',
    status: ExpedienteStatus.CLIENTE_ACTIVO,
    personType: 'PERSONA_NATURAL',
    firstName: 'Juan',
    lastName: 'Pérez',
    documentType: 'CC',
    documentNumberEncrypted: null,
    stratum: 2,
    companyName: null,
    fiscalDocument: null,
    emailPrimaryEncrypted: null,
    emailSecondary: 'juan@example.com',
    phonePrimaryEncrypted: null,
    phoneSecondaryEncrypted: null,
    address: 'Calle 1 #2-3',
    municipality: 'Bogotá',
    department: 'Cundinamarca',
    neighborhood: 'Centro',
    latitude: 4.711,
    longitude: -74.0721,
  };

  // Expediente de prueba — persona jurídica
  const mockExpedienteJuridica = {
    id: 'exp-002',
    tenantId: 'tenant-001',
    status: ExpedienteStatus.CLIENTE_ACTIVO,
    personType: 'PERSONA_JURIDICA',
    firstName: null,
    lastName: null,
    documentType: null,
    documentNumberEncrypted: null,
    stratum: null,
    companyName: 'Empresa XYZ S.A.S.',
    fiscalDocument: '900123456-7',
    emailPrimaryEncrypted: null,
    emailSecondary: 'contacto@empresa.co',
    phonePrimaryEncrypted: null,
    phoneSecondaryEncrypted: null,
    address: 'Av. El Dorado #50-20',
    municipality: 'Bogotá',
    department: 'Cundinamarca',
    neighborhood: null,
    latitude: null,
    longitude: null,
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockTenantContextGetOrThrow.mockReturnValue({
      schemaName: 'tenant_test',
      tenantId: 'tenant-001',
    });

    subscribersServiceMock = {
      createFromExpediente: jest.fn(),
      findByExpedienteId: jest.fn().mockResolvedValue(null),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SubscriberCreationService,
        { provide: DataSource, useValue: {} },
        { provide: SubscribersService, useValue: subscribersServiceMock },
        { provide: AuditService, useValue: { log: jest.fn() } },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        {
          provide: ConfigService,
          useValue: {
            getOrThrow: (key: string) => {
              if (key === 'MFA_ENCRYPTION_KEY') return TEST_ENCRYPTION_KEY;
              return null;
            },
          },
        },
      ],
    }).compile();

    service = module.get<SubscriberCreationService>(SubscriberCreationService);
  });

  // ── resolvePersonType ──

  describe('resolvePersonType', () => {
    it('resuelve NATURAL cuando personType es PERSONA_NATURAL', () => {
      const result = (service as any).resolvePersonType(mockExpedienteNatural);
      expect(result).toBe(PersonType.NATURAL);
    });

    it('resuelve JURIDICA cuando personType es PERSONA_JURIDICA', () => {
      const result = (service as any).resolvePersonType(mockExpedienteJuridica);
      expect(result).toBe(PersonType.JURIDICA);
    });

    it('resuelve NATURAL cuando personType es NATURAL (valor directo)', () => {
      const expediente = { ...mockExpedienteNatural, personType: 'NATURAL' };
      const result = (service as any).resolvePersonType(expediente);
      expect(result).toBe(PersonType.NATURAL);
    });

    it('resuelve JURIDICA cuando personType es JURIDICA (valor directo)', () => {
      const expediente = { ...mockExpedienteJuridica, personType: 'JURIDICA' };
      const result = (service as any).resolvePersonType(expediente);
      expect(result).toBe(PersonType.JURIDICA);
    });

    it('infiere JURIDICA si tiene fiscalDocument (NIT)', () => {
      const expediente = {
        ...mockExpedienteNatural,
        personType: null,
        fiscalDocument: '900123456-7',
      };
      const result = (service as any).resolvePersonType(expediente);
      expect(result).toBe(PersonType.JURIDICA);
    });

    it('infiere JURIDICA si tiene companyName', () => {
      const expediente = { ...mockExpedienteNatural, personType: null, companyName: 'Empresa XYZ' };
      const result = (service as any).resolvePersonType(expediente);
      expect(result).toBe(PersonType.JURIDICA);
    });

    it('por defecto resuelve NATURAL si no hay indicadores de jurídica', () => {
      const expediente = {
        ...mockExpedienteNatural,
        personType: null,
        fiscalDocument: null,
        companyName: null,
      };
      const result = (service as any).resolvePersonType(expediente);
      expect(result).toBe(PersonType.NATURAL);
    });
  });

  // ── resolveCustomerSegment ──

  describe('resolveCustomerSegment', () => {
    it('asigna RESIDENTIAL para persona natural', () => {
      const result = (service as any).resolveCustomerSegment(
        mockExpedienteNatural,
        PersonType.NATURAL,
      );
      expect(result).toBe(CustomerSegment.RESIDENTIAL);
    });

    it('asigna PYME para persona jurídica', () => {
      const result = (service as any).resolveCustomerSegment(
        mockExpedienteJuridica,
        PersonType.JURIDICA,
      );
      expect(result).toBe(CustomerSegment.PYME);
    });
  });

  // ── resolveEmail ──

  describe('resolveEmail', () => {
    it('usa emailSecondary del expediente si no hay emailPrimary cifrado', () => {
      const result = (service as any).resolveEmail(mockExpedienteNatural);
      expect(result).toBe('juan@example.com');
    });

    it('descifra emailPrimary si existe', () => {
      // Cifrar un email de prueba con la misma clave
      const crypto = require('crypto');
      const key = Buffer.from(TEST_ENCRYPTION_KEY, 'hex');
      const iv = crypto.randomBytes(12);
      const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
      const encrypted = Buffer.concat([cipher.update('primary@test.com', 'utf8'), cipher.final()]);
      const authTag = cipher.getAuthTag();
      const encryptedEmail = `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;

      const expediente = { ...mockExpedienteNatural, emailPrimaryEncrypted: encryptedEmail };
      const result = (service as any).resolveEmail(expediente);
      expect(result).toBe('primary@test.com');
    });

    it('genera placeholder si no hay email', () => {
      const expediente = {
        ...mockExpedienteNatural,
        emailPrimaryEncrypted: null,
        emailSecondary: null,
      };
      const result = (service as any).resolveEmail(expediente);
      expect(result).toContain('expediente-');
      expect(result).toContain('@placeholder.iwana.co');
    });

    it('usa emailSecondary si emailPrimary no se puede descifrar', () => {
      const expediente = { ...mockExpedienteNatural, emailPrimaryEncrypted: 'invalid-format' };
      const result = (service as any).resolveEmail(expediente);
      // Debe caer a emailSecondary
      expect(result).toBe('juan@example.com');
    });
  });

  // ── resolvePhone ──

  describe('resolvePhone', () => {
    it('descifra phonePrimary si existe', () => {
      const crypto = require('crypto');
      const key = Buffer.from(TEST_ENCRYPTION_KEY, 'hex');
      const iv = crypto.randomBytes(12);
      const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
      const encrypted = Buffer.concat([cipher.update('3001112222', 'utf8'), cipher.final()]);
      const authTag = cipher.getAuthTag();
      const encryptedPhone = `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;

      const expediente = { ...mockExpedienteNatural, phonePrimaryEncrypted: encryptedPhone };
      const result = (service as any).resolvePhone(expediente);
      expect(result).toBe('3001112222');
    });

    it('retorna placeholder si no hay teléfono', () => {
      const result = (service as any).resolvePhone(mockExpedienteNatural);
      expect(result).toBe('0000000000');
    });

    it('intenta phoneSecondary si phonePrimary no se puede descifrar', () => {
      const crypto = require('crypto');
      const key = Buffer.from(TEST_ENCRYPTION_KEY, 'hex');
      const iv = crypto.randomBytes(12);
      const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
      const encrypted = Buffer.concat([cipher.update('6019998888', 'utf8'), cipher.final()]);
      const authTag = cipher.getAuthTag();
      const encryptedPhone = `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;

      const expediente = {
        ...mockExpedienteNatural,
        phonePrimaryEncrypted: 'invalid-format',
        phoneSecondaryEncrypted: encryptedPhone,
      };
      const result = (service as any).resolvePhone(expediente);
      expect(result).toBe('6019998888');
    });
  });

  // ── resolveDocumentNumber ──

  describe('resolveDocumentNumber', () => {
    it('descifra documentNumber si existe', () => {
      const crypto = require('crypto');
      const key = Buffer.from(TEST_ENCRYPTION_KEY, 'hex');
      const iv = crypto.randomBytes(12);
      const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
      const encrypted = Buffer.concat([cipher.update('12345678', 'utf8'), cipher.final()]);
      const authTag = cipher.getAuthTag();
      const encryptedDoc = `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;

      const expediente = { ...mockExpedienteNatural, documentNumberEncrypted: encryptedDoc };
      const result = (service as any).resolveDocumentNumber(expediente);
      expect(result).toBe('12345678');
    });

    it('retorna null si no hay documentNumber', () => {
      const expediente = { ...mockExpedienteNatural, documentNumberEncrypted: null };
      const result = (service as any).resolveDocumentNumber(expediente);
      expect(result).toBeNull();
    });

    it('retorna null si documentNumber no se puede descifrar', () => {
      const expediente = { ...mockExpedienteNatural, documentNumberEncrypted: 'invalid-format' };
      const result = (service as any).resolveDocumentNumber(expediente);
      expect(result).toBeNull();
    });
  });

  // ── createFromExpediente (flujo completo) ──

  describe('createFromExpediente', () => {
    it('crea subscriber a partir de expediente persona natural', async () => {
      // Mock: expediente encontrado
      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, callback) =>
        callback({
          manager: {
            findOne: async () => mockExpedienteNatural,
          },
        }),
      );

      // Mock: subscriber creado
      subscribersServiceMock.createFromExpediente.mockResolvedValue({
        id: 'sub-new-001',
        personType: PersonType.NATURAL,
        customerSegment: CustomerSegment.RESIDENTIAL,
        status: SubscriberStatus.ACTIVE,
      });

      const subscriberId = await service.createFromExpediente('exp-001', 'actor-1');

      expect(subscriberId).toBe('sub-new-001');
      expect(subscribersServiceMock.createFromExpediente).toHaveBeenCalledWith(
        'exp-001',
        expect.objectContaining({
          personType: PersonType.NATURAL,
          customerSegment: CustomerSegment.RESIDENTIAL,
          firstName: 'Juan',
          lastName: 'Pérez',
          stratum: 2,
          email: 'juan@example.com',
          address: 'Calle 1 #2-3',
          city: 'Bogotá',
          department: 'Cundinamarca',
          neighborhood: 'Centro',
          latitude: 4.711,
          longitude: -74.0721,
        }),
        'actor-1',
      );
    });

    it('crea subscriber a partir de expediente persona jurídica', async () => {
      // Mock: expediente encontrado
      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, callback) =>
        callback({
          manager: {
            findOne: async () => mockExpedienteJuridica,
          },
        }),
      );

      // Mock: subscriber creado
      subscribersServiceMock.createFromExpediente.mockResolvedValue({
        id: 'sub-new-002',
        personType: PersonType.JURIDICA,
        customerSegment: CustomerSegment.PYME,
        status: SubscriberStatus.ACTIVE,
      });

      const subscriberId = await service.createFromExpediente('exp-002', 'actor-1');

      expect(subscriberId).toBe('sub-new-002');
      expect(subscribersServiceMock.createFromExpediente).toHaveBeenCalledWith(
        'exp-002',
        expect.objectContaining({
          personType: PersonType.JURIDICA,
          customerSegment: CustomerSegment.PYME,
          businessName: 'Empresa XYZ S.A.S.',
          nit: '900123456-7',
          email: 'contacto@empresa.co',
          address: 'Av. El Dorado #50-20',
        }),
        'actor-1',
      );
    });

    it('lanza error si expediente no existe', async () => {
      // Mock: expediente no encontrado
      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, callback) =>
        callback({
          manager: {
            findOne: async () => null,
          },
        }),
      );

      await expect(service.createFromExpediente('nonexistent', 'actor-1')).rejects.toThrow(
        'no encontrado para creación de subscriber',
      );
    });

    it('usa placeholder para email si expediente no tiene emailSecondary', async () => {
      const expedienteSinEmail = {
        ...mockExpedienteNatural,
        emailPrimaryEncrypted: null,
        emailSecondary: null,
      };

      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, callback) =>
        callback({
          manager: {
            findOne: async () => expedienteSinEmail,
          },
        }),
      );

      subscribersServiceMock.createFromExpediente.mockResolvedValue({
        id: 'sub-new-003',
      });

      await service.createFromExpediente('exp-003', 'actor-1');

      expect(subscribersServiceMock.createFromExpediente).toHaveBeenCalledWith(
        'exp-003',
        expect.objectContaining({
          email: expect.stringContaining('@placeholder.iwana.co'),
        }),
        'actor-1',
      );
    });

    it('descifra emailPrimary cifrado del expediente', async () => {
      const crypto = require('crypto');
      const key = Buffer.from(TEST_ENCRYPTION_KEY, 'hex');
      const iv = crypto.randomBytes(12);
      const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
      const encrypted = Buffer.concat([cipher.update('primary@email.co', 'utf8'), cipher.final()]);
      const authTag = cipher.getAuthTag();
      const encryptedEmail = `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;

      const expediente = {
        ...mockExpedienteNatural,
        emailPrimaryEncrypted: encryptedEmail,
        emailSecondary: null,
      };

      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, callback) =>
        callback({
          manager: {
            findOne: async () => expediente,
          },
        }),
      );

      subscribersServiceMock.createFromExpediente.mockResolvedValue({ id: 'sub-new-004' });

      await service.createFromExpediente('exp-004', 'actor-1');

      expect(subscribersServiceMock.createFromExpediente).toHaveBeenCalledWith(
        'exp-004',
        expect.objectContaining({
          email: 'primary@email.co',
        }),
        'actor-1',
      );
    });
  });
});
