import { SubscriberActivationListener } from '../listeners/subscriber-activation.listener';
import { SubscriberCancellationListener } from '../listeners/subscriber-cancellation.listener';
import { SubscriberCreationService } from '../subscriber-creation.service';

describe('Subscriber pipeline listeners', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('propaga los errores de los tres listeners al emisor del pipeline', () => {
    const listeners = [
      {
        handler: SubscriberCreationService.prototype.handleExpedienteReadyForInstallation,
        event: 'crm.expediente.ready-for-installation',
      },
      {
        handler: SubscriberActivationListener.prototype.handle,
        event: 'crm.expediente.activated',
      },
      {
        handler: SubscriberCancellationListener.prototype.handle,
        event: 'crm.expediente.discarded',
      },
    ];

    for (const listener of listeners) {
      const metadata = Reflect.getMetadata('EVENT_LISTENER_METADATA', listener.handler) as Array<{
        event: string;
        options?: Record<string, unknown>;
      }>;

      expect(metadata).toEqual([{ event: listener.event, options: { suppressErrors: false } }]);
    }
  });

  it('activa subscriber desde expediente usando el contrato actual del evento', async () => {
    const subscribersService = {
      activateFromExpediente: jest.fn().mockResolvedValue({ id: 'sub-1' }),
    };
    const eventEmitter = {
      emit: jest.fn(),
    };

    const listener = new SubscriberActivationListener(
      subscribersService as never,
      eventEmitter as never,
    );

    await listener.handle({
      tenantId: 'tenant-1',
      schemaName: 'tenant_iwana',
      expedienteId: 'exp-1',
      actorUserId: 'actor-1',
    });

    expect(subscribersService.activateFromExpediente).toHaveBeenCalledWith('exp-1', 'actor-1');
    expect(eventEmitter.emit).toHaveBeenCalledWith(
      'crm.subscriber.activated',
      expect.objectContaining({
        tenantId: 'tenant-1',
        schemaName: 'tenant_iwana',
        subscriberId: 'sub-1',
        expedienteId: 'exp-1',
      }),
    );
  });

  it('no publica el evento de activación cuando no hay subscriber que activar', async () => {
    const subscribersService = {
      activateFromExpediente: jest.fn().mockResolvedValue(null),
    };
    const eventEmitter = { emit: jest.fn() };
    const listener = new SubscriberActivationListener(
      subscribersService as never,
      eventEmitter as never,
    );

    await expect(
      listener.handle({
        tenantId: 'tenant-1',
        schemaName: 'tenant_iwana',
        expedienteId: 'exp-missing',
        actorUserId: 'actor-1',
      }),
    ).resolves.toBeUndefined();

    expect(subscribersService.activateFromExpediente).toHaveBeenCalledWith(
      'exp-missing',
      'actor-1',
    );
    expect(eventEmitter.emit).not.toHaveBeenCalled();
  });

  it('cancela prospecto desde expediente descartado usando el contrato actual del evento', async () => {
    const subscribersService = {
      cancelProspectFromExpediente: jest.fn().mockResolvedValue({ id: 'sub-2' }),
    };

    const listener = new SubscriberCancellationListener(subscribersService as never);

    await listener.handle({
      tenantId: 'tenant-1',
      schemaName: 'tenant_iwana',
      expedienteId: 'exp-2',
      actorUserId: 'actor-2',
      reason: 'Descartado por negocio',
    });

    expect(subscribersService.cancelProspectFromExpediente).toHaveBeenCalledWith(
      'exp-2',
      'Descartado por negocio',
      'actor-2',
    );
  });

  it('omite el log de cancelación cuando el expediente no tenía prospecto', async () => {
    const subscribersService = {
      cancelProspectFromExpediente: jest.fn().mockResolvedValue(null),
    };
    const listener = new SubscriberCancellationListener(subscribersService as never);

    await expect(
      listener.handle({
        tenantId: 'tenant-1',
        schemaName: 'tenant_iwana',
        expedienteId: 'exp-no-prospect',
        actorUserId: 'actor-1',
        reason: null,
      }),
    ).resolves.toBeUndefined();

    expect(subscribersService.cancelProspectFromExpediente).toHaveBeenCalledWith(
      'exp-no-prospect',
      null,
      'actor-1',
    );
  });
});
