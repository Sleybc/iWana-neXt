import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { SubscriberStatus, PersonType, CustomerSegment, DocumentType } from '@iwana/shared';
import { SubscriberStatusTransitionService } from '../subscriber-status-transition.service';
import { Subscriber } from '../entities/subscriber.entity';

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

describe('SubscriberStatusTransitionService', () => {
  let service: SubscriberStatusTransitionService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockTenantContextGetOrThrow.mockReturnValue({ schemaName: 'tenant_test' });

    const module: TestingModule = await Test.createTestingModule({
      providers: [SubscriberStatusTransitionService, { provide: DataSource, useValue: {} }],
    }).compile();

    service = module.get<SubscriberStatusTransitionService>(SubscriberStatusTransitionService);
  });

  // ── canTransition ──

  describe('canTransition', () => {
    it('LEAD → PROSPECT: permitido', () => {
      expect(service.canTransition(SubscriberStatus.LEAD, SubscriberStatus.PROSPECT)).toBe(true);
    });

    it('LEAD → CANCELLED: permitido', () => {
      expect(service.canTransition(SubscriberStatus.LEAD, SubscriberStatus.CANCELLED)).toBe(true);
    });

    it('LEAD → ACTIVE: no permitido (salta PROSPECT)', () => {
      expect(service.canTransition(SubscriberStatus.LEAD, SubscriberStatus.ACTIVE)).toBe(false);
    });

    it('PROSPECT → ACTIVE: permitido', () => {
      expect(service.canTransition(SubscriberStatus.PROSPECT, SubscriberStatus.ACTIVE)).toBe(true);
    });

    it('PROSPECT → CANCELLED: permitido', () => {
      expect(service.canTransition(SubscriberStatus.PROSPECT, SubscriberStatus.CANCELLED)).toBe(
        true,
      );
    });

    it('PROSPECT → LEAD: no permitido (no retroceso)', () => {
      expect(service.canTransition(SubscriberStatus.PROSPECT, SubscriberStatus.LEAD)).toBe(false);
    });

    it('ACTIVE → SUSPENDED: permitido', () => {
      expect(service.canTransition(SubscriberStatus.ACTIVE, SubscriberStatus.SUSPENDED)).toBe(true);
    });

    it('ACTIVE → CANCELLED: permitido', () => {
      expect(service.canTransition(SubscriberStatus.ACTIVE, SubscriberStatus.CANCELLED)).toBe(true);
    });

    it('ACTIVE → LEAD: no permitido', () => {
      expect(service.canTransition(SubscriberStatus.ACTIVE, SubscriberStatus.LEAD)).toBe(false);
    });

    it('SUSPENDED → ACTIVE: permitido (reactivación)', () => {
      expect(service.canTransition(SubscriberStatus.SUSPENDED, SubscriberStatus.ACTIVE)).toBe(true);
    });

    it('SUSPENDED → CANCELLED: permitido', () => {
      expect(service.canTransition(SubscriberStatus.SUSPENDED, SubscriberStatus.CANCELLED)).toBe(
        true,
      );
    });

    it('SUSPENDED → PROSPECT: no permitido', () => {
      expect(service.canTransition(SubscriberStatus.SUSPENDED, SubscriberStatus.PROSPECT)).toBe(
        false,
      );
    });

    it('CANCELLED → ACTIVE: no permitido (estado terminal)', () => {
      expect(service.canTransition(SubscriberStatus.CANCELLED, SubscriberStatus.ACTIVE)).toBe(
        false,
      );
    });

    it('CANCELLED → LEAD: no permitido (estado terminal)', () => {
      expect(service.canTransition(SubscriberStatus.CANCELLED, SubscriberStatus.LEAD)).toBe(false);
    });

    it('CANCELLED → CANCELLED: no permitido (ya está cancelado)', () => {
      expect(service.canTransition(SubscriberStatus.CANCELLED, SubscriberStatus.CANCELLED)).toBe(
        false,
      );
    });
  });

  // ── validateTransitionRequirements ──

  describe('validateTransitionRequirements', () => {
    it('LEAD → PROSPECT: requiere documento, nombre y contacto', () => {
      const subscriber = buildSubscriber({
        documentType: null,
        documentNumberEncrypted: null,
        firstName: null,
        lastName: null,
        emailEncrypted: '',
        phoneEncrypted: '',
      });

      const errors = service.validateTransitionRequirements(subscriber, SubscriberStatus.PROSPECT);
      expect(errors).toHaveLength(6);
      expect(errors).toContain('Campo obligatorio faltante: documentType');
      expect(errors).toContain('Campo obligatorio faltante: documentNumberEncrypted');
      expect(errors).toContain('Campo obligatorio faltante: firstName');
      expect(errors).toContain('Campo obligatorio faltante: lastName');
      expect(errors).toContain('Campo obligatorio faltante: emailEncrypted');
      expect(errors).toContain('Campo obligatorio faltante: phoneEncrypted');
    });

    it('LEAD → PROSPECT: sin errores cuando todos los campos están presentes', () => {
      const subscriber = buildSubscriber({
        documentType: DocumentType.CC,
        documentNumberEncrypted: 'encrypted-doc',
        firstName: 'Juan',
        lastName: 'Pérez',
        emailEncrypted: 'encrypted-email',
        phoneEncrypted: 'encrypted-phone',
      });

      const errors = service.validateTransitionRequirements(subscriber, SubscriberStatus.PROSPECT);
      expect(errors).toHaveLength(0);
    });

    it('PROSPECT → ACTIVE: sin requisitos de campos', () => {
      const subscriber = buildSubscriber({ status: SubscriberStatus.PROSPECT });
      const errors = service.validateTransitionRequirements(subscriber, SubscriberStatus.ACTIVE);
      expect(errors).toHaveLength(0);
    });

    it('ACTIVE → SUSPENDED: sin requisitos de campos', () => {
      const subscriber = buildSubscriber({ status: SubscriberStatus.ACTIVE });
      const errors = service.validateTransitionRequirements(subscriber, SubscriberStatus.SUSPENDED);
      expect(errors).toHaveLength(0);
    });

    it('SUSPENDED → ACTIVE: sin requisitos de campos', () => {
      const subscriber = buildSubscriber({ status: SubscriberStatus.SUSPENDED });
      const errors = service.validateTransitionRequirements(subscriber, SubscriberStatus.ACTIVE);
      expect(errors).toHaveLength(0);
    });
  });

  // ── transition (integración con DB mock) ──

  describe('transition', () => {
    it('no-op si ya está en el estado destino', async () => {
      const subscriber = buildSubscriber({ status: SubscriberStatus.LEAD });
      mockSubscriber(subscriber);

      const result = await service.transition('sub-1', SubscriberStatus.LEAD, null, 'actor-1');

      expect(result).toEqual({
        fromStatus: SubscriberStatus.LEAD,
        toStatus: SubscriberStatus.LEAD,
        reason: null,
      });
    });

    it('lanza BadRequestException si la transición no es permitida', async () => {
      const subscriber = buildSubscriber({ status: SubscriberStatus.LEAD });
      mockSubscriber(subscriber);

      await expect(
        service.transition('sub-1', SubscriberStatus.ACTIVE, null, 'actor-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('lanza BadRequestException si SUSPENDED sin motivo', async () => {
      const subscriber = buildSubscriber({ status: SubscriberStatus.ACTIVE });
      mockSubscriber(subscriber);

      await expect(
        service.transition('sub-1', SubscriberStatus.SUSPENDED, null, 'actor-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('lanza BadRequestException si CANCELLED sin motivo', async () => {
      const subscriber = buildSubscriber({ status: SubscriberStatus.ACTIVE });
      mockSubscriber(subscriber);

      await expect(
        service.transition('sub-1', SubscriberStatus.CANCELLED, null, 'actor-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('permite ACTIVE → SUSPENDED con motivo', async () => {
      const subscriber = buildSubscriber({ status: SubscriberStatus.ACTIVE });
      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, callback) =>
        callback({
          manager: {
            findOne: async () => subscriber,
            update: async () => ({ affected: 1 }),
          },
        }),
      );

      const result = await service.transition(
        'sub-1',
        SubscriberStatus.SUSPENDED,
        'Mora en pago',
        'actor-1',
      );

      expect(result.fromStatus).toBe(SubscriberStatus.ACTIVE);
      expect(result.toStatus).toBe(SubscriberStatus.SUSPENDED);
      expect(result.reason).toBe('Mora en pago');
    });

    it('permite SUSPENDED → ACTIVE con motivo', async () => {
      const subscriber = buildSubscriber({ status: SubscriberStatus.SUSPENDED });
      // Primera llamada: findOne devuelve el subscriber SUSPENDED
      // Segunda llamada: update persiste el cambio
      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, callback) =>
        callback({
          manager: {
            findOne: async () => subscriber,
            update: async () => ({ affected: 1 }),
          },
        }),
      );

      const result = await service.transition(
        'sub-1',
        SubscriberStatus.ACTIVE,
        'Pago recibido',
        'actor-1',
      );

      expect(result.fromStatus).toBe(SubscriberStatus.SUSPENDED);
      expect(result.toStatus).toBe(SubscriberStatus.ACTIVE);
    });

    it('lanza BadRequestException si subscriber no existe', async () => {
      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, callback) =>
        callback({
          manager: {
            findOne: async () => null,
          },
        }),
      );

      await expect(
        service.transition('sub-missing', SubscriberStatus.PROSPECT, null, 'actor-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('LEAD → PROSPECT: requiere campos obligatorios', async () => {
      const subscriber = buildSubscriber({
        status: SubscriberStatus.LEAD,
        documentType: null,
        documentNumberEncrypted: null,
        firstName: null,
        lastName: null,
        emailEncrypted: '',
        phoneEncrypted: '',
      });
      mockSubscriber(subscriber);

      await expect(
        service.transition('sub-1', SubscriberStatus.PROSPECT, null, 'actor-1'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ── getAllowedTransitions ──

  describe('getAllowedTransitions', () => {
    it('retorna transiciones permitidas desde LEAD', () => {
      const transitions = service.getAllowedTransitions(SubscriberStatus.LEAD);
      expect(transitions).toEqual([SubscriberStatus.PROSPECT, SubscriberStatus.CANCELLED]);
    });

    it('retorna transiciones permitidas desde ACTIVE', () => {
      const transitions = service.getAllowedTransitions(SubscriberStatus.ACTIVE);
      expect(transitions).toEqual([SubscriberStatus.SUSPENDED, SubscriberStatus.CANCELLED]);
    });

    it('retorna array vacío desde CANCELLED', () => {
      const transitions = service.getAllowedTransitions(SubscriberStatus.CANCELLED);
      expect(transitions).toEqual([]);
    });
  });

  // ── Helpers ──

  function mockSubscriber(subscriber: Subscriber): void {
    mockRunInTenantSchema.mockImplementation(async (_ds, _schema, callback) =>
      callback({
        manager: {
          findOne: async () => subscriber,
          update: async () => ({ affected: 1 }),
        },
      }),
    );
  }
});

function buildSubscriber(overrides: Partial<Subscriber> = {}): Subscriber {
  return {
    id: 'sub-base',
    tenantId: 'ten-1',
    userId: null,
    personType: PersonType.NATURAL,
    customerSegment: CustomerSegment.RESIDENTIAL,
    documentType: DocumentType.CC,
    documentNumberEncrypted: 'encrypted-doc',
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
    vatTreatment: 'EXCLUDED',
    taxRegime: 'SIMPLIFIED',
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
