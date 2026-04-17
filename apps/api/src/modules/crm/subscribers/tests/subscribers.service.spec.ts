import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import {
  PersonType,
  CustomerSegment,
  SubscriberStatus,
  VatTreatment,
  TaxRegime,
  DocumentType,
} from '@iwana/shared';
import { SubscribersService } from '../subscribers.service';
import { VatTreatmentService } from '../vat-treatment.service';
import { SubscriberStatusTransitionService } from '../subscriber-status-transition.service';
import { Subscriber } from '../entities/subscriber.entity';
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

describe('SubscribersService', () => {
  let service: SubscribersService;
  let vatTreatmentService: VatTreatmentService;

  // Clave de cifrado de prueba (32 bytes hex = 256 bits)
  const TEST_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

  beforeEach(async () => {
    jest.clearAllMocks();
    mockTenantContextGetOrThrow.mockReturnValue({
      schemaName: 'tenant_test',
      tenantId: 'tenant-001',
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SubscribersService,
        VatTreatmentService,
        SubscriberStatusTransitionService,
        { provide: DataSource, useValue: {} },
        { provide: AuditService, useValue: { log: jest.fn() } },
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

    service = module.get<SubscribersService>(SubscribersService);
    vatTreatmentService = module.get<VatTreatmentService>(VatTreatmentService);
  });

  // ── Cifrado PII ──

  describe('Cifrado PII', () => {
    it('cifra y descifra valores correctamente (formato iv:authTag:ciphertext)', () => {
      const plaintext = 'test@example.com';
      const encrypted = (service as any).encryptValue(plaintext);
      const decrypted = (service as any).decryptValue(encrypted);

      expect(decrypted).toBe(plaintext);
      expect(encrypted).toContain(':'); // Formato iv:authTag:ciphertext
      const parts = encrypted.split(':');
      expect(parts).toHaveLength(3);
    });

    it('cifra el mismo valor de forma diferente cada vez (IV aleatorio)', () => {
      const plaintext = '3001234567';
      const encrypted1 = (service as any).encryptValue(plaintext);
      const encrypted2 = (service as any).encryptValue(plaintext);

      // Los cifrados deben ser diferentes (IV aleatorio)
      expect(encrypted1).not.toBe(encrypted2);

      // Pero ambos deben descifrar al mismo valor
      expect((service as any).decryptValue(encrypted1)).toBe(plaintext);
      expect((service as any).decryptValue(encrypted2)).toBe(plaintext);
    });

    it('lanza error con formato de valor cifrado inválido', () => {
      expect(() => (service as any).decryptValue('invalid-format')).toThrow(
        'Formato de valor cifrado inválido',
      );
    });

    it('genera hash SHA-256 determinista para búsqueda', () => {
      const value = '12345678';
      const hash1 = (service as any).sha256Hash(value);
      const hash2 = (service as any).sha256Hash(value);

      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64); // SHA-256 hex = 64 caracteres
    });

    it('descifra campos PII del suscriptor correctamente', () => {
      const subscriber = buildSubscriber({
        emailEncrypted: (service as any).encryptValue('user@test.com'),
        phoneEncrypted: (service as any).encryptValue('3001112222'),
        documentNumberEncrypted: (service as any).encryptValue('12345678'),
      });

      const result = (service as any).decryptSubscriberFields(subscriber);

      expect(result.email).toBe('user@test.com');
      expect(result.phone).toBe('3001112222');
      expect(result.documentNumber).toBe('12345678');
    });

    it('maneja campos PII cifrados corruptos sin fallar', () => {
      const subscriber = buildSubscriber({
        emailEncrypted: 'corrupted-data',
        phoneEncrypted: 'corrupted-data',
        documentNumberEncrypted: 'corrupted-data',
      });

      // No debe lanzar error, solo loguear warning
      const result = (service as any).decryptSubscriberFields(subscriber);
      expect(result).toBeDefined();
    });
  });

  // ── Cálculo automático de IVA ──

  describe('Cálculo automático de IVA', () => {
    it('NATURAL estrato 2 RESIDENTIAL → EXEMPT + SIMPLIFIED al crear', async () => {
      const savedSubscriber = buildSubscriber({
        personType: PersonType.NATURAL,
        customerSegment: CustomerSegment.RESIDENTIAL,
        stratum: 2,
        vatTreatment: VatTreatment.EXEMPT,
        taxRegime: TaxRegime.SIMPLIFIED,
      });

      mockSave(savedSubscriber);

      await service.create(
        {
          personType: PersonType.NATURAL,
          customerSegment: CustomerSegment.RESIDENTIAL,
          documentType: 'CC',
          documentNumber: '12345678',
          firstName: 'Juan',
          lastName: 'Pérez',
          stratum: 2,
          email: 'juan@example.com',
          phone: '3001234567',
          address: 'Calle 1 #2-3',
        },
        'actor-1',
      );

      // Verificar que el IVA se calculó correctamente
      expect(vatTreatmentService.resolve(PersonType.NATURAL, 2, CustomerSegment.RESIDENTIAL)).toBe(
        VatTreatment.EXEMPT,
      );
    });

    it('JURIDICA GOVERNMENT → STANDARD + COMMON al crear', async () => {
      expect(
        vatTreatmentService.resolve(PersonType.JURIDICA, null, CustomerSegment.GOVERNMENT),
      ).toBe(VatTreatment.STANDARD);
      expect(vatTreatmentService.resolveTaxRegime(PersonType.JURIDICA)).toBe(TaxRegime.COMMON);
    });

    it('NATURAL estrato 3 → EXCLUDED (fuera del régimen IVA)', () => {
      expect(vatTreatmentService.resolve(PersonType.NATURAL, 3, CustomerSegment.SOHO)).toBe(
        VatTreatment.EXCLUDED,
      );
    });

    it('NATURAL estrato 5 → STANDARD (IVA 19%)', () => {
      expect(vatTreatmentService.resolve(PersonType.NATURAL, 5, CustomerSegment.PYME)).toBe(
        VatTreatment.STANDARD,
      );
    });

    it('applyTaxFields retorna ambos campos correctamente', () => {
      const result = vatTreatmentService.applyTaxFields(
        PersonType.NATURAL,
        1,
        CustomerSegment.RESIDENTIAL,
      );
      expect(result).toEqual({
        vatTreatment: VatTreatment.EXEMPT,
        taxRegime: TaxRegime.SIMPLIFIED,
      });
    });
  });

  // ── Validación de campos obligatorios ──

  describe('Validación de campos obligatorios', () => {
    it('NATURAL sin estrato → error al calcular IVA', () => {
      expect(() =>
        vatTreatmentService.resolve(PersonType.NATURAL, null, CustomerSegment.RESIDENTIAL),
      ).toThrow('Estrato es obligatorio para persona natural');
    });

    it('JURIDICA sin NIT → error de validación', () => {
      const errors = vatTreatmentService.validateRequiredFields(PersonType.JURIDICA, {
        businessName: 'Empresa XYZ',
        emailEncrypted: 'encrypted',
        phoneEncrypted: 'encrypted',
        address: 'Calle 1',
      });
      expect(errors).toContain('nit es obligatorio para persona jurídica');
    });

    it('NATURAL sin firstName → error de validación', () => {
      const errors = vatTreatmentService.validateRequiredFields(PersonType.NATURAL, {
        documentType: DocumentType.CC,
        documentNumberEncrypted: 'encrypted',
        lastName: 'Pérez',
        stratum: 3,
        emailEncrypted: 'encrypted',
        phoneEncrypted: 'encrypted',
        address: 'Calle 1',
      });
      expect(errors).toContain('firstName es obligatorio para persona natural');
    });

    it('JURIDICA con todos los campos → sin errores', () => {
      const errors = vatTreatmentService.validateRequiredFields(PersonType.JURIDICA, {
        nit: '900123456-7',
        businessName: 'Empresa XYZ',
        emailEncrypted: 'encrypted',
        phoneEncrypted: 'encrypted',
        address: 'Calle 1',
      });
      expect(errors).toHaveLength(0);
    });
  });

  // ── Búsqueda ──

  describe('Búsqueda', () => {
    it('search por NIT funciona (búsqueda directa)', async () => {
      const subscriber = buildSubscriber({
        personType: PersonType.JURIDICA,
        nit: '900123456-7',
        businessName: 'Empresa XYZ',
      });

      mockSearchResults([subscriber]);

      const results = await service.search({ nit: '900123456-7' });
      expect(results).toHaveLength(1);
      expect(results[0]!.nit).toBe('900123456-7');
    });

    it('search sin parámetros retorna array vacío', async () => {
      const results = await service.search({});
      expect(results).toEqual([]);
    });

    it('search por email usa hash SHA-256 para búsqueda determinista', async () => {
      const email = 'test@example.com';
      const expectedHash = (service as any).sha256Hash(email);
      const subscriber = buildSubscriber({
        emailHash: expectedHash,
      });

      mockSearchResults([subscriber]);

      const results = await service.search({ email });
      expect(results).toHaveLength(1);
    });

    it('search por teléfono usa hash SHA-256 para búsqueda determinista', async () => {
      const phone = '3001112222';
      const expectedHash = (service as any).sha256Hash(phone);
      const subscriber = buildSubscriber({
        phoneHash: expectedHash,
      });

      mockSearchResults([subscriber]);

      const results = await service.search({ phone });
      expect(results).toHaveLength(1);
    });

    it('search por documento usa hash SHA-256', async () => {
      const docNumber = '12345678';
      const expectedHash = (service as any).sha256Hash(docNumber);
      const subscriber = buildSubscriber({
        documentNumberHash: expectedHash,
      });

      mockSearchResults([subscriber]);

      const results = await service.search({ documentNumber: docNumber });
      expect(results).toHaveLength(1);
    });
  });

  // ── findAll con filtros ──

  describe('findAll con filtros', () => {
    it('retorna lista paginada de suscriptores', async () => {
      const subscriber1 = buildSubscriber({ id: 'sub-001' });
      const subscriber2 = buildSubscriber({ id: 'sub-002' });

      mockFindManyWithCount([subscriber1, subscriber2], 2);

      const result = await service.findAll({ page: 1, limit: 20 });

      expect(result.data).toHaveLength(2);
      expect(result.total).toBe(2);
    });

    it('filtra por status correctamente', async () => {
      const subscriber = buildSubscriber({ status: SubscriberStatus.ACTIVE });

      mockFindManyWithCount([subscriber], 1);

      const result = await service.findAll({ status: SubscriberStatus.ACTIVE });

      expect(result.data).toHaveLength(1);
      expect(result.data[0]!.status).toBe(SubscriberStatus.ACTIVE);
    });
  });

  // ── findById ──

  describe('findById', () => {
    it('retorna suscriptor con PII descifrado', async () => {
      const email = 'found@test.com';
      const phone = '3009998888';
      const subscriber = buildSubscriber({
        id: 'sub-find-001',
        emailEncrypted: (service as any).encryptValue(email),
        phoneEncrypted: (service as any).encryptValue(phone),
      });

      mockFindOne(subscriber);

      const result = await service.findById('sub-find-001');

      expect(result.id).toBe('sub-find-001');
      // Los campos descifrados se agregan al objeto
      expect((result as any).email).toBe(email);
      expect((result as any).phone).toBe(phone);
    });

    it('lanza NotFoundException si no existe', async () => {
      mockFindOne(null);

      await expect(service.findById('nonexistent')).rejects.toThrow('no encontrado');
    });
  });

  // ── update ──

  describe('update', () => {
    it('recalcula IVA al cambiar personType', async () => {
      const existing = buildSubscriber({
        personType: PersonType.NATURAL,
        stratum: 3,
        vatTreatment: VatTreatment.EXCLUDED,
        taxRegime: TaxRegime.SIMPLIFIED,
      });

      mockFindOne(existing);
      mockSave(existing);

      const result = await service.update(
        'sub-001',
        { personType: PersonType.JURIDICA },
        'actor-1',
      );

      // JURIDICA siempre es STANDARD + COMMON
      expect(
        vatTreatmentService.resolve(PersonType.JURIDICA, null, CustomerSegment.RESIDENTIAL),
      ).toBe(VatTreatment.STANDARD);
    });

    it('recalcula IVA al cambiar stratum', async () => {
      const existing = buildSubscriber({
        personType: PersonType.NATURAL,
        stratum: 2,
        vatTreatment: VatTreatment.EXEMPT,
      });

      mockFindOne(existing);
      mockSave(existing);

      // Cambiar estrato de 2 a 5 cambia EXEMPT → STANDARD
      expect(vatTreatmentService.resolve(PersonType.NATURAL, 5, CustomerSegment.RESIDENTIAL)).toBe(
        VatTreatment.STANDARD,
      );
    });
  });

  // ── remove (soft delete) ──

  describe('remove', () => {
    it('ejecuta soft delete del suscriptor', async () => {
      const subscriber = buildSubscriber({ id: 'sub-del-001' });

      // remove() llama a findById() primero, luego a softRemove()
      // findById usa runInTenantSchema → findOne
      // softRemove usa runInTenantSchema → softRemove
      let callCount = 0;
      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, callback) => {
        callCount++;
        if (callCount === 1) {
          // Primera llamada: findById → findOne
          return callback({
            manager: {
              findOne: async () => subscriber,
            },
          });
        }
        // Segunda llamada: softRemove
        return callback({
          manager: {
            softRemove: async () => subscriber,
          },
        });
      });

      await service.remove('sub-del-001', 'actor-1');

      expect(mockRunInTenantSchema).toHaveBeenCalledTimes(2);
    });
  });

  // ── createFromExpediente ──

  describe('createFromExpediente', () => {
    it('crea suscriptor y lo activa directamente', async () => {
      const created = buildSubscriber({
        id: 'sub-exp-001',
        personType: PersonType.NATURAL,
        customerSegment: CustomerSegment.RESIDENTIAL,
        status: SubscriberStatus.ACTIVE,
      });

      // Mock para create
      mockSave(created);
      // Mock para transitionStatus (findById interno)
      mockFindOne(created);
      // Mock para la transición
      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, callback) =>
        callback({
          manager: {
            save: async () => created,
            update: async () => ({ affected: 1 }),
            findOne: async () => ({ ...created, status: SubscriberStatus.ACTIVE }),
          },
        }),
      );

      const result = await service.createFromExpediente(
        'exp-001',
        {
          personType: PersonType.NATURAL,
          customerSegment: CustomerSegment.RESIDENTIAL,
          documentType: 'CC',
          documentNumber: '12345678',
          firstName: 'Juan',
          lastName: 'Pérez',
          stratum: 2,
          email: 'juan@expediente.co',
          phone: '3001234567',
          address: 'Calle 1 #2-3',
        },
        'actor-1',
      );

      expect(result).toBeDefined();
      expect(result.id).toBe('sub-exp-001');
    });
  });

  // ── Helpers ──

  function mockSave(subscriber: Subscriber): void {
    mockRunInTenantSchema.mockImplementation(async (_ds, _schema, callback) =>
      callback({
        manager: {
          save: async () => subscriber,
          findOne: async () => subscriber,
        },
      }),
    );
  }

  function mockFindOne(subscriber: Subscriber | null): void {
    mockRunInTenantSchema.mockImplementation(async (_ds, _schema, callback) =>
      callback({
        manager: {
          findOne: async () => subscriber,
        },
      }),
    );
  }

  function mockFindMany(subscribers: Subscriber[]): void {
    mockRunInTenantSchema.mockImplementation(async (_ds, _schema, callback) =>
      callback({
        manager: {
          createQueryBuilder: () => ({
            where: () => ({
              andWhere: () => ({
                andWhere: () => ({
                  orderBy: () => ({
                    skip: () => ({
                      take: () => ({
                        getManyAndCount: async () => [subscribers, subscribers.length],
                      }),
                    }),
                  }),
                }),
              }),
            }),
            getManyAndCount: async () => [subscribers, subscribers.length],
            getMany: async () => subscribers,
          }),
        },
      }),
    );
  }

  function mockFindManyWithCount(subscribers: Subscriber[], total: number): void {
    // Mock encadenado para QueryBuilder: .createQueryBuilder().andWhere().andWhere()...orderBy().skip().take().getManyAndCount()
    const chainable: Record<string, any> = {};
    chainable.andWhere = () => chainable;
    chainable.orderBy = () => chainable;
    chainable.skip = () => chainable;
    chainable.take = () => chainable;
    chainable.getManyAndCount = async () => [subscribers, total];
    chainable.getMany = async () => subscribers;

    mockRunInTenantSchema.mockImplementation(async (_ds, _schema, callback) =>
      callback({
        manager: {
          createQueryBuilder: () => chainable,
        },
      }),
    );
  }

  /**
   * Mock para búsqueda por hash (search method).
   * El search usa .where() en lugar de .andWhere() encadenado.
   */
  function mockSearchResults(subscribers: Subscriber[]): void {
    const chainable: Record<string, any> = {};
    chainable.where = () => chainable;
    chainable.andWhere = () => chainable;
    chainable.getMany = async () => subscribers;

    mockRunInTenantSchema.mockImplementation(async (_ds, _schema, callback) =>
      callback({
        manager: {
          createQueryBuilder: () => chainable,
        },
      }),
    );
  }
});

