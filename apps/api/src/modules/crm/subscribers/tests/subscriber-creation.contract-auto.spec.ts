// MOD05 Cierre de venta fase 2 · bloque A (D3): el listener de
// `crm.expediente.ready-for-installation` crea el contrato DRAFT DESPUÉS del suscriptor,
// también cuando el suscriptor ya existía (evento repetido), mediante ContractAutoCreationPort.
import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { SubscriberStatus } from '@iwana/shared';
import { SubscriberCreationService } from '../subscriber-creation.service';
import { SubscribersService } from '../subscribers.service';
import { AuditService } from '../../../audit/audit.service';
import { ContractAutoCreationPort } from '../../ports/contract-auto-creation.port';
import { ExpedienteReadyForInstallationEvent } from '../../expedientes/events/expediente-pipeline.events';

jest.mock('@iwana/db', () => ({
  ...(jest.requireActual('@iwana/db') as Record<string, unknown>),
  TenantContext: { getOrThrow: () => ({ tenantId: 'ten-1', schemaName: 'tenant_1' }) },
}));

const SYNTHETIC_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

describe('SubscriberCreationService — contrato automático tras el suscriptor', () => {
  const event = new ExpedienteReadyForInstallationEvent('ten-1', 'tenant_1', 'exp-1', 'actor-1');
  const subscribers = { findByExpedienteId: jest.fn() };
  const port = { createForExpediente: jest.fn().mockResolvedValue(undefined) };
  const audit = { log: jest.fn() };

  async function build(withPort: boolean): Promise<SubscriberCreationService> {
    const module = await Test.createTestingModule({
      providers: [
        SubscriberCreationService,
        { provide: DataSource, useValue: {} },
        { provide: SubscribersService, useValue: subscribers },
        { provide: AuditService, useValue: audit },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        {
          provide: ConfigService,
          useValue: { getOrThrow: () => SYNTHETIC_KEY, get: () => undefined },
        },
        ...(withPort ? [{ provide: ContractAutoCreationPort, useValue: port }] : []),
      ],
    }).compile();
    return module.get(SubscriberCreationService);
  }

  beforeEach(() => {
    jest.clearAllMocks();
    subscribers.findByExpedienteId.mockResolvedValue({
      id: 'sub-1',
      status: SubscriberStatus.PROSPECT,
    });
  });

  it('invoca el contrato automático con el suscriptor, el expediente y el actor del evento', async () => {
    const service = await build(true);
    await service.handleExpedienteReadyForInstallation(event);

    expect(port.createForExpediente).toHaveBeenCalledWith({
      subscriberId: 'sub-1',
      expedienteId: 'exp-1',
      actorId: 'actor-1',
    });
  });

  it('lo invoca después de resolver el suscriptor', async () => {
    const order: string[] = [];
    subscribers.findByExpedienteId.mockImplementation(async () => {
      order.push('subscriber');
      return { id: 'sub-1', status: SubscriberStatus.PROSPECT };
    });
    port.createForExpediente.mockImplementationOnce(async () => {
      order.push('contract');
    });
    const service = await build(true);
    await service.handleExpedienteReadyForInstallation(event);
    expect(order).toEqual(['subscriber', 'contract']);
  });

  it('un error del contrato automático se propaga (el pipeline lo registra y reintenta)', async () => {
    port.createForExpediente.mockRejectedValueOnce(new Error('inesperado'));
    const service = await build(true);
    await expect(service.handleExpedienteReadyForInstallation(event)).rejects.toThrow('inesperado');
  });

  it('con ModuleRef y puerto no resoluble: no falla, registra error y audita el omitido', async () => {
    const service = await build(false);
    const errorLog = jest
      .spyOn((service as unknown as { logger: { error: () => void } }).logger, 'error')
      .mockImplementation(() => undefined);
    await expect(service.handleExpedienteReadyForInstallation(event)).resolves.toBeUndefined();
    expect(port.createForExpediente).not.toHaveBeenCalled();
    expect(errorLog).toHaveBeenCalledWith(expect.stringContaining('expediente=exp-1'));
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: 'Subscriber',
        entityId: 'sub-1',
        userId: 'actor-1',
        newValue: { contractAutoCreationSkipped: 'PORT_UNAVAILABLE', expedienteId: 'exp-1' },
      }),
    );
  });

  it('construido a mano sin ModuleRef también se omite', async () => {
    const config = {
      getOrThrow: () => SYNTHETIC_KEY,
      get: () => undefined,
    } as unknown as ConfigService;
    const service = new SubscriberCreationService(
      {} as DataSource,
      config,
      subscribers as unknown as SubscribersService,
      { emit: jest.fn() } as unknown as EventEmitter2,
      audit as unknown as AuditService,
    );
    await expect(service.handleExpedienteReadyForInstallation(event)).resolves.toBeUndefined();
    expect(audit.log).not.toHaveBeenCalled();
  });
});
