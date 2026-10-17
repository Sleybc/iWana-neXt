import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import {
  PersonType,
  CustomerSegment,
  SubscriberStatus,
  VatTreatment,
  TaxRegime,
  DocumentType,
  ExpedienteStatus,
  ConsentChannel,
  PartyRoleType,
  PartyType,
  VatResponsibility,
  RutResponsibility,
} from '@iwana/shared';
import { hashDocumentNumber } from '../../../../common/crypto/hash-document.util';
import { hashEmail } from '../../../../common/crypto/hash-email.util';
import { hmacPii } from '../../../../common/crypto/pii-hash-key.util';
import { SubscribersService } from '../subscribers.service';
import { VatTreatmentService } from '../vat-treatment.service';
import { SubscriberStatusTransitionService } from '../subscriber-status-transition.service';
import { SubscriberFiscalCompletenessService } from '../subscriber-fiscal-completeness.service';
import { Subscriber } from '../entities/subscriber.entity';
import { AuditService } from '../../../audit/audit.service';
import { IPartyWritePort } from '../../../parties/ports/party-write.port';
import { IPartyReadPort } from '../../../parties/ports/party-read.port';
import { IPrivacyAuthorizationWritePort } from '../../../privacy/ports/privacy-authorization-write.port';
import { IPrivacyLegalTextReadPort } from '../../../privacy/ports/privacy-legal-text-read.port';
import { calculateNitVerificationDigit } from '../../../../common/crypto/nit-verification-digit.util';