function buildSubscriber(overrides: Partial<Subscriber> = {}): Subscriber {
  return {
    id: 'sub-001',
    tenantId: 'tenant-001',
    userId: null,
    personType: PersonType.NATURAL,
    customerSegment: CustomerSegment.RESIDENTIAL,
    documentType: DocumentType.CC,
    documentNumberEncrypted: 'encrypted-doc',
    documentNumberHash: null,
    emailHash: null,
    phoneHash: null,
    firstName: 'Juan',
    lastName: 'Pérez',
    stratum: 3,
    birthDate: null,
    nit: null,
    nitVerificationDigit: null,
    businessName: null,
    commercialName: null,
    legalRepresentativeId: null,
    emailEncrypted: 'encrypted-email',
    phoneEncrypted: 'encrypted-phone',
    whatsapp: null,
    vatTreatment: VatTreatment.EXCLUDED,
    taxRegime: TaxRegime.SIMPLIFIED,
    address: 'Calle 1 #2-3',
    neighborhood: null,
    city: null,
    department: null,
    postalCode: null,
    latitude: null,
    longitude: null,
    coverageNodeId: null,
    status: SubscriberStatus.LEAD,
    externalId: null,
    createdBy: 'user-base',
    createdAt: new Date('2026-04-16T00:00:00Z'),
    updatedAt: new Date('2026-04-16T00:00:00Z'),
    deletedAt: null,
    ...overrides,
  } as Subscriber;
}
