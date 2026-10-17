import { BadRequestException, UnprocessableEntityException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import {
  AuditAction,
  SubscriberStatus,
  PersonType,
  CustomerSegment,
  DocumentType,
  VatResponsibility,
} from '@iwana/shared';
import { AuditService } from '../../../audit/audit.service';
import { SubscriberStatusTransitionService } from '../subscriber-status-transition.service';
import { Subscriber } from '../entities/subscriber.entity';
import { SubscriberFiscalCompletenessService } from '../subscriber-fiscal-completeness.service';

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
  let auditService: { log: jest.Mock };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockTenantContextGetOrThrow.mockReturnValue({ schemaName: 'tenant_test' });
    auditService = { log: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SubscriberStatusTransitionService,
        SubscriberFiscalCompletenessService,
        { provide: DataSource, useValue: {} },
        { provide: AuditService, useValue: auditService },
      ],
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

    it('falla cerrado para un estado sin definición en la máquina', () => {
      expect(service.canTransition('UNKNOWN' as SubscriberStatus, SubscriberStatus.ACTIVE)).toBe(
        false,
      );
    });
  });

  // ── validateTransitionRequirements ──

  describe('validateTransitionRequirements', () => {
    it('LEAD → PROSPECT: requiere documento, nombre y un contacto', () => {
      const subscriber = buildSubscriber({
        documentType: null,
        documentNumberEncrypted: null,
        firstName: null,
        lastName: null,
        emailEncrypted: null,
        phoneEncrypted: null,
      });

      const errors = service.validateTransitionRequirements(subscriber, SubscriberStatus.PROSPECT);
      expect(errors).toHaveLength(5);
      expect(errors).toContain('Campo obligatorio faltante: documentType');
      expect(errors).toContain('Campo obligatorio faltante: documentNumberEncrypted');
      expect(errors).toContain('Campo obligatorio faltante: firstName');
      expect(errors).toContain('Campo obligatorio faltante: lastName');
      expect(errors).toContain('Debe registrar al menos un teléfono o un correo');
      expect(errors).not.toContain('Campo obligatorio faltante: emailEncrypted');
      expect(errors).not.toContain('Campo obligatorio faltante: phoneEncrypted');
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
      expect(auditService.log).not.toHaveBeenCalled();
    });

    it('lanza BadRequestException si la transición no es permitida', async () => {
      const subscriber = buildSubscriber({ status: SubscriberStatus.LEAD });
      mockSubscriber(subscriber);

      await expect(
        service.transition('sub-1', SubscriberStatus.ACTIVE, null, 'actor-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('lanza 422 con los campos faltantes antes de persistir PROSPECT → ACTIVE', async () => {
      const subscriber = buildSubscriber({
        status: SubscriberStatus.PROSPECT,
        vatResponsibility: null,
        rutResponsibilities: [],
      });
      mockSubscriber(subscriber);

      await expect(
        service.transition('sub-1', SubscriberStatus.ACTIVE, null, 'actor-1'),
      ).rejects.toMatchObject({
        status: 422,
        response: {
          code: 'SUBSCRIBER_FISCAL_DATA_INCOMPLETE',
          missing: ['VAT_RESPONSIBILITY', 'RUT_RESPONSIBILITIES'],
        },
      });
      expect(auditService.log).not.toHaveBeenCalled();
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
      expect(auditService.log).toHaveBeenCalledWith({
        action: AuditAction.UPDATE,
        entityType: 'Subscriber',
        entityId: 'sub-1',
        userId: 'actor-1',
        newValue: {
          fromStatus: SubscriberStatus.ACTIVE,
          toStatus: SubscriberStatus.SUSPENDED,
          reason: 'Mora en pago',
        },
      });
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

    it('permite PROSPECT → ACTIVE sin motivo y conserva un audit diff sin PII', async () => {
      const subscriber = buildSubscriber({ status: SubscriberStatus.PROSPECT });
      mockSubscriber(subscriber);

      await expect(
        service.transition(subscriber.id, SubscriberStatus.ACTIVE, null, 'actor-1'),
      ).resolves.toEqual({
        fromStatus: SubscriberStatus.PROSPECT,
        toStatus: SubscriberStatus.ACTIVE,
        reason: null,
      });
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          entityId: subscriber.id,
          newValue: {
            fromStatus: SubscriberStatus.PROSPECT,
            toStatus: SubscriberStatus.ACTIVE,
            reason: null,
          },
        }),
      );
    });

    it.each([SubscriberStatus.PROSPECT, SubscriberStatus.SUSPENDED])(
      'rechaza %s → ACTIVE si faltan ambos contactos',
      async (status) => {
        const subscriber = buildSubscriber({
          status,
          emailEncrypted: null,
          phoneEncrypted: null,
        });
        mockSubscriber(subscriber);

        await expect(
          service.transition(subscriber.id, SubscriberStatus.ACTIVE, 'motivo sintético', 'actor-1'),
        ).rejects.toMatchObject({
          constructor: UnprocessableEntityException,
          response: {
            code: 'SUBSCRIBER_CONTACT_REQUIRED',
            message:
              'Para activar el servicio, registra al menos un teléfono o un correo del suscriptor.',
          },
        });
        expect(auditService.log).not.toHaveBeenCalled();
      },
    );

    it('permite activar con solo un canal cifrado', async () => {
      const subscriber = buildSubscriber({
        status: SubscriberStatus.PROSPECT,
        emailEncrypted: null,
        phoneEncrypted: 'encrypted-phone',
      });
      mockSubscriber(subscriber);

      await expect(
        service.transition(subscriber.id, SubscriberStatus.ACTIVE, null, 'actor-1'),
      ).resolves.toMatchObject({ toStatus: SubscriberStatus.ACTIVE });
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

  describe('reactivateFromExpediente', () => {
    it('rechaza si el suscriptor no existe o pertenece a otro expediente', async () => {
      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, callback) =>
        callback({ manager: { findOne: async () => null } }),
      );

      await expect(
        service.reactivateFromExpediente('sub-missing', 'exp-1', 'actor-1'),
      ).rejects.toThrow('no pertenece al expediente');

      const otherExpediente = buildSubscriber({ expedienteId: 'exp-2' });
      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, callback) =>
        callback({ manager: { findOne: async () => otherExpediente } }),
      );
      await expect(
        service.reactivateFromExpediente(otherExpediente.id, 'exp-1', 'actor-1'),
      ).rejects.toThrow('no pertenece al expediente');
    });

    it('falla cerrado si el subscriber ya tuvo activación', async () => {
      const subscriber = buildSubscriber({
        expedienteId: 'exp-1',
        status: SubscriberStatus.CANCELLED,
        activatedAt: new Date('2026-09-01T10:00:00.000Z'),
      });
      mockSubscriber(subscriber);

      await expect(
        service.reactivateFromExpediente(subscriber.id, 'exp-1', 'actor-1'),
      ).rejects.toThrow('previamente activado');
    });

    it('devuelve sin mutación el prospecto que ya fue restaurado', async () => {
      const subscriber = buildSubscriber({
        expedienteId: 'exp-1',
        status: SubscriberStatus.PROSPECT,
        activatedAt: null,
      });
      mockSubscriber(subscriber);

      await expect(
        service.reactivateFromExpediente(subscriber.id, 'exp-1', 'actor-1'),
      ).resolves.toEqual({
        fromStatus: SubscriberStatus.PROSPECT,
        toStatus: SubscriberStatus.PROSPECT,
        reason: 'EXPEDIENTE_REACTIVATED',
      });
      expect(auditService.log).not.toHaveBeenCalled();
    });

    it('rechaza estados distintos de CANCELLED cuando no es un prospecto ya restaurado', async () => {
      const subscriber = buildSubscriber({
        expedienteId: 'exp-1',
        status: SubscriberStatus.ACTIVE,
        activatedAt: null,
      });
      mockSubscriber(subscriber);

      await expect(
        service.reactivateFromExpediente(subscriber.id, 'exp-1', 'actor-1'),
      ).rejects.toThrow('Solo un suscriptor cancelado');
    });

    it('restaura el cancelado con guarda atómica y registra la transición sin PII', async () => {
      const subscriber = buildSubscriber({
        expedienteId: 'exp-1',
        status: SubscriberStatus.CANCELLED,
        activatedAt: null,
      });
      const update = jest.fn().mockResolvedValue({ affected: 1 });
      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, callback) =>
        callback({ manager: { findOne: async () => subscriber, update } }),
      );

      await expect(
        service.reactivateFromExpediente(subscriber.id, 'exp-1', 'actor-1'),
      ).resolves.toEqual({
        fromStatus: SubscriberStatus.CANCELLED,
        toStatus: SubscriberStatus.PROSPECT,
        reason: 'EXPEDIENTE_REACTIVATED',
      });
      expect(update).toHaveBeenCalledWith(
        Subscriber,
        {
          id: subscriber.id,
          expedienteId: 'exp-1',
          status: SubscriberStatus.CANCELLED,
          activatedAt: expect.anything(),
        },
        { status: SubscriberStatus.PROSPECT },
      );
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          entityId: subscriber.id,
          newValue: expect.objectContaining({
            fromStatus: SubscriberStatus.CANCELLED,
            toStatus: SubscriberStatus.PROSPECT,
            reason: 'EXPEDIENTE_REACTIVATED',
            expedienteId: 'exp-1',
          }),
        }),
      );
    });

    it('tolera una carrera si otro proceso ya lo restauró a PROSPECT', async () => {
      const cancelled = buildSubscriber({
        expedienteId: 'exp-1',
        status: SubscriberStatus.CANCELLED,
        activatedAt: null,
      });
      const prospect = buildSubscriber({
        expedienteId: 'exp-1',
        status: SubscriberStatus.PROSPECT,
        activatedAt: null,
      });
      const findOne = jest.fn().mockResolvedValueOnce(cancelled).mockResolvedValueOnce(prospect);
      const update = jest.fn().mockResolvedValue({ affected: 0 });
      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, callback) =>
        callback({ manager: { findOne, update } }),
      );

      await expect(
        service.reactivateFromExpediente(cancelled.id, 'exp-1', 'actor-1'),
      ).resolves.toMatchObject({ toStatus: SubscriberStatus.PROSPECT });
      expect(auditService.log).not.toHaveBeenCalled();
    });

    it('rechaza si la guarda atómica falla y el estado sigue cancelado', async () => {
      const subscriber = buildSubscriber({
        expedienteId: 'exp-1',
        status: SubscriberStatus.CANCELLED,
        activatedAt: null,
      });
      const findOne = jest.fn().mockResolvedValue(subscriber);
      const update = jest.fn().mockResolvedValue({ affected: 0 });
      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, callback) =>
        callback({ manager: { findOne, update } }),
      );

      await expect(
        service.reactivateFromExpediente(subscriber.id, 'exp-1', 'actor-1'),
      ).rejects.toThrow('No se pudo restaurar');
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

    it('retorna array vacío para un estado sin definición', () => {
      expect(service.getAllowedTransitions('UNKNOWN' as SubscriberStatus)).toEqual([]);
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
    vatResponsibility: VatResponsibility.RESPONSABLE,
    rutResponsibilities: ['O-13'],
    legalRepresentativePartyId: null,
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
