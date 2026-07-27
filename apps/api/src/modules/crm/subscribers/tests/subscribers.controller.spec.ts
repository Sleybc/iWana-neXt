import { Test, TestingModule } from '@nestjs/testing';
import {
  PersonType,
  CustomerSegment,
  SubscriberStatus,
  VatTreatment,
  TaxRegime,
  DocumentType,
  UserRole,
} from '@iwana/shared';
import { SubscribersController } from '../subscribers.controller';
import { SubscribersService } from '../subscribers.service';
import { AuditService } from '../../../audit/audit.service';
import { Subscriber } from '../entities/subscriber.entity';

/**
 * Tests unitarios del SubscribersController.
 * Se mockea SubscribersService para probar la lógica del controlador
 * (sanitización de respuesta, delegación al servicio, manejo de parámetros).
 */
describe('SubscribersController', () => {
  let controller: SubscribersController;

  // Mock del servicio con todos los métodos necesarios
  const subscribersServiceMock = {
    create: jest.fn(),
    findAll: jest.fn(),
    findById: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    transitionStatus: jest.fn(),
    search: jest.fn(),
    createFromExpediente: jest.fn(),
    updateSection: jest.fn(),
    get360View: jest.fn(),
  };

  // Usuario autenticado de prueba
  const mockUser = {
    sub: 'user-001',
    email: 'hash',
    role: 'ADMIN',
    tenantId: 'tenant-001',
    schemaName: 'tenant_test',
    jti: 'jti-001',
    type: 'tenant' as const,
  };

  // Suscriptor de prueba con campos descifrados
  const mockSubscriber = {
    id: 'sub-001',
    tenantId: 'tenant-001',
    userId: null,
    personType: PersonType.NATURAL,
    customerSegment: CustomerSegment.RESIDENTIAL,
    documentType: DocumentType.CC,
    documentNumberEncrypted: 'enc:doc',
    firstName: 'Juan',
    lastName: 'Pérez',
    stratum: 3,
    birthDate: null,
    nit: null,
    nitVerificationDigit: null,
    businessName: null,
    commercialName: null,
    legalRepresentativeId: null,
    emailEncrypted: 'enc:email',
    phoneEncrypted: 'enc:phone',
    whatsapp: null,
    vatTreatment: VatTreatment.EXCLUDED,
    taxRegime: TaxRegime.SIMPLIFIED,
    address: 'Calle 1 #2-3',
    neighborhood: null,
    city: 'Bogotá',
    department: 'Cundinamarca',
    postalCode: null,
    latitude: null,
    longitude: null,
    coverageNodeId: null,
    expedienteId: 'exp-001',
    convertedAt: new Date('2026-04-16T00:00:00Z'),
    activatedAt: null,
    manualOverrideReason: null,
    status: SubscriberStatus.LEAD,
    externalId: null,
    createdBy: 'user-001',
    createdAt: new Date('2026-04-16T00:00:00Z'),
    updatedAt: new Date('2026-04-16T00:00:00Z'),
    deletedAt: null,
    // Campos descifrados (agregados por decryptSubscriberFields)
    documentNumber: '12345678',
    email: 'juan@example.com',
    phone: '3001234567',
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SubscribersController],
      providers: [
        { provide: SubscribersService, useValue: subscribersServiceMock },
        { provide: AuditService, useValue: { log: jest.fn().mockResolvedValue(undefined) } },
      ],
    }).compile();

    controller = module.get<SubscribersController>(SubscribersController);
  });

  it('permite rol NOC en el listado de suscriptores para uso operativo', () => {
    const roles = Reflect.getMetadata('roles', controller.findAll as object) as
      | UserRole[]
      | undefined;
    expect(roles).toEqual(
      expect.arrayContaining([
        UserRole.ADMIN,
        UserRole.NOC,
        UserRole.SALES,
        UserRole.SUPPORT,
        UserRole.ACCOUNTANT,
      ]),
    );
  });

  it('permite rol NOC en la búsqueda determinista de suscriptores', () => {
    const roles = Reflect.getMetadata('roles', controller.search as object) as
      | UserRole[]
      | undefined;
    expect(roles).toEqual(
      expect.arrayContaining([
        UserRole.ADMIN,
        UserRole.NOC,
        UserRole.SALES,
        UserRole.SUPPORT,
        UserRole.ACCOUNTANT,
      ]),
    );
  });

  // ── POST /crm/subscribers ──

  describe('create', () => {
    it('crea un suscriptor persona natural y delega al servicio', async () => {
      subscribersServiceMock.create.mockResolvedValue(mockSubscriber);

      const dto = {
        personType: PersonType.NATURAL,
        customerSegment: CustomerSegment.RESIDENTIAL,
        documentType: DocumentType.CC,
        documentNumber: '12345678',
        firstName: 'Juan',
        lastName: 'Pérez',
        stratum: 3,
        email: 'juan@example.com',
        phone: '3001234567',
        address: 'Calle 1 #2-3',
      };

      const result = await controller.create(dto, mockUser);

      expect(subscribersServiceMock.create).toHaveBeenCalledWith(dto, 'user-001');
      expect(result.data.id).toBe('sub-001');
      // Verificar que la respuesta sanitizada NO incluye campos cifrados internos
      expect(result.data).not.toHaveProperty('documentNumberEncrypted');
      expect(result.data).not.toHaveProperty('emailEncrypted');
      expect(result.data).not.toHaveProperty('phoneEncrypted');
      // Verificar que incluye campos descifrados
      expect(result.data.email).toBe('juan@example.com');
      expect(result.data.phone).toBe('3001234567');
      expect(result.data.documentNumber).toBe('12345678');
    });

    it('crea un suscriptor persona jurídica y delega al servicio', async () => {
      const juridicaSubscriber = {
        ...mockSubscriber,
        personType: PersonType.JURIDICA,
        customerSegment: CustomerSegment.PYME,
        nit: '900123456-7',
        businessName: 'Empresa XYZ',
        vatTreatment: VatTreatment.STANDARD,
        taxRegime: TaxRegime.COMMON,
      };

      subscribersServiceMock.create.mockResolvedValue(juridicaSubscriber);

      const dto = {
        personType: PersonType.JURIDICA,
        customerSegment: CustomerSegment.PYME,
        nit: '900123456-7',
        businessName: 'Empresa XYZ',
        email: 'contacto@empresa.co',
        phone: '6011234567',
        address: 'Av. El Dorado #50-20',
      };

      const result = await controller.create(dto, mockUser);

      expect(subscribersServiceMock.create).toHaveBeenCalledWith(dto, 'user-001');
      expect(result.data.personType).toBe(PersonType.JURIDICA);
      expect(result.data.vatTreatment).toBe(VatTreatment.STANDARD);
    });
  });

  // ── GET /crm/subscribers ──

  describe('findAll', () => {
    it('lista suscriptores con filtros y paginación', async () => {
      subscribersServiceMock.findAll.mockResolvedValue({
        data: [mockSubscriber],
        total: 1,
        meta: {
          page: 1,
          limit: 20,
          total: 1,
          totalPages: 1,
          hasMore: false,
          mode: 'page',
          nextCursor: null,
          totalIsEstimate: false,
          capabilities: { randomAccess: true, sortableFields: [] },
          sort: null,
        },
      });

      const mockUser = { sub: 'user-1', role: 'ADMIN', tenantId: 't1', schemaName: 't1' } as any;

      const result = await controller.findAll(
        mockUser,
        SubscriberStatus.LEAD,
        PersonType.NATURAL,
        CustomerSegment.RESIDENTIAL,
        3,
        'Juan',
        1,
        20,
      );

      expect(subscribersServiceMock.findAll).toHaveBeenCalledWith({
        status: SubscriberStatus.LEAD,
        personType: PersonType.NATURAL,
        customerSegment: CustomerSegment.RESIDENTIAL,
        stratum: 3,
        search: 'Juan',
        page: 1,
        limit: 20,
        sortBy: undefined,
        sortDir: undefined,
      });
      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
    });

    it('lista suscriptores sin filtros', async () => {
      subscribersServiceMock.findAll.mockResolvedValue({
        data: [mockSubscriber],
        total: 1,
        meta: {
          page: 1,
          limit: 20,
          total: 1,
          totalPages: 1,
          hasMore: false,
          mode: 'page',
          nextCursor: null,
          totalIsEstimate: false,
          capabilities: { randomAccess: true, sortableFields: [] },
          sort: null,
        },
      });

      const mockUser = { sub: 'user-1', role: 'ADMIN', tenantId: 't1', schemaName: 't1' } as any;

      const result = await controller.findAll(
        mockUser,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
      );

      expect(subscribersServiceMock.findAll).toHaveBeenCalledWith({
        status: undefined,
        personType: undefined,
        customerSegment: undefined,
        stratum: undefined,
        search: undefined,
        page: undefined,
        limit: undefined,
      });
      expect(result.data).toHaveLength(1);
    });
  });

  // ── GET /crm/subscribers/search ──

  describe('search', () => {
    it('busca suscriptor por NIT', async () => {
      subscribersServiceMock.search.mockResolvedValue([mockSubscriber]);

      const result = await controller.search('12345678', '900123456-7', undefined, undefined);

      expect(subscribersServiceMock.search).toHaveBeenCalledWith({
        documentNumber: '12345678',
        nit: '900123456-7',
        email: undefined,
        phone: undefined,
      });
      expect(result.data).toHaveLength(1);
    });

    it('busca suscriptor por email', async () => {
      subscribersServiceMock.search.mockResolvedValue([mockSubscriber]);

      const result = await controller.search(undefined, undefined, 'juan@example.com', undefined);

      expect(subscribersServiceMock.search).toHaveBeenCalledWith({
        documentNumber: undefined,
        nit: undefined,
        email: 'juan@example.com',
        phone: undefined,
      });
      expect(result.data).toHaveLength(1);
    });
  });

  // ── GET /crm/subscribers/:id ──

  describe('findById', () => {
    it('obtiene suscriptor por ID con PII descifrado', async () => {
      subscribersServiceMock.findById.mockResolvedValue(mockSubscriber);

      const result = await controller.findById('sub-001');

      expect(subscribersServiceMock.findById).toHaveBeenCalledWith('sub-001');
      expect(result.data.id).toBe('sub-001');
      expect(result.data.email).toBe('juan@example.com');
    });
  });

  // ── PATCH /crm/subscribers/:id ──

  describe('update', () => {
    it('actualiza suscriptor y recalcula IVA si cambia personType', async () => {
      const updatedSubscriber = {
        ...mockSubscriber,
        personType: PersonType.JURIDICA,
        vatTreatment: VatTreatment.STANDARD,
        taxRegime: TaxRegime.COMMON,
      };

      subscribersServiceMock.update.mockResolvedValue(updatedSubscriber);

      const dto = { personType: PersonType.JURIDICA };
      const result = await controller.update('sub-001', dto, mockUser);

      expect(subscribersServiceMock.update).toHaveBeenCalledWith('sub-001', dto, 'user-001');
      expect(result.data.personType).toBe(PersonType.JURIDICA);
      expect(result.data.vatTreatment).toBe(VatTreatment.STANDARD);
    });

    it('actualiza solo campos parciales', async () => {
      const updatedSubscriber = {
        ...mockSubscriber,
        city: 'Medellín',
      };

      subscribersServiceMock.update.mockResolvedValue(updatedSubscriber);

      const dto = { city: 'Medellín' };
      const result = await controller.update('sub-001', dto, mockUser);

      expect(subscribersServiceMock.update).toHaveBeenCalledWith('sub-001', dto, 'user-001');
      expect(result.data.city).toBe('Medellín');
    });
  });

  // ── DELETE /crm/subscribers/:id ──

  describe('remove', () => {
    it('ejecuta soft delete del suscriptor', async () => {
      subscribersServiceMock.remove.mockResolvedValue(undefined);

      const result = await controller.remove('sub-001', mockUser);

      expect(subscribersServiceMock.remove).toHaveBeenCalledWith('sub-001', 'user-001');
      expect(result.data.id).toBe('sub-001');
      expect(result.data.deleted).toBe(true);
    });
  });

  // ── PATCH /crm/subscribers/:id/status ──

  describe('transitionStatus', () => {
    it('transiciona estado del suscriptor con motivo', async () => {
      const transitionedSubscriber = {
        ...mockSubscriber,
        status: SubscriberStatus.PROSPECT,
      };

      subscribersServiceMock.transitionStatus.mockResolvedValue(transitionedSubscriber);

      const dto = {
        targetStatus: SubscriberStatus.PROSPECT,
        reason: 'Documentación completa',
      };

      const result = await controller.transitionStatus('sub-001', dto, mockUser);

      expect(subscribersServiceMock.transitionStatus).toHaveBeenCalledWith(
        'sub-001',
        SubscriberStatus.PROSPECT,
        'Documentación completa',
        'user-001',
      );
      expect(result.data.status).toBe(SubscriberStatus.PROSPECT);
    });

    it('transiciona estado sin motivo (opcional)', async () => {
      const transitionedSubscriber = {
        ...mockSubscriber,
        status: SubscriberStatus.ACTIVE,
      };

      subscribersServiceMock.transitionStatus.mockResolvedValue(transitionedSubscriber);

      const dto = {
        targetStatus: SubscriberStatus.ACTIVE,
      };

      const result = await controller.transitionStatus('sub-001', dto, mockUser);

      expect(subscribersServiceMock.transitionStatus).toHaveBeenCalledWith(
        'sub-001',
        SubscriberStatus.ACTIVE,
        null,
        'user-001',
      );
      expect(result.data.status).toBe(SubscriberStatus.ACTIVE);
    });
  });

  // ── GET /crm/subscribers/:id/360 ──

  describe('get360View', () => {
    it('retorna ficha 360° del suscriptor', async () => {
      subscribersServiceMock.get360View.mockResolvedValue({
        subscriber: mockSubscriber,
        contacts: [],
        contracts: [],
        quotes: [],
        habeasData: [],
        arcoRequests: [],
        expedienteSummary: null,
        timelineSeed: [],
      });

      const result = await controller.get360View('sub-001');

      expect(subscribersServiceMock.get360View).toHaveBeenCalledWith('sub-001');
      expect(result.data.subscriber).toBeDefined();
      expect(result.data.subscriber.id).toBe('sub-001');
      expect(result.data.contacts).toEqual([]);
      expect(result.data.contracts).toEqual([]);
      expect(result.data.quotes).toEqual([]);
      expect(result.data.habeasData).toEqual([]);
      expect(result.data.arcoRequests).toEqual([]);
    });
  });

  // ── Sanitización de respuesta ──

  describe('sanitizeResponse', () => {
    it('elimina campos cifrados internos de la respuesta', () => {
      const subscriber = {
        ...mockSubscriber,
        documentNumberEncrypted: 'iv:authTag:ciphertext',
        emailEncrypted: 'iv:authTag:ciphertext',
        phoneEncrypted: 'iv:authTag:ciphertext',
      };

      const result = (controller as any).sanitizeResponse(subscriber);

      // No debe incluir campos cifrados internos
      expect(result).not.toHaveProperty('documentNumberEncrypted');
      expect(result).not.toHaveProperty('emailEncrypted');
      expect(result).not.toHaveProperty('phoneEncrypted');

      // Debe incluir campos descifrados
      expect(result.documentNumber).toBe('12345678');
      expect(result.email).toBe('juan@example.com');
      expect(result.phone).toBe('3001234567');

      // Debe incluir campos públicos
      expect(result.id).toBe('sub-001');
      expect(result.personType).toBe(PersonType.NATURAL);
      expect(result.customerSegment).toBe(CustomerSegment.RESIDENTIAL);
      expect(result.vatTreatment).toBe(VatTreatment.EXCLUDED);
      expect(result.taxRegime).toBe(TaxRegime.SIMPLIFIED);
      expect(result.status).toBe(SubscriberStatus.LEAD);
    });

    it('incluye campos de persona jurídica cuando existen', () => {
      const juridicaSubscriber = {
        ...mockSubscriber,
        personType: PersonType.JURIDICA,
        nit: '900123456-7',
        businessName: 'Empresa XYZ',
        commercialName: 'Empresa XYZ Comercial',
        legalRepresentativeId: 'rep-001',
      };

      const result = (controller as any).sanitizeResponse(juridicaSubscriber);

      expect(result.nit).toBe('900123456-7');
      expect(result.businessName).toBe('Empresa XYZ');
      expect(result.commercialName).toBe('Empresa XYZ Comercial');
      expect(result.legalRepresentativeId).toBe('rep-001');
    });

    it('no incluye campos descifrados si no existen en el objeto', () => {
      const subscriberWithoutDecrypted = {
        ...mockSubscriber,
      };
      // Eliminar campos descifrados si no existen
      delete (subscriberWithoutDecrypted as any).documentNumber;
      delete (subscriberWithoutDecrypted as any).email;
      delete (subscriberWithoutDecrypted as any).phone;

      const result = (controller as any).sanitizeResponse(subscriberWithoutDecrypted);

      expect(result).not.toHaveProperty('documentNumber');
      expect(result).not.toHaveProperty('email');
      expect(result).not.toHaveProperty('phone');
    });
  });
});
