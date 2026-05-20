import { SubscriberActivationListener } from '../listeners/subscriber-activation.listener';
import { SubscriberCancellationListener } from '../listeners/subscriber-cancellation.listener';

describe('Subscriber pipeline listeners', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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
});