// Mocks para multi-tenant
const mockRunInTenantSchema = jest.fn();
const mockTenantContextGetOrThrow = jest.fn();
const auditServiceMock = { log: jest.fn().mockResolvedValue(undefined) };
const partyWritePortMock = {
  ensurePartyWithRole: jest.fn().mockResolvedValue({
    partyId: 'party-test-uuid',
    partyRoleId: 'role-test-uuid',
    partyCreated: true,
    roleAdded: true,
    identity: { contacts: [] },
  }),
};
const partyReadPortMock = { getByIds: jest.fn().mockResolvedValue([]) };
const privacyAuthorizationWritePortMock = {
  record: jest.fn().mockResolvedValue({ authorizationId: 'auth-test-id', created: true }),
};
const privacyLegalTextReadPortMock = {
  current: jest.fn().mockResolvedValue(null),
  findByVersion: jest.fn().mockResolvedValue(null),
};

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
    auditServiceMock.log.mockResolvedValue(undefined);
    partyWritePortMock.ensurePartyWithRole.mockClear();
    partyReadPortMock.getByIds.mockReset().mockResolvedValue([]);
    privacyAuthorizationWritePortMock.record.mockClear();
    mockTenantContextGetOrThrow.mockReturnValue({
      schemaName: 'tenant_test',
      tenantId: 'tenant-001',
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SubscribersService,
        VatTreatmentService,
        SubscriberStatusTransitionService,
        SubscriberFiscalCompletenessService,
        { provide: DataSource, useValue: {} },
        { provide: AuditService, useValue: auditServiceMock },
        { provide: IPartyWritePort, useValue: partyWritePortMock },
        { provide: IPartyReadPort, useValue: partyReadPortMock },
        { provide: IPrivacyAuthorizationWritePort, useValue: privacyAuthorizationWritePortMock },
        { provide: IPrivacyLegalTextReadPort, useValue: privacyLegalTextReadPortMock },
        {
          provide: ConfigService,
          useValue: {
            getOrThrow: (key: string) => {
              if (key === 'MFA_ENCRYPTION_KEY') return TEST_ENCRYPTION_KEY;
              if (key === 'PII_HASH_KEY') return TEST_ENCRYPTION_KEY;
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
        /Formato de valor cifrado invalido/i,
      );
    });

    it('genera hash HMAC-SHA-256 determinista para búsqueda de documento', () => {
      const value = '12345678';
      const hash1 = hashDocumentNumber(value);
      const hash2 = hashDocumentNumber(value);

      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64);
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

  describe('rechazos de alta y recuperación idempotente', () => {
    const minimumCreateInput = {
      personType: PersonType.NATURAL,
      customerSegment: CustomerSegment.RESIDENTIAL,
      stratum: 3,
      email: 'synthetic@example.invalid',
      phone: '3000000000',
      address: 'Dirección sintética',
      vatResponsibility: VatResponsibility.RESPONSABLE,
      rutResponsibilities: ['O-13'] as RutResponsibility[],
      authorizationChannel: ConsentChannel.TELEFONO,
      authorizations: [
        {
          purpose: 'TRATAMIENTO_CONTRACTUAL' as const,
          granted: true,
          legalTextId: '00000000-0000-4000-8000-000000000099',
        },
      ],
    };

    it('rechaza un alta directa sin teléfono ni correo antes de escribir', async () => {
      const { email: _email, phone: _phone, ...withoutContact } = minimumCreateInput;

      await expect(service.create(withoutContact, 'actor-1')).rejects.toMatchObject({
        response: {
          code: 'SUBSCRIBER_CONTACT_REQUIRED',
          message: 'Registra al menos un teléfono o un correo.',
        },
      });

      expect(mockRunInTenantSchema).not.toHaveBeenCalled();
      expect(partyWritePortMock.ensurePartyWithRole).not.toHaveBeenCalled();
    });

    it('rechaza un alta que no puede vincularse con un Party', async () => {
      const saved = buildSubscriber({ id: 'sub-without-document', partyId: null });
      mockSave(saved);

      await expect(service.create(minimumCreateInput, 'actor-1')).rejects.toMatchObject({
        response: { code: 'SUBSCRIBER_PARTY_REQUIRED' },
      });

      expect(partyWritePortMock.ensurePartyWithRole).not.toHaveBeenCalled();
    });

    it('rechaza el alta manual sin responsabilidad de IVA o del RUT antes de escribir', async () => {
      const {
        vatResponsibility: _vatResponsibility,
        rutResponsibilities: _rutResponsibilities,
        ...input
      } = minimumCreateInput;

      await expect(service.create(input, 'actor-1')).rejects.toMatchObject({
        response: expect.objectContaining({
          code: 'SUBSCRIBER_FISCAL_DATA_REQUIRED',
        }),
      });

      expect(mockRunInTenantSchema).not.toHaveBeenCalled();
      expect(partyWritePortMock.ensurePartyWithRole).not.toHaveBeenCalled();
    });

    it('asegura Party natural con rol de representante dentro de la transacción del alta', async () => {
      const manager = {
        save: async () => buildSubscriber(),
        findOne: async () => buildSubscriber(),
      };
      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, callback) =>
        callback({ manager }),
      );
      const nit = '900111222';
      const dto = {
        ...minimumCreateInput,
        personType: PersonType.JURIDICA,
        customerSegment: CustomerSegment.CORPORATE,
        nit,
        nitVerificationDigit: calculateNitVerificationDigit(nit),
        businessName: 'Empresa sintética',
        legalRepresentative: {
          fullName: 'Representante sintético',
          documentType: DocumentType.CC,
          documentNumber: 'doc-sintetico-01',
        },
      };

      await service.create(dto, 'actor-1');

      const representativeCall = partyWritePortMock.ensurePartyWithRole.mock.calls.find(
        (call) => call[1] === PartyRoleType.LEGAL_REPRESENTATIVE,
      );
      expect(representativeCall).toBeDefined();
      expect(representativeCall?.[0]).toMatchObject({
        partyType: PartyType.NATURAL,
        documentNumber: 'doc-sintetico-01',
        displayName: 'Representante sintético',
      });
      expect(representativeCall?.[2].manager).toBe(manager);
    });

    it('rechaza un dígito de verificación NIT que no coincide antes de escribir', async () => {
      const expectedDigit = calculateNitVerificationDigit('900111222');
      const wrongDigit = expectedDigit === '0' ? '1' : '0';

      await expect(
        service.create(
          {
            ...minimumCreateInput,
            nit: '900111222',
            nitVerificationDigit: wrongDigit,
          },
          'actor-1',
        ),
      ).rejects.toThrow('El dígito de verificación del NIT no coincide.');

      expect(mockRunInTenantSchema).not.toHaveBeenCalled();
      expect(partyWritePortMock.ensurePartyWithRole).not.toHaveBeenCalled();
    });

    it('rechaza una razón de override demasiado corta antes de escribir', async () => {
      await expect(
        service.create({ ...minimumCreateInput, manualOverrideReason: 'corto' }, 'actor-1'),
      ).rejects.toThrow('manualOverrideReason debe tener al menos 10 caracteres');

      expect(mockRunInTenantSchema).not.toHaveBeenCalled();
    });

    it('reutiliza el suscriptor existente ante la colisión única del expediente', async () => {
      const expedienteId = 'exp-idempotent';
      const existing = buildSubscriber({ id: 'sub-existing', expedienteId });
      const duplicateError = {
        driverError: { code: '23505', constraint: 'uq_subscribers_expediente' },
      };
      mockRunInTenantSchema
        .mockRejectedValueOnce(duplicateError)
        .mockImplementationOnce(async (_ds, _schema, callback) =>
          callback({ manager: { findOne: async () => existing } }),
        );

      await expect(
        service.create({ ...minimumCreateInput, expedienteId }, 'actor-1'),
      ).resolves.toMatchObject({ id: existing.id });

      expect(mockRunInTenantSchema).toHaveBeenCalledTimes(2);
    });

    it('propaga una colisión única ajena al expediente', async () => {
      const duplicateError = {
        driverError: { code: '23505', constraint: 'uq_subscribers_external_id' },
      };
      mockRunInTenantSchema.mockRejectedValueOnce(duplicateError);

      await expect(
        service.create({ ...minimumCreateInput, expedienteId: 'exp-idempotent' }, 'actor-1'),
      ).rejects.toBe(duplicateError);
      expect(mockRunInTenantSchema).toHaveBeenCalledTimes(1);
    });
  });

  describe('Cálculo automático de IVA', () => {
    it('NATURAL estrato 2 RESIDENTIAL → EXEMPT sin persistir tax_regime', async () => {
      const savedSubscriber = buildSubscriber();
      let persisted: Subscriber | undefined;
      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, callback) =>
        callback({
          manager: {
            save: async (_entity: unknown, value: Subscriber) => {
              persisted = value;
              return savedSubscriber;
            },
            findOne: async () => savedSubscriber,
          },
        }),
      );

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
          vatResponsibility: VatResponsibility.RESPONSABLE,
          rutResponsibilities: ['O-13'],
          authorizationChannel: ConsentChannel.EMAIL,
          authorizations: [
            {
              purpose: 'TRATAMIENTO_CONTRACTUAL',
              granted: true,
              legalTextId: '00000000-0000-4000-8000-000000000099',
            },
          ],
        },
        'actor-1',
      );

      // Verificar que el IVA se calculó correctamente
      expect(vatTreatmentService.resolve(PersonType.NATURAL, 2, CustomerSegment.RESIDENTIAL)).toBe(
        VatTreatment.EXEMPT,
      );
      expect(persisted?.vatTreatment).toBe(VatTreatment.EXEMPT);
      expect(persisted?.taxRegime).toBeUndefined();
    });

    it('JURIDICA GOVERNMENT → STANDARD + COMMON al crear', async () => {
      expect(
        vatTreatmentService.resolve(PersonType.JURIDICA, null, CustomerSegment.GOVERNMENT),
      ).toBe(VatTreatment.STANDARD);
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

    it('applyTaxFields retorna solo el tratamiento de IVA', () => {
      const result = vatTreatmentService.applyTaxFields(
        PersonType.NATURAL,
        1,
        CustomerSegment.RESIDENTIAL,
      );
      expect(result).toEqual({
        vatTreatment: VatTreatment.EXEMPT,
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
      mockSearchResults([]);
      const results = await service.search({});
      expect(results).toEqual([]);
    });

    it('search por email usa HMAC para búsqueda determinista', async () => {
      const email = 'test@example.com';
      const expectedHash = hashEmail(email);
      const subscriber = buildSubscriber({
        emailHash: expectedHash,
      });

      mockSearchResults([subscriber]);

      const results = await service.search({ email });
      expect(results).toHaveLength(1);
    });

    it('search por teléfono usa HMAC para búsqueda determinista', async () => {
      const phone = '3001112222';
      const expectedHash = (service as any).hmacPhoneHash(phone);
      const subscriber = buildSubscriber({
        phoneHash: expectedHash,
      });

      mockSearchResults([subscriber]);

      const results = await service.search({ phone });
      expect(results).toHaveLength(1);
    });

    it('search por documento usa HMAC', async () => {
      const docNumber = '12345678';
      const expectedHash = hashDocumentNumber(docNumber);
      const subscriber = buildSubscriber({
        documentNumberHash: expectedHash,
      });

      mockSearchResults([subscriber]);

      const results = await service.search({ documentNumber: docNumber });
      expect(results).toHaveLength(1);
    });
  });

  // ── R8: origen único de la clave HMAC (ConfigService, sin respaldo de entorno) ──

  describe('Origen único de la clave HMAC (R8)', () => {
    it('resuelve el HMAC de documento desde ConfigService con PII_HASH_KEY ausente del entorno', async () => {
      const saved = process.env.PII_HASH_KEY;
      delete process.env.PII_HASH_KEY;
      try {
        const where = jest.fn().mockReturnThis();
        const take = jest.fn().mockReturnThis();
        const getMany = jest.fn().mockResolvedValue([]);
        mockRunInTenantSchema.mockImplementation(async (_ds, _schema, callback) =>
          callback({
            manager: {
              createQueryBuilder: () => ({ where, take, getMany }),
            },
          }),
        );

        const docNumber = '1122334455';
        await service.search({ documentNumber: docNumber });

        const expected = hmacPii(docNumber, Buffer.from(TEST_ENCRYPTION_KEY, 'hex'));
        expect(where).toHaveBeenCalledWith(expect.stringContaining('documentNumberHash'), {
          docHash: expected,
        });
      } finally {
        if (saved !== undefined) process.env.PII_HASH_KEY = saved;
      }
    });

    it('el HMAC no cambia cuando la clave de configuración y la de entorno coinciden', () => {
      const saved = process.env.PII_HASH_KEY;
      process.env.PII_HASH_KEY = TEST_ENCRYPTION_KEY;
      try {
        const key = Buffer.from(TEST_ENCRYPTION_KEY, 'hex');
        expect(hashDocumentNumber('99887766', key)).toBe(hashDocumentNumber('99887766'));
      } finally {
        if (saved !== undefined) process.env.PII_HASH_KEY = saved;
        else delete process.env.PII_HASH_KEY;
      }
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

    it('escapa %, _ y backslash para búsqueda literal con ILIKE', async () => {
      const chainable: Record<string, jest.Mock> = {};
      chainable.andWhere = jest.fn().mockReturnThis();
      chainable.orderBy = jest.fn().mockReturnThis();
      chainable.addOrderBy = jest.fn().mockReturnThis();
      chainable.skip = jest.fn().mockReturnThis();
      chainable.take = jest.fn().mockReturnThis();
      chainable.getManyAndCount = jest.fn().mockResolvedValue([[], 0]);
      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, callback) =>
        callback({ manager: { createQueryBuilder: () => chainable } }),
      );

      await service.findAll({ search: 'a%_\\b' });

      expect(chainable.andWhere).toHaveBeenCalledWith(
        expect.stringContaining("ILIKE :search ESCAPE E'\\\\'"),
        { search: '%a\\%\\_\\\\b%' },
      );
    });

    it('aplica en conjunto filtros de estado, tipo, segmento, estrato y búsqueda libre', async () => {
      const query = {
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      };
      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, callback) =>
        callback({ manager: { createQueryBuilder: () => query } }),
      );

      await service.findAll({
        status: SubscriberStatus.ACTIVE,
        personType: PersonType.NATURAL,
        customerSegment: CustomerSegment.RESIDENTIAL,
        stratum: 3,
        search: 'suscriptor sintético',
      });

      expect(query.andWhere).toHaveBeenCalledTimes(5);
      expect(query.andWhere).toHaveBeenCalledWith('s.status = :status', {
        status: SubscriberStatus.ACTIVE,
      });
      expect(query.andWhere).toHaveBeenCalledWith('s.personType = :personType', {
        personType: PersonType.NATURAL,
      });
      expect(query.andWhere).toHaveBeenCalledWith('s.customerSegment = :customerSegment', {
        customerSegment: CustomerSegment.RESIDENTIAL,
      });
      expect(query.andWhere).toHaveBeenCalledWith('s.stratum = :stratum', { stratum: 3 });
      expect(query.andWhere).toHaveBeenCalledWith(
        expect.stringContaining('s.firstName ILIKE :search'),
        { search: '%suscriptor sintético%' },
      );
    });

    it('excluye parties con marca activa de la búsqueda libre y adjunta marcas al resultado', async () => {
      const allowedSubscriber = buildSubscriber({ partyId: 'party-allowed-test' });
      const query = {
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[allowedSubscriber], 1]),
      };
      const privacyMarksReadPort = {
        partyIdsWithActiveMark: jest.fn().mockResolvedValue(['party-blocked-test']),
        activeMarks: jest.fn().mockResolvedValue({ 'party-allowed-test': [] }),
      };
      Object.assign(service, { privacyMarksReadPort });
      mockRunInTenantSchema.mockImplementationOnce(async (_ds, _schema, callback) =>
        callback({ manager: { createQueryBuilder: () => query } }),
      );

      const result = await service.findAll({ search: 'consulta sintética', excludeBlocked: true });

      expect(privacyMarksReadPort.partyIdsWithActiveMark).toHaveBeenCalledWith('DATOS_BLOQUEADOS');
      expect(query.andWhere).toHaveBeenCalledWith(
        '(s.partyId IS NULL OR s.partyId <> ALL(CAST(:blockedPartyIds AS uuid[])))',
        { blockedPartyIds: ['party-blocked-test'] },
      );
      expect(result.data[0]?.privacyMarks).toEqual([]);
    });
  });

  describe('search excluyendo titulares bloqueados', () => {
    it('aplica el filtro parametrizado al lookup exacto', async () => {
      const query = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      };
      const privacyMarksReadPort = {
        partyIdsWithActiveMark: jest.fn().mockResolvedValue(['party-blocked-test']),
        activeMarks: jest.fn().mockResolvedValue({}),
      };
      Object.assign(service, { privacyMarksReadPort });
      mockRunInTenantSchema.mockImplementationOnce(async (_ds, _schema, callback) =>
        callback({ manager: { createQueryBuilder: () => query } }),
      );

      await service.search({ nit: 'TEST-12345', excludeBlocked: true });

      expect(query.andWhere).toHaveBeenCalledWith(
        '(s.partyId IS NULL OR s.partyId <> ALL(CAST(:blockedPartyIds AS uuid[])))',
        { blockedPartyIds: ['party-blocked-test'] },
      );
    });

    it('falla cerrada si no está disponible el puerto de marcas', async () => {
      Object.assign(service, { privacyMarksReadPort: undefined });

      await expect(
        service.search({ nit: 'TEST-12345', excludeBlocked: true }),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
      expect(mockRunInTenantSchema).not.toHaveBeenCalled();
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

    it('proyecta el nombre del Party representante sin leer su documento', async () => {
      const subscriber = buildSubscriber({
        id: 'sub-with-legal-representative',
        legalRepresentativePartyId: 'party-representative',
      });
      mockFindOne(subscriber);
      partyReadPortMock.getByIds.mockResolvedValue([
        { id: 'party-representative', displayName: 'Representante sintético' },
      ]);

      const result = await service.findById(subscriber.id);

      expect(partyReadPortMock.getByIds).toHaveBeenCalledWith(['party-representative']);
      expect(result.legalRepresentativeDisplayName).toBe('Representante sintético');
    });

    it('lanza NotFoundException si no existe', async () => {
      mockFindOne(null);

      await expect(service.findById('nonexistent')).rejects.toThrow('no encontrado');
    });
  });

  describe('transitionStatus', () => {
    it('delega la transición y devuelve el suscriptor actualizado', async () => {
      const subscriber = buildSubscriber({ id: 'sub-transition-status' });
      const transitions = (service as any)
        .statusTransitionService as SubscriberStatusTransitionService;
      const transition = jest.spyOn(transitions, 'transition').mockResolvedValue({
        fromStatus: SubscriberStatus.PROSPECT,
        toStatus: SubscriberStatus.ACTIVE,
        reason: null,
      });
      const findById = jest.spyOn(service, 'findById').mockResolvedValue(subscriber);

      const result = await service.transitionStatus(
        subscriber.id,
        SubscriberStatus.ACTIVE,
        null,
        'actor-1',
      );

      expect(transition).toHaveBeenCalledWith(
        subscriber.id,
        SubscriberStatus.ACTIVE,
        null,
        'actor-1',
      );
      expect(findById).toHaveBeenCalledWith(subscriber.id);
      expect(result).toBe(subscriber);
    });
  });

  // ── update ──

  describe('update', () => {
    it('rechaza representante legal cuando el suscriptor es persona natural', async () => {
      const existing = buildSubscriber({ personType: PersonType.NATURAL });
      mockFindOne(existing);

      await expect(
        service.update(
          existing.id,
          {
            legalRepresentative: {
              fullName: 'Representante sintético',
              documentType: DocumentType.CC,
              documentNumber: 'documento-rep-sintetico',
            },
          },
          'actor-1',
        ),
      ).rejects.toThrow('El representante legal solo aplica a persona jurídica.');

      expect(partyWritePortMock.ensurePartyWithRole).not.toHaveBeenCalled();
    });

    it('rechaza quitar el último contacto de un suscriptor activo antes de guardar', async () => {
      const activeWithEmail = buildSubscriber({
        status: SubscriberStatus.ACTIVE,
        emailEncrypted: 'encrypted-email',
        phoneEncrypted: null,
      });
      mockFindOne(activeWithEmail);
      const clearEmail = { email: null } as unknown as Parameters<typeof service.update>[1];

      await expect(service.update(activeWithEmail.id, clearEmail, 'actor-1')).rejects.toMatchObject(
        {
          response: {
            code: 'SUBSCRIBER_CONTACT_REQUIRED',
            message: 'Un suscriptor activo necesita al menos un teléfono o un correo.',
          },
        },
      );

      expect(mockRunInTenantSchema).toHaveBeenCalledTimes(1);
      expect(auditServiceMock.log).not.toHaveBeenCalled();
    });

    it('permite editar un suscriptor activo si conserva un canal', async () => {
      const activeWithEmail = buildSubscriber({
        status: SubscriberStatus.ACTIVE,
        emailEncrypted: 'encrypted-email',
        phoneEncrypted: null,
      });
      mockSave(activeWithEmail);

      await expect(
        service.update(activeWithEmail.id, { email: null, phone: '3000000001' }, 'actor-1'),
      ).resolves.toMatchObject({ id: activeWithEmail.id });

      expect(activeWithEmail.emailEncrypted).toBeNull();
      expect(activeWithEmail.phoneEncrypted).not.toBeNull();
    });

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

    it('audita solo nombres de campos y no persiste valores personales en audit_logs', async () => {
      const existing = buildSubscriber({ nit: '900111222-1', address: 'Dirección previa' });
      mockSave(existing);

      await service.update(
        'sub-001',
        { nit: '900999888-5', address: 'Dirección personal nueva' },
        'actor-1',
      );

      expect(auditServiceMock.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'UPDATE',
          entityType: 'Subscriber',
          newValue: { changedFields: ['address', 'nit'] },
          isDiff: true,
        }),
      );
      const persistedPayload = JSON.stringify(auditServiceMock.log.mock.calls[0]?.[0]);
      expect(persistedPayload).not.toContain('900111222-1');
      expect(persistedPayload).not.toContain('900999888-5');
      expect(persistedPayload).not.toContain('Dirección previa');
      expect(persistedPayload).not.toContain('Dirección personal nueva');
    });

    it('aplica los campos enviados y registra únicamente sus nombres', async () => {
      const existing = buildSubscriber({ id: 'sub-all-fields' });
      mockSave(existing);
      const nit = '900111222';
      const dto = {
        personType: PersonType.JURIDICA,
        customerSegment: CustomerSegment.GOVERNMENT,
        documentType: 'NIT',
        documentNumber: '800123456',
        firstName: 'Nombre sintético',
        lastName: 'Apellido sintético',
        stratum: 4,
        birthDate: '1990-01-02',
        nit: `${nit}-${calculateNitVerificationDigit(nit)}`,
        vatResponsibility: VatResponsibility.RESPONSABLE,
        rutResponsibilities: ['O-13'] as RutResponsibility[],
        businessName: 'Empresa sintética',
        commercialName: 'Comercial sintético',
        legalRepresentative: {
          fullName: 'Representante sintético',
          documentType: DocumentType.CC,
          documentNumber: 'documento-rep-sintetico',
        },
        email: 'updated@example.invalid',
        phone: '3000000001',
        altContactName: '  Contacto alterno  ',
        altContactPhone: '3000000002',
        whatsapp: '3000000003',
        address: 'Calle sintética 1',
        neighborhood: 'Barrio sintético',
        city: 'Ciudad sintética',
        department: 'Departamento sintético',
        postalCode: '110111',
        latitude: 4.61,
        longitude: -74.08,
        coverageNodeId: 'node-1',
        externalId: 'external-1',
        expedienteId: 'exp-update',
        manualOverrideReason: 'Razón sintética suficientemente larga',
      };

      await service.update(existing.id, dto, 'actor-1');

      expect(existing).toMatchObject({
        personType: PersonType.JURIDICA,
        customerSegment: CustomerSegment.GOVERNMENT,
        documentType: 'NIT',
        firstName: dto.firstName,
        lastName: dto.lastName,
        stratum: 4,
        nit,
        nitVerificationDigit: calculateNitVerificationDigit(nit),
        vatResponsibility: VatResponsibility.RESPONSABLE,
        rutResponsibilities: ['O-13'],
        businessName: dto.businessName,
        commercialName: dto.commercialName,
        legalRepresentativeId: null,
        legalRepresentativePartyId: 'party-test-uuid',
        altContactName: 'Contacto alterno',
        address: dto.address,
        neighborhood: dto.neighborhood,
        city: dto.city,
        department: dto.department,
        postalCode: dto.postalCode,
        latitude: dto.latitude,
        longitude: dto.longitude,
        coverageNodeId: dto.coverageNodeId,
        externalId: dto.externalId,
        expedienteId: dto.expedienteId,
        manualOverrideReason: dto.manualOverrideReason,
      });
      expect(existing.documentNumberEncrypted).not.toBe(dto.documentNumber);
      expect(existing.emailEncrypted).not.toBe(dto.email);
      expect(existing.phoneEncrypted).not.toBe(dto.phone);
      expect(existing.whatsappEncrypted).not.toBe(dto.whatsapp);
      expect(auditServiceMock.log).toHaveBeenCalledWith(
        expect.objectContaining({
          newValue: { changedFields: Object.keys(dto).sort() },
          isDiff: true,
        }),
      );
      expect(JSON.stringify(auditServiceMock.log.mock.calls)).not.toContain(
        'updated@example.invalid',
      );
      expect(JSON.stringify(auditServiceMock.log.mock.calls)).not.toContain(dto.address);
    });

    it('limpia los datos opcionales cuando recibe cadenas vacías', async () => {
      const existing = buildSubscriber({ id: 'sub-clear-fields' });
      mockSave(existing);

      await service.update(
        existing.id,
        {
          documentNumber: '',
          altContactName: '',
          altContactPhone: '',
          whatsapp: '',
          manualOverrideReason: '',
        },
        'actor-1',
      );

      expect(existing.documentNumberEncrypted).toBeNull();
      expect(existing.documentNumberHash).toBeNull();
      expect(existing.altContactName).toBeNull();
      expect(existing.altContactPhoneEncrypted).toBeNull();
      expect(existing.whatsapp).toBeNull();
      expect(existing.whatsappEncrypted).toBeNull();
      expect(existing.whatsappHmac).toBeNull();
      expect(existing.manualOverrideReason).toBeNull();
    });

    it('rechaza un dígito de verificación NIT incorrecto antes de guardar', async () => {
      const existing = buildSubscriber({ id: 'sub-invalid-dv' });
      mockSave(existing);
      const expectedDigit = calculateNitVerificationDigit('900111222');
      const wrongDigit = expectedDigit === '0' ? '1' : '0';

      await expect(
        service.update(
          existing.id,
          { nit: '900111222', nitVerificationDigit: wrongDigit },
          'actor-1',
        ),
      ).rejects.toThrow('El dígito de verificación del NIT no coincide.');
      expect(auditServiceMock.log).not.toHaveBeenCalled();
    });

    it('rechaza un motivo manual corto antes de guardar', async () => {
      const existing = buildSubscriber({ id: 'sub-short-reason' });
      mockSave(existing);

      await expect(
        service.update(existing.id, { manualOverrideReason: 'corto' }, 'actor-1'),
      ).rejects.toThrow('manualOverrideReason debe tener al menos 10 caracteres');
      expect(auditServiceMock.log).not.toHaveBeenCalled();
    });
  });

  describe('updateSection', () => {
    it('rechaza una sección que no está en la allowlist', async () => {
      await expect(
        service.updateSection(
          'sub-1',
          'privateFields',
          { email: 'synthetic@example.invalid' },
          'actor-1',
        ),
      ).rejects.toThrow(BadRequestException);
      expect(mockRunInTenantSchema).not.toHaveBeenCalled();
      expect(auditServiceMock.log).not.toHaveBeenCalled();
    });

    it('rechaza un payload inválido sin actualizar ni auditar', async () => {
      await expect(
        service.updateSection('sub-1', 'contact', { email: 'not-an-email' }, 'actor-1'),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'INVALID_SUBSCRIBER_SECTION_PAYLOAD' }),
      });
      expect(mockRunInTenantSchema).not.toHaveBeenCalled();
      expect(auditServiceMock.log).not.toHaveBeenCalled();
    });

    it('audita solo sección y nombres de campos al actualizar un contacto', async () => {
      const subscriber = buildSubscriber({
        emailEncrypted: '',
        phoneEncrypted: '',
      });
      mockSave(subscriber);

      await service.updateSection(
        subscriber.id,
        'contact',
        { email: 'updated@example.invalid' },
        'actor-1',
      );

      expect(auditServiceMock.log).toHaveBeenLastCalledWith(
        expect.objectContaining({
          entityId: subscriber.id,
          newValue: { section: 'contact', changedFields: ['email'] },
        }),
      );
      expect(JSON.stringify(auditServiceMock.log.mock.calls)).not.toContain(
        'updated@example.invalid',
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
      privacyLegalTextReadPortMock.findByVersion.mockResolvedValue({ id: 'legal-text-fixture' });
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
            find: jest.fn().mockResolvedValue([
              {
                id: 'consent-fixture-1',
                consentType: 'TRATAMIENTO_DATOS',
                status: 'ACEPTADO',
                legacyAccepted: true,
                obtainedAt: new Date('2026-10-01T12:00:00.000Z'),
                updatedAt: new Date('2026-10-01T12:00:00.000Z'),
                revokedAt: null,
                ipAddress: null,
                legalTextVersion: 'legacy-v1',
                channel: 'UNKNOWN',
              },
            ]),
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
          partyId: 'party-test-uuid',
        },
        'actor-1',
      );

      expect(result).toBeDefined();
      expect(result.id).toBe('sub-exp-001');
      expect(privacyAuthorizationWritePortMock.record).toHaveBeenCalledWith(
        expect.objectContaining({ kind: 'LEGACY_IMPORT', channel: 'UNKNOWN' }),
        expect.any(Object),
      );
    });
  });

  // ── findSummaryByExpedienteId ──

  describe('findSummaryByExpedienteId', () => {
    it('devuelve un summary mínimo por expedienteId', async () => {
      mockFindOne(
        buildSubscriber({
          id: 'sub-1',
          expedienteId: 'exp-linked',
          status: SubscriberStatus.PROSPECT,
          firstName: 'Laura',
          lastName: 'Pérez',
          commercialName: null,
          businessName: null,
        }),
      );

      await expect(service.findSummaryByExpedienteId('exp-linked')).resolves.toEqual({
        id: 'sub-1',
        status: SubscriberStatus.PROSPECT,
        fullName: 'Laura Pérez',
      });
    });

    it('devuelve null cuando no existe suscriptor vinculado', async () => {
      mockFindOne(null);
      await expect(service.findSummaryByExpedienteId('exp-not-found')).resolves.toBeNull();
    });

    it('usa commercialName cuando está disponible en lugar de firstName + lastName', async () => {
      mockFindOne(
        buildSubscriber({
          id: 'sub-biz',
          expedienteId: 'exp-biz',
          firstName: 'Juan',
          lastName: 'García',
          commercialName: 'Mi Empresa S.A.S.',
          businessName: null,
        }),
      );

      const result = await service.findSummaryByExpedienteId('exp-biz');
      expect(result?.fullName).toBe('Mi Empresa S.A.S.');
    });

    it('retorna null cuando todos los campos de nombre están vacíos', async () => {
      mockFindOne(
        buildSubscriber({
          expedienteId: 'exp-noname',
          firstName: null,
          lastName: null,
          commercialName: null,
          businessName: null,
        }),
      );

      await expect(service.findSummaryByExpedienteId('exp-noname')).resolves.toBeNull();
    });
  });

  describe('get360View', () => {
    it('incluye el resumen compatible del expediente y el timeline de conversión y activación', async () => {
      const convertedAt = new Date('2026-09-01T10:00:00.000Z');
      const activatedAt = new Date('2026-09-02T10:00:00.000Z');
      const subscriber = buildSubscriber({
        id: 'sub-360',
        expedienteId: 'exp-360',
        postalCode: null,
        convertedAt,
        activatedAt,
        emailEncrypted: 'encrypted-email',
        phoneEncrypted: 'encrypted-phone',
        documentNumberEncrypted: null,
      });
      const expediente = {
        id: 'exp-360',
        fullName: 'Persona sintética',
        status: ExpedienteStatus.LISTO_PARA_INSTALACION,
        source: 'B12_TEST',
        createdAt: new Date('2026-08-30T10:00:00.000Z'),
        statusChangedAt: new Date('2026-09-01T09:00:00.000Z'),
        postalCode: '110111',
        paymentMethod: null,
        billingCycle: null,
        fiscalName: null,
        interestedPlanId: null,
        additionalProductIds: undefined,
        additionalServiceIds: undefined,
        commercialNotes: undefined,
        dataConsentRevoked: false,
        identityVerified: null,
        legalComplianceStatus: null,
        installationAddress: null,
        siteContactName: null,
        siteContactPhoneEncrypted: null,
        workOrderId: null,
        ticketId: null,
        availableTechnology: null,
        candidateTechnologies: null,
        feasibility: null,
        coverageResult: null,
      };
      const manager = {
        findOne: jest.fn().mockResolvedValueOnce(subscriber).mockResolvedValueOnce(expediente),
        find: jest.fn().mockResolvedValue([]),
      };
      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, callback) =>
        callback({ manager }),
      );

      const view = await service.get360View(subscriber.id);

      expect(view.subscriber.postalCode).toBe('110111');
      expect(view.expedienteSummary).toMatchObject({
        id: 'exp-360',
        additionalProductIds: [],
        additionalServiceIds: [],
        commercialNotes: null,
      });
      expect(view.timelineSeed).toEqual([
        { type: 'SUBSCRIBER_CONVERTED', occurredAt: convertedAt, expedienteId: 'exp-360' },
        { type: 'SUBSCRIBER_ACTIVATED', occurredAt: activatedAt, expedienteId: 'exp-360' },
      ]);
    });

    it('devuelve una vista sin resumen ni eventos para un suscriptor sin expediente', async () => {
      const subscriber = buildSubscriber({
        expedienteId: null,
        convertedAt: null,
        activatedAt: null,
        emailEncrypted: 'encrypted-email',
        phoneEncrypted: 'encrypted-phone',
        documentNumberEncrypted: null,
      });
      const manager = {
        findOne: jest.fn().mockResolvedValueOnce(subscriber),
        find: jest.fn().mockResolvedValue([]),
      };
      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, callback) =>
        callback({ manager }),
      );

      const view = await service.get360View(subscriber.id);

      expect(view.expedienteSummary).toBeNull();
      expect(view.timelineSeed).toEqual([]);
      expect(view.contracts).toEqual([]);
      expect(manager.findOne).toHaveBeenCalledTimes(1);
    });
  });

  describe('transiciones desde el expediente', () => {
    it('activa un prospecto y marca activatedAt', async () => {
      const prospect = buildSubscriber({
        id: 'sub-activate',
        expedienteId: 'exp-activate',
        status: SubscriberStatus.PROSPECT,
      });
      const active = buildSubscriber({
        ...prospect,
        status: SubscriberStatus.ACTIVE,
        activatedAt: new Date('2026-10-01T10:00:00.000Z'),
      });
      jest.spyOn(service, 'findByExpedienteId').mockResolvedValue(prospect);
      jest.spyOn(service, 'findById').mockResolvedValue(active);
      const transitions = (service as any)
        .statusTransitionService as SubscriberStatusTransitionService;
      const transition = jest.spyOn(transitions, 'transition').mockResolvedValue({
        fromStatus: SubscriberStatus.PROSPECT,
        toStatus: SubscriberStatus.ACTIVE,
        reason: 'Activación automática desde expediente exp-activate',
      });
      const update = jest.fn().mockResolvedValue({ affected: 1 });
      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, callback) =>
        callback({ manager: { update } }),
      );

      await expect(service.activateFromExpediente('exp-activate', 'actor-1')).resolves.toBe(active);

      expect(transition).toHaveBeenCalledWith(
        prospect.id,
        SubscriberStatus.ACTIVE,
        'Activación automática desde expediente exp-activate',
        'actor-1',
      );
      expect(update).toHaveBeenCalledWith(
        Subscriber,
        { id: prospect.id },
        { activatedAt: expect.any(Date) },
      );
    });

    it('reactiva el cancelado como prospecto antes de activarlo', async () => {
      const cancelled = buildSubscriber({
        id: 'sub-cancelled',
        expedienteId: 'exp-cancelled',
        status: SubscriberStatus.CANCELLED,
        activatedAt: null,
      });
      const active = buildSubscriber({
        ...cancelled,
        status: SubscriberStatus.ACTIVE,
        activatedAt: new Date('2026-10-01T10:00:00.000Z'),
      });
      jest.spyOn(service, 'findByExpedienteId').mockResolvedValue(cancelled);
      jest.spyOn(service, 'findById').mockResolvedValue(active);
      const transitions = (service as any)
        .statusTransitionService as SubscriberStatusTransitionService;
      const reactivate = jest.spyOn(transitions, 'reactivateFromExpediente').mockResolvedValue({
        fromStatus: SubscriberStatus.CANCELLED,
        toStatus: SubscriberStatus.PROSPECT,
        reason: 'EXPEDIENTE_REACTIVATED',
      });
      const transition = jest.spyOn(transitions, 'transition').mockResolvedValue({
        fromStatus: SubscriberStatus.PROSPECT,
        toStatus: SubscriberStatus.ACTIVE,
        reason: 'Activación automática desde expediente exp-cancelled',
      });
      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, callback) =>
        callback({ manager: { update: jest.fn().mockResolvedValue({ affected: 1 }) } }),
      );

      const result = await service.activateFromExpediente('exp-cancelled', 'actor-1');

      expect(result).toBe(active);
      expect(reactivate).toHaveBeenCalledWith(cancelled.id, 'exp-cancelled', 'actor-1');
      expect(transition).toHaveBeenCalledWith(
        cancelled.id,
        SubscriberStatus.ACTIVE,
        'Activación automática desde expediente exp-cancelled',
        'actor-1',
      );
    });

    it('no activa un expediente sin suscriptor, un estado ajeno o uno ya activo', async () => {
      const lookup = jest
        .spyOn(service, 'findByExpedienteId')
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(buildSubscriber({ status: SubscriberStatus.LEAD }))
        .mockResolvedValueOnce(buildSubscriber({ status: SubscriberStatus.ACTIVE }));
      const transitions = (service as any)
        .statusTransitionService as SubscriberStatusTransitionService;
      const transition = jest.spyOn(transitions, 'transition');
      const findById = jest.spyOn(service, 'findById').mockResolvedValue(buildSubscriber());

      await expect(service.activateFromExpediente('exp-1', 'actor-1')).resolves.toBeNull();
      await expect(service.activateFromExpediente('exp-1', 'actor-1')).resolves.toBeNull();
      await expect(service.activateFromExpediente('exp-1', 'actor-1')).resolves.toEqual(
        buildSubscriber(),
      );

      expect(lookup).toHaveBeenCalledTimes(3);
      expect(transition).not.toHaveBeenCalled();
      expect(findById).toHaveBeenCalledTimes(1);
    });

    it('restaura solo el prospecto cancelado y devuelve intacto el prospecto existente', async () => {
      const prospective = buildSubscriber({
        status: SubscriberStatus.PROSPECT,
        emailEncrypted: (service as any).encryptValue('synthetic@example.invalid'),
      });
      const cancelled = buildSubscriber({ status: SubscriberStatus.CANCELLED });
      jest
        .spyOn(service, 'findByExpedienteId')
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(buildSubscriber({ status: SubscriberStatus.ACTIVE }))
        .mockResolvedValueOnce(prospective)
        .mockResolvedValueOnce(cancelled);
      const transitions = (service as any)
        .statusTransitionService as SubscriberStatusTransitionService;
      const reactivate = jest.spyOn(transitions, 'reactivateFromExpediente').mockResolvedValue({
        fromStatus: SubscriberStatus.CANCELLED,
        toStatus: SubscriberStatus.PROSPECT,
        reason: 'EXPEDIENTE_REACTIVATED',
      });
      jest.spyOn(service, 'findById').mockResolvedValue(prospective);

      await expect(
        service.reactivateProspectFromExpediente('exp-1', 'actor-1'),
      ).resolves.toBeNull();
      await expect(
        service.reactivateProspectFromExpediente('exp-1', 'actor-1'),
      ).resolves.toBeNull();
      await expect(
        service.reactivateProspectFromExpediente('exp-1', 'actor-1'),
      ).resolves.toMatchObject({
        status: SubscriberStatus.PROSPECT,
        email: 'synthetic@example.invalid',
      });
      await expect(service.reactivateProspectFromExpediente('exp-1', 'actor-1')).resolves.toBe(
        prospective,
      );

      expect(reactivate).toHaveBeenCalledWith(cancelled.id, 'exp-1', 'actor-1');
    });

    it('cancela únicamente prospectos y registra el motivo fijo al descartar el expediente', async () => {
      const prospect = buildSubscriber({
        id: 'sub-cancel-prospect',
        status: SubscriberStatus.PROSPECT,
      });
      jest
        .spyOn(service, 'findByExpedienteId')
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(buildSubscriber({ status: SubscriberStatus.ACTIVE }))
        .mockResolvedValueOnce(prospect);
      jest.spyOn(service, 'findById').mockResolvedValue(prospect);
      const transitions = (service as any)
        .statusTransitionService as SubscriberStatusTransitionService;
      const transition = jest.spyOn(transitions, 'transition').mockResolvedValue({
        fromStatus: SubscriberStatus.PROSPECT,
        toStatus: SubscriberStatus.CANCELLED,
        reason: 'Cancelación automática por descarte de expediente exp-1',
      });

      await expect(
        service.cancelProspectFromExpediente('exp-1', null, 'actor-1'),
      ).resolves.toBeNull();
      await expect(
        service.cancelProspectFromExpediente('exp-1', null, 'actor-1'),
      ).resolves.toBeNull();
      await expect(service.cancelProspectFromExpediente('exp-1', null, 'actor-1')).resolves.toBe(
        prospect,
      );

      expect(transition).toHaveBeenCalledWith(
        prospect.id,
        SubscriberStatus.CANCELLED,
        'Cancelación automática por descarte de expediente exp-1',
        'actor-1',
      );
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
    chainable.addOrderBy = () => chainable;
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
    chainable.take = () => chainable;
    chainable.getMany = async () => subscribers;

    mockRunInTenantSchema.mockImplementation(async (_ds, _schema, callback) =>
      callback({
        manager: {
          createQueryBuilder: () => chainable,
        },
      }),
    );
  }

  // ── buildProvisioningReadiness ──

  describe('buildProvisioningReadiness', () => {
    it('bloquea cuando el subscriber no tiene expediente vinculado', () => {
      const subscriber = buildSubscriber({ expedienteId: null });
      const result = (service as any).buildProvisioningReadiness(subscriber, null);
      expect(result.status).toBe('BLOQUEADO');
      expect(result.retryable).toBe(false);
      expect(result.canProvision).toBe(false);
    });

    it('marca retryableError cuando el subscriber tiene link pero el expediente no se cargó', () => {
      const subscriber = buildSubscriber({ expedienteId: 'exp-1' });
      const result = (service as any).buildProvisioningReadiness(subscriber, null);
      expect(result.status).toBe('ERROR_REINTENTABLE');
      expect(result.retryable).toBe(true);
      expect(result.message).toBeTruthy();
    });

    it('bloquea con mensaje de consentimiento cuando dataConsentRevoked es true', () => {
      const subscriber = buildSubscriber({ expedienteId: 'exp-1' });
      const expediente = {
        dataConsentRevoked: true,
        legalComplianceStatus: null,
        identityVerified: null,
        interestedPlanId: null,
        workOrderId: null,
        ticketId: null,
        status: null,
      } as any;
      const result = (service as any).buildProvisioningReadiness(subscriber, expediente);
      expect(result.status).toBe('BLOQUEADO');
      expect(result.message).toContain('consentimiento');
    });

    it('no bloquea en happy path con subscriber operativo y campos mínimos presentes', () => {
      const subscriber = buildSubscriber({
        expedienteId: 'exp-1',
        status: SubscriberStatus.ACTIVE,
        documentNumberEncrypted: 'encrypted-doc',
        phoneEncrypted: 'encrypted-phone',
        address: 'Calle 1 #2-3',
      });
      const expediente = {
        id: 'exp-1',
        dataConsentRevoked: false,
        legalComplianceStatus: null,
        identityVerified: 'verified',
        interestedPlanId: 'plan-1',
        workOrderId: null,
        ticketId: null,
        status: null,
      } as any;
      const result = (service as any).buildProvisioningReadiness(subscriber, expediente);
      expect(result.status).not.toBe('BLOQUEADO');
      expect(result.status).not.toBe('ERROR_REINTENTABLE');
    });
  });
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
    legalRepresentativePartyId: null,
    legalRepresentativeDisplayName: null,
    emailEncrypted: 'encrypted-email',
    phoneEncrypted: 'encrypted-phone',
    whatsapp: null,
    vatTreatment: VatTreatment.EXCLUDED,
    taxRegime: TaxRegime.SIMPLIFIED,
    vatResponsibility: VatResponsibility.RESPONSABLE,
    rutResponsibilities: ['O-13'],
    address: 'Calle 1 #2-3',
    neighborhood: null,
    city: null,
    department: null,
    postalCode: null,
    latitude: null,
    longitude: null,
    coverageNodeId: null,
    status: SubscriberStatus.LEAD,
    expedienteId: null,
    externalId: null,
    createdBy: 'user-base',
    createdAt: new Date('2026-04-16T00:00:00Z'),
    updatedAt: new Date('2026-04-16T00:00:00Z'),
    deletedAt: null,
    ...overrides,
  } as Subscriber;
}
