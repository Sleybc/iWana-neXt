// MOD05 Cierre de venta fase 2 · W0 · Inventario de no regresión (AI-SR-QA).
//
// Fija el listener ACTUAL de `crm.expediente.ready-for-installation`: crea (o reutiliza) el
// suscriptor PROSPECT y emite `crm.subscriber.converted`. Hoy no crea contrato.
//
// Robustez frente a A+B (contrato automático «tras el suscriptor»): se fija que el suscriptor
// se sigue creando, que la creación es idempotente por expediente y que la conversión del
// suscriptor en sí no persiste contratos. No se afirma que ningún otro listener del evento
// pueda crear un contrato: eso es justo lo que A+B añade.
import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ExpedienteStatus, SubscriberStatus } from '@iwana/shared';
import { SubscriberCreationService } from '../subscriber-creation.service';
import { SubscribersService } from '../subscribers.service';
import { AuditService } from '../../../audit/audit.service';
import { ExpedienteReadyForInstallationEvent } from '../../expedientes/events/expediente-pipeline.events';
import { ExpedienteRecord } from '../../expedientes/entities/expediente-record.entity';

const TENANT = { tenantId: 'ten-w0f2', schemaName: 'tenant_w0f2' };
const SYNTHETIC_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

const persistedEntities: unknown[] = [];
const readEntities: unknown[] = [];

jest.mock('@iwana/db', () => {
  const actual = jest.requireActual('@iwana/db') as Record<string, unknown>;
  return {
    ...actual,
    TenantContext: { getOrThrow: () => TENANT },
    runInTenantSchema: async (
      _ds: unknown,
      _schema: string,
      callback: (qr: unknown) => Promise<unknown>,
    ) =>
      callback({
        manager: {
          findOne: async (entity: unknown) => {
            readEntities.push(entity);
            return entity === ExpedienteRecord ? { ...EXPEDIENTE } : null;
          },
          query: async () => [],
          save: async (entity: unknown, value: unknown) => {
            persistedEntities.push(entity);
            return value;
          },
          insert: async (entity: unknown) => {
            persistedEntities.push(entity);
            return {};
          },
        },
      }),
  };
});

const EXPEDIENTE = {
  id: 'exp-w0f2',
  tenantId: TENANT.tenantId,
  status: ExpedienteStatus.LISTO_PARA_INSTALACION,
  personType: 'PERSONA_NATURAL',
  firstName: 'Nombre',
  lastName: 'Sintético',
  documentType: 'CC',
  documentNumberEncrypted: null,
  stratum: 3,
  companyName: null,
  fiscalDocument: null,
  emailPrimaryEncrypted: null,
  emailSecondary: 'titular@example.test',
  phonePrimaryEncrypted: null,
  phoneSecondaryEncrypted: null,
  address: 'Dirección sintética 1',
  municipality: 'Ciudad sintética',
  department: 'Departamento sintético',
  postalCode: null,
  neighborhood: null,
  latitude: null,
  longitude: null,
  interestedPlanId: 'plan-w0f2',
};

describe('W0 F2 listener ready-for-installation — creación del suscriptor', () => {
  let service: SubscriberCreationService;
  const subscribers = {
    findByExpedienteId: jest.fn(),
    createFromExpediente: jest.fn(),
    reactivateProspectFromExpediente: jest.fn(),
  };
  const emitter = { emit: jest.fn() };
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  const event = new ExpedienteReadyForInstallationEvent(
    TENANT.tenantId,
    TENANT.schemaName,
    'exp-w0f2',
    'actor-w0f2',
  );

  beforeEach(async () => {
    jest.clearAllMocks();
    persistedEntities.length = 0;
    readEntities.length = 0;
    subscribers.findByExpedienteId.mockResolvedValue(null);
    subscribers.createFromExpediente.mockResolvedValue({
      id: 'sub-w0f2',
      status: SubscriberStatus.PROSPECT,
    });
    const module = await Test.createTestingModule({
      providers: [
        SubscriberCreationService,
        { provide: DataSource, useValue: {} },
        { provide: SubscribersService, useValue: subscribers },
        { provide: AuditService, useValue: audit },
        { provide: EventEmitter2, useValue: emitter },
        {
          provide: ConfigService,
          useValue: { getOrThrow: () => SYNTHETIC_KEY, get: () => undefined },
        },
      ],
    }).compile();
    service = module.get(SubscriberCreationService);
  });

  it('sigue suscrito a crm.expediente.ready-for-installation sin suprimir errores', () => {
    const metadata = Reflect.getMetadata(
      'EVENT_LISTENER_METADATA',
      SubscriberCreationService.prototype.handleExpedienteReadyForInstallation,
    ) as Array<{ event: string; options?: Record<string, unknown> }>;

    expect(metadata).toEqual([
      { event: 'crm.expediente.ready-for-installation', options: { suppressErrors: false } },
    ]);
  });

  it('crea el suscriptor PROSPECT desde el expediente con el actor del evento', async () => {
    await service.handleExpedienteReadyForInstallation(event);

    expect(subscribers.createFromExpediente).toHaveBeenCalledTimes(1);
    expect(subscribers.createFromExpediente).toHaveBeenCalledWith(
      'exp-w0f2',
      expect.objectContaining({ address: 'Dirección sintética 1' }),
      'actor-w0f2',
    );
  });

  it('emite crm.subscriber.converted con el suscriptor y el expediente', async () => {
    await service.handleExpedienteReadyForInstallation(event);

    expect(emitter.emit).toHaveBeenCalledWith(
      'crm.subscriber.converted',
      expect.objectContaining({
        tenantId: TENANT.tenantId,
        subscriberId: 'sub-w0f2',
        expedienteId: 'exp-w0f2',
      }),
    );
  });

  it('audita la creación del suscriptor sin PII (origen expediente)', async () => {
    await service.handleExpedienteReadyForInstallation(event);

    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: 'Subscriber',
        entityId: 'sub-w0f2',
        userId: 'actor-w0f2',
        newValue: expect.objectContaining({ source: 'expediente', expedienteId: 'exp-w0f2' }),
      }),
    );
    const serialized = JSON.stringify(audit.log.mock.calls);
    expect(serialized).not.toContain('titular@example.test');
  });

  it('es idempotente por expediente: si el suscriptor existe no crea otro', async () => {
    subscribers.findByExpedienteId.mockResolvedValue({
      id: 'sub-w0f2',
      status: SubscriberStatus.PROSPECT,
    });

    await service.handleExpedienteReadyForInstallation(event);
    await service.handleExpedienteReadyForInstallation(event);

    expect(subscribers.createFromExpediente).not.toHaveBeenCalled();
    expect(emitter.emit).not.toHaveBeenCalledWith('crm.subscriber.converted', expect.anything());
  });

  it('la conversión del suscriptor no persiste contratos por sí misma (hoy solo el suscriptor)', async () => {
    const result = await service.createFromExpediente('exp-w0f2', 'actor-w0f2');

    expect(result).toBe('sub-w0f2');
    // Solo lee el expediente y delega la escritura en SubscribersService.
    expect(readEntities).toEqual([ExpedienteRecord]);
    expect(persistedEntities).toHaveLength(0);
    expect(emitter.emit.mock.calls.map(([name]) => name)).toEqual(['crm.subscriber.converted']);
  });
});
